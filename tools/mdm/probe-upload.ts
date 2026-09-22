/**
 * probe-upload.ts — DIAGNOSTIC ONLY. Sends exactly one representation of a
 * verified APK to a ManageEngine upload endpoint and stops.
 *
 *     node tools/mdm/probe-upload.ts --apk <path> --variant <name>
 *     (see VARIANTS below for every name this accepts)
 *
 * This exists because FOUR real-tenant attempts against `POST /emsapi/files`
 * have now all failed with HTTP 406 — a hand-built multipart body, native
 * `FormData`/`Blob` with field `file`, native `FormData`/`Blob` with field
 * `fileName`, and the same with a real `X-Customer` header added — so the
 * working wire shape for that endpoint is not yet known, and a full Android
 * build-and-release run costs ~16 minutes per attempt. This script isolates
 * ONE variable per run, with every other header and body characteristic held
 * constant:
 *
 *   cloud_file                — /emsapi/files, field `file`, no X-Customer.
 *     OBSERVED to fail (406).
 *   legacy_fileName            — /emsapi/files, field `fileName`, no
 *     X-Customer. OBSERVED to fail (406).
 *   cloud_file_with_customer   — /emsapi/files, field `file`, WITH
 *     X-Customer. Differs from cloud_file by exactly that one header.
 *     OBSERVED to fail (406) — X-Customer does not fix it either.
 *
 * The remaining two variants target a DIFFERENT endpoint,
 * `POST /api/v1/mdm/files` — documented as the predecessor `/emsapi/files`
 * replaced. ManageEngine currently publishes TWO CONTRADICTORY request
 * representations for that same endpoint, independently verified and
 * supplied for this diagnostic rather than invented, so each is its own
 * named variant instead of one ambiguous "legacy" variant that would hide
 * which contract is under test:
 *
 *   legacy_api_v1_raw_example  — Representation A, a general (non-Cloud-
 *     specific) API example: a RAW POST of the file bytes — no multipart,
 *     no boundary — with `Authorization`, `content-type: application/json`
 *     (exactly as documented, unusual as that pairing is for a binary body
 *     — followed here rather than "corrected"), and
 *     `content-disposition: filename=<name>`. No `Accept`, no `Module`, no
 *     `X-Customer` in that documented example. NOT YET OBSERVED live.
 *   legacy_api_v1_cloud        — Representation B, the Cloud-specific page
 *     for the SAME endpoint: `multipart/form-data`,
 *     `content-disposition: filename=<name>`, `Accept: application/json`.
 *     Because this tenant IS ManageEngine Cloud, this representation is the
 *     highest-priority untested legacy candidate. Sent via native
 *     `FormData`, `Content-Type` left UNSET so `fetch` generates
 *     `multipart/form-data; boundary=...` itself — that is how the
 *     documented `Content-Type: multipart/form-data` requirement is
 *     satisfied without corrupting the boundary a hand-set header would
 *     omit. The Cloud-specific page confirms the body is multipart but does
 *     NOT establish a field name in what was supplied for this diagnostic:
 *     `file` is used as the conservative, already-documented ManageEngine
 *     Cloud upload field (the same one `cloud_file` uses against
 *     `/emsapi/files`), NOT because the Cloud-specific legacy page itself
 *     names it — a live dispatch is what proves or disproves that
 *     assumption. No `Module`, no `X-Customer` in the documented contract.
 *     NOT YET OBSERVED live.
 *
 * Both `/api/v1/mdm/files` variants can carry `file_id` above
 * `Number.MAX_SAFE_INTEGER`, so both use the same lossless-id parsing (see
 * `parseLegacyResponse`/`readLosslessId`). Neither requires
 * `MDM_CUSTOMER_ID`. There is no fallback between them, or between either
 * and the `/emsapi/files` variants: one dispatch tests exactly one
 * representation.
 *
 * It NEVER calls `POST /api/v1/mdm/apps` or
 * `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}` — a successful
 * upload is reported and the run stops there. This file must never gain
 * those calls; that is what `tools/mdm/publish-app.ts` is for, once a
 * working upload shape is proven live.
 *
 * Credentials come from the environment only — MDM_CLIENT_ID,
 * MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN, and (only for the
 * cloud_file_with_customer variant) MDM_CUSTOMER_ID — and are never accepted
 * as flags, never printed, and redacted out of every message this script
 * emits. MDM_CUSTOMER_ID is never hard-coded here or anywhere in this public
 * repository; it is supplied only as a GitHub Actions environment secret.
 *
 * Deliberately standalone: it duplicates a few small pieces of
 * `publish-app.ts` (secret redaction, data-centre hosts, the token-exchange
 * body, and — for the two `/api/v1/mdm/files` variants' `file_id` — the same
 * lossless-id strategy publish-app.ts uses) rather than importing from it, so
 * this temporary probe can never change the production publisher's
 * behaviour by accident.
 *
 * No repository or npm imports: node builtins only, so it runs under Node's
 * native TypeScript type-stripping with plain `node`.
 */

