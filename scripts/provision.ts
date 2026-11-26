import { closeSync, openSync, readSync } from "node:fs";

import { createDatabase } from "../src/server/database";
import { formatOperatorDiagnostic } from "../src/server/operator-error";
import { provisionAccounts } from "../src/server/provision";
import { createPool, readAuthConfig } from "../src/server/runtime";

const MAX_INPUT_BYTES = 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;

const inputError = (message: string, code: string): Error =>
  Object.assign(new Error(message), { code });

const parseInputPath = (argv: readonly string[]): string | undefined => {
  if (argv.length === 0) {
    return undefined;
  }
  const [flag, filePath] = argv;
  if (
    argv.length === 2 &&
    flag === "--file" &&
    filePath !== undefined &&
    filePath.length > 0
  ) {
    return filePath;
  }
  throw inputError(
    "Usage: provision [--file <private-accounts-file>]",
    "INVALID_ARGS"
  );
};

const toBuffer = (chunk: unknown): Buffer => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return Buffer.from(String(chunk), "utf-8");
};

const readFileBounded = (filePath: string): string => {
  const fd = openSync(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let totalBytes = 0;
    let bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    while (bytesRead > 0) {
      totalBytes += bytesRead;
      if (totalBytes > MAX_INPUT_BYTES) {
        throw inputError("Input too large.", "INPUT_TOO_LARGE");
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    }
    return Buffer.concat(chunks, totalBytes).toString("utf-8");
  } finally {
    closeSync(fd);
  }
};

const readStdinBounded = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw inputError("Private input required.", "STDIN_IS_TTY");
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = toBuffer(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_INPUT_BYTES) {
      throw inputError("Input too large.", "INPUT_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes).toString("utf-8");
};

let stage: "args" | "file" | "stdin" | "config" | "json" | "provision" = "args";

const main = async () => {
  const inputPath = parseInputPath(process.argv.slice(2));
  let input: string;
  if (inputPath === undefined) {
    stage = "stdin";
    input = await readStdinBounded();
  } else {
    stage = "file";
    input = readFileBounded(inputPath);
  }
  if (input.trim().length === 0) {
    throw inputError("Private input is empty.", "EMPTY_INPUT");
  }
  stage = "config";
  const config = readAuthConfig();
  const pool = createPool();
  try {
    stage = "json";
    const accounts: unknown = JSON.parse(input);
    stage = "provision";
    const result = await provisionAccounts(
      createDatabase(pool),
      config,
      accounts
    );
    process.stdout.write(
      `Provisioning complete: ${result.created} created, ${result.preserved} preserved.\n`
    );
  } finally {
    await pool.end();
  }
};
try {
  await main();
} catch (error) {
  process.stderr.write(
    `Provisioning failed. Check private input and database configuration; existing accounts are preserved.\nDiagnostic: ${formatOperatorDiagnostic(stage, error)}\n`
  );
  process.exitCode = 1;
}
