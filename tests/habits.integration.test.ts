import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";

import type { Identity } from "../src/identity";
import { createDatabase } from "../src/server/database";
import { createHabitService } from "../src/server/habits";
import { migrate } from "../src/server/migrate";
import { createTemplateService } from "../src/server/templates";

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL === undefined || databaseURL.length === 0) {
  throw new Error(
    "TEST_DATABASE_URL must name a disposable PostgreSQL database."
  );
}
const databaseName = `habits_${randomUUID().replaceAll("-", "")}`;
const isolatedURL = new URL(databaseURL);
isolatedURL.pathname = `/${databaseName}`;
const control = new Pool({ connectionString: databaseURL });
const pool = new Pool({ connectionString: isolatedURL.toString(), max: 5 });
const otherPool = new Pool({
  connectionString: isolatedURL.toString(),
  max: 5,
});
const habits = createHabitService(createDatabase(pool));
const otherHabits = createHabitService(createDatabase(otherPool));
const templates = createTemplateService(createDatabase(pool));
const otherTemplates = createTemplateService(createDatabase(otherPool));
const participant: Identity = {
  id: "a",
  name: "Participant A",
  email: "a@example.test",
  role: "participant",
  timezone: "Asia/Bangkok",
};
const otherParticipant: Identity = {
  ...participant,
  id: "b",
  name: "Participant B",
  email: "b@example.test",
  timezone: "America/Los_Angeles",
};
const manager: Identity = {
  ...participant,
  id: "m",
  name: "Manager",
  email: "m@example.test",
  role: "program-manager",
};
const eastParticipant: Identity = {
  ...participant,
  id: "east",
  email: "east@example.test",
  timezone: "Pacific/Kiritimati",
};
const westParticipant: Identity = {
  ...participant,
  id: "west",
  email: "west@example.test",
  timezone: "Etc/GMT+12",
};

beforeAll(async () => {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(pool);
  await Promise.all(
    [
      participant,
      otherParticipant,
      manager,
      eastParticipant,
      westParticipant,
    ].map(async (actor) => {
      await pool.query(
        'INSERT INTO "user" (id, name, email, role, timezone) VALUES ($1, $2, $3, $4, $5)',
        [actor.id, actor.name, actor.email, actor.role, actor.timezone]
      );
    })
  );
});

test.each([
  { dailyTarget: 4 },
  { dailyTarget: 1.5 },
  { dailyTarget: 1441 },
  { dailyTarget: "60" },
  { dailyTarget: Number.NaN },
  { dailyTarget: Number.POSITIVE_INFINITY },
  { weekdays: [] },
  { weekdays: [0] },
  { weekdays: [8] },
  { weekdays: [1, 1] },
  { weekdays: ["1"] },
  { weekdays: [1.5] },
  { templateId: "missing" },
])(
  "invalid Habit settings $dailyTarget $weekdays $templateId leave no partial Habit",
  async (changes) => {
    const template = await studyTemplate();
    await expect(
      habits.createHabit(participant, {
        templateId: template.id,
        templateVersion: template.version,
        dailyTarget: 60,
        weekdays: [1],
        ...changes,
      })
    ).rejects.toMatchObject({
      status: changes.templateId === undefined ? 400 : 409,
    });
    const workspace = await otherHabits.listHabits(participant);
    expect(workspace.items).toEqual([]);
  }
);

test.each([
  ["minutes", 1440],
  ["counts", 1_000_000],
] as const)(
  "%s ceiling %i is inclusive and independent of the per-entry maximum",
  async (unit, target) => {
    const template = await templates.createTemplate(manager, {
      name: unit,
      description: "",
      unit,
      entryMinimum: 5,
      entryMaximum: 45,
    });
    expect(
      await habits.createHabit(participant, {
        templateId: template.id,
        templateVersion: template.version,
        dailyTarget: target,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      })
    ).toMatchObject({
      kind: "created",
      habit: { goal: { dailyTarget: target, weekdays: [1, 2, 3, 4, 5, 6, 7] } },
    });
    await expect(
      habits.createHabit(otherParticipant, {
        templateId: template.id,
        templateVersion: template.version,
        dailyTarget: target + 1,
        weekdays: [1],
      })
    ).rejects.toMatchObject({ status: 400 });
  }
);

