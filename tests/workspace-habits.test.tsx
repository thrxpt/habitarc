// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { AccountScreen } from "../src/components/account-screen";
import type {
  ArchiveHabitDraft,
  ArchiveHabitResponse,
  CreateHabitResult,
  GoalRevisionDraft,
  GoalRevisionResponse,
  HabitCreationResponse,
  Habit,
  HabitDraft,
  HabitWorkspace,
  ReminderDraft,
  SetReminderResponse,
} from "../src/habits";
import type { Identity } from "../src/identity";
import type { ActivityTemplate } from "../src/templates";

const participant: Identity = {
  id: "a",
  name: "Participant A",
  email: "a@example.test",
  role: "participant",
  timezone: "Asia/Bangkok",
};
const template: ActivityTemplate = {
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
const habit: Habit = {
  id: "habit-a",
  template,
  startDate: "2026-11-15",
  archivedFrom: null,
  reminderTime: null,
  version: 1,
  pendingGoal: null,
  goal: {
    effectiveFrom: "2026-11-15",
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  },
};
const workspace: HabitWorkspace = {
  accountDate: "2026-11-15",
  timezone: "Asia/Bangkok",
  items: [],
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

test("Participant selects a template, starts a weekday Habit above the entry maximum, and sees persisted settings", async () => {
  const create = vi
    .fn<(draft: HabitDraft) => Promise<CreateHabitResult>>()
    .mockResolvedValue({ kind: "created", habit });
  const { rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={workspace}
      onCreateHabit={create}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  await user.type(screen.getByLabelText("Daily Target"), "60");
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    // eslint-disable-next-line no-await-in-loop -- User interactions must complete in order.
    await user.click(screen.getByRole("checkbox", { name: day }));
  }
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(create).toHaveBeenCalledWith({
    templateId: "study",
    templateVersion: 1,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5],
  });
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [habit] }}
      onCreateHabit={create}
      onSessionChanged={sessionChanged}
    />
  );
  const saved = screen.getByRole("region", { name: "Your Habits" });
  expect(within(saved).getByText("60 minutes")).toBeVisible();
  expect(
    within(saved).getByText("Monday, Tuesday, Wednesday, Thursday, Friday")
  ).toBeVisible();
  expect(within(saved).getByText("Started 2026-11-15")).toBeVisible();
  expect(screen.getByText(/Account date: 2026-11-15/u)).toHaveTextContent(
    "Asia/Bangkok"
  );
  expect(screen.getByText("Your Habit is saved.")).toBeVisible();
  expect(
    screen.queryByText(/You already have an active Habit/u)
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start Habit" })
  ).not.toBeInTheDocument();
});

