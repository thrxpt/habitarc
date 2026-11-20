import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { addCalendarDays } from "../src/calendar";
import { e2eDatabaseURL, e2ePassword } from "./accounts";

test.beforeEach(async () => {
  // Browser scenarios share the same loopback IP and disposable database.
  const pool = new Pool({ connectionString: e2eDatabaseURL().toString() });
  try {
    await pool.query('TRUNCATE "rateLimit"');
  } finally {
    await pool.end();
  }
});

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

test("Participant records durable progress and safely retries lost responses and failed saves", async ({
  page,
  browser,
}, testInfo) => {
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

  await reloadedToday.getByRole("button", { name: "Close entry form" }).click();
  await reloadedToday.getByRole("button", { name: "Add entry" }).click();
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
  await expect(
    finalToday.getByRole("button", { name: "Add entry" })
  ).toBeEnabled();
  await finalToday.screenshot({
    path: testInfo.outputPath("persisted-progress.png"),
    caret: "initial",
  });

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

  // A failed backend save must leave no entry and retain the request for retry.
  await finalToday.getByLabel("Amount (minutes)", { exact: true }).fill("10");
  let failedRequestBody: string | null = null;
  await page.route("**/_serverFn/*", async (route) => {
    if (route.request().method() === "POST") {
      failedRequestBody = route.request().postData();
      await route.fulfill({ status: 503, body: "Service unavailable" });
      return;
    }
    await route.continue();
  });
  await finalToday.getByRole("button", { name: "Save entry" }).click();
  await expect(finalToday.getByRole("alert")).toContainText(
    "We couldn’t confirm whether your entry was saved."
  );
  await expect(finalToday.getByRole("status")).toHaveCount(0);
  await expect(finalToday).toContainText("75 / 60 minutes");

  // Reload the same account in a second tab while preserving the original retry.
  const persistedPage = await page.context().newPage();
  try {
    await persistedPage.goto("/");
    const persistedToday = persistedPage.getByRole("region", {
      name: "Today",
      exact: true,
    });
    await expect(persistedToday).toContainText("75 / 60 minutes");
    await expect(
      persistedToday
        .getByRole("list", { name: `${templateName} entries today` })
        .getByRole("listitem")
    ).toHaveCount(3);
  } finally {
    await persistedPage.close();
  }

  await page.unroute("**/_serverFn/*");
  let retryRequestBody: string | null = null;
  await page.route("**/_serverFn/*", async (route) => {
    if (route.request().method() === "POST") {
      retryRequestBody = route.request().postData();
    }
    await route.continue();
  });
  await finalToday.getByRole("button", { name: "Retry save" }).click();
  await expect(finalToday.getByRole("status")).toContainText(
    "Saved 10 minutes. Today’s total: 85 minutes."
  );
  expect(failedRequestBody).not.toBeNull();
  expect(retryRequestBody).toBe(failedRequestBody);
  await page.unroute("**/_serverFn/*");
  await page.reload();
  await expect(finalToday).toContainText("85 / 60 minutes");
  await expect(
    finalToday
      .getByRole("list", { name: `${templateName} entries today` })
      .getByRole("listitem")
  ).toHaveCount(4);

  // The reloaded entry action must wait for hydration before accepting clicks.
  const staticContext = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const staticPage = await staticContext.newPage();
    await staticPage.goto("/");
    await expect(
      staticPage.getByRole("button", { name: "Add entry", exact: true })
    ).toBeDisabled();
  } finally {
    await staticContext.close();
  }
});

const openFixtureHistory = async (page: Page) => {
  await page.goto("/");
  await signIn(page, "history@example.test");
  const today = page.getByRole("region", { name: "Today", exact: true });
  const dateLabel = await today.getByText(/Account date:/u).textContent();
  const todayDate = dateLabel?.match(/\d{4}-\d{2}-\d{2}/u)?.[0];
  if (todayDate === undefined) {
    throw new Error("Expected Today’s account date.");
  }
  await page
    .getByRole("link", { name: "View history for History Study E2E" })
    .click();
  return { today, todayDate };
};

