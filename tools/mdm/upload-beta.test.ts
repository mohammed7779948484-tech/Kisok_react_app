/**
 * Tests for tools/mdm/upload-beta.ts — the Beta-only, non-production-first
 * ManageEngine MDM Cloud upload client (AC-09).
 *
 * The network is a FAKE in every test: the fetch implementation is injected
 * (the script's injectable seam), calls are recorded and responses scripted.
 * No test performs a real HTTP request and no test reads the filesystem. The
 * suite runs with zero console output — every sink is an injected array.
 *
 * The contract under test is the Round 5 (2026-09-04) cloud-help-tree
 * revalidation: the documented TWO-PHASE file upload — POST /emsapi/files
 * returns fileStatus 1 (PENDING — "file is queued for processing"), 2
 * (COMPLETED), 3 (FAILED), and the upload page's fileID field says "Use Get
 * File Upload Status to verify the file is ready for use", so PENDING is
 * resolved by polling POST /emsapi/fileupload/status until the entry for OUR
 * file_id reports file_availability_status 2 (the 2026-09-03 "no polling
 * endpoint exists" IR-02 claim was an incomplete-tree over-generalization —
 * see review.md, "IR-02 contradiction — RESOLVED"). Accept: application/json
 * is documented Mandatory on POST /emsapi/files, GET
 * /api/v1/mdm/groups/{id}, POST /api/v1/mdm/groups/{id}/apps and the status
 * POST, and is sent uniformly on every MDM JSON call (RD5-06). Still from the
 * earlier revalidations: app create with the documented Required
 * app_category_id + release_label_id, STRING app versions for the monotonic
 * pre-check, and the `file` multipart key from the docs prose (the code
 * examples' `fileName` is the recorded discrepancy — asserted NOT to be used).
 *
 * Plus the 2026-09-04 remediation read-path contract (RD-03/RD-04/RD-05, T15):
 * documented list pagination (paging.next as a FULL URL, else the documented
 * limit/offset query params — "page=" is documented NOWHERE and must never
 * appear in a request URL), pre-mutation group validation via
 * GET /api/v1/mdm/groups/{id} against a REQUIRED expected group name (the
 * documented "name" field — "group_name" appears nowhere in current docs), a
 * dry-run that exits NON-ZERO on a missing/mismatched group (truthful), and
 * Beta-label reuse from the app's release_labels before POST /api/v1/mdm/labels.
 *
 * Plus the 2026-09-04 auth/error contract drifts (RD-06, T16, packet R5): the
 * ca/cn accounts hosts follow the official multi-dc table
 * (accounts.zohocloud.ca / accounts.zoho.com.cn — the accounts.zoho.ca /
 * accounts.zoho.cn hosts in the old map are DNS-dead), error_code is accepted
 * as a STRING or a NUMBER (the documented REST error example emits 1002 as a
 * number while the common-codes table maps string codes like COM0002), and the
 * token endpoint's {"error": ...} shape surfaces its error_description (the
 * documented throttle example carries it).
 */

import {
  APK_MIME_TYPE,
  buildMultipartFilePart,
  buildTokenExchangeBody,
  checkMonotonicVersion,
  collectSecretValues,
  compareVersionParts,
  formatDirectRunFailure,
  main,
  MAX_LIST_PAGES,
  MDM_API_PAGE_SIZE,
  MULTIPART_BOUNDARY,
  parseDottedVersion,
  redactSecrets,
  resolveExistingVersion,
  resolveInputs,
} from "./upload-beta";
import type { FetchLike, ListedApp } from "./upload-beta";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Secret values with enough length to be mechanically redactable. */
const CLIENT_ID = "client-id-value-0123456789";
const CLIENT_SECRET = "client-secret-value-0123456789";
const REFRESH_TOKEN = "refresh-token-value-0123456789";
const ACCESS_TOKEN = "ACCESS-TOKEN-VALUE-abcdef0123456789";

const fullEnv = (): Record<string, string | undefined> => ({
  MDM_CLIENT_ID: CLIENT_ID,
  MDM_CLIENT_SECRET: CLIENT_SECRET,
  MDM_REFRESH_TOKEN: REFRESH_TOKEN,
  APK_PATH: "dist/app-release.apk",
  MDM_APP_NAME: "KISOK",
  MDM_APP_VERSION: "1.2.0",
  MDM_GROUP_ID: "701",
  MDM_EXPECTED_GROUP_NAME: "Beta Tablets",
  MDM_PRODUCTION_GROUP_ID: "900",
  MDM_APP_CATEGORY_ID: "11",
});

const dryEnv = (): Record<string, string | undefined> => ({ ...fullEnv(), MDM_DRY_RUN: "true" });

const ARGV = ["node", "tools/mdm/upload-beta.ts"];

const APK_BYTES = Buffer.from("FAKE-APK-BYTES-0123456789ABCDEF");

const TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const MDM_BASE = "https://mdm.manageengine.com";

/** An App Repository entry as documented (string versions, per-label versions). */
const existingAppFixture = (
  options: {
    appId?: number;
    version?: string;
    betaVersion?: string;
    labels?: { release_label_id: number; release_label_name: string; app_version?: string }[];
  } = {},
) => ({
  app_id: options.appId ?? 101,
  app_name: "KISOK",
  ...(options.version === undefined ? {} : { version: options.version }),
  release_labels:
    options.labels ??
    (options.betaVersion === undefined
      ? []
      : [{ release_label_id: 5, release_label_name: "Beta", app_version: options.betaVersion }]),
});

/** A group-details response as documented (group_id/name/group_type/domain). */
const groupDetailsFixture = (name: string) => ({
  group_id: 701,
  name,
  group_type: 2,
  domain: "Zoho",
  description: "KISOK beta test devices",
});

/** Unrelated apps used to fill paginated list pages. */
const fillerApps = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) => ({
    app_id: 1000 + from + index,
    app_name: `Other App ${from + index}`,
    version: "1.0.0",
    release_labels: [],
  }));

// ---------------------------------------------------------------------------
// Fake fetch (recorded calls; zero real network)
// ---------------------------------------------------------------------------

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

type FakeResponse = { status: number; body: string };

type RouteHandler = (request: RecordedRequest, index: number) => FakeResponse;

const json = (value: unknown, status = 200): FakeResponse => ({
  status,
  body: JSON.stringify(value),
});

function createFakeFetch(respond: RouteHandler): {
  fetchImpl: FetchLike;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init.method,
      headers: { ...init.headers },
      body: init.body,
    };
    const index = requests.length;
    requests.push(request);
    const response = respond(request, index);
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text: async () => response.body,
    };
  };
  return { fetchImpl, requests };
}

function bodyText(request: RecordedRequest | undefined): string {
  if (request === undefined || request.body === undefined) return "";
  return typeof request.body === "string"
    ? request.body
    : Buffer.from(request.body).toString("utf8");
}

function bodyJson(request: RecordedRequest | undefined): unknown {
  return JSON.parse(bodyText(request)) as unknown;
}

/** Binary-safe body text, for the multipart upload. */
function binaryBodyText(request: RecordedRequest | undefined): string {
  if (request === undefined || request.body === undefined) return "";
  return typeof request.body === "string"
    ? request.body
    : Buffer.from(request.body).toString("latin1");
}

interface GreenRouteOptions {
  /**
   * Successive GET /api/v1/mdm/apps response BODIES, served in REQUEST ORDER
   * whatever the query shape: each is the full JSON body — the bare
   * {"apps": [...]} shape the docs' own example shows, or the documented
   * envelope carrying metadata.total_record_count / paging.next.
   */
  appResponses?: unknown[];
  /**
   * The GET /api/v1/mdm/groups/701 details response (RD-04): an HTTP status
   * (default 200), a group NAME to serve (default "Beta Tablets"), or a raw
   * body.
   */
  group?: { status?: number; name?: string; body?: unknown };
  /**
   * The legacy GET /api/v1/mdm/groups LIST, served with the DOCUMENTED "name"
   * field (the pre-RD-04 code read "group_name", which appears nowhere in
   * current docs — that drift is one of the regressions under test).
   */
  groups?: unknown[];
  fileStatus?: number;
  /**
   * Successive POST /emsapi/fileupload/status response BODIES, served in
   * request order (the last one repeats) — each is the documented envelope
   * carrying the response[] array of {file_id, file_availability_status,
   * remarks} entries. Only reached when the upload response reports PENDING
   * (the poll path — RD5-05).
   */
  statusResponses?: unknown[];
  labelId?: unknown;
  createAppId?: unknown;
}

/**
 * The default scripted tenant: host-agnostic (matched by path, so the
 * data-centre tests can reuse it), one KISOK app with a Beta label (id 5,
 * version 1.1.0), group 701 resolvable by details with name "Beta Tablets",
 * label id 5, file upload completing with fileID 555. The group LIST is also
 * served (documented "name" field) so the pre-RD-04 code path stays walkable
 * in RED runs.
 */