test("a refreshed template cannot carry a typed Daily Target into a different Measurement Unit", async () => {
  const create = vi.fn<(draft: HabitDraft) => Promise<CreateHabitResult>>();
  const props = {
    identity: participant,
    habitWorkspace: workspace,
    onCreateHabit: create,
    onSessionChanged: sessionChanged,
  };
  const { rerender } = render(
    <AccountScreen {...props} templates={[template]} />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  await user.type(screen.getByLabelText("Daily Target"), "60");
  await user.click(screen.getByRole("checkbox", { name: "Monday" }));

  rerender(
    <AccountScreen
      {...props}
      templates={[{ ...template, unit: "counts", version: 2 }]}
    />
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose an active template again."
  );
  expect(
    screen.queryByRole("button", { name: "Start Habit" })
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  expect(screen.getByLabelText("Daily Target")).toHaveDisplayValue("");
  expect(screen.getByRole("checkbox", { name: "Monday" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(create).not.toHaveBeenCalled();
});

test.each(["4", "1.5", "1441", "1e2"])(
  "invalid Daily Target %s and empty weekdays show associated errors without saving",
  async (target) => {
    const create = vi.fn<(draft: HabitDraft) => Promise<CreateHabitResult>>();
    render(
      <AccountScreen
        identity={participant}
        templates={[template]}
        habitWorkspace={workspace}
        onCreateHabit={create}
        onSessionChanged={sessionChanged}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Focused Study/u }));
    await user.type(screen.getByLabelText("Daily Target"), target);
    await user.click(screen.getByRole("button", { name: "Start Habit" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Daily Target")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("Daily Target")).toHaveAccessibleDescription(
      /whole number from 5 to 1,440 minutes/u
    );
    expect(
      screen.getByRole("checkbox", { name: "Monday" })
    ).toHaveAccessibleDescription(/Choose at least one weekday/u);
  }
);

test("Habit field descriptions reference existing elements before, during, and after validation errors", async () => {
  const { container } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={workspace}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  const target = screen.getByLabelText("Daily Target");
  const monday = screen.getByRole("checkbox", { name: "Monday" });
  const schedule = screen.getByRole("group", { name: "Schedule" });
  expect(findMissingDescriptionTargets(container)).toEqual([]);
  expect(target).toHaveAccessibleDescription(/per scheduled day/u);
  expect(schedule).toHaveAccessibleDescription(/Choose at least one weekday/u);

  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(target).toHaveAccessibleDescription(
    /whole number from 5 to 1,440 minutes/u
  );
  expect(monday).toHaveAccessibleDescription(/Choose at least one weekday/u);
  expect(findMissingDescriptionTargets(container)).toEqual([]);

  await user.type(target, "60");
  await user.click(monday);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(findMissingDescriptionTargets(container)).toEqual([]);
  expect(target).toHaveAccessibleDescription(/per scheduled day/u);
  expect(schedule).toHaveAccessibleDescription(/Choose at least one weekday/u);
  expect(monday).not.toHaveAttribute("aria-describedby");
});

test("a save failure preserves inputs for retry and a concurrent existing Habit shows its actual settings", async () => {
  const create = vi
    .fn<(draft: HabitDraft) => Promise<CreateHabitResult>>()
    .mockRejectedValueOnce(new Error("Service temporarily unavailable"))
    .mockResolvedValueOnce({
      kind: "existing",
      habit: { ...habit, goal: { ...habit.goal, dailyTarget: 90 } },
    });
  render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={workspace}
      onCreateHabit={create}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  await user.type(screen.getByLabelText("Daily Target"), "60");
  screen.getByRole("checkbox", { name: "Monday" }).focus();
  await user.keyboard("[Space]");
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Service temporarily unavailable"
  );
  expect(screen.getByLabelText("Daily Target")).toHaveValue("60");
  expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "You already have an active Habit"
  );
  expect(screen.getByRole("alert")).toHaveTextContent("90 minutes");
  expect(
    screen.queryByRole("button", { name: "Start Habit" })
  ).not.toBeInTheDocument();
});

test("all seven selected weekdays are saved and displayed as every day", async () => {
  const dailyHabit = {
    ...habit,
    goal: { ...habit.goal, weekdays: [1, 2, 3, 4, 5, 6, 7] },
  };
  const create = vi
    .fn<(draft: HabitDraft) => Promise<CreateHabitResult>>()
    .mockResolvedValue({ kind: "created", habit: dailyHabit });
  render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={workspace}
      onCreateHabit={create}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  await user.type(screen.getByLabelText("Daily Target"), "60");
  for (const checkbox of screen.getAllByRole("checkbox")) {
    // eslint-disable-next-line no-await-in-loop -- User interactions must complete in order.
    await user.click(checkbox);
  }
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(create).toHaveBeenCalledWith({
    templateId: "study",
    templateVersion: 1,
    dailyTarget: 60,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Every day");
});

test("Program Managers never render private Habits or Habit creation controls", () => {
  render(
    <AccountScreen
      identity={{ ...participant, role: "program-manager" }}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [habit] }}
      onSessionChanged={sessionChanged}
    />
  );
  expect(
    screen.queryByRole("region", { name: "Your Habits" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start Habit" })
  ).not.toBeInTheDocument();
});

test("a template changed after selection returns the server's new Daily Target bounds as an associated field error", async () => {
  const create = vi
    .fn<(draft: HabitDraft) => Promise<HabitCreationResponse>>()
    .mockResolvedValue({
      kind: "invalid",
      message: "Check your Habit settings.",
      fieldErrors: {
        dailyTarget:
          "Daily Target must be a whole number from 90 to 1,440 minutes.",
      },
    });
  render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={workspace}
      onCreateHabit={create}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  await user.type(screen.getByLabelText("Daily Target"), "60");
  await user.click(screen.getByRole("checkbox", { name: "Monday" }));
  await user.click(screen.getByRole("button", { name: "Start Habit" }));
  expect(screen.getByLabelText("Daily Target")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  expect(screen.getByLabelText("Daily Target")).toHaveAccessibleDescription(
    /from 90 to 1,440 minutes/u
  );
  expect(screen.getByLabelText("Daily Target")).toHaveValue("60");
});

test("AC-F08-3: archive confirmation shows tomorrow as the exclusive end date, focuses Cancel, and hides edit/archive controls once archived", async () => {
  const archive = vi
    .fn<(draft: ArchiveHabitDraft) => Promise<ArchiveHabitResponse>>()
    .mockResolvedValue({ kind: "archived", archivedFrom: "2026-11-16" });
  const revise =
    vi.fn<(draft: GoalRevisionDraft) => Promise<GoalRevisionResponse>>();
  const { rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [habit] }}
      onArchiveHabit={archive}
      onReviseGoal={revise}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  const habitsRegion = screen.getByRole("region", { name: "Your Habits" });
  const archiveTrigger = within(habitsRegion).getByRole("button", {
    name: "Archive Habit",
  });

  await user.click(archiveTrigger);
  const form = within(habitsRegion).getByRole("form", {
    name: "Archive Focused Study",
  });
  expect(form).toHaveTextContent("2026-11-16");
  expect(form).toHaveTextContent("exclusive");
  expect(form).toHaveTextContent("Today (2026-11-15) remains active");
  expect(within(form).getByRole("button", { name: "Cancel" })).toHaveFocus();

  // Canceling returns focus to the trigger without archiving.
  await user.click(within(form).getByRole("button", { name: "Cancel" }));
  expect(archiveTrigger).toHaveFocus();
  expect(archive).not.toHaveBeenCalled();

  // Confirming archives from tomorrow with the Habit's version and a request key.
  await user.click(archiveTrigger);
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Confirm archive" })
  );
  expect(archive).toHaveBeenCalledTimes(1);
  const [archivedDraft] = archive.mock.calls[0] ?? [];
  expect(archivedDraft).toMatchObject({
    habitId: "habit-a",
    expectedVersion: 1,
    archivedFrom: "2026-11-16",
  });
  expect(archivedDraft?.requestKey.length).toBeGreaterThan(0);
  expect(
    within(habitsRegion).getByText(
      "Focused Study is scheduled to end on 2026-11-16 (exclusive). Today remains active."
    )
  ).toBeVisible();

  // Once archived for tomorrow, edit and archive controls disappear and no reactivation/delete controls exist.
  const pendingArchived: Habit = {
    ...habit,
    archivedFrom: "2026-11-16",
    version: 2,
  };
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [pendingArchived] }}
      onArchiveHabit={archive}
      onReviseGoal={revise}
      onSessionChanged={sessionChanged}
    />
  );
  expect(within(habitsRegion).getByRole("status")).toHaveTextContent(
    "Focused Study is scheduled to end on 2026-11-16 (exclusive). Today remains active."
  );
  expect(
    within(habitsRegion).getByText(
      "Started 2026-11-15 · Archive begins 2026-11-16"
    )
  ).toBeVisible();
  expect(
    within(habitsRegion).queryByRole("button", { name: "Edit goal settings" })
  ).not.toBeInTheDocument();
  expect(
    within(habitsRegion).queryByRole("button", { name: "Archive Habit" })
  ).not.toBeInTheDocument();
  expect(
    within(habitsRegion).queryByRole("button", {
      name: /pause|reactivate|resume|delete/iu,
    })
  ).not.toBeInTheDocument();
  expect(
    within(habitsRegion).getByRole("link", { name: /View history/u })
  ).toHaveAttribute("href", "/habits/habit-a/history");

  // On 2026-11-15 (today), selecting the template still shows the active Habit.
  await user.click(screen.getByRole("button", { name: /Focused Study/u }));
  expect(screen.getByText(/You already have an active Habit/u)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Archive begins 2026-11-16."
  );

  // On 2026-11-16 (tomorrow), the ended Habit shows Archived from and allows starting a fresh Habit.
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{
        ...workspace,
        accountDate: "2026-11-16",
        items: [pendingArchived],
      }}
      onArchiveHabit={archive}
      onReviseGoal={revise}
      onSessionChanged={sessionChanged}
    />
  );
  expect(
    within(habitsRegion).getByText(
      "Started 2026-11-15 · Archived from 2026-11-16"
    )
  ).toBeVisible();
  expect(within(habitsRegion).getByRole("status")).toHaveTextContent(
    "Focused Study was archived from 2026-11-16 (exclusive). Its history remains available."
  );
  expect(within(habitsRegion).getByRole("status")).not.toHaveTextContent(
    "Today remains active"
  );
  expect(screen.getByRole("button", { name: "Start Habit" })).toBeVisible();
});

