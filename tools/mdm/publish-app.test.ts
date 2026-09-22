import {
  buildTokenExchangeBody,
  collectSecretValues,
  identifyApp,
  parseAppDetails,
  redactSecrets,
  resolveDataCentre,
  resolveInputs,
  isSafePathSegment,
  listedCandidates,
  selectStableLabel,
  publish,
  type FetchLike,
  type PublishInputs,
} from "./publish-app";

const INPUTS: PublishInputs = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  apkPath: "/tmp/app-release.apk",
  packageName: "com.kisok.kiosk",
  appName: "KISOK",
  dataCentre: "us",
  dryRun: false,
};

/**
 * The documented Stable label as the LIST response carries it. `type` is the
 * selector; the name is UI text and deliberately varies across fixtures.
 */
const STABLE_LABEL = { release_label_id: 9, release_label_type: 1, release_label_name: "Stable" };
const BETA_LABEL = { release_label_id: 8, release_label_type: 2, release_label_name: "Beta" };

describe("secret handling", () => {
  it("redacts every secret value, wherever it appears in a message", () => {
    const text = "POST failed: refresh-token rejected for client-secret";

    expect(redactSecrets(text, ["refresh-token", "client-secret"])).toBe(
      "POST failed: ***REDACTED*** rejected for ***REDACTED***",
    );
  });

  it("ignores empty secrets so an unset variable cannot redact the whole message", () => {
    expect(redactSecrets("anything at all", ["", "  "])).toBe("anything at all");
  });

  it("collects exactly the three credential values, and nothing else", () => {
    expect(collectSecretValues(INPUTS).sort()).toEqual(
      ["client-id", "client-secret", "refresh-token"].sort(),
    );
  });

  it("builds a refresh-token grant body — the one place credentials are serialised", () => {
    const body = buildTokenExchangeBody(INPUTS);

    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_id=client-id");
    expect(body).toContain("refresh_token=refresh-token");
  });
});

describe("resolveDataCentre", () => {
  it("maps the US data centre to its documented accounts and API hosts", () => {
    expect(resolveDataCentre("us")).toEqual({
      accounts: "https://accounts.zoho.com",
      mdm: "https://mdm.manageengine.com",
    });
  });

  it("refuses an unknown data centre rather than guessing where to send credentials", () => {
    expect(() => resolveDataCentre("moon")).toThrow(/MDM_DATA_CENTRE/);
  });
});

describe("resolveInputs", () => {
  it("names every missing required variable at once, before any network call", () => {
    const result = resolveInputs([], {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toContain("MDM_CLIENT_ID");
    expect(result.problems.join("\n")).toContain("MDM_CLIENT_SECRET");
    expect(result.problems.join("\n")).toContain("MDM_REFRESH_TOKEN");
    expect(result.problems.join("\n")).toContain("APK_PATH");
  });

  it("reads the credentials from the environment and the APK from a flag", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inputs.apkPath).toBe("/tmp/x.apk");
    expect(result.inputs.packageName).toBe("com.kisok.kiosk");
  });

  it("rejects an unknown flag instead of silently ignoring it", () => {
    const result = resolveInputs(["--beta-group", "7"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
      APK_PATH: "/tmp/x.apk",
    });

    expect(result.ok).toBe(false);
  });
});

