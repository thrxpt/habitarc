import { existsSync } from "node:fs";

import { Pool } from "pg";

import type { Identity } from "../identity";
import { createAuthentication } from "./auth";
import type { AuthConfig } from "./auth";
import { createDatabase } from "./database";
import type { Database } from "./database";
import { createEntryService, readTodayWorkspace } from "./entries";
import { createHabitService, readHabitWorkspace } from "./habits";
import { isLoopbackHost } from "./loopback";
import { createTemplateService } from "./templates";
import {
  evaluateReminder,
  getWorkspaceRefreshDelay,
  readTracking,
} from "./tracking";

// Node loads private local configuration without publishing it through Vite's client env.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export const readAuthConfig = (): AuthConfig => {
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const production = process.env.NODE_ENV === "production";
  if (
    baseURL === undefined ||
    baseURL.length === 0 ||
    secret === undefined ||
    secret.length < 32
  ) {
    throw new Error(
      "Set BETTER_AUTH_URL and a private BETTER_AUTH_SECRET of at least 32 characters."
    );
  }
  const url = new URL(baseURL);
  if (
    url.origin !== baseURL ||
    (production && url.protocol !== "https:") ||
    (!production && !isLoopbackHost(url.hostname))
  ) {
    throw new Error(
      "Use a canonical HTTPS production origin or a loopback development origin."
    );
  }
  return {
    baseURL,
    secret,
    production,
    proxy: production ? "cloud-run" : "local",
  };
};

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error("Set DATABASE_URL to PostgreSQL.");
  }
  return new Pool({ connectionString, max: 5 });
};

let database: Database | undefined;
const getDatabase = () => {
  database ??= createDatabase(createPool());
  return database;
};

let authentication: ReturnType<typeof createAuthentication> | undefined;
export const getAuthentication = () => {
  if (!authentication) {
    const config = readAuthConfig();
    if (config.production && (process.env.K_SERVICE ?? "").length === 0) {
      throw new Error(
        "Production IP handling requires the managed Cloud Run ingress."
      );
    }
    authentication = createAuthentication(getDatabase(), config);
  }
  return authentication;
};

let templateService: ReturnType<typeof createTemplateService> | undefined;
export const getTemplateService = () => {
  templateService ??= createTemplateService(getDatabase());
  return templateService;
};

let habitService: ReturnType<typeof createHabitService> | undefined;
export const getHabitService = () => {
  habitService ??= createHabitService(getDatabase());
  return habitService;
};

let entryService: ReturnType<typeof createEntryService> | undefined;
export const getEntryService = () => {
  entryService ??= createEntryService(getDatabase());
  return entryService;
};

export const readTrackingWorkspace = async (actor: Identity) =>
  await readTracking(getDatabase(), actor, async (transaction, calendar) => {
    const habitWorkspace = await readHabitWorkspace(
      transaction,
      actor.id,
      calendar
    );
    const todayWorkspace = await readTodayWorkspace(
      transaction,
      actor.id,
      calendar
    );
    const upcomingReminders = todayWorkspace.scheduled.flatMap((item) => {
      const { nextDueAt } = evaluateReminder({
        ...calendar,
        reminderTime: item.habit.reminderTime,
        active: true,
        scheduled: item.progress.scheduled,
        completed: item.progress.completed,
      });
      return nextDueAt === null ? [] : [nextDueAt];
    });
    const refreshInMs = getWorkspaceRefreshDelay(calendar, upcomingReminders);
    return { habitWorkspace, todayWorkspace, refreshInMs };
  });
