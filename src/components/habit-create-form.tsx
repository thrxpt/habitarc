import { useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import { FieldGroup } from "#components/ui/field.tsx";

import { formatSchedule, validateHabitInput } from "../habits";
import type {
  CreateHabitResult,
  Habit,
  HabitDraft,
  HabitFieldErrors,
  HabitCreationResponse,
} from "../habits";
import { parseWholeNumberInput } from "../templates";
import type { ActivityTemplate } from "../templates";
import { HabitGoalFields } from "./habit-goal-fields";

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
            {result?.kind === "created" && result.habit.id === saved.id
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
        <HabitGoalFields
          template={template}
          dailyTarget={dailyTarget}
          weekdays={weekdays}
          fieldErrors={fieldErrors}
          pending={pending}
          onDailyTargetChange={(value) => {
            setDailyTarget(value);
            setFieldErrors((previous) => ({
              ...previous,
              dailyTarget: undefined,
            }));
          }}
          onWeekdaysChange={(value) => {
            setWeekdays(value);
            setFieldErrors((previous) => ({
              ...previous,
              weekdays: undefined,
            }));
          }}
        />
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
