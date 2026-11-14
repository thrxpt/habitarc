import { useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
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

import { formatSchedule, validateHabitInput, WEEKDAYS } from "../habits";
import type {
  CreateHabitResult,
  Habit,
  HabitDraft,
  HabitFieldErrors,
  HabitCreationResponse,
} from "../habits";
import { MEASUREMENT_CEILINGS, parseWholeNumberInput } from "../templates";
import type { ActivityTemplate } from "../templates";

export const HabitCreateForm = ({
  template,
  existingHabit,
  accountDate,
  timezone,
  onCreateHabit,
}: {
  template: ActivityTemplate;
  existingHabit?: Habit;
  accountDate: string;
  timezone: string;
  onCreateHabit?: (draft: HabitDraft) => Promise<HabitCreationResponse>;
}) => {
  const [dailyTarget, setDailyTarget] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [fieldErrors, setFieldErrors] = useState<HabitFieldErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CreateHabitResult | null>(null);
  const saved = existingHabit ?? result?.habit;

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setError("");
    const validation = validateHabitInput(
      {
        templateId: template.id,
        dailyTarget: parseWholeNumberInput(dailyTarget),
        weekdays,
      },
      template
    );
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      return;
    }
    if (!onCreateHabit) {
      setError(
        "Habit creation is unavailable right now. Please reload and try again."
      );
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const response = await onCreateHabit(validation.value);
      if (response.kind === "invalid") {
        setFieldErrors(response.fieldErrors);
        setError(response.message);
      } else {
        setResult(response);
      }
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "We couldn’t save your Habit. Please try again."
      );
    }
    setPending(false);
  };

  if (saved) {
    return (
      <Alert className="mt-6">
        <AlertDescription>
          <p>
            {!existingHabit && result?.kind === "created"
              ? "Your Habit is saved."
              : "You already have an active Habit for this Activity Template."}
          </p>
          <p>
            {saved.goal.dailyTarget.toLocaleString("en-US")}{" "}
            {saved.template.unit} · {formatSchedule(saved.goal.weekdays)}
          </p>
          <p>
            Started {saved.startDate}.{" "}
            {saved.archivedFrom === null
              ? ""
              : `Archive begins ${saved.archivedFrom}.`}
          </p>
          <a href={`#habit-${saved.id}`}>View your Habit</a>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className="mt-6"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
      aria-label={`Start ${template.name} Habit`}
    >
      <h3 className="mb-3 text-lg font-[650]">Start your Habit</h3>
      <p className="text-muted-foreground mb-6 text-sm">
        Starts on your account date, {accountDate} ({timezone}).
      </p>
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.dailyTarget)}>
          <FieldLabel htmlFor="habit-target">Daily Target</FieldLabel>
          <Input
            id="habit-target"
            inputMode="numeric"
            value={dailyTarget}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.dailyTarget)}
            aria-describedby="habit-target-help habit-target-error"
            onChange={(event) => {
              setDailyTarget(event.target.value);
              setFieldErrors((previous) => ({
                ...previous,
                dailyTarget: undefined,
              }));
            }}
          />
          <FieldDescription id="habit-target-help">
            {template.entryMinimum}–
            {MEASUREMENT_CEILINGS[template.unit].toLocaleString("en-US")}{" "}
            {template.unit} per scheduled day. Your target can exceed the
            maximum for one entry.
          </FieldDescription>
          <FieldError id="habit-target-error">
            {fieldErrors.dailyTarget}
          </FieldError>
        </Field>
        <FieldSet
          disabled={pending}
          aria-describedby="habit-weekdays-help habit-weekdays-error"
        >
          <FieldLegend>Schedule</FieldLegend>
          <FieldDescription id="habit-weekdays-help">
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
                  id={`habit-day-${day.value}`}
                  checked={weekdays.includes(day.value)}
                  aria-invalid={Boolean(fieldErrors.weekdays)}
                  aria-describedby="habit-weekdays-error"
                  onCheckedChange={(checked) => {
                    setWeekdays((previous) =>
                      checked
                        ? [...previous, day.value]
                        : previous.filter((value) => value !== day.value)
                    );
                    setFieldErrors((previous) => ({
                      ...previous,
                      weekdays: undefined,
                    }));
                  }}
                />
                <FieldLabel htmlFor={`habit-day-${day.value}`}>
                  {day.label}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
          <FieldError id="habit-weekdays-error">
            {fieldErrors.weekdays}
          </FieldError>
        </FieldSet>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Starting Habit…" : "Start Habit"}
        </Button>
      </FieldGroup>
    </form>
  );
};
