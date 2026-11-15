/* eslint-disable no-bitwise -- A seven-bit mask stores the weekday Schedule. */
import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  calculateDayProgress,
  checkEntryDateEligibility,
  getWritableDateBounds,
  resolveGoalForDate,
  validateEntryInput,
} from "../entries";
import type {
  ActivityEntry,
  EntryFieldErrors,
  GoalSnapshot,
  RecordEntrySuccess,
  TodayHabitItem,
  TodayWorkspace,
} from "../entries";
import { WEEKDAYS } from "../habits";
import type { Identity } from "../identity";
import { MEASUREMENT_CEILINGS } from "../templates";
import { AuthError } from "./auth-error";
import type { Database } from "./database";
import {
  activityEntry,
  activityTemplate,
  goalRevision,
  habit,
  mutationReceipt,
  user,
} from "./schema";
import { toActivityTemplate } from "./templates";

const CREATE_ENTRY_OPERATION = "createEntry";

export class EntryError extends Error {
  readonly status: number;
  readonly fieldErrors: EntryFieldErrors;

  constructor(
    status: number,
    message: string,
    fieldErrors: EntryFieldErrors = {}
  ) {
    super(message);
    this.name = "EntryError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const toActivityEntry = (
  row: typeof activityEntry.$inferSelect
): ActivityEntry => ({
  id: row.id,
  habitId: row.habitId,
  activityDate: row.activityDate,
  amount: row.amount,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const decodeWeekdays = (weekdayMask: number): number[] =>
  WEEKDAYS.filter((day) => (weekdayMask & (1 << (day.value - 1))) !== 0).map(
    (day) => day.value
  );

const accountDateExpression = (now?: () => Date) => {
  if (now === undefined) {
    return sql<string>`to_char(clock_timestamp() AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`;
  }
  const instant = now().toISOString();
  return sql<string>`to_char(${instant}::timestamptz AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`;
};

export interface EntryServiceOptions {
  now?: () => Date;
}

export const createEntryService = (
  database: Database,
  options: EntryServiceOptions = {}
) => {
  const getToday = async (actor: Identity): Promise<TodayWorkspace> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }

    const userRows = await database
      .select({
        timezone: user.timezone,
        accountDate: accountDateExpression(options.now),
      })
      .from(user)
      .where(and(eq(user.id, actor.id), eq(user.role, "participant")));
    const calendar = userRows.at(0);
    if (calendar === undefined) {
      throw new AuthError(403, "Forbidden");
    }

    const { accountDate, timezone } = calendar;

    const habitRows = await database
      .select()
      .from(habit)
      .innerJoin(activityTemplate, eq(habit.templateId, activityTemplate.id))
      .where(
        and(
          eq(habit.participantId, actor.id),
          lte(habit.startDate, accountDate),
          or(isNull(habit.archivedFrom), gt(habit.archivedFrom, accountDate))
        )
      )
      .orderBy(asc(habit.startDate), asc(habit.id));

    if (habitRows.length === 0) {
      return {
        accountDate,
        timezone,
        scheduled: [],
        unscheduled: [],
      };
    }

    const habitIds = habitRows.map((row) => row.habit.id);

    const [revisionRows, entryRows] = await Promise.all([
      database
        .select()
        .from(goalRevision)
        .where(
          and(
            inArray(goalRevision.habitId, habitIds),
            lte(goalRevision.effectiveFrom, accountDate)
          )
        ),
      database
        .select()
        .from(activityEntry)
        .where(
          and(
            inArray(activityEntry.habitId, habitIds),
            eq(activityEntry.activityDate, accountDate)
          )
        )
        .orderBy(asc(activityEntry.createdAt), asc(activityEntry.id)),
    ]);

    const revisionsByHabit = new Map<string, GoalSnapshot[]>();
    for (const row of revisionRows) {
      const existing = revisionsByHabit.get(row.habitId) ?? [];
      existing.push({
        effectiveFrom: row.effectiveFrom,
        dailyTarget: row.dailyTarget,
        weekdays: decodeWeekdays(row.weekdayMask),
      });
      revisionsByHabit.set(row.habitId, existing);
    }

    const entriesByHabit = new Map<string, ActivityEntry[]>();
    for (const row of entryRows) {
      const existing = entriesByHabit.get(row.habitId) ?? [];
      existing.push(toActivityEntry(row));
      entriesByHabit.set(row.habitId, existing);
    }

    const scheduled: TodayHabitItem[] = [];
    const unscheduled: TodayHabitItem[] = [];

    for (const row of habitRows) {
      const revisions = revisionsByHabit.get(row.habit.id) ?? [];
      const goal = resolveGoalForDate(revisions, accountDate);
      if (goal === undefined) {
        continue;
      }
      const entries = entriesByHabit.get(row.habit.id) ?? [];
      let dailyTotal = 0;
      for (const entry of entries) {
        dailyTotal += entry.amount;
      }
      const progress = calculateDayProgress({
        date: accountDate,
        dailyTotal,
        goal,
        startDate: row.habit.startDate,
        archivedFrom: row.habit.archivedFrom,
      });
      const bounds = getWritableDateBounds({
        accountDate,
        startDate: row.habit.startDate,
        archivedFrom: row.habit.archivedFrom,
      });
      const item: TodayHabitItem = {
        habit: {
          id: row.habit.id,
          template: toActivityTemplate(row.activity_template),
          startDate: row.habit.startDate,
          archivedFrom: row.habit.archivedFrom,
          goal,
        },
        progress,
        entries,
        writableMinDate: bounds.writable ? bounds.minDate : null,
        writableMaxDate: bounds.writable ? bounds.maxDate : null,
      };
      if (progress.scheduled) {
        scheduled.push(item);
      } else {
        unscheduled.push(item);
      }
    }

    return {
      accountDate,
      timezone,
      scheduled,
      unscheduled,
    };
  };

  const listEntries = async (
    actor: Identity,
    habitId: string,
    activityDate?: string
  ): Promise<ActivityEntry[]> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }
    const habitRows = await database
      .select({ id: habit.id })
      .from(habit)
      .where(and(eq(habit.id, habitId), eq(habit.participantId, actor.id)));
    if (habitRows.length === 0) {
      throw new EntryError(404, "Habit not found.");
    }
    const whereClause =
      activityDate === undefined
        ? eq(activityEntry.habitId, habitId)
        : and(
            eq(activityEntry.habitId, habitId),
            eq(activityEntry.activityDate, activityDate)
          );
    const rows = await database
      .select()
      .from(activityEntry)
      .where(whereClause)
      .orderBy(
        asc(activityEntry.activityDate),
        asc(activityEntry.createdAt),
        asc(activityEntry.id)
      );
    return rows.map(toActivityEntry);
  };

  const createEntry = async (
    actor: Identity,
    input: unknown
  ): Promise<RecordEntrySuccess> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }

    const validation = validateEntryInput(input);
    if (!validation.ok) {
      throw new EntryError(
        400,
        "Check your entry details.",
        validation.fieldErrors
      );
    }
    const draft = validation.value;

    return await database.transaction(async (transaction) => {
      // Serialize tracking mutations per participant before locking the Habit row.
      const userRows = await transaction
        .select({
          id: user.id,
          timezone: user.timezone,
          accountDate: accountDateExpression(options.now),
        })
        .from(user)
        .where(and(eq(user.id, actor.id), eq(user.role, "participant")))
        .for("update");
      const participantRow = userRows.at(0);
      if (participantRow === undefined) {
        throw new AuthError(403, "Forbidden");
      }

      const habitRows = await transaction
        .select()
        .from(habit)
        .where(
          and(eq(habit.id, draft.habitId), eq(habit.participantId, actor.id))
        )
        .for("update");
      const habitRow = habitRows.at(0);
      if (habitRow === undefined) {
        throw new EntryError(404, "Habit not found.");
      }

      const payloadFingerprint = JSON.stringify({
        habitId: draft.habitId,
        activityDate: draft.activityDate,
        amount: draft.amount,
      });

      const receiptRows = await transaction
        .select()
        .from(mutationReceipt)
        .where(
          and(
            eq(mutationReceipt.actorId, actor.id),
            eq(mutationReceipt.requestKey, draft.requestKey)
          )
        );
      const existingReceipt = receiptRows.at(0);
      if (existingReceipt !== undefined) {
        if (
          existingReceipt.operation !== CREATE_ENTRY_OPERATION ||
          existingReceipt.payloadFingerprint !== payloadFingerprint
        ) {
          throw new EntryError(
            409,
            "This request key was already used for a different entry."
          );
        }

        const existingEntryRows = await transaction
          .select()
          .from(activityEntry)
          .where(
            and(
              eq(activityEntry.id, existingReceipt.resourceId),
              eq(activityEntry.habitId, draft.habitId)
            )
          );
        const existingEntry = existingEntryRows.at(0);
        if (existingEntry === undefined) {
          throw new EntryError(
            409,
            "This entry was previously recorded and subsequently removed."
          );
        }

        const totalRows = await transaction
          .select({
            total: sql<number>`coalesce(sum(${activityEntry.amount}), 0)::int`,
          })
          .from(activityEntry)
          .where(
            and(
              eq(activityEntry.habitId, draft.habitId),
              eq(activityEntry.activityDate, draft.activityDate)
            )
          );

        return {
          kind: "replayed",
          entry: toActivityEntry(existingEntry),
          dailyTotal: totalRows.at(0)?.total ?? existingEntry.amount,
        };
      }

      const templateRows = await transaction
        .select()
        .from(activityTemplate)
        .where(eq(activityTemplate.id, habitRow.templateId));
      const templateRow = templateRows.at(0);
      if (templateRow === undefined) {
        throw new EntryError(404, "Habit not found.");
      }

      const template = toActivityTemplate(templateRow);
      const checked = validateEntryInput(draft, template);
      if (!checked.ok) {
        throw new EntryError(
          400,
          "Check your entry details.",
          checked.fieldErrors
        );
      }

      const eligibility = checkEntryDateEligibility({
        activityDate: draft.activityDate,
        accountDate: participantRow.accountDate,
        startDate: habitRow.startDate,
        archivedFrom: habitRow.archivedFrom,
      });
      if (!eligibility.ok) {
        throw new EntryError(400, eligibility.message, {
          activityDate: eligibility.message,
        });
      }

      const totalRows = await transaction
        .select({
          total: sql<number>`coalesce(sum(${activityEntry.amount}), 0)::int`,
        })
        .from(activityEntry)
        .where(
          and(
            eq(activityEntry.habitId, draft.habitId),
            eq(activityEntry.activityDate, draft.activityDate)
          )
        );
      const currentTotal = totalRows.at(0)?.total ?? 0;
      const ceiling = MEASUREMENT_CEILINGS[template.unit];
      if (currentTotal + draft.amount > ceiling) {
        const message = `Daily total cannot exceed ${ceiling.toLocaleString("en-US")} ${template.unit}.`;
        throw new EntryError(409, message, { amount: message });
      }

      const insertedRows = await transaction
        .insert(activityEntry)
        .values({
          id: randomUUID(),
          habitId: draft.habitId,
          activityDate: draft.activityDate,
          amount: draft.amount,
          version: 1,
        })
        .returning();
      const inserted = insertedRows.at(0);
      if (inserted === undefined) {
        throw new Error("Activity Entry creation did not return a record.");
      }

      await transaction.insert(mutationReceipt).values({
        id: randomUUID(),
        actorId: actor.id,
        requestKey: draft.requestKey,
        operation: CREATE_ENTRY_OPERATION,
        payloadFingerprint,
        resourceId: inserted.id,
        status: "applied",
      });

      return {
        kind: "created",
        entry: toActivityEntry(inserted),
        dailyTotal: currentTotal + draft.amount,
      };
    });
  };

  return {
    getToday,
    listEntries,
    createEntry,
  };
};
