import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig, devices } from "@playwright/test";

import { E2E_ORIGIN } from "./e2e/accounts";

const localEnvFile = new URL(".env.local", import.meta.url);
if (process.env.TEST_DATABASE_URL === undefined && existsSync(localEnvFile)) {
  const { TEST_DATABASE_URL } = parseEnv(readFileSync(localEnvFile, "utf-8"));
  if (TEST_DATABASE_URL !== undefined) {
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  }
}

process.env.HABITARC_E2E_PASSWORD ??= randomBytes(24).toString("base64url");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: E2E_ORIGIN,
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "vpx e2e/server.ts",
    url: E2E_ORIGIN,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
