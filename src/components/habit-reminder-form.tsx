import { useHydrated } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";

import { INVALID_REMINDER_TIME_MESSAGE, isValidReminderTime } from "../habits";
import type {
  Habit,
  ReminderDraft,
  ReminderFieldErrors,
  SetReminderResponse,
} from "../habits";

interface ReminderEditor {
  reminderTime: string;
  expectedVersion: number;
}

const ReminderFormActions = ({
  hasReminder,
  pending,
  retry,
  onDisable,
}: {
  hasReminder: boolean;
  pending: boolean;
  retry: ReminderDraft | null;
  onDisable: () => void;
}) => {
  if (retry?.reminderTime === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={onDisable}>
          {pending ? "Saving…" : "Retry disable"}
        </Button>
      </div>
    );
  }
  let saveLabel = "Save Reminder";
  if (pending) {
    saveLabel = "Saving…";
  } else if (retry !== null) {
    saveLabel = "Retry save";
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending}>
        {saveLabel}
      </Button>
      {retry === null && hasReminder && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onDisable}
        >
          Disable Reminder
        </Button>
      )}
    </div>
  );
};

export const HabitReminderForm = ({
  habit,
  timezone,
  onSetReminder,
}: {
  habit: Habit;
  timezone: string;
  onSetReminder: (draft: ReminderDraft) => Promise<SetReminderResponse>;
}) => {
  const hydrated = useHydrated();
  const formId = useId();
  const timeId = useId();
  const helpId = useId();
  const errorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const reloadLink = useRef<HTMLAnchorElement>(null);
  const [edit, setEdit] = useState<ReminderEditor | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReminderFieldErrors>({});
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState<ReminderDraft | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (conflict) {
      reloadLink.current?.focus();
    } else if (notice) {
      trigger.current?.focus();
    }
  }, [conflict, notice]);

  const toggle = () => {
    if (edit !== null) {
      setEdit(null);
      return;
    }
    setEdit({
      reminderTime: habit.reminderTime ?? "",
      expectedVersion: habit.version,
    });
    setFieldErrors({});
    setError("");
    setConflict(false);
    setRetry(null);
    setNotice("");
  };

  const persist = async (reminderTime: string | null) => {
    if (!hydrated || edit === null || pending || conflict) {
      return;
    }
    setError("");
    setFieldErrors({});
    const draft: ReminderDraft =
      retry !== null && retry.reminderTime === reminderTime
        ? retry
        : {
            habitId: habit.id,
            expectedVersion: edit.expectedVersion,
            reminderTime,
            requestKey: crypto.randomUUID(),
          };
    setPending(true);
    try {
      const result = await onSetReminder(draft);
      setRetry(null);
      if ("message" in result) {
        setFieldErrors(result.fieldErrors);
        setError(result.message);
        setConflict(result.kind === "conflict");
      } else {
        setNotice(
          result.reminderTime === null
            ? "Reminder disabled."
            : `Reminder saved for ${result.reminderTime} (${timezone}).`
        );
        setEdit(null);
      }
    } catch {
      setRetry(draft);
      setError("We couldn’t confirm whether your Reminder was saved.");
    }
    setPending(false);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated || edit === null || pending || conflict) {
      return;
    }
    if (retry !== null) {
      await persist(retry.reminderTime);
      return;
    }
    const trimmed = edit.reminderTime.trim();
    if (!isValidReminderTime(trimmed)) {
      setFieldErrors({
        reminderTime: INVALID_REMINDER_TIME_MESSAGE,
      });
      return;
    }
    await persist(trimmed);
  };

  const locked = pending || conflict || retry !== null;
  let toggleLabel = "Close Reminder settings";
  if (edit === null) {
    toggleLabel =
      habit.reminderTime === null ? "Set Reminder" : "Edit Reminder";
  }

  return (
    <div className="mt-3">
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-expanded={edit !== null}
        aria-controls={edit === null ? undefined : formId}
        disabled={!hydrated || pending}
        onClick={toggle}
      >
        {toggleLabel}
      </Button>
      {notice.length > 0 && (
        <output className="mt-3 block text-sm">{notice}</output>
      )}
      {edit !== null && (
        <form
          id={formId}
          className="mt-4 max-w-md"
          aria-label={`Reminder settings for ${habit.template.name}`}
          aria-busy={pending}
          method="post"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p className="text-muted-foreground mb-4 text-sm">
            Choose an optional local time in your Account Timezone ({timezone}).
            Reminders show an in-app due indicator only while Habitarc is open —
            no email, push, background delivery, or snooze.
          </p>
          <FieldGroup>
            <Field
              data-disabled={locked}
              data-invalid={fieldErrors.reminderTime !== undefined}
            >
              <FieldLabel htmlFor={timeId}>
                Reminder time ({timezone})
              </FieldLabel>
              <Input
                id={timeId}
                name="reminderTime"
                type="time"
                value={edit.reminderTime}
                disabled={locked}
                aria-invalid={fieldErrors.reminderTime !== undefined}
                aria-describedby={
                  fieldErrors.reminderTime === undefined
                    ? helpId
                    : `${helpId} ${errorId}`
                }
                onChange={(event) => {
                  setEdit({ ...edit, reminderTime: event.target.value });
                  setFieldErrors({});
                  setError("");
                }}
              />
              <FieldDescription id={helpId}>
                24-hour local time (HH:MM) in {timezone}.
              </FieldDescription>
              {fieldErrors.reminderTime !== undefined && (
                <FieldError id={errorId}>{fieldErrors.reminderTime}</FieldError>
              )}
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {conflict ? (
              <a ref={reloadLink} className="text-sm underline" href="/">
                Reload workspace
              </a>
            ) : (
              <ReminderFormActions
                hasReminder={habit.reminderTime !== null}
                pending={pending}
                retry={retry}
                onDisable={() => {
                  void persist(null);
                }}
              />
            )}
          </FieldGroup>
        </form>
      )}
    </div>
  );
};
