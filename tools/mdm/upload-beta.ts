/**
 * upload-beta.ts — the MDM Beta upload client (AC-09: non-production-first
 * automation; fail-closed).
 *
 * Invoked by the mdm-beta-upload workflow (T12) with plain Node 24 native
 * TypeScript:
 *
 *     node tools/mdm/upload-beta.ts \
 *       --apk dist/app-release.apk --app-name "KISOK" --app-version 1.2.0 \
 *       --group-id 701 --production-group-id 900 --app-category-id 11
 *
 * …with the OAuth credentials from the environment: MDM_CLIENT_ID,
 * MDM_CLIENT_SECRET, MDM_REFRESH_TOKEN (flags override the environment).
 * This script deliberately imports nothing from the repository or npm:
 * node-builtin imports only, so it runs under Node 24 native type-stripping
 * (the plan's probed constraint: jest cannot import .mjs, so repo tools are
 * TypeScript executed with plain `node`).
 *
 * WHAT IT DOES (upload mode):
 *   1. one Zoho OAuth refresh-token exchange (masked — see below);
 *   2. GET /api/v1/mdm/apps, walked by the documented pagination envelope
 *      (RD-03): 50 rows per page by default — a non-empty "paging.next" is a
 *      FULL URL and is requested verbatim; otherwise the walk steps with the
 *      documented limit/offset query params, terminating on a short page, on
 *      accumulating metadata.total_record_count, or on matching our app by
 *      app_name. The "?page=" parameter is documented NOWHERE and is never
 *      sent; a page LONGER than 50 rows with no usable envelope fails closed
 *      (termination would be unknowable);
 *   3. a read-only monotonic version pre-check — the incoming version must be
 *      strictly greater than the existing app's documented STRING version
 *      (the Beta label's app_version when present, else the top-level
 *      version). The server remains the authority on the Android
 *      versionCode increase. A non-increasing version refuses BEFORE any
 *      mutation;
 *   4. read-only group validation BEFORE ANY MUTATION (RD-04): GET
 *      /api/v1/mdm/groups/{group_id} — the group must resolve and its
 *      documented "name" field must equal the REQUIRED expected group name
 *      (--expected-group-name / MDM_EXPECTED_GROUP_NAME). A missing,
 *      unparseable or name-mismatched group refuses BOTH flows — id + exact
 *      name is the strongest non-production identification the documented
 *      contract supports (no group_type distinguishes production); the
 *      optional production-group-id denylist is retained as belt-and-braces;
 *   5. the Beta release label (RD-05): an existing app's Beta label
 *      (release_labels[] with release_label_name "Beta") is REUSED — POST
 *      /api/v1/mdm/labels {"channel_name":"Beta"} runs ONLY when the app
 *      exists without a Beta label or does not exist yet (one POST per run at
 *      most; duplicate-channel behavior is undocumented, so any POST error
 *      fails closed);
 *   6. two-phase upload: POST {mdm}/emsapi/files with header
 *      `Module: MDM_APP_MGMT` and multipart key `file` (the docs prose; the
 *      docs CODE EXAMPLES say `fileName` — recorded discrepancy, the written
 *      prose contract is used). Completion is confirmed from THIS response's
 *      `fileStatus` == 2 — current docs document no polling endpoint, so
 *      none is invented;
 *   7. POST /api/v1/mdm/apps (create; app_type 2 = Enterprise/in-house, with
 *      the documented Required app_category_id and Beta release_label_id) or
 *      PUT /api/v1/mdm/apps/{app_id}/labels/{label_id} (add version,
 *      force_update_in_label);
 *   8. POST /api/v1/mdm/groups/{group_id}/apps with silent_install true —
 *      exactly ONE group, the configured one.
 *
 * It REFUSES to run without a group id, without an expected group name,
 * refuses the configured production group id, refuses an unresolvable or
 * name-mismatched group BEFORE any mutation, refuses any label name other
 * than exactly "Beta", and contains NO call to approve / distribute_update /
 * retire_old_version or any other production-promotion operation (AC-09).
 *
 * Dry-run (--dry-run or MDM_DRY_RUN=true): token exchange + read-only GETs
 * (app list with pagination, group details with the name verification) + the
 * version pre-check. No mutation, no APK read. Exits 0 with a summary of what
 * it found — and NON-ZERO whenever the group is missing or its name does not
 * match (a state in which a real run could not proceed safely): a truthful
 * dry-run.
 *
 * MASKING (Zoho policy — logs count as credential exposure and trigger
 * revocation): the access token, client secret, refresh token and client id
 * values never appear in any output, error, or log line — every emitted line
 * passes through a mechanical redaction of the known secret values, and no
 * message is ever constructed from them in the first place. This includes the
 * input-resolution failure path: those lines are redacted with the credential
 * values gathered from argv/env BEFORE emission (a rejected positional
 * argument's value is not echoed at all — the position is the diagnostic),
 * and the last-resort direct-run catch redacts the same way (T11-F01).
 * Typed-validation failures of non-credential inputs (data centre, numeric
 * ids, MDM_DRY_RUN) never quote the received value either, so a mis-pasted
 * credential cannot leak even when it appears nowhere correct (T11-R1);
 * free-form values (app name, version, APK path, label name, expected group
 * name) are echoed deliberately as diagnostics and are always redacted when
 * they match a known credential value.
 *
 * Rate limits: HTTP 429, error code COM0002 ("API Limit Exceeded") and 5xx
 * are retried with bounded backoff (3 attempts, 1 s then 2 s). The numeric
 * 60/min + 5-min-lock figures are NOT in current docs; they are conservative
 * soft assumptions for backoff only.
 *
 * Fail-closed (AC-07 discipline): every required input is checked for
 * missing/empty BEFORE any network call, and a failure exits non-zero with a
 * message NAMING the variable/flag. Nothing is guessed and no default is
 * invented for a required value.
 *
 * Exit status: 0 on success (or a completed dry-run); 1 on every failure,
 * with each failure printed to stderr as it is found. The script writes no
 * files at all; it only reads the APK.
 *
 * Structure: parsing, validation, version comparison, multipart construction
 * and redaction are pure exported functions; the network goes through the
 * injectable FetchLike seam, the APK read and the retry sleep are injectable
 * too — the CLI wiring is a thin layer, the colocated jest test injects
 * fakes and never performs a real request.
 */

import { Buffer } from "node:buffer";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One HTTP exchange through the injectable fetch seam. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<HttpResponse>;

/** The Zoho OAuth refresh-token exchange parameters. */
export interface TokenParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Optional; the docs list redirect_uri ("should be same redirect url mentioned while registering Client"). */
  redirectUri?: string;
}

/** Every value the script needs. Required inputs have no defaults. */
export interface UploadInputs {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** "" when not provided — forwarded to the token exchange only when set. */
  redirectUri: string;
  apkPath: string;
  appName: string;
  appVersion: string;
  /** "" when not provided; required by the create path (fail closed then). */
  appCategoryId: string;
  /** The ONE non-production group the app is associated with. */
  groupId: string;
  /**
   * The exact documented "name" the target group must resolve to (RD-04:
   * positive group verification). Required — no default, like groupId.
   */
  expectedGroupName: string;
  /** "" when not provided; an equal group id is refused. */
  productionGroupId: string;
  /** Always "Beta" — anything else is refused at input resolution (AC-09). */
  labelName: string;
  dataCentre: string;
  dryRun: boolean;
}

export type InputResolution =
  | { ok: true; inputs: UploadInputs }
  | { ok: false; failures: string[] };

