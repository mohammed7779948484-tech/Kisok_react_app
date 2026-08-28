import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Apply `supabase/migrations/*.sql` to an ephemeral PostgreSQL cluster and hand
 * the caller a connection, then tear everything down.
 *
 * This gives the repo a way to check the REAL schema — the one the migrations
 * actually produce — without a hosted project, Docker, or credentials.
 */
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const BOOTSTRAP = path.join(ROOT, "tools", "db", "supabase-bootstrap.sql");
const PG_BIN = process.env.KISOK_PG_BIN ?? "/usr/lib/postgresql/16/bin";
const PORT = process.env.KISOK_PG_PORT ?? "54329";

/**
 * Signals that the CHECK could not run, as opposed to the schema being wrong.
 * An environment that cannot start PostgreSQL says nothing about whether the
 * types match the migrations, so the caller treats this as inconclusive rather
 * than failing the build — the same distinction `tools/doctor.mjs` draws.
 */
export class PostgresUnavailableError extends Error {
  name = "PostgresUnavailableError";
}

export function postgresAvailable() {
  return fs.existsSync(path.join(PG_BIN, "initdb"));
}

export const PG_BIN_PATH = PG_BIN;

function runAsPostgres(args) {
  // initdb and postgres refuse to run as root, so the cluster runs as the
  // `postgres` system user when this script is invoked with uid 0.
  const asRoot = process.getuid?.() === 0;
  const result = asRoot
    ? spawnSync("su", ["postgres", "-c", args.join(" ")], { encoding: "utf8" })
    : spawnSync(args[0], args.slice(1), { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(
      `${args.join(" ")} failed (${result.status}):\n${result.stderr}${result.stdout}`,
    );
  }
  return result.stdout ?? "";
}

/**
 * Run `body({ query })` against a database with every migration applied.
 * `query` returns parsed JSON rows.
 */
export async function withMigratedDatabase(body) {
  if (!postgresAvailable()) {
    throw new PostgresUnavailableError(
      `PostgreSQL was not found at ${PG_BIN}. Set KISOK_PG_BIN, or install PostgreSQL 16.`,
    );
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kisok-pg-"));
  const asRoot = process.getuid?.() === 0;
  if (asRoot) {
    spawnSync("chown", ["-R", "postgres:postgres", dataDir]);
    fs.chmodSync(dataDir, 0o700);
  }

  let started = false;
  const stop = () => {
    if (!started) return;
    try {
      runAsPostgres([`${PG_BIN}/pg_ctl`, "-D", dataDir, "-m", "immediate", "stop"]);
    } catch {
      // Ephemeral cluster; the directory is removed next regardless.
    }
    started = false;
  };

  try {
    runAsPostgres([
      `${PG_BIN}/initdb`,
      "-D",
      dataDir,
      "-U",
      "postgres",
      "--auth=trust",
      "-E",
      "UTF8",
    ]);
    try {
      runAsPostgres([
        `${PG_BIN}/pg_ctl`,
        "-D",
        dataDir,
        "-o",
        // The socket directory must live inside the throwaway data directory.
        // The default (/var/run/postgresql) is not writable by an unprivileged
        // CI user, which is why the cluster would not start on a GitHub runner.
        `"-p ${PORT} -c listen_addresses=localhost -c unix_socket_directories=${dataDir}"`,
        "-w",
        "-l",
        `${dataDir}/server.log`,
        "start",
      ]);
    } catch (error) {
      // pg_ctl's own message is close to useless alone ("could not start server.
      // Examine the log output."), so surface the log it points at.
      const logPath = path.join(dataDir, "server.log");
      const serverLog = fs.existsSync(logPath)
        ? fs.readFileSync(logPath, "utf8")
        : "(no server log was written)";
      throw new PostgresUnavailableError(`${error.message}\n--- server.log ---\n${serverLog}`);
    }
    started = true;

    const psql = (args) =>
      runAsPostgres([
        `${PG_BIN}/psql`,
        "-v",
        "ON_ERROR_STOP=1",
        // Connect over the socket we just created inside the data directory.
        "-h",
        dataDir,
        "-p",
        PORT,
        "-U",
        "postgres",
        ...args,
      ]);

    psql(["-q", "-f", BOOTSTRAP]);

    const migrations = fs
      .readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const migration of migrations) {
      try {
        psql(["-q", "-f", path.join(MIGRATIONS, migration)]);
      } catch (error) {
        throw new Error(`Migration ${migration} failed to apply:\n${error.message}`);
      }
    }

    const query = (sql) => {
      // `-A -t` keeps psql from decorating the single JSON column.
      const raw = psql(["-A", "-t", "-c", `"${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`]);
      const trimmed = raw.trim();
      return trimmed ? JSON.parse(trimmed) : [];
    };

    return await body({ query, migrationCount: migrations.length });
  } finally {
    stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