function greenRoute(options: GreenRouteOptions = {}): RouteHandler {
  const appResponses = options.appResponses ?? [
    { apps: [existingAppFixture({ version: "1.0.0", betaVersion: "1.1.0" })] },
  ];
  const group = options.group ?? {};
  const groupStatus = group.status ?? 200;
  const groupBody =
    group.body ??
    (groupStatus === 200
      ? groupDetailsFixture(group.name ?? "Beta Tablets")
      : { error_code: "GD0001", error_description: "Group not found" });
  const groups = options.groups ?? [{ group_id: 701, name: "Beta Tablets" }];
  const fileStatus = options.fileStatus ?? 2;
  const statusResponses = options.statusResponses ?? [
    { response: [{ file_id: "555", file_availability_status: 2, remarks: "" }] },
  ];
  const labelId = options.labelId ?? 5;
  const createAppId = options.createAppId ?? 202;
  let appsCall = 0;
  let statusCall = 0;
  return (request) => {
    const { url, method } = request;
    if (method === "POST" && url.endsWith("/oauth/v2/token")) {
      return json({ access_token: ACCESS_TOKEN, expires_in: 3600 });
    }
    if (method === "GET" && /\/api\/v1\/mdm\/apps(\?.*)?$/.test(url)) {
      const body = appResponses[Math.min(appsCall, appResponses.length - 1)];
      appsCall += 1;
      return json(body);
    }
    if (method === "GET" && /\/api\/v1\/mdm\/groups\/\d+$/.test(url)) {
      return json(groupBody, groupStatus);
    }
    if (method === "GET" && url.endsWith("/api/v1/mdm/groups")) {
      return json({ groups });
    }
    if (method === "POST" && url.endsWith("/api/v1/mdm/labels")) {
      return json({ release_label_id: labelId });
    }
    if (method === "POST" && url.endsWith("/emsapi/files")) {
      return json({
        fileID: 555,
        fileName: "app-release.apk",
        customerID: 2,
        expiryDate: "2026-09-04 10:00",
        fileStatus,
      });
    }
    if (method === "POST" && url.endsWith("/emsapi/fileupload/status")) {
      const body = statusResponses[Math.min(statusCall, statusResponses.length - 1)];
      statusCall += 1;
      return json(body);
    }
    if (method === "POST" && url.endsWith("/api/v1/mdm/apps")) {
      return json({ app_id: createAppId });
    }
    if (method === "PUT" && /\/api\/v1\/mdm\/apps\/\d+\/labels\/\d+$/.test(url)) {
      return json({ resource_id: 101 });
    }
    if (method === "POST" && /\/api\/v1\/mdm\/groups\/\d+\/apps$/.test(url)) {
      return json({ status: "associated" });
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };
}

function withIntercept(
  base: RouteHandler,
  intercept: (request: RecordedRequest, index: number) => FakeResponse | undefined,
): RouteHandler {
  return (request, index) => intercept(request, index) ?? base(request, index);
}

// ---------------------------------------------------------------------------
// The run helper — main() with every sink injected (zero console output)
// ---------------------------------------------------------------------------

interface RunResult {
  exitCode: number;
  output: string[];
  errors: string[];
  requests: RecordedRequest[];
}

interface RunOptions {
  argv?: readonly string[];
  route?: RouteHandler;
  readFile?: (path: string) => Promise<Uint8Array>;
  sleep?: (ms: number) => Promise<void>;
}

async function runMain(
  env: Record<string, string | undefined>,
  options: RunOptions = {},
): Promise<RunResult> {
  const output: string[] = [];
  const errors: string[] = [];
  const respond: RouteHandler =
    options.route ??
    (() => {
      throw new Error("unexpected network call — this test expected no HTTP requests");
    });
  const { fetchImpl, requests } = createFakeFetch(respond);
  const exitCode = await main(options.argv ?? ARGV, env, {
    fetchImpl,
    readFile: options.readFile ?? (async () => APK_BYTES),
    sleep: options.sleep ?? (async () => undefined),
    errorSink: (line) => {
      errors.push(line);
    },
    outputSink: (line) => {
      output.push(line);
    },
  });
  return { exitCode, output, errors, requests };
}

/** The masking invariant: no credential value ever reaches a sink. */
function expectMasked(result: { output: string[]; errors: string[] }): void {
  const everything = [...result.output, ...result.errors].join("\n");
  for (const secret of [CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN]) {
    expect(everything).not.toContain(secret);
  }
}

/** RD-03: the undocumented "?page=" parameter must never appear in any URL. */
function expectNoPageParam(requests: RecordedRequest[]): void {
  for (const request of requests) {
    expect(request.url).not.toMatch(/[?&]page=/);
  }
}

// ---------------------------------------------------------------------------
// Fail-closed input validation (AC-09: before ANY network call)
// ---------------------------------------------------------------------------

describe("input validation fails closed", () => {
  const missingOrEmpty: [string, Record<string, string | undefined>][] = [
    ["MDM_CLIENT_ID", { MDM_CLIENT_ID: undefined }],
    ["MDM_CLIENT_ID", { MDM_CLIENT_ID: "" }],
    ["MDM_CLIENT_SECRET", { MDM_CLIENT_SECRET: undefined }],
    ["MDM_CLIENT_SECRET", { MDM_CLIENT_SECRET: "" }],
    ["MDM_REFRESH_TOKEN", { MDM_REFRESH_TOKEN: undefined }],
    ["MDM_REFRESH_TOKEN", { MDM_REFRESH_TOKEN: "" }],
    ["MDM_GROUP_ID", { MDM_GROUP_ID: undefined }],
    ["MDM_GROUP_ID", { MDM_GROUP_ID: "" }],
    ["MDM_APP_NAME", { MDM_APP_NAME: undefined }],
    ["MDM_APP_NAME", { MDM_APP_NAME: "" }],
    ["MDM_APP_VERSION", { MDM_APP_VERSION: undefined }],
    ["MDM_APP_VERSION", { MDM_APP_VERSION: "" }],
    ["APK_PATH", { APK_PATH: undefined }],
    ["APK_PATH", { APK_PATH: "" }],
    ["MDM_EXPECTED_GROUP_NAME", { MDM_EXPECTED_GROUP_NAME: undefined }],
    ["MDM_EXPECTED_GROUP_NAME", { MDM_EXPECTED_GROUP_NAME: "" }],
  ];

  it.each(missingOrEmpty)(
    "%s missing or empty exits non-zero naming the variable, before any network call",
    async (name, override) => {
      const result = await runMain({ ...fullEnv(), ...override });

      expect(result.exitCode).not.toBe(0);
      expect(result.errors.join("\n")).toContain(`${name} is empty`);
      expect(result.requests).toHaveLength(0);
    },
  );

  it("a target group id equal to the configured production group id is refused", async () => {
    const result = await runMain({ ...fullEnv(), MDM_PRODUCTION_GROUP_ID: "701" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_GROUP_ID");
    expect(message).toContain("MDM_PRODUCTION_GROUP_ID");
    expect(message).toContain("refusing");
    expect(result.requests).toHaveLength(0);
  });

  it('a label name other than exactly "Beta" is refused (AC-09)', async () => {
    const result = await runMain({ ...fullEnv(), MDM_LABEL_NAME: "Stable" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain('must be exactly "Beta"');
    expect(message).toContain("Stable");
    expect(result.requests).toHaveLength(0);
  });

  it("an unknown data centre is refused naming MDM_DATA_CENTRE and the expected shape, without quoting the value", async () => {
    const result = await runMain({ ...fullEnv(), MDM_DATA_CENTRE: "de" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_DATA_CENTRE must be one of us, eu, in, au, jp, ca, cn, sa, uk");
    expect(message).not.toContain('"de"');
    expect(result.requests).toHaveLength(0);
  });

  it("an unparsable incoming version is refused naming MDM_APP_VERSION", async () => {
    const result = await runMain({ ...fullEnv(), MDM_APP_VERSION: "1.x" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_APP_VERSION");
    expect(message).toContain("1.x");
    expect(result.requests).toHaveLength(0);
  });

  it.each([
    ["MDM_GROUP_ID", "abc", { MDM_GROUP_ID: "abc" }],
    ["MDM_PRODUCTION_GROUP_ID", "abc", { MDM_PRODUCTION_GROUP_ID: "abc" }],
    ["MDM_APP_CATEGORY_ID", "abc", { MDM_APP_CATEGORY_ID: "abc" }],
  ])(
    "%s with a non-numeric value is refused naming the variable and the numeric shape, without quoting the value",
    async (name, value, override) => {
      const result = await runMain({ ...fullEnv(), ...override });

      expect(result.exitCode).not.toBe(0);
      const message = result.errors.join("\n");
      expect(message).toContain(`${name} must be a numeric id`);
      expect(message).not.toContain(value);
      expect(result.requests).toHaveLength(0);
    },
  );

  it("a bogus MDM_DRY_RUN value is refused naming MDM_DRY_RUN, without quoting the value", async () => {
    const result = await runMain({ ...fullEnv(), MDM_DRY_RUN: "maybe" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_DRY_RUN must be true or false");
    expect(message).not.toContain("maybe");
    expect(result.requests).toHaveLength(0);
  });

  it("unknown flags are rejected instead of ignored", async () => {
    const result = await runMain(fullEnv(), { argv: [...ARGV, "--wat"], route: greenRoute() });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("unknown flag");
    expect(result.errors.join("\n")).toContain("--wat");
    expect(result.requests).toHaveLength(0);
  });

  it("a flag given without a value is rejected naming the flag, before any network call", async () => {
    const result = await runMain(fullEnv(), { argv: [...ARGV, "--app-name"], route: greenRoute() });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("--app-name requires a value");
    expect(result.requests).toHaveLength(0);
  });

  it("--dry-run is a valueless flag and rejects an attached value", async () => {
    const result = await runMain(fullEnv(), {
      argv: [...ARGV, "--dry-run=true"],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("--dry-run does not take a value");
    expect(result.requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Resolution-failure masking (T11-F01: a pasted secret must never be echoed)
// ---------------------------------------------------------------------------

describe("resolution-failure masking (T11-F01)", () => {
  it("a positional argument equal to the refresh-token value exits 1 without echoing it, before any network call", async () => {
    // The reviewer's reproduction: a human drops a flag while pasting a value.
    const result = await runMain(fullEnv(), {
      argv: [...ARGV, REFRESH_TOKEN],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("unexpected positional argument");
    expect(result.errors.join("\n")).not.toContain(REFRESH_TOKEN);
    expectMasked(result);
    expect(result.requests).toHaveLength(0);
  });

  it("a positional argument equal to a flag-provided secret (env unset) is never echoed", async () => {
    const env: Record<string, string | undefined> = {
      ...fullEnv(),
      MDM_REFRESH_TOKEN: undefined,
    };
    const result = await runMain(env, {
      argv: [...ARGV, "--refresh-token", REFRESH_TOKEN, CLIENT_SECRET],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    const everything = [...result.output, ...result.errors].join("\n");
    expect(everything).not.toContain(REFRESH_TOKEN);
    expect(everything).not.toContain(CLIENT_SECRET);
    expect(everything).toContain("unexpected positional argument");
  });

  it("an unknown flag whose name embeds the client-secret value is rejected without echoing it", async () => {
    const result = await runMain(fullEnv(), {
      argv: [...ARGV, `--flag-${CLIENT_SECRET}`],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("unknown flag");
    expectMasked(result);
    expect(result.requests).toHaveLength(0);
  });

  it("a credential pasted as the group-id value appears nowhere in the typed-validation failure (T11-R1: not quoted at all)", async () => {
    const result = await runMain(fullEnv(), {
      argv: [...ARGV, "--group-id", REFRESH_TOKEN],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_GROUP_ID must be a numeric id");
    // T11-R1 hardening: the shape failure no longer quotes the received value
    // (stronger than the earlier [REDACTED] substitution — there is nothing to
    // substitute because the raw token never enters the message).
    expect(message).not.toContain(REFRESH_TOKEN);
    expectMasked(result);
  });

  it("collectSecretValues gathers credentials from env and both flag forms", () => {
    const env: Record<string, string | undefined> = {
      MDM_CLIENT_ID: CLIENT_ID,
      MDM_CLIENT_SECRET: undefined,
    };
    const argv = [
      "node",
      "tools/mdm/upload-beta.ts",
      "--client-secret",
      CLIENT_SECRET,
      `--refresh-token=${REFRESH_TOKEN}`,
    ];

    const collected = collectSecretValues(argv, env);

    expect(collected).toContain(CLIENT_ID);
    expect(collected).toContain(CLIENT_SECRET);
    expect(collected).toContain(REFRESH_TOKEN);
  });

  it("the direct-run catch formatter redacts credential values (the last-resort path)", () => {
    // The module-level catch is inert under jest (argv[1] basename guard), so
    // its formatter is exported and pinned here instead of argued.
    const message = formatDirectRunFailure(
      new Error(`boom near ${REFRESH_TOKEN} and ${CLIENT_ID}`),
      [...ARGV, "--client-secret", CLIENT_SECRET],
      { MDM_REFRESH_TOKEN: REFRESH_TOKEN, MDM_CLIENT_ID: CLIENT_ID },
    );

    expect(message).toContain("unexpected failure");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain(REFRESH_TOKEN);
    expect(message).not.toContain(CLIENT_ID);
    expect(message).not.toContain(CLIENT_SECRET);
  });
});

// ---------------------------------------------------------------------------
// Typed-validation failures never quote the received value (T11-R1)
// ---------------------------------------------------------------------------

describe("typed-validation failures never quote the received value (T11-R1)", () => {
  /**
   * A credential-shaped literal that exists ONLY in a non-credential argv
   * slot — no redaction list can know it is a credential (that is precisely
   * the residual T11-R1 class), so the structural guarantee is what must
   * keep it out of the output.
   */
  const PASTED_SECRET = "pasted-secret-value-zyxwvutsrqponm";

  const assertNothingEchoed = (result: { output: string[]; errors: string[] }): void => {
    const everything = [...result.output, ...result.errors].join("\n");
    expect(everything).not.toContain(PASTED_SECRET);
  };

  it.each([
    ["--data-centre", ["--data-centre", PASTED_SECRET]],
    ["--group-id", ["--group-id", PASTED_SECRET]],
    ["--production-group-id", ["--production-group-id", PASTED_SECRET]],
    ["--app-category-id", ["--app-category-id", PASTED_SECRET]],
  ])(
    "a credential-shaped value pasted after %s is never echoed anywhere",
    async (_flag, extraArgs) => {
      const result = await runMain(fullEnv(), {
        argv: [...ARGV, ...extraArgs],
        route: greenRoute(),
      });

      expect(result.exitCode).not.toBe(0);
      assertNothingEchoed(result);
      expect(result.requests).toHaveLength(0);
    },
  );

  it("a credential-shaped MDM_DRY_RUN value is never echoed anywhere", async () => {
    const result = await runMain({ ...fullEnv(), MDM_DRY_RUN: PASTED_SECRET });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_DRY_RUN must be true or false");
    assertNothingEchoed(result);
    expect(result.requests).toHaveLength(0);
  });

  it("the group-equality guard quotes ids only when both are numeric, so a pasted token is never quoted", async () => {
    const result = await runMain(fullEnv(), {
      argv: [...ARGV, "--group-id", PASTED_SECRET, "--production-group-id", PASTED_SECRET],
      route: greenRoute(),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_GROUP_ID must be a numeric id");
    expect(message).toContain("MDM_PRODUCTION_GROUP_ID must be a numeric id");
    // The equality message with its quoted ids is NOT emitted for non-numeric
    // values — the two shape failures above already name the problem.
    expect(message).not.toContain("refusing to run");
    assertNothingEchoed(result);
    expect(result.requests).toHaveLength(0);
  });

  it("the numeric equality refusal still fires (and quotes digits) when both ids are valid numbers", async () => {
    const result = await runMain({ ...fullEnv(), MDM_PRODUCTION_GROUP_ID: "701" });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("refusing to run");
    expect(message).toContain("(701)");
    expect(result.requests).toHaveLength(0);
  });

  it("free-form echoes stay (deliberate diagnostics, union-redacted): app name and label name are still quoted", async () => {
    // The re-reviewer's option (a) keeps free-form echoes — assert they did
    // NOT get swept away by the hardening.
    const result = await runMain(fullEnv(), { argv: [...ARGV, "--label-name", "Stable"] });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain('got "Stable"');
  });
});

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

describe("input resolution", () => {
  it("resolves all inputs from the environment with the documented defaults", () => {
    const result = resolveInputs(ARGV, fullEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inputs.clientId).toBe(CLIENT_ID);
      expect(result.inputs.clientSecret).toBe(CLIENT_SECRET);
      expect(result.inputs.refreshToken).toBe(REFRESH_TOKEN);
      expect(result.inputs.apkPath).toBe("dist/app-release.apk");
      expect(result.inputs.appName).toBe("KISOK");
      expect(result.inputs.appVersion).toBe("1.2.0");
      expect(result.inputs.groupId).toBe("701");
      expect(result.inputs.expectedGroupName).toBe("Beta Tablets");
      expect(result.inputs.appCategoryId).toBe("11");
      expect(result.inputs.labelName).toBe("Beta");
      expect(result.inputs.dataCentre).toBe("us");
      expect(result.inputs.redirectUri).toBe("");
      expect(result.inputs.dryRun).toBe(false);
    }
  });

  it("flags override the environment and accept --flag=value form", () => {
    const result = resolveInputs(
      [...ARGV, "--app-name", "Other", "--apk=/tmp/app-release.apk"],
      fullEnv(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inputs.appName).toBe("Other");
      expect(result.inputs.apkPath).toBe("/tmp/app-release.apk");
    }
  });

  it("the --dry-run flag selects read-only mode", () => {
    const result = resolveInputs([...ARGV, "--dry-run"], fullEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inputs.dryRun).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Expected group name input (RD-04)
// ---------------------------------------------------------------------------

describe("expected group name input (RD-04)", () => {
  it("a missing MDM_EXPECTED_GROUP_NAME fails closed naming the variable and flag, before any network call", async () => {
    const env: Record<string, string | undefined> = {
      ...fullEnv(),
      MDM_EXPECTED_GROUP_NAME: undefined,
    };
    const result = await runMain(env, { route: greenRoute() });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_EXPECTED_GROUP_NAME is empty");
    expect(message).toContain("--expected-group-name");
    expect(result.requests).toHaveLength(0);
  });

  it("resolveInputs requires MDM_EXPECTED_GROUP_NAME and accepts both flag forms", () => {
    const missing = resolveInputs(ARGV, { ...fullEnv(), MDM_EXPECTED_GROUP_NAME: undefined });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.failures.join("\n")).toContain("MDM_EXPECTED_GROUP_NAME is empty");
    }

    const fromFlag = resolveInputs(
      [...ARGV, "--expected-group-name", "Beta Test Devices"],
      fullEnv(),
    );
    expect(fromFlag.ok).toBe(true);
    if (fromFlag.ok) {
      expect(fromFlag.inputs.expectedGroupName).toBe("Beta Test Devices");
    }

    const equalsForm = resolveInputs([...ARGV, "--expected-group-name=Beta Tablets"], fullEnv());
    expect(equalsForm.ok).toBe(true);
    if (equalsForm.ok) {
      expect(equalsForm.inputs.expectedGroupName).toBe("Beta Tablets");
    }
  });
});

// ---------------------------------------------------------------------------
// Token exchange (Zoho OAuth) + masking
// ---------------------------------------------------------------------------

describe("token exchange", () => {
  it("posts the refresh-token grant to the documented accounts URL with form-encoded params", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const tokenRequest = result.requests[0];
    expect(tokenRequest?.method).toBe("POST");
    expect(tokenRequest?.url).toBe(TOKEN_URL);
    expect(tokenRequest?.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(tokenRequest?.body).toBe(
      `grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`,
    );
  });

  it("forwards redirect_uri only when it is provided", async () => {
    const withUri = await runMain(
      { ...fullEnv(), MDM_REDIRECT_URI: "https://example.com/callback" },
      { route: greenRoute() },
    );
    expect(withUri.exitCode).toBe(0);
    expect(withUri.requests[0]?.body).toContain(
      "&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback",
    );

    const withoutUri = await runMain(fullEnv(), { route: greenRoute() });
    expect(withoutUri.exitCode).toBe(0);
    expect(withoutUri.requests[0]?.body).not.toContain("redirect_uri");
  });

  it("selects the data-centre hosts explicitly (eu) and defaults to the US .com endpoints", async () => {
    const eu = await runMain({ ...dryEnv(), MDM_DATA_CENTRE: "eu" }, { route: greenRoute() });

    expect(eu.exitCode).toBe(0);
    expect(eu.requests[0]?.url).toBe("https://accounts.zoho.eu/oauth/v2/token");
    expect(eu.requests[1]?.url.startsWith("https://mdm.manageengine.eu/")).toBe(true);

    const us = await runMain(dryEnv(), { route: greenRoute() });
    expect(us.requests[0]?.url).toBe(TOKEN_URL);
    expect(us.requests[1]?.url.startsWith(MDM_BASE)).toBe(true);
  });

  it("the ca and cn data centres use the RESOLVABLE accounts hosts (R5: zohocloud.ca / zoho.com.cn — the accounts.zoho.ca / accounts.zoho.cn hosts are DNS-dead)", async () => {
    const ca = await runMain({ ...dryEnv(), MDM_DATA_CENTRE: "ca" }, { route: greenRoute() });

    expect(ca.exitCode).toBe(0);
    expect(ca.requests[0]?.url).toBe("https://accounts.zohocloud.ca/oauth/v2/token");
    expect(ca.requests[1]?.url.startsWith("https://mdm.manageengine.ca/")).toBe(true);

    const cn = await runMain({ ...dryEnv(), MDM_DATA_CENTRE: "cn" }, { route: greenRoute() });
    expect(cn.exitCode).toBe(0);
    expect(cn.requests[0]?.url).toBe("https://accounts.zoho.com.cn/oauth/v2/token");
    expect(cn.requests[1]?.url.startsWith("https://mdm.manageengine.cn/")).toBe(true);
  });

  it("carries the Zoho-oauthtoken authorization header on EVERY MDM call, exactly once per token", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const tokenCalls = result.requests.filter((r) => r.url.endsWith("/oauth/v2/token"));
    expect(tokenCalls).toHaveLength(1);
    const mdmCalls = result.requests.filter((r) => r.url.startsWith(MDM_BASE));
    expect(mdmCalls.length).toBeGreaterThan(0);
    for (const call of mdmCalls) {
      expect(call.headers.Authorization).toBe(`Zoho-oauthtoken ${ACCESS_TOKEN}`);
    }
    expectMasked(result);
  });

  it("a failed token exchange exits non-zero, names the credential variables, and calls no MDM API", async () => {
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/oauth/v2/token")) {
        return json({ error: "invalid_client" }, 400);
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("the token exchange failed");
    expect(message).toContain("HTTP 400");
    expect(message).toContain("invalid_client");
    expect(message).toContain("MDM_CLIENT_ID");
    expect(result.requests).toHaveLength(1);
    expectMasked(result);
  });

  it("a token-exchange {error, error_description} envelope surfaces the description (the documented throttle shape)", async () => {
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/oauth/v2/token")) {
        return json(
          {
            error: "Access Denied",
            error_description:
              "You have made too many requests continuously. Please try again after some time.",
          },
          400,
        );
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("Access Denied");
    expect(message).toContain("too many requests");
    expect(result.requests).toHaveLength(1);
    expectMasked(result);
  });

  it("a 200 response without an access_token fails closed", async () => {
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/oauth/v2/token")) {
        return json({});
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("did not include an access_token");
    expect(result.requests).toHaveLength(1);
  });

  it("a request credential echoed by a token-exchange error is redacted before it reaches any sink", async () => {
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/oauth/v2/token")) {
        return json({ error: `invalid token ${REFRESH_TOKEN}` }, 400);
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("[REDACTED]");
    expectMasked(result);
  });

  it("an access token echoed by an MDM API error is redacted before it reaches any sink", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return json(
            { error_code: "MDM0023", error_description: `bad token ${ACCESS_TOKEN}` },
            403,
          );
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM0023");
    expect(message).toContain("[REDACTED]");
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// Dry-run (read-only, AC-09)
// ---------------------------------------------------------------------------

describe("dry-run (no mutation)", () => {
  it("performs the token exchange plus ONLY read-only GETs, and exits 0 with a summary", async () => {
    const result = await runMain(dryEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", TOKEN_URL],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps`],
      ["GET", `${MDM_BASE}/api/v1/mdm/groups/701`],
    ]);
    const mdmCalls = result.requests.filter((r) => r.url.startsWith(MDM_BASE));
    for (const call of mdmCalls) {
      expect(call.method).toBe("GET");
    }
    const summary = result.output.join("\n");
    expect(summary).toContain("MDM dry-run passed");
    expect(summary).toContain('app "KISOK"');
    expect(summary).toContain("1.1.0");
    expect(summary).toContain("group 701");
    expect(summary).toContain("no changes were made");
    expectMasked(result);
  });

  it("reports the create path when the app is absent, still exiting 0", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [
          { apps: [{ app_id: 9, app_name: "Other", version: "1.0.0", release_labels: [] }] },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    const summary = result.output.join("\n");
    expect(summary).toContain("was NOT found");
    expect(summary).toContain("MDM_APP_CATEGORY_ID");
  });

  it("refuses a non-increasing version even in dry-run, having performed only reads", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [{ apps: [existingAppFixture({ betaVersion: "1.2.0" })] }],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("not strictly greater");
    for (const call of result.requests.filter((r) => r.url.startsWith(MDM_BASE))) {
      expect(call.method).toBe("GET");
    }
    expect(result.requests).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// App-list pagination follows the documented envelope (RD-03)
// ---------------------------------------------------------------------------

describe("app-list pagination follows the documented envelope (RD-03)", () => {
  const appsUrls = (requests: RecordedRequest[]): string[] =>
    requests
      .filter((r) => r.method === "GET" && r.url.includes("/api/v1/mdm/apps"))
      .map((r) => r.url);

  it("follows paging.next as a FULL URL across pages and finds the target beyond page 1", async () => {
    const nextPageUrl = `${MDM_BASE}/api/v1/mdm/apps?limit=50&offset=50&skiptoken=second-page`;
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [
          {
            apps: fillerApps(MDM_API_PAGE_SIZE, 0),
            metadata: { total_record_count: 70 },
            paging: { next: nextPageUrl },
          },
          {
            apps: [
              ...fillerApps(19, 50),
              existingAppFixture({ version: "1.0.0", betaVersion: "1.1.0" }),
            ],
            metadata: { total_record_count: 70 },
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    expect(appsUrls(result.requests)).toEqual([`${MDM_BASE}/api/v1/mdm/apps`, nextPageUrl]);
    expect(result.requests.some((r) => r.url === nextPageUrl)).toBe(true);
    expectNoPageParam(result.requests);
    expect(result.output.join("\n")).toContain('app "KISOK"');
  });

  it("steps with the documented limit/offset query params when paging.next is absent (metadata envelope)", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [
          { apps: fillerApps(MDM_API_PAGE_SIZE, 0), metadata: { total_record_count: 70 } },
          {
            apps: [
              ...fillerApps(19, 50),
              existingAppFixture({ version: "1.0.0", betaVersion: "1.1.0" }),
            ],
            metadata: { total_record_count: 70 },
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(appsUrls(result.requests)).toEqual([
      `${MDM_BASE}/api/v1/mdm/apps`,
      `${MDM_BASE}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${MDM_API_PAGE_SIZE}`,
    ]);
    expectNoPageParam(result.requests);
    expect(result.output.join("\n")).toContain('app "KISOK"');
  });

  it("steps with limit/offset on an envelope-less full page (the documented apps-example shape carries no envelope)", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [
          { apps: fillerApps(MDM_API_PAGE_SIZE, 0) },
          {
            apps: [
              ...fillerApps(19, 50),
              existingAppFixture({ version: "1.0.0", betaVersion: "1.1.0" }),
            ],
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(appsUrls(result.requests)).toEqual([
      `${MDM_BASE}/api/v1/mdm/apps`,
      `${MDM_BASE}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${MDM_API_PAGE_SIZE}`,
    ]);
    expectNoPageParam(result.requests);
  });

  it("an envelope-less short page terminates the walk", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({ appResponses: [{ apps: fillerApps(20, 0) }] }),
    });

    expect(result.exitCode).toBe(0);
    expect(appsUrls(result.requests)).toEqual([`${MDM_BASE}/api/v1/mdm/apps`]);
    expectNoPageParam(result.requests);
    expect(result.output.join("\n")).toContain("was NOT found");
  });

  it("a page with MORE than 50 rows and no usable envelope fails closed (termination unknowable)", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({ appResponses: [{ apps: fillerApps(MDM_API_PAGE_SIZE + 1, 0) }] }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain(`${MDM_API_PAGE_SIZE + 1} rows`);
    expect(message).toContain("failing closed");
    expect(appsUrls(result.requests)).toEqual([`${MDM_BASE}/api/v1/mdm/apps`]);
    expectNoPageParam(result.requests);
  });

  it.each([
    ["a string", "50"],
    ["non-numeric", "many"],
  ])(
    "a %s metadata.total_record_count is not usable — the documented stepping rules apply (T15-R3)",
    async (_label, badTotal) => {
      // "50" is deliberately chosen to discriminate: a USABLE total of 50 with
      // a full first page would terminate after ONE request; the pin asserts
      // the walk STEPPED (string totals are ignored by design).
      const result = await runMain(dryEnv(), {
        route: greenRoute({
          appResponses: [
            { apps: fillerApps(MDM_API_PAGE_SIZE, 0), metadata: { total_record_count: badTotal } },
            { apps: fillerApps(20, 50) },
          ],
        }),
      });

      expect(result.exitCode).toBe(0);
      expect(appsUrls(result.requests)).toEqual([
        `${MDM_BASE}/api/v1/mdm/apps`,
        `${MDM_BASE}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${MDM_API_PAGE_SIZE}`,
      ]);
      expectNoPageParam(result.requests);
      expect(result.output.join("\n")).toContain("was NOT found");
    },
  );

  it.each([
    ["an empty", ""],
    ["a whitespace-only", "   "],
  ])(
    "%s paging.next value is treated as absent — the documented stepping rules apply (T15-R3)",
    async (_label, emptyNext) => {
      const result = await runMain(dryEnv(), {
        route: greenRoute({
          appResponses: [
            { apps: fillerApps(MDM_API_PAGE_SIZE, 0), paging: { next: emptyNext } },
            { apps: fillerApps(20, 50) },
          ],
        }),
      });

      expect(result.exitCode).toBe(0);
      expect(appsUrls(result.requests)).toEqual([
        `${MDM_BASE}/api/v1/mdm/apps`,
        `${MDM_BASE}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${MDM_API_PAGE_SIZE}`,
      ]);
      expectNoPageParam(result.requests);
    },
  );

  it("a paging.next pointing at a FOREIGN host is not followed — the access token never leaves the MDM API host (T15-R1)", async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({
        appResponses: [
          {
            apps: fillerApps(MDM_API_PAGE_SIZE, 0),
            paging: { next: "https://evil.example.com/api/v1/mdm/apps?limit=50&offset=50" },
          },
        ],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("paging.next points outside the MDM API host");
    expect(message).toContain("failing closed");
    // The token-bearing request must NEVER reach the foreign origin: only the
    // plain first-page GET happened.
    expect(result.requests.some((r) => r.url.startsWith("https://evil.example.com"))).toBe(false);
    expect(appsUrls(result.requests)).toEqual([`${MDM_BASE}/api/v1/mdm/apps`]);
    expectNoPageParam(result.requests);
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// Pre-mutation group validation with the expected group name (RD-04)
// ---------------------------------------------------------------------------

describe("pre-mutation group validation with the expected group name (RD-04)", () => {
  const mdmMutations = (requests: RecordedRequest[]): RecordedRequest[] =>
    requests.filter((r) => r.url.startsWith(MDM_BASE) && r.method !== "GET");

  it("a missing group (404 on the details GET) refuses the REAL run BEFORE any mutation", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute({ group: { status: 404 } }) });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("701");
    expect(message).toContain("Beta Tablets");
    expect(message).toContain("refusing");
    // The only POST is the OAuth token exchange — ZERO MDM mutations.
    expect(mdmMutations(result.requests)).toHaveLength(0);
    expect(
      result.requests.some(
        (r) => r.method === "GET" && r.url === `${MDM_BASE}/api/v1/mdm/groups/701`,
      ),
    ).toBe(true);
    expectMasked(result);
  });

  it("a resolved group name that does not match the expected name refuses the real run before any mutation", async () => {
    const result = await runMain(
      { ...fullEnv(), MDM_EXPECTED_GROUP_NAME: "Beta Test Devices" },
      { route: greenRoute({ group: { name: "Production Devices" } }) },
    );

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("701");
    expect(message).toContain("Production Devices");
    expect(message).toContain("Beta Test Devices");
    expect(message).toContain("does not match");
    expect(mdmMutations(result.requests)).toHaveLength(0);
    expectMasked(result);
  });

  it("a 200 details response without a usable documented name field treats the group as missing", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({ group: { body: { group_id: 701, group_type: 2, domain: "Zoho" } } }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("701");
    expect(message).toContain("Beta Tablets");
    expect(mdmMutations(result.requests)).toHaveLength(0);
    expectMasked(result);
  });

  it("the dry-run exits NON-ZERO when the group is missing — a truthful dry-run", async () => {
    const result = await runMain(dryEnv(), { route: greenRoute({ group: { status: 404 } }) });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM dry-run failed");
    expect(message).toContain("701");
    expect(message).toContain("Beta Tablets");
    // Still strictly read-only: every MDM call is a GET.
    for (const call of result.requests.filter((r) => r.url.startsWith(MDM_BASE))) {
      expect(call.method).toBe("GET");
    }
    expect(
      result.requests.some(
        (r) => r.method === "GET" && r.url === `${MDM_BASE}/api/v1/mdm/groups/701`,
      ),
    ).toBe(true);
    expectMasked(result);
  });

  it("the dry-run exits NON-ZERO on a group-name mismatch, naming both names", async () => {
    const result = await runMain(
      { ...dryEnv(), MDM_EXPECTED_GROUP_NAME: "Beta Test Devices" },
      { route: greenRoute({ group: { name: "Production Devices" } }) },
    );

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM dry-run failed");
    expect(message).toContain("Production Devices");
    expect(message).toContain("Beta Test Devices");
    expect(mdmMutations(result.requests)).toHaveLength(0);
    expectMasked(result);
  });

  it("the dry-run summary reports the group NAME from the documented details field", async () => {
    const result = await runMain(dryEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const summary = result.output.join("\n");
    expect(summary).toContain("group 701");
    expect(summary).toContain('"Beta Tablets"');
  });
  it('a wrapped {"group":{...}} details body is validated as the same group (tolerated shape, T15-R3)', async () => {
    const result = await runMain(dryEnv(), {
      route: greenRoute({ group: { body: { group: groupDetailsFixture("Beta Tablets") } } }),
    });

    expect(result.exitCode).toBe(0);
    const summary = result.output.join("\n");
    expect(summary).toContain("group 701");
    expect(summary).toContain('"Beta Tablets"');
  });

  it("an expected-group-name value that equals a resolved credential renders [REDACTED] in the refusal (union redaction, T15-R2)", async () => {
    // The expected-group-name echo is a free-form diagnostic: a value that
    // happens to equal a credential must be scrubbed by the mechanical
    // redaction union before it reaches any sink.
    const env: Record<string, string | undefined> = {
      ...fullEnv(),
      MDM_EXPECTED_GROUP_NAME: undefined,
    };
    const result = await runMain(env, {
      argv: [...ARGV, "--expected-group-name", CLIENT_SECRET],
      route: greenRoute({ group: { name: "Production Devices" } }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("does not match");
    expect(message).toContain("[REDACTED]");
    expect(mdmMutations(result.requests)).toHaveLength(0);
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// The upload happy path (update variant) — exact call sequence, AC-09 scope
// ---------------------------------------------------------------------------

describe("upload happy path (existing app → add version)", () => {
  it("runs exactly the documented call sequence and never a production operation", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    // RD-05: the app already carries a Beta label (id 5) — it is REUSED, so
    // there is no POST /api/v1/mdm/labels; RD-04 adds the read-only group
    // details GET before the first mutation.
    expect(result.requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", TOKEN_URL],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps`],
      ["GET", `${MDM_BASE}/api/v1/mdm/groups/701`],
      ["POST", `${MDM_BASE}/emsapi/files`],
      ["PUT", `${MDM_BASE}/api/v1/mdm/apps/101/labels/5`],
      ["POST", `${MDM_BASE}/api/v1/mdm/groups/701/apps`],
    ]);
    for (const request of result.requests) {
      expect(request.url).not.toMatch(/approve|distribute_update|retire_old_version/);
    }
    const summary = result.output.join("\n");
    expect(summary).toContain("MDM Beta upload passed");
    expect(summary).toContain('app "KISOK"');
    expect(summary).toContain("1.2.0");
    expect(summary).toContain("group 701");
    expect(summary).toContain("silent_install");
    expect(summary).toContain("reused");
    expectMasked(result);
  });

  it("add-version PUTs the file with force_update_in_label true", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const put = result.requests.find(
      (r) => r.method === "PUT" && /\/api\/v1\/mdm\/apps\/\d+\/labels\/\d+$/.test(r.url),
    );
    expect(put?.url).toBe(`${MDM_BASE}/api/v1/mdm/apps/101/labels/5`);
    expect(bodyJson(put)).toEqual({ app_file: 555, force_update_in_label: true });
  });

  it("associates exactly one group — the configured one — with silent_install true", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    // The read-only group-details GET shares this URL prefix — only the
    // association POST counts.
    const groupCalls = result.requests.filter(
      (r) => r.method === "POST" && r.url.includes("/api/v1/mdm/groups/"),
    );
    expect(groupCalls).toHaveLength(1);
    expect(groupCalls[0]?.url).toBe(`${MDM_BASE}/api/v1/mdm/groups/701/apps`);
    expect(groupCalls[0]?.method).toBe("POST");
    expect(bodyJson(groupCalls[0])).toEqual({
      app_details: [{ app_id: 101, release_label_id: 5 }],
      silent_install: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Two-phase file upload
// ---------------------------------------------------------------------------

describe("two-phase file upload", () => {
  it('POSTs the APK to /emsapi/files with the Module header and multipart key "file"', async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const fileRequest = result.requests.find((r) => r.url.endsWith("/emsapi/files"));
    expect(fileRequest?.method).toBe("POST");
    expect(fileRequest?.headers.Module).toBe("MDM_APP_MGMT");
    expect(fileRequest?.headers.Authorization).toBe(`Zoho-oauthtoken ${ACCESS_TOKEN}`);
    expect(fileRequest?.headers["Content-Type"]).toBe(
      `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    );
    const body = binaryBodyText(fileRequest);
    expect(body.startsWith(`--${MULTIPART_BOUNDARY}\r\n`)).toBe(true);
    expect(body).toContain('name="file"');
    // The docs code examples say "fileName" — the written prose contract "file" is used.
    expect(body).not.toContain('name="fileName"');
    expect(body).toContain('filename="app-release.apk"');
    expect(body).toContain(`Content-Type: ${APK_MIME_TYPE}`);
    expect(body).toContain("FAKE-APK-BYTES");
    expect(body.endsWith(`\r\n--${MULTIPART_BOUNDARY}--\r\n`)).toBe(true);
  });

  it("fileStatus 2 proceeds with the returned fileID", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute({ fileStatus: 2 }) });

    expect(result.exitCode).toBe(0);
    const put = result.requests.find((r) => r.method === "PUT");
    expect(bodyJson(put)).toEqual({ app_file: 555, force_update_in_label: true });
  });

  // AMENDED at T24 (bug mode): the old assertion "expected 2" pinned the
  // single-phase interpretation — every initial status ≠ 2 was terminal, the
  // R5-03 bug. Under the documented two-phase contract an undocumented status
  // still fails closed, but the failure is NAMED as undocumented (1/2/3 are
  // the documented statuses) and no status poll happens.
  it("an undocumented fileStatus (0) fails closed naming it, with no status poll", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute({ fileStatus: 0 }) });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("fileStatus 0");
    expect(message).toContain("not a documented status");
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      0,
    );
    expect(result.requests).toHaveLength(4);
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    expectMasked(result);
  });

  it("a response without a fileID fails closed", async () => {
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/emsapi/files")) {
        return json({ fileStatus: 2 });
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("did not include a fileID");
  });

  it("the fast path: initial fileStatus 2 succeeds with ZERO status calls", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute({ fileStatus: 2 }) });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// The file-status lifecycle (RD5-05 / R5-03: fileStatus 1 → bounded poll)
// ---------------------------------------------------------------------------

describe("file upload status lifecycle (RD5-05)", () => {
  it("initial fileStatus 1 (PENDING) polls POST /emsapi/fileupload/status with the exact documented body and headers; file_availability_status 2 proceeds with the SAME fileID", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        // 1 = the documented PENDING fileStatus ("queued for processing").
        fileStatus: 1,
        statusResponses: [
          {
            response: [
              // 2 = the documented ready file_availability_status.
              { file_id: "555", file_availability_status: 2, remarks: "" },
            ],
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    const statusCalls = result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"));
    expect(statusCalls).toHaveLength(1);
    const statusCall = statusCalls[0];
    expect(statusCall?.method).toBe("POST");
    expect(statusCall?.url).toBe(`${MDM_BASE}/emsapi/fileupload/status`);
    expect(statusCall?.headers.Authorization).toBe(`Zoho-oauthtoken ${ACCESS_TOKEN}`);
    expect(statusCall?.headers["Content-Type"]).toBe("application/json");
    expect(statusCall?.headers.Accept).toBe("application/json");
    // The documented sample body: fileIDs is an array of STRINGS.
    expect(bodyText(statusCall)).toBe('{"fileIDs":["555"]}');
    // The SAME fileID from the upload response feeds the add-version PUT.
    const put = result.requests.find((r) => r.method === "PUT");
    expect(bodyJson(put)).toEqual({ app_file: 555, force_update_in_label: true });
    expectMasked(result);
  });

  it("initial fileStatus 3 (FAILED) fails immediately naming the documented FAILED status, with NO status call", async () => {
    const result = await runMain(fullEnv(), {
      // 3 = the documented FAILED fileStatus.
      route: greenRoute({ fileStatus: 3 }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("fileStatus 3");
    expect(message).toContain("FAILED");
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      0,
    );
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    // token, apps list, group details, files POST — nothing else happened.
    expect(result.requests).toHaveLength(4);
    expectMasked(result);
  });

  it("initial fileStatus 1 with the status never reaching 2: the poll is BOUNDED, failing closed naming the last observed status (remarks is never parsed for truth)", async () => {
    const sleeps: number[] = [];
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        // 1 = the documented PENDING fileStatus.
        fileStatus: 1,
        // remarks LIES about readiness — only file_availability_status counts.
        statusResponses: [
          {
            response: [{ file_id: "555", file_availability_status: 1, remarks: "file is ready" }],
          },
        ],
      }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).not.toBe(0);
    const statusCalls = result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"));
    // Bounded: exactly the attempt bound (20 — the engineering choice), never
    // an infinite loop.
    expect(statusCalls).toHaveLength(20);
    const message = result.errors.join("\n");
    expect(message).toContain("file_availability_status was 1");
    // The interval sleeps BETWEEN attempts only (19 × 3000 ms — the
    // engineering choice); the first check is immediate.
    expect(sleeps).toHaveLength(19);
    expect(sleeps.every((ms) => ms === 3000)).toBe(true);
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    expectMasked(result);
  });

  it("a status response with NO entry for our file_id fails closed", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        fileStatus: 1,
        statusResponses: [
          { response: [{ file_id: "999", file_availability_status: 2, remarks: "" }] },
        ],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("file_id 555");
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      1,
    );
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    expectMasked(result);
  });

  it("a status response whose response is not an array fails closed", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        fileStatus: 1,
        statusResponses: [{ response: { file_id: "555", file_availability_status: 2 } }],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain('"response" array');
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      1,
    );
    expectMasked(result);
  });

  it("a malformed (non-JSON) status body fails closed", async () => {
    const route = withIntercept(greenRoute({ fileStatus: 1 }), (request) => {
      if (request.method === "POST" && request.url.endsWith("/emsapi/fileupload/status")) {
        return { status: 200, body: "not-json{{{ " };
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("malformed");
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      1,
    );
    expectMasked(result);
  });

  it("a status entry whose file_availability_status is not a usable integer fails closed (T24-F01b)", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        fileStatus: 1,
        statusResponses: [
          {
            response: [
              // Present for OUR file_id, but the status is neither a number
              // nor a numeric string — unusable, so never guessed.
              { file_id: "555", file_availability_status: "banana", remarks: "" },
            ],
          },
        ],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("did not carry a usable file_availability_status");
    // The unusable entry fails closed immediately — no further polling.
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      1,
    );
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    expectMasked(result);
  });

  it("an initial fileStatus 1 whose status-poll HTTP call FAILS aborts the run fail-closed (T24-F01a: a failed poll is a run failure, not a poll attempt)", async () => {
    const sleeps: number[] = [];
    const route = withIntercept(greenRoute({ fileStatus: 1 }), (request) => {
      if (request.method === "POST" && request.url.endsWith("/emsapi/fileupload/status")) {
        // A persistent 500 on the status endpoint: requestWithRetry exhausts
        // its own bounded attempts and the poll loop ABORTS.
        return json({ error_code: 5000, error_description: "unexpected internal error" }, 500);
      }
      return undefined;
    });
    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM API POST /emsapi/fileupload/status");
    expect(message).toContain("HTTP 500");
    // Exactly ONE poll attempt — requestWithRetry's own 3 bounded tries for
    // that single attempt. If a failed poll counted as a poll attempt the
    // loop would continue: 20 attempts × 3 tries = 60 status calls.
    const statusCalls = result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"));
    expect(statusCalls).toHaveLength(3);
    // Only the retry backoffs (1 s then 2 s) — never a 3 s poll interval.
    expect(sleeps).toEqual([1000, 2000]);
    // The run aborts BEFORE any mutation beyond the file upload itself: no
    // add-version PUT, no app create, no group association.
    expect(result.requests.find((r) => r.method === "PUT")).toBeUndefined();
    expect(
      result.requests.find((r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/apps")),
    ).toBeUndefined();
    expect(
      result.requests.find((r) => r.method === "POST" && r.url.endsWith("/groups/701/apps")),
    ).toBeUndefined();
    // token, apps list, group details, files POST, then the 3 status tries.
    expect(result.requests).toHaveLength(7);
    expectMasked(result);
  });

  it("an UNDOCUMENTED initial fileStatus (4) fails closed naming it, with no status call", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute({ fileStatus: 4 }) });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("fileStatus 4");
    expect(message).toContain("not a documented status");
    expect(result.requests.filter((r) => r.url.endsWith("/emsapi/fileupload/status"))).toHaveLength(
      0,
    );
    expect(result.requests).toHaveLength(4);
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// Accept: application/json (R5-05 / RD5-06)
// ---------------------------------------------------------------------------

describe("Accept: application/json on every MDM JSON call (R5-05)", () => {
  it("the documented-Mandatory calls carry Accept: /emsapi/files POST, the group GET, the association POST", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const filesCall = result.requests.find((r) => r.url.endsWith("/emsapi/files"));
    expect(filesCall?.headers.Accept).toBe("application/json");
    const groupGet = result.requests.find(
      (r) => r.method === "GET" && r.url.endsWith("/api/v1/mdm/groups/701"),
    );
    expect(groupGet?.headers.Accept).toBe("application/json");
    const associate = result.requests.find(
      (r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/groups/701/apps"),
    );
    expect(associate?.headers.Accept).toBe("application/json");
  });

  it("uniformly: EVERY MDM call carries Accept, while the Zoho token exchange keeps its own header set", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const tokenCall = result.requests.find((r) => r.url === TOKEN_URL);
    // The token exchange is NOT an MDM JSON call — its headers stay its own
    // (form-urlencoded; no bearer, no Accept).
    expect(tokenCall?.headers.Accept).toBeUndefined();
    expect(Object.keys(tokenCall?.headers ?? {}).sort()).toEqual(["Content-Type"]);
    const mdmCalls = result.requests.filter((r) => r.url !== TOKEN_URL);
    expect(mdmCalls.length).toBeGreaterThan(0);
    for (const call of mdmCalls) {
      expect(call.headers.Accept).toBe("application/json");
    }
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// App create path (app absent)
// ---------------------------------------------------------------------------

describe("app create path", () => {
  it("consumes the pagination, creates the Enterprise app with the documented Required fields", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        appResponses: [{ apps: fillerApps(MDM_API_PAGE_SIZE, 0) }, { apps: fillerApps(20, 50) }],
      }),
    });

    expect(result.exitCode).toBe(0);
    // The create path still POSTs the label (RD-05): the app does not exist,
    // so it cannot carry one. The walk steps with the documented limit/offset
    // params (RD-03).
    expect(result.requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", TOKEN_URL],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps`],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps?limit=${MDM_API_PAGE_SIZE}&offset=${MDM_API_PAGE_SIZE}`],
      ["GET", `${MDM_BASE}/api/v1/mdm/groups/701`],
      ["POST", `${MDM_BASE}/api/v1/mdm/labels`],
      ["POST", `${MDM_BASE}/emsapi/files`],
      ["POST", `${MDM_BASE}/api/v1/mdm/apps`],
      ["POST", `${MDM_BASE}/api/v1/mdm/groups/701/apps`],
    ]);
    const create = result.requests.find(
      (r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/apps"),
    );
    expect(bodyJson(create)).toEqual({
      app_name: "KISOK",
      app_type: 2,
      app_file: 555,
      app_category_id: 11,
      supported_devices: 3,
      release_label_id: 5,
    });
    // The association uses the app_id from the create response.
    const associate = result.requests.find((r) => r.url.endsWith("/groups/701/apps"));
    expect(bodyJson(associate)).toEqual({
      app_details: [{ app_id: 202, release_label_id: 5 }],
      silent_install: true,
    });
  });

  it("a missing app_category_id at create time fails closed naming it, before any mutation", async () => {
    const env = { ...fullEnv(), MDM_APP_CATEGORY_ID: undefined };
    const result = await runMain(env, {
      route: greenRoute({
        appResponses: [
          { apps: [{ app_id: 9, app_name: "Other", version: "1.0.0", release_labels: [] }] },
        ],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM_APP_CATEGORY_ID is empty");
    expect(message).toContain("does not exist yet");
    // Only the token exchange and the read-only list happened — no mutation at all.
    expect(result.requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", TOKEN_URL],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps`],
    ]);
  });

  it("a create response without an app_id fails closed", async () => {
    const route = withIntercept(
      greenRoute({
        appResponses: [
          { apps: [{ app_id: 9, app_name: "Other", version: "1.0.0", release_labels: [] }] },
        ],
      }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/apps")) {
          return json({ created: true });
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("did not include an app_id");
  });
});

// ---------------------------------------------------------------------------
// Beta label resolution
// ---------------------------------------------------------------------------

describe("Beta label", () => {
  it('POSTs the label with channel_name "Beta" and uses the returned id everywhere (the app has no Beta label yet)', async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
    });

    expect(result.exitCode).toBe(0);
    const label = result.requests.find((r) => r.url.endsWith("/api/v1/mdm/labels"));
    expect(label?.method).toBe("POST");
    expect(bodyJson(label)).toEqual({ channel_name: "Beta" });
    const put = result.requests.find((r) => r.method === "PUT");
    expect(put?.url).toBe(`${MDM_BASE}/api/v1/mdm/apps/101/labels/5`);
    const associate = result.requests.find((r) => r.url.endsWith("/groups/701/apps"));
    expect(bodyJson(associate)).toEqual({
      app_details: [{ app_id: 101, release_label_id: 5 }],
      silent_install: true,
    });
    expect(result.output.join("\n")).toContain("created");
  });

  it("a label response without a release_label_id fails closed", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return json({ ok: true });
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("release_label_id");
  });
});

// ---------------------------------------------------------------------------
// Beta label reuse before create (RD-05)
// ---------------------------------------------------------------------------

describe("Beta label reuse before create (RD-05)", () => {
  it("an existing app with a Beta label reuses its release_label_id — ZERO POST /api/v1/mdm/labels", async () => {
    const result = await runMain(fullEnv(), { route: greenRoute() });

    expect(result.exitCode).toBe(0);
    const labelPosts = result.requests.filter(
      (r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/labels"),
    );
    expect(labelPosts).toHaveLength(0);
    const put = result.requests.find((r) => r.method === "PUT");
    expect(put?.url).toBe(`${MDM_BASE}/api/v1/mdm/apps/101/labels/5`);
    const associate = result.requests.find((r) => r.url.endsWith("/groups/701/apps"));
    expect(bodyJson(associate)).toEqual({
      app_details: [{ app_id: 101, release_label_id: 5 }],
      silent_install: true,
    });
    expect(result.output.join("\n")).toContain("reused");
    expectMasked(result);
  });

  it("an existing app with only a Stable label POSTs the label exactly once and uses the returned id", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        appResponses: [
          {
            apps: [
              existingAppFixture({
                version: "1.1.0",
                labels: [
                  { release_label_id: 7, release_label_name: "Stable", app_version: "1.1.0" },
                ],
              }),
            ],
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    const labelPosts = result.requests.filter(
      (r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/labels"),
    );
    expect(labelPosts).toHaveLength(1);
    expect(bodyJson(labelPosts[0])).toEqual({ channel_name: "Beta" });
    const put = result.requests.find((r) => r.method === "PUT");
    expect(put?.url).toBe(`${MDM_BASE}/api/v1/mdm/apps/101/labels/5`);
    expect(result.output.join("\n")).toContain("created");
  });

  it("release_labels carrying TWO Beta entries: the FIRST id and the FIRST entry's app_version are used (T15-R3)", async () => {
    // Incoming 1.2.0 is strictly greater than the FIRST entry's 1.1.0 but NOT
    // greater than the second entry's 9.9.9 — a passing run proves both pins:
    // the pre-check compared the first entry's app_version, and the reuse took
    // the first entry's id (PUT targets labels/5, never labels/6).
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        appResponses: [
          {
            apps: [
              existingAppFixture({
                labels: [
                  { release_label_id: 5, release_label_name: "Beta", app_version: "1.1.0" },
                  { release_label_id: 6, release_label_name: "Beta", app_version: "9.9.9" },
                ],
              }),
            ],
          },
        ],
      }),
    });

    expect(result.exitCode).toBe(0);
    const put = result.requests.find((r) => r.method === "PUT");
    expect(put?.url).toBe(`${MDM_BASE}/api/v1/mdm/apps/101/labels/5`);
    const associate = result.requests.find((r) => r.url.endsWith("/groups/701/apps"));
    expect(bodyJson(associate)).toEqual({
      app_details: [{ app_id: 101, release_label_id: 5 }],
      silent_install: true,
    });
    const labelPosts = result.requests.filter(
      (r) => r.method === "POST" && r.url.endsWith("/api/v1/mdm/labels"),
    );
    expect(labelPosts).toHaveLength(0);
  });

  it("a failing label POST fails closed with the named error (duplicate-channel behavior is undocumented)", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return json({ error_code: "MDM0019", error_description: "channel conflict" }, 409);
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM0019");
    expect(message).toContain("HTTP 409");
    // No upload happened after the failed label POST.
    expect(result.requests.some((r) => r.url.endsWith("/emsapi/files"))).toBe(false);
    expectMasked(result);
  });
});

// ---------------------------------------------------------------------------
// Monotonic version pre-check
// ---------------------------------------------------------------------------

describe("version parsing and comparison (numeric per component)", () => {
  it("parses dotted numeric versions", () => {
    expect(parseDottedVersion("1.2.0")).toEqual({ ok: true, parts: [1, 2, 0] });
    expect(parseDottedVersion("1.0.10")).toEqual({ ok: true, parts: [1, 0, 10] });
    expect(parseDottedVersion(" 1.2.0 ").ok).toBe(true);
    expect(parseDottedVersion("1.x.0").ok).toBe(false);
    expect(parseDottedVersion("").ok).toBe(false);
    expect(parseDottedVersion("1..2").ok).toBe(false);
  });

  it("compares numerically per component, not lexicographically", () => {
    expect(compareVersionParts([1, 2, 0], [1, 1, 0])).toBe(1);
    expect(compareVersionParts([1, 0, 10], [1, 0, 9])).toBe(1);
    expect(compareVersionParts([1, 0, 9], [1, 0, 10])).toBe(-1);
    expect(compareVersionParts([1, 2], [1, 2, 0])).toBe(0);
    expect(compareVersionParts([1, 2, 0], [1, 2, 0])).toBe(0);
  });

  it("prefers the Beta label's app_version over the top-level version", () => {
    const app: ListedApp = {
      appId: 101,
      appName: "KISOK",
      version: "1.0.0",
      releaseLabels: [{ releaseLabelId: 5, releaseLabelName: "Beta", appVersion: "1.1.0" }],
    };
    expect(resolveExistingVersion(app)).toBe("1.1.0");
    expect(resolveExistingVersion({ ...app, releaseLabels: [] })).toBe("1.0.0");
    expect(
      resolveExistingVersion({
        ...app,
        releaseLabels: [{ releaseLabelId: 5, releaseLabelName: "Beta", appVersion: "" }],
      }),
    ).toBe("1.0.0");
    expect(
      resolveExistingVersion({
        ...app,
        releaseLabels: [{ releaseLabelId: 9, releaseLabelName: "Production", appVersion: "9.9.9" }],
      }),
    ).toBe("1.0.0");
  });

  it("checkMonotonicVersion refuses non-increasing, unparsable, and unknown versions", () => {
    expect(checkMonotonicVersion("1.2.0", "1.1.0")).toEqual({ ok: true });
    expect(checkMonotonicVersion("1.2.0", "1.2.0").ok).toBe(false);
    expect(checkMonotonicVersion("1.0.9", "1.0.10").ok).toBe(false);
    const incoming = checkMonotonicVersion("1.x", "1.0.0");
    expect(incoming.ok).toBe(false);
    if (!incoming.ok) expect(incoming.failure).toContain("MDM_APP_VERSION");
    const existing = checkMonotonicVersion("1.2.0", "1.x");
    expect(existing.ok).toBe(false);
    if (!existing.ok) expect(existing.failure).toContain("not a dotted numeric version");
    const unknown = checkMonotonicVersion("1.2.0", undefined);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.failure).toContain("could not be determined");
  });
});

describe("monotonic pre-check refuses BEFORE any upload POST", () => {
  it("an equal version refuses with only the token exchange and list GET performed", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({
        appResponses: [{ apps: [existingAppFixture({ betaVersion: "1.2.0" })] }],
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("not strictly greater");
    expect(result.requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", TOKEN_URL],
      ["GET", `${MDM_BASE}/api/v1/mdm/apps`],
    ]);
  });

  it("an unparsable existing version fails closed (never guesses)", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.x" })] }] }),
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("not a dotted numeric version");
    expect(message).toContain("1.x");
    expect(result.requests).toHaveLength(2);
  });

  it("an existing app with no version fields at all fails closed", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute({ appResponses: [{ apps: [existingAppFixture()] }] }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("could not be determined");
    expect(result.requests).toHaveLength(2);
  });

  it("prefers the Beta label version for the comparison (top-level would disagree)", async () => {
    // Top-level 1.0.0 would let 1.1.0 through; the Beta label's 2.0.0 must refuse.
    const result = await runMain(
      { ...fullEnv(), MDM_APP_VERSION: "1.1.0" },
      {
        route: greenRoute({
          appResponses: [
            { apps: [existingAppFixture({ version: "1.0.0", betaVersion: "2.0.0" })] },
          ],
        }),
      },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("2.0.0");
    expect(result.requests).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// APK file read (before any network call in upload mode)
// ---------------------------------------------------------------------------

describe("APK file read", () => {
  it("a failed APK read exits non-zero naming APK_PATH, before any network call", async () => {
    const result = await runMain(fullEnv(), {
      route: greenRoute(),
      readFile: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain('could not read the APK at "dist/app-release.apk"');
    expect(message).toContain("APK_PATH");
    expect(result.requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Backoff and bounded retries (soft limits; 429 / COM0002 / 5xx)
// ---------------------------------------------------------------------------

describe("backoff and bounded retries", () => {
  it("retries an HTTP 429 once with the base backoff, then succeeds", async () => {
    let appsCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        appsCalls += 1;
        if (appsCalls === 1) return { status: 429, body: "" };
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(appsCalls).toBe(2);
    expect(sleeps).toEqual([1000]);
  });

  it("retries a COM0002 error envelope, then succeeds", async () => {
    let appsCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        appsCalls += 1;
        if (appsCalls === 1) {
          return json({ error_code: "COM0002", error_description: "API Limit Exceeded" }, 400);
        }
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(appsCalls).toBe(2);
    expect(sleeps).toEqual([1000]);
  });

  // Characterization (T16): a NUMERIC error_code must not defeat the
  // status-based retry — the HTTP status is the primary rate signal, the
  // COM0002 string match is the secondary one. The fixture code (500) mirrors
  // the 5xx status; only the status is the documented retry trigger here.
  it("characterization: a numeric-code envelope with HTTP 500 still retries via the status check", async () => {
    let appsCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        appsCalls += 1;
        return json({ error_code: 500, error_description: "Internal Error" }, 500);
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(appsCalls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(result.errors.join("\n")).toContain("after 3 attempts");
  });

  it("retries the token exchange on 429 (bounded), then succeeds", async () => {
    let tokenCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "POST" && request.url.endsWith("/oauth/v2/token")) {
        tokenCalls += 1;
        if (tokenCalls === 1) return { status: 429, body: "" };
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(tokenCalls).toBe(2);
    expect(sleeps).toEqual([1000]);
  });

  it("bounded retries: a persistent 5xx fails closed after three attempts with growing delays", async () => {
    let appsCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        appsCalls += 1;
        return { status: 500, body: "upstream error" };
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(appsCalls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    const message = result.errors.join("\n");
    expect(message).toContain("HTTP 500");
    expect(message).toContain("after 3 attempts");
    expect(message).toContain("upstream error");
  });

  it("a non-retryable 4xx error envelope is NOT retried and fails immediately", async () => {
    let appsCalls = 0;
    const route = withIntercept(greenRoute(), (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        appsCalls += 1;
        return json({ error_code: "MDM0001", error_description: "bad request" }, 400);
      }
      return undefined;
    });
    const sleeps: number[] = [];

    const result = await runMain(fullEnv(), {
      route,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(appsCalls).toBe(1);
    expect(sleeps).toEqual([]);
    expect(result.errors.join("\n")).toContain("MDM0001");
  });

  it("waits between retries with the default timer-based sleep (fake timers)", async () => {
    jest.useFakeTimers();
    try {
      let appsCalls = 0;
      const base = greenRoute();
      const route: RouteHandler = (request) => {
        if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
          appsCalls += 1;
          if (appsCalls === 1) return { status: 429, body: "" };
        }
        return base(request, 0);
      };
      const { fetchImpl, requests } = createFakeFetch(route);
      const output: string[] = [];
      const errors: string[] = [];

      const running = main(ARGV, fullEnv(), {
        fetchImpl,
        readFile: async () => APK_BYTES,
        errorSink: (line) => {
          errors.push(line);
        },
        outputSink: (line) => {
          output.push(line);
        },
      });
      await jest.advanceTimersByTimeAsync(1000);
      const exitCode = await running;

      expect(exitCode).toBe(0);
      expect(appsCalls).toBe(2);
      expect(
        requests.filter((r) => r.method === "GET" && r.url.includes("/api/v1/mdm/apps")),
      ).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("the app-list pagination has a hard page bound and fails closed when it never terminates", async () => {
    const route: RouteHandler = (request) => {
      if (request.method === "GET" && request.url.includes("/api/v1/mdm/apps")) {
        return json({ apps: fillerApps(MDM_API_PAGE_SIZE, 0) });
      }
      return greenRoute()(request, 0);
    };
    const result = await runMain(dryEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    expect(result.errors.join("\n")).toContain("pagination did not terminate");
    expect(
      result.requests.filter((r) => r.method === "GET" && r.url.includes("/api/v1/mdm/apps")),
    ).toHaveLength(MAX_LIST_PAGES);
  });
});

// ---------------------------------------------------------------------------
// Error envelope surfacing
// ---------------------------------------------------------------------------

describe("error envelope", () => {
  it("a non-2xx with {error_code, error_description} surfaces both, never a raw dump", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return json(
            {
              error_code: "MDM0023",
              error_description: "insufficient privileges",
              localized_error_description: "Lokalisierte Meldung",
            },
            403,
          );
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("MDM0023");
    expect(message).toContain("insufficient privileges");
    expect(message).toContain("HTTP 403");
    expect(message).not.toContain("localized_error_description");
    expectMasked(result);
  });

  it("a non-2xx with a NUMERIC error_code (the documented 1002 example) renders structured, not as a raw first line", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return json({ error_code: 1002, error_description: "Unknown ID" }, 400);
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("1002 — Unknown ID");
    expect(message).not.toContain('{"error_code"');
    expect(message).toContain("HTTP 400");
    expectMasked(result);
  });

  it("a non-2xx with an unparseable body surfaces a truncated first line, not the whole body", async () => {
    const route = withIntercept(
      greenRoute({ appResponses: [{ apps: [existingAppFixture({ version: "1.1.0" })] }] }),
      (request) => {
        if (request.method === "POST" && request.url.endsWith("/api/v1/mdm/labels")) {
          return {
            status: 502,
            body: "first line of a very long upstream proxy error\nsecond line",
          };
        }
        return undefined;
      },
    );
    const result = await runMain(fullEnv(), { route });

    expect(result.exitCode).not.toBe(0);
    const message = result.errors.join("\n");
    expect(message).toContain("first line of a very long upstream proxy error");
    expect(message).not.toContain("second line");
  });
});

// ---------------------------------------------------------------------------
// Exit-code contract and --help
// ---------------------------------------------------------------------------

describe("exit-code contract and --help", () => {
  it("--help exits 0, performs no network call, and lists every flag and env name", async () => {
    const result = await runMain({}, { argv: [...ARGV, "--help"] });

    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.requests).toHaveLength(0);
    const usage = result.output.join("\n");
    for (const name of [
      "--client-id",
      "MDM_CLIENT_ID",
      "--client-secret",
      "MDM_CLIENT_SECRET",
      "--refresh-token",
      "MDM_REFRESH_TOKEN",
      "--redirect-uri",
      "MDM_REDIRECT_URI",
      "--apk",
      "APK_PATH",
      "--app-name",
      "MDM_APP_NAME",
      "--app-version",
      "MDM_APP_VERSION",
      "--app-category-id",
      "MDM_APP_CATEGORY_ID",
      "--group-id",
      "MDM_GROUP_ID",
      "--expected-group-name",
      "MDM_EXPECTED_GROUP_NAME",
      "--production-group-id",
      "MDM_PRODUCTION_GROUP_ID",
      "--label-name",
      "MDM_LABEL_NAME",
      "--data-centre",
      "MDM_DATA_CENTRE",
      "--dry-run",
      "MDM_DRY_RUN",
    ]) {
      expect(usage).toContain(name);
    }
    expect(usage).toContain("Beta");
    expect(usage).toContain("us");
  });

  it("a successful dry run exits 0 (covered above) and every failure path exits 1", async () => {
    const ok = await runMain(dryEnv(), { route: greenRoute() });
    expect(ok.exitCode).toBe(0);
    const failing = await runMain({}, {});
    expect(failing.exitCode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure builders and the redactor
// ---------------------------------------------------------------------------

describe("pure builders", () => {
  it("buildTokenExchangeBody encodes the refresh-token grant params", () => {
    expect(
      buildTokenExchangeBody({ clientId: "id one&", clientSecret: "sec", refreshToken: "tok" }),
    ).toBe("grant_type=refresh_token&client_id=id%20one%26&client_secret=sec&refresh_token=tok");
    expect(
      buildTokenExchangeBody({
        clientId: "id",
        clientSecret: "sec",
        refreshToken: "tok",
        redirectUri: "https://example.com/cb",
      }),
    ).toContain("&redirect_uri=https%3A%2F%2Fexample.com%2Fcb");
    expect(
      buildTokenExchangeBody({ clientId: "id", clientSecret: "sec", refreshToken: "tok" }).includes(
        "redirect_uri",
      ),
    ).toBe(false);
  });

  it("buildMultipartFilePart produces the exact multipart framing", () => {
    const part = buildMultipartFilePart(
      "BOUNDARY",
      "file",
      "app-release.apk",
      APK_MIME_TYPE,
      Buffer.from("BYTES"),
    );
    expect(Buffer.from(part).toString("latin1")).toBe(
      `--BOUNDARY\r\n` +
        `Content-Disposition: form-data; name="file"; filename="app-release.apk"\r\n` +
        `Content-Type: ${APK_MIME_TYPE}\r\n` +
        `\r\n` +
        `BYTES\r\n` +
        `--BOUNDARY--\r\n`,
    );
  });

  it("redactSecrets replaces full secret values and leaves short values alone", () => {
    expect(redactSecrets("token abcdefgh1234 here", ["abcdefgh1234"])).toBe(
      "token [REDACTED] here",
    );
    expect(redactSecrets("a short abc stays", ["abc"])).toBe("a short abc stays");
    expect(redactSecrets("nothing to redact", [])).toBe("nothing to redact");
  });
});