/** One App Repository entry as documented (versions are STRINGs). */
export interface ListedApp {
  appId: number | string;
  appName: string;
  version?: string;
  releaseLabels: {
    releaseLabelId: number | string;
    releaseLabelName: string;
    appVersion?: string;
  }[];
}

export interface MainOptions {
  fetchImpl?: FetchLike;
  readFile?: (path: string) => Promise<Uint8Array>;
  sleep?: (ms: number) => Promise<void>;
  errorSink?: (line: string) => void;
  outputSink?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Constants (documented contract values)
// ---------------------------------------------------------------------------

export const BETA_LABEL_NAME = "Beta";

/** Current docs: app repository reads are paginated, 50 per page by default. */
export const MDM_API_PAGE_SIZE = 50;

/** Safety bound so a never-terminating pagination fails closed, not forever. */
export const MAX_LIST_PAGES = 100;

/** Bounded retry: 3 attempts per request, backoff 1 s then 2 s (soft limits). */
export const MAX_REQUEST_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000;

/**
 * Completion status of the two-phase upload, confirmed from the upload
 * response's own fileStatus (current docs document no polling endpoint).
 */
export const FILE_COMPLETED_STATUS = 2;

export const APK_MIME_TYPE = "application/vnd.android.package-archive";

/**
 * The multipart field name for the APK. The docs PROSE says "file"; the docs
 * code examples say "fileName" — the written prose contract is used and the
 * discrepancy recorded here.
 */
export const MULTIPART_FIELD_NAME = "file";

/** Fixed boundary for the hand-built multipart body (long enough to be collision-safe). */
export const MULTIPART_BOUNDARY = "----KisokMdmUploadBoundary7f3a9c1e5b2d8";

const DEFAULT_DATA_CENTRE = "us";

const NUMERIC_ID_PATTERN = /^[0-9]+$/;

/**
 * Data-centre endpoints (US default). Selection is EXPLICIT via
 * --data-centre / MDM_DATA_CENTRE: the token exchange host and the MDM host
 * move together per centre.
 */
const DATA_CENTRES = new Map<string, { accounts: string; mdm: string }>([
  ["us", { accounts: "https://accounts.zoho.com", mdm: "https://mdm.manageengine.com" }],
  ["eu", { accounts: "https://accounts.zoho.eu", mdm: "https://mdm.manageengine.eu" }],
  ["in", { accounts: "https://accounts.zoho.in", mdm: "https://mdm.manageengine.in" }],
  ["au", { accounts: "https://accounts.zoho.com.au", mdm: "https://mdm.manageengine.com.au" }],
  ["jp", { accounts: "https://accounts.zoho.jp", mdm: "https://mdm.manageengine.jp" }],
  ["ca", { accounts: "https://accounts.zoho.ca", mdm: "https://mdm.manageengine.ca" }],
  ["cn", { accounts: "https://accounts.zoho.cn", mdm: "https://mdm.manageengine.cn" }],
  ["sa", { accounts: "https://accounts.zoho.sa", mdm: "https://mdm.manageengine.sa" }],
  ["uk", { accounts: "https://accounts.zoho.uk", mdm: "https://mdm.manageengine.uk" }],
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Zoho-oauthtoken ${token}` };
}

function sleepMilliseconds(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readApkFromDisk(apkPath: string): Promise<Uint8Array> {
  // Buffer is a Uint8Array; the bytes feed the multipart body verbatim.
  return fsReadFile(apkPath);
}

// ---------------------------------------------------------------------------
// Pure functions — masking
// ---------------------------------------------------------------------------

const MIN_REDACT_LENGTH = 8;

/**
 * Replaces full occurrences of the given secret values with [REDACTED].
 * Values shorter than 8 characters are skipped mechanically (they would shred
 * ordinary messages); no message is ever built from a secret in the first
 * place — this is defense in depth against credentials echoed by an API.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length >= MIN_REDACT_LENGTH) {
      result = result.split(secret).join("[REDACTED]");
    }
  }
  return result;
}

/** The credential inputs: flag name ↔ environment variable name. */
const CREDENTIAL_INPUTS: [flag: string, envName: string][] = [
  ["--client-id", "MDM_CLIENT_ID"],
  ["--client-secret", "MDM_CLIENT_SECRET"],
  ["--refresh-token", "MDM_REFRESH_TOKEN"],
];

/**
 * Credential-shaped values visible on this invocation — from the environment
 * AND from credential flags (both `--flag value` and `--flag=value`, winner
 * AND loser of a flag-over-env override) — collected BEFORE any line is
 * emitted, so input-resolution failures (which may echo raw argv tokens, e.g.
 * a secret pasted as a positional argument) can be redacted (T11-F01).
 *
 * PRECISE guarantee (T11-R1): a value that exists ONLY in a non-credential
 * argv slot — a fat-finger paste after the wrong flag — is not, and cannot
 * be, known to be a credential, so it is not in this list. That residual
 * class is closed structurally instead: typed-validation failures of
 * non-credential inputs (data centre, numeric ids, MDM_DRY_RUN) never quote
 * the received value. Free-form values (app name, version, APK path, label
 * name, expected group name) ARE echoed deliberately as diagnostics and are
 * redacted whenever they match a value from this list.
 */
export function collectSecretValues(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const values = new Set<string>();
  for (const [, envName] of CREDENTIAL_INPUTS) {
    const fromEnv = env[envName];
    if (fromEnv !== undefined && fromEnv !== "") {
      values.add(fromEnv);
    }
  }
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    for (const [flag] of CREDENTIAL_INPUTS) {
      if (arg === flag) {
        const value = args[index + 1];
        if (value !== undefined && value !== "") {
          values.add(value);
        }
      } else if (arg.startsWith(`${flag}=`)) {
        const value = arg.slice(flag.length + 1);
        if (value !== "") {
          values.add(value);
        }
      }
    }
  }
  return [...values];
}

/**
 * The direct-run catch's redacting formatter (T11-F01). Kept exported so the
 * last-resort path's redaction is unit-tested rather than merely argued: the
 * message it prints cannot leak a credential that was visible in argv/env.
 */
export function formatDirectRunFailure(
  error: unknown,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string {
  return `unexpected failure: ${redactSecrets(errorMessage(error), collectSecretValues(argv, env))}`;
}

// ---------------------------------------------------------------------------
// Pure functions — the monotonic version pre-check
// ---------------------------------------------------------------------------

export type ParsedVersion = { ok: true; parts: number[] } | { ok: false; reason: string };

/** A version is dotted numeric ("1.2.0"); anything else is unparsable — never guessed. */
export function parseDottedVersion(version: string): ParsedVersion {
  const trimmed = version.trim();
  if (trimmed === "") {
    return { ok: false, reason: "the version is empty" };
  }
  const parts: number[] = [];
  for (const segment of trimmed.split(".")) {
    if (!NUMERIC_ID_PATTERN.test(segment)) {
      return { ok: false, reason: `"${segment}" is not a non-negative integer` };
    }
    parts.push(Number(segment));
  }
  return { ok: true, parts };
}

/** Compares numerically per component ("1.0.10" > "1.0.9"); missing parts count as 0. */
export function compareVersionParts(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

/** The existing app's version: the Beta label's app_version when present, else the top-level version. */
export function resolveExistingVersion(
  app: ListedApp,
  betaLabelName: string = BETA_LABEL_NAME,
): string | undefined {
  const beta = app.releaseLabels.find((label) => label.releaseLabelName === betaLabelName);
  if (beta?.appVersion !== undefined && beta.appVersion.trim() !== "") {
    return beta.appVersion;
  }
  if (app.version !== undefined && app.version.trim() !== "") {
    return app.version;
  }
  return undefined;
}

export type VersionCheck = { ok: true } | { ok: false; failure: string };

/**
 * The read-only pre-check: the incoming version must be strictly greater than
 * the existing app's version. Equal, lower, unparsable (either side) or
 * unknown existing versions all refuse — never guess.
 */
export function checkMonotonicVersion(
  incoming: string,
  existing: string | undefined,
): VersionCheck {
  const incomingParsed = parseDottedVersion(incoming);
  if (!incomingParsed.ok) {
    return {
      ok: false,
      failure:
        `MDM_APP_VERSION "${incoming}" is not a dotted numeric version (e.g. 1.2.0) — ` +
        "refusing to guess the comparison",
    };
  }
  if (existing === undefined || existing.trim() === "") {
    return {
      ok: false,
      failure:
        "the existing app's version could not be determined (no Beta label app_version and no " +
        "top-level version) — refusing to guess (fail closed)",
    };
  }
  const existingParsed = parseDottedVersion(existing);
  if (!existingParsed.ok) {
    return {
      ok: false,
      failure: `the existing app's version "${existing}" is not a dotted numeric version — refusing to guess the comparison (fail closed)`,
    };
  }
  if (compareVersionParts(incomingParsed.parts, existingParsed.parts) <= 0) {
    return {
      ok: false,
      failure: `the incoming version ${incoming} is not strictly greater than the existing app's version ${existing} — refusing to upload a non-increasing version (fail closed)`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pure functions — request body builders
// ---------------------------------------------------------------------------

/** The urlencoded refresh-token grant body (contains credentials — never printed). */
export function buildTokenExchangeBody(params: TokenParams): string {
  const fields: [string, string][] = [
    ["grant_type", "refresh_token"],
    ["client_id", params.clientId],
    ["client_secret", params.clientSecret],
    ["refresh_token", params.refreshToken],
  ];
  if (params.redirectUri !== undefined && params.redirectUri !== "") {
    fields.push(["redirect_uri", params.redirectUri]);
  }
  return fields.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

/** The hand-built multipart body — one file part, exactly the documented framing. */
export function buildMultipartFilePart(
  boundary: string,
  fieldName: string,
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
): Uint8Array {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([head, bytes, tail]);
}

// ---------------------------------------------------------------------------
// Input resolution (fail-closed: every message names the variable/flag)
// ---------------------------------------------------------------------------

type StringInputKey =
  | "clientId"
  | "clientSecret"
  | "refreshToken"
  | "redirectUri"
  | "apkPath"
  | "appName"
  | "appVersion"
  | "appCategoryId"
  | "groupId"
  | "expectedGroupName"
  | "productionGroupId"
  | "labelName"
  | "dataCentre";

interface InputSpec {
  flag: string;
  envName: string;
  inputKey: StringInputKey;
  required: boolean;
  valueHint: string;
}

const INPUT_SPECS: InputSpec[] = [
  {
    flag: "--client-id",
    envName: "MDM_CLIENT_ID",
    inputKey: "clientId",
    required: true,
    valueHint: "<id>",
  },
  {
    flag: "--client-secret",
    envName: "MDM_CLIENT_SECRET",
    inputKey: "clientSecret",
    required: true,
    valueHint: "<secret>",
  },
  {
    flag: "--refresh-token",
    envName: "MDM_REFRESH_TOKEN",
    inputKey: "refreshToken",
    required: true,
    valueHint: "<token>",
  },
  {
    flag: "--redirect-uri",
    envName: "MDM_REDIRECT_URI",
    inputKey: "redirectUri",
    required: false,
    valueHint: "<uri>",
  },
  { flag: "--apk", envName: "APK_PATH", inputKey: "apkPath", required: true, valueHint: "<path>" },
  {
    flag: "--app-name",
    envName: "MDM_APP_NAME",
    inputKey: "appName",
    required: true,
    valueHint: "<name>",
  },
  {
    flag: "--app-version",
    envName: "MDM_APP_VERSION",
    inputKey: "appVersion",
    required: true,
    valueHint: "<version>",
  },
  {
    flag: "--app-category-id",
    envName: "MDM_APP_CATEGORY_ID",
    inputKey: "appCategoryId",
    required: false,
    valueHint: "<id>",
  },
  {
    flag: "--group-id",
    envName: "MDM_GROUP_ID",
    inputKey: "groupId",
    required: true,
    valueHint: "<id>",
  },
  {
    flag: "--expected-group-name",
    envName: "MDM_EXPECTED_GROUP_NAME",
    inputKey: "expectedGroupName",
    required: true,
    valueHint: "<name>",
  },
  {
    flag: "--production-group-id",
    envName: "MDM_PRODUCTION_GROUP_ID",
    inputKey: "productionGroupId",
    required: false,
    valueHint: "<id>",
  },
  {
    flag: "--label-name",
    envName: "MDM_LABEL_NAME",
    inputKey: "labelName",
    required: false,
    valueHint: "<name>",
  },
  {
    flag: "--data-centre",
    envName: "MDM_DATA_CENTRE",
    inputKey: "dataCentre",
    required: false,
    valueHint: "<code>",
  },
];

const BOOLEAN_FLAGS = ["--dry-run"];

const KNOWN_FLAGS = [
  ...INPUT_SPECS.map((spec) => spec.flag),
  ...BOOLEAN_FLAGS,
  "--help",
  "-h",
].join(", ");

interface ParsedFlags {
  values: Map<string, string>;
  booleans: Set<string>;
  problems: string[];
}

function parseFlags(args: readonly string[]): ParsedFlags {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const problems: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") continue;
    if (!arg.startsWith("--")) {
      // T11-F01: the raw positional value is deliberately NOT echoed — it may
      // be a pasted secret, and the position is the diagnostic that matters.
      // The resolution-failure emission in main() redacts every line anyway.
      problems.push(
        `unexpected positional argument #${index + 1} — only --flag <value> inputs are accepted`,
      );
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flagName = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    if (BOOLEAN_FLAGS.includes(flagName)) {
      if (equalsIndex !== -1) {
        problems.push(`${flagName} does not take a value`);
        continue;
      }
      booleans.add(flagName);
      continue;
    }
    if (!INPUT_SPECS.some((spec) => spec.flag === flagName)) {
      problems.push(`unknown flag "${flagName}" — expected one of ${KNOWN_FLAGS}`);
      continue;
    }
    if (equalsIndex !== -1) {
      values.set(flagName, arg.slice(equalsIndex + 1));
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      problems.push(`${flagName} requires a value (e.g. ${flagName} <value>)`);
      continue;
    }
    values.set(flagName, value);
    index += 1;
  }
  return { values, booleans, problems };
}

export function resolveInputs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): InputResolution {
  const flags = parseFlags(argv.slice(2));
  const failures: string[] = [...flags.problems];
  const inputs: UploadInputs = {
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    redirectUri: "",
    apkPath: "",
    appName: "",
    appVersion: "",
    appCategoryId: "",
    groupId: "",
    expectedGroupName: "",
    productionGroupId: "",
    labelName: BETA_LABEL_NAME,
    dataCentre: DEFAULT_DATA_CENTRE,
    dryRun: false,
  };

  for (const spec of INPUT_SPECS) {
    const fromFlag = flags.values.get(spec.flag);
    const fromEnv = env[spec.envName];

    if (fromFlag === undefined && fromEnv === undefined) {
      if (spec.required) {
        failures.push(
          `${spec.envName} is empty — provide ${spec.flag} ${spec.valueHint} or set ${spec.envName}`,
        );
      }
      continue; // Optional input: keep the "" default.
    }

    // At least one of flag/env was provided. Empty or whitespace-only means
    // the caller tried and failed — a hard, named error, never a fallback.
    const provided = (fromFlag ?? fromEnv ?? "").trim();
    if (provided === "") {
      failures.push(
        `${spec.envName} is empty — provide ${spec.flag} ${spec.valueHint} or set ${spec.envName}`,
      );
      continue;
    }
    inputs[spec.inputKey] = provided;
  }

  // Read-only mode: the valueless --dry-run flag and/or the MDM_DRY_RUN env.
  const dryRunEnv = env.MDM_DRY_RUN;
  if (dryRunEnv !== undefined && dryRunEnv !== "") {
    const normalized = dryRunEnv.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      inputs.dryRun = true;
    } else if (normalized === "false" || normalized === "0" || normalized === "no") {
      inputs.dryRun = false;
    } else {
      // T11-R1: the received value is not quoted — a mis-pasted credential
      // must not leak even when it appears nowhere correct.
      failures.push("MDM_DRY_RUN must be true or false — the provided value is neither");
    }
  }
  if (flags.booleans.has("--dry-run")) {
    inputs.dryRun = true;
  }

  inputs.dataCentre = inputs.dataCentre.toLowerCase();

  // Derived fail-closed guards — all BEFORE any network call (AC-09).
  // T11-R1: these are TYPED validations of non-credential inputs, so the
  // received value is never quoted — a credential pasted after the wrong
  // flag cannot leak through a shape-violation message. Free-form inputs
  // (label name, app version) keep their echoes: they are useful diagnostics
  // and are redacted by the union list whenever the value is a known credential.
  if (!DATA_CENTRES.has(inputs.dataCentre)) {
    failures.push(
      "MDM_DATA_CENTRE must be one of us, eu, in, au, jp, ca, cn, sa, uk (default us) — " +
        "the provided value is not one of them",
    );
  }
  if (inputs.labelName !== BETA_LABEL_NAME) {
    failures.push(
      `MDM_LABEL_NAME must be exactly "Beta" (AC-09: only the Beta release label is targeted) — got "${inputs.labelName}"`,
    );
  }
  if (inputs.groupId !== "" && !NUMERIC_ID_PATTERN.test(inputs.groupId)) {
    failures.push("MDM_GROUP_ID must be a numeric id — the provided value is not numeric");
  }
  if (inputs.productionGroupId !== "" && !NUMERIC_ID_PATTERN.test(inputs.productionGroupId)) {
    failures.push(
      "MDM_PRODUCTION_GROUP_ID must be a numeric id — the provided value is not numeric",
    );
  }
  if (inputs.appCategoryId !== "" && !NUMERIC_ID_PATTERN.test(inputs.appCategoryId)) {
    failures.push("MDM_APP_CATEGORY_ID must be a numeric id — the provided value is not numeric");
  }
  if (
    inputs.groupId !== "" &&
    inputs.productionGroupId !== "" &&
    // T11-R1: the quoted ids below are then provably digits — a non-numeric
    // value has already produced its own shape failure above, so this message
    // never quotes a credential-shaped token.
    NUMERIC_ID_PATTERN.test(inputs.groupId) &&
    NUMERIC_ID_PATTERN.test(inputs.productionGroupId) &&
    inputs.groupId === inputs.productionGroupId
  ) {
    failures.push(
      `refusing to run: MDM_GROUP_ID (${inputs.groupId}) equals MDM_PRODUCTION_GROUP_ID — ` +
        "the target group must be a NON-PRODUCTION device group (AC-09: non-production-first automation)",
    );
  }
  if (inputs.appVersion !== "" && !parseDottedVersion(inputs.appVersion).ok) {
    failures.push(
      `MDM_APP_VERSION "${inputs.appVersion}" is not a dotted numeric version (e.g. 1.2.0) — ` +
        "refusing to guess the comparison",
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, inputs };
}

// ---------------------------------------------------------------------------
// The HTTP seam — CLI wires the global fetch; tests fake it
// ---------------------------------------------------------------------------

export function createNodeFetch(): FetchLike {
  return async (url, init) => {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      // A string or byte array — both valid BodyInit values; TS 5.9's generic
      // Uint8Array<ArrayBufferLike> does not satisfy the declared parameter
      // type, so assert to the parameter's own type.
      body: init.body as RequestInit["body"],
    });
    return {
      status: response.status,
      ok: response.ok,
      text: () => response.text(),
    };
  };
}

// ---------------------------------------------------------------------------
// Retrying request core (bounded; 429 / COM0002 / 5xx)
// ---------------------------------------------------------------------------

interface HttpCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  /** How the failure message names the call, e.g. "MDM API POST /api/v1/mdm/apps". */
  failureContext: string;
}

