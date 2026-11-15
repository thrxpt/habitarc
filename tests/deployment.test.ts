import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { promisify } from "node:util";

import { expect, test } from "vite-plus/test";

// eslint-disable-next-line typescript/strict-void-return -- Node's promisify uses execFile's callback and intentionally ignores its ChildProcess return value.
const execute = promisify(execFile);
// Fake only external CLIs: exercise the real release script and its failure gates.
const cloudCLI = `#!/usr/bin/env bash
set -eu
case "$*" in
  "auth configure-docker "*) ;;
  "artifacts docker images describe "*) printf 'sha256:%064d\\n' 0 ;;
  "run jobs deploy "*) echo migration-configured >> "$DEPLOY_TRACE" ;;
  "run jobs execute "*)
    echo migration-executed >> "$DEPLOY_TRACE"
    [[ $DEPLOY_CASE != migration-failure ]] ;;
  "run deploy "*) echo candidate-staged >> "$DEPLOY_TRACE" ;;
  "run services describe "*)
    echo '{"status":{"traffic":[{"tag":"candidate","revisionName":"habitarc-tested","url":"https://candidate.example"}]}}' ;;
  "run services update-traffic "*) echo traffic-promoted >> "$DEPLOY_TRACE" ;;
  *) exit 2 ;;
esac
`;
const dockerCLI = `#!/usr/bin/env bash
set -eu
case "$*" in
  "load "*|"tag "*|"push "*) ;;
  "image inspect "*) echo "$GITHUB_SHA" ;;
  *) exit 2 ;;
esac
`;
const httpCLI = `#!/usr/bin/env bash
set -eu
echo candidate-probed >> "$DEPLOY_TRACE"
if [[ $DEPLOY_CASE == candidate-failure ]]; then exit 22; fi
if [[ $* == *get-session* ]]; then echo null; fi
`;

const release = async (scenario: string, overrides: NodeJS.ProcessEnv = {}) => {
  const directory = await mkdtemp(nodePath.join(tmpdir(), "habitarc-release-"));
  const trace = nodePath.join(directory, "trace");
  const summary = nodePath.join(directory, "summary");
  try {
    await Promise.all([
      writeFile(nodePath.join(directory, "gcloud"), cloudCLI, { mode: 0o700 }),
      writeFile(nodePath.join(directory, "docker"), dockerCLI, { mode: 0o700 }),
      writeFile(nodePath.join(directory, "curl"), httpCLI, { mode: 0o700 }),
      writeFile(trace, ""),
      writeFile(summary, ""),
    ]);
    let succeeded = true;
    try {
      await execute("bash", ["scripts/deploy.sh", "tested-image.tar"], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          DEPLOY_TRACE: trace,
          DEPLOY_CASE: scenario,
          GCP_PROJECT: "habitarc-test",
          GCP_REGION: "asia-southeast1",
          ARTIFACT_REPOSITORY: "habitarc",
          RUN_SERVICE: "habitarc",
          RUNTIME_SERVICE_ACCOUNT:
            "runtime@habitarc-test.iam.gserviceaccount.com",
          MIGRATION_SERVICE_ACCOUNT:
            "migration@habitarc-test.iam.gserviceaccount.com",
          CLOUD_SQL_INSTANCE: "habitarc-test:asia-southeast1:habitarc",
          AUTH_ORIGIN: "https://habitarc.example",
          DATABASE_SECRET_VERSION: "1",
          MIGRATION_SECRET_VERSION: "1",
          AUTH_SECRET_VERSION: "1",
          GITHUB_SHA: "1234567890123456789012345678901234567890",
          GITHUB_STEP_SUMMARY: summary,
          ...overrides,
        },
      });
    } catch {
      succeeded = false;
    }
    const events = await readFile(trace, "utf-8");
    return {
      succeeded,
      events: events.trim().split("\n").filter(Boolean),
      summary: await readFile(summary, "utf-8"),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("a failed migration prevents staging and traffic promotion", async () => {
  const result = await release("migration-failure");
  expect(result.succeeded).toBe(false);
  expect(result.events).toEqual(["migration-configured", "migration-executed"]);
  expect(result.summary).toBe("");
});

test("a failed candidate probe preserves existing traffic", async () => {
  const result = await release("candidate-failure");
  expect(result.succeeded).toBe(false);
  expect(result.events).toContain("candidate-staged");
  expect(result.events).not.toContain("traffic-promoted");
  expect(result.summary).toBe("");
});

test("a successful release promotes only after migration and candidate checks and records its immutable identity", async () => {
  const result = await release("success");
  expect(result.succeeded).toBe(true);
  expect(result.events).toEqual([
    "migration-configured",
    "migration-executed",
    "candidate-staged",
    "candidate-probed",
    "candidate-probed",
    "traffic-promoted",
  ]);
  expect(result.summary).toContain("Cloud Run revision: habitarc-tested");
  expect(result.summary).toContain(
    "Image: asia-southeast1-docker.pkg.dev/habitarc-test/habitarc/habitarc@sha256:"
  );
});

test.each([
  { AUTH_SECRET_VERSION: "latest" },
  { AUTH_ORIGIN: "https://habitarc.example/path" },
  { CLOUD_SQL_INSTANCE: "habitarc-test:europe-west1:habitarc" },
])(
  "invalid production settings fail before cloud mutations: %j",
  async (settings) => {
    const result = await release("success", settings);
    expect(result.succeeded).toBe(false);
    expect(result.events).toEqual([]);
  }
);