describe("the Stable label is resolved from the LISTING, by type not by name", () => {
  it("selects the label whose release_label_type is 1", () => {
    const result = selectStableLabel([BETA_LABEL, STABLE_LABEL], 55);

    expect(result).toEqual({
      ok: true,
      label: { releaseLabelId: 9, releaseLabelType: 1, releaseLabelName: "Stable" },
    });
  });

  it("selects Stable even when the tenant renamed the display label", () => {
    // release_label_name is UI text. A tenant renaming "Stable" to anything
    // must not make the release unroutable, and a channel that merely CALLS
    // itself Stable must not be picked.
    const renamed = { release_label_id: 12, release_label_type: 1, release_label_name: "Live" };
    const result = selectStableLabel([BETA_LABEL, renamed], 55);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label.releaseLabelId).toBe(12);
  });

  it("never selects a Beta label for production", () => {
    const result = selectStableLabel([BETA_LABEL], 55);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("no release label of the documented Stable type");
  });

  it("refuses when an app carries SEVERAL Stable labels", () => {
    const result = selectStableLabel(
      [STABLE_LABEL, { release_label_id: 10, release_label_type: 1 }],
      55,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("refusing to guess");
  });

  it("refuses when a label entry has no readable id or type", () => {
    // It could be the Stable one, and the id is what ADDRESSES App Details.
    expect(selectStableLabel([{ release_label_name: "Stable" }], 55).ok).toBe(false);
    expect(selectStableLabel([{ release_label_id: 9 }], 55).ok).toBe(false);
  });

  it("refuses when release_labels is missing or not an array", () => {
    expect(selectStableLabel(undefined, 55).ok).toBe(false);
    expect(selectStableLabel("Stable", 55).ok).toBe(false);
  });

  it("offers EVERY listed entry for verification, regardless of display name", () => {
    // Filtering the listing by display name meant an app sitting under any
    // other name was never examined, so the walk concluded `absent` and
    // created a duplicate. The name selects nothing.
    const listed = listedCandidates([
      { app_id: 1, app_name: "Something else", release_labels: [STABLE_LABEL] },
      { app_id: 2, app_name: "KISOK Kiosk", release_labels: [STABLE_LABEL] },
    ]);

    expect(listed.unusable).toBe(0);
    expect(listed.candidates.map((c) => c.appId)).toEqual([1, 2]);
  });

  it("counts an entry it cannot even address, rather than dropping it", () => {
    // A silently dropped entry is one that cannot be ruled out, and it would
    // hide our app behind an `absent` verdict.
    const listed = listedCandidates([
      { app_id: 1, release_labels: [STABLE_LABEL] },
      { app_name: "no id" },
    ]);

    expect(listed.candidates).toHaveLength(1);
    expect(listed.unusable).toBe(1);
  });

  it("counts an entry whose Stable label cannot be resolved as unusable, not as 'not ours'", () => {
    // Without a Stable label id there is no way to READ this entry's identity,
    // so it cannot be declared someone else's app.
    const listed = listedCandidates([
      { app_id: 7, app_name: "Mystery", release_labels: [BETA_LABEL] },
    ]);

    expect(listed.candidates).toHaveLength(0);
    expect(listed.unusable).toBe(1);
  });

  it("rejects an id that could retarget an authenticated request", () => {
    expect(isSafePathSegment(55)).toBe(true);
    expect(isSafePathSegment("55")).toBe(true);
    expect(isSafePathSegment("1/../../other")).toBe(false);
  });
});

