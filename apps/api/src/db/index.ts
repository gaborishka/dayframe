import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";

let client: postgres.Sql | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be loaded before initializing the database");
  }

  return postgres(process.env.DATABASE_URL, {
    max: 10
  });
}

export function getDb() {
  if (!client) {
    client = createClient();
    database = drizzle(client, { schema });
  }

  return database!;
}

export function getSqlClient() {
  if (!client) {
    client = createClient();
    database = drizzle(client, { schema });
  }

  return client;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    database = null;
  }
}

export * from "./schema.js";