type HttpOutcome = { ok: true; status: number; body: string } | { ok: false; failure: string };

interface NetworkDeps {
  fetchImpl: FetchLike;
  sleep: (ms: number) => Promise<void>;
}

/** Surfaces error_code + error_description, never a raw dump of the body. */
function describeErrorBody(envelope: Record<string, unknown> | undefined, rawBody: string): string {
  if (envelope !== undefined) {
    const code = typeof envelope.error_code === "string" ? envelope.error_code : undefined;
    const description =
      typeof envelope.error_description === "string" ? envelope.error_description : undefined;
    if (code !== undefined) {
      return description === undefined ? code : `${code} — ${description}`;
    }
    // The Zoho accounts token endpoint reports errors as {"error": "..."}.
    const error = typeof envelope.error === "string" ? envelope.error : undefined;
    if (error !== undefined) {
      return `error: ${error}`;
    }
  }
  const firstLine =
    rawBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? "";
  if (firstLine === "") {
    return "(the response body was empty)";
  }
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}...` : firstLine;
}

async function requestWithRetry(deps: NetworkDeps, call: HttpCall): Promise<HttpOutcome> {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response: HttpResponse;
    try {
      response = await deps.fetchImpl(call.url, {
        method: call.method,
        headers: call.headers,
        body: call.body,
      });
    } catch (error) {
      // Transport-level failure: fail closed immediately (no retry).
      return {
        ok: false,
        failure: `${call.failureContext} could not be performed: ${errorMessage(error)}`,
      };
    }
    const body = await response.text();
    if (response.ok) {
      return { ok: true, status: response.status, body };
    }
    const parsed = tryParseJson(body);
    const envelope = isRecord(parsed) ? parsed : undefined;
    const errorCode = typeof envelope?.error_code === "string" ? envelope.error_code : undefined;
    const retryable = response.status === 429 || errorCode === "COM0002" || response.status >= 500;
    if (retryable && attempt < MAX_REQUEST_ATTEMPTS) {
      await deps.sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }
    const detail = describeErrorBody(envelope, body);
    const attempts = attempt > 1 ? ` after ${attempt} attempts` : "";
    return {
      ok: false,
      failure: `${call.failureContext} failed (HTTP ${response.status})${attempts}: ${detail}`,
    };
  }
  return { ok: false, failure: `${call.failureContext} failed` };
}

// ---------------------------------------------------------------------------
// The documented MDM operations
// ---------------------------------------------------------------------------

type TokenResult = { ok: true; accessToken: string } | { ok: false; failure: string };

/** One exchange per run (max 10 access tokens per refresh token per 10 minutes). */
async function exchangeToken(
  params: TokenParams,
  accountsBase: string,
  deps: NetworkDeps,
): Promise<TokenResult> {
  const outcome = await requestWithRetry(deps, {
    url: `${accountsBase}/oauth/v2/token`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildTokenExchangeBody(params),
    failureContext: "the token exchange",
  });
  if (!outcome.ok) {
    return {
      ok: false,
      failure:
        `${outcome.failure} — check MDM_CLIENT_ID, MDM_CLIENT_SECRET and MDM_REFRESH_TOKEN ` +
        "(values are never printed)",
    };
  }
  const parsed = tryParseJson(outcome.body);
  const accessToken = isRecord(parsed) ? parsed.access_token : undefined;
  if (typeof accessToken !== "string" || accessToken === "") {
    return {
      ok: false,
      failure:
        "the token exchange response did not include an access_token — check MDM_CLIENT_ID, " +
        "MDM_CLIENT_SECRET and MDM_REFRESH_TOKEN (values are never printed)",
    };
  }
  return { ok: true, accessToken };
}

function parseListedApp(entry: Record<string, unknown>): ListedApp | undefined {
  const appName = typeof entry.app_name === "string" ? entry.app_name : undefined;
  const appIdRaw = entry.app_id;
  const appId =
    typeof appIdRaw === "number" || (typeof appIdRaw === "string" && appIdRaw !== "")
      ? appIdRaw
      : undefined;
  if (appName === undefined || appId === undefined) {
    return undefined;
  }
  const version = typeof entry.version === "string" ? entry.version : undefined;
  const releaseLabels = Array.isArray(entry.release_labels)
    ? entry.release_labels.flatMap((label) => {
        if (!isRecord(label)) return [];
        const labelIdRaw = label.release_label_id;
        const labelId =
          typeof labelIdRaw === "number" || (typeof labelIdRaw === "string" && labelIdRaw !== "")
            ? labelIdRaw
            : undefined;
        const labelName =
          typeof label.release_label_name === "string" ? label.release_label_name : undefined;
        if (labelId === undefined || labelName === undefined) return [];
        const appVersion = typeof label.app_version === "string" ? label.app_version : undefined;
        return [{ releaseLabelId: labelId, releaseLabelName: labelName, appVersion }];
      })
    : [];
  return { appId, appName, version, releaseLabels };
}

type AppListResult = { ok: true; app?: ListedApp } | { ok: false; failure: string };

/**
 * GET /api/v1/mdm/apps, walked by the documented pagination envelope (RD-03).
 * The undocumented "?page=" parameter is NEVER sent. Precedence per response:
 * (1) a non-empty paging.next is a FULL URL — request it verbatim, and ONLY
 * when its origin equals the MDM API host's origin (T15-R1: every request of
 * this walk carries the MDM access token, so a foreign paging.next fails
 * closed instead of sending the bearer to another host); (2) a
 * usable metadata.total_record_count with the accumulated rows at or past
 * the total terminates; (3) a short page (< 50 rows) terminates — the docs'
 * own apps-list example carries no envelope at all; (4) an exactly full page
 * steps with the documented limit/offset query params. A page with MORE than
 * 50 rows and no usable envelope fails closed (termination would be
 * unknowable). The walk terminates on matching the target app, and
 * MAX_LIST_PAGES bounds it either way.
 */
async function fetchAppPages(
  mdmBase: string,
  token: string,
  appName: string,
  deps: NetworkDeps,
): Promise<AppListResult> {
  let url = `${mdmBase}/api/v1/mdm/apps`;
  let accumulatedRows = 0;
  const mdmOrigin = new URL(mdmBase).origin;
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const outcome = await requestWithRetry(deps, {
      url,
      method: "GET",
      headers: authHeaders(token),
      failureContext: `MDM API GET /api/v1/mdm/apps (page ${page})`,
    });
    if (!outcome.ok) {
      return { ok: false, failure: outcome.failure };
    }
    const parsed = tryParseJson(outcome.body);
    const envelope = isRecord(parsed) ? parsed : undefined;
    const rawApps = envelope?.apps;
    if (!Array.isArray(rawApps)) {
      return {
        ok: false,
        failure: `the app list response (page ${page}) is malformed: expected an "apps" array — failing closed`,
      };
    }
    for (const entry of rawApps) {
      if (!isRecord(entry)) continue; // unrelated malformed entries are skipped
      const listed = parseListedApp(entry);
      if (listed === undefined) {
        if (entry.app_name === appName) {
          return {
            ok: false,
            failure: `the App Repository entry for "${appName}" is malformed (no usable app_id) — failing closed`,
          };
        }
        continue;
      }
      if (listed.appName === appName) {
        return { ok: true, app: listed };
      }
    }
    accumulatedRows += rawApps.length;
    const pagingRaw = envelope?.paging;
    const paging = isRecord(pagingRaw) ? pagingRaw : undefined;
    const nextUrl =
      typeof paging?.next === "string" && paging.next.trim() !== "" ? paging.next : undefined;
    if (nextUrl !== undefined) {
      // T15-R1: a paging.next from the response body is untrusted input. Every
      // request this walk makes carries the MDM access token, so the next URL
      // is followed ONLY when its origin is the MDM API host's own origin —
      // anything else (or an unparseable URL) fails closed instead of sending
      // the bearer to a foreign host. The message names only the origins, never
      // the raw next value.
      let nextOrigin: string | undefined;
      try {
        nextOrigin = new URL(nextUrl).origin;
      } catch {
        nextOrigin = undefined;
      }
      if (nextOrigin === undefined) {
        return {
          ok: false,
          failure:
            "the app list paging.next is not a usable absolute URL — failing closed " +
            "(the value is not quoted)",
        };
      }
      if (nextOrigin !== mdmOrigin) {
        return {
          ok: false,
          failure:
            "the app list paging.next points outside the MDM API host (" +
            nextOrigin +
            ", expected " +
            mdmOrigin +
            ") — failing closed: the MDM access token is never sent to another origin",
        };
      }
      url = nextUrl;
      continue;
    }
    const metadataRaw = envelope?.metadata;
    const metadata = isRecord(metadataRaw) ? metadataRaw : undefined;
    const totalRecordCount = metadata?.total_record_count;
    const total =
      typeof totalRecordCount === "number" &&
      Number.isFinite(totalRecordCount) &&
      totalRecordCount >= 0
        ? totalRecordCount
        : undefined;
    if (total !== undefined && accumulatedRows >= total) {
      return { ok: true };
    }
    if (rawApps.length < MDM_API_PAGE_SIZE) {
      return { ok: true };
    }
    if (rawApps.length === MDM_API_PAGE_SIZE) {
      url = `${mdmBase}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${accumulatedRows}`;
      continue;
    }
    return {
      ok: false,
      failure:
        `the app list response (page ${page}) returned ${rawApps.length} rows — more than the ` +
        `documented ${MDM_API_PAGE_SIZE}-row page with no usable paging.next or ` +
        "metadata.total_record_count, so termination is unknowable — failing closed",
    };
  }
  return {
    ok: false,
    failure: `the app list pagination did not terminate after ${MAX_LIST_PAGES} pages — failing closed`,
  };
}

type GroupDetailsResult = { ok: true; name: string } | { ok: false; failure: string };

/**
 * GET /api/v1/mdm/groups/{group_id} — the documented read-only single-group
 * details call (fields group_id/name/group_type/domain; RD-03 replaces the
 * unpaged full-list walk where a single group is needed). The field is the
 * documented "name" — "group_name" appears nowhere in current docs. A
 * non-200 outcome or an unparseable body is reported as a failure and the
 * caller treats the group as missing (fail closed).
 */
async function fetchGroupDetails(
  mdmBase: string,
  token: string,
  groupId: string,
  deps: NetworkDeps,
): Promise<GroupDetailsResult> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/api/v1/mdm/groups/${groupId}`,
    method: "GET",
    headers: authHeaders(token),
    failureContext: `MDM API GET /api/v1/mdm/groups/${groupId}`,
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  const parsed = tryParseJson(outcome.body);
  const body = isRecord(parsed) ? parsed : undefined;
  const groupRaw = body?.group;
  const groupRecord = isRecord(groupRaw) ? groupRaw : body;
  const nameRaw = groupRecord?.name;
  const name = typeof nameRaw === "string" && nameRaw.trim() !== "" ? nameRaw : undefined;
  if (name === undefined) {
    return {
      ok: false,
      failure: 'the group details response did not include a usable "name" field',
    };
  }
  return { ok: true, name };
}

