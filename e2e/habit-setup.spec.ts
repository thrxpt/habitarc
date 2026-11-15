import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { e2ePassword } from "./accounts";

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

const publishTemplate = async (page: Page, name: string) => {
  await signIn(page, "manager@example.test");
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
}) => {
  const templateName = "Focused Study E2E";
  await page.goto("/");
  await publishTemplate(page, templateName);
  await page.getByLabel("Email", { exact: true }).fill("a@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect"
  );
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
  await signOut(page);
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
}) => {
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
