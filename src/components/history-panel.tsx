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

import type {
  ActivityEntry,
  EntryCorrectionResponse,
  EntryCorrectionTarget,
  EntryFieldErrors,
  HabitHistory,
  UpdateEntryDraft,
} from "../entries";
import { formatTemplateRange, parseWholeNumberInput } from "../templates";

type CorrectionAction = "edit" | "delete";

interface Correction {
  entry: ActivityEntry;
  action: CorrectionAction;
}

type SubmitCorrection = (
  draft: EntryCorrectionTarget | UpdateEntryDraft
) => Promise<EntryCorrectionResponse>;

const EntryCorrectionForm = ({
  history,
  correction,
  onSubmit,
  onRefresh,
  onClose,
  onApplied,
}: {
  history: HabitHistory;
  correction: Correction;
  onSubmit: SubmitCorrection;
  onRefresh: () => Promise<void>;
  onClose: (message?: string) => void;
  onApplied: (message: string) => void;
}) => {
  const { entry, action } = correction;
  const { template } = history;
  const editing = action === "edit";
  const formId = useId();
  const amountInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const amountHelpId = `${formId}-amount-help`;
  const amountErrorId = `${formId}-amount-error`;
  const dateErrorId = `${formId}-date-error`;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<EntryFieldErrors>({});
  const [retryKey, setRetryKey] = useState<string | null>(null);

  useEffect(() => {
    const initialFocus = editing ? amountInput.current : cancelButton.current;
    initialFocus?.focus();
  }, [editing]);

  const clearErrors = () => {
    setError("");
    setFieldErrors({});
    setRetryKey(null);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setError("");
    setFieldErrors({});
    const requestKey = retryKey ?? crypto.randomUUID();
    const target = {
      habitId: entry.habitId,
      entryId: entry.id,
      expectedVersion: entry.version,
      requestKey,
    };
    let draft: EntryCorrectionTarget | UpdateEntryDraft = target;
    if (editing) {
      const form = new FormData(event.currentTarget);
      const value = form.get("amount");
      const amount =
        typeof value === "string" ? parseWholeNumberInput(value) : undefined;
      const date = form.get("activityDate");
      if (amount === undefined || typeof date !== "string") {
        setFieldErrors({ amount: "Enter a whole number." });
        return;
      }
      draft = { ...target, activityDate: date, amount };
    }

    setPending(true);
    try {
      const result = await onSubmit(draft);
      if (result.kind === "invalid" || result.kind === "conflict") {
        setError(result.message);
        setFieldErrors(result.fieldErrors);
        setRetryKey(null);
      } else {
        onApplied(editing ? "Entry updated." : "Entry deleted.");
      }
    } catch {
      setRetryKey(requestKey);
      setError("We couldn’t confirm the change. Retry to check it safely.");
    }
    setPending(false);
  };

  const refresh = async () => {
    setPending(true);
    try {
      await onRefresh();
      onClose("History refreshed.");
    } catch {
      setError("We couldn’t refresh history. Please try again.");
    }
    setPending(false);
  };

  const submitLabel = editing ? "Save changes" : "Confirm deletion";
  const retryLabel = editing ? "Retry save" : "Retry deletion";
  return (
    <form
      className="bg-card mt-3 rounded-lg border p-4"
      method="post"
      aria-busy={pending}
      onSubmit={(event) => {
        void submit(event);
      }}
      aria-label={editing ? "Edit Activity Entry" : "Delete Activity Entry"}
    >
      <FieldGroup>
        {editing ? (
          <>
            <Field
              data-disabled={pending}
              data-invalid={fieldErrors.amount !== undefined}
            >
              <FieldLabel htmlFor={`${formId}-amount`}>
                Amount ({template.unit})
              </FieldLabel>
              <Input
                ref={amountInput}
                id={`${formId}-amount`}
                type="number"
                name="amount"
                defaultValue={entry.amount}
                min={template.entryMinimum}
                max={template.entryMaximum}
                step={1}
                required
                disabled={pending}
                aria-invalid={fieldErrors.amount !== undefined}
                aria-describedby={
                  fieldErrors.amount === undefined
                    ? amountHelpId
                    : `${amountHelpId} ${amountErrorId}`
                }
                onChange={clearErrors}
              />
              <FieldDescription id={amountHelpId}>
                Each entry can be {formatTemplateRange(template)}.
              </FieldDescription>
              {fieldErrors.amount !== undefined && (
                <FieldError id={amountErrorId}>{fieldErrors.amount}</FieldError>
              )}
            </Field>
            <Field
              data-disabled={pending}
              data-invalid={fieldErrors.activityDate !== undefined}
            >
              <FieldLabel htmlFor={`${formId}-date`}>Activity date</FieldLabel>
              <Input
                id={`${formId}-date`}
                type="date"
                name="activityDate"
                defaultValue={entry.activityDate}
                min={history.writableMinDate ?? undefined}
                max={history.writableMaxDate ?? undefined}
                required
                disabled={pending}
                aria-invalid={fieldErrors.activityDate !== undefined}
                aria-describedby={
                  fieldErrors.activityDate === undefined
                    ? undefined
                    : dateErrorId
                }
                onChange={clearErrors}
              />
              {fieldErrors.activityDate !== undefined &&
                fieldErrors.activityDate !== error && (
                  <FieldError id={dateErrorId}>
                    {fieldErrors.activityDate}
                  </FieldError>
                )}
            </Field>
          </>
        ) : (
          <p>
            Delete the entry for {entry.amount.toLocaleString("en-US")}{" "}
            {template.unit} on {entry.activityDate}?
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription
              id={fieldErrors.activityDate === error ? dateErrorId : undefined}
            >
              {error}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant={editing ? "default" : "destructive"}
            disabled={pending}
          >
            {retryKey === null ? submitLabel : retryLabel}
          </Button>
          <Button
            ref={cancelButton}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onClose();
            }}
          >
            Cancel
          </Button>
          {error && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                void refresh();
              }}
            >
              Refresh history
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
};

