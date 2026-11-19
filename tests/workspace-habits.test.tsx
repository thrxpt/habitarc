// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { AccountScreen } from "../src/components/account-screen";
import type {
  CreateHabitResult,
  HabitCreationResponse,
  Habit,
  HabitDraft,
  HabitWorkspace,
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
