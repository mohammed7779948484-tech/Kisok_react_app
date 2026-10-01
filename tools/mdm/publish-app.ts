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
 * The pipeline:
 *
 *     refresh-token grant          POST {accounts}/oauth/v2/token
 *     list candidates              GET  {mdm}/api/v1/mdm/apps
 *     IDENTIFY by bundle id        GET  {mdm}/api/v1/mdm/apps/{app_id}
 *                                       /labels/{release_label_id}
 *     upload the APK               POST {mdm}/emsapi/files
 *     wait, only if pending        POST {mdm}/emsapi/fileupload/status
 *     create or update             POST {mdm}/api/v1/mdm/apps
 *                                  PUT  {mdm}/api/v1/mdm/apps/{app_id}/labels/{release_label_id}
 *
 * Identity is resolved and verified BEFORE the upload, so an App Repository
 * state this script cannot read no longer uploads first and fails second. It
 * does not make orphans impossible: an upload that succeeds and is followed by
 * a failed create/update still leaves the file behind.
 *
 * Headers follow the documented contract: `Authorization: Zoho-oauthtoken
 * <token>` (NOT Bearer) and `Content-Type: application/json`. `Accept:
 * application/json` rides along on every authenticated call, including the
 * multipart upload — it is convention, NOT a confirmed documented requirement.
 *
 * There is no group, label or rollout orchestration: one physical customer
 * tablet is planned, and device assignment is a console decision.
 *
 * Fail closed everywhere. Every required input is checked before the first
 * network call; every unexpected response shape stops the run with a message
 * naming the endpoint. The one rule worth stating twice: the application is
 * matched by PACKAGE IDENTITY (`com.kisok.kiosk`), read from App Details.
 * The display name selects nothing — every listed entry is checked, so an
 * entry that merely shares the name is never updated AND an entry under a
 * different name is never missed.
 *
 * The App Details read is LABEL-SCOPED on the current Cloud API, so the Stable
 * release label is resolved from the LISTING first — by the documented
 * `release_label_type` (1 = Stable, 2 = Beta), never by `release_label_name`,
 * which is UI text a tenant may rename. Identity then requires all three of
 * `bundle_identifier`, `app_type` 2 (Enterprise) and `platform_type` 2
 * (Android).
 *
 * ⚠️ TENANT VALIDATION REQUIRED. These contracts are taken from the vendor's
 * current Cloud API documentation. Status, against a real tenant:
 *
 *   OBSERVED         — OAuth token exchange, App Repository listing, and
 *                       repository-absence detection (all SUCCEEDED).
 *   OBSERVED, FAILED  — the APK upload, when it hand-built the multipart body
 *                       itself: `POST /emsapi/files` answered HTTP 406.
 *   NOT YET OBSERVED — the APK upload now built with Node's native
 *                       `FormData`/`Blob` (the fix for the 406), and both app
 *                       creation and app update. The next real dispatch is
 *                       the proof for these; nothing above claims otherwise.
 *
 * Nothing guesses silently: an unrecognised response shape, an entry that
 * cannot be identified, a repository whose App Details carry no identity
 * field, or an id this script cannot represent without precision loss all
 * stop the run instead of mutating anything.
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
  init?: { method?: string; headers?: Record<string, string>; body?: RequestInit["body"] },
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
  | {
      status: "found";
      appId: number | string;
      releaseLabelId: number | string;
      /** The tenant's own app_name, echoed back on update so a console rename survives. */
      appName: string;
    }
  | { status: "absent" }
  | { status: "ambiguous"; reason: string };

/** One release label on the App Details response. */
export interface ReleaseLabel {
  releaseLabelId: number | string;
  releaseLabelType: number;
  /** Descriptive UI text. Logged, never used to choose a channel. */
  releaseLabelName: string | undefined;
}

export type StableSelection = { ok: true; label: ReleaseLabel } | { ok: false; reason: string };