test("Account Timezones determine start dates across the date line and caller timezone fields are ignored", async () => {
  const template = await studyTemplate();
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1],
  };
  const east = await habits.createHabit(
    { ...eastParticipant, timezone: "UTC" },
    draft
  );
  const west = await habits.createHabit(
    { ...westParticipant, timezone: "UTC" },
    draft
  );
  const eastWorkspace = await otherHabits.listHabits(eastParticipant);
  const westWorkspace = await otherHabits.listHabits(westParticipant);
  expect(eastWorkspace.timezone).toBe("Pacific/Kiritimati");
  expect(westWorkspace.timezone).toBe("Etc/GMT+12");
  expect(east.habit.startDate).toBe(eastWorkspace.accountDate);
  expect(west.habit.startDate).toBe(westWorkspace.accountDate);
  expect(east.habit.startDate > west.habit.startDate).toBe(true);
});

test("only the owner reads a Habit and Program Managers cannot read or create private Habits directly", async () => {
  const template = await studyTemplate();
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1],
  };
  await habits.createHabit(participant, {
    ...draft,
    participantId: otherParticipant.id,
  });
  const workspace = await otherHabits.listHabits(otherParticipant);
  expect(workspace.items).toEqual([]);
  await expect(habits.listHabits(manager)).rejects.toMatchObject({
    status: 403,
  });
  await expect(habits.createHabit(manager, draft)).rejects.toMatchObject({
    status: 403,
  });
});

test("tomorrow's pending archive blocks today, and an ended Habit permits a fresh history", async () => {
  const template = await studyTemplate();
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1],
  };
  const first = await habits.createHabit(participant, draft);
  await pool.query(
    "UPDATE habit SET archived_from = start_date + 1 WHERE id = $1",
    [first.habit.id]
  );
  expect(await otherHabits.createHabit(participant, draft)).toMatchObject({
    kind: "existing",
    habit: { id: first.habit.id },
  });
  await pool.query(
    "UPDATE habit SET start_date = start_date - 1, archived_from = start_date WHERE id = $1",
    [first.habit.id]
  );
  await pool.query(
    "UPDATE goal_revision SET effective_from = effective_from - 1 WHERE habit_id = $1",
    [first.habit.id]
  );
  const fresh = await otherHabits.createHabit(participant, draft);
  expect(fresh.kind).toBe("created");
  expect(fresh.habit.id).not.toBe(first.habit.id);
  const workspace = await habits.listHabits(participant);
  expect(workspace.items).toHaveLength(2);
});

test("a failed initial Goal Revision rolls back the Habit and permits a clean retry", async () => {
  const template = await studyTemplate();
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1],
  };
  await pool.query(
    "CREATE FUNCTION reject_test_goal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated storage failure'; END; $$; CREATE TRIGGER reject_test_goal BEFORE INSERT ON goal_revision FOR EACH ROW EXECUTE FUNCTION reject_test_goal()"
  );
  try {
    await expect(habits.createHabit(participant, draft)).rejects.toThrow();
  } finally {
    await pool.query(
      "DROP TRIGGER reject_test_goal ON goal_revision; DROP FUNCTION reject_test_goal()"
    );
  }
  const workspace = await otherHabits.listHabits(participant);
  expect(workspace.items).toEqual([]);
  expect(await otherHabits.createHabit(participant, draft)).toMatchObject({
    kind: "created",
  });
});
beforeEach(async () => {
  await pool.query("TRUNCATE activity_template CASCADE");
});
afterAll(async () => {
  await pool.end();
  await otherPool.end();
  await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await control.end();
});

const studyTemplate = async () =>
  await templates.createTemplate(manager, {
    name: "Focused Study",
    description: "Quiet reading and problem sets",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 45,
  });

const waitForBlockedQuery = async (fragment: string) => {
  await expect
    .poll(
      async () => {
        const result = await pool.query<{ count: string }>(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND state = 'active' AND wait_event_type = 'Lock' AND query ILIKE $2",
          [databaseName, `%${fragment}%`]
        );
        return Number(result.rows[0]?.count);
      },
      { timeout: 2000 }
    )
    .toBeGreaterThan(0);
};

