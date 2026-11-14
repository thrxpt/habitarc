import { isIP } from "node:net";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { isAccountTimezone, isRole } from "../identity";
import type { Identity, Role } from "../identity";
import type { Database, Transaction } from "./database";
import * as schema from "./schema";

export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface AuthConfig {
  baseURL: string;
  secret: string;
  production: boolean;
  proxy: "local" | "cloud-run";
}

export const authOptions = (
  database: Database | Transaction,
  config: AuthConfig
) => ({
  database: drizzleAdapter(database, {
    provider: "pg",
    schema,
    transaction: true,
    camelCase: true,
  }),
  baseURL: config.baseURL,
  secret: config.secret,
  trustedOrigins: [config.baseURL],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: { type: "string" as const, required: true, input: false },
      timezone: {
        type: "string" as const,
        required: true,
        input: false,
        defaultValue: "Asia/Bangkok",
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    deferSessionRefresh: true,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database" as const,
    customRules: { "/sign-in/email": { window: 60, max: 10 } },
  },
  advanced: {
    useSecureCookies: config.production,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const },
    trustedProxyHeaders: false,
    ipAddress: { ipAddressHeaders: ["x-habitarc-client-ip"] },
  },
  logger: { disabled: true },
  plugins: [tanstackStartCookies()],
});

// Direct Cloud Run ingress appends the connecting client after any supplied prefix.
// Never use the leftmost caller-supplied address. Additional proxies need a new policy.
const clientIP = (headers: Headers, proxy: AuthConfig["proxy"]) => {
  if (proxy === "local") {
    return "127.0.0.1";
  }
  const chain = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim());
  const client = chain?.at(-1);
  if (client === undefined || client.length === 0 || isIP(client) === 0) {
    throw new AuthError(400, "Trusted client address unavailable");
  }
  return client;
};

export const assertSameOrigin = (headers: Headers, baseURL: string) => {
  if (
    headers.get("origin") !== baseURL ||
    headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AuthError(403, "Forbidden");
  }
};

export const createAuthentication = (
  database: Database,
  config: AuthConfig
) => {
  const auth = betterAuth(authOptions(database, config));
  const identity = async (headers: Headers): Promise<Identity | null> => {
    try {
      const session = await auth.api.getSession({
        headers,
        query: { disableRefresh: true },
      });
      if (!session) {
        return null;
      }
      const { id, name, email, role, timezone } = session.user;
      if (!isRole(role) || !isAccountTimezone(timezone)) {
        throw new AuthError(403, "Forbidden");
      }
      return { id, name, email, role, timezone };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(503, "Authentication temporarily unavailable");
    }
  };
  const workspace = async (headers: Headers, role: Role): Promise<Identity> => {
    const user = await identity(headers);
    if (!user) {
      throw new AuthError(401, "Sign in required");
    }
    if (user.role !== role) {
      throw new AuthError(403, "Forbidden");
    }
    return user;
  };
  const handle = async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const allowed =
      (request.method === "GET" && pathname === "/api/auth/get-session") ||
      (request.method === "POST" &&
        (pathname === "/api/auth/sign-in/email" ||
          pathname === "/api/auth/sign-out" ||
          pathname === "/api/auth/get-session"));
    if (!allowed) {
      return new Response("Not found", { status: 404 });
    }
    try {
      if (request.method === "POST") {
        assertSameOrigin(request.headers, config.baseURL);
      }
      const headers = new Headers(request.headers);
      headers.set("x-habitarc-client-ip", clientIP(headers, config.proxy));
      // TanStack implements the Fetch API without using Node's native Request class.
      const init: RequestInit & { duplex: "half" } = {
        method: request.method,
        headers,
        body: request.body,
        signal: request.signal,
        duplex: "half",
      };
      const response = await auth.handler(new Request(request.url, init));
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof AuthError) {
        return new Response(error.message, { status: error.status });
      }
      // Never serialize database/credential errors into the response or logs.
      return new Response("Authentication temporarily unavailable", {
        status: 503,
      });
    }
  };
  return { handle, identity, workspace };
};
