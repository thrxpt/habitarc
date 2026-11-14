// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { AccountScreen } from "../src/components/account-screen";
import type { Identity } from "../src/identity";
import type { ActivityTemplate, ActivityTemplateDraft } from "../src/templates";

const manager: Identity = {
  id: "manager-m",
  name: "Program Manager M",
  email: "m@example.test",
  role: "program-manager",
  timezone: "Asia/Bangkok",
};

const participant: Identity = {
  id: "participant-a",
  name: "Participant A",
  email: "a@example.test",
  role: "participant",
  timezone: "Asia/Bangkok",
};

const focusedStudy: ActivityTemplate = {
  id: "template-1",
  name: "Focused Study",
  description: "Quiet reading and problem sets",
  unit: "minutes",
  entryMinimum: 5,
  entryMaximum: 45,
  archivedAt: null,
  version: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const noSessionChange = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

afterEach(() => {
  cleanup();
});

test("Program Manager can create a valid Activity Template with labeled keyboard-accessible fields", async () => {
  const onCreateTemplate = vi
    .fn<(draft: ActivityTemplateDraft) => Promise<ActivityTemplate>>()
    .mockResolvedValue(focusedStudy);

  const { rerender } = render(
    <AccountScreen
      identity={manager}
      templates={[]}
      onSessionChanged={noSessionChange}
      onCreateTemplate={onCreateTemplate}
    />
  );

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Focused Study");
  await user.type(
    screen.getByLabelText("Description"),
    "Quiet reading and problem sets"
  );
  await user.selectOptions(screen.getByLabelText("Measurement Unit"), "minutes");
  await user.type(screen.getByLabelText("Minimum"), "5");
  await user.type(screen.getByLabelText("Maximum"), "45");
  await user.click(
    screen.getByRole("button", { name: "Create Activity Template" })
  );

  expect(onCreateTemplate).toHaveBeenCalledWith({
    name: "Focused Study",
    description: "Quiet reading and problem sets",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 45,
  });

  rerender(
    <AccountScreen
      identity={manager}
      templates={[focusedStudy]}
      onSessionChanged={noSessionChange}
      onCreateTemplate={onCreateTemplate}
    />
  );

  expect(screen.getByText("Focused Study")).toBeVisible();
  expect(screen.getByText("5–45 minutes")).toBeVisible();
  expect(screen.getByLabelText("Name")).toHaveValue("");
});

test("invalid template inputs show accessible field errors without submitting", async () => {
  const onCreateTemplate = vi
    .fn<(draft: ActivityTemplateDraft) => Promise<ActivityTemplate>>()
    .mockResolvedValue(focusedStudy);

  render(
    <AccountScreen
      identity={manager}
      templates={[]}
      onSessionChanged={noSessionChange}
      onCreateTemplate={onCreateTemplate}
    />
  );

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Study");
  await user.selectOptions(screen.getByLabelText("Measurement Unit"), "minutes");
  await user.type(screen.getByLabelText("Minimum"), "5.5");
  await user.type(screen.getByLabelText("Maximum"), "1441");
  await user.click(
    screen.getByRole("button", { name: "Create Activity Template" })
  );

  expect(onCreateTemplate).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Minimum")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  expect(screen.getByLabelText("Maximum")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  expect(screen.getByLabelText("Minimum")).toHaveAccessibleDescription(
    /whole number/i
  );
  expect(screen.getByLabelText("Maximum")).toHaveAccessibleDescription(
    /1,440 minutes/i
  );

  await user.clear(screen.getByLabelText("Minimum"));
  await user.type(screen.getByLabelText("Minimum"), "45");
  await user.clear(screen.getByLabelText("Maximum"));
  await user.type(screen.getByLabelText("Maximum"), "10");
  await user.click(
    screen.getByRole("button", { name: "Create Activity Template" })
  );

  expect(onCreateTemplate).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Maximum")).toHaveAccessibleDescription(
    /greater than or equal to minimum/i
  );
});

test("server rejection displays an error alert while preserving manager inputs", async () => {
  const onCreateTemplate = vi
    .fn<(draft: ActivityTemplateDraft) => Promise<ActivityTemplate>>()
    .mockRejectedValue(new Error("Forbidden"));

  render(
    <AccountScreen
      identity={manager}
      templates={[]}
      onSessionChanged={noSessionChange}
      onCreateTemplate={onCreateTemplate}
    />
  );

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Focused Study");
  await user.type(screen.getByLabelText("Minimum"), "5");
  await user.type(screen.getByLabelText("Maximum"), "45");
  await user.click(
    screen.getByRole("button", { name: "Create Activity Template" })
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  expect(screen.getByLabelText("Name")).toHaveValue("Focused Study");
});

test("Participant sees persisted templates in a selectable library without manager creation controls", async () => {
  render(
    <AccountScreen
      identity={participant}
      templates={[focusedStudy]}
      onSessionChanged={noSessionChange}
    />
  );

  expect(
    screen.queryByRole("button", { name: "Create Activity Template" })
  ).not.toBeInTheDocument();

  const option = screen.getByRole("button", { name: /Focused Study/i });
  expect(option).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Quiet reading and problem sets")).toBeVisible();
  expect(screen.getByText("5–45 minutes")).toBeVisible();

  await userEvent.setup().click(option);
  expect(option).toHaveAttribute("aria-pressed", "true");
});

test("switching Measurement Unit clears stale bound errors and keyboard navigation works end to end", async () => {
  const countsTemplate: ActivityTemplate = {
    ...focusedStudy,
    id: "template-2",
    name: "Flashcards",
    description: "Active recall cards",
    unit: "counts",
    entryMinimum: 10,
    entryMaximum: 1500,
  };
  const onCreateTemplate = vi
    .fn<(draft: ActivityTemplateDraft) => Promise<ActivityTemplate>>()
    .mockResolvedValue(countsTemplate);

  render(
    <AccountScreen
      identity={manager}
      templates={[]}
      onSessionChanged={noSessionChange}
      onCreateTemplate={onCreateTemplate}
    />
  );

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Flashcards");
  await user.type(screen.getByLabelText("Description"), "Active recall cards");
  await user.type(screen.getByLabelText("Minimum"), "10");
  await user.type(screen.getByLabelText("Maximum"), "1500");
  await user.click(
    screen.getByRole("button", { name: "Create Activity Template" })
  );

  expect(screen.getByLabelText("Maximum")).toHaveAttribute(
    "aria-invalid",
    "true"
  );

  await user.selectOptions(screen.getByLabelText("Measurement Unit"), "counts");
  expect(screen.getByLabelText("Maximum")).toHaveAttribute(
    "aria-invalid",
    "false"
  );

  await user.tab();
  expect(screen.getByLabelText("Minimum")).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText("Maximum")).toHaveFocus();
  await user.tab();
  expect(
    screen.getByRole("button", { name: "Create Activity Template" })
  ).toHaveFocus();
  await user.keyboard("{Enter}");

  expect(onCreateTemplate).toHaveBeenCalledWith({
    name: "Flashcards",
    description: "Active recall cards",
    unit: "counts",
    entryMinimum: 10,
    entryMaximum: 1500,
  });
});
