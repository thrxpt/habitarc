import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { addCalendarDays } from "../calendar";
import {
  calculateDayProgress,
  checkEntryDateEligibility,
  getWritableDateBounds,
  resolveGoalForDate,
  validateCorrectionTarget,
  validateEntryInput,
  validateHistoryQuery,
} from "../entries";
import type {
  ActivityEntry,
  ActivityEntryDraft,
  EntryCorrectionSuccess,
  EntryFieldErrors,
  HabitHistory,
  RecordEntrySuccess,
  TodayHabitItem,
  TodayWorkspace,
} from "../entries";
import type { GoalSnapshot } from "../habits";
import type { Identity } from "../identity";
import { MEASUREMENT_CEILINGS } from "../templates";
import type { ActivityTemplate } from "../templates";
import { AuthError } from "./auth-error";
import type { Database, Transaction } from "./database";
import { toGoalSnapshot } from "./habits";
import { readMutationReceipt, saveMutationReceipt } from "./mutation-receipts";
import type { MutationRequest } from "./mutation-receipts";
import { activityEntry, activityTemplate, goalRevision, habit } from "./schema";
import { toActivityTemplate } from "./templates";
import { lockOwnedHabit, readAccountCalendar, readTracking } from "./tracking";
import type { AccountCalendar, TrackingServiceOptions } from "./tracking";

const CREATE_ENTRY_OPERATION = "createEntry";
const HISTORY_PAGE_DATES = 30;
const STALE_ENTRY_MESSAGE =
  "This entry changed. Refresh history before trying again.";

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

const progressForEntries = (
  date: string,
  entries: readonly ActivityEntry[],
  goal: GoalSnapshot | undefined,
  tracking: Pick<typeof habit.$inferSelect, "startDate" | "archivedFrom">
) =>
  calculateDayProgress({
    date,
    dailyTotal: entries.reduce((total, entry) => total + entry.amount, 0),
    goal,
    startDate: tracking.startDate,
    archivedFrom: tracking.archivedFrom,
  });

const requireOwnedHabit = async (
  transaction: Transaction,
  actor: Identity,
  habitId: string
) => {
  const owned = await lockOwnedHabit(transaction, actor, habitId);
  if (owned === undefined) {
    throw new EntryError(404, "Habit not found.");
  }
  return owned;
};

const readEntryTemplate = async (
  transaction: Transaction,
  templateId: string
) => {
  const [template] = await transaction
    .select()
    .from(activityTemplate)
    .where(eq(activityTemplate.id, templateId));
  if (template === undefined) {
    throw new EntryError(404, "Habit not found.");
  }
  return toActivityTemplate(template);
};

const entryDateEligibility = (
  activityDate: string,
  accountDate: string,
  tracking: typeof habit.$inferSelect
) =>
  checkEntryDateEligibility({
    activityDate,
    accountDate,
    startDate: tracking.startDate,
    archivedFrom: tracking.archivedFrom,
  });

const requireWritableDate = (
  activityDate: string,
  accountDate: string,
  tracking: typeof habit.$inferSelect
) => {
  const eligibility = entryDateEligibility(activityDate, accountDate, tracking);
  if (!eligibility.ok) {
    throw new EntryError(400, eligibility.message, {
      activityDate: eligibility.message,
    });
  }
};

const getDailyTotal = async (
  transaction: Transaction,
  habitId: string,
  date: string,
  excludeEntryId?: string
) => {
  const [row] = await transaction
    .select({
      total: sql<number>`coalesce(sum(${activityEntry.amount}), 0)::int`,
    })
    .from(activityEntry)
    .where(
      and(
        eq(activityEntry.habitId, habitId),
        eq(activityEntry.activityDate, date),
        excludeEntryId === undefined
          ? undefined
          : ne(activityEntry.id, excludeEntryId)
      )
    );
  return row?.total ?? 0;
};

