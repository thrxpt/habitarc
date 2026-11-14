/* eslint-disable promise/avoid-new -- Promises bridge Node process and socket events in this HTTP integration test. */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";

import { defaultSerovalDeserializerPlugins } from "@tanstack/react-router/ssr/server";
import { Pool } from "pg";
import { fromCrossJSON, toJSONAsync } from "seroval";
import type { SerovalNode } from "seroval";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";

import type { Identity } from "../src/identity";
import { createAuthentication } from "../src/server/auth";
import { createDatabase } from "../src/server/database";
import { migrate } from "../src/server/migrate";
import { provisionAccounts } from "../src/server/provision";
import { createTemplateService } from "../src/server/templates";
import type { ActivityTemplate, TemplateCursor } from "../src/templates";

const databaseURL = process.env.TEST_DATABASE_URL;
if (databaseURL === undefined || databaseURL.length === 0) {
  throw new Error(
    "TEST_DATABASE_URL must name a disposable PostgreSQL database."
  );
}

const databaseName = `templates_${randomUUID().replaceAll("-", "")}`;
const isolatedURL = new URL(databaseURL);
isolatedURL.pathname = `/${databaseName}`;

const control = new Pool({ connectionString: databaseURL });
const pool = new Pool({ connectionString: isolatedURL.toString(), max: 5 });
const otherPool = new Pool({
  connectionString: isolatedURL.toString(),
  max: 5,
});

const database = createDatabase(pool);
const otherDatabase = createDatabase(otherPool);

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
    name: "Program Manager M",
    email: "m@example.test",
    password,
    role: "program-manager",
  },
];

const auth = createAuthentication(database, config);
const firstTemplates = createTemplateService(database);
const secondTemplates = createTemplateService(otherDatabase);

