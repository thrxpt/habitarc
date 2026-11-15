import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";

import { Pool } from "pg";

import { createDatabase } from "../src/server/database";
import { migrate } from "../src/server/migrate";
import { provisionAccounts } from "../src/server/provision";
import { E2E_ACCOUNTS, E2E_ORIGIN, e2ePassword } from "./accounts";

const serve = async (databaseURL: string) => {
  const databaseName = `e2e_${randomUUID().replaceAll("-", "")}`;
  const isolatedURL = new URL(databaseURL);
  isolatedURL.pathname = `/${databaseName}`;
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
    await provisionAccounts(
      createDatabase(pool),
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
          DATABASE_URL: isolatedURL.toString(),
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
    "TEST_DATABASE_URL is not set. Export a disposable PostgreSQL connection string in this terminal before running test:e2e (see README.md)."
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