const requireDailyTotalWithinLimit = (
  total: number,
  template: ActivityTemplate
) => {
  const ceiling = MEASUREMENT_CEILINGS[template.unit];
  if (total > ceiling) {
    const message = `Daily total cannot exceed ${ceiling.toLocaleString("en-US")} ${template.unit}.`;
    throw new EntryError(409, message, { amount: message });
  }
};

const validateReplacement = async (
  transaction: Transaction,
  entry: typeof activityEntry.$inferSelect,
  draft: ActivityEntryDraft,
  templateId: string
) => {
  const template = await readEntryTemplate(transaction, templateId);
  const checked = validateEntryInput(draft, template);
  if (!checked.ok) {
    throw new EntryError(400, "Check your entry details.", checked.fieldErrors);
  }

  const destinationTotal = await getDailyTotal(
    transaction,
    entry.habitId,
    draft.activityDate,
    entry.id
  );
  requireDailyTotalWithinLimit(destinationTotal + draft.amount, template);
  if (entry.activityDate !== draft.activityDate) {
    const sourceTotal = await getDailyTotal(
      transaction,
      entry.habitId,
      entry.activityDate,
      entry.id
    );
    requireDailyTotalWithinLimit(sourceTotal, template);
  }
};

const findReceipt = async (
  transaction: Transaction,
  request: MutationRequest
) => {
  const receipt = await readMutationReceipt(transaction, request);
  if (receipt.kind === "conflict") {
    throw new EntryError(
      409,
      "This request key was already used for a different entry change."
    );
  }
  return receipt.kind === "applied" ? receipt : undefined;
};

