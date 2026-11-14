/* eslint-disable no-bitwise -- A seven-bit mask stores the weekday Schedule. */
import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { validateHabitInput, WEEKDAYS } from "../habits";
import type {
  CreateHabitResult,
  Habit,
  HabitFieldErrors,
  HabitWorkspace,
} from "../habits";
import type { Identity } from "../identity";
import { AuthError } from "./auth-error";
import type { Database, Transaction } from "./database";
import { activityTemplate, goalRevision, habit, user } from "./schema";
import { toActivityTemplate } from "./templates";

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

const readHabits = async (
  database: Database | Transaction,
  participantId: string
): Promise<Habit[]> => {
  const rows = await database
    .select()
    .from(habit)
    .innerJoin(activityTemplate, eq(habit.templateId, activityTemplate.id))
    .innerJoin(
      goalRevision,
      and(
        eq(goalRevision.habitId, habit.id),
        eq(goalRevision.effectiveFrom, habit.startDate)
      )
    )
    .where(eq(habit.participantId, participantId))
    .orderBy(asc(habit.startDate), asc(habit.id));
  return rows.map((row) => ({
    id: row.habit.id,
    template: toActivityTemplate(row.activity_template),
    startDate: row.habit.startDate,
    archivedFrom: row.habit.archivedFrom,
    goal: {
      effectiveFrom: row.goal_revision.effectiveFrom,
      dailyTarget: row.goal_revision.dailyTarget,
      weekdays: WEEKDAYS.filter(
        (day) => (row.goal_revision.weekdayMask & (1 << (day.value - 1))) !== 0
      ).map((day) => day.value),
    },
  }));
};

const accountCalendar = async (
  database: Database | Transaction,
  actor: Identity
) => {
  if (actor.role !== "participant") {
    throw new AuthError(403, "Forbidden");
  }
  const rows = await database
    .select({
      timezone: user.timezone,
      accountDate: sql<string>`to_char(clock_timestamp() AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`,
    })
    .from(user)
    .where(and(eq(user.id, actor.id), eq(user.role, "participant")));
  const calendar = rows.at(0);
  if (calendar === undefined) {
    throw new AuthError(403, "Forbidden");
  }
  return calendar;
};

export const createHabitService = (database: Database) => {
  const listHabits = async (actor: Identity): Promise<HabitWorkspace> => {
    const calendar = await accountCalendar(database, actor);
    return { ...calendar, items: await readHabits(database, actor.id) };
  };

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
      // Template UPDATE/archival takes the same lock. Validate only after it is held.
      const rows = await transaction
        .select()
        .from(activityTemplate)
        .where(eq(activityTemplate.id, validation.value.templateId))
        .for("update");
      const row = rows.at(0);
      if (row === undefined || row.archivedAt !== null) {
        throw new HabitError(
          409,
          "This Activity Template is no longer available. Choose an active template."
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
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, actor.id))
        .for("update");
      const { accountDate } = await accountCalendar(transaction, actor);
      const ownedHabits = await readHabits(transaction, actor.id);
      const existing = ownedHabits.find(
        (item) =>
          item.template.id === template.id &&
          (item.archivedFrom === null || item.archivedFrom > accountDate)
      );
      if (existing) {
        return { kind: "existing", habit: existing };
      }
      const id = randomUUID();
      await transaction.insert(habit).values({
        id,
        participantId: actor.id,
        templateId: template.id,
        startDate: accountDate,
      });
      await transaction.insert(goalRevision).values({
        id: randomUUID(),
        habitId: id,
        effectiveFrom: accountDate,
        dailyTarget: checked.value.dailyTarget,
        weekdayMask: checked.value.weekdays.reduce(
          (mask, day) => mask | (1 << (day - 1)),
          0
        ),
      });
      return {
        kind: "created",
        habit: {
          id,
          template,
          startDate: accountDate,
          archivedFrom: null,
          goal: {
            effectiveFrom: accountDate,
            dailyTarget: checked.value.dailyTarget,
            weekdays: checked.value.weekdays,
          },
        },
      };
    });
  };
  return { listHabits, createHabit };
};
