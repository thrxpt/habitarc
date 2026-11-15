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
  await expect(
    page.getByRole("region", { name: "Today", exact: true })
  ).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Focused study sessions");
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

test("Participant records multiple entries, reloads, exceeds target with bar capped at 100%, retries a lost response, and fits 360px width", async ({
  page,
}) => {
  const templateName = "Today Study E2E";
  await page.goto("/");
  await publishTemplate(page, templateName);

  await signIn(page, "c@example.test");

  // Empty Today state directs Participant to Habit setup.
  const todayRegion = page.getByRole("region", { name: "Today", exact: true });
  await expect(
    todayRegion.getByText("You have no active Habits for today yet.")
  ).toBeVisible();
  await expect(
    todayRegion.getByRole("link", {
      name: "Browse Activity Templates to start a Habit",
    })
  ).toHaveAttribute("href", "#template-library-heading");

  // Start an every-day Habit with Daily Target 60.
  await page
    .getByRole("button", { name: new RegExp(templateName, "u") })
    .click();
  await page.getByLabel("Daily Target", { exact: true }).fill("60");
  for (const checkbox of await page.getByRole("checkbox").all()) {
    // eslint-disable-next-line no-await-in-loop -- Keyboard/checkbox actions must occur sequentially.
    await checkbox.check();
  }
  await page.getByRole("button", { name: "Start Habit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your Habit is saved.");

  // Record two deliberate 25-minute entries.
  await todayRegion.getByRole("button", { name: "Add entry" }).click();
  const amountInput = todayRegion.getByLabel("Amount (minutes)", {
    exact: true,
  });
  await amountInput.fill("25");
  await todayRegion.getByRole("button", { name: "Save entry" }).click();
  await expect(todayRegion.getByRole("status")).toContainText(
    "Saved 25 minutes. Today’s total: 25 minutes."
  );

  await amountInput.fill("25");
  await todayRegion.getByRole("button", { name: "Save entry" }).click();
  await expect(todayRegion.getByRole("status")).toContainText(
    "Saved 25 minutes. Today’s total: 50 minutes."
  );

  // Reload and verify persisted Daily Total 50 and two distinct entries.
  await page.reload();
  const reloadedToday = page.getByRole("region", {
    name: "Today",
    exact: true,
  });
  await expect(reloadedToday).toContainText("50 / 60 minutes");
  await expect(reloadedToday).toContainText("83% · In progress");
  const entryList = reloadedToday.getByRole("list", {
    name: `${templateName} entries today`,
  });
  await expect(entryList.getByRole("listitem")).toHaveCount(2);

  // Simulate a lost response on the 3rd entry (+25), then retry safely without duplicating.
  await reloadedToday.getByRole("button", { name: "Add entry" }).click();
  const retryAmountInput = reloadedToday.getByLabel("Amount (minutes)", {
    exact: true,
  });
  await retryAmountInput.fill("25");

  let droppedOnce = false;
  await page.route("**/_serverFn/*", async (route) => {
    if (!droppedOnce && route.request().method() === "POST") {
      droppedOnce = true;
      await route.fetch();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await reloadedToday.getByRole("button", { name: "Save entry" }).click();
  await expect(reloadedToday.getByRole("alert")).toContainText(
    "We couldn’t confirm whether your entry was saved."
  );
  await expect(reloadedToday.getByRole("status")).toHaveCount(0);
  await expect(retryAmountInput).toHaveValue("25");

  await page.unroute("**/_serverFn/*");
  await reloadedToday.getByRole("button", { name: "Retry save" }).click();
  await expect(reloadedToday.getByRole("status")).toContainText(
    "Entry confirmed (already saved): 25 minutes. Today’s total: 75 minutes."
  );

  // Reload and confirm 75 / 60 minutes, 125%, bar fill capped at 100%, and exactly 3 entries.
  await page.reload();
  const finalToday = page.getByRole("region", { name: "Today", exact: true });
  await expect(finalToday).toContainText("75 / 60 minutes");
  await expect(finalToday).toContainText("125% · Completed");
  await expect(
    finalToday
      .getByRole("list", { name: `${templateName} entries today` })
      .getByRole("listitem")
  ).toHaveCount(3);

  const progressbar = finalToday.getByRole("progressbar", {
    name: `${templateName} daily progress`,
  });
  await expect(progressbar).toHaveAttribute("value", "100");
  await expect(progressbar).toHaveAttribute("max", "100");
  await expect(progressbar).toHaveAttribute(
    "aria-valuetext",
    "75 of 60 minutes (125%)"
  );

  // Verify 360px responsive layout with entry composer open without horizontal overflow.
  await page.setViewportSize({ width: 360, height: 800 });
  await finalToday.getByRole("button", { name: "Add entry" }).click();
  await expect(
    finalToday.getByLabel("Amount (minutes)", { exact: true })
  ).toBeVisible();
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  expect(hasOverflow).toBe(false);
});