describe("identity — established from label-scoped App Details", () => {
  const DETAILS = {
    app_id: 55,
    app_name: "KISOK",
    app_type: 2,
    platform_type: 2,
    bundle_identifier: "com.kisok.kiosk",
  };

  it("parses the documented App Details fields", () => {
    const details = parseAppDetails(DETAILS, 55);

    expect(details.bundleIdentifier).toBe("com.kisok.kiosk");
    expect(details.appType).toBe(2);
    expect(details.platformType).toBe(2);
    expect(details.appName).toBe("KISOK");
  });

  it("positively identifies our app by bundle_identifier, Enterprise app_type AND Android platform_type", () => {
    expect(identifyApp(parseAppDetails(DETAILS, 55), "com.kisok.kiosk")).toEqual({ ok: true });
  });

  it("calls a DIFFERENT package somebody else's app — safe to skip", () => {
    const other = parseAppDetails({ ...DETAILS, bundle_identifier: "com.other.app" }, 55);

    expect(identifyApp(other, "com.kisok.kiosk")).toEqual({ ok: false, kind: "other-package" });
  });

  it("calls a MISSING bundle_identifier unverifiable — NOT safe to skip", () => {
    // The distinction that matters: "not ours" and "cannot tell" must not take
    // the same branch, or an unreadable entry becomes an absence and the run
    // creates a duplicate.
    const bare = parseAppDetails({ app_id: 55, app_name: "KISOK", app_type: 2 }, 55);
    const result = identifyApp(bare, "com.kisok.kiosk");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unverifiable");
  });

  it("calls OUR package with a non-Enterprise app_type unverifiable, not a mismatch", () => {
    const store = parseAppDetails({ ...DETAILS, app_type: 0 }, 55);
    const result = identifyApp(store, "com.kisok.kiosk");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unverifiable");
  });

  it("calls OUR package on a NON-Android platform_type unverifiable", () => {
    // platform_type 1 is iOS. Something registered under our identifier on
    // another platform is not the app this pipeline builds.
    const ios = parseAppDetails({ ...DETAILS, platform_type: 1 }, 55);
    const result = identifyApp(ios, "com.kisok.kiosk");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.kind !== "unverifiable") return;
    expect(result.reason).toContain("not Android");
  });

  it("calls OUR package with no platform_type at all unverifiable", () => {
    const bare = parseAppDetails({ ...DETAILS, platform_type: undefined }, 55);
    const result = identifyApp(bare, "com.kisok.kiosk");

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The pipeline, driven through an injected fetch — no network, no credentials.
// ---------------------------------------------------------------------------

type Call = { url: string; method: string; body?: unknown; headers: Record<string, string> };

type FakeRoute = { status: number; body?: unknown; rawText?: string };

function fakeFetch(routes: Record<string, () => FakeRoute>) {
  const calls: Call[] = [];
  const fetchLike: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    // Routes are keyed "METHOD /path" so a POST that creates and a GET that
    // lists never collide on the same path.
    const method = init?.method ?? "GET";
    // Match the PATHNAME exactly. Substring matching let an unregistered
    // sub-path (e.g. App Details for an app with no fixture) silently receive
    // the listing route's body instead of throwing — which made one test pass
    // for entirely the wrong reason.
    const pathname = new URL(url).pathname;
    const key = Object.keys(routes).find((route) => {
      const [routeMethod, routePath] = route.split(" ");
      return routeMethod === method && pathname === routePath;
    });
    if (!key) throw new Error(`unexpected ${method} request: ${url}`);
    const { status, body, rawText } = routes[key]!();
    return {
      ok: status >= 200 && status < 300,
      status,
      // `rawText`, when given, is sent verbatim — the only way to put a
      // numeric literal above Number.MAX_SAFE_INTEGER on the wire, since a JS
      // source literal that large is already rounded before JSON.stringify
      // ever sees it.
      text: async () => rawText ?? (body === undefined ? "" : JSON.stringify(body)),
    };
  };
  return { fetchLike, calls };
}

const TOKEN_ROUTE = {
  // A realistic length matters: redaction is a plain substring replace, so a
  // two-character fixture token would scrub fragments of ordinary words.
  "POST /oauth/v2/token": () => ({
    status: 200,
    body: { access_token: "1000.accesstokenfixture.value" },
  }),
};

function deps(routes: Record<string, () => FakeRoute>) {
  const { fetchLike, calls } = fakeFetch({ ...TOKEN_ROUTE, ...routes });
  return {
    calls,
    deps: {
      fetch: fetchLike,
      readApk: async () => new Uint8Array([1, 2, 3]),
      sleep: async () => {},
      log: () => {},
    },
  };
}

it("uploads the APK and CREATES the app when the package is not in the repository", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /api/v1/mdm/apps": () => ({ status: 200, body: { app_id: 101 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.action).toBe("created");
  const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"));
  expect(JSON.parse(String(create!.body))).toMatchObject({
    app_name: "KISOK",
    app_type: 2,
    app_file: 42,
  });
});

it("UPDATES the existing app when the package is already in the repository", async () => {
  let listed = false;
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => {
      listed = true;
      return {
        status: 200,
        body: { apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }] },
      };
    },
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(listed).toBe(true);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.action).toBe("updated");
  // The DOCUMENTED update path is label-scoped, and force_update_in_label is
  // required to update the version in a label that already carries the app.
  const put = calls.find((c) => c.method === "PUT")!;
  expect(put.url).toMatch(/\/api\/v1\/mdm\/apps\/55\/labels\/9$/);
  expect(JSON.parse(String(put.body))).toMatchObject({
    app_name: "KISOK",
    app_type: 2,
    app_file: 7,
    force_update_in_label: true,
  });
});

