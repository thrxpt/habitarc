import { addCalendarDays, getIsoWeekday, isValidIsoDate } from "./calendar";
import type { GoalSnapshot } from "./habits";
import { parseRequestKey } from "./mutation-request";
import { MEASUREMENT_CEILINGS } from "./templates";
import type { ActivityTemplate } from "./templates";

export const ENTRY_WINDOW_DAYS = 6;

export interface ActivityEntry {
  id: string;
  habitId: string;
  activityDate: string;
  amount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntryDraft {
  habitId: string;
  activityDate: string;
  amount: number;
  requestKey: string;
}

export interface EntryCorrectionTarget {
  habitId: string;
  entryId: string;
  expectedVersion: number;
  requestKey: string;
}

export type UpdateEntryDraft = EntryCorrectionTarget &
  Pick<ActivityEntryDraft, "activityDate" | "amount">;

export type EntryField = keyof ActivityEntryDraft | keyof EntryCorrectionTarget;

export type EntryFieldErrors = Partial<Record<EntryField, string>>;

export interface RecordEntrySuccess {
  kind: "created" | "replayed";
  entry: ActivityEntry;
  dailyTotal: number;
}

export type EntryMutationFailure = (
  | { kind: "invalid" }
  | { kind: "conflict" }
) & {
  message: string;
  fieldErrors: EntryFieldErrors;
};

export type RecordEntryResponse = RecordEntrySuccess | EntryMutationFailure;

export interface EntryCorrectionSuccess {
  kind: "applied" | "replayed";
}

export type EntryCorrectionResponse =
  | EntryCorrectionSuccess
  | EntryMutationFailure;

export interface DayProgress {
  scheduled: boolean;
  dailyTarget: number | null;
  dailyTotal: number;
  percentage: number | null;
  visualFillPercent: number | null;
  completed: boolean;
}

export interface TodayHabitItem {
  habit: {
    id: string;
    template: ActivityTemplate;
    startDate: string;
    archivedFrom: string | null;
    reminderTime: string | null;
    goal: GoalSnapshot;
  };
  progress: DayProgress;
  reminderDue: boolean;
  entries: ActivityEntry[];
  writableMinDate: string | null;
  writableMaxDate: string | null;
}

export interface TodayWorkspace {
  accountDate: string;
  timezone: string;
  scheduled: TodayHabitItem[];
  unscheduled: TodayHabitItem[];
}

export interface HistoryDay {
  date: string;
  progress: DayProgress;
  entries: ActivityEntry[];
}

interface HabitStreaks {
  current: number | null;
  longest: number;
}

interface HabitTrackingDates {
  accountDate: string;
  startDate: string;
  archivedFrom: string | null;
}

export interface HabitHistory {
  habitId: string;
  template: ActivityTemplate;
  accountDate: string;
  timezone: string;
  writableMinDate: string | null;
  writableMaxDate: string | null;
  streaks: HabitStreaks;
  refreshInMs: number;
  days: HistoryDay[];
  nextBefore: string | null;
}

export const getWritableDateBounds = ({
  accountDate,
  startDate,
  archivedFrom,
}: HabitTrackingDates): {
  minDate: string;
  maxDate: string;
  writable: boolean;
} => {
  const windowStart = addCalendarDays(accountDate, -ENTRY_WINDOW_DAYS);
  const minDate = windowStart > startDate ? windowStart : startDate;
  const periodEnd =
    archivedFrom === null ? accountDate : addCalendarDays(archivedFrom, -1);
  const maxDate = periodEnd < accountDate ? periodEnd : accountDate;
  return {
    minDate,
    maxDate,
    writable: minDate <= maxDate,
  };
};

export const checkEntryDateEligibility = ({
  activityDate,
  accountDate,
  startDate,
  archivedFrom,
}: HabitTrackingDates & {
  activityDate: string;
}): { ok: true } | { ok: false; message: string } => {
  if (activityDate > accountDate) {
    return {
      ok: false,
      message: "Future dates cannot be recorded.",
    };
  }
  const windowStart = addCalendarDays(accountDate, -ENTRY_WINDOW_DAYS);
  if (activityDate < windowStart) {
    return {
      ok: false,
      message: `Entries can only be recorded for today (${accountDate}) or the previous ${ENTRY_WINDOW_DAYS} days.`,
    };
  }
  if (activityDate < startDate) {
    return {
      ok: false,
      message: `Entries cannot be recorded before this Habit started (${startDate}).`,
    };
  }
  if (archivedFrom !== null && activityDate >= archivedFrom) {
    return {
      ok: false,
      message: `Entries cannot be recorded on or after this Habit’s archive date (${archivedFrom}).`,
    };
  }
  return { ok: true };
};

export const resolveGoalForDate = (
  revisions: readonly GoalSnapshot[],
  date: string
): GoalSnapshot | undefined => {
  let applicable: GoalSnapshot | undefined;
  for (const revision of revisions) {
    if (
      revision.effectiveFrom <= date &&
      (applicable === undefined ||
        revision.effectiveFrom > applicable.effectiveFrom)
    ) {
      applicable = revision;
    }
  }
  return applicable;
};

export const calculateDayProgress = ({
  date,
  dailyTotal,
  goal,
  startDate,
  archivedFrom,
}: {
  date: string;
  dailyTotal: number;
  goal: GoalSnapshot | undefined;
  startDate: string;
  archivedFrom: string | null;
}): DayProgress => {
  const insidePeriod =
    date >= startDate && (archivedFrom === null || date < archivedFrom);
  const isScheduled =
    insidePeriod &&
    goal !== undefined &&
    goal.weekdays.includes(getIsoWeekday(date));
  if (!isScheduled || goal === undefined) {
    return {
      scheduled: false,
      dailyTarget: null,
      dailyTotal,
      percentage: null,
      visualFillPercent: null,
      completed: false,
    };
  }
  const percentage = Math.floor((dailyTotal * 100) / goal.dailyTarget);
  return {
    scheduled: true,
    dailyTarget: goal.dailyTarget,
    dailyTotal,
    percentage,
    visualFillPercent: Math.min(100, percentage),
    completed: dailyTotal >= goal.dailyTarget,
  };
};

export const calculateStreaks = ({
  startDate,
  accountDate,
  archivedFrom,
  revisions,
  dailyTotals,
}: HabitTrackingDates & {
  revisions: readonly GoalSnapshot[];
  dailyTotals: ReadonlyMap<string, number>;
}): HabitStreaks => {
  const sortedRevisions = [...revisions];
  // eslint-disable-next-line unicorn/no-array-sort -- The ES2022 target has no toSorted; this array is a local copy.
  sortedRevisions.sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  );
  const goals = sortedRevisions.values();
  const archived = archivedFrom !== null && archivedFrom <= accountDate;
  const lastDate = archived ? addCalendarDays(archivedFrom, -1) : accountDate;
  let nextGoal = goals.next().value;
  let goal: GoalSnapshot | undefined;
  let current = 0;
  let longest = 0;

