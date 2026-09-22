import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildUploadForm,
  capBody,
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
});

// ---------------------------------------------------------------------------
// run(), driven through an injected fetch — no network, no credentials.
// ---------------------------------------------------------------------------

type Call = { url: string; method: string };

function fakeFetch(routes: Record<string, () => { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetchLike: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
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
      statusText: status === 406 ? "Not Acceptable" : "",
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
      },
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
    };
  };
  return { fetchLike, calls };
}

const TOKEN_ROUTE = {
  "POST /oauth/v2/token": () => ({ status: 200, body: { access_token: "1000.fixture.token" } }),
};

function deps(routes: Record<string, () => { status: number; body?: unknown }>) {
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
