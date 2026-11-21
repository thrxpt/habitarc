import { useHydrated } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";

import type { ArchiveHabitDraft, ArchiveHabitResponse, Habit } from "../habits";

interface ArchiveConfirmation {
  archivedFrom: string;
  expectedVersion: number;
}

export const HabitArchiveForm = ({
  habit,
  accountDate,
  tomorrow,
  timezone,
  onArchiveHabit,
  onArchived,
}: {
  habit: Habit;
  accountDate: string;
  tomorrow: string;
  timezone: string;
  onArchiveHabit: (draft: ArchiveHabitDraft) => Promise<ArchiveHabitResponse>;
  onArchived?: (archivedFrom: string) => void;
}) => {
  const hydrated = useHydrated();
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reloadLink = useRef<HTMLAnchorElement>(null);
  const returnFocus = useRef(false);
  const [confirm, setConfirm] = useState<ArchiveConfirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState<ArchiveHabitDraft | null>(null);
  const expired =
    confirm !== null && confirm.archivedFrom !== tomorrow && retry === null;

  useEffect(() => {
    const focusInsideForm =
      document.activeElement === document.body ||
      document.activeElement?.closest("form")?.id === formId;
    if (conflict) {
      reloadLink.current?.focus();
    } else if (confirm !== null && !expired) {
      cancelButton.current?.focus();
    } else if (returnFocus.current || (expired && focusInsideForm)) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [confirm, conflict, expired, formId]);

  const resetFeedback = () => {
    setError("");
    setConflict(false);
    setRetry(null);
  };

  const open = () => {
    setConfirm({
      archivedFrom: tomorrow,
      expectedVersion: habit.version,
    });
    resetFeedback();
  };

  const close = () => {
    returnFocus.current = true;
    setConfirm(null);
    resetFeedback();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated || confirm === null || pending || conflict || expired) {
      return;
    }
    setError("");
    const draft: ArchiveHabitDraft = retry ?? {
      habitId: habit.id,
      expectedVersion: confirm.expectedVersion,
      archivedFrom: confirm.archivedFrom,
      requestKey: crypto.randomUUID(),
    };
    setPending(true);
    try {
      const result = await onArchiveHabit(draft);
      setRetry(null);
      if ("message" in result) {
        setError(result.message);
        setConflict(result.kind === "conflict");
      } else {
        setConfirm(null);
        onArchived?.(result.archivedFrom);
      }
    } catch {
      setRetry(draft);
      setError("We couldn’t confirm whether this Habit was archived.");
    }
    setPending(false);
  };

  let confirmLabel = "Confirm archive";
  if (pending) {
    confirmLabel = "Archiving…";
  } else if (retry !== null) {
    confirmLabel = "Retry archive";
  }

  return (
    <div className="mt-3">
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        aria-expanded={confirm !== null}
        aria-controls={confirm === null ? undefined : formId}
        disabled={!hydrated || pending}
        onClick={confirm === null ? open : close}
      >
        {confirm === null ? "Archive Habit" : "Close archive confirmation"}
      </Button>
      {confirm !== null && (
        <form
          id={formId}
          className="bg-card mt-3 flex max-w-md flex-col gap-3 rounded-lg border p-4"
          aria-label={`Archive ${habit.template.name}`}
          aria-busy={pending}
          method="post"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p className="text-muted-foreground text-sm leading-[1.6]">
            Archiving is permanent and cannot be undone. This Habit’s tracking
            period will end on{" "}
            <strong className="text-foreground font-[650]">
              {confirm.archivedFrom}
            </strong>{" "}
            (exclusive) in your Account Timezone ({timezone}). Today (
            {accountDate}) remains active and writable, and your history and
            past Goal Revisions remain available.
          </p>
          {error.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {expired && !conflict && (
            <Alert variant="destructive">
              <AlertDescription>
                This confirmation was for {confirm.archivedFrom}. Close and
                reopen archive to end this Habit on {tomorrow}.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {conflict ? (
              <a ref={reloadLink} className="text-sm underline" href="/">
                Reload workspace
              </a>
            ) : (
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || expired}
              >
                {confirmLabel}
              </Button>
            )}
            <Button
              ref={cancelButton}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