  for (
    let date = startDate;
    date <= lastDate;
    date = addCalendarDays(date, 1)
  ) {
    while (nextGoal !== undefined && nextGoal.effectiveFrom <= date) {
      goal = nextGoal;
      nextGoal = goals.next().value;
    }
    const progress = calculateDayProgress({
      date,
      goal,
      dailyTotal: dailyTotals.get(date) ?? 0,
      startDate,
      archivedFrom,
    });
    if (progress.completed) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (progress.scheduled && date < accountDate) {
      current = 0;
    }
  }

  return { current: archived ? null : current, longest };
};

const isWholePositiveAmount = (
  value: unknown,
  minimum: number,
  maximum: number
): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= maximum;

const readField = (input: unknown, key: string): unknown => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(input, key)?.value;
};

const validateHabitIdField = (
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } => {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    return { ok: false, error: "Select a Habit." };
  }
  return { ok: true, value };
};

const validateAmountField = (
  value: unknown,
  template?: ActivityTemplate
): { ok: true; value: number } | { ok: false; error: string } => {
  const minimum = template?.entryMinimum ?? 1;
  const maximum = template?.entryMaximum ?? MEASUREMENT_CEILINGS.counts;
  if (isWholePositiveAmount(value, minimum, maximum)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: template
      ? `Amount must be a whole number from ${minimum.toLocaleString("en-US")} to ${maximum.toLocaleString("en-US")} ${template.unit}.`
      : "Amount must be a positive whole number.",
  };
};

