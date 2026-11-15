import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
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

import {
  checkEntryDateEligibility,
  ENTRY_WINDOW_DAYS,
  validateEntryInput,
} from "../entries";
import type {
  ActivityEntryDraft,
  EntryFieldErrors,
  RecordEntryResponse,
  TodayHabitItem,
  TodayWorkspace,
} from "../entries";
import {
  formatTemplateRange,
  MEASUREMENT_CEILINGS,
  parseWholeNumberInput,
} from "../templates";

interface RetryRequestState {
  requestKey: string;
  activityDate: string;
  amount: number;
}

const EntryRecordForm = ({
  item,
  accountDate,
  onRecordEntry,
}: {
  item: TodayHabitItem;
  accountDate: string;
  onRecordEntry?: (draft: ActivityEntryDraft) => Promise<RecordEntryResponse>;
}) => {
  const { habit } = item;
  const { template } = habit;
  const ceiling = MEASUREMENT_CEILINGS[template.unit];
  const [amount, setAmount] = useState("");
  const [activityDate, setActivityDate] = useState(accountDate);
  const [fieldErrors, setFieldErrors] = useState<EntryFieldErrors>({});
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [retryRequest, setRetryRequest] = useState<RetryRequestState | null>(
    null
  );

  const amountId = `entry-amount-${habit.id}`;
  const amountHelpId = `entry-amount-help-${habit.id}`;
  const amountErrorId = `entry-amount-error-${habit.id}`;
  const dateId = `entry-date-${habit.id}`;
  const dateHelpId = `entry-date-help-${habit.id}`;
  const dateErrorId = `entry-date-error-${habit.id}`;

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setError("");
    setSavedMessage("");

    const parsedAmount = parseWholeNumberInput(amount);
    const validation = validateEntryInput(
      {
        habitId: habit.id,
        activityDate,
        amount: parsedAmount,
        requestKey: "client-validation",
      },
      template
    );

    const nextErrors: EntryFieldErrors = validation.ok
      ? {}
      : { ...validation.fieldErrors };

    if (nextErrors.activityDate === undefined) {
      const eligibility = checkEntryDateEligibility({
        activityDate,
        accountDate,
        startDate: habit.startDate,
        archivedFrom: habit.archivedFrom,
      });
      if (!eligibility.ok) {
        nextErrors.activityDate = eligibility.message;
      }
    }

    if (
      Object.keys(nextErrors).length > 0 ||
      parsedAmount === undefined ||
      !validation.ok
    ) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!onRecordEntry) {
      setError(
        "Entry recording is unavailable right now. Please reload and try again."
      );
      return;
    }

    const requestKey =
      retryRequest !== null &&
      retryRequest.activityDate === activityDate &&
      retryRequest.amount === parsedAmount
        ? retryRequest.requestKey
        : crypto.randomUUID();
    const activeSubmission: RetryRequestState = {
      requestKey,
      activityDate,
      amount: parsedAmount,
    };

    setFieldErrors({});
    setPending(true);
    try {
      const response = await onRecordEntry({
        habitId: habit.id,
        activityDate,
        amount: parsedAmount,
        requestKey,
      });
      if (response.kind === "invalid" || response.kind === "conflict") {
        setFieldErrors(response.fieldErrors);
        setError(response.message);
        setRetryRequest(null);
      } else {
        setRetryRequest(null);
        setAmount("");
        setFieldErrors({});
        const formattedAmount = `${response.entry.amount.toLocaleString("en-US")} ${template.unit}`;
        const formattedTotal = `${response.dailyTotal.toLocaleString("en-US")} ${template.unit}`;
        if (activityDate === accountDate) {
          setSavedMessage(
            response.kind === "replayed"
              ? `Entry confirmed (already saved): ${formattedAmount}. Today’s total: ${formattedTotal}.`
              : `Saved ${formattedAmount}. Today’s total: ${formattedTotal}.`
          );
        } else {
          setSavedMessage(
            response.kind === "replayed"
              ? `Entry confirmed (already saved) for ${activityDate}: ${formattedAmount} (Daily Total: ${formattedTotal}).`
              : `Saved ${formattedAmount} for ${activityDate} (Daily Total: ${formattedTotal}).`
          );
        }
      }
    } catch {
      setRetryRequest(activeSubmission);
      setSavedMessage("");
      setError(
        "We couldn’t confirm whether your entry was saved. Retry to save safely without duplicating it."
      );
    }
    setPending(false);
  };

  return (
    <form
      className="bg-card mt-4 rounded-lg border p-4"
      noValidate
      aria-busy={pending}
      aria-label={`Record ${template.name} entry`}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <FieldGroup>
        <div className="compact:grid-cols-1 grid grid-cols-2 gap-4">
          <Field
            data-disabled={pending}
            data-invalid={fieldErrors.amount !== undefined}
          >
            <FieldLabel htmlFor={amountId}>Amount ({template.unit})</FieldLabel>
            <Input
              id={amountId}
              name="amount"
              inputMode="numeric"
              value={amount}
              disabled={pending}
              aria-invalid={fieldErrors.amount !== undefined}
              aria-describedby={
                fieldErrors.amount === undefined
                  ? amountHelpId
                  : `${amountHelpId} ${amountErrorId}`
              }
              onChange={(event) => {
                setAmount(event.target.value);
                setSavedMessage("");
                setError("");
                setRetryRequest(null);
                setFieldErrors((previous) => ({
                  ...previous,
                  amount: undefined,
                }));
              }}
            />
            <FieldDescription id={amountHelpId}>
              Per entry: {formatTemplateRange(template)}. Daily limit:{" "}
              {ceiling.toLocaleString("en-US")} {template.unit}.
            </FieldDescription>
            {fieldErrors.amount !== undefined && (
              <FieldError id={amountErrorId}>{fieldErrors.amount}</FieldError>
            )}
          </Field>

          <Field
            data-disabled={pending}
            data-invalid={fieldErrors.activityDate !== undefined}
          >
            <FieldLabel htmlFor={dateId}>Activity date</FieldLabel>
            <Input
              id={dateId}
              name="activityDate"
              type="date"
              value={activityDate}
              min={item.writableMinDate ?? undefined}
              max={item.writableMaxDate ?? undefined}
              disabled={pending}
              aria-invalid={fieldErrors.activityDate !== undefined}
              aria-describedby={
                fieldErrors.activityDate === undefined
                  ? dateHelpId
                  : `${dateHelpId} ${dateErrorId}`
              }
              onChange={(event) => {
                setActivityDate(event.target.value);
                setSavedMessage("");
                setError("");
                setRetryRequest(null);
                setFieldErrors((previous) => ({
                  ...previous,
                  activityDate: undefined,
                }));
              }}
            />
            <FieldDescription id={dateHelpId}>
              {item.writableMinDate !== null && item.writableMaxDate !== null
                ? `Eligible dates: ${item.writableMinDate} to ${item.writableMaxDate} (up to ${ENTRY_WINDOW_DAYS} days before ${accountDate}).`
                : `Today (${accountDate}) or the previous ${ENTRY_WINDOW_DAYS} days within your tracking period.`}
            </FieldDescription>
            {fieldErrors.activityDate !== undefined && (
              <FieldError id={dateErrorId}>
                {fieldErrors.activityDate}
              </FieldError>
            )}
          </Field>
        </div>

        {error.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {savedMessage.length > 0 && error.length === 0 && (
          <output className="bg-secondary text-foreground block rounded-lg border px-3 py-2 text-sm">
            {savedMessage}
          </output>
        )}

        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {(() => {
              if (pending) {
                return "Saving entry…";
              }
              return retryRequest === null ? "Save entry" : "Retry save";
            })()}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
};

const TodayHabitCard = ({
  item,
  accountDate,
  isFormOpen,
  onToggleForm,
  onRecordEntry,
}: {
  item: TodayHabitItem;
  accountDate: string;
  isFormOpen: boolean;
  onToggleForm: () => void;
  onRecordEntry?: (draft: ActivityEntryDraft) => Promise<RecordEntryResponse>;
}) => {
  const hydrated = useHydrated();
  const { habit, progress, entries } = item;
  const { template } = habit;
  const { unit } = template;

  return (
    <li id={`today-habit-${habit.id}`} className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="text-lg font-[650]">{template.name}</h4>
        <span className="text-muted-foreground text-sm">
          {formatTemplateRange(template)}
        </span>
      </div>

      {progress.scheduled && progress.dailyTarget !== null ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <strong className="font-[650]">
                {progress.dailyTotal.toLocaleString("en-US")}
              </strong>{" "}
              / {progress.dailyTarget.toLocaleString("en-US")} {unit}
            </span>
            <span className="font-[650]">
              {progress.percentage}% ·{" "}
              {progress.completed ? "Completed" : "In progress"}
            </span>
          </div>
          <progress
            aria-label={`${template.name} daily progress`}
            aria-valuetext={`${progress.dailyTotal.toLocaleString("en-US")} of ${progress.dailyTarget.toLocaleString("en-US")} ${unit} (${progress.percentage}%)`}
            value={progress.visualFillPercent ?? 0}
            max={100}
            className="[&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary mt-2 block h-3 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full"
          />
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-muted-foreground">
            Unscheduled today — no target obligation
          </p>
          <p>
            <strong className="font-[650]">
              {progress.dailyTotal.toLocaleString("en-US")} {unit}
            </strong>{" "}
            recorded today
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          No entries recorded today yet.
        </p>
      ) : (
        <ul
          aria-label={`${template.name} entries today`}
          className="mt-3 space-y-1 text-sm"
        >
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2"
            >
              <span>
                Entry {index + 1}: {entry.amount.toLocaleString("en-US")} {unit}
              </span>
              <span>{entry.activityDate}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hydrated}
          aria-expanded={isFormOpen}
          onClick={onToggleForm}
        >
          {isFormOpen ? "Close entry form" : "Add entry"}
        </Button>
      </div>

      {isFormOpen && (
        <EntryRecordForm
          key={habit.id}
          item={item}
          accountDate={accountDate}
          onRecordEntry={onRecordEntry}
        />
      )}
    </li>
  );
};

export const TodayPanel = ({
  workspace,
  onRecordEntry,
}: {
  workspace: TodayWorkspace;
  onRecordEntry?: (draft: ActivityEntryDraft) => Promise<RecordEntryResponse>;
}) => {
  const [openHabitId, setOpenHabitId] = useState<string | null>(null);
  const hasAnyHabits =
    workspace.scheduled.length > 0 || workspace.unscheduled.length > 0;

  return (
    <section className="mt-12 max-w-2xl" aria-labelledby="today-heading">
      <h2
        id="today-heading"
        className="mb-3 text-[23px] leading-[1.3] font-[650]"
      >
        Today
      </h2>
      <p className="text-muted-foreground mb-6 text-sm">
        Account date: {workspace.accountDate} ({workspace.timezone})
      </p>

      {hasAnyHabits ? (
        <>
          <div>
            <h3 className="mb-2 text-lg font-[650]">Scheduled for today</h3>
            {workspace.scheduled.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Habits are scheduled for today.
              </p>
            ) : (
              <ul className="divide-y border-y">
                {workspace.scheduled.map((item) => (
                  <TodayHabitCard
                    key={item.habit.id}
                    item={item}
                    accountDate={workspace.accountDate}
                    isFormOpen={openHabitId === item.habit.id}
                    onToggleForm={() => {
                      setOpenHabitId((previous) =>
                        previous === item.habit.id ? null : item.habit.id
                      );
                    }}
                    onRecordEntry={onRecordEntry}
                  />
                ))}
              </ul>
            )}
          </div>

          {workspace.unscheduled.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-2 text-lg font-[650]">Unscheduled today</h3>
              <ul className="divide-y border-y">
                {workspace.unscheduled.map((item) => (
                  <TodayHabitCard
                    key={item.habit.id}
                    item={item}
                    accountDate={workspace.accountDate}
                    isFormOpen={openHabitId === item.habit.id}
                    onToggleForm={() => {
                      setOpenHabitId((previous) =>
                        previous === item.habit.id ? null : item.habit.id
                      );
                    }}
                    onRecordEntry={onRecordEntry}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="bg-card rounded-lg border p-5">
          <p className="text-muted-foreground mb-3">
            You have no active Habits for today yet.
          </p>
          <a
            href="#template-library-heading"
            className="text-primary font-medium underline"
          >
            Browse Activity Templates to start a Habit
          </a>
        </div>
      )}
    </section>
  );
};