type GroupValidation = { ok: true; name: string } | { ok: false; failure: string };

/**
 * RD-04: pre-mutation group validation with positive name verification.
 * Resolves the target group read-only and requires its documented "name" to
 * equal the required expected group name — id + exact name is the strongest
 * non-production identification the documented contract supports (no
 * documented group_type distinguishes production). Missing, unparseable or
 * mismatched → a refusal naming the group id and the expected name (group
 * ids/names are not secrets; the line still passes the redaction union).
 */
async function validateTargetGroup(
  mdmBase: string,
  token: string,
  inputs: UploadInputs,
  deps: NetworkDeps,
): Promise<GroupValidation> {
  const details = await fetchGroupDetails(mdmBase, token, inputs.groupId, deps);
  if (!details.ok) {
    return {
      ok: false,
      failure:
        `refusing: group ${inputs.groupId} could not be resolved read-only — ${details.failure}. ` +
        "The group is treated as missing (GET /api/v1/mdm/groups/" +
        `${inputs.groupId}); the expected group name is "${inputs.expectedGroupName}" ` +
        "(MDM_EXPECTED_GROUP_NAME) — fail closed: a run cannot proceed safely without the group",
    };
  }
  if (details.name !== inputs.expectedGroupName) {
    return {
      ok: false,
      failure:
        `refusing: group ${inputs.groupId} resolved with name "${details.name}", which does not ` +
        `match the expected group name "${inputs.expectedGroupName}" (MDM_EXPECTED_GROUP_NAME) — ` +
        "the positive group verification failed, fail closed: no mutation was attempted",
    };
  }
  return { ok: true, name: details.name };
}

