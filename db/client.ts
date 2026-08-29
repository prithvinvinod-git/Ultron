import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@/db/schema";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  authToken: authToken || undefined,
});

export const db = drizzle(client, { schema });

export function getDb() {
  return db;
}