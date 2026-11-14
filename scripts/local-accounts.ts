/* eslint-disable no-bitwise -- File open flags and permission masks are bit fields. */
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { inArray, sql } from "drizzle-orm";
import { Client } from "pg";

import { createDatabase } from "../src/server/database";
import {
  ACCOUNT_PROVISIONING_LOCK,
  provisionAccounts,
} from "../src/server/provision";
import { createPool, readAuthConfig } from "../src/server/runtime";
import { user } from "../src/server/schema";

const templates = [
  { name: "Participant One", email: "one@example.test", role: "participant" },
  { name: "Participant Two", email: "two@example.test", role: "participant" },
  {
    name: "Program Manager",
    email: "manager@example.test",
    role: "program-manager",
  },
];

class LocalAccountsError extends Error {
  override readonly name = "LocalAccountsError";
}

const readCredentials = async (path: string): Promise<unknown> => {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
      throw new LocalAccountsError(
        "Credentials must be a regular private file with permissions 0600."
      );
    }
    return JSON.parse(await file.readFile("utf-8"));
  } finally {
    await file.close();
  }
};

const main = async () => {
  const config = readAuthConfig();
  const databaseClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  if (
    config.production ||
    !["localhost", "127.0.0.1", "::1"].includes(databaseClient.host)
  ) {
    throw new LocalAccountsError(
      "Local accounts require a development origin and loopback PostgreSQL."
    );
  }
  if (process.argv.length > 3) {
    throw new LocalAccountsError(
      "Usage: vp run accounts:local [private-credentials-file]"
    );
  }
  const path = nodePath.resolve(
    process.argv[2] ??
      nodePath.join(
        homedir(),
        ".local",
        "share",
        "habitarc",
        "local-accounts.json"
      )
  );
  await mkdir(nodePath.dirname(path), { recursive: true, mode: 0o700 });
  const directory = await realpath(nodePath.dirname(path));
  const repository = await realpath(
    fileURLToPath(new URL("../", import.meta.url))
  );
  const fromRepository = nodePath.relative(repository, directory);
  const outsideRepository =
    fromRepository === ".." ||
    fromRepository.startsWith(`..${nodePath.sep}`) ||
    nodePath.isAbsolute(fromRepository);
  if (!outsideRepository) {
    throw new LocalAccountsError("Save credentials outside the repository.");
  }
  const pool = createPool();
  try {
    const result = await createDatabase(pool).transaction(
      async (transaction) => {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(${ACCOUNT_PROVISIONING_LOCK})`
        );
        let accounts = await readCredentials(path);
        if (accounts === undefined) {
          const existing = await transaction
            .select({ id: user.id })
            .from(user)
            .where(
              inArray(
                user.email,
                templates.map((account) => account.email)
              )
            )
            .limit(1);
          if (existing.length > 0) {
            throw new LocalAccountsError(
              "Local accounts already exist. Restore the original credentials file; passwords will not be reset."
            );
          }
          accounts = templates.map((account) => ({
            ...account,
            password: randomBytes(24).toString("base64url"),
            timezone: "Asia/Bangkok",
          }));
          const file = await open(path, "wx", 0o600);
          try {
            await file.writeFile(`${JSON.stringify(accounts, null, 2)}\n`);
            await file.sync();
          } finally {
            await file.close();
          }
        }
        return await provisionAccounts(transaction, config, accounts);
      }
    );
    process.stdout.write(
      `Local accounts ready: ${result.created} created, ${result.preserved} preserved.\nCredentials: ${path}\n`
    );
  } finally {
    await pool.end();
  }
};

try {
  await main();
} catch (error) {
  const message =
    error instanceof LocalAccountsError
      ? error.message
      : "Local account setup failed. Check configuration, migrations, and the private credentials file; existing accounts are preserved.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
