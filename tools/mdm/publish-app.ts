/**
 * publish-app.ts — upload a verified KISOK release APK to the ManageEngine
 * App Repository and create or update the enterprise application.
 *
 *     node tools/mdm/publish-app.ts --apk android/app/build/outputs/apk/release/app-release.apk
 *
 * Credentials come from the environment only — MDM_CLIENT_ID,
 * MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN — and are never accepted as flags,
 * never printed, and redacted out of every message this script emits.
 *
 * The pipeline is deliberately five calls and no more:
 *
 *     refresh-token grant          POST {accounts}/oauth/v2/token
 *     upload the APK               POST {mdm}/emsapi/files
 *     wait, only if pending        POST {mdm}/emsapi/fileupload/status
 *     find KISOK by PACKAGE        GET  {mdm}/api/v1/mdm/apps
 *     create or update             POST {mdm}/api/v1/mdm/apps
 *                                  PUT  {mdm}/api/v1/mdm/apps/{app_id}
 *
 * There is no group, label or rollout orchestration: one physical customer
 * tablet is planned, and device assignment is a console decision.
 *
 * Fail closed everywhere. Every required input is checked before the first
 * network call; every unexpected response shape stops the run with a message
 * naming the endpoint. The one rule worth stating twice: the application is
 * matched by PACKAGE IDENTITY (`com.kisok.kiosk`). An App Repository entry
 * that merely shares the display name is never updated.
 *
 * ⚠️ TENANT VALIDATION REQUIRED. These contracts are carried over from the
 * superseded feature/kiosk-runtime branch, which recorded them from the live
 * ManageEngine help pages; they could not be re-opened while writing this
 * (the vendor domain is blocked by the build environment's egress policy).
 * The first real dispatch is the proof. Nothing here guesses silently — an
 * unrecognised response fails the run.
 *
 * No repository or npm imports: node builtins only, so it runs under Node's
 * native TypeScript type-stripping with plain `node`.
 */