import { readFile } from "node:fs/promises";
import process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The one variable this probe isolates: which upload representation to use. */
export const VARIANTS = [
  "cloud_file",
  "legacy_fileName",
  "cloud_file_with_customer",
  "legacy_api_v1_raw_example",
  "legacy_api_v1_cloud",
] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * The multipart field name for each `/emsapi/files` variant ONLY.
 * `legacy_api_v1_raw_example` and `legacy_api_v1_cloud` deliberately have NO
 * entry here: they target a different endpoint (`/api/v1/mdm/files`) with
 * their own transport builders (`buildLegacyRawUploadHeaders`,
 * `buildLegacyCloudUploadForm`/`buildLegacyCloudUploadHeaders`), so forcing
 * them through this map (and `buildUploadForm`) would be inaccurate.
 * `buildUploadForm` throws if ever called with either, rather than silently
 * picking a wrong field.
 *
 * `cloud_file` matches the current Cloud-specific documentation and the
 * production publisher (field `file`) — already OBSERVED to fail with 406.
 * `legacy_fileName` matches a contradictory ManageEngine example (field
 * `fileName`) — also OBSERVED to fail with 406.
 * `cloud_file_with_customer` sends the same field as `cloud_file` (`file`)
 * plus an `X-Customer` header — it must differ from `cloud_file` by that one
 * header alone. OBSERVED to fail with 406 too.
 */
export const VARIANT_FIELD: Partial<Record<Variant, string>> = {
  cloud_file: "file",
  legacy_fileName: "fileName",
  cloud_file_with_customer: "file",
};

/** Only this variant sends an X-Customer header at all. */
const CUSTOMER_VARIANT: Variant = "cloud_file_with_customer";

export const APK_MIME = "application/vnd.android.package-archive";

export interface ProbeInputs {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Required only when variant is cloud_file_with_customer. */
  customerId: string | undefined;
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
  const field = VARIANT_FIELD[variant];
  if (field === undefined) {
    throw new Error(`${variant} has no multipart field mapping — it is not a multipart variant`);
  }
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)], { type: APK_MIME }), fileName);
  return form;
}

/**
 * The upload headers for a given variant. `cloud_file_with_customer` differs
 * from `cloud_file` by exactly one header — `X-Customer` — and nothing else;
 * every other variant never carries it. `Content-Type` is deliberately never
 * set here: it is left to `fetch` to generate the multipart boundary.
 */
export function buildUploadHeaders(
  variant: Variant,
  token: string,
  customerId: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    Accept: "application/json",
    Module: "MDM_APP_MGMT",
  };
  if (variant !== CUSTOMER_VARIANT) return headers;
  if (customerId === undefined || customerId.trim() === "") {
    throw new Error(
      `MDM_CUSTOMER_ID is required for the ${CUSTOMER_VARIANT} variant — failing closed`,
    );
  }
  return { ...headers, "X-Customer": customerId };
}

/**
 * `legacy_api_v1_raw_example`'s exact documented header shape —
 * Representation A, a general (non-Cloud-specific) API example, followed
 * verbatim rather than guessed. No `Accept`, no `Module`, no `X-Customer`:
 * none appear in that documented example.
 */
export function buildLegacyRawUploadHeaders(
  token: string,
  fileName: string,
): Record<string, string> {
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    "content-type": "application/json",
    "content-disposition": `filename=${fileName}`,
  };
}

/**
 * `legacy_api_v1_cloud`'s FormData — Representation B's multipart body. The
 * Cloud-specific page confirms `multipart/form-data` but does NOT establish
 * a field name in what was supplied for this diagnostic: `file` is used as
 * the conservative, already-documented ManageEngine Cloud upload field (the
 * same one `cloud_file` uses against `/emsapi/files`), NOT because the
 * Cloud-specific legacy page itself names it. Never claim this field name
 * was proven by that page — only that it is the most conservative
 * documented choice available.
 */
export function buildLegacyCloudUploadForm(bytes: Uint8Array, fileName: string): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: APK_MIME }), fileName);
  return form;
}

