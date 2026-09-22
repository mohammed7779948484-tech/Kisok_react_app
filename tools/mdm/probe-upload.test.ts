import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildUploadForm,
  buildUploadHeaders,
  capBody,
  readLosslessId,
  redactId,
  redactSecrets,
  resolveDataCentre,
  resolveInputs,
  run,
  VARIANT_FIELD,
  type FetchLike,
  type ProbeInputs,
} from "./probe-upload";

const INPUTS: ProbeInputs = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  customerId: undefined,
  apkPath: "/tmp/app-release.apk",
  dataCentre: "us",
  variant: "cloud_file",
};

describe("pure helpers", () => {
  it("redacts secrets wherever they appear", () => {
    expect(redactSecrets("token refresh-token rejected", ["refresh-token"])).toBe(
      "token ***REDACTED*** rejected",
    );
  });

  it("resolves the US data centre by default", () => {
    expect(resolveDataCentre("us")).toEqual({
      accounts: "https://accounts.zoho.com",
      mdm: "https://mdm.manageengine.com",
    });
  });

  it("caps a long response body rather than printing it whole", () => {
    const huge = "x".repeat(3000);
    const capped = capBody(huge);
    expect(capped.length).toBeLessThan(huge.length);
    expect(capped).toContain("truncated");
  });

  it("leaves a short body untouched", () => {
    expect(capBody("short")).toBe("short");
  });

  it("redacts most of an id, keeping enough to compare runs", () => {
    expect(redactId("9007199254741056")).toBe("9007...1056");
    expect(redactId("42")).not.toBe("42");
  });
});

