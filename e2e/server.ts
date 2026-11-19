import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";

import { Pool } from "pg";

import { createDatabase } from "../src/server/database";
import { migrate } from "../src/server/migrate";
import { provisionAccounts } from "../src/server/provision";
import {
  E2E_ACCOUNTS,
  E2E_ORIGIN,
  e2eDatabaseURL,
  e2ePassword,
} from "./accounts";
import { seedEntryHistory } from "./history-fixture";

const serve = async (databaseURL: string) => {
  const isolatedURL = e2eDatabaseURL();
  const databaseName = isolatedURL.pathname.slice(1);
  const control = new Pool({ connectionString: databaseURL });
  const pool = new Pool({ connectionString: isolatedURL.toString(), max: 5 });
  const secret = randomBytes(48).toString("base64url");
  let child: ChildProcess | undefined;
  let stopping = false;
  let databaseCreated = false;
  const stop = () => {
    stopping = true;
    if (
      child?.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await control.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await migrate(pool);
    const database = createDatabase(pool);
    await provisionAccounts(
      database,
      {
        baseURL: E2E_ORIGIN,
        secret,
        production: false,
        proxy: "local",
      },
      E2E_ACCOUNTS.map((account) => ({
        ...account,
        password: e2ePassword(),
        timezone: "Asia/Bangkok",
      }))
    );
    await seedEntryHistory(database);
    // Override the account-date clock for app connections to this disposable database.
    await pool.query(`
      CREATE SCHEMA e2e_clock;
      CREATE TABLE e2e_clock.override (instant timestamptz);
      INSERT INTO e2e_clock.override VALUES (NULL);
      CREATE FUNCTION e2e_clock.clock_timestamp() RETURNS timestamptz
      LANGUAGE sql VOLATILE AS $$
        SELECT coalesce(instant, pg_catalog.clock_timestamp()) FROM e2e_clock.override
      $$;
    `);
    const appDatabaseURL = new URL(isolatedURL);
    const connectionOptions = appDatabaseURL.searchParams.get("options") ?? "";
    appDatabaseURL.searchParams.set(
      "options",
      `${connectionOptions} -c search_path=e2e_clock,pg_catalog,public`.trim()
    );
    if (stopping) {
      return;
    }
    child = spawn(
      "vp",
      ["dev", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
      {
        detached: true,
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: appDatabaseURL.toString(),
          BETTER_AUTH_URL: E2E_ORIGIN,
          BETTER_AUTH_SECRET: secret,
        },
      }
    );
    await once(child, "exit");
    if (!stopping && child.exitCode !== 0) {
      throw new Error("The browser test server exited unexpectedly.");
    }
  } finally {
    stop();
    // vp can exit before its Node worker. Stop the remaining owned process group
    // before removing the database, so idle clients cannot outlive the test run.
    if (child?.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // An already-exited process group needs no further cleanup.
      }
    }
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await pool.end();
    try {
      if (databaseCreated) {
        await control.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`
        );
      }
    } finally {
      await control.end();
    }
  }
};

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL === undefined || databaseURL.length === 0) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Add a disposable PostgreSQL connection string to .env.local or export it before running test:e2e (see README.md)."
  );
}

try {
  await serve(databaseURL);
} catch {
  process.stderr.write(
    "Browser test setup/server failed. Check PostgreSQL and port 4173.\n"
  );
  process.exitCode = 1;
}
