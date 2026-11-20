/* eslint-disable no-bitwise -- A seven-bit mask stores the weekday Schedule. */
import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { addCalendarDays } from "../calendar";
import {
  validateGoalInput,
  validateGoalRevisionInput,
  validateHabitInput,
  WEEKDAYS,
} from "../habits";
import type {
  CreateHabitResult,
  GoalRevisionSuccess,
  GoalSnapshot,
  Habit,
  HabitFieldErrors,
  HabitWorkspace,
} from "../habits";
import type { Identity } from "../identity";
import { AuthError } from "./auth-error";
import type { Database, Transaction } from "./database";
import { readMutationReceipt, saveMutationReceipt } from "./mutation-receipts";
import { activityTemplate, goalRevision, habit, user } from "./schema";
import { lockActivityTemplate, toActivityTemplate } from "./templates";
import {
  accountDateExpression,
  lockOwnedHabit,
  lockParticipant,
  readAccountCalendar,
  readTracking,
} from "./tracking";
import type { AccountCalendar, TrackingServiceOptions } from "./tracking";

const STALE_GOAL_MESSAGE =
  "Your Habit settings changed. Reload the workspace before trying again.";

export class HabitError extends Error {
  readonly status: number;
  readonly fieldErrors: HabitFieldErrors;