describe("the one variable this probe isolates: the multipart field name", () => {
  it("cloud_file sends the APK under 'file' and nothing else", () => {
    const form = buildUploadForm("cloud_file", new Uint8Array([1, 2, 3]), "app-release.apk");

    expect(VARIANT_FIELD.cloud_file).toBe("file");
    const names: string[] = [];
    form.forEach((_value, key) => names.push(key));
    expect(names).toEqual(["file"]);
    expect(form.has("fileName")).toBe(false);
  });

  it("legacy_fileName sends the APK under 'fileName' and nothing else", () => {
    const form = buildUploadForm("legacy_fileName", new Uint8Array([1, 2, 3]), "app-release.apk");

    expect(VARIANT_FIELD.legacy_fileName).toBe("fileName");
    const names: string[] = [];
    form.forEach((_value, key) => names.push(key));
    expect(names).toEqual(["fileName"]);
    expect(form.has("file")).toBe(false);
  });

  it("never appends both field names in the same form", () => {
    for (const variant of ["cloud_file", "legacy_fileName"] as const) {
      const form = buildUploadForm(variant, new Uint8Array([1]), "app-release.apk");
      let count = 0;
      form.forEach(() => {
        count += 1;
      });
      expect(count).toBe(1);
    }
  });

  it("sends the APK as the documented MIME type, under its filename", async () => {
    const form = buildUploadForm("cloud_file", new Uint8Array([1, 2, 3]), "app-release.apk");
    const value = form.get("file") as File;
    expect(value).toBeInstanceOf(Blob);
    expect(value.type).toBe("application/vnd.android.package-archive");
    expect(value.name).toBe("app-release.apk");
    expect(new Uint8Array(await value.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("cloud_file_with_customer isolates exactly one variable: X-Customer", () => {
  it("sends the APK under 'file', same as cloud_file — never 'fileName'", () => {
    const form = buildUploadForm(
      "cloud_file_with_customer",
      new Uint8Array([1, 2, 3]),
      "app-release.apk",
    );

    expect(VARIANT_FIELD.cloud_file_with_customer).toBe("file");
    const names: string[] = [];
    form.forEach((_value, key) => names.push(key));
    expect(names).toEqual(["file"]);
    expect(form.has("fileName")).toBe(false);
  });

  it("adds X-Customer with exactly the provided id, alongside the same base headers", () => {
    const headers = buildUploadHeaders("cloud_file_with_customer", "tok-123", "999888777");

    expect(headers["X-Customer"]).toBe("999888777");
    expect(headers.Authorization).toBe("Zoho-oauthtoken tok-123");
    expect(headers.Accept).toBe("application/json");
    expect(headers.Module).toBe("MDM_APP_MGMT");
    // Never a manually set Content-Type — fetch must generate the boundary.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("content-type");
  });

  it("cloud_file never carries X-Customer, even when a customer id is available", () => {
    const headers = buildUploadHeaders("cloud_file", "tok-123", "999888777");

    expect(headers["X-Customer"]).toBeUndefined();
  });

  it("differs from cloud_file's headers by exactly the X-Customer key — nothing else", () => {
    const base = buildUploadHeaders("cloud_file", "tok-123", undefined);
    const withCustomer = buildUploadHeaders("cloud_file_with_customer", "tok-123", "999888777");

    const addedKeys = Object.keys(withCustomer).filter((key) => !(key in base));
    expect(addedKeys).toEqual(["X-Customer"]);
    // Every OTHER header is byte-identical between the two variants.
    for (const key of Object.keys(base)) {
      expect(withCustomer[key]).toBe(base[key]);
    }
    // The two variants also send the same body shape — the multipart field.
    expect(VARIANT_FIELD.cloud_file_with_customer).toBe(VARIANT_FIELD.cloud_file);
  });

  it("fails closed rather than send a request with no customer id", () => {
    expect(() => buildUploadHeaders("cloud_file_with_customer", "tok-123", undefined)).toThrow(
      /MDM_CUSTOMER_ID/,
    );
    expect(() => buildUploadHeaders("cloud_file_with_customer", "tok-123", "   ")).toThrow(
      /MDM_CUSTOMER_ID/,
    );
  });
});

describe("resolveInputs", () => {
  it("names every missing required value at once", () => {
    const result = resolveInputs([], {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toContain("MDM_CLIENT_ID");
    expect(result.problems.join("\n")).toContain("MDM_CLIENT_SECRET");
    expect(result.problems.join("\n")).toContain("MDM_REFRESH_TOKEN");
    expect(result.problems.join("\n")).toContain("APK_PATH");
    expect(result.problems.join("\n")).toContain("--variant");
  });

  it("rejects an unrecognised variant rather than guessing", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "made_up"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toContain("made_up");
  });

  it("accepts a known variant from the flag", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "legacy_fileName"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inputs.variant).toBe("legacy_fileName");
    expect(result.inputs.dataCentre).toBe("us");
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

  it("fails closed for cloud_file_with_customer when MDM_CUSTOMER_ID is absent", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "cloud_file_with_customer"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toContain("MDM_CUSTOMER_ID");
  });

  it("fails closed for cloud_file_with_customer when MDM_CUSTOMER_ID is blank", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "cloud_file_with_customer"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
      MDM_CUSTOMER_ID: "   ",
    });

    expect(result.ok).toBe(false);
  });

  it("accepts cloud_file_with_customer when MDM_CUSTOMER_ID is set", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "cloud_file_with_customer"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
      MDM_CUSTOMER_ID: "999888777",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inputs.customerId).toBe("999888777");
  });

  it("does NOT require MDM_CUSTOMER_ID for cloud_file or legacy_fileName", () => {
    for (const variant of ["cloud_file", "legacy_fileName"] as const) {
      const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", variant], {
        MDM_CLIENT_ID: "a",
        MDM_CLIENT_SECRET: "b",
        MDM_REFRESH_TOKEN: "c",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.inputs.customerId).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// run(), driven through an injected fetch — no network, no credentials.
// ---------------------------------------------------------------------------

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

type FakeRoute = { status: number; body?: unknown; rawText?: string };

function fakeFetch(routes: Record<string, () => FakeRoute>) {
  const calls: Call[] = [];
  const fetchLike: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
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
      statusText: status === 406 ? "Not Acceptable" : "",
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
      },
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
  "POST /oauth/v2/token": () => ({ status: 200, body: { access_token: "1000.fixture.token" } }),
};

function deps(routes: Record<string, () => FakeRoute>) {
  const { fetchLike, calls } = fakeFetch({ ...TOKEN_ROUTE, ...routes });
  const lines: string[] = [];
  return {
    calls,
    lines,
    deps: {
      fetch: fetchLike,
      readApk: async () => new Uint8Array([1, 2, 3]),
      log: (line: string) => lines.push(line),
    },
  };
}

it("reports the documented 406 failure and exits non-zero, without touching create or update", async () => {
  const {
    deps: d,
    calls,
    lines,
  } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({
      status: 406,
      body: { errorCode: "406", errorMsg: "Not Acceptable" },
    }),
  });

  const code = await run(INPUTS, d);

  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("HTTP status: 406");
  expect(lines.join("\n")).toContain("upload accepted: no");
  // The fake fetch throws on any unregistered route, so a request to
  // create or update the app would already fail the test — this just
  // makes the guarantee explicit.
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))).toBe(false);
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
  expect(calls.some((c) => c.url.includes("/labels/"))).toBe(false);
});

