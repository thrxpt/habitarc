import { and, eq, sql } from "drizzle-orm";

import type { Identity } from "../identity";
import { AuthError } from "./auth-error";
import type { Database, Transaction } from "./database";
import { habit, user } from "./schema";

export interface TrackingServiceOptions {
  now?: () => Date;
}

export interface AccountCalendar {
  accountDate: string;
  timezone: string;
}

export const accountDateExpression = (now?: () => Date) => {
  if (now === undefined) {
    return sql<string>`to_char(clock_timestamp() AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`;
  }
  const instant = now().toISOString();
  return sql<string>`to_char(${instant}::timestamptz AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`;
};

export const readAccountCalendar = async (
  database: Database | Transaction,
  actor: Identity,
  now?: () => Date
): Promise<AccountCalendar> => {
  if (actor.role !== "participant") {
    throw new AuthError(403, "Forbidden");
  }
  const [calendar] = await database
    .select({
      timezone: user.timezone,
      accountDate: accountDateExpression(now),
    })
    .from(user)
    .where(and(eq(user.id, actor.id), eq(user.role, "participant")));
  if (calendar === undefined) {
    throw new AuthError(403, "Forbidden");
  }
  return calendar;
};

export const lockParticipant = async (
  transaction: Transaction,
  actor: Identity,
  mode: "share" | "update" = "update"
) => {
  const [participant] = await transaction
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, actor.id), eq(user.role, "participant")))
    .for(mode);
  if (participant === undefined) {
    throw new AuthError(403, "Forbidden");
  }
};

export const readTracking = async <Result>(
  database: Database,
  actor: Identity,
  read: (
    transaction: Transaction,
    calendar: AccountCalendar
  ) => Promise<Result>,
  now?: () => Date
): Promise<Result> => {
  if (actor.role !== "participant") {
    throw new AuthError(403, "Forbidden");
  }
  return await database.transaction(
    async (transaction) => {
      // Wait for any save admitted before midnight before sampling the date.
      await lockParticipant(transaction, actor, "share");
      const calendar = await readAccountCalendar(transaction, actor, now);
      return await read(transaction, calendar);
    },
    { isolationLevel: "read committed" }
  );
};

export const lockOwnedHabit = async (
  transaction: Transaction,
  actor: Identity,
  habitId: string
) => {
  // Every tracking mutation takes the Participant lock before the Habit lock.
  await lockParticipant(transaction, actor);
  const [owned] = await transaction
    .select()
    .from(habit)
    .where(and(eq(habit.id, habitId), eq(habit.participantId, actor.id)))
    .for("update");
  return owned;
};