test("AC-F08-3: archive confirmation expires across midnight, retries with the same request key, and focuses reload on conflict", async () => {
  const archive = vi
    .fn<(draft: ArchiveHabitDraft) => Promise<ArchiveHabitResponse>>()
    .mockRejectedValueOnce(new Error("Network error"))
    .mockResolvedValueOnce({
      kind: "conflict",
      message:
        "Your Habit settings changed. Reload the workspace before trying again.",
      fieldErrors: {},
    });
  const { rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [habit] }}
      onArchiveHabit={archive}
      onSessionChanged={sessionChanged}
    />
  );
  const user = userEvent.setup();
  const habitsRegion = screen.getByRole("region", { name: "Your Habits" });
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Archive Habit" })
  );

  // Midnight rollover expires the open confirmation and disables confirm.
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{
        ...workspace,
        accountDate: "2026-11-16",
        items: [habit],
      }}
      onArchiveHabit={archive}
      onSessionChanged={sessionChanged}
    />
  );
  expect(within(habitsRegion).getByRole("alert")).toHaveTextContent(
    "This confirmation was for 2026-11-16. Close and reopen archive to end this Habit on 2026-11-17."
  );
  expect(
    within(habitsRegion).getByRole("button", { name: "Confirm archive" })
  ).toBeDisabled();

  // Close and reopen for 2026-11-17, trigger network failure, then retry with the same requestKey.
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Cancel" })
  );
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Archive Habit" })
  );
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Confirm archive" })
  );
  expect(within(habitsRegion).getByRole("alert")).toHaveTextContent(
    "We couldn’t confirm whether this Habit was archived."
  );
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Retry archive" })
  );
  expect(archive).toHaveBeenCalledTimes(2);
  expect(archive.mock.calls[0]?.[0].requestKey).toBe(
    archive.mock.calls[1]?.[0].requestKey
  );
  expect(within(habitsRegion).getByRole("alert")).toHaveTextContent(
    "Your Habit settings changed."
  );
  expect(
    within(habitsRegion).getByRole("link", { name: "Reload workspace" })
  ).toHaveFocus();
});