  constructor(
    status: number,
    message: string,
    fieldErrors: HabitFieldErrors = {}
  ) {
    super(message);
    this.name = "HabitError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const encodeWeekdays = (weekdays: number[]) =>
  weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);

export const toGoalSnapshot = (
  row: typeof goalRevision.$inferSelect
): GoalSnapshot => ({
  effectiveFrom: row.effectiveFrom,
  dailyTarget: row.dailyTarget,
  weekdays: WEEKDAYS.filter(
    (day) => (row.weekdayMask & (1 << (day.value - 1))) !== 0
  ).map((day) => day.value),
});

const readHabits = async (
  database: Database | Transaction,
  participantId: string,
  accountDate: string
): Promise<Habit[]> => {
  const tomorrow = addCalendarDays(accountDate, 1);
  const currentGoal = database
    .select()
    .from(goalRevision)
    .where(
      and(
        eq(goalRevision.habitId, habit.id),
        // For archived Habits, show the settings on the last tracking date.
        lte(
          goalRevision.effectiveFrom,
          sql`least(${accountDate}::date, ${habit.archivedFrom} - 1)`
        )
      )
    )
    .orderBy(desc(goalRevision.effectiveFrom))
    .limit(1)
    .as("current_goal");
  const rows = await database
    .select()
    .from(habit)
    .innerJoin(activityTemplate, eq(habit.templateId, activityTemplate.id))
    .innerJoinLateral(currentGoal, sql`true`)
    .leftJoin(
      goalRevision,
      and(
        eq(goalRevision.habitId, habit.id),
        eq(goalRevision.effectiveFrom, tomorrow),
        or(isNull(habit.archivedFrom), gt(habit.archivedFrom, tomorrow))
      )
    )
    .where(eq(habit.participantId, participantId))
    .orderBy(asc(habit.startDate), asc(habit.id));
  return rows.map((row) => ({
    id: row.habit.id,
    template: toActivityTemplate(row.activity_template),
    startDate: row.habit.startDate,
    archivedFrom: row.habit.archivedFrom,
    version: row.habit.version,
    goal: toGoalSnapshot(row.current_goal),
    pendingGoal:
      row.goal_revision === null ? null : toGoalSnapshot(row.goal_revision),
  }));
};

export const readHabitWorkspace = async (
  database: Database | Transaction,
  participantId: string,
  { accountDate, timezone }: AccountCalendar
): Promise<HabitWorkspace> => ({
  accountDate,
  timezone,
  items: await readHabits(database, participantId, accountDate),
});

export const createHabitService = (
  database: Database,
  options: TrackingServiceOptions = {}
) => {
  const listHabits = async (actor: Identity): Promise<HabitWorkspace> =>
    await readTracking(
      database,
      actor,
      async (transaction, calendar) =>
        await readHabitWorkspace(transaction, actor.id, calendar),
      options.now
    );

  const createHabit = async (
    actor: Identity,
    input: unknown
  ): Promise<CreateHabitResult> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }
    const validation = validateHabitInput(input);
    if (!validation.ok) {
      throw new HabitError(
        400,
        "Check your Habit settings.",
        validation.fieldErrors
      );
    }
    return await database.transaction(async (transaction) => {
      const row = await lockActivityTemplate(
        transaction,
        validation.value.templateId
      );
      if (row === undefined || row.archivedAt !== null) {
        throw new HabitError(
          409,
          "This Activity Template is no longer available. Choose an active template."
        );
      }
      if (row.version !== validation.value.templateVersion) {
        throw new HabitError(
          409,
          "This Activity Template changed. Select it again and review the settings before starting your Habit."
        );
      }
      const template = toActivityTemplate(row);
      const checked = validateHabitInput(validation.value, template);
      if (!checked.ok) {
        throw new HabitError(
          400,
          "Check your Habit settings.",
          checked.fieldErrors
        );
      }
      // Match every tracking mutation's lock order: template, then participant.
      await lockParticipant(transaction, actor);
      const { accountDate } = await readAccountCalendar(
        transaction,
        actor,
        options.now
      );
      const ownedHabits = await readHabits(transaction, actor.id, accountDate);
      const existing = ownedHabits.find(
        (item) =>
          item.template.id === template.id &&
          (item.archivedFrom === null || item.archivedFrom > accountDate)
      );
      if (existing) {
        return { kind: "existing", habit: existing };
      }
      const id = randomUUID();
      const [created] = await transaction
        .insert(habit)
        .values({
          id,
          participantId: actor.id,
          templateId: template.id,
          startDate: accountDate,
        })
        .returning({ version: habit.version });
      if (created === undefined) {
        throw new Error("Habit creation did not return a record.");
      }
      await transaction.insert(goalRevision).values({
        id: randomUUID(),
        habitId: id,
        effectiveFrom: accountDate,
        dailyTarget: checked.value.dailyTarget,
        weekdayMask: encodeWeekdays(checked.value.weekdays),
      });
      return {
        kind: "created",
        habit: {
          id,
          template,
          startDate: accountDate,
          archivedFrom: null,
          version: created.version,
          pendingGoal: null,
          goal: {
            effectiveFrom: accountDate,
            dailyTarget: checked.value.dailyTarget,
            weekdays: checked.value.weekdays,
          },
        },
      };
    });
  };
  const reviseGoal = async (
    actor: Identity,
    input: unknown
  ): Promise<GoalRevisionSuccess> => {
    if (actor.role !== "participant") {
      throw new AuthError(403, "Forbidden");
    }
    const validation = validateGoalRevisionInput(input);
    if (!validation.ok) {
      throw new HabitError(400, validation.message, validation.fieldErrors);
    }
    const { requestKey, ...draft } = validation.value;
    return await database.transaction(async (transaction) => {
      const owned = await lockOwnedHabit(transaction, actor, draft.habitId);
      if (owned === undefined) {
        throw new HabitError(404, "Habit not found.");
      }
      const request = {
        actorId: actor.id,
        requestKey,
        operation: "reviseGoal",
        payloadFingerprint: JSON.stringify(draft),
      };
      const receipt = await readMutationReceipt(transaction, request);
      if (receipt.kind === "applied") {
        return { kind: "replayed" };
      }
      if (receipt.kind === "conflict") {
        throw new HabitError(
          409,
          "This request key was already used for a different change."
        );
      }
      if (owned.version !== draft.expectedVersion) {
        throw new HabitError(409, STALE_GOAL_MESSAGE);
      }
      const [template] = await transaction
        .select()
        .from(activityTemplate)
        .where(eq(activityTemplate.id, owned.templateId));
      if (template === undefined) {
        throw new Error("Habit's Activity Template is missing.");
      }
      const checked = validateGoalInput(draft, toActivityTemplate(template));
      if (!checked.ok) {
        throw new HabitError(
          400,
          "Check your Habit settings.",
          checked.fieldErrors
        );
      }
      const { effectiveFrom } = draft;
      if (
        owned.startDate >= effectiveFrom ||
        (owned.archivedFrom !== null && owned.archivedFrom <= effectiveFrom)
      ) {
        throw new HabitError(
          409,
          "Goal settings can only change for Habits that are active tomorrow."
        );
      }
      const settings = {
        dailyTarget: checked.value.dailyTarget,
        weekdayMask: encodeWeekdays(checked.value.weekdays),
      };
      // Wait for the pending row before checking the clock in the write itself.
      const [pending] = await transaction
        .select({ id: goalRevision.id })
        .from(goalRevision)
        .where(
          and(
            eq(goalRevision.habitId, owned.id),
            eq(goalRevision.effectiveFrom, effectiveFrom)
          )
        )
        .for("update");
      const tomorrowRevision = transaction
        .select({
          id: sql<string>`${randomUUID()}::text`.as("id"),
          habitId: sql<string>`${owned.id}::text`.as("habit_id"),
          effectiveFrom: sql<string>`${effectiveFrom}::date`.as(
            "effective_from"
          ),
          dailyTarget: sql<number>`${settings.dailyTarget}::int`.as(
            "daily_target"
          ),
          weekdayMask: sql<number>`${settings.weekdayMask}::int`.as(
            "weekday_mask"
          ),
        })
        .from(user)
        .where(
          and(
            eq(user.id, actor.id),
            eq(
              accountDateExpression(options.now),
              addCalendarDays(effectiveFrom, -1)
            )
          )
        );
      const insert = transaction.insert(goalRevision).select(tomorrowRevision);
      const [saved] = await (
        pending === undefined
          ? insert.onConflictDoNothing()
          : insert.onConflictDoUpdate({
              target: [goalRevision.habitId, goalRevision.effectiveFrom],
              set: settings,
            })
      ).returning({ id: goalRevision.id });
      if (saved === undefined) {
        throw new HabitError(
          409,
          "The account date or goal settings changed. Reload the workspace to edit tomorrow’s settings."
        );
      }
      await transaction
        .update(habit)
        .set({ version: owned.version + 1 })
        .where(eq(habit.id, owned.id));
      await saveMutationReceipt(transaction, request, owned.id);
      return { kind: "saved" };
    });
  };

  return { listHabits, createHabit, reviseGoal };
};
