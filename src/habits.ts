import { isValidIsoDate } from "./calendar";
import { parseRequestKey } from "./mutation-request";
import { MEASUREMENT_CEILINGS } from "./templates";
import type { ActivityTemplate } from "./templates";

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export interface GoalDraft {
  dailyTarget: number;
  weekdays: number[];
}

export interface GoalSnapshot extends GoalDraft {
  effectiveFrom: string;
}

export interface HabitDraft extends GoalDraft {
  templateId: string;
}

export interface GoalRevisionDraft extends GoalSnapshot {
  habitId: string;
  expectedVersion: number;
  requestKey: string;
}

export interface Habit {
  id: string;
  template: ActivityTemplate;
  startDate: string;
  archivedFrom: string | null;
  version: number;
  goal: GoalSnapshot;
  pendingGoal: GoalSnapshot | null;
}

export interface HabitWorkspace {
  accountDate: string;
  timezone: string;
  items: Habit[];
}

export interface CreateHabitResult {
  kind: "created" | "existing";
  habit: Habit;
}

export type HabitFieldErrors = Partial<Record<keyof HabitDraft, string>>;
export type GoalFieldErrors = Partial<Record<keyof GoalDraft, string>>;

export interface GoalRevisionSuccess {
  kind: "saved" | "replayed";
}

export type GoalRevisionResponse =
  | GoalRevisionSuccess
  | {
      kind: "invalid" | "conflict";
      message: string;
      fieldErrors: GoalFieldErrors;
    };

export type HabitCreationResponse =
  | CreateHabitResult
  | {
      kind: "invalid";
      message: string;
      fieldErrors: HabitFieldErrors;
    };

const parseWeekdays = (value: unknown): number[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > WEEKDAYS.length
  ) {
    return undefined;
  }
  const weekdays = WEEKDAYS.filter((day) => value.includes(day.value)).map(
    (day) => day.value
  );
  return weekdays.length === value.length ? weekdays : undefined;
};

const isDailyTarget = (
  value: unknown,
  minimum: number,
  ceiling: number
): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= ceiling;

const inputRecord = (input: unknown) =>
  typeof input === "object" && input !== null ? input : {};

export const validateGoalInput = (
  input: unknown,
  template?: ActivityTemplate
):
  | { ok: true; value: GoalDraft }
  | { ok: false; fieldErrors: GoalFieldErrors } => {
  const record = inputRecord(input);
  const dailyTarget = "dailyTarget" in record ? record.dailyTarget : undefined;
  const weekdays = parseWeekdays(
    "weekdays" in record ? record.weekdays : undefined
  );
  const fieldErrors: GoalFieldErrors = {};
  const minimum = template?.entryMinimum ?? 1;
  const ceiling = template
    ? MEASUREMENT_CEILINGS[template.unit]
    : MEASUREMENT_CEILINGS.counts;
  const validTarget = isDailyTarget(dailyTarget, minimum, ceiling);
  if (!validTarget) {
    fieldErrors.dailyTarget = template
      ? `Daily Target must be a whole number from ${minimum.toLocaleString("en-US")} to ${ceiling.toLocaleString("en-US")} ${template.unit}.`
      : "Enter a valid whole-number Daily Target.";
  }
  if (weekdays === undefined) {
    fieldErrors.weekdays = "Choose at least one weekday, with no duplicates.";
  }
  if (!validTarget || weekdays === undefined) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: { dailyTarget, weekdays },
  };
};

export const validateHabitInput = (
  input: unknown,
  template?: ActivityTemplate
):
  | { ok: true; value: HabitDraft }
  | { ok: false; fieldErrors: HabitFieldErrors } => {
  const record = inputRecord(input);
  const templateId = "templateId" in record ? record.templateId : undefined;
  const validTemplate =
    typeof templateId === "string" &&
    templateId.length > 0 &&
    templateId.length <= 200;
  const goal = validateGoalInput(record, template);
  if (!validTemplate || !goal.ok) {
    return {
      ok: false,
      fieldErrors: {
        ...(goal.ok ? {} : goal.fieldErrors),
        ...(validTemplate
          ? {}
          : { templateId: "Select an active Activity Template." }),
      },
    };
  }
  return { ok: true, value: { templateId, ...goal.value } };
};

export const validateGoalRevisionInput = (
  input: unknown
):
  | { ok: true; value: GoalRevisionDraft }
  | { ok: false; message: string; fieldErrors: GoalFieldErrors } => {
  const record = inputRecord(input);
  const habitId = "habitId" in record ? record.habitId : undefined;
  const expectedVersion =
    "expectedVersion" in record ? record.expectedVersion : undefined;
  const effectiveFrom =
    "effectiveFrom" in record ? record.effectiveFrom : undefined;
  const requestKey = parseRequestKey(
    "requestKey" in record ? record.requestKey : undefined
  );
  if (
    typeof habitId !== "string" ||
    habitId.length === 0 ||
    habitId.length > 200 ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !isValidIsoDate(effectiveFrom) ||
    requestKey === undefined
  ) {
    return {
      ok: false,
      message: "Reload your Habit settings and try again.",
      fieldErrors: {},
    };
  }
  const goal = validateGoalInput(record);
  if (!goal.ok) {
    return {
      ok: false,
      message: "Check your Habit settings.",
      fieldErrors: goal.fieldErrors,
    };
  }
  return {
    ok: true,
    value: {
      ...goal.value,
      habitId,
      effectiveFrom,
      expectedVersion,
      requestKey,
    },
  };
};

export const formatSchedule = (weekdays: number[]): string =>
  weekdays.length === 7
    ? "Every day"
    : WEEKDAYS.filter((day) => weekdays.includes(day.value))
        .map((day) => day.label)
        .join(", ");
