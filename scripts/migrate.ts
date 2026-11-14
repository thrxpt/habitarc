import { migrate } from "../src/server/migrate";
import { createPool } from "../src/server/runtime";

const main = async () => {
  const pool = createPool();
  try {
    await migrate(pool);
    process.stdout.write("Database migrations applied.\n");
  } finally {
    await pool.end();
  }
};
try {
  await main();
} catch {
  process.stderr.write(
    "Migration failed. Check private database configuration and the migration version.\n"
  );
  process.exitCode = 1;
}
