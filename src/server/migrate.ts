import { fileURLToPath } from "node:url";

import { migrate as migrateDrizzle } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

import { createDatabase } from "./database";

export const migrate = async (pool: Pool) => {
  const client = await pool.connect();
  try {
    // A release job owns migrations. The session lock also serializes accidental duplicate jobs.
    await client.query("SELECT pg_advisory_lock(480103)");
    await migrateDrizzle(createDatabase(client), {
      migrationsFolder: fileURLToPath(
        new URL("../../drizzle", import.meta.url)
      ),
    });
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(480103)");
    } finally {
      client.release();
    }
  }
};