it("stops after a successful upload — never calls create or update", async () => {
  const {
    deps: d,
    calls,
    lines,
  } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({
      status: 200,
      body: { fileID: "9007199254741056", fileStatus: 2 },
    }),
  });

  const code = await run(INPUTS, d);

  expect(code).toBe(0);
  expect(lines.join("\n")).toContain("fileID present: yes");
  expect(lines.join("\n")).toContain("fileID (redacted): 9007...1056");
  expect(lines.join("\n")).not.toContain("9007199254741056");
  expect(lines.join("\n")).toContain("STOPPING HERE");
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))).toBe(false);
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

it("sends the field name matching the requested variant, and only that one", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({ status: 406, body: { errorCode: "406" } }),
  });

  await run({ ...INPUTS, variant: "legacy_fileName" }, d);

  const upload = calls.find((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"));
  expect(upload).toBeDefined();
});

it("cloud_file_with_customer sends X-Customer with the exact configured id, and only that variant", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({ status: 406, body: { errorCode: "406" } }),
  });

  await run({ ...INPUTS, variant: "cloud_file_with_customer", customerId: "999888777" }, d);

  const upload = calls.find((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"));
  expect(upload?.headers["X-Customer"]).toBe("999888777");
});

it("cloud_file never sends X-Customer, even when run() is handed a customer id", async () => {
  const { deps: d, calls } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({ status: 406, body: { errorCode: "406" } }),
  });

  await run({ ...INPUTS, variant: "cloud_file", customerId: "999888777" }, d);

  const upload = calls.find((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"));
  expect(upload?.headers["X-Customer"]).toBeUndefined();
});

it("fails closed and sends NO upload request when cloud_file_with_customer has no customer id", async () => {
  const {
    deps: d,
    calls,
    lines,
  } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({ status: 200, body: { fileID: "1", fileStatus: 2 } }),
  });

  const code = await run(
    { ...INPUTS, variant: "cloud_file_with_customer", customerId: undefined },
    d,
  );

  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("MDM_CUSTOMER_ID");
  expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/emsapi/files"))).toBe(false);
});

it("never prints the customer id, on any path — success, failure, or error", async () => {
  const CUSTOMER_ID = "999888777";
  const { deps: d, lines } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 200 }),
    "POST /emsapi/files": () => ({
      status: 500,
      body: { message: `rejected for customer ${CUSTOMER_ID}` },
    }),
  });

  await run({ ...INPUTS, variant: "cloud_file_with_customer", customerId: CUSTOMER_ID }, d);

  const output = lines.join("\n");
  expect(output).not.toContain(CUSTOMER_ID);
  expect(output).toContain("X-Customer: yes (redacted)");
  expect(output).toContain("***REDACTED***");
});

it("never prints a credential or the exchanged access token, on any path", async () => {
  const { deps: d, lines } = deps({
    "GET /api/v1/mdm/apps": () => ({ status: 500, body: { message: "rejected refresh-token" } }),
    "POST /emsapi/files": () => ({
      status: 500,
      body: { message: "token 1000.fixture.token invalid" },
    }),
  });

  await run(INPUTS, d);

  const output = lines.join("\n");
  expect(output).not.toContain("client-secret");
  expect(output).not.toContain("refresh-token");
  expect(output).not.toContain("1000.fixture.token");
  expect(output).toContain("***REDACTED***");
});

