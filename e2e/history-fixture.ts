import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { addCalendarDays, getIsoWeekday } from "../src/calendar";
import type { Identity } from "../src/identity";
import type { Database } from "../src/server/database";
import { createEntryService } from "../src/server/entries";
import { createHabitService } from "../src/server/habits";
import { goalRevision, habit, user } from "../src/server/schema";
import { createTemplateService } from "../src/server/templates";

export const HISTORY_FIXTURE_NAME = "History Study E2E";

export const seedEntryHistory = async (database: Database) => {
  const accounts = await database.select().from(user);
  const participantAccount = accounts.find(
    (account) => account.email === "history@example.test"
  );
  const managerAccount = accounts.find(
    (account) => account.email === "manager@example.test"
  );
  if (
    participantAccount?.role !== "participant" ||
    managerAccount?.role !== "program-manager"
  ) {
    throw new Error("Expected History fixture accounts.");
  }
  const participant: Identity = {
    ...participantAccount,
    role: participantAccount.role,
  };
  const manager: Identity = { ...managerAccount, role: managerAccount.role };

  const template = await createTemplateService(database).createTemplate(
    manager,
    {
      name: HISTORY_FIXTURE_NAME,
      description: "Study sessions",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 60,
    }
  );
  const entries = createEntryService(database);
  const { accountDate } = await entries.getToday(participant);
  const { habit: createdHabit } = await createHabitService(
    database
  ).createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 40,
    weekdays: [getIsoWeekday(accountDate)],
  });

  const olderDate = addCalendarDays(accountDate, -7);
  await database
    .update(habit)
    .set({ startDate: olderDate })
    .where(eq(habit.id, createdHabit.id));
  await database
    .update(goalRevision)
    .set({ effectiveFrom: olderDate })
    .where(eq(goalRevision.habitId, createdHabit.id));
  const log = async (date: string, amount: number) =>
    await createEntryService(database, {
      now: () => new Date(`${date}T12:00:00+07:00`),
    }).createEntry(participant, {
      habitId: createdHabit.id,
      activityDate: date,
      amount,
      requestKey: randomUUID(),
    });
  await log(olderDate, 15);
  await log(addCalendarDays(accountDate, -6), 5);
  await log(addCalendarDays(accountDate, -1), 10);
  await log(accountDate, 45);
};
