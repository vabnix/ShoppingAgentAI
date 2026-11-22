import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/local.db",
  },
  // Fail loudly instead of guessing when a change could lose data.
  strict: true,
  verbose: true,
});
