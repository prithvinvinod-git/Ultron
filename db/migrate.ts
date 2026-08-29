import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import process from "node:process";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const db = drizzle(client);

const migrationsFolder = path.join(process.cwd(), "db", "migrations");

async function run() {
  console.log("Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
  await client.close();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});