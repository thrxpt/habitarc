/// <reference lib="esnext.temporal" />

import { and, eq, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

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
  observedAt: number;
}

export interface ReminderEvaluationInput extends AccountCalendar {
  reminderTime: string | null;
  active: boolean;
  scheduled: boolean;
  completed: boolean;
}

export interface ReminderEvaluation {
  due: boolean;
  nextDueAt: number | null;
}

const MIN_REFRESH_DELAY_MS = 1000;

export const getReminderInstantMs = (
  accountDate: string,
  timezone: string,
  reminderTime: string
): number => {
  const plainTime = Temporal.PlainTime.from(reminderTime);
  const plainDateTime =
    Temporal.PlainDate.from(accountDate).toPlainDateTime(plainTime);
  const resolved = plainDateTime.toZonedDateTime(timezone);
  if (resolved.toPlainTime().equals(plainTime)) {
    return resolved.epochMilliseconds;
  }
  // Skipped DST local time: the selected time has elapsed as soon as the clock jumps forward.
  const earlier = plainDateTime.toZonedDateTime(timezone, {
    disambiguation: "earlier",
  });
  const transition = earlier.getTimeZoneTransition("next");
  return (transition ?? resolved).epochMilliseconds;
};

export const evaluateReminder = ({
  accountDate,
  timezone,
  observedAt,
  reminderTime,
  active,
  scheduled,
  completed,
}: ReminderEvaluationInput): ReminderEvaluation => {
  if (!active || !scheduled || completed || reminderTime === null) {
    return { due: false, nextDueAt: null };
  }
  const dueAt = getReminderInstantMs(accountDate, timezone, reminderTime);
  if (observedAt >= dueAt) {
    return { due: true, nextDueAt: null };
  }
  return { due: false, nextDueAt: dueAt };
};

export const getAccountDateRefreshDelay = ({
  accountDate,
  timezone,
  observedAt,
}: AccountCalendar): number => {
  const tomorrow = Temporal.PlainDate.from(accountDate)
    .add({ days: 1 })
    .toZonedDateTime(timezone);
  return Math.max(
    MIN_REFRESH_DELAY_MS,
    tomorrow.epochMilliseconds - observedAt
  );
};

export const getWorkspaceRefreshDelay = (
  calendar: AccountCalendar,
  upcomingReminderInstants: readonly number[] = []
): number => {
  let delay = getAccountDateRefreshDelay(calendar);
  for (const instant of upcomingReminderInstants) {
    if (instant > calendar.observedAt) {
      delay = Math.min(
        delay,
        Math.max(MIN_REFRESH_DELAY_MS, instant - calendar.observedAt)
      );
    }
  }
  return delay;
};

const accountInstant = (now?: () => Date) =>
  now === undefined
    ? sql`clock_timestamp()`
    : sql`${now().toISOString()}::timestamptz`;

const accountDateAt = (instant: SQLWrapper) =>
  sql<string>`to_char(${instant} AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`;

export const accountDateExpression = (now?: () => Date) =>
  accountDateAt(accountInstant(now));

export const readAccountCalendar = async (
  database: Database | Transaction,
  actor: Identity,
  now?: () => Date
): Promise<AccountCalendar> => {
  if (actor.role !== "participant") {
    throw new AuthError(403, "Forbidden");
  }
  const instant = accountInstant(now);
  const clock = database
    .$with("account_clock", { instant: instant.as("instant") })
    .as(sql`select ${instant} as instant`);
  const [calendar] = await database
    .with(clock)
    .select({
      timezone: user.timezone,
      accountDate: accountDateAt(clock.instant),
      observedAt:
        sql<number>`floor(extract(epoch from ${clock.instant}) * 1000)`.mapWith(
          Number
        ),
    })
    .from(user)
    .crossJoin(clock)
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