type LabelResult = { ok: true; releaseLabelId: number | string } | { ok: false; failure: string };

/** POST /api/v1/mdm/labels {"channel_name":"Beta"} → the release_label_id. */
async function resolveBetaLabelId(
  mdmBase: string,
  token: string,
  labelName: string,
  deps: NetworkDeps,
): Promise<LabelResult> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/api/v1/mdm/labels`,
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ channel_name: labelName }),
    failureContext: "MDM API POST /api/v1/mdm/labels",
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  const parsed = tryParseJson(outcome.body);
  const idRaw = isRecord(parsed) ? parsed.release_label_id : undefined;
  if (!(typeof idRaw === "number" || (typeof idRaw === "string" && idRaw !== ""))) {
    return {
      ok: false,
      failure: "the label response did not include a release_label_id — failing closed",
    };
  }
  return { ok: true, releaseLabelId: idRaw };
}

type FileUploadResult = { ok: true; fileId: number | string } | { ok: false; failure: string };

/**
 * Two-phase upload, phase 1 (the only phase — completion is confirmed from
 * THIS response's fileStatus; current docs document no polling endpoint).
 */
async function uploadApkFile(
  mdmBase: string,
  token: string,
  fileName: string,
  bytes: Uint8Array,
  deps: NetworkDeps,
): Promise<FileUploadResult> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/emsapi/files`,
    method: "POST",
    headers: {
      ...authHeaders(token),
      Module: "MDM_APP_MGMT",
      "Content-Type": `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    },
    body: buildMultipartFilePart(
      MULTIPART_BOUNDARY,
      MULTIPART_FIELD_NAME,
      fileName,
      APK_MIME_TYPE,
      bytes,
    ),
    failureContext: "MDM API POST /emsapi/files",
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  const parsed = tryParseJson(outcome.body);
  if (!isRecord(parsed)) {
    return {
      ok: false,
      failure: "the file upload response is malformed (not a JSON object) — failing closed",
    };
  }
  if (Number(parsed.fileStatus) !== FILE_COMPLETED_STATUS) {
    return {
      ok: false,
      failure: `the file upload did not complete: fileStatus ${String(parsed.fileStatus)}, expected ${FILE_COMPLETED_STATUS} (completed) — failing closed`,
    };
  }
  const fileIdRaw = parsed.fileID;
  if (!(typeof fileIdRaw === "number" || (typeof fileIdRaw === "string" && fileIdRaw !== ""))) {
    return {
      ok: false,
      failure: "the file upload response did not include a fileID — failing closed",
    };
  }
  return { ok: true, fileId: fileIdRaw };
}

type CreateResult = { ok: true; appId: number | string } | { ok: false; failure: string };

/** POST /api/v1/mdm/apps — the create path; app_type 2 = Enterprise (in-house). */
async function createApp(
  mdmBase: string,
  token: string,
  appName: string,
  appCategoryId: number,
  releaseLabelId: number | string,
  fileId: number | string,
  deps: NetworkDeps,
): Promise<CreateResult> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/api/v1/mdm/apps`,
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      app_name: appName,
      app_type: 2,
      app_file: fileId,
      app_category_id: appCategoryId,
      supported_devices: 3,
      release_label_id: releaseLabelId,
    }),
    failureContext: "MDM API POST /api/v1/mdm/apps",
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  const parsed = tryParseJson(outcome.body);
  const appIdRaw = isRecord(parsed) ? parsed.app_id : undefined;
  if (!(typeof appIdRaw === "number" || (typeof appIdRaw === "string" && appIdRaw !== ""))) {
    return {
      ok: false,
      failure: "the app-create response did not include an app_id — failing closed",
    };
  }
  return { ok: true, appId: appIdRaw };
}

