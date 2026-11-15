/* eslint-disable promise/avoid-new -- Promises bridge Node process and socket events in HTTP integration tests. */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";

import { defaultSerovalDeserializerPlugins } from "@tanstack/react-router/ssr/server";
import { Pool } from "pg";
import { fromCrossJSON, toJSONAsync } from "seroval";
import type { SerovalNode } from "seroval";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";

import type { Identity } from "../src/identity";
import { createAuthentication } from "../src/server/auth";
import { createDatabase } from "../src/server/database";
import { createEntryService } from "../src/server/entries";
import { createHabitService } from "../src/server/habits";
import { migrate } from "../src/server/migrate";
import { provisionAccounts } from "../src/server/provision";
import { createTemplateService } from "../src/server/templates";

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL === undefined || databaseURL.length === 0) {
  throw new Error(
    "TEST_DATABASE_URL must name a disposable PostgreSQL database."
  );
}

const databaseName = `entries_${randomUUID().replaceAll("-", "")}`;
const isolatedURL = new URL(databaseURL);
isolatedURL.pathname = `/${databaseName}`;

const readStringAt = (root: unknown, path: readonly string[]): string => {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      throw new TypeError(`Expected object while reading ${path.join(".")}`);
    }
    current = Object.getOwnPropertyDescriptor(current, segment)?.value;
  }
  if (typeof current !== "string") {
    throw new TypeError(`Expected string at ${path.join(".")}`);
  }
  return current;
};

const control = new Pool({ connectionString: databaseURL });
const pool = new Pool({ connectionString: isolatedURL.toString(), max: 5 });
const otherPool = new Pool({
  connectionString: isolatedURL.toString(),
  max: 5,
});

const database = createDatabase(pool);
const otherDatabase = createDatabase(otherPool);

const config = {
  baseURL: "https://habitarc.example",
  secret: randomBytes(48).toString("base64"),
  production: true,
  proxy: "cloud-run" as const,
};

const password = randomBytes(24).toString("base64url");
const accounts = [
  {
    name: "Participant A",
    email: "a@example.test",
    password,
    role: "participant",
    timezone: "Asia/Bangkok",
  },
  {
    name: "Participant B",
    email: "b@example.test",
    password,
    role: "participant",
    timezone: "America/Los_Angeles",
  },
  {
    name: "Program Manager M",
    email: "m@example.test",
    password,
    role: "program-manager",
  },
];

const auth = createAuthentication(database, config);
const templates = createTemplateService(database);
const habits = createHabitService(database);
const entries = createEntryService(database);
const otherEntries = createEntryService(otherDatabase);

