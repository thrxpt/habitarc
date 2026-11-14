import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";

import * as schema from "./schema";

export const createDatabase = (client: Pool | PoolClient) =>
  drizzle({ client, schema });
export type Database = ReturnType<typeof createDatabase>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
