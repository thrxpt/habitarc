/* eslint-disable promise/avoid-new -- Bridge child-process completion for the image's public CLI boundary. */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { expect, test, vi } from "vite-plus/test";

const image = process.env.HABITARC_TEST_IMAGE ?? "habitarc:verify";
const origin = "https://habitarc.example";
const secret = randomBytes(48).toString("base64url");
const password = randomBytes(24).toString("base64url");

const docker = async (args: string[], input?: string): Promise<string> =>
  await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env: { ...process.env, BETTER_AUTH_SECRET: secret },
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
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(
          new Error(
            `Image verification command failed (${code}): ${output.replaceAll(secret, "[redacted]").replaceAll(password, "[redacted]")}`
          )
        );
      }
    });
    child.stdin.on("error", reject);
    child.stdin.end(input);
  });

test(
  "the production image applies migrations, serves assets and private identity, and preserves accounts and sessions across replacement",
  { timeout: 120_000 },
  async () => {
    await docker(["image", "inspect", image]);
    const name = `habitarc-verify-${randomUUID()}`;
    const postgres = `${name}-db`;
    const app = `${name}-app`;
    let secretDir: string | undefined;
    const environment = [
      "--env",
      `DATABASE_URL=postgresql://postgres@${postgres}/habitarc`,
      "--env",
      `BETTER_AUTH_URL=${origin}`,
      "--env",
      "BETTER_AUTH_SECRET",
      "--env",
      "K_SERVICE=habitarc-verification",
    ];
    const accounts = JSON.stringify([
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
      },
      {
        name: "Program Manager",
        email: "m@example.test",
        password,
        role: "program-manager",
      },
    ]);
    const operator = async (command: string, input?: string) =>
      await docker(
        [
          "run",
          "--rm",
          "--interactive",
          "--network",
          name,
          ...environment,
          image,
          "node",
          `dist/operators/${command}.mjs`,
        ],
        input
      );

    try {
      await docker(["network", "create", name]);
      await docker([
        "run",
        "--detach",
        "--name",
        postgres,
        "--network",
        name,
        "--env",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "--env",
        "POSTGRES_DB=habitarc",
        "postgres:17-alpine",
      ]);
      await vi.waitFor(
        async () => {
          await docker([
            "exec",
            postgres,
            "pg_isready",
            "-U",
            "postgres",
            "-d",
            "habitarc",
          ]);
        },
        { timeout: 30_000, interval: 500 }
      );
      secretDir = await mkdtemp(nodePath.join(tmpdir(), "habitarc-secret-"));
      await chmod(secretDir, 0o755);
      const dataDir = nodePath.join(secretDir, "..data");
      await mkdir(dataDir, { mode: 0o755 });
      await chmod(dataDir, 0o755);
      const secretTarget = nodePath.join(dataDir, "accounts.json");
      await writeFile(secretTarget, accounts, { mode: 0o444 });
      await chmod(secretTarget, 0o444);
      await symlink(
        nodePath.join("..data", "accounts.json"),
        nodePath.join(secretDir, "accounts.json")
      );
      const jobOutput = await docker([
        "run",
        "--rm",
        "--network",
        name,
        "--volume",
        `${secretDir}:/secrets/habitarc-provision:ro`,
        ...environment,
        image,
        "sh",
        "-ec",
        "node dist/operators/migrate.mjs && node dist/operators/provision.mjs --file /secrets/habitarc-provision/accounts.json",
      ]);
      expect(jobOutput).toContain("Database migrations applied.");
      expect(jobOutput).toContain("3 created, 0 preserved");
      const applicationArgs = [
        "run",
        "--detach",
        "--name",
        app,
        "--network",
        name,
        "--publish",
        "127.0.0.1::8080",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--cap-drop=ALL",
        "--security-opt",
        "no-new-privileges",
        ...environment,
        image,
      ];
      await docker(applicationArgs);
      const address = await docker(["port", app, "8080/tcp"]);
      let baseURL = `http://${address}`;
      const ready = async () => {
        await vi.waitFor(
          async () => {
            const response = await fetch(baseURL);
            expect(response.status).toBe(200);
          },
          { timeout: 30_000, interval: 500 }
        );
      };
      await ready();
      const page = await fetch(baseURL);
      expect(page.headers.get("cache-control")).toContain("no-store");
      const html = await page.text();
      expect(html).toContain("Sign in to Habitarc");
      const script = /<script[^>]+src="(?<src>[^"]+)"/u.exec(html)?.groups?.src;
      expect(script).toBeDefined();
      const asset = await fetch(new URL(script ?? "", baseURL));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toMatch(/javascript/u);
      const signIn = async () =>
        await fetch(`${baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.7",
          },
          body: JSON.stringify({ email: "a@example.test", password }),
        });
      const login = await signIn();
      expect(login.status).toBe(200);
      expect(login.headers.get("set-cookie")).toContain("Secure");
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const headers = { cookie, origin, "x-forwarded-for": "198.51.100.7" };
      const session = async () => {
        const response = await fetch(`${baseURL}/api/auth/get-session`, {
          headers,
        });
        expect(response.status).toBe(200);
        const body: unknown = await response.json();
        return body;
      };
      const identity = await session();
      expect(identity).toMatchObject({
        user: { email: "a@example.test", role: "participant" },
      });
      expect(await operator("migrate")).toContain(
        "Database migrations applied."
      );
      expect(await operator("provision", accounts)).toContain(
        "0 created, 3 preserved"
      );
      await docker(["rm", "--force", app]);
      await docker(applicationArgs);
      const restartedAddress = await docker(["port", app, "8080/tcp"]);
      baseURL = `http://${restartedAddress}`;
      await ready();
      expect(await session()).toEqual(identity);
      const workspace = await fetch(baseURL, { headers });
      expect(await workspace.text()).toContain("Participant A");
      const logout = await fetch(`${baseURL}/api/auth/sign-out`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      });
      expect(logout.status).toBe(200);
      expect(await session()).toBeNull();
      const repeatedLogin = await signIn();
      expect(repeatedLogin.status).toBe(200);
      const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin, "x-forwarded-for": "198.51.100.7" },
      });
      expect(signup.status).toBe(404);
      expect(await docker(["exec", app, "id", "-u"])).toBe("1000");
    } catch (error) {
      const logs = await docker(["logs", app]).catch(
        () => "App did not start."
      );
      throw new Error(
        logs
          .replaceAll(secret, "[redacted]")
          .replaceAll(password, "[redacted]"),
        { cause: error }
      );
    } finally {
      await Promise.allSettled([
        docker(["rm", "--force", "--volumes", app]),
        docker(["rm", "--force", "--volumes", postgres]),
        ...(secretDir === undefined
          ? []
          : [rm(secretDir, { recursive: true, force: true })]),
      ]);
      await docker(["network", "rm", name]).catch(() => {});
    }
  }
);
