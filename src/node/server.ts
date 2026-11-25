/**
 * Entry point for running drop without Cloudflare:
 *   node --env-file-if-exists=.env dist/node/server.js
 * See .env.example for the settings and the README section "Run with Node.js or Docker".
 * `server.js token …` manages named API tokens instead of starting the server (see ./tokens.ts).
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { startDrop, WORKER_VARS } from "./app";
import { SqliteD1 } from "./bindings";
import { tokenCommand } from "./tokens";

const e = process.env;
const vars = Object.fromEntries(WORKER_VARS.filter((k) => e[k]).map((k) => [k, e[k]!]));
const dataDir = resolve(e.DATA_DIR || "data");
const migrationsDir = resolve(e.MIGRATIONS_DIR || join(dirname(fileURLToPath(import.meta.url)), "../../migrations"));

if (process.argv[2] === "token") {
  mkdirSync(dataDir, { recursive: true });
  const db = new SqliteD1(join(dataDir, "drop.sqlite"));
  db.migrate(migrationsDir);
  const code = await tokenCommand(db, process.argv.slice(3));
  db.close();
  process.exit(code);
}

try {
  const drop = await startDrop({
    vars,
    dataDir,
    migrationsDir,
    port: Number(e.PORT || 8787),
    host: e.HOST || "0.0.0.0",
    publicUrl: e.PUBLIC_URL || undefined,
    trustProxy: e.TRUST_PROXY || undefined,
  });
  console.log(`drop is listening on port ${drop.port}${e.PUBLIC_URL ? ` (${e.PUBLIC_URL})` : ""}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("shutting down");
    await drop.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (err) {
  console.error(String((err as Error).message || err));
  process.exit(1);
}
