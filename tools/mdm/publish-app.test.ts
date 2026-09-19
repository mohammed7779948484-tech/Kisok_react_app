import {
  buildTokenExchangeBody,
  collectSecretValues,
  identifyApp,
  parseAppDetails,
  redactSecrets,
  resolveDataCentre,
  resolveInputs,
  isSafePathSegment,
  listedAppIds,
  selectReleaseLabel,
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

describe("identity — established from App Details, never from the listing", () => {
  it("offers EVERY listed entry for verification, regardless of display name", () => {
    // Filtering the listing by display name meant an app sitting under any
    // other name was never examined, so the walk concluded `absent` and
    // created a duplicate. The name selects nothing.
    expect(
      listedAppIds([
        { app_id: 1, app_name: "Something else" },
        { app_id: 2, app_name: "KISOK Kiosk" },
        { app_name: "no id" },
      ]),
    ).toEqual([1, 2]);
  });

  it("rejects an id that could retarget an authenticated request", () => {
    expect(isSafePathSegment(55)).toBe(true);
    expect(isSafePathSegment("55")).toBe(true);
    expect(isSafePathSegment("1/../../other")).toBe(false);
  });

  const DETAILS = {
    app_id: 55,
    app_name: "KISOK",
    app_type: 2,
    bundle_identifier: "com.kisok.kiosk",
    platform_type: 2,
    release_labels: [{ release_label_id: 9, release_label_name: "Stable", app_version: "1.0.0" }],
  };

  it("parses the documented App Details fields", () => {
    const details = parseAppDetails(DETAILS, 55);

    expect(details.bundleIdentifier).toBe("com.kisok.kiosk");
    expect(details.appType).toBe(2);
    expect(details.releaseLabels).toEqual([{ releaseLabelId: 9, releaseLabelName: "Stable" }]);
  });

  it("positively identifies our app by bundle_identifier and the Enterprise app_type", () => {
    expect(identifyApp(parseAppDetails(DETAILS, 55), "com.kisok.kiosk")).toEqual({ ok: true });
  });

  it("refuses an app whose bundle_identifier is a different package", () => {
    const other = parseAppDetails({ ...DETAILS, bundle_identifier: "com.other.app" }, 55);

    expect(identifyApp(other, "com.kisok.kiosk").ok).toBe(false);
  });

  it("refuses an app that carries NO bundle_identifier — absence is not identity", () => {
    const bare = parseAppDetails({ app_id: 55, app_name: "KISOK", app_type: 2 }, 55);

    expect(identifyApp(bare, "com.kisok.kiosk").ok).toBe(false);
  });

  it("refuses an app that is not the Enterprise app type", () => {
    const store = parseAppDetails({ ...DETAILS, app_type: 0 }, 55);

    expect(identifyApp(store, "com.kisok.kiosk").ok).toBe(false);
  });
});

describe("selectReleaseLabel", () => {
  it("uses the only label when there is exactly one", () => {
    const result = selectReleaseLabel([{ releaseLabelId: 9, releaseLabelName: "Stable" }], 55);

    expect(result).toEqual({ ok: true, label: { releaseLabelId: 9, releaseLabelName: "Stable" } });
  });

  it("prefers the Stable label when there are several", () => {
    const result = selectReleaseLabel(
      [
        { releaseLabelId: 8, releaseLabelName: "Beta" },
        { releaseLabelId: 9, releaseLabelName: "Stable" },
      ],
      55,
    );

    expect(result).toEqual({ ok: true, label: { releaseLabelId: 9, releaseLabelName: "Stable" } });
  });

  it("refuses to guess when there are several and none is Stable", () => {
    const result = selectReleaseLabel(
      [
        { releaseLabelId: 8, releaseLabelName: "Beta" },
        { releaseLabelId: 7, releaseLabelName: "Pilot" },
      ],
      55,
    );

    expect(result.ok).toBe(false);
  });

  it("refuses when the app carries no release labels at all", () => {
    expect(selectReleaseLabel([], 55).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The pipeline, driven through an injected fetch — no network, no credentials.
// ---------------------------------------------------------------------------

type Call = { url: string; method: string; body?: unknown; headers: Record<string, string> };

function fakeFetch(routes: Record<string, () => { status: number; body: unknown }>) {
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
    const { status, body } = routes[key]!();
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
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

function deps(routes: Record<string, () => { status: number; body: unknown }>) {
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
        body: { apps: [{ app_id: 55, app_name: "KISOK" }] },
      };
    },
    "GET /api/v1/mdm/apps/55": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
        release_labels: [{ release_label_id: 9, release_label_name: "Stable" }],
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
      body: { apps: [{ app_id: 3, app_name: "KISOK" }] },
    }),
    // Same display name, DIFFERENT package: a different app entirely.
    "GET /api/v1/mdm/apps/3": () => ({
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
              apps: [{ app_id: 1, app_name: "Other" }],
              metadata: { total_record_count: 2 },
            },
          }
        : {
            status: 200,
            body: {
              apps: [{ app_id: 55, app_name: "KISOK" }],
              metadata: { total_record_count: 2 },
            },
          };
    },
    "GET /api/v1/mdm/apps/55": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
        release_labels: [{ release_label_id: 9, release_label_name: "Stable" }],
      },
    }),
    "GET /api/v1/mdm/apps/1": () => ({
      status: 200,
      body: { app_id: 1, app_name: "Other", app_type: 2, bundle_identifier: "com.other" },
    }),
    "PUT /api/v1/mdm/apps/55/labels/9": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(result).toMatchObject({ ok: true, action: "updated" });
  const listings = calls.filter((c) => c.method === "GET" && /\/apps\?/.test(c.url));
  const detailReads = calls.filter((c) => c.method === "GET" && /\/apps\/55$/.test(c.url));
  expect(listings.length).toBe(2);
  expect(detailReads.length).toBe(1);
  expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("accepts a 2xx write with an empty body — the update already happened", async () => {
  const { deps: d } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 55, app_name: "KISOK" }] },
    }),
    "GET /api/v1/mdm/apps/55": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        platform_type: 2,
        release_labels: [{ release_label_id: 9, release_label_name: "Stable" }],
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
        apps: [{ app_id: 1, app_name: "Other" }],
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
      body: { apps: [{ app_id: 55, app_name: "KISOK Kiosk" }] },
    }),
    "GET /api/v1/mdm/apps/55": () => ({
      status: 200,
      body: {
        app_id: 55,
        app_name: "KISOK Kiosk",
        app_type: 2,
        bundle_identifier: "com.kisok.kiosk",
        release_labels: [{ release_label_id: 9, release_label_name: "Stable" }],
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
