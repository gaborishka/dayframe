import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadApiEnv } from "@dayframe/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const env = loadApiEnv(__dirname);
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const migrationsDir = path.resolve(__dirname, "../../drizzle");

  await sql`
    CREATE TABLE IF NOT EXISTS _dayframe_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const alreadyRun = await sql<{ name: string }[]>`
      SELECT name FROM _dayframe_migrations WHERE name = ${file}
    `;

    if (alreadyRun.length > 0) {
      continue;
    }

    const migration = await fs.readFile(path.join(migrationsDir, file), "utf8");

    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx.unsafe(
        `INSERT INTO _dayframe_migrations (name) VALUES ('${file.replaceAll("'", "''")}')`
      );
    });
  }

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