test("AC-F10-1/2: Participant configures, retries, and disables a local Reminder with explicit Account Timezone and in-app-only wording", async () => {
  const saveReminder = vi
    .fn<(draft: ReminderDraft) => Promise<SetReminderResponse>>()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce({ kind: "saved", reminderTime: "18:00" })
    .mockResolvedValueOnce({ kind: "saved", reminderTime: null });

  const { container, rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [habit] }}
      onSetReminder={saveReminder}
      onSessionChanged={sessionChanged}
    />
  );

  const habitsRegion = screen.getByRole("region", { name: "Your Habits" });
  expect(within(habitsRegion).getByText("Off")).toBeVisible();

  const user = userEvent.setup();
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Set Reminder" })
  );
  expect(findMissingDescriptionTargets(container)).toEqual([]);

  const form = within(habitsRegion).getByRole("form", {
    name: "Reminder settings for Focused Study",
  });
  expect(form).toHaveTextContent("Asia/Bangkok");
  expect(form).toHaveTextContent(
    "no email, push, background delivery, or snooze"
  );

  // Submitting empty time shows accessible validation error without calling server
  await user.click(within(form).getByRole("button", { name: "Save Reminder" }));
  expect(saveReminder).not.toHaveBeenCalled();
  expect(
    within(form).getByLabelText("Reminder time (Asia/Bangkok)")
  ).toHaveAttribute("aria-invalid", "true");
  expect(findMissingDescriptionTargets(container)).toEqual([]);

  // Set 18:00, recover from transient failure with unchanged requestKey
  await user.type(
    within(form).getByLabelText("Reminder time (Asia/Bangkok)"),
    "18:00"
  );
  await user.click(within(form).getByRole("button", { name: "Save Reminder" }));
  expect(within(form).getByRole("alert")).toHaveTextContent(
    "We couldn’t confirm whether your Reminder was saved."
  );
  await user.click(within(form).getByRole("button", { name: "Retry save" }));
  expect(saveReminder).toHaveBeenCalledTimes(2);
  expect(saveReminder.mock.calls[0]?.[0]).toEqual(
    saveReminder.mock.calls[1]?.[0]
  );
  expect(saveReminder.mock.calls[0]?.[0]).toMatchObject({
    habitId: habit.id,
    expectedVersion: 1,
    reminderTime: "18:00",
  });
  expect(within(habitsRegion).getByRole("status")).toHaveTextContent(
    "Reminder saved for 18:00 (Asia/Bangkok)."
  );

  // Rerender with persisted reminder, then disable it
  const withReminder: Habit = { ...habit, reminderTime: "18:00", version: 2 };
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [withReminder] }}
      onSetReminder={saveReminder}
      onSessionChanged={sessionChanged}
    />
  );
  expect(
    within(habitsRegion).getByText("18:00 (Asia/Bangkok) · In-app only")
  ).toBeVisible();
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Edit Reminder" })
  );
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Disable Reminder" })
  );
  expect(saveReminder).toHaveBeenCalledTimes(3);
  expect(saveReminder.mock.calls[2]?.[0]).toMatchObject({
    habitId: habit.id,
    expectedVersion: 2,
    reminderTime: null,
  });
  expect(within(habitsRegion).getByRole("status")).toHaveTextContent(
    "Reminder disabled."
  );

  // Archived Habit hides Reminder settings
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{
        ...workspace,
        accountDate: "2026-11-16",
        items: [{ ...withReminder, archivedFrom: "2026-11-16" }],
      }}
      onSetReminder={saveReminder}
      onSessionChanged={sessionChanged}
    />
  );
  expect(
    within(habitsRegion).queryByRole("button", { name: /Reminder/u })
  ).not.toBeInTheDocument();
});

