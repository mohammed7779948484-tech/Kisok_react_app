/**
 * probe-upload.ts — DIAGNOSTIC ONLY. Sends exactly one representation of a
 * verified APK to ManageEngine's `POST /emsapi/files` and stops.
 *
 *     node tools/mdm/probe-upload.ts --apk <path> --variant cloud_file|legacy_fileName
 *
 * This exists because two real-tenant attempts have now both failed with
 * HTTP 406 on `/emsapi/files` — a hand-built multipart body, and Node's
 * native `FormData`/`Blob` sending the field as `file` — so the working wire
 * shape is not yet known, and a full Android build-and-release run costs
 * ~16 minutes per attempt. This script isolates ONE variable per run: the
 * multipart field name (`file` vs `fileName`), with every other header and
 * body characteristic held constant.
 *
 * It NEVER calls `POST /api/v1/mdm/apps` or
 * `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}` — a successful
 * upload is reported and the run stops there. This file must never gain
 * those calls; that is what `tools/mdm/publish-app.ts` is for, once a
 * working upload shape is proven live.
 *
 * Credentials come from the environment only — MDM_CLIENT_ID,
 * MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN — and are never accepted as flags,
 * never printed, and redacted out of every message this script emits.
 *
 * Deliberately standalone: it duplicates a few small pieces of
 * `publish-app.ts` (secret redaction, data-centre hosts, the token-exchange
 * body) rather than importing from it, so this temporary probe can never
 * change the production publisher's behaviour by accident.
 *
 * No repository or npm imports: node builtins only, so it runs under Node's
 * native TypeScript type-stripping with plain `node`.
 */

import { readFile } from "node:fs/promises";
import process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The one variable this probe isolates: which multipart field name to use. */
export const VARIANTS = ["cloud_file", "legacy_fileName"] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * `cloud_file` matches the current Cloud-specific documentation and the
 * production publisher (field `file`) — already OBSERVED to fail with 406.
 * `legacy_fileName` matches a contradictory ManageEngine example (field
 * `fileName`) and is NOT yet tested live.
 */
export const VARIANT_FIELD: Record<Variant, string> = {
  cloud_file: "file",
  legacy_fileName: "fileName",
};

export const APK_MIME = "application/vnd.android.package-archive";

export interface ProbeInputs {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apkPath: string;
  dataCentre: string;
  variant: Variant;
}

export interface ProbeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: RequestInit["body"] },
) => Promise<ProbeFetchResponse>;

export interface ProbeDeps {
  fetch: FetchLike;
  readApk: (path: string) => Promise<Uint8Array>;
  log: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Secret handling — duplicated from publish-app.ts on purpose (see header).
// ---------------------------------------------------------------------------

export const REDACTION = "***REDACTED***";

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.trim() === "") continue;
    result = result.split(secret).join(REDACTION);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

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