test("Habit creation waits for the participant tracking lock after locking its template", async () => {
  const template = await studyTemplate();
  const blocker = await otherPool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [
      participant.id,
    ]);
    const creation = habits.createHabit(participant, {
      templateId: template.id,
      templateVersion: template.version,
      dailyTarget: 60,
      weekdays: [1],
    });
    await waitForBlockedQuery('from "user"');
    await blocker.query("COMMIT");
    expect(await creation).toMatchObject({ kind: "created" });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});

test.each(["archive", "measurement"] as const)(
  "a %s committed ahead of first use rejects the stale Habit selection",
  async (operation) => {
    const template = await studyTemplate();
    const barrier = await pool.connect();
    const barrierKey = 606_005;
    await barrier.query("SELECT pg_advisory_lock($1)", [barrierKey]);
    try {
      await pool.query(
        `CREATE FUNCTION wait_for_test_template_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${barrierKey}); RETURN NEW; END; $$; CREATE TRIGGER wait_for_test_template_update BEFORE UPDATE ON activity_template FOR EACH ROW EXECUTE FUNCTION wait_for_test_template_update()`
      );
      const reference = {
        templateId: template.id,
        templateVersion: template.version,
      };
      const maintenance =
        operation === "archive"
          ? otherTemplates.archiveTemplate(manager, reference)
          : otherTemplates.updateTemplate(manager, {
              ...template,
              ...reference,
              unit: "counts",
            });
      await waitForBlockedQuery('update "activity_template"');
      const rejected = expect(
        habits.createHabit(participant, {
          ...reference,
          dailyTarget: 60,
          weekdays: [1],
        })
      ).rejects.toMatchObject({
        status: 409,
        message:
          operation === "archive"
            ? "This Activity Template is no longer available. Choose an active template."
            : "This Activity Template changed. Select it again and review the settings before starting your Habit.",
      });
      await waitForBlockedQuery('from "activity_template"');
      await barrier.query("SELECT pg_advisory_unlock($1)", [barrierKey]);
      expect(await maintenance).toMatchObject({
        version: template.version + 1,
      });
      await rejected;
      const workspace = await otherHabits.listHabits(participant);
      expect(workspace.items).toEqual([]);
    } finally {
      await barrier.query("SELECT pg_advisory_unlock($1)", [barrierKey]);
      barrier.release();
      await pool.query(
        "DROP TRIGGER IF EXISTS wait_for_test_template_update ON activity_template; DROP FUNCTION IF EXISTS wait_for_test_template_update()"
      );
    }
  }
);

test("a measurement edit waiting behind Habit creation cannot change the newly used template", async () => {
  const template = await studyTemplate();
  const blocker = await pool.connect();
  const barrierKey = 606_006;
  await blocker.query("SELECT pg_advisory_lock($1)", [barrierKey]);
  await pool.query(
    `CREATE FUNCTION wait_for_test_goal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${barrierKey}); RETURN NEW; END; $$; CREATE TRIGGER wait_for_test_goal BEFORE INSERT ON goal_revision FOR EACH ROW EXECUTE FUNCTION wait_for_test_goal()`
  );
  try {
    const creation = habits.createHabit(participant, {
      templateId: template.id,
      templateVersion: template.version,
      dailyTarget: 60,
      weekdays: [1],
    });
    await waitForBlockedQuery('insert into "goal_revision"');
    const edited = expect(
      otherTemplates.updateTemplate(manager, {
        ...template,
        templateId: template.id,
        templateVersion: template.version,
        entryMaximum: 90,
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        "This Activity Template is in use. Its unit and entry bounds are fixed. Reload to edit its name or description.",
    });
    await waitForBlockedQuery('from "activity_template"');
    await blocker.query("SELECT pg_advisory_unlock($1)", [barrierKey]);
    expect(await creation).toMatchObject({
      kind: "created",
      habit: { template: { entryMaximum: 45 } },
    });
    await edited;
    const workspace = await otherHabits.listHabits(participant);
    expect(workspace.items[0]?.template.entryMaximum).toBe(45);
  } finally {
    await blocker.query("SELECT pg_advisory_unlock($1)", [barrierKey]);
    blocker.release();
    await pool.query(
      "DROP TRIGGER wait_for_test_goal ON goal_revision; DROP FUNCTION wait_for_test_goal()"
    );
  }
});

test("Participant starts a persisted scheduled Habit with target 60 on a 5–45 minute template", async () => {
  const template = await studyTemplate();
  const created = await habits.createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  });
  const calendar = await pool.query<{ today: string }>(
    "SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS today"
  );
  expect(created).toMatchObject({
    kind: "created",
    habit: {
      template,
      startDate: calendar.rows[0]?.today,
      archivedFrom: null,
      goal: {
        effectiveFrom: calendar.rows[0]?.today,
        dailyTarget: 60,
        weekdays: [1, 2, 3, 4, 5],
      },
    },
  });
  expect(await otherHabits.listHabits(participant)).toMatchObject({
    accountDate: calendar.rows[0]?.today,
    timezone: "Asia/Bangkok",
    items: [created.habit],
  });
});

