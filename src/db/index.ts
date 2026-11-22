import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/local.db";

// SQLite won't create missing folders, and `next build` opens the client while
// collecting routes, so a fresh clone or CI run would fail without this.
if (url.startsWith("file:")) {
  mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}

const client = createClient({ url });

export const db = drizzle(client, { schema });