/**
 * `legacy_api_v1_cloud`'s headers — Representation B. The Cloud-specific
 * docs list `Content-Type: multipart/form-data` as a requirement, but a
 * hand-set literal value would omit the boundary parameter FormData needs
 * and produce an invalid multipart request. `fetch` generates the correct
 * `multipart/form-data; boundary=...` value itself whenever `Content-Type`
 * is left UNSET on a FormData body — that is how the documented requirement
 * is satisfied here, safely, without hand-rolling a boundary. `Accept` and
 * `Content-Disposition` are sent as documented; no `Module`, no
 * `X-Customer` — neither is documented for this endpoint.
 */
export function buildLegacyCloudUploadHeaders(
  token: string,
  fileName: string,
): Record<string, string> {
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    Accept: "application/json",
    "content-disposition": `filename=${fileName}`,
  };
}

/**
 * Both `/api/v1/mdm/files` variants' responses can carry `file_id` above
 * `Number.MAX_SAFE_INTEGER` (the same class of id documented elsewhere in
 * this repository — see `tools/mdm/publish-app.ts`). This is the same
 * lossless-recovery strategy, duplicated here rather than imported, so this
 * temporary probe stays standalone: a safe integer is canonicalised to its
 * decimal string; an unsafe one is recovered from Node's `JSON.parse`
 * reviver `context.source` ONLY when that source is itself a plain decimal
 * integer, and left as the already-rounded number otherwise — which
 * `readLosslessId` below then refuses rather than use.
 */
const LOSSLESS_ID_FIELDS = new Set(["file_id"]);