test("concurrent creates return one active Habit and direct overlapping periods are rejected", async () => {
  const template = await studyTemplate();
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  };
  const results = await Promise.all([
    habits.createHabit(participant, draft),
    otherHabits.createHabit(participant, draft),
  ]);
  expect(results.map((result) => result.kind)).toEqual(
    expect.arrayContaining(["created", "existing"])
  );
  expect(results[0]?.habit.id).toBe(results[1]?.habit.id);
  const workspace = await otherHabits.listHabits(participant);
  expect(workspace.items).toHaveLength(1);
  await expect(
    pool.query(
      "INSERT INTO habit (id, participant_id, template_id, start_date) VALUES ($1, $2, $3, $4)",
      [randomUUID(), participant.id, template.id, results[0]?.habit.startDate]
    )
  ).rejects.toMatchObject({ code: "23P01" });
});

test("using a template freezes its measurement meaning but permits descriptive edits and archive", async () => {
  const template = await studyTemplate();
  await habits.createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1],
  });
  await Promise.all(
    ["unit = 'counts'", "entry_minimum = 1", "entry_maximum = 90"].map(
      async (change) => {
        await expect(
          pool.query(`UPDATE activity_template SET ${change} WHERE id = $1`, [
            template.id,
          ])
        ).rejects.toMatchObject({ code: "23514" });
      }
    )
  );
  await pool.query(
    "UPDATE activity_template SET description = 'Updated description', archived_at = now() WHERE id = $1",
    [template.id]
  );
  const workspace = await otherHabits.listHabits(participant);
  expect(workspace.items[0]).toMatchObject({
    template: {
      description: "Updated description",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 45,
    },
    goal: { dailyTarget: 60 },
  });
  await expect(
    habits.createHabit(otherParticipant, {
      templateId: template.id,
      templateVersion: template.version,
      dailyTarget: 60,
      weekdays: [1],
    })
  ).rejects.toMatchObject({ status: 409 });
});

