import { createDatabase } from "../src/server/database";
import { provisionAccounts } from "../src/server/provision";
import { createPool, readAuthConfig } from "../src/server/runtime";

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
  const config = readAuthConfig();
  const pool = createPool();
  try {
    const result = await provisionAccounts(
      createDatabase(pool),
      config,
      JSON.parse(input)
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
} catch {
  process.stderr.write(
    "Provisioning failed. Check private input and database configuration; existing accounts are preserved.\n"
  );
  process.exitCode = 1;
}