export const readTodayWorkspace = async (
  database: Database | Transaction,
  participantId: string,
  { accountDate, timezone }: AccountCalendar
): Promise<TodayWorkspace> => {
  const habitRows = await database
    .select()
    .from(habit)
    .innerJoin(activityTemplate, eq(habit.templateId, activityTemplate.id))
    .where(
      and(
        eq(habit.participantId, participantId),
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

  const revisionRows = await database
    .select()
    .from(goalRevision)
    .where(
      and(
        inArray(goalRevision.habitId, habitIds),
        lte(goalRevision.effectiveFrom, accountDate)
      )
    );
  const entryRows = await database
    .select()
    .from(activityEntry)
    .where(
      and(
        inArray(activityEntry.habitId, habitIds),
        eq(activityEntry.activityDate, accountDate)
      )
    )
    .orderBy(asc(activityEntry.createdAt), asc(activityEntry.id));

  const revisionsByHabit = new Map<string, GoalSnapshot[]>();
  for (const row of revisionRows) {
    const existing = revisionsByHabit.get(row.habitId) ?? [];
    existing.push(toGoalSnapshot(row));
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
    const progress = progressForEntries(accountDate, entries, goal, row.habit);
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

export const createEntryService = (
  database: Database,
  options: TrackingServiceOptions = {}
) => {
  const getToday = async (actor: Identity): Promise<TodayWorkspace> =>
    await readTracking(
      database,
      actor,
      async (transaction, calendar) =>
        await readTodayWorkspace(transaction, actor.id, calendar),
      options.now
    );

  const getHistory = async (
    actor: Identity,
    input: unknown
  ): Promise<HabitHistory> =>
    await readTracking(
      database,
      actor,
      async (transaction, calendar) => {
        const query = validateHistoryQuery(input);
        if (!query.ok) {
          throw new EntryError(400, query.message);
        }
        const { habitId, before } = query;
        const [row] = await transaction
          .select()
          .from(habit)
          .innerJoin(
            activityTemplate,
            eq(activityTemplate.id, habit.templateId)
          )
          .where(and(eq(habit.id, habitId), eq(habit.participantId, actor.id)));
        if (row === undefined) {
          throw new EntryError(404, "Habit not found.");
        }

        const bounds = getWritableDateBounds({ ...calendar, ...row.habit });
        const writableMinDate = bounds.writable ? bounds.minDate : null;
        const writableMaxDate = bounds.writable ? bounds.maxDate : null;
        const recordedDates = transaction
          .selectDistinct({ date: activityEntry.activityDate })
          .from(activityEntry)
          .where(
            and(
              eq(activityEntry.habitId, habitId),
              lte(activityEntry.activityDate, calendar.accountDate),
              before === undefined
                ? undefined
                : lt(activityEntry.activityDate, before)
            )
          )
          .orderBy(desc(activityEntry.activityDate))
          .limit(HISTORY_PAGE_DATES + 1);
        const entryRows = await transaction
          .select()
          .from(activityEntry)
          .where(
            and(
              eq(activityEntry.habitId, habitId),
              inArray(activityEntry.activityDate, recordedDates)
            )
          )
          .orderBy(
            desc(activityEntry.activityDate),
            asc(activityEntry.createdAt),
            asc(activityEntry.id)
          );
        const revisionRows = await transaction
          .select()
          .from(goalRevision)
          .where(eq(goalRevision.habitId, habitId));

        const entriesByDate = new Map<string, ActivityEntry[]>();
        for (const entry of entryRows) {
          const entries = entriesByDate.get(entry.activityDate) ?? [];
          entries.push(toActivityEntry(entry));
          entriesByDate.set(entry.activityDate, entries);
        }
        const dates = [...entriesByDate.keys()];
        const nextBefore =
          dates.length > HISTORY_PAGE_DATES
            ? (dates[HISTORY_PAGE_DATES - 1] ?? null)
            : null;
        const displayedDates = new Set<string>();
        if (
          before === undefined &&
          writableMinDate !== null &&
          writableMaxDate !== null
        ) {
          for (
            let date = writableMaxDate;
            date >= writableMinDate;
            date = addCalendarDays(date, -1)
          ) {
            displayedDates.add(date);
          }
        }
        for (const date of dates.slice(0, HISTORY_PAGE_DATES)) {
          displayedDates.add(date);
        }
        const revisions = revisionRows.map(toGoalSnapshot);
        return {
          accountDate: calendar.accountDate,
          timezone: calendar.timezone,
          habitId,
          template: toActivityTemplate(row.activity_template),
          writableMinDate,
          writableMaxDate,
          nextBefore,
          days: [...displayedDates].map((date) => {
            const entries = entriesByDate.get(date) ?? [];
            const goal = resolveGoalForDate(revisions, date);
            return {
              date,
              entries,
              progress: progressForEntries(date, entries, goal, row.habit),
            };
          }),
        };
      },
      options.now
    );

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
      const habitRow = await requireOwnedHabit(
        transaction,
        actor,
        draft.habitId
      );
      const receipt = {
        actorId: actor.id,
        requestKey: draft.requestKey,
        operation: CREATE_ENTRY_OPERATION,
        payloadFingerprint: JSON.stringify({
          habitId: draft.habitId,
          activityDate: draft.activityDate,
          amount: draft.amount,
        }),
      };
      const existingReceipt = await findReceipt(transaction, receipt);
      if (existingReceipt !== undefined) {
        const [existingEntry] = await transaction
          .select()
          .from(activityEntry)
          .where(
            and(
              eq(activityEntry.id, existingReceipt.resourceId),
              eq(activityEntry.habitId, habitRow.id)
            )
          );
        if (existingEntry === undefined) {
          throw new EntryError(
            409,
            "This entry was previously recorded and subsequently removed."
          );
        }
        return {
          kind: "replayed",
          entry: toActivityEntry(existingEntry),
          dailyTotal: await getDailyTotal(
            transaction,
            habitRow.id,
            existingEntry.activityDate
          ),
        };
      }

      const template = await readEntryTemplate(
        transaction,
        habitRow.templateId
      );
      const checked = validateEntryInput(draft, template);
      if (!checked.ok) {
        throw new EntryError(
          400,
          "Check your entry details.",
          checked.fieldErrors
        );
      }

      const { accountDate } = await readAccountCalendar(
        transaction,
        actor,
        options.now
      );
      requireWritableDate(draft.activityDate, accountDate, habitRow);
      const dailyTotal =
        (await getDailyTotal(transaction, habitRow.id, draft.activityDate)) +
        draft.amount;
      requireDailyTotalWithinLimit(dailyTotal, template);

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

      await saveMutationReceipt(transaction, receipt, inserted.id);
      return { kind: "created", entry: toActivityEntry(inserted), dailyTotal };
    });
  };

  const correctEntry = async (
    actor: Identity,
    input: unknown,
    operation: "updateEntry" | "deleteEntry"
  ): Promise<EntryCorrectionSuccess> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }

    const target = validateCorrectionTarget(input);
    const replacement =
      operation === "updateEntry" ? validateEntryInput(input) : undefined;
    if (!target.ok || replacement?.ok === false) {
      throw new EntryError(400, "Check your entry details.", {
        ...(target.ok ? {} : target.fieldErrors),
        ...(replacement?.ok === false ? replacement.fieldErrors : {}),
      });
    }

    const { habitId, entryId, expectedVersion, requestKey } = target.value;
    const draft = replacement?.value;
    return await database.transaction(async (transaction) => {
      const habitRow = await requireOwnedHabit(transaction, actor, habitId);
      const receipt = {
        actorId: actor.id,
        requestKey,
        operation,
        payloadFingerprint: JSON.stringify({
          habitId,
          entryId,
          expectedVersion,
          activityDate: draft?.activityDate,
          amount: draft?.amount,
        }),
      };
      const existingReceipt = await findReceipt(transaction, receipt);
      if (existingReceipt !== undefined && operation === "deleteEntry") {
        return { kind: "replayed" };
      }

      const matchesEntry = and(
        eq(activityEntry.id, entryId),
        eq(activityEntry.habitId, habitId)
      );
      const [entry] = await transaction
        .select()
        .from(activityEntry)
        .where(matchesEntry);
      if (existingReceipt !== undefined) {
        if (entry === undefined) {
          throw new EntryError(
            409,
            "This change was saved before the entry was deleted."
          );
        }
        return { kind: "replayed" };
      }
      if (entry === undefined) {
        throw new EntryError(
          404,
          "This entry is no longer available. Refresh history to see the latest entries."
        );
      }
      if (entry.version !== expectedVersion) {
        throw new EntryError(409, STALE_ENTRY_MESSAGE);
      }

      const { accountDate } = await readAccountCalendar(
        transaction,
        actor,
        options.now
      );
      const sourceDate = entryDateEligibility(
        entry.activityDate,
        accountDate,
        habitRow
      );
      if (!sourceDate.ok) {
        throw new EntryError(
          400,
          `The entry from ${entry.activityDate} is now read-only. ${sourceDate.message}`
        );
      }

      const matchesVersion = and(
        matchesEntry,
        eq(activityEntry.version, expectedVersion)
      );
      if (draft === undefined) {
        const [deleted] = await transaction
          .delete(activityEntry)
          .where(matchesVersion)
          .returning({ id: activityEntry.id });
        if (deleted === undefined) {
          throw new EntryError(409, STALE_ENTRY_MESSAGE);
        }
      } else {
        requireWritableDate(draft.activityDate, accountDate, habitRow);
        await validateReplacement(
          transaction,
          entry,
          draft,
          habitRow.templateId
        );
        const [updated] = await transaction
          .update(activityEntry)
          .set({
            activityDate: draft.activityDate,
            amount: draft.amount,
            version: entry.version + 1,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(matchesVersion)
          .returning({ id: activityEntry.id });
        if (updated === undefined) {
          throw new EntryError(409, STALE_ENTRY_MESSAGE);
        }
      }

      await saveMutationReceipt(transaction, receipt, entryId);
      return { kind: "applied" };
    });
  };

  return {
    getToday,
    getHistory,
    listEntries,
    createEntry,
    updateEntry: async (actor: Identity, input: unknown) =>
      await correctEntry(actor, input, "updateEntry"),
    deleteEntry: async (actor: Identity, input: unknown) =>
      await correctEntry(actor, input, "deleteEntry"),
  };
};