function isDecimalId(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

type JsonReviverContext = { source?: string };

function parseLegacyResponse(text: string): unknown {
  try {
    const parseWithSource = JSON.parse as unknown as (
      input: string,
      reviver: (key: string, value: unknown, context?: JsonReviverContext) => unknown,
    ) => unknown;

    return parseWithSource(text, (key, value, context) => {
      if (!LOSSLESS_ID_FIELDS.has(key)) return value;
      if (typeof value === "string") return value;
      if (typeof value === "number") {
        const source = context?.source;
        if (typeof source === "string" && isDecimalId(source)) return source;
        if (Number.isSafeInteger(value) && value >= 0) return String(value);
      }
      return value;
    });
  } catch {
    return undefined;
  }
}

/**
 * Accept `file_id` ONLY when it can be represented without precision loss: a
 * plain decimal string, or a JS number that is itself a safe non-negative
 * integer. Never `Number(...)`/`parseInt(...)` — both silently round a value
 * above `Number.MAX_SAFE_INTEGER` before it could be rejected.
 */
export function readLosslessId(value: unknown): string | undefined {
  if (typeof value === "string" && isDecimalId(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return undefined;
}

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

export type ResolveResult = { ok: true; inputs: ProbeInputs } | { ok: false; problems: string[] };

const USAGE = `
Usage: node tools/mdm/probe-upload.ts --apk <path> --variant <${VARIANTS.join("|")}> [--data-centre <code>]

DIAGNOSTIC ONLY. Sends exactly one representation of the given APK to one
ManageEngine upload endpoint and stops — it never creates or updates the
ManageEngine enterprise app.

Required environment (never flags, never printed):
  MDM_CLIENT_ID, MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN
  MDM_CUSTOMER_ID   (only when --variant is ${CUSTOMER_VARIANT})

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

  // Not required by `required()` above: MDM_CUSTOMER_ID is only mandatory for
  // one variant, and the other variants must not be made to depend on it.
  const customerIdRaw = env.MDM_CUSTOMER_ID;
  const customerId =
    customerIdRaw === undefined || customerIdRaw.trim() === "" ? undefined : customerIdRaw;
  if (variant === CUSTOMER_VARIANT && customerId === undefined) {
    problems.push(
      `MDM_CUSTOMER_ID is not set. The ${CUSTOMER_VARIANT} variant requires it and refuses to run without it.`,
    );
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    inputs: {
      clientId,
      clientSecret,
      refreshToken,
      customerId,
      apkPath,
      dataCentre,
      variant: variant!,
    },
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
    // Consumed, never dumped: an unread body leaves the connection open. Only
    // the status is diagnostic output — the repository contents are not.
    await response.text();
    deps.log(`repository read: HTTP ${response.status}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    deps.log(`repository read: could not be completed (${redactSecrets(message, secrets)})`);
  }
}

/**
 * Shared by both `/api/v1/mdm/files` variants: reads the response, reports
 * it, and applies the same lossless `file_id` handling to both — the two
 * variants differ in how the REQUEST is built (see each `run...` function
 * and its dedicated header/body builders), never in how the response is
 * read or in what counts as a safe id.
 */
async function reportLegacyUploadResult(
  response: ProbeFetchResponse,
  secrets: readonly string[],
  deps: ProbeDeps,
): Promise<number> {
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "(none)";

  deps.log("upload response:");
  deps.log(
    `HTTP status: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
  );
  deps.log(`content-type: ${contentType}`);

  if (!response.ok) {
    // A failure body carries no id worth redacting — safe to show in full.
    deps.log("body:");
    deps.log(redactSecrets(capBody(bodyText), secrets));
    deps.log("");
    deps.log("upload accepted: no");
    return 1;
  }

  const parsed = parseLegacyResponse(bodyText);
  const rawFileId = isRecord(parsed) ? parsed.file_id : undefined;
  const fileId = readLosslessId(rawFileId);

  if (rawFileId !== undefined && fileId === undefined) {
    // A file_id was present but its exact value could not be confirmed —
    // never report success off an id that might be silently rounded.
    deps.log("file_id present: yes, but its value cannot be confirmed exact — failing closed");
    deps.log("upload accepted: no");
    return 1;
  }

  // A 2xx body carries the real file_id, so it is never dumped raw — only
  // the redacted id below.
  deps.log(`file_id present: ${fileId !== undefined ? "yes" : "no"}`);
  if (fileId !== undefined) deps.log(`file_id (redacted): ${redactId(fileId)}`);
  deps.log(`upload accepted: ${fileId !== undefined ? "yes" : "no"}`);
  deps.log("");
  deps.log(
    "STOPPING HERE by design — this diagnostic never calls app creation or update, " +
      "even on a successful upload.",
  );
  return fileId !== undefined ? 0 : 1;
}

/**
 * `legacy_api_v1_raw_example` — Representation A: a different endpoint AND a
 * different transport (raw bytes, not multipart) from every `/emsapi/files`
 * variant, so it is kept fully separate rather than folded into `run()`'s
 * multipart path below. This function never touches
 * `buildUploadForm`/`buildUploadHeaders`, and that multipart path is
 * untouched by this variant's existence — each variable is isolated in
 * code, not just on the wire.
 */
async function runLegacyApiV1RawExample(inputs: ProbeInputs, deps: ProbeDeps): Promise<number> {
  const secrets = [inputs.clientId, inputs.clientSecret, inputs.refreshToken].filter(
    (value) => value.trim() !== "",
  );
  try {
    const hosts = resolveDataCentre(inputs.dataCentre);
    const bytes = await readApkOrFail(inputs, deps);
    const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";

    deps.log("ManageEngine upload diagnostic");
    deps.log(`variant: ${inputs.variant}`);
    deps.log(`host: ${new URL(hosts.mdm).host}`);
    deps.log("endpoint: /api/v1/mdm/files");
    deps.log("transport: raw bytes (no multipart, no boundary)");
    deps.log("content-type: application/json");
    deps.log(`content-disposition: filename=${fileName}`);
    deps.log("accept: (not sent — not in the documented example)");
    deps.log("module: no");
    deps.log("X-Customer: no");
    deps.log(`APK filename: ${fileName}`);
    deps.log(`APK size: ${bytes.byteLength}`);
    deps.log("");

    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    await reportRepositoryRead(hosts, token, secrets, deps);
    deps.log("");

    const headers = buildLegacyRawUploadHeaders(token, fileName);

    // A typeless Blob, not FormData: the wire bytes are identical to the
    // documented raw POST body — this only works around Uint8Array not
    // structurally matching this project's BodyInit type.
    const rawBody = new Blob([new Uint8Array(bytes)]);

    let response: ProbeFetchResponse;
    try {
      response = await deps.fetch(`${hosts.mdm}/api/v1/mdm/files`, {
        method: "POST",
        headers,
        body: rawBody,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      deps.log(`upload request could not be sent: ${redactSecrets(message, secrets)}`);
      return 1;
    }

    return reportLegacyUploadResult(response, secrets, deps);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    deps.log(`error: ${redactSecrets(message, secrets)}`);
    return 1;
  }
}

/**
 * `legacy_api_v1_cloud` — Representation B: the same `/api/v1/mdm/files`
 * endpoint as the raw-example variant above, but a DIFFERENT, independently
 * built transport (native FormData) — never sharing the raw variant's
 * header/body builders, so the two representations can never accidentally
 * drift into each other.
 */
async function runLegacyApiV1Cloud(inputs: ProbeInputs, deps: ProbeDeps): Promise<number> {
  const secrets = [inputs.clientId, inputs.clientSecret, inputs.refreshToken].filter(
    (value) => value.trim() !== "",
  );
  try {
    const hosts = resolveDataCentre(inputs.dataCentre);
    const bytes = await readApkOrFail(inputs, deps);
    const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";

    deps.log("ManageEngine upload diagnostic");
    deps.log(`variant: ${inputs.variant}`);
    deps.log(`host: ${new URL(hosts.mdm).host}`);
    deps.log("endpoint: /api/v1/mdm/files");
    deps.log("transport: native FormData (fetch-generated multipart boundary)");
    deps.log("multipart field: file (conservative assumption, not proven by the Cloud page)");
    deps.log("manual Content-Type: no — fetch supplies multipart/form-data; boundary=...");
    deps.log(`content-disposition: filename=${fileName}`);
    deps.log("accept: application/json");
    deps.log("module: no");
    deps.log("X-Customer: no");
    deps.log(`APK filename: ${fileName}`);
    deps.log(`APK size: ${bytes.byteLength}`);
    deps.log("");

    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    await reportRepositoryRead(hosts, token, secrets, deps);
    deps.log("");

    const form = buildLegacyCloudUploadForm(bytes, fileName);
    const headers = buildLegacyCloudUploadHeaders(token, fileName);

    let response: ProbeFetchResponse;
    try {
      response = await deps.fetch(`${hosts.mdm}/api/v1/mdm/files`, {
        method: "POST",
        headers,
        body: form,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      deps.log(`upload request could not be sent: ${redactSecrets(message, secrets)}`);
      return 1;
    }

    return reportLegacyUploadResult(response, secrets, deps);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    deps.log(`error: ${redactSecrets(message, secrets)}`);
    return 1;
  }
}

/**
 * Run the probe. Returns an exit code rather than throwing, so the CLI owns
 * it and every message is redacted before it can reach the log.
 */
export async function run(inputs: ProbeInputs, deps: ProbeDeps): Promise<number> {
  // Both target a different endpoint than every /emsapi/files variant, and
  // differ from EACH OTHER in transport — see runLegacyApiV1RawExample and
  // runLegacyApiV1Cloud. Everything below this point is unchanged from
  // before either variant existed, and neither variant ever reaches it.
  if (inputs.variant === "legacy_api_v1_raw_example") return runLegacyApiV1RawExample(inputs, deps);
  if (inputs.variant === "legacy_api_v1_cloud") return runLegacyApiV1Cloud(inputs, deps);

  const secrets = [
    inputs.clientId,
    inputs.clientSecret,
    inputs.refreshToken,
    inputs.customerId ?? "",
  ].filter((value) => value.trim() !== "");
  try {
    const hosts = resolveDataCentre(inputs.dataCentre);
    const bytes = await readApkOrFail(inputs, deps);
    const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";
    const fieldName = VARIANT_FIELD[inputs.variant] ?? "(unknown)";
    const usesCustomerHeader = inputs.variant === CUSTOMER_VARIANT;

    deps.log("ManageEngine upload diagnostic");
    deps.log(`variant: ${inputs.variant}`);
    deps.log(`host: ${new URL(hosts.mdm).host}`);
    deps.log("endpoint: /emsapi/files");
    deps.log("module: MDM_APP_MGMT");
    deps.log("accept: application/json");
    deps.log(`multipart field: ${fieldName}`);
    deps.log("manual Content-Type: no");
    // Never the value — only whether this run attaches it at all.
    deps.log(`X-Customer: ${usesCustomerHeader ? "yes (redacted)" : "no"}`);
    deps.log(`APK filename: ${fileName}`);
    deps.log(`APK size: ${bytes.byteLength}`);
    deps.log("");

    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    await reportRepositoryRead(hosts, token, secrets, deps);
    deps.log("");

    const form = buildUploadForm(inputs.variant, bytes, fileName);
    // Built before the network attempt, and OUTSIDE the fetch try/catch, so a
    // missing MDM_CUSTOMER_ID fails closed via the outer handler rather than
    // being mislabeled as a network failure — no request is ever sent.
    const headers = buildUploadHeaders(inputs.variant, token, inputs.customerId);

    let response: ProbeFetchResponse;
    try {
      response = await deps.fetch(`${hosts.mdm}/emsapi/files`, {
        method: "POST",
        headers,
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
