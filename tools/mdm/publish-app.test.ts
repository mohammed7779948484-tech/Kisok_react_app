import {
  buildTokenExchangeBody,
  collectSecretValues,
  matchAppByPackage,
  redactSecrets,
  resolveDataCentre,
  resolveInputs,
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

describe("matchAppByPackage", () => {
  it("matches on package identity, not on the display name", () => {
    const match = matchAppByPackage(
      [
        { app_id: 1, app_name: "KISOK", identifier: "com.other.app" },
        { app_id: 2, app_name: "Something else", identifier: "com.kisok.kiosk" },
      ],
      "com.kisok.kiosk",
      "KISOK",
    );

    expect(match).toEqual({ status: "found", appId: 2 });
  });

  it("accepts any of the package-identity field spellings the API may use", () => {
    for (const key of ["identifier", "bundle_id", "package_name", "app_package_name"]) {
      expect(
        matchAppByPackage(
          [{ app_id: 9, app_name: "KISOK", [key]: "com.kisok.kiosk" }],
          "com.kisok.kiosk",
          "KISOK",
        ),
      ).toEqual({ status: "found", appId: 9 });
    }
  });

  it("reports absent when nothing carries that package — the create path", () => {
    expect(
      matchAppByPackage(
        [{ app_id: 1, app_name: "Other", identifier: "com.other" }],
        "com.kisok.kiosk",
        "KISOK",
      ),
    ).toEqual({ status: "absent" });
  });

  it("refuses to update an entry that only matches by NAME, with no package identity", () => {
    const match = matchAppByPackage([{ app_id: 4, app_name: "KISOK" }], "com.kisok.kiosk", "KISOK");

    expect(match.status).toBe("ambiguous");
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
    const key = Object.keys(routes).find((route) => {
      const [routeMethod, routePath] = route.split(" ");
      return routeMethod === method && url.includes(routePath!);
    });
    if (!key) throw new Error(`unexpected ${method} request: ${url}`);
    const { status, body } = routes[key]!();
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchLike, calls };
}

const TOKEN_ROUTE = {
  "POST /oauth/v2/token": () => ({ status: 200, body: { access_token: "at" } }),
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
        body: { apps: [{ app_id: 55, app_name: "KISOK", identifier: "com.kisok.kiosk" }] },
      };
    },
    "PUT /api/v1/mdm/apps": () => ({ status: 200, body: { status: "ok" } }),
  });

  const result = await publish(INPUTS, d);

  expect(listed).toBe(true);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.action).toBe("updated");
  expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/api/v1/mdm/apps/55"))).toBe(true);
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

it("fails closed, without uploading, when the file upload reports the documented FAILED status", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 3 } }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  expect(calls.some((c) => c.url.includes("/api/v1/mdm/apps"))).toBe(false);
});

it("refuses to touch an app that matches only by display name", async () => {
  const { deps: d, calls } = deps({
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: 7, fileStatus: 2 } }),
    "GET /api/v1/mdm/apps": () => ({
      status: 200,
      body: { apps: [{ app_id: 3, app_name: "KISOK" }] },
    }),
  });

  const result = await publish(INPUTS, d);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toMatch(/package/i);
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

it("never puts a credential in a failure message", async () => {
  const { deps: d } = deps({
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
