import { betterAuth } from "better-auth";

import { authOptions } from "../src/server/auth";
import { createDatabase } from "../src/server/database";
import { createPool, readAuthConfig } from "../src/server/runtime";

// Schema generation only. This instance is never mounted or used to provision accounts.
export const auth = betterAuth(
  authOptions(createDatabase(createPool()), readAuthConfig())
);
