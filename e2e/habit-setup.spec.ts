import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Client } from "pg";

import { e2eDatabaseURL, e2ePassword } from "./accounts";

const signIn = async (page: Page, email: string) => {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true })
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
};

const signOut = async (page: Page) => {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Habitarc" })
  ).toBeVisible();
};

const submitTemplate = async (page: Page, name: string) => {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Quiet reading and problem sets");
  await page
    .getByLabel("Measurement Unit", { exact: true })
    .selectOption("minutes");
  await page.getByLabel("Minimum", { exact: true }).fill("5");
  await page.getByLabel("Maximum", { exact: true }).fill("45");
  await page
    .getByRole("button", { name: "Create Activity Template", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
};

const publishTemplate = async (page: Page, name: string) => {
  await signIn(page, "manager@example.test");
  await submitTemplate(page, name);
  await signOut(page);
};

test("sign-in cannot submit before hydration and its fallback uses POST", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true })
    ).toBeDisabled();
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("method", "post");
  } finally {
    await context.close();
  }
});

test("a Participant starts a private weekday Habit and retrieves it after reload and a new sign-in", async ({
  page,
}, testInfo) => {
  const templateName = "Focused Study E2E";
  await page.goto("/");
  await publishTemplate(page, templateName);
  await page.getByLabel("Email", { exact: true }).fill("a@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect"
  );
  await page.getByLabel("Password", { exact: true }).clear();
  await page.locator("form").screenshot({
    path: testInfo.outputPath("invalid-login.png"),
    caret: "initial",
  });
  await signIn(page, "a@example.test");
  await page
    .getByRole("button", { name: new RegExp(templateName, "u") })
    .click();
  await expect(
    page.getByText("5–45 minutes", { exact: true }).first()
  ).toBeVisible();
  await page.getByLabel("Daily Target", { exact: true }).fill("60");
  for (const weekday of [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]) {
    // eslint-disable-next-line no-await-in-loop -- Browser interactions must complete in order.
    await page.getByRole("checkbox", { name: weekday, exact: true }).check();
  }
  await page.getByRole("button", { name: "Start Habit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your Habit is saved.");
  const habits = page.getByRole("region", { name: "Your Habits", exact: true });
  await expect(
    habits.getByRole("heading", { name: templateName, exact: true })
  ).toBeVisible();
  await expect(habits.getByText("60 minutes", { exact: true })).toBeVisible();
  await expect(
    habits.getByText("Monday, Tuesday, Wednesday, Thursday, Friday", {
      exact: true,
    })
  ).toBeVisible();
  await expect(habits.getByText("5–45 minutes", { exact: true })).toBeVisible();
  const accountDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await expect(habits).toContainText(
    `Account date: ${accountDate} (Asia/Bangkok)`
  );
  await expect(habits).toContainText(`Started ${accountDate}`);
  await page.reload();
  await expect(habits.getByText("60 minutes", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(templateName, "u") })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "You already have an active Habit"
  );
  await expect(
    page.getByRole("button", { name: "Start Habit", exact: true })
  ).toHaveCount(0);
  await expect(habits.getByRole("listitem")).toHaveCount(1);
  await habits.screenshot({
    path: testInfo.outputPath("persisted-habit.png"),
    caret: "initial",
  });
  await signOut(page);
  await page.locator("form").screenshot({
    path: testInfo.outputPath("signed-out.png"),
    caret: "initial",
  });
  await signIn(page, "b@example.test");
  const otherHabits = page.getByRole("region", {
    name: "Your Habits",
    exact: true,
  });
  await expect(otherHabits).toBeVisible();
  await expect(
    otherHabits.getByRole("heading", { name: templateName, exact: true })
  ).toHaveCount(0);
  await signOut(page);
  await signIn(page, "manager@example.test");
  await expect(
    page.getByRole("region", { name: "Your Habits", exact: true })
  ).toHaveCount(0);
  await signOut(page);
  await signIn(page, "a@example.test");
  await expect(habits.getByText("60 minutes", { exact: true })).toBeVisible();
});

test("a narrow-screen Participant corrects invalid settings and starts an every-day Habit", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const templateName = "Daily Reading E2E";
  await page.goto("/");
  await publishTemplate(page, templateName);
  await signIn(page, "b@example.test");
  await page
    .getByRole("button", { name: new RegExp(templateName, "u") })
    .click();
  const target = page.getByLabel("Daily Target", { exact: true });
  await target.fill("4.5");
  await page.getByRole("button", { name: "Start Habit", exact: true }).click();
  await expect(target).toHaveAttribute("aria-invalid", "true");
  await expect(target).toHaveAccessibleDescription(
    /whole number from 5 to 1,440 minutes/u
  );
  await expect(
    page.getByRole("checkbox", { name: "Monday", exact: true })
  ).toHaveAccessibleDescription(/Choose at least one weekday/u);
  await page
    .getByRole("form", { name: `Start ${templateName} Habit` })
    .screenshot({
      path: testInfo.outputPath("rejected-habit-settings.png"),
      caret: "initial",
    });
  await expect(
    page
      .getByRole("region", { name: "Your Habits", exact: true })
      .getByRole("heading", { name: templateName, exact: true })
  ).toHaveCount(0);
  await target.fill("60");
  for (const checkbox of await page.getByRole("checkbox").all()) {
    // eslint-disable-next-line no-await-in-loop -- Keyboard interactions must complete in order.
    await checkbox.focus();
    // eslint-disable-next-line no-await-in-loop -- Verify weekday controls work through the keyboard.
    await page.keyboard.press("Space");
  }
  await page.getByRole("button", { name: "Start Habit", exact: true }).click();
  const habits = page.getByRole("region", { name: "Your Habits", exact: true });
  await expect(habits.getByText("Every day", { exact: true })).toBeVisible();
  await page.reload();
  await expect(habits.getByText("Every day", { exact: true })).toBeVisible();
  await expect(habits.getByText("60 minutes", { exact: true })).toBeVisible();
});

