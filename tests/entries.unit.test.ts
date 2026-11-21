import { expect, test } from "vite-plus/test";

import {
  addCalendarDays,
  getIsoWeekday,
  isValidIsoDate,
} from "../src/calendar";
import {
  calculateDayProgress,
  calculateStreaks,
  checkEntryDateEligibility,
  getWritableDateBounds,
  resolveGoalForDate,
  validateEntryInput,
} from "../src/entries";
import type { ActivityTemplate } from "../src/templates";

const studyTemplate: ActivityTemplate = {
  id: "study",
  name: "Focused Study",
  description: "Quiet reading",
  unit: "minutes",
  entryMinimum: 5,
  entryMaximum: 45,
  archivedAt: null,
  version: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const weekdayGoal = {
  effectiveFrom: "2026-11-13",
  dailyTarget: 60,
  weekdays: [1, 2, 3, 4, 5],
};

test("AC-F09-1: Friday and Monday form a Streak across a weekend with off-schedule activity", () => {
  expect(
    calculateStreaks({
      startDate: "2026-11-13",
      accountDate: "2026-11-16",
      archivedFrom: null,
      revisions: [weekdayGoal],
      dailyTotals: new Map([
        ["2026-11-13", 60],
        ["2026-11-14", 90],
        ["2026-11-16", 75],
      ]),
    })
  ).toEqual({ current: 2, longest: 2 });
});

test("AC-F09-2: an unfinished scheduled day breaks a Streak only when the account date ends", () => {
  const revisions = [weekdayGoal];
  const streaks = (
    accountDate: string,
    dailyTotals: ReadonlyMap<string, number>
  ) =>
    calculateStreaks({
      startDate: "2026-11-13",
      accountDate,
      archivedFrom: null,
      revisions,
      dailyTotals,
    });
  const friday = new Map([["2026-11-13", 60]]);
  expect(streaks("2026-11-13", new Map())).toEqual({ current: 0, longest: 0 });
  expect(streaks("2026-11-16", friday)).toEqual({ current: 1, longest: 1 });
  expect(streaks("2026-11-17", friday)).toEqual({ current: 0, longest: 1 });
  expect(
    streaks("2026-11-17", new Map([...friday, ["2026-11-16", 60]]))
  ).toEqual({
    current: 2,
    longest: 2,
  });
});

test("AC-F09-3: Streaks apply historical targets and Schedules and stop at the archive boundary", () => {
  const dailyTotals = new Map([
    ["2026-11-12", 100],
    ["2026-11-13", 60],
    ["2026-11-18", 75],
    ["2026-11-19", 90],
  ]);
  const streaks = (accountDate: string) =>
    calculateStreaks({
      startDate: "2026-11-13",
      accountDate,
      archivedFrom: "2026-11-19",
      revisions: [
        { effectiveFrom: "2026-11-14", dailyTarget: 75, weekdays: [3, 4] },
        { effectiveFrom: "2026-11-13", dailyTarget: 60, weekdays: [5] },
      ],
      dailyTotals,
    });

  expect(streaks("2026-11-18")).toEqual({ current: 2, longest: 2 });
  expect(streaks("2026-11-19")).toEqual({ current: null, longest: 2 });
});

test("calendar date utilities handle leap years, month boundaries, and ISO weekdays", () => {
  expect(isValidIsoDate("2026-11-15")).toBe(true);
  expect(isValidIsoDate("2024-02-29")).toBe(true);
  expect(isValidIsoDate("2026-02-29")).toBe(false);
  expect(isValidIsoDate("2026-13-01")).toBe(false);
  expect(isValidIsoDate("2026-11-15T00:00:00Z")).toBe(false);

  expect(addCalendarDays("2026-11-15", -6)).toBe("2026-11-09");
  expect(addCalendarDays("2026-03-02", -3)).toBe("2026-02-27");
  expect(addCalendarDays("2024-03-01", -1)).toBe("2024-02-29");
  expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");

  // 2026-11-15 is a Sunday (7); 2026-11-16 is a Monday (1).
  expect(getIsoWeekday("2026-11-15")).toBe(7);
  expect(getIsoWeekday("2026-11-16")).toBe(1);
});

test("calculateDayProgress handles partial, exact, overachievement, unscheduled, and out-of-period dates", () => {
  const goal = {
    effectiveFrom: "2026-11-01",
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  };

  expect(
    calculateDayProgress({
      date: "2026-11-16",
      dailyTotal: 0,
      goal,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({
    scheduled: true,
    dailyTarget: 60,
    dailyTotal: 0,
    percentage: 0,
    visualFillPercent: 0,
    completed: false,
  });

  expect(
    calculateDayProgress({
      date: "2026-11-16",
      dailyTotal: 50,
      goal,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({
    scheduled: true,
    dailyTarget: 60,
    dailyTotal: 50,
    percentage: 83,
    visualFillPercent: 83,
    completed: false,
  });

  expect(
    calculateDayProgress({
      date: "2026-11-16",
      dailyTotal: 75,
      goal,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({
    scheduled: true,
    dailyTarget: 60,
    dailyTotal: 75,
    percentage: 125,
    visualFillPercent: 100,
    completed: true,
  });

  // Unscheduled Sunday (weekday 7) retains activity with no target percentage or completion credit.
  expect(
    calculateDayProgress({
      date: "2026-11-15",
      dailyTotal: 75,
      goal,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({
    scheduled: false,
    dailyTarget: null,
    dailyTotal: 75,
    percentage: null,
    visualFillPercent: null,
    completed: false,
  });

  // Pre-start and post-archive dates carry no obligation.
  expect(
    calculateDayProgress({
      date: "2026-11-16",
      dailyTotal: 0,
      goal,
      startDate: "2026-11-01",
      archivedFrom: "2026-11-16",
    }).scheduled
  ).toBe(false);
});

test("entry date eligibility enforces today, 6-day lookback, startDate, and exclusive archivedFrom", () => {
  const accountDate = "2026-11-15";
  expect(
    getWritableDateBounds({
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({
    minDate: "2026-11-09",
    maxDate: "2026-11-15",
    writable: true,
  });

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-15",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({ ok: true });

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-09",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: null,
    })
  ).toEqual({ ok: true });

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-08",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: null,
    }).ok
  ).toBe(false);

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-16",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: null,
    }).ok
  ).toBe(false);

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-12",
      accountDate,
      startDate: "2026-11-13",
      archivedFrom: null,
    }).ok
  ).toBe(false);

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-15",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: "2026-11-15",
    }).ok
  ).toBe(false);

  expect(
    checkEntryDateEligibility({
      activityDate: "2026-11-14",
      accountDate,
      startDate: "2026-11-01",
      archivedFrom: "2026-11-15",
    }).ok
  ).toBe(true);
});

test("resolveGoalForDate selects the latest Goal Revision on or before the requested date", () => {
  const revisions = [
    { effectiveFrom: "2026-11-01", dailyTarget: 60, weekdays: [1, 2, 3] },
    { effectiveFrom: "2026-11-10", dailyTarget: 30, weekdays: [1, 2, 3, 4, 5] },
  ];
  expect(resolveGoalForDate(revisions, "2026-10-31")).toBeUndefined();
  expect(resolveGoalForDate(revisions, "2026-11-09")?.dailyTarget).toBe(60);
  expect(resolveGoalForDate(revisions, "2026-11-10")?.dailyTarget).toBe(30);
  expect(resolveGoalForDate(revisions, "2026-11-15")?.dailyTarget).toBe(30);
});

test("AC-F07-3: adding a weekday creates obligations only from the effective date", () => {
  const revisions = [
    { effectiveFrom: "2026-11-01", dailyTarget: 60, weekdays: [1, 2] },
    { effectiveFrom: "2026-11-18", dailyTarget: 30, weekdays: [3] },
  ];
  const progress = (date: string) =>
    calculateDayProgress({
      date,
      dailyTotal: 40,
      goal: resolveGoalForDate(revisions, date),
      startDate: "2026-11-01",
      archivedFrom: null,
    });
  expect(progress("2026-11-11")).toMatchObject({
    scheduled: false,
    dailyTotal: 40,
    completed: false,
  });
  expect(progress("2026-11-17")).toMatchObject({
    scheduled: true,
    dailyTarget: 60,
    completed: false,
  });
  expect(progress("2026-11-18")).toMatchObject({
    scheduled: true,
    dailyTarget: 30,
    completed: true,
  });
});

test("validateEntryInput enforces positive whole numbers within template bounds and valid request keys", () => {
  expect(
    validateEntryInput(
      {
        habitId: "h1",
        activityDate: "2026-11-15",
        amount: 25,
        requestKey: "req-1",
      },
      studyTemplate
    )
  ).toEqual({
    ok: true,
    value: {
      habitId: "h1",
      activityDate: "2026-11-15",
      amount: 25,
      requestKey: "req-1",
    },
  });

  for (const invalidAmount of [0, -5, 4, 46, 25.5, Number.NaN, "25"]) {
    const result = validateEntryInput(
      {
        habitId: "h1",
        activityDate: "2026-11-15",
        amount: invalidAmount,
        requestKey: "req-1",
      },
      studyTemplate
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.amount).toBeDefined();
    }
  }

  const badDateAndKey = validateEntryInput(
    {
      habitId: "h1",
      activityDate: "2026-02-30",
      amount: 25,
      requestKey: "   ",
    },
    studyTemplate
  );
  expect(badDateAndKey.ok).toBe(false);
  if (!badDateAndKey.ok) {
    expect(typeof badDateAndKey.fieldErrors.activityDate).toBe("string");
    expect(typeof badDateAndKey.fieldErrors.requestKey).toBe("string");
  }
});