/**
 * PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id} — the add-version
 * path. force_update_in_label true = update the app version in a label that
 * already has the app.
 */
async function addAppVersion(
  mdmBase: string,
  token: string,
  appId: number | string,
  releaseLabelId: number | string,
  fileId: number | string,
  deps: NetworkDeps,
): Promise<{ ok: true } | { ok: false; failure: string }> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/api/v1/mdm/apps/${appId}/labels/${releaseLabelId}`,
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ app_file: fileId, force_update_in_label: true }),
    failureContext: `MDM API PUT /api/v1/mdm/apps/${appId}/labels/${releaseLabelId}`,
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  return { ok: true };
}

/** POST /api/v1/mdm/groups/{group_id}/apps with silent_install true — ONE group. */
async function associateAppToGroup(
  mdmBase: string,
  token: string,
  groupId: string,
  appId: number | string,
  releaseLabelId: number | string,
  deps: NetworkDeps,
): Promise<{ ok: true } | { ok: false; failure: string }> {
  const outcome = await requestWithRetry(deps, {
    url: `${mdmBase}/api/v1/mdm/groups/${groupId}/apps`,
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      app_details: [{ app_id: appId, release_label_id: releaseLabelId }],
      silent_install: true,
    }),
    failureContext: `MDM API POST /api/v1/mdm/groups/${groupId}/apps`,
  });
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The two flows (dry-run / upload)
// ---------------------------------------------------------------------------

interface UploadContext {
  /** Error line sink — already wrapped in redaction by main(). */
  emit: (line: string) => void;
  /** Output line sink — already wrapped in redaction by main(). */
  report: (line: string) => void;
  /** Registers another value that must never appear in any emitted line (the access token). */
  registerSecret: (value: string) => void;
}

function dataCentreOrRefuse(
  inputs: UploadInputs,
  emit: (line: string) => void,
): { accounts: string; mdm: string } | undefined {
  const centre = DATA_CENTRES.get(inputs.dataCentre);
  if (centre === undefined) {
    // Unreachable after resolveInputs, but never guess a base URL — and never
    // quote the received value (T11-R1).
    emit(
      "MDM_DATA_CENTRE must be one of us, eu, in, au, jp, ca, cn, sa, uk — " +
        "the provided value is not one of them",
    );
    return undefined;
  }
  return centre;
}

async function runDryRun(
  inputs: UploadInputs,
  deps: NetworkDeps,
  context: UploadContext,
): Promise<number> {
  const centre = dataCentreOrRefuse(inputs, context.emit);
  if (centre === undefined) return 1;

  const token = await exchangeToken(
    {
      clientId: inputs.clientId,
      clientSecret: inputs.clientSecret,
      refreshToken: inputs.refreshToken,
      redirectUri: inputs.redirectUri === "" ? undefined : inputs.redirectUri,
    },
    centre.accounts,
    deps,
  );
  if (!token.ok) {
    context.emit(token.failure);
    return 1;
  }
  context.registerSecret(token.accessToken);

  const list = await fetchAppPages(centre.mdm, token.accessToken, inputs.appName, deps);
  if (!list.ok) {
    context.emit(list.failure);
    return 1;
  }

  let appLine: string;
  if (list.app === undefined) {
    appLine =
      `app "${inputs.appName}" was NOT found in the App Repository — the upload would create it ` +
      "(MDM_APP_CATEGORY_ID will be required)";
  } else {
    const version = resolveExistingVersion(list.app);
    const check = checkMonotonicVersion(inputs.appVersion, version);
    if (!check.ok) {
      // The pre-check is read-only: refuse even in dry-run.
      context.emit(check.failure);
      return 1;
    }
    appLine =
      `app "${inputs.appName}" exists in the App Repository (app_id ${list.app.appId}) with existing ` +
      `version "${version ?? "(unknown)"}" — the incoming version ${inputs.appVersion} is strictly greater`;
  }

  // RD-04: a truthful dry-run — exit NON-ZERO whenever the group is missing
  // or its name does not match the expected name (a state in which a real run
  // could not proceed safely).
  const group = await validateTargetGroup(centre.mdm, token.accessToken, inputs, deps);
  if (!group.ok) {
    context.emit(`MDM dry-run failed — ${group.failure}`);
    return 1;
  }

  context.report("MDM dry-run passed (read-only): no changes were made.");
  context.report(appLine);
  context.report(
    `group ${inputs.groupId} ("${group.name}") was verified read-only — the name matches ` +
      "MDM_EXPECTED_GROUP_NAME, so the association step would target it.",
  );
  return 0;
}

async function runUpload(
  inputs: UploadInputs,
  readFile: (path: string) => Promise<Uint8Array>,
  deps: NetworkDeps,
  context: UploadContext,
): Promise<number> {
  const centre = dataCentreOrRefuse(inputs, context.emit);
  if (centre === undefined) return 1;

  // Read the APK first: a doomed run burns zero API calls (the token
  // exchange is throttled — max 10 access tokens per refresh token per 10 min).
  let apkBytes: Uint8Array;
  try {
    apkBytes = await readFile(inputs.apkPath);
  } catch (error) {
    context.emit(
      `could not read the APK at "${inputs.apkPath}" (${errorMessage(error)}) — check APK_PATH`,
    );
    return 1;
  }

  const token = await exchangeToken(
    {
      clientId: inputs.clientId,
      clientSecret: inputs.clientSecret,
      refreshToken: inputs.refreshToken,
      redirectUri: inputs.redirectUri === "" ? undefined : inputs.redirectUri,
    },
    centre.accounts,
    deps,
  );
  if (!token.ok) {
    context.emit(token.failure);
    return 1;
  }
  context.registerSecret(token.accessToken);

  const list = await fetchAppPages(centre.mdm, token.accessToken, inputs.appName, deps);
  if (!list.ok) {
    context.emit(list.failure);
    return 1;
  }

  // The monotonic pre-check refuses BEFORE any mutation (no label POST, no
  // file upload) — the app list read is the only thing that happened.
  if (list.app !== undefined) {
    const check = checkMonotonicVersion(inputs.appVersion, resolveExistingVersion(list.app));
    if (!check.ok) {
      context.emit(check.failure);
      return 1;
    }
  } else if (inputs.appCategoryId === "") {
    // The create path is now known to be needed — fail closed BEFORE any
    // mutation instead of uploading a file the create call cannot use.
    context.emit(
      `MDM_APP_CATEGORY_ID is empty — the app "${inputs.appName}" does not exist yet, so creating it ` +
        "requires an app category id (resolve it in the MDM console, then pass --app-category-id " +
        "or set MDM_APP_CATEGORY_ID)",
    );
    return 1;
  }

  // RD-04: pre-mutation group validation — resolve the target group read-only
  // (GET /api/v1/mdm/groups/{id}) and verify its documented "name" against the
  // required expected group name BEFORE the first mutation (the label POST, the
  // file upload, the app create). The production-group-id equality guard in
  // resolveInputs is belt-and-braces on top of this positive verification.
  const group = await validateTargetGroup(centre.mdm, token.accessToken, inputs, deps);
  if (!group.ok) {
    context.emit(group.failure);
    return 1;
  }

  // RD-05: Beta label reuse before create. POST /api/v1/mdm/labels only when
  // the app has no Beta label (it does not exist, or exists without one) — one
  // label POST per run at most; a POST error fails closed (duplicate-channel
  // behavior is undocumented — never guess idempotency).
  let releaseLabelId: number | string;
  let labelOrigin: "reused" | "created";
  const existingBetaLabel = list.app?.releaseLabels.find(
    (label) => label.releaseLabelName === BETA_LABEL_NAME,
  );
  if (existingBetaLabel !== undefined) {
    releaseLabelId = existingBetaLabel.releaseLabelId;
    labelOrigin = "reused";
  } else {
    const label = await resolveBetaLabelId(centre.mdm, token.accessToken, inputs.labelName, deps);
    if (!label.ok) {
      context.emit(label.failure);
      return 1;
    }
    releaseLabelId = label.releaseLabelId;
    labelOrigin = "created";
  }

  const upload = await uploadApkFile(
    centre.mdm,
    token.accessToken,
    path.basename(inputs.apkPath),
    apkBytes,
    deps,
  );
  if (!upload.ok) {
    context.emit(upload.failure);
    return 1;
  }

  let appId: number | string;
  if (list.app !== undefined) {
    const update = await addAppVersion(
      centre.mdm,
      token.accessToken,
      list.app.appId,
      releaseLabelId,
      upload.fileId,
      deps,
    );
    if (!update.ok) {
      context.emit(update.failure);
      return 1;
    }
    appId = list.app.appId;
  } else {
    const created = await createApp(
      centre.mdm,
      token.accessToken,
      inputs.appName,
      Number(inputs.appCategoryId),
      releaseLabelId,
      upload.fileId,
      deps,
    );
    if (!created.ok) {
      context.emit(created.failure);
      return 1;
    }
    appId = created.appId;
  }

  const associate = await associateAppToGroup(
    centre.mdm,
    token.accessToken,
    inputs.groupId,
    appId,
    releaseLabelId,
    deps,
  );
  if (!associate.ok) {
    context.emit(associate.failure);
    return 1;
  }

  context.report(
    `MDM Beta upload passed: app "${inputs.appName}" (app_id ${appId}) version ${inputs.appVersion} on the ` +
      `${inputs.labelName} release label (id ${releaseLabelId}, ${
        labelOrigin === "reused"
          ? "reused from the app's existing Beta label — no label POST was made"
          : "created this run by POST /api/v1/mdm/labels"
      }), associated with group ${inputs.groupId} ("${group.name}", silent_install enabled).`,
  );
  context.report(
    `file uploaded: fileID ${upload.fileId} (fileStatus ${FILE_COMPLETED_STATUS}); no production ` +
      "approve/distribute/retire operation was called.",
  );
  return 0;
}

// ---------------------------------------------------------------------------
// CLI wiring
// ---------------------------------------------------------------------------

const USAGE = `upload-beta — upload a release APK to the ManageEngine MDM Cloud App
Repository on the "Beta" release label and associate it with ONE
non-production device group (fail-closed; AC-09: non-production-first).

