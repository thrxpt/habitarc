import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
/* eslint-disable no-await-in-loop, promise/avoid-new -- Ordered requests test lifecycle; promises bridge process/socket events. */
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { defaultSerovalDeserializerPlugins } from "@tanstack/react-router/ssr/server";
import { Pool } from "pg";
import { fromCrossJSON, toJSONAsync } from "seroval";
import type { SerovalNode } from "seroval";
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

const serverFunctionPatterns = {
  getIdentity: /\bgetIdentity\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  getWorkspace: /\bgetWorkspace\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
};

const serverFunctionClient = async (origin: string) => {
  // Use the dev compiler's real IDs and TanStack's serializer, without mocking auth.
  const module = await fetch(`${origin}/src/server/functions.ts`);
  if (!module.ok) {
    throw new Error("Could not load compiled server functions.");
  }
  const source = await module.text();
  return async (
    name: keyof typeof serverFunctionPatterns,
    data?: unknown,
    cookie = ""
  ) => {
    const id = serverFunctionPatterns[name].exec(source)?.groups?.id;
    if (id === undefined || id.length === 0) {
      throw new Error(`Missing compiled server function: ${name}`);
    }
    const url = new URL(`/_serverFn/${id}`, origin);
    if (data !== undefined) {
      url.searchParams.set(
        "payload",
        JSON.stringify(await toJSONAsync({ data }))
      );
    }
    const response = await fetch(url, {
      headers: { cookie, "x-tsr-serverFn": "true", accept: "application/json" },
    });
    const serialized: unknown = await response.json();
    // eslint-disable-next-line typescript/no-unsafe-type-assertion -- The running TanStack server emits Seroval nodes; Seroval validates and decodes them.
    const body: unknown = fromCrossJSON(serialized as SerovalNode, {
      refs: new Map(),
      plugins: defaultSerovalDeserializerPlugins,
    });
    return { status: response.status, body };
  };
};