let participantA: Identity;
let managerM: Identity;

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const signInIdentity = async (email: string): Promise<Identity> => {
  const response = await auth.handle(
    new Request(`${config.baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        origin: config.baseURL,
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.7",
      },
      body: JSON.stringify({ email, password }),
    })
  );
  if (response.status !== 200) {
    throw new Error(`Expected sign in to succeed for ${email}`);
  }
  const identity = await auth.identity(
    new Headers({ cookie: cookieFrom(response) })
  );
  if (!identity) {
    throw new Error(`Expected identity for ${email}`);
  }
  return identity;
};

beforeAll(async () => {
  await control.query(`CREATE DATABASE "${databaseName}"`);
  await migrate(pool);
  await provisionAccounts(database, config, accounts);
  participantA = await signInIdentity("a@example.test");
  managerM = await signInIdentity("m@example.test");
});

beforeEach(async () => {
  await pool.query('DELETE FROM "activity_template"');
});

afterAll(async () => {
  await pool.end();
  await otherPool.end();
  await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await control.end();
});

test("Program Manager creates an Activity Template and Participant sees persisted details across independent pools", async () => {
  const created = await firstTemplates.createTemplate(managerM, {
    name: "Focused Study",
    description: "Deep coursework blocks without distractions.",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 45,
  });

  expect(created).toMatchObject({
    name: "Focused Study",
    description: "Deep coursework blocks without distractions.",
    unit: "minutes",
    entryMinimum: 5,
    entryMaximum: 45,
    archivedAt: null,
    version: 1,
  });
  expect(created.id.length).toBeGreaterThan(0);

  const library = await secondTemplates.listTemplates(participantA);
  expect(library).toEqual({ items: [created], nextCursor: null });
});

test("invalid template definitions are rejected without partial writes and database constraints enforce bounds", async () => {
  const invalidPayloads = [
    {
      name: "Zero minimum",
      description: "",
      unit: "minutes",
      entryMinimum: 0,
      entryMaximum: 30,
    },
    {
      name: "Fractional bound",
      description: "",
      unit: "minutes",
      entryMinimum: 5.5,
      entryMaximum: 30,
    },
    {
      name: "Inverted range",
      description: "",
      unit: "minutes",
      entryMinimum: 45,
      entryMaximum: 5,
    },
    {
      name: "Unsupported unit",
      description: "",
      unit: "hours",
      entryMinimum: 1,
      entryMaximum: 2,
    },
    {
      name: "Over minute ceiling",
      description: "",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 1441,
    },
    {
      name: "Over count ceiling",
      description: "",
      unit: "counts",
      entryMinimum: 1,
      entryMaximum: 1_000_001,
    },
  ];

  await Promise.all(
    invalidPayloads.map(async (payload) => {
      await expect(
        firstTemplates.createTemplate(managerM, payload)
      ).rejects.toMatchObject({ status: 400 });
    })
  );

  expect(await secondTemplates.listTemplates(participantA)).toEqual({
    items: [],
    nextCursor: null,
  });

  await expect(
    pool.query(
      'INSERT INTO "activity_template" ("id", "name", "description", "unit", "entry_minimum", "entry_maximum") VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), "Bypass attempt", "", "minutes", 10, 1441]
    )
  ).rejects.toThrow();

  await expect(
    pool.query(
      'INSERT INTO "activity_template" ("id", "name", "description", "unit", "entry_minimum", "entry_maximum") VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), "Bypass unit", "", "hours", 1, 10]
    )
  ).rejects.toThrow();

  expect(await secondTemplates.listTemplates(participantA)).toEqual({
    items: [],
    nextCursor: null,
  });
});

test("Participants cannot create templates directly through the template service", async () => {
  await expect(
    firstTemplates.createTemplate(participantA, {
      name: "Unauthorized Template",
      description: "Should fail",
      unit: "counts",
      entryMinimum: 1,
      entryMaximum: 10,
    })
  ).rejects.toMatchObject({ status: 403 });

  expect(await secondTemplates.listTemplates(participantA)).toEqual({
    items: [],
    nextCursor: null,
  });
});

test("bounded keyset pagination returns every created template beyond 200 without skips or duplicates", async () => {
  const totalTemplates = 205;
  const valuesSql = Array.from({ length: totalTemplates }, (_, index) => {
    const id = `seed-${String(index + 1).padStart(4, "0")}`;
    const name =
      index < 5
        ? "Duplicate Name"
        : `Template ${String(index + 1).padStart(3, "0")}`;
    const micro = String(index % 10).padStart(6, "0");
    return `('${id}', '${name}', 'Description ${index + 1}', 'minutes', 5, 45, '2026-11-15T00:00:00.${micro}Z')`;
  }).join(", ");

  await pool.query(
    `INSERT INTO "activity_template" ("id", "name", "description", "unit", "entry_minimum", "entry_maximum", "created_at") VALUES ${valuesSql}`
  );

  const firstPage = await secondTemplates.listTemplates(participantA, {
    limit: 200,
  });
  expect(firstPage.items).toHaveLength(200);
  expect(firstPage.nextCursor).not.toBeNull();

  // Inserting a template earlier in alphabetical order mid-pagination must not shift or duplicate later pages.
  const frontCreated = await firstTemplates.createTemplate(managerM, {
    name: "000 Concurrent Front Insert",
    description: "Created after page 1",
    unit: "counts",
    entryMinimum: 1,
    entryMaximum: 10,
  });

  const collectRemaining = async (
    cursor: TemplateCursor | null,
    accumulated: ActivityTemplate[]
  ): Promise<ActivityTemplate[]> => {
    if (cursor === null) {
      return accumulated;
    }
    const page = await secondTemplates.listTemplates(participantA, {
      cursor,
      limit: 50,
    });
    const next = [...accumulated, ...page.items];
    return await collectRemaining(page.nextCursor, next);
  };

  const remaining = await collectRemaining(firstPage.nextCursor, []);
  const combined = [...firstPage.items, ...remaining];

  expect(combined).toHaveLength(totalTemplates);
  expect(new Set(combined.map((item) => item.id)).size).toBe(totalTemplates);
  expect(combined.some((item) => item.id === frontCreated.id)).toBe(false);

  const refreshedFirstPage = await secondTemplates.listTemplates(participantA, {
    limit: 200,
  });
  expect(refreshedFirstPage.items[0]?.id).toBe(frontCreated.id);
});

const extractNextCursor = (body: unknown): TemplateCursor | null => {
  if (typeof body !== "object" || body === null || !("result" in body)) {
    return null;
  }
  const { result } = body;
  if (
    typeof result !== "object" ||
    result === null ||
    !("nextCursor" in result)
  ) {
    return null;
  }
  const { nextCursor } = result;
  if (
    typeof nextCursor !== "object" ||
    nextCursor === null ||
    !("name" in nextCursor) ||
    !("createdAt" in nextCursor) ||
    !("id" in nextCursor) ||
    typeof nextCursor.name !== "string" ||
    typeof nextCursor.createdAt !== "string" ||
    typeof nextCursor.id !== "string"
  ) {
    return null;
  }
  return {
    name: nextCursor.name,
    createdAt: nextCursor.createdAt,
    id: nextCursor.id,
  };
};

const serverFunctionPatterns = {
  listTemplates: /\blistTemplates\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  createTemplate:
    /\bcreateTemplate\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  listHabits: /\blistHabits\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
  createHabit: /\bcreateHabit\b[\s\S]*?createClientRpc\("(?<id>[^"]+)"\)/u,
};

const templateServerClient = async (origin: string) => {
  const module = await fetch(`${origin}/src/server/functions.ts`);
  if (!module.ok) {
    throw new Error("Could not load compiled server functions.");
  }
  const source = await module.text();
  return async (
    name: keyof typeof serverFunctionPatterns,
    options: {
      method: "GET" | "POST";
      data?: unknown;
      cookie?: string;
      headers?: Record<string, string>;
    }
  ) => {
    const id = serverFunctionPatterns[name].exec(source)?.groups?.id;
    if (id === undefined || id.length === 0) {
      throw new Error(`Missing compiled server function: ${name}`);
    }
    const url = new URL(`/_serverFn/${id}`, origin);
    const headers: Record<string, string> = {
      cookie: options.cookie ?? "",
      "x-tsr-serverFn": "true",
      accept: "application/json",
      ...options.headers,
    };
    let body: string | undefined;
    if (options.method === "GET") {
      if (options.data !== undefined) {
        url.searchParams.set(
          "payload",
          JSON.stringify(await toJSONAsync({ data: options.data }))
        );
      }
    } else {
      headers["content-type"] = "application/json";
      headers.origin ??= origin;
      body = JSON.stringify(
        await toJSONAsync(
          options.data === undefined ? {} : { data: options.data }
        )
      );
    }
    const response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      const serialized: unknown = JSON.parse(text);
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- The running TanStack server emits Seroval nodes; Seroval validates and decodes them.
      parsed = fromCrossJSON(serialized as SerovalNode, {
        refs: new Map(),
        plugins: defaultSerovalDeserializerPlugins,
      });
    } catch {
      // Plain error text responses (such as global origin rejections) stay strings.
    }
    return { status: response.status, body: parsed };
  };
};

test(
  "TanStack Start enforces template authorization, validation, and persisted reload visibility over HTTP",
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

      const callServerFn = await templateServerClient(origin);

      expect(
        await callServerFn("listTemplates", { method: "GET" })
      ).toMatchObject({
        status: 401,
        body: { error: { message: "Sign in required" } },
      });
      expect(
        await callServerFn("createTemplate", {
          method: "POST",
          data: {
            name: "Focused Study",
            description: "Anonymous write",
            unit: "minutes",
            entryMinimum: 5,
            entryMaximum: 45,
          },
        })
      ).toMatchObject({
        status: 401,
        body: { error: { message: "Sign in required" } },
      });

      const signIn = async (email: string) => {
        const login = await fetch(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        expect(login.status).toBe(200);
        return cookieFrom(login);
      };

      const participantCookie = await signIn("a@example.test");
      const managerCookie = await signIn("m@example.test");

      expect(
        await callServerFn("createTemplate", {
          method: "POST",
          cookie: participantCookie,
          data: {
            name: "Focused Study",
            description: "Participant write",
            unit: "minutes",
            entryMinimum: 5,
            entryMaximum: 45,
          },
        })
      ).toMatchObject({
        status: 403,
        body: { error: { message: "Forbidden" } },
      });

      expect(
        await callServerFn("createTemplate", {
          method: "POST",
          cookie: managerCookie,
          headers: { origin: "https://evil.example" },
          data: {
            name: "Focused Study",
            description: "Cross-origin write",
            unit: "minutes",
            entryMinimum: 5,
            entryMaximum: 45,
          },
        })
      ).toMatchObject({ status: 403 });

      expect(
        await callServerFn("createTemplate", {
          method: "POST",
          cookie: managerCookie,
          data: {
            name: "Focused Study",
            description: "Invalid bounds",
            unit: "minutes",
            entryMinimum: 50,
            entryMaximum: 45,
          },
        })
      ).toMatchObject({ status: 400 });

      const created = await callServerFn("createTemplate", {
        method: "POST",
        cookie: managerCookie,
        data: {
          name: "Focused Study",
          description: "Quiet reading and problem sets",
          unit: "minutes",
          entryMinimum: 5,
          entryMaximum: 45,
        },
      });
      expect(created).toMatchObject({
        status: 200,
        body: {
          result: {
            name: "Focused Study",
            description: "Quiet reading and problem sets",
            unit: "minutes",
            entryMinimum: 5,
            entryMaximum: 45,
          },
        },
      });

      const library = await callServerFn("listTemplates", {
        method: "GET",
        cookie: participantCookie,
      });
      expect(library).toMatchObject({
        status: 200,
        body: {
          result: {
            items: [
              {
                name: "Focused Study",
                description: "Quiet reading and problem sets",
                unit: "minutes",
                entryMinimum: 5,
                entryMaximum: 45,
              },
            ],
            nextCursor: null,
          },
        },
      });

      await callServerFn("createTemplate", {
        method: "POST",
        cookie: managerCookie,
        data: {
          name: "Zebra Counting",
          description: "Second page entry",
          unit: "counts",
          entryMinimum: 1,
          entryMaximum: 20,
        },
      });

      const firstHttpPage = await callServerFn("listTemplates", {
        method: "GET",
        cookie: participantCookie,
        data: { limit: 1 },
      });
      expect(firstHttpPage).toMatchObject({
        status: 200,
        body: {
          result: {
            items: [{ name: "Focused Study" }],
          },
        },
      });
      const httpCursor = extractNextCursor(firstHttpPage.body);
      expect(httpCursor).not.toBeNull();

      const secondHttpPage = await callServerFn("listTemplates", {
        method: "GET",
        cookie: participantCookie,
        data: { cursor: httpCursor, limit: 1 },
      });
      expect(secondHttpPage).toMatchObject({
        status: 200,
        body: {
          result: {
            items: [{ name: "Zebra Counting" }],
            nextCursor: null,
          },
        },
      });

      expect(
        await callServerFn("listTemplates", {
          method: "GET",
          cookie: participantCookie,
          data: { limit: 0 },
        })
      ).toMatchObject({ status: 400 });

      const managerPage = await fetch(origin, {
        headers: { cookie: managerCookie },
      });
      const managerHtml = await managerPage.text();
      expect(managerPage.status).toBe(200);
      expect(managerHtml).toContain("Focused Study");
      expect(managerHtml).not.toContain("a@example.test");
      expect(managerHtml).not.toContain("b@example.test");

      const participantPage = await fetch(origin, {
        headers: { cookie: participantCookie },
      });
      const participantHtml = await participantPage.text();
      expect(participantPage.status).toBe(200);
      expect(participantHtml).toContain("Focused Study");
      expect(participantHtml).toContain("Quiet reading and problem sets");
      expect(participantHtml).toContain("5–45 minutes");

      // Exercise Habit server functions with real sessions, including forged owner data.
      const storedTemplates = await firstTemplates.listTemplates(participantA);
      const template = storedTemplates.items.find(
        (item) => item.name === "Focused Study"
      );
      if (!template) {
        throw new Error("Expected the persisted Focused Study template.");
      }
      const habitDraft = {
        templateId: template.id,
        dailyTarget: 60,
        weekdays: [1, 2, 3, 4, 5],
      };
      await Promise.all(
        (["listHabits", "createHabit"] as const).map(async (name) => {
          const method = name === "listHabits" ? "GET" : "POST";
          expect(
            await callServerFn(name, { method, data: habitDraft })
          ).toMatchObject({ status: 401 });
          expect(
            await callServerFn(name, {
              method,
              data: habitDraft,
              cookie: managerCookie,
            })
          ).toMatchObject({ status: 403 });
        })
      );
      expect(
        await callServerFn("createHabit", {
          method: "POST",
          cookie: participantCookie,
          data: habitDraft,
          headers: { origin: "https://evil.example" },
        })
      ).toMatchObject({ status: 403 });
      expect(
        await callServerFn("createHabit", {
          method: "POST",
          cookie: participantCookie,
          data: { ...habitDraft, weekdays: [] },
        })
      ).toMatchObject({
        status: 400,
        body: {
          result: {
            kind: "invalid",
            fieldErrors: {
              weekdays: "Choose at least one weekday, with no duplicates.",
            },
          },
        },
      });
      const otherCookie = await signIn("b@example.test");
      const otherIdentity = await auth.identity(
        new Headers({ cookie: otherCookie })
      );
      expect(
        await callServerFn("createHabit", {
          method: "POST",
          cookie: participantCookie,
          data: {
            ...habitDraft,
            participantId: otherIdentity?.id,
            startDate: "2000-01-01",
            timezone: "UTC",
          },
        })
      ).toMatchObject({
        status: 200,
        body: {
          result: {
            kind: "created",
            habit: {
              template: { id: template.id },
              goal: { dailyTarget: 60, weekdays: [1, 2, 3, 4, 5] },
            },
          },
        },
      });
      expect(
        await callServerFn("createHabit", {
          method: "POST",
          cookie: participantCookie,
          data: habitDraft,
        })
      ).toMatchObject({ status: 200, body: { result: { kind: "existing" } } });
      expect(
        await callServerFn("listHabits", {
          method: "GET",
          cookie: participantCookie,
        })
      ).toMatchObject({
        status: 200,
        body: {
          result: {
            timezone: "Asia/Bangkok",
            items: [{ goal: { dailyTarget: 60 } }],
          },
        },
      });
      expect(
        await callServerFn("listHabits", {
          method: "GET",
          cookie: otherCookie,
          data: { participantId: participantA.id },
        })
      ).toMatchObject({ status: 200, body: { result: { items: [] } } });
      const habitReload = await fetch(origin, {
        headers: { cookie: participantCookie },
      });
      const habitHtml = await habitReload.text();
      expect(habitReload.status).toBe(200);
      expect(habitHtml).toContain("Your Habits");
      expect(habitHtml).toContain(
        "Monday, Tuesday, Wednesday, Thursday, Friday"
      );
      expect(habitHtml).toContain("Account date:");
      const otherReload = await fetch(origin, {
        headers: { cookie: otherCookie },
      });
      expect(await otherReload.text()).not.toContain(
        "Monday, Tuesday, Wednesday, Thursday, Friday"
      );
      const managerReload = await fetch(origin, {
        headers: { cookie: managerCookie },
      });
      expect(await managerReload.text()).not.toContain("Your Habits");
    } finally {
      if (child.pid !== undefined) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            child.kill("SIGTERM");
          }
        }
      }
      await stopped;
    }
  }
);