it("waits for the documented file processing when the upload comes back pending", async () => {
  let statusCalls = 0;
  const { deps: d } = deps({
    "POST /emsapi/fileupload/status": () => {
      statusCalls += 1;
      return {
        status: 200,
        body: { response: [{ file_id: "7", file_availability_status: statusCalls < 2 ? 1 : 2 }] },
      };
    },
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 1 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /api/v1/mdm/apps": () => ({ status: 200, body: { app_id: 102 } }),
  });

  const result = await publish(INPUTS, d);

  expect(statusCalls).toBe(2);
  expect(result.ok).toBe(true);
});

it("creates and updates nothing when the file upload reports the documented FAILED status", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 3 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  // No app was created or updated off the back of a failed upload.
  expect(calls.some((c) => c.method !== "GET" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("leaves an app with a different package alone, and creates ours beside it", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 3, app_name: "KISOK", release_labels: [STABLE_LABEL] }] },
    }),
    // Same display name, DIFFERENT package: a different app entirely.
    "GET /api/v1/mdm/apps/3/labels/9": () => ({
      status: 200,
      body: { app_id: 3, app_name: "KISOK", app_type: 2, bundle_identifier: "com.someone.else" },
    }),
    "POST /api/v1/mdm/apps": () => ({ status: 200, body: { app_id: 101 } }),
  });

  const result = await publish(INPUTS, d);

  // Ours is genuinely not in the repository, so creating it is correct — and
  // the same-named app for another package is never touched.
  expect(result).toMatchObject({ ok: true, action: "created" });
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

it("never puts a credential in a failure message", async () => {
  const { deps: d } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /emsapi/files": () => ({ status: 401, body: { error: "invalid token refresh-token" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).not.toContain("refresh-token");
  expect(result.failure).toContain("***REDACTED***");
});

it("in dry-run mode it authenticates and reads, but never uploads or writes", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
  });

  const result = await publish({ ...INPUTS, dryRun: true }, d);

  expect(result.ok).toBe(true);
  expect(calls.some((c) => c.url.includes("/emsapi/files"))).toBe(false);
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))).toBe(false);
});

it("walks past the first page — a match on page 2 is an UPDATE, never a duplicate create", async () => {
  // The tenant's page is smaller than our page-size constant. If termination
  // relied on "a short page means the end", KISOK would look absent and the
  // run would create a second enterprise app after already uploading the APK.
  let page = 0;
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => {
      page += 1;
      return page === 1
        ? {
            status: 200,
            body: {
              apps: [{ app_id: 1, app_name: "Other", release_labels: [STABLE_LABEL] }],
              metadata: { total_record_count: 2 },
            },
          }
        : {
            status: 200,
            body: {
              apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }],
              metadata: { total_record_count: 2 },
            },
          };
    },
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "GET /api/v1/mdm/apps/1/labels/9": () => ({
      status: 200,
      body: { app_id: 1, app_name: "Other", app_type: 2, bundle_identifier: "com.other" },
    }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result).toMatchObject({ ok: true, action: "updated" });
  const listings = calls.filter((c) => c.method === "GET" && /\/apps\?/.test(c.url));
  const detailReads = calls.filter(
    (c) => c.method === "GET" && /\/apps\/55\/labels\/9$/.test(c.url),
  );
  expect(listings.length).toBe(2);
  expect(detailReads.length).toBe(1);
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("accepts a 2xx write with an empty body — the update already happened", async () => {
  const { deps: d } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }] },
    }),
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 204, body: undefined }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.action).toBe("updated");
});

