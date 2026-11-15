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

export interface HabitDraft {
  templateId: string;
  dailyTarget: number;
  weekdays: number[];
}

export interface Habit {
  id: string;
  template: ActivityTemplate;
  startDate: string;
  archivedFrom: string | null;
  goal: { effectiveFrom: string; dailyTarget: number; weekdays: number[] };
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

export type HabitCreationResponse =
  | CreateHabitResult
  | {
      kind: "invalid";
      message: string;
      fieldErrors: HabitFieldErrors;
    };

const isWeekdays = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= WEEKDAYS.length &&
  value.every(
    (day: unknown) =>
      typeof day === "number" &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= WEEKDAYS.length
  ) &&
  new Set(value).size === value.length;

const isDailyTarget = (
  value: unknown,
  minimum: number,
  ceiling: number
): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= ceiling;

export const validateHabitInput = (
  input: unknown,
  template?: ActivityTemplate
):
  | { ok: true; value: HabitDraft }
  | { ok: false; fieldErrors: HabitFieldErrors } => {
  const record = typeof input === "object" && input !== null ? input : {};
  const templateId = "templateId" in record ? record.templateId : undefined;
  const dailyTarget = "dailyTarget" in record ? record.dailyTarget : undefined;
  const weekdays = "weekdays" in record ? record.weekdays : undefined;
  const fieldErrors: HabitFieldErrors = {};
  if (
    typeof templateId !== "string" ||
    templateId.length === 0 ||
    templateId.length > 200
  ) {
    fieldErrors.templateId = "Select an active Activity Template.";
  }
  const minimum = template?.entryMinimum ?? 1;
  const ceiling = template
    ? MEASUREMENT_CEILINGS[template.unit]
    : MEASUREMENT_CEILINGS.counts;
  if (!isDailyTarget(dailyTarget, minimum, ceiling)) {
    fieldErrors.dailyTarget = `Daily Target must be a whole number from ${minimum.toLocaleString("en-US")} to ${ceiling.toLocaleString("en-US")}${template ? ` ${template.unit}` : ""}.`;
  }
  if (!isWeekdays(weekdays)) {
    fieldErrors.weekdays = "Choose at least one weekday, with no duplicates.";
  }
  if (
    Object.keys(fieldErrors).length > 0 ||
    typeof templateId !== "string" ||
    typeof dailyTarget !== "number" ||
    !isWeekdays(weekdays)
  ) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: {
      templateId,
      dailyTarget,
      weekdays: WEEKDAYS.filter((day) => weekdays.includes(day.value)).map(
        (day) => day.value
      ),
    },
  };
};

export const formatSchedule = (weekdays: number[]): string =>
  weekdays.length === 7
    ? "Every day"
    : WEEKDAYS.filter((day) => weekdays.includes(day.value))
        .map((day) => day.label)
        .join(", ");