/**
 * One App Repository entry reduced to what addresses its App Details.
 *
 * App Details is label-scoped — `GET /apps/{app_id}/labels/{release_label_id}`
 * — so a label id must be resolved from the LISTING before identity can be
 * read at all. Identity (package, app type, platform) belongs to the app, not
 * to a channel, so any of the app's labels addresses it. Which label a
 * release is pushed to is decided separately, and only for our own entry.
 */
export interface ListedCandidate {
  appId: number | string;
  /** The label id that addresses this entry's App Details. */
  addressLabelId: number | string;
  /** The listing's Stable label, or why the listing alone cannot name it. */
  stable: StableSelection;
}

/** The subset of App Details this pipeline reads. */
export interface AppDetails {
  appId: number | string;
  /** The name the TENANT gives this app — not ours. See the update body. */
  appName: string | undefined;
  /**
   * Set when the body echoed an app_id that is not the one requested, so this
   * payload describes some OTHER app and nothing in it may be trusted.
   */
  respondsToAnotherApp: number | string | undefined;
  bundleIdentifier: string | undefined;
  appType: number | undefined;
  platformType: number | undefined;
  /** The body's own `release_labels`, unparsed — read only for our own entry. */
  releaseLabels: unknown;
}

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

/**
 * How many App Details reads one run will make. Identity requires reading
 * every listed entry, so this bounds the work — and exceeding it fails the run
 * rather than concluding `absent` from a partial scan.
 */
const MAX_DETAIL_READS = 200;

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
 * The DOCUMENTED identity field on the App Details response
 * (`GET /api/v1/mdm/apps/{app_id}`), whose fields are app_id, app_name,
 * app_category, app_type, bundle_identifier, version, platform_type,
 * description, icon, store_url, is_app_paid, country_code, store_id,
 * added_time, modified_time and release_labels.
 *
 * An earlier version guessed at `identifier` / `bundle_id` / `package_name` /
 * `app_package_name` on the LIST response. None of those is documented, so a
 * tenant returning none of them made every app look unidentifiable. Identity
 * is now established from App Details, where the field is specified.
 */
const BUNDLE_IDENTIFIER_FIELD = "bundle_identifier";

/** The release label whose version this pipeline updates. */
/**
 * Documented `release_label_type` on the App Management API: 1 = Stable,
 * 2 = Beta. This — NOT `release_label_name` — is the semantic selector.
 * The name is UI text a tenant may rename at will, so selecting on it could
 * both miss a renamed Stable label and pick a channel called "Stable" that
 * is not the stable one.
 */
const RELEASE_LABEL_TYPE_STABLE = 1;

/** Documented App Management `platform_type`: 1 = iOS, 2 = Android, 3 = Windows. */
const PLATFORM_TYPE_ANDROID = 2;

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

/**
 * ManageEngine's own documented long ids — `fileID` (and the status API's
 * `file_id`), `app_id`, `release_label_id` — can exceed
 * `Number.MAX_SAFE_INTEGER`. A plain `JSON.parse` already loses precision the
 * moment such a value is tokenised into a JS number, before any code here
 * runs, so these fields are recovered from the ORIGINAL source text via
 * Node's `JSON.parse` reviver `context.source` rather than trusted as parsed
 * numbers.
 */
const LOSSLESS_ID_FIELDS = new Set(["fileID", "file_id", "app_id", "release_label_id"]);