const runOperator = async (
  command: "migrate" | "provision" | "local-accounts",
  input = "",
  args: string[] = [],
  environment: NodeJS.ProcessEnv = {}
) =>
  await new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn("vpx", [`scripts/${command}.ts`, ...args], {
        env: {
          ...process.env,
          DATABASE_URL: isolatedURL.toString(),
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: config.secret,
          NODE_ENV: "test",
          ...environment,
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
    first.authorizeWorkspace(new Headers(), "participant")
  ).rejects.toMatchObject({ status: 401 });
  for (const account of accounts) {
    const response = await first.handle(
      request("sign-in/email", { email: account.email, password })
    );
    const headers = new Headers({ cookie: cookieFrom(response) });
    const role =
      account.role === "participant" ? "participant" : "program-manager";
    expect(await second.authorizeWorkspace(headers, role)).toMatchObject({
      email: account.email,
      role,
    });
    await expect(
      second.authorizeWorkspace(
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

test("local account generation is private, concurrent-safe, and preserves working credentials on reruns", async () => {
  const directory = await mkdtemp(
    nodePath.join(tmpdir(), "habitarc-local-accounts-")
  );
  const path = nodePath.join(directory, "accounts.json");
  try {
    const runs = await Promise.all([
      runOperator("local-accounts", "", [path], {
        BETTER_AUTH_URL: "http://[::1]:3000",
      }),
      runOperator("local-accounts", "", [path]),
    ]);
    expect(runs.map((run) => run.code)).toEqual([0, 0]);
    expect(runs.map((run) => run.output)).toEqual(
      expect.arrayContaining([
        `Local accounts ready: 3 created, 0 preserved.\nCredentials: ${path}\n`,
        `Local accounts ready: 0 created, 3 preserved.\nCredentials: ${path}\n`,
      ])
    );
    const original = await readFile(path, "utf-8");
    const metadata = await stat(path);
    // eslint-disable-next-line no-bitwise -- Inspect the file's Unix permission bits.
    expect(metadata.mode & 0o777).toBe(0o600);
    const generated: unknown = JSON.parse(original);
    if (!Array.isArray(generated)) {
      throw new TypeError("Expected a private array of local accounts.");
    }
    const entries: unknown[] = generated;
    expect(entries).toHaveLength(3);
    const passwords = new Set<string>();
    for (const account of entries) {
      if (!isRecord(account) || typeof account.password !== "string") {
        throw new Error("Expected generated account credentials.");
      }
      const generatedPassword = account.password;
      expect(generatedPassword).toHaveLength(32);
      passwords.add(generatedPassword);
      expect(runs.some((run) => run.output.includes(generatedPassword))).toBe(
        false
      );
      const login = await first.handle(
        request("sign-in/email", {
          email: account.email,
          password: account.password,
        })
      );
      expect(login.status).toBe(200);
      expect(
        await second.identity(new Headers({ cookie: cookieFrom(login) }))
      ).toMatchObject({
        email: account.email,
        role: account.role,
        timezone: "Asia/Bangkok",
      });
    }
    expect(passwords.size).toBe(3);
    const repeated = await runOperator("local-accounts", "", [path]);
    expect(repeated.code).toBe(0);
    expect(repeated.output).toContain("0 created, 3 preserved");
    expect(await readFile(path, "utf-8")).toBe(original);

    await chmod(path, 0o644);
    const publicFile = await runOperator("local-accounts", "", [path]);
    expect(publicFile.code).toBe(1);
    expect(publicFile.output).toContain("permissions 0600");
    await rm(path);
    const lostFile = await runOperator("local-accounts", "", [path]);
    expect(lostFile.code).toBe(1);
    expect(lostFile.output).toContain("Restore the original credentials file");
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local account generation rejects production, remote databases, and repository credential paths", async () => {
  const directory = await mkdtemp(
    nodePath.join(tmpdir(), "habitarc-local-guard-")
  );
  const path = nodePath.join(directory, "accounts.json");
  try {
    for (const environment of [
      { NODE_ENV: "production", BETTER_AUTH_URL: "https://habitarc.example" },
      { DATABASE_URL: "postgresql://postgres@db.example.test/habitarc" },
      {
        DATABASE_URL:
          "postgresql://postgres@localhost/habitarc?host=db.example.test",
      },
    ]) {
      const rejected = await runOperator(
        "local-accounts",
        "",
        [path],
        environment
      );
      expect(rejected.code).toBe(1);
      expect(rejected.output).toContain(
        "development origin and loopback PostgreSQL"
      );
    }
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    const repositoryPath = nodePath.join(process.cwd(), "local-accounts.json");
    const rejected = await runOperator("local-accounts", "", [repositoryPath]);
    expect(rejected.code).toBe(1);
    expect(rejected.output).toContain("outside the repository");
    await expect(stat(repositoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
      const callServerFunction = await serverFunctionClient(origin);
      expect(await callServerFunction("getIdentity")).toMatchObject({
        status: 200,
        body: { result: null },
      });
      for (const role of ["participant", "program-manager"]) {
        expect(await callServerFunction("getWorkspace", role)).toMatchObject({
          status: 401,
          body: { error: { message: "Sign in required" } },
        });
      }
      for (const account of accounts) {
        const login = await fetch(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email: account?.email, password }),
        });
        expect(login.status).toBe(200);
        const cookie = cookieFrom(login);
        const identity = await callServerFunction(
          "getIdentity",
          undefined,
          cookie
        );
        expect(identity).toMatchObject({
          status: 200,
          body: {
            result: {
              email: account.email,
              role: account.role,
              timezone: account.timezone ?? "Asia/Bangkok",
            },
          },
        });
        expect(
          await callServerFunction("getWorkspace", account.role, cookie)
        ).toEqual(identity);
        expect(
          await callServerFunction(
            "getWorkspace",
            account.role === "participant" ? "program-manager" : "participant",
            cookie
          )
        ).toMatchObject({
          status: 403,
          body: { error: { message: "Forbidden" } },
        });
        expect(
          await callServerFunction("getWorkspace", "admin", cookie)
        ).toMatchObject({
          status: 400,
          body: { error: { message: "Invalid workspace." } },
        });
        if (account === accounts[0]) {
          // Only this suite's disposable database is changed; restore it before continuing.
          await pool.query(
            'ALTER TABLE "session" RENAME TO "unavailable_session"'
          );
          try {
            for (const name of ["getIdentity", "getWorkspace"] as const) {
              expect(
                await callServerFunction(name, account.role, cookie)
              ).toMatchObject({
                status: 503,
                body: {
                  error: { message: "Authentication temporarily unavailable" },
                },
              });
            }
          } finally {
            await pool.query(
              'ALTER TABLE "unavailable_session" RENAME TO "session"'
            );
          }
        }
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
        expect(
          await callServerFunction("getIdentity", undefined, cookie)
        ).toMatchObject({
          status: 200,
          body: { result: null },
        });
        expect(
          await callServerFunction("getWorkspace", account.role, cookie)
        ).toMatchObject({
          status: 401,
          body: { error: { message: "Sign in required" } },
        });
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