let participantA: Identity;
let participantB: Identity;
let managerM: Identity;

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const signInIdentity = async (email: string): Promise<Identity> => {
  const response = await auth.handle(
    new Request(`${config.baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        origin: config.baseURL,
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.7",
      },
      body: JSON.stringify({ email, password }),
    })
  );
  if (response.status !== 200) {
    throw new Error(`Expected sign in to succeed for ${email}`);
  }
  const identity = await auth.identity(
    new Headers({ cookie: cookieFrom(response) })
  );
  if (!identity) {
    throw new Error(`Expected identity for ${email}`);
  }
  return identity;
};

const createStudyTemplate = async () =>
  await templates.createTemplate(managerM, {
    name: "Focused Study",
    description: "Deep coursework blocks",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 45,
  });

const createCountTemplate = async () =>
  await templates.createTemplate(managerM, {
    name: "Practice Problems",
    description: "Solved exercises",
    unit: "counts",
    entryMinimum: 1,
    entryMaximum: 1_000_000,
  });

beforeAll(async () => {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(pool);
  await provisionAccounts(database, config, accounts);
  participantA = await signInIdentity("a@example.test");
  participantB = await signInIdentity("b@example.test");
  managerM = await signInIdentity("m@example.test");
});

beforeEach(async () => {
  await pool.query("TRUNCATE activity_template, mutation_receipt CASCADE");
});

afterAll(async () => {
  await pool.end();
  await otherPool.end();
  await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await control.end();
});

test("AC-F04-1: multiple deliberate entries accumulate and show overachievement with fill capped at 100%", async () => {
  const template = await createStudyTemplate();
  const createdHabit = await habits.createHabit(participantA, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const initialToday = await otherEntries.getToday(participantA);
  const today = initialToday.accountDate;

  const first = await entries.createEntry(participantA, {
    habitId: createdHabit.habit.id,
    activityDate: today,
    amount: 25,
    requestKey: randomUUID(),
  });
  expect(first).toMatchObject({
    kind: "created",
    dailyTotal: 25,
    entry: { amount: 25, activityDate: today },
  });

  const second = await otherEntries.createEntry(participantA, {
    habitId: createdHabit.habit.id,
    activityDate: today,
    amount: 25,
    requestKey: randomUUID(),
  });
  expect(second).toMatchObject({
    kind: "created",
    dailyTotal: 50,
    entry: { amount: 25, activityDate: today },
  });
  expect(second.entry.id).not.toBe(first.entry.id);

  const midToday = await otherEntries.getToday(participantA);
  expect(midToday.scheduled).toHaveLength(1);
  expect(midToday.scheduled[0]?.progress).toEqual({
    scheduled: true,
    dailyTarget: 60,
    dailyTotal: 50,
    percentage: 83,
    visualFillPercent: 83,
    completed: false,
  });
  expect(midToday.scheduled[0]?.entries.map((entry) => entry.amount)).toEqual([
    25, 25,
  ]);

  const third = await entries.createEntry(participantA, {
    habitId: createdHabit.habit.id,
    activityDate: today,
    amount: 25,
    requestKey: randomUUID(),
  });
  expect(third).toMatchObject({ kind: "created", dailyTotal: 75 });

  const finalToday = await otherEntries.getToday(participantA);
  expect(finalToday.scheduled[0]?.progress).toEqual({
    scheduled: true,
    dailyTarget: 60,
    dailyTotal: 75,
    percentage: 125,
    visualFillPercent: 100,
    completed: true,
  });
  expect(finalToday.scheduled[0]?.entries).toHaveLength(3);
});

test("AC-F04-2: concurrent idempotent retry counts once, payload mismatch conflicts, and distinct keys create distinct entries", async () => {
  const template = await createStudyTemplate();
  const { habit } = await habits.createHabit(participantA, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const { accountDate: today } = await entries.getToday(participantA);
  const sharedKey = randomUUID();

  const [res1, res2] = await Promise.all([
    entries.createEntry(participantA, {
      habitId: habit.id,
      activityDate: today,
      amount: 25,
      requestKey: sharedKey,
    }),
    otherEntries.createEntry(participantA, {
      habitId: habit.id,
      activityDate: today,
      amount: 25,
      requestKey: sharedKey,
    }),
  ]);

  expect([res1.kind, res2.kind]).toEqual(
    expect.arrayContaining(["created", "replayed"])
  );
  expect(res1.entry.id).toBe(res2.entry.id);
  expect(res1.dailyTotal).toBe(25);
  expect(res2.dailyTotal).toBe(25);

  await expect(
    otherEntries.createEntry(participantA, {
      habitId: habit.id,
      activityDate: today,
      amount: 30,
      requestKey: sharedKey,
    })
  ).rejects.toMatchObject({ status: 409 });

  const deliberateSecond = await entries.createEntry(participantA, {
    habitId: habit.id,
    activityDate: today,
    amount: 25,
    requestKey: randomUUID(),
  });
  expect(deliberateSecond.kind).toBe("created");
  expect(deliberateSecond.entry.id).not.toBe(res1.entry.id);
  expect(deliberateSecond.dailyTotal).toBe(50);

  const list = await otherEntries.listEntries(participantA, habit.id);
  expect(list).toHaveLength(2);
});

test("AC-F04-2: receipt and entry persist atomically, and auth/ownership run before receipt lookup", async () => {
  const template = await createStudyTemplate();
  const habitA = await habits.createHabit(participantA, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const habitB = await habits.createHabit(participantB, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const { accountDate: todayA } = await entries.getToday(participantA);
  const { accountDate: todayB } = await entries.getToday(participantB);
  const key = "shared-key-name";

  const createdA = await entries.createEntry(participantA, {
    habitId: habitA.habit.id,
    activityDate: todayA,
    amount: 20,
    requestKey: key,
  });

  // Participant B using the exact same requestKey string on B's own Habit succeeds independently.
  const createdB = await entries.createEntry(participantB, {
    habitId: habitB.habit.id,
    activityDate: todayB,
    amount: 35,
    requestKey: key,
  });
  expect(createdB.entry.id).not.toBe(createdA.entry.id);

  // Participant A passing A's used requestKey against B's Habit fails ownership with 404 before receipt lookup.
  await expect(
    entries.createEntry(participantA, {
      habitId: habitB.habit.id,
      activityDate: todayB,
      amount: 20,
      requestKey: key,
    })
  ).rejects.toMatchObject({ status: 404 });

  // Participant B passing A's Habit ID gets 404 even with A's requestKey.
  await expect(
    entries.createEntry(participantB, {
      habitId: habitA.habit.id,
      activityDate: todayA,
      amount: 20,
      requestKey: key,
    })
  ).rejects.toMatchObject({ status: 404 });

  // A failure inserting the receipt rolls back the entry atomically.
  await pool.query(
    "CREATE FUNCTION reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated receipt failure'; END; $$; CREATE TRIGGER reject_test_receipt BEFORE INSERT ON mutation_receipt FOR EACH ROW EXECUTE FUNCTION reject_test_receipt()"
  );
  try {
    await expect(
      entries.createEntry(participantA, {
        habitId: habitA.habit.id,
        activityDate: todayA,
        amount: 15,
        requestKey: randomUUID(),
      })
    ).rejects.toThrow();
  } finally {
    await pool.query(
      "DROP TRIGGER reject_test_receipt ON mutation_receipt; DROP FUNCTION reject_test_receipt()"
    );
  }

  expect(
    await otherEntries.listEntries(participantA, habitA.habit.id)
  ).toHaveLength(1);
});

test("AC-F04-3: account midnight, 7-day window, pre-start, post-archive, off-schedule, and DST/timezone independence", async () => {
  const template = await createStudyTemplate();
  const { habit: habitA } = await habits.createHabit(participantA, {
    templateId: template.id,
    dailyTarget: 60,
    // Monday through Friday only (Saturday=6, Sunday=7 unscheduled).
    weekdays: [1, 2, 3, 4, 5],
  });
  // Shift Habit A's startDate back to 2026-11-05 to test the full 7-day window around 2026-11-15 (Sunday).
  await pool.query(
    "UPDATE goal_revision SET effective_from = '2026-11-05' WHERE habit_id = $1",
    [habitA.id]
  );
  await pool.query("UPDATE habit SET start_date = '2026-11-05' WHERE id = $1", [
    habitA.id,
  ]);

  let fakeNow = new Date("2026-11-15T23:59:50+07:00");
  const clockedEntries = createEntryService(database, { now: () => fakeNow });

  // 2026-11-15 is a Sunday -> Habit A is unscheduled today, retains off-schedule activity without percentage/credit.
  const sundayToday = await clockedEntries.getToday(participantA);
  expect(sundayToday.accountDate).toBe("2026-11-15");
  expect(sundayToday.scheduled).toEqual([]);
  expect(sundayToday.unscheduled).toHaveLength(1);

  const offSchedule = await clockedEntries.createEntry(participantA, {
    habitId: habitA.id,
    activityDate: "2026-11-15",
    amount: 25,
    requestKey: randomUUID(),
  });
  expect(offSchedule.dailyTotal).toBe(25);
  const afterSundayEntry = await clockedEntries.getToday(participantA);
  expect(afterSundayEntry.unscheduled[0]?.progress).toEqual({
    scheduled: false,
    dailyTarget: null,
    dailyTotal: 25,
    percentage: null,
    visualFillPercent: null,
    completed: false,
  });

  // Window bounds on 2026-11-15: 2026-11-09 (today-6) allowed, 2026-11-08 (today-7) and 2026-11-16 (tomorrow) rejected.
  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-09",
      amount: 20,
      requestKey: randomUUID(),
    })
  ).resolves.toMatchObject({ kind: "created", dailyTotal: 20 });

  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-08",
      amount: 20,
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });

  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-16",
      amount: 20,
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });

  // Advance 20 seconds across Asia/Bangkok midnight to 2026-11-16 (Monday).
  fakeNow = new Date("2026-11-16T00:00:10+07:00");
  const mondayToday = await clockedEntries.getToday(participantA);
  expect(mondayToday.accountDate).toBe("2026-11-16");
  expect(mondayToday.scheduled).toHaveLength(1);
  expect(mondayToday.unscheduled).toEqual([]);

  // Now 2026-11-09 is today-7 and must be rejected; 2026-11-16 is writable.
  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-09",
      amount: 15,
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-16",
      amount: 30,
      requestKey: randomUUID(),
    })
  ).resolves.toMatchObject({ kind: "created", dailyTotal: 30 });

  // Pre-start and post-archive boundaries, plus caller timezone tampering ignored.
  await pool.query(
    "UPDATE habit SET start_date = '2026-11-13', archived_from = '2026-11-16' WHERE id = $1",
    [habitA.id]
  );
  await pool.query(
    "UPDATE goal_revision SET effective_from = '2026-11-13' WHERE habit_id = $1",
    [habitA.id]
  );

  // Pre-start (2026-11-12) rejected.
  await expect(
    clockedEntries.createEntry(
      { ...participantA, timezone: "Etc/GMT+12" },
      {
        habitId: habitA.id,
        activityDate: "2026-11-12",
        amount: 15,
        requestKey: randomUUID(),
        timezone: "Etc/GMT+12",
        accountDate: "2026-11-12",
      }
    )
  ).rejects.toMatchObject({ status: 400 });

  // Post-archive (2026-11-16 >= archived_from) rejected; 2026-11-14 (< archived_from) accepted.
  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-16",
      amount: 15,
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    clockedEntries.createEntry(participantA, {
      habitId: habitA.id,
      activityDate: "2026-11-14",
      amount: 15,
      requestKey: randomUUID(),
    })
  ).resolves.toMatchObject({ kind: "created", dailyTotal: 15 });

  // Alternate timezone + DST fall-back check for Participant B (America/Los_Angeles):
  // 2026-11-01T07:30:00Z is 2026-11-01 00:30 PDT; 2026-11-02T07:30:00Z is 2026-11-01 23:30 PST (same calendar date!).
  fakeNow = new Date("2026-11-01T07:30:00Z");
  const { habit: habitB } = await habits.createHabit(participantB, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  await pool.query(
    "UPDATE goal_revision SET effective_from = '2026-11-01' WHERE habit_id = $1",
    [habitB.id]
  );
  await pool.query("UPDATE habit SET start_date = '2026-11-01' WHERE id = $1", [
    habitB.id,
  ]);
  const beforeUtcMidnight = await clockedEntries.getToday(participantB);
  expect(beforeUtcMidnight.accountDate).toBe("2026-11-01");
  fakeNow = new Date("2026-11-02T07:30:00Z");
  const afterUtcMidnight = await clockedEntries.getToday(participantB);
  expect(afterUtcMidnight.accountDate).toBe("2026-11-01");
  // No partial receipts were stored for rejected date-window writes.
  const receiptCount = await pool.query<{ count: string }>(
    "SELECT count(*) FROM mutation_receipt WHERE actor_id = $1",
    [participantA.id]
  );
  expect(Number(receiptCount.rows[0]?.count)).toBe(4);
});

test("AC-F04-4: concurrent ceiling writes cannot exceed 1,440 minutes or 1,000,000 counts, and rejected writes leave no receipt", async () => {
  const study = await createStudyTemplate();
  const { habit: minuteHabit } = await habits.createHabit(participantA, {
    templateId: study.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const { accountDate: today } = await entries.getToday(participantA);

  // Build up to 1,430 minutes (31 * 45 + 35 = 1,430).
  const setupPromises = Array.from(
    { length: 31 },
    async (_, index) =>
      await entries.createEntry(participantA, {
        habitId: minuteHabit.id,
        activityDate: today,
        amount: 45,
        requestKey: `seed-${index}`,
      })
  );
  await Promise.all(setupPromises);
  await entries.createEntry(participantA, {
    habitId: minuteHabit.id,
    activityDate: today,
    amount: 35,
    requestKey: "seed-31",
  });

  const keyOne = randomUUID();
  const keyTwo = randomUUID();
  const results = await Promise.allSettled([
    entries.createEntry(participantA, {
      habitId: minuteHabit.id,
      activityDate: today,
      amount: 10,
      requestKey: keyOne,
    }),
    otherEntries.createEntry(participantA, {
      habitId: minuteHabit.id,
      activityDate: today,
      amount: 10,
      requestKey: keyTwo,
    }),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(fulfilled[0]?.value.dailyTotal).toBe(1440);
  expect(rejected[0]?.reason).toMatchObject({ status: 409 });

  const todayAfterRace = await otherEntries.getToday(participantA);
  expect(todayAfterRace.scheduled[0]?.progress.dailyTotal).toBe(1440);

  // Rejected race contender left no receipt.
  const receipts = await pool.query<{ count: string }>(
    "SELECT count(*) FROM mutation_receipt WHERE actor_id = $1 AND request_key IN ($2, $3)",
    [participantA.id, keyOne, keyTwo]
  );
  expect(Number(receipts.rows[0]?.count)).toBe(1);

  // Invalid inputs (0, negative, fractional, below min, above max) leave no entry or receipt.
  for (const invalidAmount of [0, -5, 4, 46, 10.5]) {
    const invalidKey = randomUUID();
    // eslint-disable-next-line no-await-in-loop -- Assert per-case receipt absence sequentially.
    await expect(
      entries.createEntry(participantA, {
        habitId: minuteHabit.id,
        activityDate: today,
        amount: invalidAmount,
        requestKey: invalidKey,
      })
    ).rejects.toMatchObject({ status: 400 });
    // eslint-disable-next-line no-await-in-loop -- Assert per-case receipt absence sequentially.
    const check = await pool.query<{ count: string }>(
      "SELECT count(*) FROM mutation_receipt WHERE request_key = $1",
      [invalidKey]
    );
    expect(Number(check.rows[0]?.count)).toBe(0);
  }

  // Counts ceiling: 1,000,000 inclusive succeeds, +1 conflicts without leaving a receipt.
  const countTemplate = await createCountTemplate();
  const { habit: countHabit } = await habits.createHabit(participantB, {
    templateId: countTemplate.id,
    dailyTarget: 100,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const { accountDate: todayB } = await entries.getToday(participantB);
  await expect(
    entries.createEntry(participantB, {
      habitId: countHabit.id,
      activityDate: todayB,
      amount: 1_000_000,
      requestKey: randomUUID(),
    })
  ).resolves.toMatchObject({ kind: "created", dailyTotal: 1_000_000 });

  const overflowKey = randomUUID();
  await expect(
    entries.createEntry(participantB, {
      habitId: countHabit.id,
      activityDate: todayB,
      amount: 1,
      requestKey: overflowKey,
    })
  ).rejects.toMatchObject({ status: 409 });
  const overflowReceipt = await pool.query<{ count: string }>(
    "SELECT count(*) FROM mutation_receipt WHERE request_key = $1",
    [overflowKey]
  );
  expect(Number(overflowReceipt.rows[0]?.count)).toBe(0);

  // Direct SQL trigger prevents violating ceiling or bounds even outside the app service.
  await expect(
    pool.query(
      "INSERT INTO activity_entry (id, habit_id, activity_date, amount) VALUES ($1, $2, $3, $4)",
      [randomUUID(), minuteHabit.id, today, 5]
    )
  ).rejects.toMatchObject({ code: "23514" });
});

test("Program Managers cannot read Today or record Activity Entries", async () => {
  const template = await createStudyTemplate();
  const { habit } = await habits.createHabit(participantA, {
    templateId: template.id,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  const { accountDate: today } = await entries.getToday(participantA);

  await expect(entries.getToday(managerM)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    entries.createEntry(managerM, {
      habitId: habit.id,
      activityDate: today,
      amount: 25,
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 403 });
  await expect(entries.listEntries(managerM, habit.id)).rejects.toMatchObject({
    status: 403,
  });
});

const serverFunctionPatterns = {
  createTemplate:
    /\bcreateTemplate\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  createHabit: /\bcreateHabit\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  getToday: /\bgetToday\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  createEntry: /\bcreateEntry\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
};

const entryServerClient = async (origin: string) => {
  const module = await fetch(`${origin}/src/server/functions.ts`);
  if (!module.ok) {
    throw new Error("Could not load compiled server functions.");
  }
  const source = await module.text();
  return async (
    name: keyof typeof serverFunctionPatterns,
    options: {
      method: "GET" | "POST";
      data?: unknown;
      cookie?: string;
      headers?: Record<string, string>;
    }
  ) => {
    const id = serverFunctionPatterns[name].exec(source)?.groups?.id;
    if (id === undefined || id.length === 0) {
      throw new Error(`Missing compiled server function: ${name}`);
    }
    const url = new URL(`/_serverFn/${id}`, origin);
    const headers: Record<string, string> = {
      cookie: options.cookie ?? "",
      "x-tsr-serverFn": "true",
      accept: "application/json",
      ...options.headers,
    };
    let body: string | undefined;
    if (options.method === "GET") {
      if (options.data !== undefined) {
        url.searchParams.set(
          "payload",
          JSON.stringify(await toJSONAsync({ data: options.data }))
        );
      }
    } else {
      headers["content-type"] = "application/json";
      headers.origin ??= origin;
      body = JSON.stringify(
        await toJSONAsync(
          options.data === undefined ? {} : { data: options.data }
        )
      );
    }
    const response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      const serialized: unknown = JSON.parse(text);
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- The running TanStack server emits Seroval nodes.
      parsed = fromCrossJSON(serialized as SerovalNode, {
        refs: new Map(),
        plugins: defaultSerovalDeserializerPlugins,
      });
    } catch {
      // Plain error text responses stay strings.
    }
    return { status: response.status, body: parsed };
  };
};

test(
  "TanStack Start enforces Today and entry recording authorization, idempotency, conflict serialization, and reload persistence over HTTP",
  { timeout: 30_000 },
  async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const listener = createServer();
      listener.on("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address();
        if (address === null || typeof address === "string") {
          listener.close();
          reject(new Error("Could not allocate test port."));
          return;
        }
        listener.close(() => {
          resolve(address.port);
        });
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(
      "vp",
      ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      {
        detached: true,
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: isolatedURL.toString(),
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: config.secret,
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let logs = "";
    const stopped = new Promise<void>((resolve) => {
      child.on("close", () => {
        resolve();
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("TanStack test server did not start."));
        }, 20_000);
        child.on("error", () => {
          clearTimeout(timeout);
          reject(new Error("TanStack test server failed."));
        });
        child.on("exit", () => {
          clearTimeout(timeout);
          reject(new Error("TanStack test server exited."));
        });
        const read = (chunk: Buffer) => {
          logs += chunk.toString();
          if (logs.includes(origin)) {
            clearTimeout(timeout);
            resolve();
          }
        };
        child.stdout.on("data", read);
        child.stderr.on("data", read);
      });

      const callServerFn = await entryServerClient(origin);

      expect(await callServerFn("getToday", { method: "GET" })).toMatchObject({
        status: 401,
      });
      expect(
        await callServerFn("createEntry", {
          method: "POST",
          data: {
            habitId: "any",
            activityDate: "2026-11-15",
            amount: 25,
            requestKey: "k1",
          },
        })
      ).toMatchObject({ status: 401 });

      const signIn = async (email: string) => {
        const login = await fetch(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        expect(login.status).toBe(200);
        return cookieFrom(login);
      };

      const participantCookie = await signIn("a@example.test");
      const otherCookie = await signIn("b@example.test");
      const managerCookie = await signIn("m@example.test");

      const createdTemplate = await callServerFn("createTemplate", {
        method: "POST",
        cookie: managerCookie,
        data: {
          name: "Focused Study HTTP",
          description: "Quiet study",
          unit: "minutes",
          entryMinimum: 5,
          entryMaximum: 45,
        },
      });
      const templateId = readStringAt(createdTemplate.body, ["result", "id"]);

      const createdHabit = await callServerFn("createHabit", {
        method: "POST",
        cookie: participantCookie,
        data: {
          templateId,
          dailyTarget: 60,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
        },
      });
      const habitId = readStringAt(createdHabit.body, [
        "result",
        "habit",
        "id",
      ]);

      const todayResp = await callServerFn("getToday", {
        method: "GET",
        cookie: participantCookie,
      });
      const todayDate = readStringAt(todayResp.body, ["result", "accountDate"]);

      expect(
        await callServerFn("getToday", {
          method: "GET",
          cookie: managerCookie,
        })
      ).toMatchObject({ status: 403 });

      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: managerCookie,
          data: {
            habitId,
            activityDate: todayDate,
            amount: 25,
            requestKey: "m1",
          },
        })
      ).toMatchObject({ status: 403 });

      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: otherCookie,
          data: {
            habitId,
            activityDate: todayDate,
            amount: 25,
            requestKey: "b1",
          },
        })
      ).toMatchObject({ status: 404 });

      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: participantCookie,
          headers: { origin: "https://evil.example" },
          data: {
            habitId,
            activityDate: todayDate,
            amount: 25,
            requestKey: "csrf-1",
          },
        })
      ).toMatchObject({ status: 403 });

      const invalidResponse = await callServerFn("createEntry", {
        method: "POST",
        cookie: participantCookie,
        data: {
          habitId,
          activityDate: todayDate,
          amount: 4,
          requestKey: "bad-1",
        },
      });
      expect(invalidResponse.status).toBe(400);
      expect(readStringAt(invalidResponse.body, ["result", "kind"])).toBe(
        "invalid"
      );
      expect(
        readStringAt(invalidResponse.body, ["result", "fieldErrors", "amount"])
      ).toMatch(/5 to 45/u);

      const firstKey = randomUUID();
      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: participantCookie,
          data: {
            habitId,
            activityDate: todayDate,
            amount: 25,
            requestKey: firstKey,
          },
        })
      ).toMatchObject({
        status: 200,
        body: { result: { kind: "created", dailyTotal: 25 } },
      });

      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: participantCookie,
          data: {
            habitId,
            activityDate: todayDate,
            amount: 25,
            requestKey: firstKey,
          },
        })
      ).toMatchObject({
        status: 200,
        body: { result: { kind: "replayed", dailyTotal: 25 } },
      });

      expect(
        await callServerFn("createEntry", {
          method: "POST",
          cookie: participantCookie,
          data: {
            habitId,
            activityDate: todayDate,
            amount: 30,
            requestKey: firstKey,
          },
        })
      ).toMatchObject({
        status: 409,
        body: { result: { kind: "conflict" } },
      });

      await callServerFn("createEntry", {
        method: "POST",
        cookie: participantCookie,
        data: {
          habitId,
          activityDate: todayDate,
          amount: 25,
          requestKey: randomUUID(),
        },
      });
      await callServerFn("createEntry", {
        method: "POST",
        cookie: participantCookie,
        data: {
          habitId,
          activityDate: todayDate,
          amount: 25,
          requestKey: randomUUID(),
        },
      });

      expect(
        await callServerFn("getToday", {
          method: "GET",
          cookie: participantCookie,
        })
      ).toMatchObject({
        status: 200,
        body: {
          result: {
            scheduled: [
              {
                progress: {
                  dailyTotal: 75,
                  percentage: 125,
                  visualFillPercent: 100,
                  completed: true,
                },
              },
            ],
          },
        },
      });

      const reload = await fetch(origin, {
        headers: { cookie: participantCookie },
      });
      const html = await reload.text();
      expect(reload.status).toBe(200);
      expect(html).toContain("Today");
      expect(html).toContain("125%");
      expect(html).toContain("Completed");

      const otherReload = await fetch(origin, {
        headers: { cookie: otherCookie },
      });
      expect(await otherReload.text()).not.toContain("125%");

      const managerReload = await fetch(origin, {
        headers: { cookie: managerCookie },
      });
      expect(await managerReload.text()).not.toContain("Scheduled for today");
    } finally {
      if (child.pid !== undefined) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            child.kill("SIGTERM");
          }
        }
      }
      await stopped;
    }
  }
);
