import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
/* eslint-disable no-await-in-loop, promise/avoid-new -- Ordered requests test lifecycle; promises bridge process/socket events. */
import { createServer } from "node:net";

import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vite-plus/test";

import { createAuthentication } from "../src/server/auth";
import { createDatabase } from "../src/server/database";
import { migrate } from "../src/server/migrate";
import { provisionAccounts } from "../src/server/provision";

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL === undefined || databaseURL.length === 0) {
  throw new Error(
    "TEST_DATABASE_URL must name a disposable PostgreSQL database."
  );
}
const databaseName = `auth_${randomUUID().replaceAll("-", "")}`;
const isolatedURL = new URL(databaseURL);
isolatedURL.pathname = `/${databaseName}`;
const control = new Pool({ connectionString: databaseURL });
const pool = new Pool({ connectionString: isolatedURL.toString(), max: 5 });
const otherPool = new Pool({
  connectionString: isolatedURL.toString(),
  max: 5,
});
const database = createDatabase(pool);
const config = {
  baseURL: "https://habitarc.example",
  secret: randomBytes(48).toString("base64"),
  production: true,
  proxy: "cloud-run" as const,
};
const password = randomBytes(24).toString("base64url");
const accounts = [
  {
    name: "Participant A",
    email: "a@example.test",
    password,
    role: "participant",
  },
  {
    name: "Participant B",
    email: "b@example.test",
    password,
    role: "participant",
    timezone: "Europe/London",
  },
  {
    name: "Program Manager",
    email: "m@example.test",
    password,
    role: "program-manager",
  },
];
const first = createAuthentication(database, config);
const second = createAuthentication(createDatabase(otherPool), config);
const request = (
  path: string,
  body?: unknown,
  extra: Record<string, string> = {}
) =>
  new Request(`${config.baseURL}/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: config.baseURL,
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.7",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const readSession = async (response: Response) => {
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !isRecord(body.session) ||
    !isRecord(body.user) ||
    typeof body.session.createdAt !== "string" ||
    typeof body.session.expiresAt !== "string" ||
    typeof body.user.role !== "string"
  ) {
    throw new Error(
      "Expected a session response with dated expiry and user role."
    );
  }
  return {
    session: {
      createdAt: body.session.createdAt,
      expiresAt: body.session.expiresAt,
    },
    user: { role: body.user.role },
    needsRefresh: body.needsRefresh === true,
  };
};
const statusOf = async (response: Promise<Response>) => {
  const result = await response;
  return result.status;
};
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const runOperator = async (command: "migrate" | "provision", input = "") =>
  await new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn("vpx", [`scripts/${command}.ts`], {
        env: {
          ...process.env,
          DATABASE_URL: isolatedURL.toString(),
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: config.secret,
          NODE_ENV: "test",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, output });
      });
      child.stdin.end(input);
    }
  );

beforeAll(async () => {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(pool);
  await provisionAccounts(database, config, accounts);
});
beforeEach(async () => {
  await pool.query('DELETE FROM "rateLimit"');
});
afterAll(async () => {
  await pool.end();
  await otherPool.end();
  await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await control.end();
});

test("two pre-provisioned Participants and a Program Manager sign in with server-owned identity", async () => {
  for (const account of accounts) {
    const response = await first.handle(
      request("sign-in/email", {
        email: account.email,
        password,
        role: "program-manager",
        timezone: "UTC",
      })
    );
    expect(response.status).toBe(200);
    const identity = await second.identity(
      new Headers({ cookie: cookieFrom(response) })
    );
    expect(identity).toMatchObject({
      email: account.email,
      role: account.role,
      timezone: account.timezone ?? "Asia/Bangkok",
    });
  }
});

test("repeat provisioning and migration preserve existing passwords, identities, and sessions", async () => {
  const login = await first.handle(
    request("sign-in/email", { email: accounts[0]?.email, password })
  );
  const headers = new Headers({ cookie: cookieFrom(login) });
  const original = await first.identity(headers);
  await migrate(pool);
  const result = await provisionAccounts(
    database,
    config,
    accounts.map((account) => ({
      ...account,
      password: randomBytes(24).toString("base64url"),
      name: "Changed",
      timezone: "UTC",
    }))
  );
  expect(result).toEqual({ created: 0, preserved: 3 });
  expect(await second.identity(headers)).toEqual(original);
  expect(
    await statusOf(
      first.handle(
        request("sign-in/email", { email: accounts[0]?.email, password })
      )
    )
  ).toBe(200);
});

test("invalid provisioning is rejected before creating any accounts", async () => {
  for (const changes of [
    { password: "short" },
    { role: "admin" },
    { timezone: "Mars/Olympus" },
    { timezone: "+07:00" },
  ]) {
    await expect(
      provisionAccounts(
        database,
        config,
        accounts.map((account) => ({ ...account, ...changes }))
      )
    ).rejects.toThrow();
  }
  await expect(
    provisionAccounts(database, config, [accounts[0]])
  ).rejects.toThrow();
});

test("invalid credentials are generic for existing and unknown accounts", async () => {
  const known = await first.handle(
    request("sign-in/email", {
      email: "a@example.test",
      password: randomBytes(24).toString("base64url"),
    })
  );
  const unknown = await second.handle(
    request("sign-in/email", { email: "unknown@example.test", password })
  );
  expect(known.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(await known.json()).toEqual(await unknown.json());
});

test("only login, current session, and logout are mounted; signup, recovery, and role changes cannot bypass this", async () => {
  for (const path of [
    "sign-up/email",
    "request-password-reset",
    "reset-password",
    "update-user",
    "change-password",
    "admin/create-user",
    "organization/invite-member",
    "sign-in/social",
    "sign-in/email/",
    "%73ign-in/email",
  ]) {
    const response = await first.handle(
      request(path, { ...accounts[0], role: "program-manager" })
    );
    expect(response.status).toBe(404);
  }
});

test("workspace authorization rejects anonymous and wrong-role calls and returns only the signed-in identity", async () => {
  await expect(
    first.workspace(new Headers(), "participant")
  ).rejects.toMatchObject({ status: 401 });
  for (const account of accounts) {
    const response = await first.handle(
      request("sign-in/email", { email: account.email, password })
    );
    const headers = new Headers({ cookie: cookieFrom(response) });
    const role =
      account.role === "participant" ? "participant" : "program-manager";
    expect(await second.workspace(headers, role)).toMatchObject({
      email: account.email,
      role,
    });
    await expect(
      second.workspace(
        headers,
        role === "participant" ? "program-manager" : "participant"
      )
    ).rejects.toMatchObject({ status: 403 });
  }
});

test("production cookies expire in seven days and logout revokes the session on both instances", async () => {
  const response = await first.handle(
    request("sign-in/email", { email: accounts[0]?.email, password })
  );
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-better-auth.session_token="));
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Max-Age=604800");
  expect(
    response.headers
      .getSetCookie()
      .some((value) => value.includes("session_data="))
  ).toBe(false);
  const headers = new Headers({ cookie: cookieFrom(response) });
  expect(await second.identity(headers)).toMatchObject({
    email: accounts[0]?.email,
  });
  expect(
    await statusOf(
      first.handle(request("sign-out", {}, { cookie: cookieFrom(response) }))
    )
  ).toBe(200);
  expect(await first.identity(headers)).toBeNull();
  expect(await second.identity(headers)).toBeNull();
});

test("session reads stay read-only, trusted POST renews at most daily, and expiry is shared", async () => {
  const response = await first.handle(
    request("sign-in/email", { email: accounts[0]?.email, password })
  );
  const cookie = cookieFrom(response);
  const current = await first.handle(
    request("get-session", undefined, { cookie })
  );
  const initial = await readSession(current);
  const created = Date.parse(initial.session.createdAt);
  try {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(created + 23 * 60 * 60 * 1000);
    const early = await second.handle(request("get-session", {}, { cookie }));
    const earlySession = await readSession(early);
    expect(earlySession.session.expiresAt).toBe(initial.session.expiresAt);
    vi.setSystemTime(created + 25 * 60 * 60 * 1000);
    const deferred = await second.handle(
      request("get-session", undefined, {
        cookie,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      })
    );
    const unchanged = await readSession(deferred);
    expect(unchanged.session.expiresAt).toBe(initial.session.expiresAt);
    expect(unchanged.needsRefresh).toBe(true);
    const denied = await second.handle(
      request("get-session", {}, { cookie, origin: "https://evil.example" })
    );
    expect(denied.status).toBe(403);
    const renewed = await second.handle(request("get-session", {}, { cookie }));
    const renewal = await readSession(renewed);
    expect(Date.parse(renewal.session.expiresAt)).toBe(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );
    expect(renewed.headers.getSetCookie().length).toBeGreaterThan(0);
    vi.setSystemTime(created + 26 * 60 * 60 * 1000);
    const again = await first.handle(request("get-session", {}, { cookie }));
    const repeatedSession = await readSession(again);
    expect(repeatedSession.session.expiresAt).toBe(renewal.session.expiresAt);
    vi.setSystemTime(Date.parse(renewal.session.expiresAt) + 1);
    expect(await first.identity(new Headers({ cookie }))).toBeNull();
    expect(await second.identity(new Headers({ cookie }))).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("cross-origin and missing-origin writes fail before credentials or logout are processed", async () => {
  const login = await first.handle(
    request("sign-in/email", { email: accounts[0]?.email, password })
  );
  const cookie = cookieFrom(login);
  for (const origin of ["https://evil.example", "null", ""]) {
    const headers = { origin, cookie };
    expect(
      await statusOf(
        first.handle(
          request(
            "sign-in/email",
            { email: accounts[0]?.email, password },
            headers
          )
        )
      )
    ).toBe(403);
    expect(
      await statusOf(second.handle(request("sign-out", {}, headers)))
    ).toBe(403);
  }
  expect(
    await statusOf(
      first.handle(
        request("sign-out", {}, { cookie, "sec-fetch-site": "cross-site" })
      )
    )
  ).toBe(403);
  expect(await second.identity(new Headers({ cookie }))).not.toBeNull();
});

test("the eleventh login in a minute is throttled across replicas and forged forwarding prefixes cannot evade it", async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await (attempt % 2 ? first : second).handle(
      request(
        "sign-in/email",
        { email: accounts[0]?.email, password },
        {
          "x-forwarded-for": `203.0.113.${attempt + 1}, 198.51.100.9`,
          "x-habitarc-client-ip": `203.0.113.${attempt + 1}`,
          "x-real-ip": `203.0.113.${attempt + 1}`,
        }
      )
    );
    expect(response.status).toBe(200);
  }
  const blocked = await second.handle(
    request(
      "sign-in/email",
      { email: accounts[0]?.email, password },
      { "x-forwarded-for": "203.0.113.99, 198.51.100.9" }
    )
  );
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
  const anotherClient = await first.handle(
    request(
      "sign-in/email",
      { email: accounts[0]?.email, password },
      { "x-forwarded-for": "198.51.100.10" }
    )
  );
  expect(anotherClient.status).toBe(200);
  try {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(
      await statusOf(
        first.handle(
          request(
            "sign-in/email",
            { email: accounts[0]?.email, password },
            { "x-forwarded-for": "198.51.100.9" }
          )
        )
      )
    ).toBe(200);
  } finally {
    vi.useRealTimers();
  }
});

test("concurrent login requests cannot exceed ten admissions across independent pools", async () => {
  const responses = await Promise.all(
    Array.from(
      { length: 20 },
      async (_, index) =>
        await (index % 2 ? first : second).handle(
          request(
            "sign-in/email",
            { email: accounts[0]?.email, password },
            { "x-forwarded-for": "198.51.100.99" }
          )
        )
    )
  );
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    10
  );
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    10
  );
});

test("operator commands accept private stdin, support twelve-character passwords, and never print credentials", async () => {
  const commandPassword = randomBytes(9).toString("base64url");
  const batch = accounts.map((account) => ({
    ...account,
    email: `cli-${account.email}`,
    password: commandPassword,
  }));
  const migrated = await runOperator("migrate");
  expect(migrated).toEqual({
    code: 0,
    output: "Database migrations applied.\n",
  });
  const created = await runOperator("provision", JSON.stringify(batch));
  expect(created).toEqual({
    code: 0,
    output: "Provisioning complete: 3 created, 0 preserved.\n",
  });
  const repeated = await runOperator(
    "provision",
    JSON.stringify(
      batch.map((account) => ({
        ...account,
        password: randomBytes(24).toString("base64url"),
      }))
    )
  );
  expect(repeated).toEqual({
    code: 0,
    output: "Provisioning complete: 0 created, 3 preserved.\n",
  });
  const signedIn = await first.handle(
    request("sign-in/email", {
      email: batch[0]?.email,
      password: commandPassword,
    })
  );
  expect(signedIn.status).toBe(200);
  expect(
    await second.identity(new Headers({ cookie: cookieFrom(signedIn) }))
  ).toMatchObject({ email: batch[0]?.email, role: "participant" });
  const invalid = await runOperator(
    "provision",
    JSON.stringify(
      batch.map((account) => ({ ...account, timezone: "Mars/Olympus" }))
    )
  );
  expect(invalid.code).toBe(1);
  expect(invalid.output).toBe(
    "Provisioning failed. Check private input and database configuration; existing accounts are preserved.\n"
  );
  expect(
    [created, repeated, invalid].some((result) =>
      result.output.includes(commandPassword)
    )
  ).toBe(false);
});

test("local requests cannot choose their own IP and malformed production forwarding fails closed", async () => {
  const local = createAuthentication(database, { ...config, proxy: "local" });
  const results = await Promise.all(
    Array.from(
      { length: 11 },
      async (_, index) =>
        await local.handle(
          request(
            "sign-in/email",
            { email: accounts[0]?.email, password },
            { "x-forwarded-for": `203.0.113.${index + 1}` }
          )
        )
    )
  );
  expect(results.filter((response) => response.status === 200)).toHaveLength(
    10
  );
  expect(results.filter((response) => response.status === 429)).toHaveLength(1);
  for (const value of ["", "bad-address", "198.51.100.7, bad-address"]) {
    const response = await first.handle(
      request(
        "sign-in/email",
        { email: accounts[0]?.email, password },
        { "x-forwarded-for": value }
      )
    );
    expect(response.status).toBe(400);
  }
});

test(
  "TanStack Start serves sign in, server-validated role workspaces, logout, and global write protection",
  { timeout: 30_000 },
  async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const listener = createServer();
      listener.on("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address();
        if (address === null || typeof address === "string") {
          listener.close();
          reject(new Error("Could not allocate test port."));
          return;
        }
        listener.close(() => {
          resolve(address.port);
        });
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(
      "vp",
      ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      {
        detached: true,
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: isolatedURL.toString(),
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: config.secret,
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let logs = "";
    const stopped = new Promise<void>((resolve) => {
      child.on("close", () => {
        resolve();
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("TanStack test server did not start."));
        }, 20_000);
        child.on("error", () => {
          clearTimeout(timeout);
          reject(new Error("TanStack test server failed."));
        });
        child.on("exit", () => {
          clearTimeout(timeout);
          reject(new Error("TanStack test server exited."));
        });
        const read = (chunk: Buffer) => {
          logs += chunk.toString();
          if (logs.includes(origin)) {
            clearTimeout(timeout);
            resolve();
          }
        };
        child.stdout.on("data", read);
        child.stderr.on("data", read);
      });
      const loginPage = await fetch(origin);
      expect(loginPage.status).toBe(200);
      expect(await loginPage.text()).toContain("Sign in to Habitarc");
      expect(loginPage.headers.get("cache-control")).toContain("no-store");
      for (const account of [accounts[0], accounts[2]]) {
        const login = await fetch(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email: account?.email, password }),
        });
        expect(login.status).toBe(200);
        const cookie = cookieFrom(login);
        const workspace = await fetch(origin, { headers: { cookie } });
        const html = await workspace.text();
        expect(workspace.status).toBe(200);
        expect(html.includes(account?.email ?? "missing")).toBe(true);
        expect(html).toContain(
          account?.role === "participant"
            ? "Your workspace"
            : "Activity Templates"
        );
        const current = await fetch(`${origin}/api/auth/get-session`, {
          headers: { cookie },
        });
        const currentSession = await readSession(current);
        expect(currentSession.user.role).toBe(account?.role);
        const logout = await fetch(`${origin}/api/auth/sign-out`, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: "{}",
        });
        expect(logout.status).toBe(200);
        const signedOut = await fetch(origin, { headers: { cookie } });
        expect(await signedOut.text()).toContain("Sign in to Habitarc");
      }
      const crossOrigin = await fetch(origin, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "sec-fetch-site": "same-origin",
        },
      });
      expect(crossOrigin.status).toBe(403);
      const missingOrigin = await fetch(origin, { method: "POST" });
      expect(missingOrigin.status).toBe(403);
      const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(accounts[0]),
      });
      expect(signup.status).toBe(404);
      expect(logs.includes(password) || logs.includes(config.secret)).toBe(
        false
      );
    } finally {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
      await stopped;
    }
  }
);

test("a rejected credential in a provisioning batch leaves no partially created accounts", async () => {
  const batch = accounts.map((account, index) => ({
    ...account,
    email:
      index === 1 ? "invalid..email@example.test" : `rollback-${account.email}`,
  }));
  await expect(provisionAccounts(database, config, batch)).rejects.toThrow();
  const response = await first.handle(
    request("sign-in/email", { email: batch[0]?.email, password })
  );
  expect(response.status).toBe(401);
});