it("redacts the exchanged access token, not just the three credentials", async () => {
  const { deps: d } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /emsapi/files": () => ({
      status: 500,
      body: { message: "upstream rejected token at-secret-value" },
    }),
  });
  const withToken = { ...INPUTS };

  const result = await publish(withToken, {
    ...d,
    fetch: async (url, init) => {
      if (url.includes("/oauth/v2/token")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ access_token: "at-secret-value" }),
        };
      }
      return d.fetch(url, init);
    },
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).not.toContain("at-secret-value");
});

it("fails closed when the listing is longer than the page bound, rather than creating a duplicate", async () => {
  // The repository reports more apps than the walk is allowed to read. Falling
  // through to "absent" here would create a SECOND enterprise app, which is
  // exactly what the package-identity matching exists to prevent.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: {
        apps: Array.from({ length: 50 }, (_, i) => ({
          app_id: i + 1,
          app_name: `Other ${i}`,
        })),
        metadata: { total_record_count: 100000 },
      },
    }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toMatch(/did not finish within 10 pages/i);
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("enforces the page bound on the paging.next path too, not just the offset path", async () => {
  // The tenant answers with a paging.next envelope every time. If the bound is
  // only checked on the offset path, the `continue` skips it, the loop ends on
  // its own condition, and `absent` takes the create branch — a duplicate app
  // after the APK is already uploaded.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: {
        apps: [{ app_id: 1, app_name: "Other", release_labels: [STABLE_LABEL] }],
        paging: { next: "https://mdm.manageengine.com/api/v1/mdm/apps?limit=50&offset=999" },
      },
    }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toMatch(/did not finish within 10 pages/i);
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("fails closed on an EMPTY page while the documented total promises more", async () => {
  // The last surviving path to `matchAppByPackage` over partial data: a total
  // says there are more rows, but the page comes back empty. Breaking here
  // reports KISOK absent and creates a duplicate after the APK is uploaded.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [], metadata: { total_record_count: 500 } },
    }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("an empty page with NO total is still the honest end of the listing", async () => {
  // Without metadata there is nothing promising more, so an empty page really
  // does end the walk — and KISOK really is absent, so create is correct.
  const { deps: d } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /api/v1/mdm/apps": () => ({ status: 200, body: { app_id: 77 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result).toMatchObject({ ok: true, action: "created" });
});

it("UPDATES an app that exists under a DIFFERENT display name — never creates a duplicate", async () => {
  // The regression this guards: selecting listing candidates by display name
  // meant a repository entry named anything but "KISOK" was never examined,
  // so the walk concluded `absent` and created a SECOND enterprise app for a
  // package that was already there.
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK Kiosk", release_labels: [STABLE_LABEL] }] },
    }),
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK Kiosk",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result).toMatchObject({ ok: true, action: "updated" });
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))).toBe(false);
});

it("sends the DOCUMENTED Zoho-oauthtoken scheme, never Bearer", async () => {
  // The headline fix of this contract round: `Bearer` is not recognised, so
  // every ManageEngine call would have come back 401 and nothing caught it.
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "POST /api/v1/mdm/apps": () => ({ status: 200, body: { app_id: 101 } }),
  });

  await publish(INPUTS, d);

  const authenticated = calls.filter((c) => !c.url.includes("/oauth/v2/token"));
  expect(authenticated.length).toBeGreaterThan(0);
  for (const call of authenticated) {
    expect(call.headers.Authorization).toBe("Zoho-oauthtoken 1000.accesstokenfixture.value");
    expect(call.headers.Accept).toBe("application/json");
  }
  // The credentials themselves never travel in a header.
  const tokenCall = calls.find((c) => c.url.includes("/oauth/v2/token"))!;
  expect(tokenCall.headers.Authorization).toBeUndefined();
});

it("fails before any network call when the APK cannot be read", async () => {
  const { deps: d, calls } = deps({});

  const result = await publish(
    { ...INPUTS, apkPath: "/nope/missing.apk" },
    {
      ...d,
      readApk: async () => {
        throw new Error("ENOENT");
      },
    },
  );

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toMatch(/could not be read/i);
  expect(calls).toHaveLength(0);
});