test("AC-F08-3 / AC-F08-4: archiving sets tomorrow as exclusive end date and enforces ownership, version, idempotency, and midnight rollover", async () => {
  const template = await studyTemplate();
  let fakeNow = new Date("2026-11-16T12:00:00+07:00");
  const clockedHabits = createHabitService(createDatabase(pool), {
    now: () => fakeNow,
  });
  const otherClockedHabits = createHabitService(createDatabase(otherPool), {
    now: () => fakeNow,
  });

  const { habit: created } = await clockedHabits.createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  });
  expect(created.startDate).toBe("2026-11-16");

  // Program Manager, another Participant, invalid payload, and wrong date are rejected.
  await expect(
    clockedHabits.archiveHabit(manager, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    clockedHabits.archiveHabit(otherParticipant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 404 });

  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: 0,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });

  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: `${created.id}\u0000`,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 400 });

  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: `${randomUUID()}\u0000`,
    })
  ).rejects.toMatchObject({ status: 400 });

  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-16",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-18",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  // Stale version fails without mutating the Habit.
  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version + 1,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  // Valid archive succeeds with tomorrow as exclusive end date.
  const archiveKey = randomUUID();
  expect(
    await clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: archiveKey,
    })
  ).toEqual({ kind: "archived", archivedFrom: "2026-11-17" });

  // Replaying the same request key confirms without mutating again.
  expect(
    await otherClockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-17",
      requestKey: archiveKey,
    })
  ).toEqual({ kind: "replayed", archivedFrom: "2026-11-17" });

  // Reusing the same key for a different payload conflicts.
  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      archivedFrom: "2026-11-18",
      requestKey: archiveKey,
    })
  ).rejects.toMatchObject({ status: 409 });

  // Already-archived Habit cannot be archived again or extended.
  const workspace = await otherClockedHabits.listHabits(participant);
  expect(workspace.items[0]).toMatchObject({
    id: created.id,
    archivedFrom: "2026-11-17",
    version: created.version + 1,
  });
  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version + 1,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  // Midnight rollover rejects a stale archivedFrom date on a second Habit.
  const secondTemplate = await templates.createTemplate(manager, {
    name: "Evening Reading",
    description: "",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 60,
  });
  const { habit: second } = await clockedHabits.createHabit(participant, {
    templateId: secondTemplate.id,
    templateVersion: secondTemplate.version,
    dailyTarget: 30,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  fakeNow = new Date("2026-11-17T00:00:05+07:00");
  await expect(
    clockedHabits.archiveHabit(participant, {
      habitId: second.id,
      expectedVersion: second.version,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });
});

test("AC-F08-4: pending archive blocks future goal edits and supersedes any existing tomorrow Goal Revision", async () => {
  const template = await studyTemplate();
  let fakeNow = new Date("2026-11-16T12:00:00+07:00");
  const clockedHabits = createHabitService(createDatabase(pool), {
    now: () => fakeNow,
  });

  const { habit: created } = await clockedHabits.createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  });

  // First schedule a Goal Revision for tomorrow (2026-11-17).
  expect(
    await clockedHabits.reviseGoal(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      effectiveFrom: "2026-11-17",
      dailyTarget: 30,
      weekdays: [3],
      requestKey: randomUUID(),
    })
  ).toEqual({ kind: "saved" });

  // Then archive the Habit effective from tomorrow (2026-11-17).
  expect(
    await clockedHabits.archiveHabit(participant, {
      habitId: created.id,
      expectedVersion: created.version + 1,
      archivedFrom: "2026-11-17",
      requestKey: randomUUID(),
    })
  ).toEqual({ kind: "archived", archivedFrom: "2026-11-17" });

  // Today's workspace hides the superseded pending revision and keeps today's goal.
  const todayWorkspace = await clockedHabits.listHabits(participant);
  expect(todayWorkspace.items[0]).toMatchObject({
    id: created.id,
    archivedFrom: "2026-11-17",
    goal: { effectiveFrom: "2026-11-16", dailyTarget: 60 },
    pendingGoal: null,
  });

  // Attempting to revise tomorrow's goal on a pending-archive Habit fails.
  await expect(
    clockedHabits.reviseGoal(participant, {
      habitId: created.id,
      expectedVersion: created.version + 2,
      effectiveFrom: "2026-11-17",
      dailyTarget: 45,
      weekdays: [1, 2, 3],
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  // After advancing to 2026-11-17, the ended Habit still shows its last active goal (60, not 30).
  fakeNow = new Date("2026-11-17T12:00:00+07:00");
  const tomorrowWorkspace = await clockedHabits.listHabits(participant);
  expect(tomorrowWorkspace.items[0]).toMatchObject({
    id: created.id,
    archivedFrom: "2026-11-17",
    goal: { effectiveFrom: "2026-11-16", dailyTarget: 60 },
    pendingGoal: null,
  });

  // Old Goal Revisions remain persisted in the database.
  const revisions = await pool.query<{ effective_from: string }>(
    "SELECT to_char(effective_from, 'YYYY-MM-DD') AS effective_from FROM goal_revision WHERE habit_id = $1 ORDER BY effective_from",
    [created.id]
  );
  expect(revisions.rows.map((row) => row.effective_from)).toEqual([
    "2026-11-16",
    "2026-11-17",
  ]);
});

test("AC-F08-3: pending archive blocks duplicates today and concurrent creates on the end date yield one fresh Habit", async () => {
  const template = await studyTemplate();
  let fakeNow = new Date("2026-11-16T12:00:00+07:00");
  const clockedHabits = createHabitService(createDatabase(pool), {
    now: () => fakeNow,
  });
  const otherClockedHabits = createHabitService(createDatabase(otherPool), {
    now: () => fakeNow,
  });
  const draft = {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  };

  const first = await clockedHabits.createHabit(participant, draft);
  await clockedHabits.archiveHabit(participant, {
    habitId: first.habit.id,
    expectedVersion: first.habit.version,
    archivedFrom: "2026-11-17",
    requestKey: randomUUID(),
  });

  // Still active today, so creating from the same template returns the existing Habit.
  expect(
    await otherClockedHabits.createHabit(participant, draft)
  ).toMatchObject({
    kind: "existing",
    habit: { id: first.habit.id, archivedFrom: "2026-11-17" },
  });

  // On 2026-11-17 (the exclusive end date), concurrent creates yield exactly one new Habit.
  fakeNow = new Date("2026-11-17T08:00:00+07:00");
  const results = await Promise.all([
    clockedHabits.createHabit(participant, { ...draft, dailyTarget: 45 }),
    otherClockedHabits.createHabit(participant, { ...draft, dailyTarget: 45 }),
  ]);
  expect(results.map((result) => result.kind)).toEqual(
    expect.arrayContaining(["created", "existing"])
  );
  expect(results[0]?.habit.id).toBe(results[1]?.habit.id);
  expect(results[0]?.habit.id).not.toBe(first.habit.id);
  expect(results[0]?.habit.startDate).toBe("2026-11-17");

  const workspace = await clockedHabits.listHabits(participant);
  expect(workspace.items).toHaveLength(2);
});

test("AC-F10-1/2: setReminder persists, updates, replays, disables, enforces ownership/role, and rejects archived Habits", async () => {
  const template = await studyTemplate();
  let fakeNow = new Date("2026-11-16T12:00:00+07:00");
  const clockedHabits = createHabitService(createDatabase(pool), {
    now: () => fakeNow,
  });
  const { habit: created } = await clockedHabits.createHabit(participant, {
    templateId: template.id,
    templateVersion: template.version,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  });
  expect(created.reminderTime).toBeNull();

  // Direct ownership and role restrictions
  await expect(
    clockedHabits.setReminder(manager, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "18:00",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    clockedHabits.setReminder(otherParticipant, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "18:00",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 404 });

  // Invalid local time is rejected with 400 and leaves database unchanged
  await expect(
    clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "25:00",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({
    status: 400,
    fieldErrors: {
      reminderTime: "Enter a valid local time (HH:MM, 00:00 to 23:59).",
    },
  });

  // Database CHECK constraint also rejects malformed values
  await expect(
    pool.query("UPDATE habit SET reminder_time = $1 WHERE id = $2", [
      "9:00",
      created.id,
    ])
  ).rejects.toThrow();

  // Set reminder to 18:00 and replay with same requestKey
  const setKey = randomUUID();
  expect(
    await clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "18:00",
      requestKey: setKey,
    })
  ).toEqual({ kind: "saved", reminderTime: "18:00" });
  expect(
    await clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "18:00",
      requestKey: setKey,
    })
  ).toEqual({ kind: "replayed", reminderTime: "18:00" });

  // Stale version fails with 409
  await expect(
    clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: created.version,
      reminderTime: "19:00",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });

  const afterSet = await clockedHabits.listHabits(participant);
  expect(afterSet.items[0]).toMatchObject({
    id: created.id,
    reminderTime: "18:00",
    version: 2,
  });

  // Disable reminder
  expect(
    await clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: 2,
      reminderTime: null,
      requestKey: randomUUID(),
    })
  ).toEqual({ kind: "saved", reminderTime: null });

  const afterDisable = await clockedHabits.listHabits(participant);
  expect(afterDisable.items[0]).toMatchObject({
    id: created.id,
    reminderTime: null,
    version: 3,
  });

  // Archive from tomorrow: today is still active, tomorrow rejects reminder edits
  await clockedHabits.archiveHabit(participant, {
    habitId: created.id,
    expectedVersion: 3,
    archivedFrom: "2026-11-17",
    requestKey: randomUUID(),
  });
  fakeNow = new Date("2026-11-17T08:00:00+07:00");
  await expect(
    clockedHabits.setReminder(participant, {
      habitId: created.id,
      expectedVersion: 4,
      reminderTime: "18:00",
      requestKey: randomUUID(),
    })
  ).rejects.toMatchObject({ status: 409 });
});