test("AC-F10-2: Retry disable remains available and resends the original payload and requestKey after a workspace refresh", async () => {
  const saveReminder = vi
    .fn<(draft: ReminderDraft) => Promise<SetReminderResponse>>()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce({ kind: "replayed", reminderTime: null });

  const withReminder: Habit = { ...habit, reminderTime: "18:00", version: 2 };
  const { rerender } = render(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{ ...workspace, items: [withReminder] }}
      onSetReminder={saveReminder}
      onSessionChanged={sessionChanged}
    />
  );

  const habitsRegion = screen.getByRole("region", { name: "Your Habits" });
  const user = userEvent.setup();
  await user.click(
    within(habitsRegion).getByRole("button", { name: "Edit Reminder" })
  );
  const form = within(habitsRegion).getByRole("form", {
    name: "Reminder settings for Focused Study",
  });
  await user.click(
    within(form).getByRole("button", { name: "Disable Reminder" })
  );
  expect(within(form).getByRole("alert")).toHaveTextContent(
    "We couldn’t confirm whether your Reminder was saved."
  );

  // Workspace refreshes after the disable committed server-side, setting reminderTime to null.
  rerender(
    <AccountScreen
      identity={participant}
      templates={[template]}
      habitWorkspace={{
        ...workspace,
        items: [{ ...habit, reminderTime: null, version: 3 }],
      }}
      onSetReminder={saveReminder}
      onSessionChanged={sessionChanged}
    />
  );

  expect(
    within(form).queryByRole("button", { name: "Save Reminder" })
  ).not.toBeInTheDocument();
  await user.click(within(form).getByRole("button", { name: "Retry disable" }));

  expect(saveReminder).toHaveBeenCalledTimes(2);
  expect(saveReminder.mock.calls[1]?.[0]).toEqual(
    saveReminder.mock.calls[0]?.[0]
  );
  expect(saveReminder.mock.calls[1]?.[0]).toMatchObject({
    habitId: habit.id,
    expectedVersion: 2,
    reminderTime: null,
  });
  expect(within(habitsRegion).getByRole("status")).toHaveTextContent(
    "Reminder disabled."
  );
});