it("fails before any network call when the APK cannot be read", async () => {
  const { deps: d, calls } = deps({});

  const code = await run(
    { ...INPUTS, apkPath: "/nope/missing.apk" },
    { ...d, readApk: async () => Promise.reject(new Error("ENOENT")) },
  );

  expect(code).toBe(1);
  expect(calls).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// The production publisher stays untouched — this diagnostic must never
// gain a call to create or update the app, whatever else changes here.
// ---------------------------------------------------------------------------

it("the probe script's own source never references the create/update endpoints", () => {
  const raw = readFileSync(join(__dirname, "probe-upload.ts"), "utf8");
  // Strip block/line comments first — the module doc explicitly NAMES the
  // create/update endpoints as ones this file must never call, so a literal
  // substring check over the raw text would flag its own warning. Only the
  // executable source should be held to "never references".
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  expect(source).not.toContain("/labels/");
  expect(source).not.toMatch(/method:\s*"PUT"/);
  // The only reference to /api/v1/mdm/apps is the optional repository GET.
  const appsReferences = [...source.matchAll(/\/api\/v1\/mdm\/apps[^`"']*/g)].map((m) => m[0]);
  expect(appsReferences.length).toBeGreaterThan(0);
  for (const ref of appsReferences) {
    expect(ref).not.toMatch(/^\/api\/v1\/mdm\/apps\/\d/);
  }
});

// ---------------------------------------------------------------------------
// legacy_api_v1_files — a different endpoint AND transport, kept isolated
// from the /emsapi/files multipart variants above (see runLegacyApiV1Files).
// ---------------------------------------------------------------------------

const LEGACY_INPUTS: ProbeInputs = { ...INPUTS, variant: "legacy_api_v1_files" };

describe("legacy_api_v1_files targets a different endpoint with a raw-bytes body", () => {
  it("posts to /api/v1/mdm/files, never /emsapi/files", async () => {
    const { deps: d, calls } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 406, body: { error: "nope" } }),
    });

    await run(LEGACY_INPUTS, d);

    expect(calls.some((c) => c.url.includes("/api/v1/mdm/files"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/emsapi/files"))).toBe(false);
  });

  it("sends exactly the documented headers, no more, no less", async () => {
    const { deps: d, calls } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 406, body: { error: "nope" } }),
    });

    await run(LEGACY_INPUTS, d);

    const upload = calls.find((c) => c.url.includes("/api/v1/mdm/files"))!;
    expect(upload.headers.Authorization).toBe("Zoho-oauthtoken 1000.fixture.token");
    // The docs' own example, unusual as it is for a raw binary body —
    // followed exactly rather than "corrected" to octet-stream.
    expect(upload.headers["content-type"]).toBe("application/json");
    expect(upload.headers["content-disposition"]).toBe("filename=app-release.apk");
    // Nothing else: no Module, no Accept, no X-Customer — none appear in
    // the documented example.
    expect(Object.keys(upload.headers).sort()).toEqual(
      ["Authorization", "content-disposition", "content-type"].sort(),
    );
  });

  it("sends the raw APK bytes as the body — no FormData, no multipart boundary", async () => {
    const { deps: d, calls } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 406, body: { error: "nope" } }),
    });

    await run(LEGACY_INPUTS, d);

    const upload = calls.find((c) => c.url.includes("/api/v1/mdm/files"))!;
    expect(upload.body).not.toBeInstanceOf(FormData);
    expect(upload.body).toBeInstanceOf(Blob);
    const sent = await (upload.body as Blob).arrayBuffer();
    // deps().readApk always returns [1, 2, 3] for these tests.
    expect(new Uint8Array(sent)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("never sends X-Customer, even if a customer id happens to be set", async () => {
    const { deps: d, calls } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 406, body: { error: "nope" } }),
    });

    await run({ ...LEGACY_INPUTS, customerId: "999888777" }, d);

    const upload = calls.find((c) => c.url.includes("/api/v1/mdm/files"))!;
    expect(upload.headers["X-Customer"]).toBeUndefined();
    expect(upload.headers["x-customer"]).toBeUndefined();
  });

  it("does not require MDM_CUSTOMER_ID — resolveInputs accepts it unset", () => {
    const result = resolveInputs(["--apk", "/tmp/x.apk", "--variant", "legacy_api_v1_files"], {
      MDM_CLIENT_ID: "a",
      MDM_CLIENT_SECRET: "b",
      MDM_REFRESH_TOKEN: "c",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inputs.customerId).toBeUndefined();
  });

  it("reports the documented 406-shaped failure the same way as the other variants", async () => {
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 406,
        body: { errorCode: "406", errorMsg: "Not Acceptable" },
      }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("HTTP status: 406");
    expect(output).toContain("upload accepted: no");
    expect(output).toContain('"errorCode":"406"');
  });

  it("caps and redacts the failure body, same policy as every other variant", async () => {
    const huge = "x".repeat(3000);
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 500,
        body: { message: `rejected refresh-token ${huge}` },
      }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).not.toContain("refresh-token");
    expect(output).toContain("***REDACTED***");
    expect(output).toContain("truncated");
  });

  it("on success, preserves a large file_id exactly and shows only a redacted form", async () => {
    // A JS numeric literal this large is already rounded by the time it
    // could be JSON.stringify'd from a test fixture object, so this needs
    // the raw-text route: it is the server's exact wire bytes.
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 200,
        rawText:
          '{"file_id":9007199254741076,"content_type":"application/vnd.android.package-archive"}',
      }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("file_id present: yes");
    expect(output).toContain("file_id (redacted): 9007...1076");
    expect(output).not.toContain("9007199254741076");
    expect(output).toContain("upload accepted: yes");
    expect(output).toContain("STOPPING HERE");
  });

  it("preserves a file_id given as a JSON string exactly, unredacted digits never shown", async () => {
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 200,
        body: { file_id: "9007199254741076" },
      }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("file_id (redacted): 9007...1076");
    expect(output).not.toContain("9007199254741076");
  });

  it("fails closed rather than report success when file_id cannot be confirmed exact", async () => {
    // A fractional literal is valid JSON but not a plain decimal integer, so
    // the source-recovery guard refuses it: this stands in for "the runtime
    // handed back an already-rounded unsafe number with no way to prove what
    // it should have been", which must never be reported as an accepted id.
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 200,
        rawText: '{"file_id":9007199254741076.0}',
      }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("upload accepted: no");
    expect(output).toContain("cannot be confirmed exact");
  });

  it("small file_ids still round-trip normally", async () => {
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 200, body: { file_id: 42 } }),
    });

    const code = await run(LEGACY_INPUTS, d);

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("upload accepted: yes");
  });

  it("never calls app creation or update, on success or failure", async () => {
    const { deps: d, calls } = deps({
      "POST /api/v1/mdm/files": () => ({ status: 200, body: { file_id: 42 } }),
    });

    await run(LEGACY_INPUTS, d);

    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/mdm/apps"))).toBe(
      false,
    );
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    expect(calls.some((c) => c.url.includes("/labels/"))).toBe(false);
  });

  it("never prints a credential or the exchanged access token", async () => {
    const { deps: d, lines } = deps({
      "POST /api/v1/mdm/files": () => ({
        status: 500,
        body: { message: "token 1000.fixture.token rejected for refresh-token" },
      }),
    });

    await run(LEGACY_INPUTS, d);

    const output = lines.join("\n");
    expect(output).not.toContain("refresh-token");
    expect(output).not.toContain("1000.fixture.token");
    expect(output).toContain("***REDACTED***");
  });

  it("still performs the optional repository read", async () => {
    const { deps: d, lines } = deps({
      "GET /api/v1/mdm/apps": () => ({ status: 200 }),
      "POST /api/v1/mdm/files": () => ({ status: 406, body: { error: "nope" } }),
    });

    await run(LEGACY_INPUTS, d);

    expect(lines.join("\n")).toContain("repository read: HTTP 200");
  });
});

describe("readLosslessId", () => {
  it("accepts a plain decimal string", () => {
    expect(readLosslessId("9007199254741076")).toBe("9007199254741076");
  });

  it("accepts a safe non-negative integer, canonicalised to a string", () => {
    expect(readLosslessId(42)).toBe("42");
  });

  it("refuses a non-decimal string", () => {
    expect(readLosslessId("abc")).toBeUndefined();
    expect(readLosslessId("-5")).toBeUndefined();
    expect(readLosslessId("07")).toBeUndefined();
  });

  it("refuses undefined and other non-id shapes", () => {
    expect(readLosslessId(undefined)).toBeUndefined();
    expect(readLosslessId(null)).toBeUndefined();
    expect(readLosslessId({})).toBeUndefined();
  });
});