describe("nothing is created or updated off something unverified", () => {
  const LISTING = { apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }] };

  function mutations(calls: { method: string; url: string }[]) {
    return calls.filter(
      (c) =>
        c.method !== "GET" && (c.url.includes("/api/v1/mdm/apps") || c.url.includes("/emsapi/")),
    );
  }

  it("stops when a listed entry is not even an object", async () => {
    // The unusable count only fails the run closed if these reach it. An
    // earlier version filtered non-objects out of the listing walk, so the
    // walk collected nothing, counted nothing, and `absent` CREATED a
    // duplicate app off a repository it could not read.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: { apps: [null, "com.kisok.kiosk", 7] },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops rather than treating a dropped entry as a page fully read", async () => {
    // total_record_count once counted the dropped entries, so `seen >= total`
    // ended the walk as though the repository had been read.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: { apps: [null, null], metadata: { total_record_count: 2 } },
      }),
    });

    expect((await publish(INPUTS, d)).ok).toBe(false);
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when TWO entries both claim our package", async () => {
    const ours = (appId: number) => () => ({
      status: 200,
      body: {
        app_id: appId,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    });
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: {
          apps: [
            { app_id: 55, release_labels: [STABLE_LABEL] },
            { app_id: 56, release_labels: [STABLE_LABEL] },
          ],
        },
      }),
      "GET /api/v1/mdm/apps/55/labels/9": ours(55),
      "GET /api/v1/mdm/apps/56/labels/9": ours(56),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("refusing to guess which to update");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when the matched app carries no app_name to echo back", async () => {
    // app_name is documented-mandatory on the update body. Without this guard
    // JSON.stringify drops the undefined and the PUT goes out without it.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({ status: 200, body: LISTING }),
      "GET /api/v1/mdm/apps/55/labels/9": () => ({
        status: 200,
        body: {
          app_id: 55,
          app_type: 2,
          bundle_identifier: "com.kisok.kiosk",
          platform_type: 2,
        },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("app_name");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when App Details answers about a DIFFERENT app than the one addressed", async () => {
    // Everything read out of that body belongs to another app — including the
    // app_name the update echoes back, which would rename ours to a stranger's.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({ status: 200, body: LISTING }),
      "GET /api/v1/mdm/apps/55/labels/9": () => ({
        status: 200,
        body: {
          app_id: 999,
          app_name: "Totally other",
          app_type: 2,
          bundle_identifier: "com.kisok.kiosk",
          platform_type: 2,
        },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("describes a different app");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops rather than pushing to the wrong channel when a release label is unreadable", async () => {
    // The unreadable one could be the Stable label, and its id is what
    // ADDRESSES App Details — so this entry's identity cannot be read at all.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: {
          apps: [
            {
              app_id: 55,
              app_name: "KISOK",
              release_labels: [{ release_label_id: 9 }, BETA_LABEL],
            },
          ],
        },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("no readable id or type");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when an entry has SEVERAL Stable labels rather than guessing a channel", async () => {
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: {
          apps: [
            {
              app_id: 55,
              app_name: "KISOK",
              release_labels: [STABLE_LABEL, { release_label_id: 10, release_label_type: 1 }],
            },
          ],
        },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("refusing to guess");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when a listed entry has only a Beta label, rather than calling it not-ours", async () => {
    // Without a Stable label there is no way to READ this entry's identity.
    // Treating it as somebody else's app would let `absent` create a duplicate.
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: { apps: [{ app_id: 55, app_name: "Mystery", release_labels: [BETA_LABEL] }] },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toContain("Stable type");
    expect(mutations(calls)).toHaveLength(0);
  });

  it("stops when the repository is larger than the App Details read bound", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      app_id: i + 1,
      app_name: `App ${i}`,
      release_labels: [STABLE_LABEL],
    }));
    const { deps: d, calls } = deps({
      "GET /api/v1/mdm/apps": () => ({
        status: 200,
        body: { apps: many, metadata: { total_record_count: 201 } },
      }),
    });

    const result = await publish(INPUTS, d);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatch(/more than the 200/);
    expect(mutations(calls)).toHaveLength(0);
  });
});

