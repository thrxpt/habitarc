import { useId } from "react";

import { Checkbox } from "#components/ui/checkbox.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";

import { WEEKDAYS } from "../habits";
import type { GoalFieldErrors } from "../habits";
import { MEASUREMENT_CEILINGS } from "../templates";
import type { ActivityTemplate } from "../templates";

export const HabitGoalFields = ({
  template,
  dailyTarget,
  weekdays,
  fieldErrors,
  pending,
  onDailyTargetChange,
  onWeekdaysChange,
}: {
  template: ActivityTemplate;
  dailyTarget: string;
  weekdays: number[];
  fieldErrors: GoalFieldErrors;
  pending: boolean;
  onDailyTargetChange: (value: string) => void;
  onWeekdaysChange: (value: number[]) => void;
}) => {
  const id = useId();
  return (
    <>
      <Field data-invalid={Boolean(fieldErrors.dailyTarget)}>
        <FieldLabel htmlFor={`${id}-target`}>Daily Target</FieldLabel>
        <Input
          id={`${id}-target`}
          inputMode="numeric"
          value={dailyTarget}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.dailyTarget)}
          aria-describedby={
            fieldErrors.dailyTarget === undefined
              ? `${id}-target-help`
              : `${id}-target-help ${id}-target-error`
          }
          onChange={(event) => {
            onDailyTargetChange(event.target.value);
          }}
        />
        <FieldDescription id={`${id}-target-help`}>
          {template.entryMinimum}–
          {MEASUREMENT_CEILINGS[template.unit].toLocaleString("en-US")}{" "}
          {template.unit} per scheduled day. Your target can exceed the maximum
          for one entry.
        </FieldDescription>
        <FieldError id={`${id}-target-error`}>
          {fieldErrors.dailyTarget}
        </FieldError>
      </Field>
      <FieldSet
        disabled={pending}
        aria-describedby={
          fieldErrors.weekdays === undefined
            ? `${id}-weekdays-help`
            : `${id}-weekdays-help ${id}-weekdays-error`
        }
      >
        <FieldLegend>Schedule</FieldLegend>
        <FieldDescription id={`${id}-weekdays-help`}>
          Choose at least one weekday. Select all seven for every day.
        </FieldDescription>
        <FieldGroup>
          {WEEKDAYS.map((day) => (
            <Field
              key={day.value}
              orientation="horizontal"
              data-invalid={Boolean(fieldErrors.weekdays)}
            >
              <Checkbox
                id={`${id}-day-${day.value}`}
                checked={weekdays.includes(day.value)}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.weekdays)}
                aria-describedby={
                  fieldErrors.weekdays === undefined
                    ? undefined
                    : `${id}-weekdays-error`
                }
                onCheckedChange={(checked) => {
                  onWeekdaysChange(
                    checked
                      ? [...weekdays, day.value]
                      : weekdays.filter((value) => value !== day.value)
                  );
                }}
              />
              <FieldLabel htmlFor={`${id}-day-${day.value}`}>
                {day.label}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
        <FieldError id={`${id}-weekdays-error`}>
          {fieldErrors.weekdays}
        </FieldError>
      </FieldSet>
    </>
  );
};