export function buildTokenExchangeBody(
  inputs: Pick<ProbeInputs, "clientId" | "clientSecret" | "refreshToken">,
): string {
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

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const MAX_BODY_CHARS = 2000;

/** Cap a response body before it is printed — diagnostic output, not a dump. */
export function capBody(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  return `${text.slice(0, MAX_BODY_CHARS)}\n... (truncated, ${text.length} chars total)`;
}

/** Show enough of an id to compare runs without printing the whole thing. */
export function redactId(id: string): string {
  if (id.length <= 2) return "*".repeat(id.length);
  if (id.length <= 8) return `${id.slice(0, 1)}...${id.slice(-1)}`;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

/**
 * The one thing under test: which field name carries the APK. Exactly one
 * field is ever appended — never both `file` and `fileName` in the same
 * request, which would no longer isolate a single variable.
 */
export function buildUploadForm(variant: Variant, bytes: Uint8Array, fileName: string): FormData {
  const form = new FormData();
  form.append(
    VARIANT_FIELD[variant],
    new Blob([new Uint8Array(bytes)], { type: APK_MIME }),
    fileName,
  );
  return form;
}

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

export type ResolveResult = { ok: true; inputs: ProbeInputs } | { ok: false; problems: string[] };

const USAGE = `
Usage: node tools/mdm/probe-upload.ts --apk <path> --variant <cloud_file|legacy_fileName> [--data-centre <code>]

DIAGNOSTIC ONLY. Sends exactly one representation of the given APK to
POST /emsapi/files and stops — it never creates or updates the ManageEngine
enterprise app.

Required environment (never flags, never printed):
  MDM_CLIENT_ID, MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN

Optional:
  --data-centre <code>   or MDM_DATA_CENTRE   (default: us)
`.trim();

export function resolveInputs(
  args: readonly string[],
  env: Record<string, string | undefined>,
): ResolveResult {
  const problems: string[] = [];
  const flags = new Map<string, string>();

  const known = ["--apk", "--variant", "--data-centre"];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!known.includes(arg)) {
      problems.push(`unknown flag "${arg}". Known flags: ${known.join(", ")}.`);
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

  const clientId = required(undefined, "MDM_CLIENT_ID", env.MDM_CLIENT_ID);
  const clientSecret = required(undefined, "MDM_CLIENT_SECRET", env.MDM_CLIENT_SECRET);
  const refreshToken = required(undefined, "MDM_REFRESH_TOKEN", env.MDM_REFRESH_TOKEN);
  const apkPath = required(flags.get("--apk"), "APK_PATH (or --apk)", env.APK_PATH);

  const variantRaw = flags.get("--variant") ?? env.MDM_UPLOAD_VARIANT;
  let variant: Variant | undefined;
  if (variantRaw === undefined) {
    problems.push(
      `--variant (or MDM_UPLOAD_VARIANT) is not set. Use one of: ${VARIANTS.join(", ")}.`,
    );
  } else if (!(VARIANTS as readonly string[]).includes(variantRaw)) {
    problems.push(
      `--variant "${variantRaw}" is not recognised. Use one of: ${VARIANTS.join(", ")}.`,
    );
  } else {
    variant = variantRaw as Variant;
  }

  const dataCentre = flags.get("--data-centre") ?? env.MDM_DATA_CENTRE ?? "us";

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    inputs: { clientId, clientSecret, refreshToken, apkPath, dataCentre, variant: variant! },
  };
}

// ---------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------

async function readApkOrFail(inputs: ProbeInputs, deps: ProbeDeps): Promise<Uint8Array> {
  try {
    return await deps.readApk(inputs.apkPath);
  } catch (caught) {
    throw new Error(
      `the APK at ${inputs.apkPath} could not be read: ` +
        (caught instanceof Error ? caught.message : String(caught)),
    );
  }
}

async function exchangeToken(
  inputs: ProbeInputs,
  hosts: { accounts: string },
  deps: ProbeDeps,
): Promise<string> {
  let response: ProbeFetchResponse;
  try {
    response = await deps.fetch(`${hosts.accounts}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildTokenExchangeBody(inputs),
    });
  } catch (caught) {
    throw new Error(
      `the token exchange could not be sent: ${caught instanceof Error ? caught.message : String(caught)}`,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`the token exchange failed with HTTP ${response.status}: ${capBody(text)}`);
  }
  const parsed = safeParseJson(text);
  const token =
    isRecord(parsed) && typeof parsed.access_token === "string" ? parsed.access_token : undefined;
  if (token === undefined || token === "") {
    throw new Error("the token exchange returned no access_token — failing closed");
  }
  return token;
}

/**
 * Useful but not mandatory: confirms the token and host are usable before
 * spending the one upload attempt this run makes. Never fatal — a read
 * failure here is reported and the probe continues to the upload itself.
 */
async function reportRepositoryRead(
  hosts: { mdm: string },
  token: string,
  secrets: readonly string[],
  deps: ProbeDeps,
): Promise<void> {
  try {
    const response = await deps.fetch(`${hosts.mdm}/api/v1/mdm/apps?limit=1&offset=0`, {
      method: "GET",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
    });
    deps.log(`repository read: HTTP ${response.status}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    deps.log(`repository read: could not be completed (${redactSecrets(message, secrets)})`);
  }
}

/**
 * Run the probe. Returns an exit code rather than throwing, so the CLI owns
 * it and every message is redacted before it can reach the log.
 */
export async function run(inputs: ProbeInputs, deps: ProbeDeps): Promise<number> {
  const secrets = [inputs.clientId, inputs.clientSecret, inputs.refreshToken].filter(
    (value) => value.trim() !== "",
  );
  try {
    const hosts = resolveDataCentre(inputs.dataCentre);
    const bytes = await readApkOrFail(inputs, deps);
    const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";
    const fieldName = VARIANT_FIELD[inputs.variant];

    deps.log("ManageEngine upload diagnostic");
    deps.log(`variant: ${inputs.variant}`);
    deps.log(`host: ${new URL(hosts.mdm).host}`);
    deps.log("endpoint: /emsapi/files");
    deps.log("module: MDM_APP_MGMT");
    deps.log("accept: application/json");
    deps.log(`multipart field: ${fieldName}`);
    deps.log("manual Content-Type: no");
    deps.log("X-Customer: no");
    deps.log(`APK filename: ${fileName}`);
    deps.log(`APK size: ${bytes.byteLength}`);
    deps.log("");

    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    await reportRepositoryRead(hosts, token, secrets, deps);
    deps.log("");

    const form = buildUploadForm(inputs.variant, bytes, fileName);

    let response: ProbeFetchResponse;
    try {
      response = await deps.fetch(`${hosts.mdm}/emsapi/files`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: "application/json",
          Module: "MDM_APP_MGMT",
        },
        body: form,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      deps.log(`upload request could not be sent: ${redactSecrets(message, secrets)}`);
      return 1;
    }

    const bodyText = await response.text();
    const contentType = response.headers.get("content-type") ?? "(none)";

    deps.log("upload response:");
    deps.log(
      `HTTP status: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
    deps.log(`content-type: ${contentType}`);

    if (!response.ok) {
      // A failure body (like the documented 406) carries no id worth
      // redacting — an error code and message, safe to show in full.
      deps.log("body:");
      deps.log(redactSecrets(capBody(bodyText), secrets));
      deps.log("");
      deps.log("upload accepted: no");
      return 1;
    }

    const parsed = safeParseJson(bodyText);
    const rawFileId = isRecord(parsed) ? parsed.fileID : undefined;
    const fileId =
      typeof rawFileId === "string" && rawFileId !== ""
        ? rawFileId
        : typeof rawFileId === "number"
          ? String(rawFileId)
          : undefined;
    const fileStatus = isRecord(parsed) ? parsed.fileStatus : undefined;

    // A 2xx body carries the real fileID, so it is never dumped raw — only
    // the redacted id and the other structured fields below.
    deps.log(`fileID present: ${fileId !== undefined ? "yes" : "no"}`);
    if (fileId !== undefined) deps.log(`fileID (redacted): ${redactId(fileId)}`);
    deps.log(`fileStatus: ${fileStatus === undefined ? "(none)" : String(fileStatus)}`);
    deps.log(`upload accepted: ${fileId !== undefined ? "yes" : "no"}`);
    deps.log("");
    deps.log(
      "STOPPING HERE by design — this diagnostic never calls app creation or update, " +
        "even on a successful upload.",
    );
    return fileId !== undefined ? 0 : 1;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    deps.log(`error: ${redactSecrets(message, secrets)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function createNodeDeps(): ProbeDeps {
  return {
    fetch: (url, init) => fetch(url, init as RequestInit) as unknown as Promise<ProbeFetchResponse>,
    readApk: async (path) => new Uint8Array(await readFile(path)),
    log: (line) => console.log(line),
  };
}

export async function main(
  args: readonly string[],
  env: Record<string, string | undefined>,
  deps: ProbeDeps,
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

  return run(resolved.inputs, deps);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("probe-upload.ts")) {
  main(process.argv.slice(2), process.env, createNodeDeps())
    .then((code) => {
      process.exitCode = code;
    })
    .catch((caught: unknown) => {
      // Never print a raw error here: it could carry a credential.
      console.error(`error: the probe run threw unexpectedly (${typeof caught})`);
      process.exitCode = 1;
    });
}