/** A bare, non-negative decimal integer — no sign, no leading zero, no exponent. */
function isDecimalId(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

/** The third argument Node's `JSON.parse` reviver receives. Not yet in `lib.d.ts`. */
type JsonReviverContext = { source?: string };

/**
 * Parse a response body, recovering `LOSSLESS_ID_FIELDS` exactly.
 *
 * A safe integer is canonicalised to its decimal string so every id this
 * script touches is a plain decimal string from this point on. An unsafe
 * integer is recovered from `context.source` ONLY when that source is itself
 * a plain decimal integer; anything else (no source, scientific notation, a
 * fractional part) is left as the already-rounded JS number, which
 * `readId` below then refuses rather than use.
 */
function tryParseJson(text: string): unknown {
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
 * Accept an id ONLY when it can be represented without precision loss: a
 * plain decimal string, or a JS number that is itself a safe non-negative
 * integer. Never `Number(...)`/`parseInt(...)` — both silently round a value
 * above `Number.MAX_SAFE_INTEGER` before it can be rejected.
 */
function readId(value: unknown): number | string | undefined {
  if (typeof value === "string" && isDecimalId(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  return undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

const LABEL_FIELDS = ["release_label_id", "release_label_type", "release_label_name"] as const;

/**
 * A release label's SHAPE for a failure message: which documented fields it
 * carries and their JSON types, never their values. Without it a run that
 * stops on an unreadable label cannot say what the tenant actually sent.
 */
export function describeLabelShape(raw: unknown): string {
  if (!isRecord(raw)) return raw === null ? "null" : typeof raw;
  const typeOf = (value: unknown) => (value === null ? "null" : typeof value);
  const fields = LABEL_FIELDS.map((key) => {
    if (!(key in raw)) return `${key}: missing`;
    const readable =
      key === "release_label_id"
        ? readId(raw[key]) !== undefined
        : key === "release_label_type"
          ? readInteger(raw[key]) !== undefined
          : typeof raw[key] === "string";
    return `${key}: ${typeOf(raw[key])}${readable ? "" : " (unreadable)"}`;
  });
  const others = Object.keys(raw)
    .filter((key) => !(LABEL_FIELDS as readonly string[]).includes(key))
    .sort();
  return `{${fields.join(", ")}${others.length > 0 ? `; other keys: ${others.join(", ")}` : ""}}`;
}

/**
 * Select the Stable release label of ONE listed entry.
 *
 * The semantic selector is the documented `release_label_type` (1 = Stable,
 * 2 = Beta), never `release_label_name`. The name is UI text: a tenant may
 * rename "Stable" to anything, and a channel called "Stable" need not be the
 * stable one. Selecting on the name could therefore both miss the real Stable
 * label and ship a release into Beta.
 *
 * Fails closed on anything it cannot read, because the label id is what
 * ADDRESSES App Details — without it this entry's identity cannot be checked
 * at all, and an unidentifiable entry could be ours.
 */
export function selectStableLabel(rawLabels: unknown, appId: number | string): StableSelection {
  if (!Array.isArray(rawLabels)) {
    return {
      ok: false,
      reason: `app_id ${appId} carried no readable release_labels array`,
    };
  }

  const stable: ReleaseLabel[] = [];
  for (const [index, raw] of rawLabels.entries()) {
    const id = isRecord(raw) ? readId(raw.release_label_id) : undefined;
    const type = isRecord(raw) ? readInteger(raw.release_label_type) : undefined;
    // A label whose id or type cannot be read could be the Stable one, so it
    // is not something to skip past — no channel can be chosen from this list.
    if (id === undefined || type === undefined) {
      return {
        ok: false,
        reason:
          `app_id ${appId} carried a release label with no readable id or type ` +
          `(release_labels[${index}] ${describeLabelShape(raw)})`,
      };
    }
    if (type !== RELEASE_LABEL_TYPE_STABLE) continue;
    const name =
      isRecord(raw) && typeof raw.release_label_name === "string"
        ? raw.release_label_name
        : undefined;
    stable.push({ releaseLabelId: id, releaseLabelType: type, releaseLabelName: name });
  }

  if (stable.length === 0) {
    return {
      ok: false,
      reason:
        `app_id ${appId} has no release label of the documented Stable type ` +
        `(${RELEASE_LABEL_TYPE_STABLE})`,
    };
  }
  if (stable.length > 1) {
    return {
      ok: false,
      reason:
        `app_id ${appId} has ${stable.length} release labels of the Stable type ` +
        `(${RELEASE_LABEL_TYPE_STABLE}) — refusing to guess which one to update`,
    };
  }
  return { ok: true, label: stable[0]! };
}

/**
 * The label id that addresses ONE listed entry's App Details: its Stable
 * label when the listing names exactly one, otherwise the first label with a
 * readable id. Only an entry with no readable label id at all cannot be
 * addressed — and so cannot be identified.
 */
export function addressLabel(
  rawLabels: unknown,
  appId: number | string,
): { ok: true; labelId: number | string } | { ok: false; reason: string } {
  if (!Array.isArray(rawLabels)) {
    return { ok: false, reason: `app_id ${appId} carried no readable release_labels array` };
  }
  const stable = selectStableLabel(rawLabels, appId);
  if (stable.ok) return { ok: true, labelId: stable.label.releaseLabelId };
  for (const raw of rawLabels) {
    const id = isRecord(raw) ? readId(raw.release_label_id) : undefined;
    if (id !== undefined) return { ok: true, labelId: id };
  }
  return {
    ok: false,
    reason:
      `app_id ${appId} carried no release label with a readable id ` +
      `(${rawLabels.length === 0 ? "no labels" : rawLabels.map(describeLabelShape).join(", ")})`,
  };
}

/**
 * Every listed entry reduced to an addressable (app_id, release_label_id) pair.
 *
 * Deliberately NOT filtered by display name. A previous version selected only
 * entries named exactly "KISOK", which meant an app sitting in the repository
 * under any other name — "KISOK Kiosk", a rename, a different case — was never
 * examined at all, so the walk concluded `absent` and CREATED a duplicate
 * enterprise app. Scanning every entry is what makes "absent" mean absent.
 *
 * An entry this cannot reduce is counted as `unusable`, never dropped: App
 * Details is label-scoped, so an entry whose Stable label cannot be resolved
 * is an entry whose identity cannot be read — and that is indistinguishable
 * from ours until proven otherwise.
 */
export function listedCandidates(apps: readonly unknown[]): {
  candidates: ListedCandidate[];
  unusable: number;
  reasons: string[];
} {
  const candidates: ListedCandidate[] = [];
  const reasons: string[] = [];
  let unusable = 0;
  for (const app of apps) {
    // An entry that is not even an object is as unreadable as one with no
    // app_id, and must be counted the same way. An earlier version dropped
    // these in the listing walk instead, so they never reached this counter:
    // the walk collected nothing, reported nothing unusable, and `absent`
    // took the create branch.
    const appId = isRecord(app) ? readId(app.app_id) : undefined;
    if (appId === undefined) {
      unusable += 1;
      reasons.push("an entry carried no usable app_id");
      continue;
    }
    const rawLabels = isRecord(app) ? app.release_labels : undefined;
    const address = addressLabel(rawLabels, appId);
    if (!address.ok) {
      unusable += 1;
      reasons.push(address.reason);
      continue;
    }
    candidates.push({
      appId,
      addressLabelId: address.labelId,
      stable: selectStableLabel(rawLabels, appId),
    });
  }
  return { candidates, unusable, reasons };
}

/**
 * Is this value safe to splice into a URL path segment?
 *
 * Ids come from the MDM's own responses, but so does `paging.next`, which is
 * origin-checked for exactly this reason: a response-supplied value must not
 * be able to retarget an authenticated request (`"1/../../other"`).
 */
export function isSafePathSegment(value: number | string): boolean {
  return typeof value === "number" ? Number.isInteger(value) : /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Parse the label-scoped App Details fields this pipeline reads.
 *
 * Release labels are NOT read here: the label id is what addresses this very
 * response, so it is resolved from the App Repository listing beforehand.
 */
export function parseAppDetails(body: unknown, appId: number | string): AppDetails {
  const record = isRecord(body) ? body : {};
  // Some tenants nest the object; accept either shape without inventing one.
  const app = isRecord(record.app) ? record.app : record;
  const bundle = app[BUNDLE_IDENTIFIER_FIELD];
  // Does this body describe the app we asked for? The request is addressed by
  // path, so a body carrying a different app_id means the response is not the
  // one requested, and everything read out of it — the name we echo back on
  // update above all — belongs to another app.
  const echoedId = readId(app.app_id);
  const mismatchedId = echoedId !== undefined && String(echoedId) !== String(appId);
  return {
    appId,
    respondsToAnotherApp: mismatchedId ? echoedId : undefined,
    appName: typeof app.app_name === "string" ? app.app_name : undefined,
    bundleIdentifier: typeof bundle === "string" ? bundle : undefined,
    appType: readInteger(app.app_type),
    platformType: readInteger(app.platform_type),
    releaseLabels: app.release_labels,
  };
}

/**
 * Is this App Details payload positively OUR application?
 *
 * Three documented assertions, all required:
 *  - `bundle_identifier` equals the package exactly. On Android this IS the
 *    package name, so it is the identity, and it is platform-specific by
 *    construction — no other platform has a `com.kisok.kiosk`.
 *  - `app_type` is 2, the documented Enterprise (in-house) app type.
 *
 *  - `platform_type` is 2, the documented App Management value for Android.
 *
 * All three are required together. `bundle_identifier` alone says what the
 * package is called; the other two say it is the in-house Android app this
 * pipeline builds, rather than something else the tenant registered under the
 * same identifier.
 */
export type Identification =
  | { ok: true }
  /** Positively somebody else's app. Skipping it is safe. */
  | { ok: false; kind: "other-package" }
  /** Could not be judged either way. Skipping it is NOT safe. */
  | { ok: false; kind: "unverifiable"; reason: string };

export function identifyApp(details: AppDetails, packageName: string): Identification {
  // A body about a different app tells us nothing about the one we asked for,
  // and its app_name is the field the update echoes back — trusting it would
  // rename the tenant's app to a stranger's.
  if (details.respondsToAnotherApp !== undefined) {
    return {
      ok: false,
      kind: "unverifiable",
      reason:
        `the App Details read for app_id ${details.appId} answered with app_id ` +
        `${JSON.stringify(details.respondsToAnotherApp)}, so it describes a different app`,
    };
  }
  // The distinction this function exists to make. "This is a different app"
  // and "I could not tell what this app is" are not the same answer, and
  // collapsing them means an unreadable entry gets treated as absence — which
  // takes the create branch and duplicates the app.
  if (details.bundleIdentifier === undefined) {
    return {
      ok: false,
      kind: "unverifiable",
      reason:
        `app_id ${details.appId} carried no ${BUNDLE_IDENTIFIER_FIELD}, so it cannot be ` +
        "judged either ours or another app's",
    };
  }
  if (details.bundleIdentifier !== packageName) return { ok: false, kind: "other-package" };

  if (details.appType !== APP_TYPE_ENTERPRISE) {
    return {
      ok: false,
      kind: "unverifiable",
      reason:
        `app_id ${details.appId} claims ${packageName} but carries app_type ` +
        `${String(details.appType)}, not the Enterprise type ${APP_TYPE_ENTERPRISE}`,
    };
  }
  if (details.platformType !== PLATFORM_TYPE_ANDROID) {
    return {
      ok: false,
      kind: "unverifiable",
      reason:
        `app_id ${details.appId} claims ${packageName} but carries platform_type ` +
        `${String(details.platformType)}, not Android (${PLATFORM_TYPE_ANDROID})`,
    };
  }
  return { ok: true };
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
  init: { method?: string; headers?: Record<string, string>; body?: RequestInit["body"] },
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

/**
 * The documented ManageEngine MDM Cloud auth scheme.
 *
 * `Zoho-oauthtoken`, NOT `Bearer`. The API documentation's own curl example is
 *     -H 'Authorization: Zoho-oauthtoken ba4604e8e433g9c892e360d53463oec5'
 * and a `Bearer` prefix is simply not recognised, so every call would have
 * come back 401. `Accept` rides along on the JSON calls; it is conventional
 * rather than confirmed-mandatory (see the header note in the module doc).
 */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" };
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

/** Read the APK up front, so a bad path fails before any network call. */
async function readApkOrFail(inputs: PublishInputs, deps: PublishDeps): Promise<Uint8Array> {
  try {
    return await deps.readApk(inputs.apkPath);
  } catch (caught) {
    fail(
      `the APK at ${inputs.apkPath} could not be read: ` +
        (caught instanceof Error ? caught.message : String(caught)),
    );
  }
}

async function uploadApk(
  inputs: PublishInputs,
  hosts: { mdm: string },
  token: string,
  bytes: Uint8Array,
  deps: PublishDeps,
): Promise<number | string> {
  const fileName = inputs.apkPath.split("/").pop() ?? "app-release.apk";
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/vnd.android.package-archive" }),
    fileName,
  );

  const parsed = (await request(deps, "the APK upload", `${hosts.mdm}/emsapi/files`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      Module: "MDM_APP_MGMT",
    },
    body: form,
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
  const collected: unknown[] = [];

  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const parsed = (await request(deps, `the App Repository listing (page ${page})`, url, {
      method: "GET",
      headers: authHeaders(token),
    })) as Record<string, unknown>;

    const apps = parsed.apps;
    if (!Array.isArray(apps)) {
      fail(`the App Repository listing (page ${page}) carried no "apps" array — failing closed`);
    }
    // Every entry, including ones that are not objects. Filtering here would
    // hide them from the unusable count that fails the run closed.
    for (const app of apps) collected.push(app);

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

  return verifyCandidates(collected, inputs, hosts, token, deps);
}

/**
 * Turn listed candidates into a positively identified app, or refuse.
 *
 * `GET /api/v1/mdm/apps/{app_id}/labels/{release_label_id}` is the documented
 * App Details endpoint on the current Cloud API — it is LABEL-SCOPED, which is
 * why the Stable label is resolved from the listing first. Every candidate is
 * fetched: a candidate whose details cannot be read is a failure, never a
 * skip, because skipping one would silently take the create branch and
 * duplicate the app.
 */
async function verifyCandidates(
  collected: readonly unknown[],
  inputs: PublishInputs,
  hosts: { mdm: string },
  token: string,
  deps: PublishDeps,
): Promise<AppMatch> {
  const listed = listedCandidates(collected);

  if (listed.unusable > 0) {
    return {
      status: "ambiguous",
      reason:
        `${listed.unusable} App Repository entr${listed.unusable === 1 ? "y" : "ies"} could not ` +
        `be reduced to an addressable (app_id, release_label_id) pair, so ` +
        `${inputs.packageName} cannot be confirmed present or absent — one of them could be ` +
        `ours: ${listed.reasons.join("; ")}`,
    };
  }
  if (listed.candidates.length === 0) return { status: "absent" };

  if (listed.candidates.length > MAX_DETAIL_READS) {
    return {
      status: "ambiguous",
      reason:
        `the App Repository holds ${listed.candidates.length} entries, more than the ` +
        `${MAX_DETAIL_READS} this script will read App Details for, so ${inputs.packageName} ` +
        "cannot be confirmed present or absent — failing closed rather than risking a duplicate app",
    };
  }

  const verified: { details: AppDetails; candidate: ListedCandidate }[] = [];
  const unverifiable: string[] = [];

  for (const candidate of listed.candidates) {
    // Both ids are spliced into an authenticated URL path, so both are checked.
    for (const [what, value] of [
      ["app_id", candidate.appId],
      ["release_label_id", candidate.addressLabelId],
    ] as const) {
      if (!isSafePathSegment(value)) {
        return {
          status: "ambiguous",
          reason: `the App Repository listing returned a ${what} that is not a plain id: ${JSON.stringify(value)}`,
        };
      }
    }
    const body = await request(
      deps,
      `the App Details read for app_id ${candidate.appId} label ${candidate.addressLabelId}`,
      `${hosts.mdm}/api/v1/mdm/apps/${candidate.appId}/labels/${candidate.addressLabelId}`,
      { method: "GET", headers: authHeaders(token) },
    );
    const details = parseAppDetails(body, candidate.appId);
    const identity = identifyApp(details, inputs.packageName);
    if (identity.ok) verified.push({ details, candidate });
    // A DIFFERENT package is positively somebody else's app — skipping it is
    // safe. Anything we could not judge is not, and must stop the run.
    else if (identity.kind === "unverifiable") unverifiable.push(identity.reason);
  }

  if (unverifiable.length > 0) {
    return {
      status: "ambiguous",
      reason:
        `${unverifiable.length} App Repository entr${unverifiable.length === 1 ? "y" : "ies"} ` +
        `could not be identified: ${unverifiable.join("; ")}. One of them could be ` +
        `${inputs.packageName}, so this run will not create or update anything. If EVERY entry ` +
        `reads this way, this tenant's App Details response does not carry ` +
        `${BUNDLE_IDENTIFIER_FIELD} and the documented contract this script relies on for ` +
        "identity does not hold",
    };
  }

  if (verified.length === 0) return { status: "absent" };

  if (verified.length > 1) {
    return {
      status: "ambiguous",
      reason:
        `${verified.length} App Repository entries claim ${inputs.packageName} ` +
        `(app_ids ${verified.map((v) => v.details.appId).join(", ")}) — refusing to guess which to update`,
    };
  }

  const { details, candidate } = verified[0]!;
  if (details.appName === undefined) {
    return {
      status: "ambiguous",
      reason: `app_id ${details.appId} carried no app_name, which the update body requires`,
    };
  }

  // Only now, for the entry proven to be ours, is the channel chosen — from
  // the listing, or else from App Details' own labels, by the same strict
  // rule: exactly one label of the documented Stable type, never by name.
  let stable = candidate.stable;
  if (!stable.ok) {
    const fromDetails = selectStableLabel(details.releaseLabels, details.appId);
    if (!fromDetails.ok) {
      return {
        status: "ambiguous",
        reason:
          `${inputs.packageName} is app_id ${details.appId}, but its Stable release label ` +
          `cannot be chosen — listing: ${stable.reason}; App Details: ${fromDetails.reason}`,
      };
    }
    stable = fromDetails;
  }
  const { label } = stable;
  if (!isSafePathSegment(label.releaseLabelId)) {
    return {
      status: "ambiguous",
      reason: `the Stable release_label_id is not a plain id: ${JSON.stringify(label.releaseLabelId)}`,
    };
  }

  deps.log(
    `identified ${inputs.packageName} as app_id ${details.appId} on Stable release label ` +
      `${label.releaseLabelId}` +
      (label.releaseLabelName === undefined ? "" : ` ("${label.releaseLabelName}")`),
  );
  return {
    status: "found",
    appId: details.appId,
    releaseLabelId: label.releaseLabelId,
    appName: details.appName,
  };
}

/**
 * Validate a ManageEngine id and return it as a bare JSON integer literal.
 * `app_file` is documented as a `long` on Add/Update App — an unquoted JSON
 * number, not a string — so the id must land on the wire unquoted. Never
 * `Number(...)`/`parseInt(...)`: both round an id above
 * `Number.MAX_SAFE_INTEGER` before it could be serialised.
 */
function decimalIdLiteral(value: number | string, fieldName: string): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`${fieldName} is not a safe non-negative integer`);
    }
    return String(value);
  }
  if (!isDecimalId(value)) {
    fail(`${fieldName} is not a plain decimal id`);
  }
  return value;
}

/**
 * The two ManageEngine mutation bodies, built explicitly rather than through
 * `JSON.stringify` — that would round-trip `app_file` through a JS number and
 * reintroduce the precision loss `decimalIdLiteral` exists to prevent.
 * `JSON.stringify` is used only for the genuine string field, `app_name`.
 */
function buildCreateAppBody(appName: string, fileId: number | string): string {
  return (
    "{" +
    `"app_name":${JSON.stringify(appName)},` +
    `"app_type":${APP_TYPE_ENTERPRISE},` +
    `"app_file":${decimalIdLiteral(fileId, "app_file")}` +
    "}"
  );
}

function buildUpdateAppBody(appName: string, fileId: number | string): string {
  return (
    "{" +
    `"app_name":${JSON.stringify(appName)},` +
    `"app_type":${APP_TYPE_ENTERPRISE},` +
    `"app_file":${decimalIdLiteral(fileId, "app_file")},` +
    `"force_update_in_label":true` +
    "}"
  );
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

    // Read the APK before any network call. It is a required input, and
    // discovering a bad path after a token exchange and a full repository walk
    // breaks the "checked before the first network call" promise above.
    // Read the APK even on a dry run. Dry run exists to prove a real dispatch
    // would work, and a wrong --apk path is exactly the failure it should
    // catch; skipping the read moved that failure to the real run.
    const apkBytes = await readApkOrFail(inputs, deps);

    const token = await exchangeToken(inputs, hosts, deps);
    secrets.push(token);

    // RESOLVE AND VERIFY FIRST, upload second. An ambiguous repository state
    // must cost nothing: uploading before this point left an orphan file in
    // the tenant every time identity could not be established.
    const match = await findApp(inputs, hosts, token, deps);
    if (match.status === "ambiguous") fail(match.reason);

    if (inputs.dryRun) {
      return {
        ok: true,
        action: "dry-run",
        detail:
          match.status === "found"
            ? `authenticated; ${inputs.packageName} is app_id ${match.appId} in release label ` +
              `${match.releaseLabelId} — a real run would UPDATE that label`
            : `authenticated; ${inputs.packageName} is not in the App Repository — a real run would CREATE it`,
      };
    }

    const fileId = await uploadApk(inputs, hosts, token, apkBytes, deps);

    if (match.status === "found") {
      // The documented update path is label-scoped:
      //   PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}
      // and `force_update_in_label` must be true to update the app VERSION in
      // a label that already carries the app — which is exactly this flow.
      // An earlier version PUT to /apps/{app_id} with no label segment and no
      // force flag, which is not the documented endpoint at all.
      await request(
        deps,
        `the app update for app_id ${match.appId} in release label ${match.releaseLabelId}`,
        `${hosts.mdm}/api/v1/mdm/apps/${match.appId}/labels/${match.releaseLabelId}`,
        {
          method: "PUT",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          // The TENANT's own name, read back from App Details — not ours.
          // `app_name` is documented-mandatory on this endpoint, so it must be
          // sent; sending `inputs.appName` would quietly rename the app in the
          // console on every release, because any package match is now
          // updated regardless of what the operator called it.
          body: buildUpdateAppBody(match.appName, fileId),
        },
        { allowEmptyBody: true },
      );
      return {
        ok: true,
        action: "updated",
        detail:
          `updated ${inputs.packageName} (app_id ${match.appId}, release label ` +
          `${match.releaseLabelId}) with file ${fileId}`,
      };
    }

    const created = (await request(deps, "the app creation", `${hosts.mdm}/api/v1/mdm/apps`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: buildCreateAppBody(inputs.appName, fileId),
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
