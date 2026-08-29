import { defineConfig } from "drizzle-kit";
import process from "node:process";

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  },
});