import { expect, test } from "vite-plus/test";

import { getAccountDateRefreshDelay } from "../src/server/tracking";

test("workspace refresh follows Los Angeles midnight on DST transition days", () => {
  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-03-08",
      observedAt: Date.parse("2026-03-08T08:00:00Z"),
    })
  ).toBe(23 * 60 * 60 * 1000);

  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-11-01",
      observedAt: Date.parse("2026-11-01T07:00:00Z"),
    })
  ).toBe(25 * 60 * 60 * 1000);

  expect(
    getAccountDateRefreshDelay({
      timezone: "America/Los_Angeles",
      accountDate: "2026-11-01",
      observedAt: Date.parse("2026-11-01T09:30:00Z"),
    })
  ).toBe(22.5 * 60 * 60 * 1000);
});