const validateRequestKeyField = (
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } => {
  const requestKey = parseRequestKey(value);
  if (requestKey === undefined) {
    return { ok: false, error: "A valid request key is required." };
  }
  return { ok: true, value: requestKey };
};

export const validateEntryInput = (
  input: unknown,
  template?: ActivityTemplate
):
  | { ok: true; value: ActivityEntryDraft }
  | { ok: false; fieldErrors: EntryFieldErrors } => {
  const rawHabitId = readField(input, "habitId");
  const rawActivityDate = readField(input, "activityDate");
  const rawAmount = readField(input, "amount");
  const rawRequestKey = readField(input, "requestKey");

  const fieldErrors: EntryFieldErrors = {};
  const habitResult = validateHabitIdField(rawHabitId);
  if (!habitResult.ok) {
    fieldErrors.habitId = habitResult.error;
  }

  if (!isValidIsoDate(rawActivityDate)) {
    fieldErrors.activityDate = "Enter a valid calendar date (YYYY-MM-DD).";
  }

  const amountResult = validateAmountField(rawAmount, template);
  if (!amountResult.ok) {
    fieldErrors.amount = amountResult.error;
  }

  const keyResult = validateRequestKeyField(rawRequestKey);
  if (!keyResult.ok) {
    fieldErrors.requestKey = keyResult.error;
  }

  if (
    !habitResult.ok ||
    !isValidIsoDate(rawActivityDate) ||
    !amountResult.ok ||
    !keyResult.ok
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      habitId: habitResult.value,
      activityDate: rawActivityDate,
      amount: amountResult.value,
      requestKey: keyResult.value,
    },
  };
};

export const validateCorrectionTarget = (
  input: unknown
):
  | { ok: true; value: EntryCorrectionTarget }
  | { ok: false; fieldErrors: EntryFieldErrors } => {
  const habitId = validateHabitIdField(readField(input, "habitId"));
  const entryId = readField(input, "entryId");
  const expectedVersion = readField(input, "expectedVersion");
  const requestKey = validateRequestKeyField(readField(input, "requestKey"));
  const validEntryId =
    typeof entryId === "string" && entryId.length > 0 && entryId.length <= 200;
  const validVersion =
    typeof expectedVersion === "number" &&
    Number.isSafeInteger(expectedVersion) &&
    expectedVersion >= 1;
  if (!habitId.ok || !validEntryId || !validVersion || !requestKey.ok) {
    return {
      ok: false,
      fieldErrors: {
        habitId: habitId.ok ? undefined : habitId.error,
        entryId: validEntryId ? undefined : "Select an Activity Entry.",
        expectedVersion: validVersion
          ? undefined
          : "Refresh history and try again.",
        requestKey: requestKey.ok ? undefined : requestKey.error,
      },
    };
  }
  return {
    ok: true,
    value: {
      habitId: habitId.value,
      entryId,
      expectedVersion,
      requestKey: requestKey.value,
    },
  };
};

export const validateHistoryQuery = (
  input: unknown
):
  | { ok: true; habitId: string; before: string | undefined }
  | { ok: false; message: string } => {
  const habitId = validateHabitIdField(readField(input, "habitId"));
  if (!habitId.ok) {
    return { ok: false, message: habitId.error };
  }
  const before = readField(input, "before");
  if (before !== undefined && !isValidIsoDate(before)) {
    return { ok: false, message: "Enter a valid history date." };
  }
  return { ok: true, habitId: habitId.value, before };
};