it("updates without renaming the app the operator named", async () => {
  // Any package match is updated now, whatever the console calls it — so
  // pushing our own app_name would revert the operator's rename on every
  // release. `app_name` is documented-mandatory, so it is echoed, not ours.
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK Kiosk", release_labels: [STABLE_LABEL] }] },
    }),
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK Kiosk",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  await publish(INPUTS, d);

  const put = calls.find((c) => c.method === "PUT")!;
  expect(JSON.parse(String(put.body)).app_name).toBe("KISOK Kiosk");
});

it("reads the APK on a dry run too, so a wrong path fails before the real dispatch", async () => {
  // Dry run exists to prove a real dispatch would work. Skipping the read
  // moved a wrong --apk path's failure to the run that actually ships.
  const { fetchLike } = fakeFetch({ ...TOKEN_ROUTE });
  let read = false;
  const result = await publish(
    { ...INPUTS, dryRun: true },
    {
      fetch: fetchLike,
      readApk: async () => {
        read = true;
        throw new Error("ENOENT: no such file");
      },
      sleep: async () => {},
      log: () => {},
    },
  );

  expect(read).toBe(true);
  expect(result.ok).toBe(false);
});

it("reads App Details from the LABEL-SCOPED route, exactly as documented", async () => {
  // The Cloud contract is GET /apps/{app_id}/labels/{release_label_id}.
  // A regression to the unlabeled /apps/{app_id} route would leave this
  // request unrouted, and fakeFetch throws on an unregistered path.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: {
        apps: [
          {
            app_id: 55,
            app_name: "KISOK",
            release_labels: [
              BETA_LABEL,
              { release_label_id: 12, release_label_type: 1, release_label_name: "Live" },
            ],
          },
        ],
      },
    }),
    "GET /api/v1/mdm/apps/55/labels/12": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        platform_type: 2,
        bundle_identifier: "com.kisok.kiosk",
      },
    }),
    "PUT /api/v1/mdm/apps/55/labels/12": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result).toMatchObject({ ok: true, action: "updated" });
  // The label came from the LISTING by type, not from the name "Stable".
  const detail = calls.find((c) => c.method === "GET" && c.url.includes("/labels/"));
  expect(new URL(detail!.url).pathname).toBe("/api/v1/mdm/apps/55/labels/12");
  // and nothing ever asked for the unlabeled route
  expect(calls.some((c) => new URL(c.url).pathname === "/api/v1/mdm/apps/55")).toBe(false);
});

it("in dry-run mode with the app PRESENT it reads label-scoped details but never writes", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }] },
    }),
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        platform_type: 2,
        bundle_identifier: "com.kisok.kiosk",
      },
    }),
  });

  const result = await publish({ ...INPUTS, dryRun: true }, d);

  expect(result.ok).toBe(true);
  expect(calls.some((c) => new URL(c.url).pathname === "/api/v1/mdm/apps/55/labels/9")).toBe(true);
  // Nothing was uploaded and nothing was written.
  expect(calls.some((c) => c.url.includes("/emsapi/"))).toBe(false);
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

// ---------------------------------------------------------------------------
// The hardened wire contract: native FormData upload, and lossless ids.
// ---------------------------------------------------------------------------

const CREATE_ROUTE = "POST /api/v1/mdm/apps";

it("uploads the APK as native FormData with exactly one 'file' field, never a hand-built body", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, body: { app_id: 101 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  const upload = calls.find((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"))!;
  expect(upload.body).toBeInstanceOf(FormData);
  const form = upload.body as FormData;

  const fieldNames: string[] = [];
  form.forEach((_value, key) => fieldNames.push(key));
  expect(fieldNames).toEqual(["file"]);
  expect(form.has("fileName")).toBe(false);

  const value = form.get("file");
  expect(value).toBeInstanceOf(Blob);
  const file = value as File;
  expect(file.type).toBe("application/vnd.android.package-archive");
  expect(file.name).toBe("app-release.apk");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});

it("sends the documented upload headers, with no manual Content-Type and no X-Customer", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, body: { app_id: 101 } }),
  });

  await publish(INPUTS, d);

  const upload = calls.find((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"))!;
  expect(upload.headers.Authorization).toBe("Zoho-oauthtoken 1000.accesstokenfixture.value");
  expect(upload.headers.Accept).toBe("application/json");
  expect(upload.headers.Module).toBe("MDM_APP_MGMT");

  const lowerKeys = Object.keys(upload.headers).map((k) => k.toLowerCase());
  expect(lowerKeys).not.toContain("content-type");
  expect(lowerKeys).not.toContain("x-customer");
});