test("Participant corrects private dated history, rejects stale edits, and retries a confirmed deletion", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { today, todayDate } = await openFixtureHistory(page);
  const yesterday = addCalendarDays(todayDate, -1);
  const olderDate = addCalendarDays(todayDate, -7);
  const source = page.getByRole("region", { name: todayDate, exact: true });
  const destination = page.getByRole("region", {
    name: yesterday,
    exact: true,
  });
  const older = page.getByRole("region", { name: olderDate, exact: true });
  await expect(source).toContainText("45 / 40 minutes");
  await expect(source).toContainText("Completed");
  await expect(destination).toContainText("10 minutes recorded");
  await expect(destination).toContainText("Off schedule");
  await expect(older).toContainText("Read-only");
  await expect(older.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360
  );

  const secondTab = await page.context().newPage();
  await secondTab.goto(page.url());
  const secondSource = secondTab.getByRole("region", {
    name: todayDate,
    exact: true,
  });
  await secondSource.getByRole("button", { name: /^Edit entry/u }).click();
  await secondSource.getByLabel("Amount (minutes)").fill("35");

  await source.getByRole("button", { name: /^Edit entry/u }).click();
  await source.getByLabel("Amount (minutes)").fill("30");
  await source.getByLabel("Activity date").fill(yesterday);
  let moveStatus: number | undefined;
  let correctionWrites = 0;
  let historyReadFailed = false;
  await page.route("**/_serverFn/*", async (route) => {
    if (route.request().method() === "POST") {
      correctionWrites += 1;
      const response = await route.fetch();
      moveStatus = response.status();
      await route.fulfill({ response });
      return;
    }
    if (moveStatus === 200 && !historyReadFailed) {
      historyReadFailed = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await source.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Entry updated");
  await expect(page.getByRole("alert")).toContainText(
    "History couldn’t reload"
  );
  await expect(
    page.getByRole("button", { name: "Refresh history" })
  ).toBeFocused();
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(source).toContainText("0 / 40 minutes");
  expect(moveStatus).toBe(200);
  expect(historyReadFailed).toBe(true);
  expect(correctionWrites).toBe(1);
  await expect(source.getByRole("heading")).toBeFocused();
  await page.unroute("**/_serverFn/*");
  await expect(source).toContainText("In progress");
  await expect(destination).toContainText("40 minutes recorded");

  await secondSource.getByRole("button", { name: "Save changes" }).click();
  await expect(secondTab.getByRole("alert")).toContainText(
    "This entry changed"
  );
  await expect(secondSource.getByLabel("Amount (minutes)")).toHaveValue("35");
  await secondSource.getByRole("button", { name: "Refresh history" }).click();
  await expect(secondSource).toContainText("0 / 40 minutes");
  const staleMoved = secondTab
    .getByRole("region", { name: yesterday, exact: true })
    .getByRole("listitem")
    .filter({ hasText: "30 minutes" });
  await staleMoved.getByRole("button", { name: /^Edit entry/u }).click();

  const moved = destination
    .getByRole("listitem")
    .filter({ hasText: "30 minutes" });
  await moved.getByRole("button", { name: /^Delete entry/u }).click();
  await expect(destination).toContainText("40 minutes recorded");
  await moved.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    moved.getByRole("button", { name: /^Delete entry/u })
  ).toBeFocused();
  await moved.getByRole("button", { name: /^Delete entry/u }).click();
  let deletionStatus: number | undefined;
  await page.route("**/_serverFn/*", async (route) => {
    if (deletionStatus === undefined && route.request().method() === "POST") {
      const response = await route.fetch();
      deletionStatus = response.status();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await moved.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(destination.getByRole("alert")).toContainText(
    "couldn’t confirm"
  );
  expect(deletionStatus).toBe(200);
  await moved.getByRole("button", { name: "Retry deletion" }).click();
  await expect(destination).toContainText("10 minutes recorded");
  await expect(page.getByRole("status")).toContainText("Entry deleted");
  await expect(moved).toHaveCount(0);
  await staleMoved.getByRole("button", { name: "Save changes" }).click();
  await expect(secondTab.getByRole("alert")).toContainText(
    "This entry is no longer available. Refresh history"
  );
  await secondTab.close();

  const otherPage = await browser.newPage();
  try {
    await otherPage.goto("/");
    await signIn(otherPage, "b@example.test");
    await otherPage.goto(page.url());
    await expect(
      otherPage.getByRole("heading", { name: "History unavailable" })
    ).toBeVisible();
    await expect(otherPage.getByText("10 minutes recorded")).toHaveCount(0);
  } finally {
    await otherPage.close();
  }

  await page.getByRole("link", { name: "Back to workspace" }).click();
  await expect(today).toContainText("0 / 40 minutes");
});

test("An open correction becomes read-only after account midnight", async ({
  page,
}) => {
  const { todayDate } = await openFixtureHistory(page);
  const edgeDate = addCalendarDays(todayDate, -6);
  const nextDate = addCalendarDays(todayDate, 1);
  const edge = page.getByRole("region", { name: edgeDate, exact: true });
  await edge.getByRole("button", { name: /^Edit entry/u }).click();
  await edge.getByLabel("Amount (minutes)").fill("25");
  const chosenDate = edge.getByLabel("Activity date");
  await chosenDate.fill(todayDate);

  const pool = new Pool({ connectionString: e2eDatabaseURL().toString() });
  try {
    await pool.query("UPDATE e2e_clock.override SET instant = $1", [
      `${nextDate}T00:00:10+07:00`,
    ]);
    await edge.getByRole("button", { name: "Save changes" }).click();
    await expect(edge.getByRole("alert")).toContainText(
      `The entry from ${edgeDate} is now read-only.`
    );
    await expect(chosenDate).toHaveAttribute("aria-invalid", "false");
    await edge.getByRole("button", { name: "Refresh history" }).click();
    await expect(edge).toContainText("5 minutes recorded");
    await expect(edge).toContainText("Read-only");
    await expect(edge.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByText("Signed in as History Participant")
    ).toBeVisible();
    await signOut(page);
  } finally {
    await pool.query("UPDATE e2e_clock.override SET instant = NULL");
    await pool.end();
  }
});

test("AC-F07-1: a Participant changes tomorrow’s settings and history keeps the original target", async ({
  page,
}) => {
  const templateName = "Goal Revisions E2E";
  await page.setViewportSize({ width: 360, height: 800 });
  const pool = new Pool({ connectionString: e2eDatabaseURL().toString() });
  const setClock = async (instant: string | null) =>
    await pool.query("UPDATE e2e_clock.override SET instant = $1", [instant]);
  try {
    await setClock("2026-11-16T12:00:00+07:00");
    await page.goto("/");
    await publishTemplate(page, templateName);
    await signIn(page, "b@example.test");

    await page.getByRole("button", { name: templateName }).click();
    const start = page.getByRole("form", {
      name: `Start ${templateName} Habit`,
    });
    await start.getByLabel("Daily Target").fill("60");
    await start.getByRole("checkbox", { name: "Monday" }).check();
    await start.getByRole("checkbox", { name: "Tuesday" }).check();
    await start.getByRole("button", { name: "Start Habit" }).click();
    const today = page.getByRole("region", { name: "Today", exact: true });
    await expect(today).toContainText("0 / 60 minutes");
    await today.getByRole("button", { name: "Add entry" }).click();
    await today.getByLabel("Amount (minutes)").fill("40");
    await today.getByRole("button", { name: "Save entry" }).click();
    await expect(today).toContainText("40 / 60 minutes");

    await setClock("2026-11-17T12:00:00+07:00");
    await page.reload();
    const habits = page.getByRole("region", { name: "Your Habits" });
    const edit = habits.getByRole("button", { name: "Edit goal settings" });
    await edit.click();
    const form = habits.getByRole("form", {
      name: `Edit goal settings for ${templateName}`,
    });
    const save = form.getByRole("button", { name: "Save tomorrow’s settings" });
    await expect(form).toContainText("2026-11-18");
    await form.getByRole("checkbox", { name: "Monday" }).uncheck();
    await form.getByRole("checkbox", { name: "Tuesday" }).uncheck();
    await form.getByLabel("Daily Target").fill("35");
    await save.click();
    await expect(
      form.getByText("Choose at least one weekday, with no duplicates.")
    ).toBeVisible();
    await form.getByRole("checkbox", { name: "Wednesday" }).check();

    const stale = await page.context().newPage();
    try {
      await stale.goto("/");
      await stale.getByRole("button", { name: "Edit goal settings" }).click();
      await stale
        .getByRole("form", { name: `Edit goal settings for ${templateName}` })
        .getByLabel("Daily Target")
        .fill("45");

      let releaseRefresh: (() => void) | undefined;
      let heldRefreshes = 0;
      // eslint-disable-next-line promise/avoid-new -- The test controls when the refresh may continue.
      const refreshReleased = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      let holdReads = false;
      await page.route("**/_serverFn/*", async (route) => {
        if (route.request().method() === "POST") {
          holdReads = true;
        } else if (holdReads) {
          heldRefreshes += 1;
          await refreshReleased;
        }
        await route.continue();
      });
      try {
        await save.click();
        await expect.poll(() => heldRefreshes).toBe(1);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect.poll(() => heldRefreshes).toBeGreaterThan(1);
        await expect(
          habits.getByRole("button", { name: "Close goal settings" })
        ).toBeDisabled();
        await expect(edit).toHaveCount(0);
      } finally {
        releaseRefresh?.();
        await page.unrouteAll({ behavior: "wait" });
      }
      await expect(habits.getByRole("status")).toContainText(
        "Goal settings saved for 2026-11-18."
      );
      await edit.click();
      await expect(form.getByLabel("Daily Target")).toHaveValue("35");
      await form.getByLabel("Daily Target").fill("30");
      await save.click();
      await expect(habits).toContainText("Pending settings from 2026-11-18");
      await expect(habits).toContainText("30 minutes · Wednesday");
      await expect(today).toContainText("0 / 60 minutes");

      await stale
        .getByRole("button", { name: "Save tomorrow’s settings" })
        .press("Enter");
      await expect(stale.getByRole("alert")).toContainText(
        "Your Habit settings changed."
      );
      await expect(
        stale.getByRole("link", { name: "Reload workspace" })
      ).toBeFocused();
      await stale.keyboard.press("Enter");
      await expect(
        stale.getByRole("region", { name: "Your Habits" })
      ).toContainText("30 minutes · Wednesday");
    } finally {
      await stale.close();
    }

    await page.reload();
    await expect(habits).toContainText("30 minutes · Wednesday");
    await habits
      .getByRole("link", { name: `View history for ${templateName}` })
      .click();
    const yesterday = page.getByRole("region", {
      name: "2026-11-16",
      exact: true,
    });
    await expect(yesterday).toContainText("40 / 60 minutes");
    await expect(yesterday).toContainText("Missed");

    await setClock("2026-11-17T23:59:30+07:00");
    await page.clock.install();
    await page.getByRole("link", { name: "Back to workspace" }).click();
    await edit.click();
    await expect(form).toContainText("2026-11-18");
    await form.getByLabel("Daily Target").fill("35");
    await expect(form.getByLabel("Daily Target")).toBeFocused();
    await setClock("2026-11-18T00:00:00+07:00");
    await page.clock.fastForward(31_000);
    await expect(today).toContainText("0 / 30 minutes");
    await expect(habits.getByText(/Pending settings/u)).toHaveCount(0);
    await expect(form.getByLabel("Daily Target")).toHaveValue("35");
    await expect(form.getByRole("alert")).toContainText("This draft was for");
    await expect(save).toBeDisabled();
    await expect(
      habits.getByRole("button", { name: "Close goal settings" })
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await edit.click();
    await expect(form).toContainText("2026-11-19");
    await expect(form.getByLabel("Daily Target")).toHaveValue("30");

    await habits
      .getByRole("link", { name: `View history for ${templateName}` })
      .click();
    await expect(yesterday).toContainText("40 / 60 minutes");
    await expect(
      page.getByRole("region", { name: "2026-11-18", exact: true })
    ).toContainText("0 / 30 minutes");
    await page.getByRole("link", { name: "Back to workspace" }).click();
    await expect(today).toContainText("0 / 30 minutes");
    await expect(habits).toContainText("Wednesday");
    await expect(habits.getByText(/Pending settings/u)).toHaveCount(0);

    await setClock("2026-11-18T23:59:30+07:00");
    let releaseCalendar: (() => void) | undefined;
    let calendarHeld = false;
    // eslint-disable-next-line promise/avoid-new -- Hold a pre-midnight response until after the clock advances.
    const calendarReleased = new Promise<void>((resolve) => {
      releaseCalendar = resolve;
    });
    await page.route("**/_serverFn/*", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (!calendarHeld && body.includes('"refreshInMs"')) {
        calendarHeld = true;
        await calendarReleased;
      }
      await route.fulfill({ response });
    });
    try {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => calendarHeld).toBe(true);
      await setClock("2026-11-19T00:00:01+07:00");
      await page.clock.fastForward(31_000);
    } finally {
      releaseCalendar?.();
      await page.unrouteAll({ behavior: "wait" });
    }
    await expect(today).toContainText("Account date: 2026-11-19");
    await setClock("2026-11-20T00:00:01+07:00");
    await page.clock.fastForward("24:00:00");
    await expect(today).toContainText("Account date: 2026-11-20");
    await setClock("2026-11-21T00:00:01+07:00");
    await page.clock.fastForward("24:00:00");
    await expect(today).toContainText("Account date: 2026-11-21");
  } finally {
    await setClock(null);
    await pool.end();
  }
});

test("AC-F08-3: a Participant archives a Habit from tomorrow, logs today, corrects history after rollover, and starts a fresh Habit", async ({
  page,
}) => {
  const templateName = "Archive Lifecycle E2E";
  await page.setViewportSize({ width: 390, height: 844 });
  const pool = new Pool({ connectionString: e2eDatabaseURL().toString() });
  const setClock = async (instant: string | null) =>
    await pool.query("UPDATE e2e_clock.override SET instant = $1", [instant]);
  try {
    await setClock("2026-11-16T12:00:00+07:00");
    await page.goto("/");
    await publishTemplate(page, templateName);
    await signIn(page, "b@example.test");

    await page
      .getByRole("button", { name: new RegExp(templateName, "u") })
      .click();
    const start = page.getByRole("form", {
      name: `Start ${templateName} Habit`,
    });
    await start.getByLabel("Daily Target").fill("60");
    for (const weekday of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Browser interactions must complete in order.
      await start.getByRole("checkbox", { name: weekday, exact: true }).check();
    }
    await start.getByRole("button", { name: "Start Habit" }).click();
    const today = page.getByRole("region", { name: "Today", exact: true });
    await expect(today).toContainText("0 / 60 minutes");

    await setClock("2026-11-17T12:00:00+07:00");
    await page.reload();
    const habits = page.getByRole("region", {
      name: "Your Habits",
      exact: true,
    });
    await habits
      .getByRole("button", { name: `Archive ${templateName}` })
      .click();
    const archiveForm = habits.getByRole("form", {
      name: `Archive ${templateName}`,
    });
    await expect(archiveForm).toContainText("2026-11-18");
    await expect(archiveForm).toContainText("exclusive");
    await expect(
      archiveForm.getByRole("button", { name: "Cancel" })
    ).toBeFocused();
    await archiveForm.getByRole("button", { name: "Confirm archive" }).click();

    await expect(habits.getByRole("status")).toContainText("2026-11-18");
    await expect(habits).toContainText("Archive begins 2026-11-18");
    await expect(
      habits.getByRole("button", { name: `Archive ${templateName}` })
    ).toHaveCount(0);

    // Today (2026-11-17) remains active and writable.
    const todayCard = today
      .getByRole("listitem")
      .filter({ hasText: templateName });
    await todayCard.getByRole("button", { name: "Add entry" }).click();
    await todayCard.getByLabel("Amount (minutes)").fill("40");
    await todayCard.getByRole("button", { name: "Save entry" }).click();
    await expect(todayCard).toContainText("40 / 60 minutes");

    // Advance to 2026-11-18 (exclusive archive date).
    await setClock("2026-11-18T12:00:00+07:00");
    await page.reload();
    await expect(today).not.toContainText(templateName);
    await expect(habits).toContainText("Archived from 2026-11-18");

    // History remains accessible and 2026-11-17 is still eligible for correction.
    await habits
      .getByRole("link", { name: `View history for ${templateName}` })
      .click();
    const tuesday = page.getByRole("region", {
      name: "2026-11-17",
      exact: true,
    });
    await expect(tuesday).toContainText("40 / 60 minutes");
    await tuesday.getByRole("button", { name: /^Edit entry/u }).click();
    await tuesday.getByLabel("Amount (minutes)").fill("45");
    await tuesday.getByRole("button", { name: "Save changes" }).click();
    await expect(tuesday).toContainText("45 / 60 minutes");

    // Return to workspace and start a fresh Habit from the same template.
    await page.getByRole("link", { name: "Back to workspace" }).click();
    await page
      .getByRole("button", { name: new RegExp(templateName, "u") })
      .click();
    const restart = page.getByRole("form", {
      name: `Start ${templateName} Habit`,
    });
    await restart.getByLabel("Daily Target").fill("30");
    await restart.getByRole("checkbox", { name: "Wednesday" }).check();
    await restart.getByRole("button", { name: "Start Habit" }).click();
    await expect(today).toContainText("0 / 30 minutes");
  } finally {
    await setClock(null);
    await pool.end();
  }
});
