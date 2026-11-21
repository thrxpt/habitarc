import { expect, test } from "vite-plus/test";

import { validateReminderInput } from "../src/habits";
import {
  evaluateReminder,
  getAccountDateRefreshDelay,
  getWorkspaceRefreshDelay,
} from "../src/server/tracking";

test("workspace refresh follows Los Angeles midnight on DST transition days", () => {
  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-03-08",
      observedAt: Date.parse("2026-03-08T08:00:00Z"),
    })
  ).toBe(23 * 60 * 60 * 1000);

  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-11-01",
      observedAt: Date.parse("2026-11-01T07:00:00Z"),
    })
  ).toBe(25 * 60 * 60 * 1000);

  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-11-01",
      observedAt: Date.parse("2026-11-01T09:30:00Z"),
    })
  ).toBe(22.5 * 60 * 60 * 1000);
});

test("validateReminderInput accepts null or strict 24-hour HH:MM local times and rejects invalid values", () => {
  expect(
    validateReminderInput({
      habitId: "habit-1",
      expectedVersion: 1,
      reminderTime: "18:00",
      requestKey: "req-1",
    })
  ).toEqual({
    ok: true,
    value: {
      habitId: "habit-1",
      expectedVersion: 1,
      reminderTime: "18:00",
      requestKey: "req-1",
    },
  });

  expect(
    validateReminderInput({
      habitId: "habit-1",
      expectedVersion: 2,
      reminderTime: null,
      requestKey: "req-2",
    })
  ).toEqual({
    ok: true,
    value: {
      habitId: "habit-1",
      expectedVersion: 2,
      reminderTime: null,
      requestKey: "req-2",
    },
  });

  for (const bad of [
    "24:00",
    "9:00",
    "18:60",
    "18:00:00",
    "",
    "evening",
    1800,
  ]) {
    const result = validateReminderInput({
      habitId: "habit-1",
      expectedVersion: 1,
      reminderTime: bad,
      requestKey: "req-bad",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.reminderTime).toBeDefined();
    }
  }
});

test("evaluateReminder marks due only on active scheduled incomplete current date once local time arrives", () => {
  const base = {
    accountDate: "2026-11-15",
    timezone: "Asia/Bangkok",
    reminderTime: "18:00",
    active: true,
    scheduled: true,
    completed: false,
  };

  // 17:59:59 Asia/Bangkok = 10:59:59Z
  const before = evaluateReminder({
    ...base,
    observedAt: Date.parse("2026-11-15T10:59:59Z"),
  });
  expect(before).toEqual({
    due: false,
    nextDueAt: Date.parse("2026-11-15T11:00:00Z"),
  });

  // 18:00:00 Asia/Bangkok = 11:00:00Z
  expect(
    evaluateReminder({
      ...base,
      observedAt: Date.parse("2026-11-15T11:00:00Z"),
    })
  ).toEqual({ due: true, nextDueAt: null });

  // Completed clears due indicator
  expect(
    evaluateReminder({
      ...base,
      completed: true,
      observedAt: Date.parse("2026-11-15T12:00:00Z"),
    })
  ).toEqual({ due: false, nextDueAt: null });

  // Unscheduled shows no indicator
  expect(
    evaluateReminder({
      ...base,
      scheduled: false,
      observedAt: Date.parse("2026-11-15T12:00:00Z"),
    })
  ).toEqual({ due: false, nextDueAt: null });

  // Archived / inactive shows no indicator
  expect(
    evaluateReminder({
      ...base,
      active: false,
      observedAt: Date.parse("2026-11-15T12:00:00Z"),
    })
  ).toEqual({ due: false, nextDueAt: null });

  // Disabled reminder shows no indicator
  expect(
    evaluateReminder({
      ...base,
      reminderTime: null,
      observedAt: Date.parse("2026-11-15T12:00:00Z"),
    })
  ).toEqual({ due: false, nextDueAt: null });
});

test("evaluateReminder handles midnight and Los Angeles DST spring-forward and fall-back transitions", () => {
  // Midnight boundary in Asia/Bangkok (00:00 on 2026-11-16 = 2026-11-15T17:00:00Z)
  expect(
    evaluateReminder({
      accountDate: "2026-11-16",
      timezone: "Asia/Bangkok",
      reminderTime: "00:00",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-11-15T17:00:00Z"),
    })
  ).toEqual({ due: true, nextDueAt: null });

  // Spring forward 2026-03-08: 02:30 does not exist; compatible disambiguation shifts to 03:30 PDT (10:30Z)
  expect(
    evaluateReminder({
      accountDate: "2026-03-08",
      timezone: "America/Los_Angeles",
      reminderTime: "02:30",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-03-08T10:29:59Z"),
    })
  ).toEqual({ due: false, nextDueAt: Date.parse("2026-03-08T10:30:00Z") });

  expect(
    evaluateReminder({
      accountDate: "2026-03-08",
      timezone: "America/Los_Angeles",
      reminderTime: "02:30",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-03-08T10:30:00Z"),
    })
  ).toEqual({ due: true, nextDueAt: null });

  // Fall back 2026-11-01: 01:30 occurs twice (08:30Z PDT and 09:30Z PST); becomes due once at first occurrence
  expect(
    evaluateReminder({
      accountDate: "2026-11-01",
      timezone: "America/Los_Angeles",
      reminderTime: "01:30",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-11-01T08:29:59Z"),
    })
  ).toEqual({ due: false, nextDueAt: Date.parse("2026-11-01T08:30:00Z") });

  expect(
    evaluateReminder({
      accountDate: "2026-11-01",
      timezone: "America/Los_Angeles",
      reminderTime: "01:30",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-11-01T08:30:00Z"),
    })
  ).toEqual({ due: true, nextDueAt: null });

  expect(
    evaluateReminder({
      accountDate: "2026-11-01",
      timezone: "America/Los_Angeles",
      reminderTime: "01:30",
      active: true,
      scheduled: true,
      completed: false,
      observedAt: Date.parse("2026-11-01T09:30:00Z"),
    })
  ).toEqual({ due: true, nextDueAt: null });
});

test("getWorkspaceRefreshDelay picks the earliest upcoming reminder before midnight", () => {
  // 17:00 local in Asia/Bangkok
  const calendar = {
    accountDate: "2026-11-15",
    timezone: "Asia/Bangkok",
    observedAt: Date.parse("2026-11-15T10:00:00Z"),
  };
  // 18:00 local = 11:00Z (1 hour away), midnight = 17:00Z (7 hours away)
  expect(
    getWorkspaceRefreshDelay(calendar, [
      Date.parse("2026-11-15T13:00:00Z"),
      Date.parse("2026-11-15T11:00:00Z"),
    ])
  ).toBe(60 * 60 * 1000);

  // No upcoming reminders falls back to midnight
  expect(getWorkspaceRefreshDelay(calendar, [])).toBe(7 * 60 * 60 * 1000);
});
