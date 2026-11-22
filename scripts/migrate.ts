import { migrate } from "../src/server/migrate";
import { formatOperatorDiagnostic } from "../src/server/operator-error";
import { createPool } from "../src/server/runtime";

let stage: "config" | "migrate" = "config";

const main = async () => {
  const pool = createPool();
  try {
    stage = "migrate";
    await migrate(pool);
    process.stdout.write("Database migrations applied.\n");
  } finally {
    await pool.end();
  }
};
try {
  await main();
} catch (error) {
  process.stderr.write(
    `Migration failed. Check private database configuration and the migration version.\nDiagnostic: ${formatOperatorDiagnostic(stage, error)}\n`
  );
  process.exitCode = 1;
}
