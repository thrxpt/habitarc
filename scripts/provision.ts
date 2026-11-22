import { createDatabase } from "../src/server/database";
import { formatOperatorDiagnostic } from "../src/server/operator-error";
import { provisionAccounts } from "../src/server/provision";
import { createPool, readAuthConfig } from "../src/server/runtime";

let stage: "stdin" | "config" | "json" | "provision" = "stdin";

const main = async () => {
  if (process.stdin.isTTY) {
    throw new Error("Private input required.");
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 1024 * 1024) {
      throw new Error("Input too large.");
    }
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