Run with plain Node (24+ native TypeScript):
    node tools/mdm/upload-beta.ts [flags]

Upload mode: one Zoho OAuth refresh-token exchange (one exchange per run —
max 10 access tokens per refresh token per 10 minutes), the app list read
(paginated by the documented envelope: paging.next as a full URL, else the
limit/offset query params — never "page="), the monotonic version pre-check,
the read-only group validation (GET /api/v1/mdm/groups/{group_id} — the
group's documented name must equal the expected group name), then the
two-phase /emsapi/files upload (completion confirmed from the response's
fileStatus), the Beta release label (reused from the app's existing
release_labels when present — POST /api/v1/mdm/labels only otherwise), then
either app create (Enterprise/in-house, app_type 2) or add-version on the
Beta label, and the single group association with silent_install. It NEVER
calls production approve / distribute_update / retire_old_version
operations.

Dry-run (--dry-run or MDM_DRY_RUN=true): token exchange + read-only GETs
(app list with pagination, group details with name verification) + the
version pre-check. No mutation, no APK read; exits 0 with a summary — and
NON-ZERO when the group is missing or its name does not match (a real run
could not proceed safely).

Secrets (required; flag or env; VALUES ARE MASKED in all output — logs
count as credential exposure):
  --client-id <id>               MDM_CLIENT_ID
  --client-secret <secret>       MDM_CLIENT_SECRET
  --refresh-token <token>        MDM_REFRESH_TOKEN
  --redirect-uri <uri>           MDM_REDIRECT_URI   (optional; forwarded to the
                                  token exchange when provided)

Target (required):
  --apk <path>                   APK_PATH           the release APK to upload
  --app-name <name>              MDM_APP_NAME       App Repository name to match
  --app-version <version>        MDM_APP_VERSION    incoming version; must be
                                                      strictly greater than the
                                                      existing app's version
  --group-id <id>                MDM_GROUP_ID       the ONE non-production group
  --expected-group-name <name>   MDM_EXPECTED_GROUP_NAME   the exact NAME the
                                                      group-id must resolve to
                                                      (positive verification)

Guards and options:
  --production-group-id <id>     MDM_PRODUCTION_GROUP_ID   when set, a target
                                                      group id equal to it is
                                                      refused (AC-09)
  --label-name <name>            MDM_LABEL_NAME     default "Beta"; only "Beta"
                                                      is accepted (AC-09)
  --app-category-id <id>         MDM_APP_CATEGORY_ID       required only when
                                                      the app does not exist yet
  --data-centre <code>           MDM_DATA_CENTRE    default "us"; one of:
                                                      us eu in au jp ca cn sa uk
  --dry-run                      MDM_DRY_RUN=true|false
  --help, -h

Flags override the environment. Rate limits: HTTP 429 / COM0002 and 5xx are
retried with bounded backoff (3 attempts, 1 s then 2 s — conservative soft
limits; the numeric 60/min + 5-min-lock figures are not in current docs).
Exit status: 0 on success (or a completed dry-run); 1 on every failure, with
each failure printed to stderr as it is found.`;

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  options: MainOptions = {},
): Promise<number> {
  const errorSink = options.errorSink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const outputSink = options.outputSink ?? ((line: string) => process.stdout.write(`${line}\n`));

  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    outputSink(USAGE);
    return 0;
  }

  const resolution = resolveInputs(argv, env);
  if (!resolution.ok) {
    // T11-F01: these lines may echo raw argv tokens (e.g. a secret pasted as a
    // positional argument or into a non-credential flag's value). The
    // redacting context is not built yet, so redact here with every
    // credential-shaped value visible in argv/env — BEFORE emission.
    const preEmitSecrets = collectSecretValues(argv, env);
    for (const failure of resolution.failures) {
      errorSink(redactSecrets(failure, preEmitSecrets));
    }
    return 1;
  }
  const inputs = resolution.inputs;

  // Every emitted line is mechanically scrubbed of the credential values —
  // defense in depth on top of never building messages from them. Both the
  // resolved values AND any credential value left behind in argv/env (the
  // losing side of a flag-over-env override) are in the list.
  const secrets: string[] = [
    ...new Set([
      ...collectSecretValues(argv, env),
      inputs.clientId,
      inputs.clientSecret,
      inputs.refreshToken,
    ]),
  ].filter((secret) => secret !== "");
  const context: UploadContext = {
    emit: (line) => {
      errorSink(redactSecrets(line, secrets));
    },
    report: (line) => {
      outputSink(redactSecrets(line, secrets));
    },
    registerSecret: (value) => {
      secrets.push(value);
    },
  };

  const deps: NetworkDeps = {
    fetchImpl: options.fetchImpl ?? createNodeFetch(),
    sleep: options.sleep ?? sleepMilliseconds,
  };
  const readFile = options.readFile ?? readApkFromDisk;

  try {
    if (inputs.dryRun) {
      return await runDryRun(inputs, deps, context);
    }
    return await runUpload(inputs, readFile, deps, context);
  } catch (error) {
    context.emit(`unexpected failure: ${errorMessage(error)}`);
    return 1;
  }
}

const SCRIPT_FILENAME = "upload-beta.ts";

/**
 * Direct-run detection. import.meta.url is NOT usable here: the colocated
 * jest test imports this module through babel's commonjs transform, which
 * cannot parse import.meta (probed at T09 — the transform itself fails).
 * argv[1] is this script's path under `node tools/mdm/upload-beta.ts` and the
 * jest binary's path under every jest invocation, so a basename comparison
 * discriminates reliably in both worlds. process.exitCode (not process.exit)
 * is set so stderr output is never truncated.
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && path.basename(entry) === SCRIPT_FILENAME;
}

if (isDirectRun()) {
  void (async () => {
    try {
      process.exitCode = await main(process.argv, process.env);
    } catch (error) {
      // Redacted with the same argv/env credential list (T11-F01): even a
      // last-resort crash line cannot leak a credential visible to the run.
      process.stderr.write(`${formatDirectRunFailure(error, process.argv, process.env)}\n`);
      process.exitCode = 1;
    }
  })();
}
