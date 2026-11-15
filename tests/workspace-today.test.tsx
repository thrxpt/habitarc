// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { AccountScreen } from "../src/components/account-screen";
import type {
  ActivityEntryDraft,
  RecordEntryResponse,
  TodayHabitItem,
  TodayWorkspace,
} from "../src/entries";
import type { Identity } from "../src/identity";
import type { ActivityTemplate } from "../src/templates";

const participant: Identity = {
  id: "a",
  name: "Participant A",
  email: "a@example.test",
  role: "participant",
  timezone: "Asia/Bangkok",
};

const studyTemplate: ActivityTemplate = {
  id: "study",
  name: "Focused Study",
  description: "Quiet reading",
  unit: "minutes",
  entryMinimum: 5,
  entryMaximum: 45,
  archivedAt: null,
  version: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const stretchTemplate: ActivityTemplate = {
  id: "stretch",
  name: "Evening Stretch",
  description: "Mobility work",
  unit: "minutes",
  entryMinimum: 5,
  entryMaximum: 30,
  archivedAt: null,
  version: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const scheduledHabit = {
  id: "habit-study",
  template: studyTemplate,
  startDate: "2026-11-01",
  archivedFrom: null,
  goal: {
    effectiveFrom: "2026-11-01",
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  },
};

const unscheduledHabit = {
  id: "habit-stretch",
  template: stretchTemplate,
  startDate: "2026-11-01",
  archivedFrom: null,
  goal: {
    effectiveFrom: "2026-11-01",
    dailyTarget: 20,
    weekdays: [1, 3, 5],
  },
};

const emptyToday: TodayWorkspace = {
  accountDate: "2026-11-15",
  timezone: "Asia/Bangkok",
  scheduled: [],
  unscheduled: [],
};

const sessionChanged = async () => {};
afterEach(cleanup);

const DESCRIPTION_SEPARATOR = /\s+/u;
const findMissingDescriptionTargets = (container: HTMLElement): string[] =>
  [...container.querySelectorAll("[aria-describedby]")].flatMap((element) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(DESCRIPTION_SEPARATOR)
      .filter(
        (id) =>
          id.length > 0 &&
          // eslint-disable-next-line unicorn/prefer-query-selector -- ARIA references contain literal IDs, not CSS selectors.
          container.ownerDocument.getElementById(id) === null
      )
  );

test("empty Today state directs the Participant to Habit setup and Program Managers never see Today", () => {
  const { rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[studyTemplate]}
      todayWorkspace={emptyToday}
      onSessionChanged={sessionChanged}
    />
  );

  const today = screen.getByRole("region", { name: "Today" });
  expect(
    within(today).getByText("You have no active Habits for today yet.")
  ).toBeVisible();
  expect(
    within(today).getByRole("link", {
      name: /Browse Activity Templates to start a Habit/u,
    })
  ).toHaveAttribute("href", "#template-library-heading");

  rerender(
    <AccountScreen
      identity={{ ...participant, role: "program-manager" }}
      templates={[studyTemplate]}
      todayWorkspace={emptyToday}
      onSessionChanged={sessionChanged}
    />
  );
  expect(
    screen.queryByRole("region", { name: "Today" })
  ).not.toBeInTheDocument();
});

test("scheduled Today shows accumulated entries, overachievement percentage with bar capped at 100%, and unscheduled Today omits target percentages", () => {
  const workspace: TodayWorkspace = {
    accountDate: "2026-11-15",
    timezone: "Asia/Bangkok",
    scheduled: [
      {
        habit: scheduledHabit,
        progress: {
          scheduled: true,
          dailyTarget: 60,
          dailyTotal: 75,
          percentage: 125,
          visualFillPercent: 100,
          completed: true,
        },
        entries: [
          {
            id: "e1",
            habitId: scheduledHabit.id,
            activityDate: "2026-11-15",
            amount: 25,
            version: 1,
            createdAt: "2026-11-15T01:00:00.000Z",
            updatedAt: "2026-11-15T01:00:00.000Z",
          },
          {
            id: "e2",
            habitId: scheduledHabit.id,
            activityDate: "2026-11-15",
            amount: 25,
            version: 1,
            createdAt: "2026-11-15T02:00:00.000Z",
            updatedAt: "2026-11-15T02:00:00.000Z",
          },
          {
            id: "e3",
            habitId: scheduledHabit.id,
            activityDate: "2026-11-15",
            amount: 25,
            version: 1,
            createdAt: "2026-11-15T03:00:00.000Z",
            updatedAt: "2026-11-15T03:00:00.000Z",
          },
        ],
        writableMinDate: "2026-11-09",
        writableMaxDate: "2026-11-15",
      },
    ],
    unscheduled: [
      {
        habit: unscheduledHabit,
        progress: {
          scheduled: false,
          dailyTarget: null,
          dailyTotal: 25,
          percentage: null,
          visualFillPercent: null,
          completed: false,
        },
        entries: [
          {
            id: "e4",
            habitId: unscheduledHabit.id,
            activityDate: "2026-11-15",
            amount: 25,
            version: 1,
            createdAt: "2026-11-15T04:00:00.000Z",
            updatedAt: "2026-11-15T04:00:00.000Z",
          },
        ],
        writableMinDate: "2026-11-09",
        writableMaxDate: "2026-11-15",
      },
    ],
  };

  render(
    <AccountScreen
      identity={participant}
      templates={[studyTemplate, stretchTemplate]}
      todayWorkspace={workspace}
      onSessionChanged={sessionChanged}
    />
  );

  const studyCard = document.querySelector("#today-habit-habit-study");
  expect(studyCard).not.toBeNull();
  if (studyCard instanceof HTMLElement) {
    expect(studyCard).toHaveTextContent("75 / 60 minutes");
    expect(studyCard).toHaveTextContent("125% · Completed");
    const progressBar = within(studyCard).getByRole("progressbar", {
      name: "Focused Study daily progress",
    });
    expect(progressBar).toHaveAttribute("value", "100");
    expect(progressBar).toHaveAttribute("max", "100");
    expect(progressBar).toHaveAttribute(
      "aria-valuetext",
      "75 of 60 minutes (125%)"
    );
    expect(
      within(studyCard).getAllByText(/25 minutes/u).length
    ).toBeGreaterThanOrEqual(3);
  }

  const stretchCard = document.querySelector("#today-habit-habit-stretch");
  expect(stretchCard).not.toBeNull();
  if (stretchCard instanceof HTMLElement) {
    expect(stretchCard).toHaveTextContent(
      "Unscheduled today — no target obligation"
    );
    expect(stretchCard).toHaveTextContent("25 minutes recorded today");
    expect(within(stretchCard).queryByRole("progressbar")).toBeNull();
    expect(stretchCard).not.toHaveTextContent("%");
  }
});

test("pending, lost-response failure, safe retry with unchanged requestKey, and payload change regeneration", async () => {
  let resolveDeferred: ((value: RecordEntryResponse) => void) | undefined;
  const record = vi
    .fn<(draft: ActivityEntryDraft) => Promise<RecordEntryResponse>>()
    .mockImplementationOnce(
      async () =>
        // eslint-disable-next-line promise/avoid-new -- Keep entry submission pending until the in-flight state is asserted.
        await new Promise<RecordEntryResponse>((resolve) => {
          resolveDeferred = resolve;
        })
    )
    .mockRejectedValueOnce(new Error("Network connection dropped"))
    .mockResolvedValueOnce({
      kind: "replayed",
      entry: {
        id: "entry-1",
        habitId: scheduledHabit.id,
        activityDate: "2026-11-15",
        amount: 25,
        version: 1,
        createdAt: "2026-11-15T01:00:00.000Z",
        updatedAt: "2026-11-15T01:00:00.000Z",
      },
      dailyTotal: 25,
    })
    .mockRejectedValueOnce(new Error("Temporary outage"))
    .mockResolvedValueOnce({
      kind: "created",
      entry: {
        id: "entry-2",
        habitId: scheduledHabit.id,
        activityDate: "2026-11-15",
        amount: 30,
        version: 1,
        createdAt: "2026-11-15T02:00:00.000Z",
        updatedAt: "2026-11-15T02:00:00.000Z",
      },
      dailyTotal: 55,
    });

  const workspace: TodayWorkspace = {
    accountDate: "2026-11-15",
    timezone: "Asia/Bangkok",
    scheduled: [
      {
        habit: scheduledHabit,
        progress: {
          scheduled: true,
          dailyTarget: 60,
          dailyTotal: 0,
          percentage: 0,
          visualFillPercent: 0,
          completed: false,
        },
        entries: [],
        writableMinDate: "2026-11-09",
        writableMaxDate: "2026-11-15",
      },
    ],
    unscheduled: [],
  };

  render(
    <AccountScreen
      identity={participant}
      templates={[studyTemplate]}
      todayWorkspace={workspace}
      onRecordEntry={record}
      onSessionChanged={sessionChanged}
    />
  );

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  const amountInput = screen.getByLabelText("Amount (minutes)");
  await user.type(amountInput, "25");
  await user.click(screen.getByRole("button", { name: "Save entry" }));

  // Pending state: disabled inputs, saving label, no saved status.
  expect(screen.getByRole("button", { name: "Saving entry…" })).toBeDisabled();
  expect(amountInput).toBeDisabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  // Hiding an in-flight form must not discard its pending submission.
  await user.click(screen.getByRole("button", { name: "Close entry form" }));
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(screen.getByLabelText("Amount (minutes)")).toHaveValue("25");
  expect(screen.getByRole("button", { name: "Saving entry…" })).toBeDisabled();

  resolveDeferred?.({
    kind: "created",
    entry: {
      id: "entry-0",
      habitId: scheduledHabit.id,
      activityDate: "2026-11-15",
      amount: 25,
      version: 1,
      createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z",
    },
    dailyTotal: 25,
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Saved 25 minutes. Today’s total: 25 minutes."
  );

  // Lost response on second entry: preserve inputs & reuse exact same requestKey on Retry save.
  await user.type(amountInput, "25");
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn’t confirm whether your entry was saved."
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(amountInput).toHaveValue("25");

  // A lost response remains retryable after closing and reopening the form.
  await user.click(screen.getByRole("button", { name: "Close entry form" }));
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(screen.getByLabelText("Amount (minutes)")).toHaveValue("25");
  await user.click(screen.getByRole("button", { name: "Retry save" }));
  const secondKey = record.mock.calls[1]?.[0].requestKey;
  const retryKey = record.mock.calls[2]?.[0].requestKey;
  expect(secondKey).toBeDefined();
  expect(retryKey).toBe(secondKey);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Entry confirmed (already saved): 25 minutes."
  );

  // Changing amount after an error generates a fresh requestKey rather than conflicting.
  await user.type(amountInput, "25");
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  const failedThirdKey = record.mock.calls[3]?.[0].requestKey;

  await user.clear(amountInput);
  await user.type(amountInput, "30");
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  const freshFourthKey = record.mock.calls[4]?.[0].requestKey;
  expect(freshFourthKey).not.toBe(failedThirdKey);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Saved 30 minutes. Today’s total: 55 minutes."
  );
});

