import { useHydrated } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import { FieldGroup } from "#components/ui/field.tsx";

import { validateGoalInput } from "../habits";
import type {
  GoalFieldErrors,
  GoalRevisionDraft,
  GoalRevisionResponse,
  Habit,
} from "../habits";
import { parseWholeNumberInput } from "../templates";
import { HabitGoalFields } from "./habit-goal-fields";

interface GoalEditor {
  dailyTarget: string;
  weekdays: number[];
  effectiveFrom: string;
  expectedVersion: number;
}

export const GoalRevisionForm = ({
  habit,
  tomorrow,
  timezone,
  onReviseGoal,
}: {
  habit: Habit;
  tomorrow: string;
  timezone: string;
  onReviseGoal: (draft: GoalRevisionDraft) => Promise<GoalRevisionResponse>;
}) => {
  const hydrated = useHydrated();
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const reloadLink = useRef<HTMLAnchorElement>(null);
  const [edit, setEdit] = useState<GoalEditor | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<GoalFieldErrors>({});
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState<GoalRevisionDraft | null>(null);
  const [notice, setNotice] = useState("");
  const expired =
    edit !== null && edit.effectiveFrom !== tomorrow && retry === null;

  useEffect(() => {
    if (conflict) {
      reloadLink.current?.focus();
    } else if (
      notice ||
      (expired &&
        (document.activeElement === document.body ||
          document.activeElement?.closest("form")?.id === formId))
    ) {
      trigger.current?.focus();
    }
  }, [conflict, expired, formId, notice]);

  const toggle = () => {
    if (edit !== null) {
      setEdit(null);
      return;
    }
    const goal = habit.pendingGoal ?? habit.goal;
    setEdit({
      dailyTarget: String(goal.dailyTarget),
      weekdays: goal.weekdays,
      effectiveFrom: tomorrow,
      expectedVersion: habit.version,
    });
    setFieldErrors({});
    setError("");
    setConflict(false);
    setRetry(null);
    setNotice("");
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated || edit === null || pending || conflict || expired) {
      return;
    }
    setError("");
    const goal = validateGoalInput(
      { ...edit, dailyTarget: parseWholeNumberInput(edit.dailyTarget) },
      habit.template
    );
    if (!goal.ok) {
      setFieldErrors(goal.fieldErrors);
      return;
    }
    setFieldErrors({});
    const draft = retry ?? {
      ...goal.value,
      habitId: habit.id,
      effectiveFrom: edit.effectiveFrom,
      expectedVersion: edit.expectedVersion,
      requestKey: crypto.randomUUID(),
    };
    setPending(true);
    try {
      const result = await onReviseGoal(draft);
      setRetry(null);
      if ("message" in result) {
        setFieldErrors(result.fieldErrors);
        setError(result.message);
        setConflict(result.kind === "conflict");
      } else {
        setNotice(`Goal settings saved for ${draft.effectiveFrom}.`);
        setEdit(null);
      }
    } catch {
      setRetry(draft);
      setError("We couldn’t confirm whether your goal settings were saved.");
    }
    setPending(false);
  };

  const locked = pending || conflict || expired || retry !== null;
  let saveLabel = "Save tomorrow’s settings";
  if (pending) {
    saveLabel = "Saving…";
  } else if (retry !== null) {
    saveLabel = "Retry save";
  }

  return (
    <div className="mt-4">
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-expanded={edit !== null}
        aria-controls={edit === null ? undefined : formId}
        disabled={!hydrated || pending}
        onClick={toggle}
      >
        {edit === null ? "Edit goal settings" : "Close goal settings"}
      </Button>
      <output className="block text-sm not-empty:mt-3">{notice}</output>
      {edit !== null && (
        <form
          id={formId}
          className="mt-4 max-w-md"
          aria-label={`Edit goal settings for ${habit.template.name}`}
          method="post"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p className="text-muted-foreground mb-4 text-sm">
            Changes begin on {edit.effectiveFrom} in your Account Timezone (
            {timezone}).
          </p>
          <FieldGroup>
            <HabitGoalFields
              template={habit.template}
              dailyTarget={edit.dailyTarget}
              weekdays={edit.weekdays}
              fieldErrors={fieldErrors}
              pending={locked}
              onDailyTargetChange={(dailyTarget) => {
                setEdit({ ...edit, dailyTarget });
                setFieldErrors((previous) => ({
                  ...previous,
                  dailyTarget: undefined,
                }));
              }}
              onWeekdaysChange={(weekdays) => {
                setEdit({ ...edit, weekdays });
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
            {expired && !conflict && (
              <Alert variant="destructive">
                <AlertDescription>
                  This draft was for {edit.effectiveFrom}. Close and reopen goal
                  settings to edit {tomorrow}.
                </AlertDescription>
              </Alert>
            )}
            {conflict ? (
              <a ref={reloadLink} className="text-sm underline" href="/">
                Reload workspace
              </a>
            ) : (
              <Button type="submit" disabled={pending || expired}>
                {saveLabel}
              </Button>
            )}
          </FieldGroup>
        </form>
      )}
    </div>
  );
};