export const HistoryPanel = ({
  history,
  onSubmit,
  onRefresh,
}: {
  history: HabitHistory;
  onSubmit: SubmitCorrection;
  onRefresh: () => Promise<void>;
}) => {
  const hydrated = useHydrated();
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [notice, setNotice] = useState("");
  const [refreshState, setRefreshState] = useState<
    "current" | "loading" | "failed"
  >("current");
  const historyList = useRef<HTMLDivElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<{
    button: HTMLButtonElement;
    date: string;
  } | null>(null);
  const { unit } = history.template;

  useEffect(() => {
    const focus = returnFocus.current;
    if (focus === null || correction !== null || refreshState === "loading") {
      return;
    }
    if (refreshState === "failed") {
      refreshButton.current?.focus();
      return;
    }
    returnFocus.current = null;
    if (focus.button.isConnected && !focus.button.disabled) {
      focus.button.focus();
      return;
    }
    const heading = historyList.current?.querySelector<HTMLHeadingElement>(
      `#history-${focus.date}`
    );
    (heading ?? historyList.current)?.focus();
  }, [correction, refreshState]);

  const open = (
    entry: ActivityEntry,
    action: CorrectionAction,
    button: HTMLButtonElement
  ) => {
    returnFocus.current = { button, date: entry.activityDate };
    setNotice("");
    setCorrection({ entry, action });
  };

  const reloadConfirmedHistory = async () => {
    setRefreshState("loading");
    try {
      await onRefresh();
      setRefreshState("current");
    } catch {
      setRefreshState("failed");
    }
  };

  return (
    <div className="max-w-2xl" ref={historyList} tabIndex={-1}>
      <p className="text-muted-foreground mb-6 text-sm">
        Account date {history.accountDate} ({history.timezone})
      </p>
      {history.writableMinDate !== null && history.writableMaxDate !== null && (
        <p className="mb-6 text-sm">
          You can change entries dated {history.writableMinDate} through{" "}
          {history.writableMaxDate}.
        </p>
      )}
      <output className={notice ? "mb-4 block text-sm font-medium" : "sr-only"}>
        {notice}
      </output>
      {refreshState === "failed" && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            History couldn’t reload. Refresh to see the latest totals.
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            ref={refreshButton}
            onClick={() => {
              void reloadConfirmedHistory();
            }}
          >
            Refresh history
          </Button>
        </Alert>
      )}
      {history.days.length === 0 && <p>No Activity Entries in this history.</p>}
      <div className="divide-y border-y" aria-busy={refreshState === "loading"}>
        {history.days.map(({ date, entries, progress }) => {
          const writable =
            history.writableMinDate !== null &&
            history.writableMaxDate !== null &&
            date >= history.writableMinDate &&
            date <= history.writableMaxDate;
          const total = progress.dailyTotal.toLocaleString("en-US");
          const status =
            date === history.accountDate ? "In progress" : "Missed";
          return (
            <section
              key={date}
              aria-labelledby={`history-${date}`}
              className="py-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id={`history-${date}`}
                  tabIndex={-1}
                  className="text-lg font-semibold"
                >
                  <time dateTime={date}>{date}</time>
                </h2>
                {!writable && (
                  <p className="text-muted-foreground text-sm">Read-only</p>
                )}
              </div>
              {progress.dailyTarget === null ? (
                <p className="mt-2 text-sm">
                  {total} {unit} recorded · Off schedule
                </p>
              ) : (
                <p className="mt-2 text-sm">
                  {total} / {progress.dailyTarget.toLocaleString("en-US")}{" "}
                  {unit} · {progress.percentage}% ·{" "}
                  {progress.completed ? "Completed" : status}
                </p>
              )}
              {entries.length > 0 && (
                <ul
                  className="mt-3 flex flex-col gap-2"
                  aria-label={`Entries on ${date}`}
                >
                  {entries.map((entry, index) => (
                    <li key={entry.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          {entry.amount.toLocaleString("en-US")} {unit}
                        </span>
                        {writable && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                !hydrated ||
                                correction !== null ||
                                refreshState !== "current"
                              }
                              aria-label={`Edit entry for ${entry.amount.toLocaleString("en-US")} ${unit} on ${date}, entry ${index + 1} of ${entries.length}`}
                              aria-expanded={
                                correction?.entry.id === entry.id &&
                                correction.action === "edit"
                              }
                              onClick={(event) => {
                                open(entry, "edit", event.currentTarget);
                              }}
                            >
                              Edit entry
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                !hydrated ||
                                correction !== null ||
                                refreshState !== "current"
                              }
                              aria-label={`Delete entry for ${entry.amount.toLocaleString("en-US")} ${unit} on ${date}, entry ${index + 1} of ${entries.length}`}
                              aria-expanded={
                                correction?.entry.id === entry.id &&
                                correction.action === "delete"
                              }
                              onClick={(event) => {
                                open(entry, "delete", event.currentTarget);
                              }}
                            >
                              Delete entry
                            </Button>
                          </div>
                        )}
                      </div>
                      {correction?.entry.id === entry.id && (
                        <EntryCorrectionForm
                          key={correction.action}
                          correction={correction}
                          history={history}
                          onSubmit={onSubmit}
                          onRefresh={onRefresh}
                          onClose={(message) => {
                            setCorrection(null);
                            setNotice(message ?? "");
                          }}
                          onApplied={(message) => {
                            setCorrection(null);
                            setNotice(message);
                            void reloadConfirmedHistory();
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