import { readFile } from "node:fs/promises";
import process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishInputs {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apkPath: string;
  packageName: string;
  appName: string;
  dataCentre: string;
  dryRun: boolean;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<FetchResponse>;

export interface PublishDeps {
  fetch: FetchLike;
  readApk: (path: string) => Promise<Uint8Array>;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

export type PublishResult =
  | { ok: true; action: "created" | "updated" | "dry-run"; detail: string }
  | { ok: false; failure: string };

/** One entry of the App Repository listing, as far as this script reads it. */
export type ListedApp = Record<string, unknown>;

export type AppMatch =
  | { status: "found"; appId: number | string }
  | { status: "absent" }
  | { status: "ambiguous"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The app this repository builds. The identity, not a display name. */
const DEFAULT_PACKAGE_NAME = "com.kisok.kiosk";
const DEFAULT_APP_NAME = "KISOK";

/** `app_type` 2 = Enterprise (in-house) application. */
const APP_TYPE_ENTERPRISE = 2;

/** Documented `fileStatus` / `file_availability_status` values. */
const FILE_PENDING = 1;
const FILE_COMPLETED = 2;
const FILE_FAILED = 3;

/**
 * No poll interval or timeout is documented, so these are ENGINEERING
 * choices: roughly a minute of waiting, then a named failure.
 */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

/** Bounds the App Repository walk so a broken envelope cannot loop forever. */
const LIST_PAGE_SIZE = 50;
const LIST_MAX_PAGES = 10;

const MULTIPART_BOUNDARY = "KisokReleaseBoundary7f3a1c";

/**
 * Data-centre hosts. Selection is EXPLICIT — there is no "try them all"
 * fallback, because that would send the refresh token to the wrong tenant.
 */
const DATA_CENTRES: Record<string, { accounts: string; mdm: string }> = {
  us: { accounts: "https://accounts.zoho.com", mdm: "https://mdm.manageengine.com" },
  eu: { accounts: "https://accounts.zoho.eu", mdm: "https://mdm.manageengine.eu" },
  in: { accounts: "https://accounts.zoho.in", mdm: "https://mdm.manageengine.in" },
  au: { accounts: "https://accounts.zoho.com.au", mdm: "https://mdm.manageengine.com.au" },
  jp: { accounts: "https://accounts.zoho.jp", mdm: "https://mdm.manageengine.jp" },
  ca: { accounts: "https://accounts.zohocloud.ca", mdm: "https://mdm.manageengine.ca" },
  cn: { accounts: "https://accounts.zoho.com.cn", mdm: "https://mdm.manageengine.cn" },
  sa: { accounts: "https://accounts.zoho.sa", mdm: "https://mdm.manageengine.sa" },
  uk: { accounts: "https://accounts.zoho.uk", mdm: "https://mdm.manageengine.uk" },
};

/**
 * Field spellings that may carry the package identity in an App Repository
 * entry. Several are accepted because the exact spelling could not be
 * re-verified against the live documentation; matching is still POSITIVE —
 * one of these must equal the package, or the entry is not a match.
 */
const PACKAGE_IDENTITY_KEYS = [
  "identifier",
  "bundle_id",
  "package_name",
  "app_package_name",
] as const;

// ---------------------------------------------------------------------------
// Secret handling
// ---------------------------------------------------------------------------

export const REDACTION = "***REDACTED***";

/** Replace every non-empty secret value with a placeholder. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.trim() === "") continue;
    result = result.split(secret).join(REDACTION);
  }
  return result;
}

/** Exactly the values that must never reach a log line. */
export function collectSecretValues(inputs: PublishInputs): string[] {
  return [inputs.clientId, inputs.clientSecret, inputs.refreshToken].filter(
    (value) => value.trim() !== "",
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function resolveDataCentre(code: string): { accounts: string; mdm: string } {
  const hosts = DATA_CENTRES[code.toLowerCase()];
  if (!hosts) {
    throw new Error(
      `MDM_DATA_CENTRE "${code}" is not a known ManageEngine data centre. ` +
        `Use one of: ${Object.keys(DATA_CENTRES).join(", ")}.`,
    );
  }
  return hosts;
}

/** The urlencoded refresh-token grant body. Contains credentials — never printed. */
export function buildTokenExchangeBody(inputs: PublishInputs): string {
  return [
    ["grant_type", "refresh_token"],
    ["client_id", inputs.clientId],
    ["client_secret", inputs.clientSecret],
    ["refresh_token", inputs.refreshToken],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join("&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readId(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") return value;
  return undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

/**
 * Find KISOK in an App Repository listing BY PACKAGE.
 *
 * `ambiguous` is the important outcome: an entry that carries the right
 * display name but no matching package identity is NOT this application as
 * far as this script is concerned, and updating it could overwrite an
 * unrelated app. The run stops and a human decides.
 */
export function matchAppByPackage(
  apps: readonly ListedApp[],
  packageName: string,
  appName: string,
): AppMatch {
  for (const app of apps) {
    const identity = PACKAGE_IDENTITY_KEYS.map((key) => app[key]).find(
      (value) => typeof value === "string" && value === packageName,
    );
    if (identity === undefined) continue;
    const appId = readId(app.app_id);
    if (appId === undefined) {
      return {
        status: "ambiguous",
        reason: `an App Repository entry carries package ${packageName} but no usable app_id`,
      };
    }
    return { status: "found", appId };
  }

  const nameOnly = apps.find((app) => app.app_name === appName);
  if (nameOnly) {
    return {
      status: "ambiguous",
      reason:
        `an App Repository entry is named "${appName}" but carries no package identity matching ` +
        `${packageName} (checked ${PACKAGE_IDENTITY_KEYS.join(", ")}). Refusing to update an app ` +
        `identified only by its display name — confirm the entry in the console`,
    };
  }

  return { status: "absent" };
}

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

export type ResolveResult = { ok: true; inputs: PublishInputs } | { ok: false; problems: string[] };

const USAGE = `
Usage: node tools/mdm/publish-app.ts --apk <path> [--data-centre <code>] [--dry-run]

Required environment (never flags, never printed):
  MDM_CLIENT_ID, MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN

Optional:
  --apk <path>            or APK_PATH
  --data-centre <code>    or MDM_DATA_CENTRE   (default: us)
  --package <name>        or MDM_PACKAGE_NAME  (default: ${DEFAULT_PACKAGE_NAME})
  --app-name <name>       or MDM_APP_NAME      (default: ${DEFAULT_APP_NAME})
  --dry-run               authenticate and read only; upload and write nothing
`.trim();

export function resolveInputs(
  args: readonly string[],
  env: Record<string, string | undefined>,
): ResolveResult {
  const problems: string[] = [];
  const flags = new Map<string, string>();
  let dryRun = false;

  const known = ["--apk", "--data-centre", "--package", "--app-name"];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!known.includes(arg)) {
      problems.push(`unknown flag "${arg}". Known flags: ${known.join(", ")}, --dry-run.`);
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) {
      problems.push(`${arg} was given without a value.`);
      continue;
    }
    flags.set(arg, value);
    i += 1;
  }

  const required = (flag: string | undefined, envName: string, envValue: string | undefined) => {
    const value = flag ?? envValue;
    if (value === undefined || value.trim() === "") {
      problems.push(`${envName} is not set.`);
      return "";
    }
    return value;
  };

  const inputs: PublishInputs = {
    clientId: required(undefined, "MDM_CLIENT_ID", env.MDM_CLIENT_ID),
    clientSecret: required(undefined, "MDM_CLIENT_SECRET", env.MDM_CLIENT_SECRET),
    refreshToken: required(undefined, "MDM_REFRESH_TOKEN", env.MDM_REFRESH_TOKEN),
    apkPath: required(flags.get("--apk"), "APK_PATH (or --apk)", env.APK_PATH),
    packageName: flags.get("--package") ?? env.MDM_PACKAGE_NAME ?? DEFAULT_PACKAGE_NAME,
    appName: flags.get("--app-name") ?? env.MDM_APP_NAME ?? DEFAULT_APP_NAME,
    dataCentre: flags.get("--data-centre") ?? env.MDM_DATA_CENTRE ?? "us",
    dryRun,
  };

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, inputs };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

class PublishFailure extends Error {}

function fail(message: string): never {
  throw new PublishFailure(message);
}

async function request(
  deps: PublishDeps,
  what: string,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
  /**
   * Accept a 2xx that carries no body. A write may legitimately answer 204 or
   * 200-with-nothing, and treating that as a failure AFTER the change landed
   * would send the next dispatch to re-upload an APK that is already there.
   */
  options: { allowEmptyBody?: boolean } = {},
): Promise<unknown> {
  let response: FetchResponse;
  try {
    response = await deps.fetch(url, init);
  } catch (caught) {
    fail(`${what} could not be sent: ${caught instanceof Error ? caught.message : String(caught)}`);
  }
  const body = await response.text();
  if (!response.ok) {
    fail(`${what} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (options.allowEmptyBody === true && body.trim() === "") return {};

  const parsed = tryParseJson(body);
  if (!isRecord(parsed)) {
    fail(`${what} returned a body that is not a JSON object — failing closed`);
  }
  return parsed;
}

function authHeaders(token: string): Record<string, string> {
  // ManageEngine's documented scheme for an OAuth access token.
  return { Authorization: `Bearer ${token}` };
}

async function exchangeToken(
  inputs: PublishInputs,
  hosts: { accounts: string },
  deps: PublishDeps,
): Promise<string> {
  const parsed = await request(deps, "the token exchange", `${hosts.accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildTokenExchangeBody(inputs),
  });
  const token = (parsed as Record<string, unknown>).access_token;
  if (typeof token !== "string" || token === "") {
    fail("the token exchange returned no access_token — failing closed");
  }
  return token;
}

/** The documented multipart framing: exactly one file part. */
function buildMultipartBody(fileName: string, bytes: Uint8Array): Uint8Array {
  const head = Buffer.from(
    `--${MULTIPART_BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/vnd.android.package-archive\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${MULTIPART_BOUNDARY}--\r\n`, "utf8");
  return Buffer.concat([head, Buffer.from(bytes), tail]);
}

async function pollFileReady(
  fileId: number | string,
  hosts: { mdm: string },
  token: string,
  deps: PublishDeps,
): Promise<void> {
  const target = String(fileId);
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await deps.sleep(POLL_INTERVAL_MS);

    const parsed = (await request(
      deps,
      "the file-upload status check",
      `${hosts.mdm}/emsapi/fileupload/status`,
      {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ fileIDs: [target] }),
      },
    )) as Record<string, unknown>;

    const entries = parsed.response;
    if (!Array.isArray(entries)) {
      fail('the file-upload status response carried no "response" array — failing closed');
    }
    const entry = entries.find((item) => isRecord(item) && String(item.file_id) === target);
    if (!isRecord(entry)) {
      fail(`the file-upload status response carried no entry for file ${target} — failing closed`);
    }
    const status = readInteger(entry.file_availability_status);
    if (status === undefined) {
      fail(`the file-upload status entry for file ${target} carried no usable status`);
    }
    if (status === FILE_COMPLETED) return;
    if (status === FILE_FAILED) {
      fail(`ManageEngine reported the uploaded file as FAILED (status ${FILE_FAILED})`);
    }
    lastStatus = status;
  }

  fail(
    `the uploaded file was still not ready after ${POLL_MAX_ATTEMPTS} checks ` +
      `(last file_availability_status: ${lastStatus ?? "none"}). The poll interval and attempt ` +
      "bound are engineering choices — ManageEngine documents no timeout.",
  );
}

async function uploadApk(
  inputs: PublishInputs,
  hosts: { mdm: string },
  token: string,
  deps: PublishDeps,
): Promise<number | string> {
  const bytes = await deps.readApk(inputs.apkPath);
  const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";

  const parsed = (await request(deps, "the APK upload", `${hosts.mdm}/emsapi/files`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      Module: "MDM_APP_MGMT",
      "Content-Type": `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    },
    body: buildMultipartBody(fileName, bytes),
  })) as Record<string, unknown>;

  const fileId = readId(parsed.fileID);
  if (fileId === undefined) fail("the APK upload returned no fileID — failing closed");

  const fileStatus = readInteger(parsed.fileStatus);
  if (fileStatus === FILE_COMPLETED) return fileId;
  if (fileStatus === FILE_FAILED) {
    fail(
      `the APK upload reported fileStatus ${FILE_FAILED} (FAILED) — failing closed, ` +
        "the documented FAILED status is terminal",
    );
  }
  if (fileStatus === FILE_PENDING) {
    deps.log("upload queued for processing; waiting for it to become ready");
    await pollFileReady(fileId, hosts, token, deps);
    return fileId;
  }
  fail(
    `the APK upload returned fileStatus ${String(parsed.fileStatus)}, which is not documented ` +
      `(${FILE_PENDING} pending, ${FILE_COMPLETED} completed, ${FILE_FAILED} failed)`,
  );
}

async function findApp(
  inputs: PublishInputs,
  hosts: { mdm: string },
  token: string,
  deps: PublishDeps,
): Promise<AppMatch> {
  const origin = new URL(hosts.mdm).origin;
  // The limit is sent on the FIRST page too. Without it the tenant's own
  // default page size applies, and the "a page shorter than LIST_PAGE_SIZE is
  // the last page" heuristic below would stop the walk after one page — which
  // would report KISOK absent and CREATE a duplicate enterprise app.
  let url = `${hosts.mdm}/api/v1/mdm/apps?limit=${LIST_PAGE_SIZE}&offset=0`;
  let seen = 0;
  const collected: ListedApp[] = [];

  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const parsed = (await request(deps, `the App Repository listing (page ${page})`, url, {
      method: "GET",
      headers: authHeaders(token),
    })) as Record<string, unknown>;

    const apps = parsed.apps;
    if (!Array.isArray(apps)) {
      fail(`the App Repository listing (page ${page}) carried no "apps" array — failing closed`);
    }
    for (const app of apps) if (isRecord(app)) collected.push(app);

    // Match as we go: a hit on page 1 need not walk the whole repository.
    const match = matchAppByPackage(collected, inputs.packageName, inputs.appName);
    if (match.status === "found") return match;

    seen += apps.length;
    const paging = isRecord(parsed.paging) ? parsed.paging : undefined;
    const next = typeof paging?.next === "string" && paging.next !== "" ? paging.next : undefined;

    // Running out of pages is NOT evidence that KISOK is absent. Falling
    // through to `absent` would take the create branch and add a second
    // enterprise app — the duplicate this matching exists to prevent. It
    // guards BOTH advance paths below: an earlier version sat after the
    // paging.next `continue`, which skipped it entirely.
    const outOfPages = (): AppMatch => ({
      status: "ambiguous",
      reason:
        `the App Repository listing did not finish within ${LIST_MAX_PAGES} pages ` +
        `(${seen} entries read), so ${inputs.packageName} cannot be confirmed present or ` +
        "absent — failing closed rather than risking a duplicate app",
    });

    if (next !== undefined) {
      // The next URL is untrusted response data and every request carries the
      // access token, so it is followed only within the MDM host's own origin.
      let nextOrigin: string | undefined;
      try {
        nextOrigin = new URL(next).origin;
      } catch {
        nextOrigin = undefined;
      }
      if (nextOrigin !== origin) {
        fail(
          "the App Repository listing's paging.next points outside the MDM host — failing closed: " +
            "the access token is never sent to another origin",
        );
      }
      if (page === LIST_MAX_PAGES) return outOfPages();
      url = next;
      continue;
    }

    // Terminators, most reliable first. A documented total WINS over the
    // short-page heuristic: a tenant may answer with fewer rows than the limit
    // and still have more to give, and stopping there would report KISOK
    // absent and create a duplicate enterprise app.
    const metadata = isRecord(parsed.metadata) ? parsed.metadata : undefined;
    const total = readInteger(metadata?.total_record_count);
    if (total !== undefined) {
      if (seen >= total) break;
      // A total promised more rows and this page delivered none. That is an
      // incomplete listing, not the end of one — breaking here would run the
      // match over partial data and create a duplicate app. Fail closed.
      if (apps.length === 0) return outOfPages();
    } else {
      // No metadata to contradict it, so a short or empty page really is the
      // end of the listing and an absent KISOK really is absent.
      if (apps.length < LIST_PAGE_SIZE) break;
    }
    if (page === LIST_MAX_PAGES) return outOfPages();
    url = `${hosts.mdm}/api/v1/mdm/apps?limit=${LIST_PAGE_SIZE}&offset=${seen}`;
  }

  return matchAppByPackage(collected, inputs.packageName, inputs.appName);
}

/**
 * Run the pipeline. Returns a result rather than throwing, so the CLI owns
 * the exit code and the redaction of whatever is printed.
 */
export async function publish(inputs: PublishInputs, deps: PublishDeps): Promise<PublishResult> {
  // Mutable on purpose: the exchanged access token is a credential too, and a
  // ManageEngine error body that echoes the bearer would otherwise reach the
  // CI log in clear text. It joins the set the moment it exists.
  const secrets = collectSecretValues(inputs);
  try {
    const hosts = resolveDataCentre(inputs.dataCentre);
    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    if (inputs.dryRun) {
      const match = await findApp(inputs, hosts, token, deps);
      if (match.status === "ambiguous") fail(match.reason);
      return {
        ok: true,
        action: "dry-run",
        detail:
          match.status === "found"
            ? `authenticated; ${inputs.packageName} is app_id ${match.appId} — a real run would UPDATE it`
            : `authenticated; ${inputs.packageName} is not in the App Repository — a real run would CREATE it`,
      };
    }

    const fileId = await uploadApk(inputs, hosts, token, deps);
    const match = await findApp(inputs, hosts, token, deps);
    if (match.status === "ambiguous") fail(match.reason);

    if (match.status === "found") {
      await request(
        deps,
        `the app update for app_id ${match.appId}`,
        `${hosts.mdm}/api/v1/mdm/apps/${match.appId}`,
        {
          method: "PUT",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({
            app_name: inputs.appName,
            app_type: APP_TYPE_ENTERPRISE,
            app_file: fileId,
          }),
        },
        { allowEmptyBody: true },
      );
      return {
        ok: true,
        action: "updated",
        detail: `updated ${inputs.packageName} (app_id ${match.appId}) with file ${fileId}`,
      };
    }

    const created = (await request(deps, "the app creation", `${hosts.mdm}/api/v1/mdm/apps`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        app_name: inputs.appName,
        app_type: APP_TYPE_ENTERPRISE,
        app_file: fileId,
      }),
    })) as Record<string, unknown>;

    const appId = readId(created.app_id);
    if (appId === undefined) fail("the app creation returned no app_id — failing closed");

    return {
      ok: true,
      action: "created",
      detail: `created ${inputs.packageName} as app_id ${appId} from file ${fileId}`,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { ok: false, failure: redactSecrets(message, secrets) };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function createNodeDeps(): PublishDeps {
  return {
    fetch: (url, init) => fetch(url, init as RequestInit) as unknown as Promise<FetchResponse>,
    readApk: async (path) => new Uint8Array(await readFile(path)),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
  };
}

export async function main(
  args: readonly string[],
  env: Record<string, string | undefined>,
  deps: PublishDeps,
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    deps.log(USAGE);
    return 0;
  }

  const resolved = resolveInputs(args, env);
  if (!resolved.ok) {
    for (const problem of resolved.problems) deps.log(`error: ${problem}`);
    deps.log("");
    deps.log(USAGE);
    return 1;
  }

  const result = await publish(resolved.inputs, deps);
  if (!result.ok) {
    deps.log(`error: ${result.failure}`);
    return 1;
  }
  deps.log(`ManageEngine publish ${result.action}: ${result.detail}`);
  return 0;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("publish-app.ts")) {
  main(process.argv.slice(2), process.env, createNodeDeps())
    .then((code) => {
      process.exitCode = code;
    })
    .catch((caught: unknown) => {
      // Never print a raw error here: it could carry a credential.
      console.error(`error: the publish run threw unexpectedly (${typeof caught})`);
      process.exitCode = 1;
    });
}
