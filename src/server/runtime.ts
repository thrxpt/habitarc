import { existsSync } from "node:fs";

import { Pool } from "pg";

import { createAuthentication } from "./auth";
import type { AuthConfig } from "./auth";
import { createDatabase } from "./database";
import { isLoopbackHost } from "./loopback";

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

let authentication: ReturnType<typeof createAuthentication> | undefined;
export const getAuthentication = () => {
  if (!authentication) {
    const config = readAuthConfig();
    if (config.production && (process.env.K_SERVICE ?? "").length === 0) {
      throw new Error(
        "Production IP handling requires the managed Cloud Run ingress."
      );
    }
    authentication = createAuthentication(createDatabase(createPool()), config);
  }
  return authentication;
};