test("template maintenance persists and archiving preserves existing Habit activity", async ({
  page,
  browser,
}) => {
  const name = "Template Lifecycle E2E";
  const editedName = "Retired Study E2E";
  // The browser suite shares a loopback IP. Give this journey its own sign-in budget.
  const database = new Client({
    connectionString: e2eDatabaseURL().toString(),
  });
  await database.connect();
  try {
    await database.query('DELETE FROM "rateLimit"');
  } finally {
    await database.end();
  }
  const participantContext = await browser.newContext();
  try {
    await page.goto("/");
    await signIn(page, "manager@example.test");
    await submitTemplate(page, name);
    const row = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name, exact: true }),
    });
    await row
      .getByRole("button", { name: `Edit ${name}`, exact: true })
      .click();
    const edit = page.getByRole("form", { name: `Edit ${name}` });
    await expect(edit.getByLabel("Name", { exact: true })).toBeFocused();
    await edit.getByLabel("Maximum", { exact: true }).fill("4");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit.getByLabel("Maximum", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await edit.getByLabel("Maximum", { exact: true }).fill("30");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText(
      `${name} was updated.`
    );
    await page.reload();
    await expect(row).toContainText("5–30 minutes");

    const participant = await participantContext.newPage();
    await participant.goto("/");
    await signIn(participant, "a@example.test");
    await participant
      .getByRole("button", { name: new RegExp(name, "u") })
      .click();
    await participant.getByLabel("Daily Target", { exact: true }).fill("60");
    await participant
      .getByRole("checkbox", { name: "Monday", exact: true })
      .check();
    await participant.getByRole("button", { name: "Start Habit" }).click();
    await expect(participant.getByText("Your Habit is saved.")).toBeVisible();
    const today = participant.getByRole("region", {
      name: "Today",
      exact: true,
    });
    const activity = today.getByRole("listitem").filter({
      has: participant.getByRole("heading", { name, exact: true }),
    });
    await activity.getByRole("button", { name: "Add entry" }).click();
    await activity.getByLabel("Amount (minutes)").fill("25");
    await activity.getByRole("button", { name: "Save entry" }).click();
    await expect(activity.getByRole("status")).toContainText(
      "Saved 25 minutes."
    );

    await page.reload();
    await row
      .getByRole("button", { name: `Edit ${name}`, exact: true })
      .click();
    await expect(edit.getByLabel("Measurement Unit")).toBeDisabled();
    await expect(edit.getByLabel("Minimum", { exact: true })).toBeDisabled();
    await expect(edit.getByLabel("Maximum", { exact: true })).toBeDisabled();
    await edit.getByLabel("Name", { exact: true }).fill(editedName);
    await edit
      .getByLabel("Description", { exact: true })
      .fill("Revision practice");
    await edit.getByRole("button", { name: "Save changes" }).click();
    const editedRow = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: editedName, exact: true }),
    });
    await expect(editedRow).toContainText("Revision practice");

    await signOut(participant);
    await signIn(participant, "b@example.test");
    const selection = participant.getByRole("button", {
      name: new RegExp(editedName, "u"),
    });
    await selection.click();
    await participant.getByLabel("Daily Target", { exact: true }).fill("60");
    await participant
      .getByRole("checkbox", { name: "Monday", exact: true })
      .check();

    await editedRow
      .getByRole("button", { name: `Archive ${editedName}`, exact: true })
      .click();
    await expect(
      editedRow.getByRole("button", { name: "Cancel" })
    ).toBeFocused();
    await editedRow.getByRole("button", { name: "Confirm archive" }).click();
    await expect(page.getByRole("status")).toContainText(
      `${editedName} was archived.`
    );
    await expect(page.getByRole("status")).toBeFocused();
    await page.reload();
    await expect(editedRow).toHaveCount(0);

    await participant.getByRole("button", { name: "Start Habit" }).click();
    await expect(participant.getByRole("alert")).toContainText(
      "This Activity Template is no longer available."
    );
    await expect(selection).toHaveCount(0);
    await participant.reload();
    await expect(selection).toHaveCount(0);

    await signOut(participant);
    await signIn(participant, "a@example.test");
    const persisted = today.getByRole("listitem").filter({
      has: participant.getByRole("heading", { name: editedName, exact: true }),
    });
    await expect(
      persisted.getByRole("list", { name: `${editedName} entries today` })
    ).toContainText("25 minutes");
    await persisted.getByRole("button", { name: "Add entry" }).click();
    await persisted.getByLabel("Amount (minutes)").fill("31");
    await persisted.getByRole("button", { name: "Save entry" }).click();
    await expect(persisted.getByLabel("Amount (minutes)")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await persisted.getByLabel("Amount (minutes)").fill("30");
    await persisted.getByRole("button", { name: "Save entry" }).click();
    await expect(persisted.getByRole("status")).toContainText(
      "Today’s total: 55 minutes."
    );
  } finally {
    await participantContext.close();
  }
});