test("switching Habits preserves an uncertain entry and its retry key", async () => {
  const record = vi
    .fn<(draft: ActivityEntryDraft) => Promise<RecordEntryResponse>>()
    .mockRejectedValue(new Error("Lost response"));
  const studyItem: TodayHabitItem = {
    habit: scheduledHabit,
    progress: {
      scheduled: true,
      dailyTarget: 60,
      dailyTotal: 0,
      percentage: 0,
      visualFillPercent: 0,
      completed: false,
    },
    entries: [],
    writableMinDate: "2026-11-09",
    writableMaxDate: "2026-11-15",
  };
  render(
    <AccountScreen
      identity={participant}
      todayWorkspace={{
        ...emptyToday,
        scheduled: [studyItem],
        unscheduled: [
          {
            ...studyItem,
            habit: unscheduledHabit,
            progress: {
              ...studyItem.progress,
              scheduled: false,
              dailyTarget: null,
              percentage: null,
              visualFillPercent: null,
            },
          },
        ],
      }}
      onRecordEntry={record}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  const [studyAddButton] = screen.getAllByRole("button", { name: "Add entry" });
  if (studyAddButton === undefined) {
    throw new Error("Expected the study Habit entry action.");
  }
  await user.click(studyAddButton);
  const studyForm = within(
    screen.getByRole("form", { name: "Record Focused Study entry" })
  );
  await user.type(studyForm.getByLabelText("Amount (minutes)"), "25");
  await user.click(studyForm.getByRole("button", { name: "Save entry" }));
  expect(await studyForm.findByRole("alert")).toBeVisible();

  // Only the other Habit's closed form has an Add entry action at each step.
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(
    screen.getByRole("form", { name: "Record Evening Stretch entry" })
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(studyForm.getByLabelText("Amount (minutes)")).toHaveValue("25");
  await user.click(studyForm.getByRole("button", { name: "Retry save" }));
  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls[1]?.[0]).toEqual(record.mock.calls[0]?.[0]);
});

test("invalid entry amounts and ineligible dates show accessible field errors without submitting", async () => {
  const record =
    vi.fn<(draft: ActivityEntryDraft) => Promise<RecordEntryResponse>>();
  const workspace: TodayWorkspace = {
    accountDate: "2026-11-15",
    timezone: "Asia/Bangkok",
    scheduled: [
      {
        habit: scheduledHabit,
        progress: {
          scheduled: true,
          dailyTarget: 60,
          dailyTotal: 0,
          percentage: 0,
          visualFillPercent: 0,
          completed: false,
        },
        entries: [],
        writableMinDate: "2026-11-09",
        writableMaxDate: "2026-11-15",
      },
    ],
    unscheduled: [],
  };

  const { container } = render(
    <AccountScreen
      identity={participant}
      templates={[studyTemplate]}
      todayWorkspace={workspace}
      onRecordEntry={record}
      onSessionChanged={sessionChanged}
    />
  );

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  const amountInput = screen.getByLabelText("Amount (minutes)");
  const dateInput = screen.getByLabelText("Activity date");
  expect(findMissingDescriptionTargets(container)).toEqual([]);

  await user.type(amountInput, "4.5");
  await user.clear(dateInput);
  await user.type(dateInput, "2026-11-16");
  await user.click(screen.getByRole("button", { name: "Save entry" }));

  expect(record).not.toHaveBeenCalled();
  expect(amountInput).toHaveAttribute("aria-invalid", "true");
  expect(amountInput).toHaveAccessibleDescription(/5 to 45 minutes/u);
  expect(dateInput).toHaveAttribute("aria-invalid", "true");
  expect(dateInput).toHaveAccessibleDescription(/Future dates cannot/u);
  expect(findMissingDescriptionTargets(container)).toEqual([]);
});