it("sends the CREATE body with exactly app_name, app_type, app_file — no extra fields", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, body: { app_id: 101 } }),
  });

  await publish(INPUTS, d);

  const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))!;
  expect(create.body).toBe('{"app_name":"KISOK","app_type":2,"app_file":42}');
});

it("serialises a large fileID in the CREATE body as an unquoted JSON long, never a string", async () => {
  // ManageEngine's own upload response already carries fileID as a JSON
  // STRING, so this needs no raw-text fixture — the regression is purely
  // about how app_file is re-serialised on the way OUT.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({
      status: 200,
      body: { fileID: "9007199254741056", fileStatus: 2 },
    }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, body: { app_id: 101 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))!;
  expect(create.body).toContain('"app_file":9007199254741056');
  expect(create.body).not.toContain('"app_file":"9007199254741056"');
});

it("serialises a large fileID in the UPDATE body the same way, alongside force_update_in_label", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK", release_labels: [STABLE_LABEL] }] },
    }),
    "GET /api/v1/mdm/apps/55/labels/9": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
      },
    }),
    "POST /emsapi/files": () => ({
      status: 200,
      body: { fileID: "9007199254741056", fileStatus: 2 },
    }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  const put = calls.find((c) => c.method === "PUT")!;
  expect(put.body).toContain('"app_file":9007199254741056');
  expect(put.body).not.toContain('"app_file":"9007199254741056"');
  expect(put.body).toContain('"force_update_in_label":true');
});

it("recovers an UNQUOTED app_id above Number.MAX_SAFE_INTEGER exactly, from the raw response text", async () => {
  // A JS numeric literal this large is already rounded by the time it could
  // be JSON.stringify'd from a test fixture object, so this is the one case
  // that needs the raw-text route: it is the server's wire bytes, not a JS
  // value that passed through a JS number first.
  const { deps: d } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, rawText: '{"app_id":9007199254741080}' }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // The rounded double (9007199254741080 as a Number) must never appear in
  // place of the exact source digits.
  expect(result.detail).toContain("app_id 9007199254741080");
});

it("fails closed rather than mutate when a returned id above MAX_SAFE_INTEGER has no recoverable decimal source", async () => {
  // A fractional literal is valid JSON but not a plain decimal integer, so
  // the source-recovery guard refuses it — this stands in for "the runtime
  // handed back an already-rounded unsafe number with no way to prove what it
  // should have been", which must never be used to construct a request.
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 42, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, rawText: '{"app_id":9007199254741080.0}' }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toContain("app_id");
  expect(result.failure).toContain("failing closed");
  // Nothing was retried or mutated further off the unusable id.
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});

it("polls file status with the fileID as a STRING, never renumbered", async () => {
  let statusCalls = 0;
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({
      status: 200,
      body: { fileID: "9007199254741056", fileStatus: 1 },
    }),
    "POST /emsapi/fileupload/status": () => {
      statusCalls += 1;
      return {
        status: 200,
        body: {
          response: [
            {
              file_id: "9007199254741056",
              file_availability_status: statusCalls < 2 ? 1 : 2,
            },
          ],
        },
      };
    },
    "GET /api/v1/mdm/apps": () => ({ status: 200, body: { apps: [] } }),
    [CREATE_ROUTE]: () => ({ status: 200, body: { app_id: 101 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(true);
  const status = calls.find(
    (c) => c.method === "POST" && c.url.endsWith("/emsapi/fileupload/status"),
  )!;
  expect(status.body).toBe('{"fileIDs":["9007199254741056"]}');
});
