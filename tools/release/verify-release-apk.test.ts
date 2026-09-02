/**
 * Tests for tools/release/verify-release-apk.ts — the release pipeline's
 * verify-before-delivery gate (AC-08; fail-closed inputs per AC-07).
 *
 * The executor is a FAKE in every test: calls are recorded, outcomes are
 * scripted. No test ever runs a real aapt2/apksigner/unzip.
 *
 * Expectations are derived from an evaluated-config fixture — the shape the
 * workflow obtains by evaluating app.config.ts. The script itself never
 * imports expo/jiti, so the fixture stands in for that evaluation.
 */

import {
  checkBundleEntry,
  checkSigningCertificates,
  compareBadging,
  main,
  parseBadging,
  resolveInputs,
  verifyApk,
} from "./verify-release-apk";
import type {
  BadgingInfo,
  CommandExecutor,
  CommandOutcome,
  VerifyInputs,
} from "./verify-release-apk";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Evaluated app-config fixture: what the workflow reads out of app.config.ts. */
const evaluatedAppConfig = {
  name: "KISOK",
  version: "1.2.0",
  android: { package: "com.kisok.kiosk", versionCode: 7 },
} as const;

const expected = {
  packageName: evaluatedAppConfig.android.package,
  versionName: evaluatedAppConfig.version,
  versionCode: String(evaluatedAppConfig.android.versionCode),
};

/** aapt2 dump badging: the real first line appends platform fields after versionName. */
const badgingOutput = (packageName: string, versionCode: string, versionName: string) =>
  `package: name='${packageName}' versionCode='${versionCode}' versionName='${versionName}'` +
  " platformVersionCode='34' platformVersionName='14'" +
  "\nsdkVersion:'24'\ntargetSdkVersion:'34'\napplication-label:'KISOK'";

const goodBadging = badgingOutput("com.kisok.kiosk", "7", "1.2.0");

/** apksigner verify --print-certs output for a single signer. */
const certsOutput = (dn: string) =>
  `Signer      #1 certificate DN: ${dn}\n` +
  "Signer      #1 certificate SHA-256 digest: 4c1f22cb1a9e33f0a3c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1\n" +
  "Signer      #1 key SHA-256 digest: 9f2b0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0";

const releaseCerts = certsOutput("CN=Kisok Upload, OU=Mobile, O=Kisok, C=DE");
const debugCerts = certsOutput("CN=Android Debug, O=Android, C=US");

/** unzip -l output (Length / Date / Time / Name columns). */
const apkListing = (withBundle: boolean) =>
  "Archive:  app-release.apk\n" +
  "  Length      Date    Time    Name\n" +
  "---------  ---------- -----   ---------\n" +
  (withBundle ? "   1234567  01-01-1980 00:00   assets/index.android.bundle\n" : "") +
  "       512  01-01-1980 00:00   res/xml/kiosk_restrictions.xml\n" +
  "---------                     -------";

// ---------------------------------------------------------------------------
// Fake executor (recorded calls; zero real command execution)
// ---------------------------------------------------------------------------

interface RecordedCall {
  command: string;
  args: readonly string[];
}

function createFakeExecutor(responses: Record<string, CommandOutcome>): {
  executor: CommandExecutor;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const executor: CommandExecutor = {
    run: async (command, args) => {
      calls.push({ command, args });
      const outcome = responses[command];
      if (outcome === undefined) {
        throw new Error(`fake executor has no scripted response for "${command}"`);
      }
      return outcome;
    },
  };
  return { executor, calls };
}

const success = (stdout: string): CommandOutcome => ({ stdout, stderr: "", exitCode: 0 });

function greenResponses(): Record<string, CommandOutcome> {
  return {
    aapt2: success(goodBadging),
    apksigner: success(releaseCerts),
    unzip: success(apkListing(true)),
  };
}

const goodInputs = (): VerifyInputs => ({
  apkPath: "dist/app-release.apk",
  expectedPackageName: expected.packageName,
  expectedVersionCode: expected.versionCode,
  expectedVersionName: expected.versionName,
  aapt2: "aapt2",
  apksigner: "apksigner",
  unzip: "unzip",
});

const fullEnv = (): Record<string, string | undefined> => ({
  APK_PATH: "dist/app-release.apk",
  EXPECTED_PACKAGE_NAME: expected.packageName,
  EXPECTED_VERSION_CODE: expected.versionCode,
  EXPECTED_VERSION_NAME: expected.versionName,
});

const argv = ["node", "tools/release/verify-release-apk.ts"];

// ---------------------------------------------------------------------------
// Fail-closed input validation (Supporting AC-07)
// ---------------------------------------------------------------------------

describe("input validation fails closed", () => {
  const missingOrEmpty: [string, Record<string, string | undefined>][] = [
    ["APK_PATH", { APK_PATH: undefined }],
    ["APK_PATH", { APK_PATH: "" }],
    ["EXPECTED_PACKAGE_NAME", { EXPECTED_PACKAGE_NAME: undefined }],
    ["EXPECTED_PACKAGE_NAME", { EXPECTED_PACKAGE_NAME: "" }],
    ["EXPECTED_VERSION_CODE", { EXPECTED_VERSION_CODE: undefined }],
    ["EXPECTED_VERSION_CODE", { EXPECTED_VERSION_CODE: "" }],
    ["EXPECTED_VERSION_NAME", { EXPECTED_VERSION_NAME: undefined }],
    ["EXPECTED_VERSION_NAME", { EXPECTED_VERSION_NAME: "" }],
  ];

  it.each(missingOrEmpty)(
    "%s missing or empty exits non-zero naming the variable, before any command runs",
    async (name, override) => {
      const errors: string[] = [];
      const { executor, calls } = createFakeExecutor({});
      const exitCode = await main(
        argv,
        { ...fullEnv(), ...override },
        {
          executor,
          errorSink: (line) => errors.push(line),
        },
      );

      expect(exitCode).not.toBe(0);
      expect(errors.join("\n")).toContain(`${name} is empty`);
      expect(calls).toHaveLength(0);
    },
  );

  it("an explicitly empty tool path fails closed naming it and runs nothing", async () => {
    const errors: string[] = [];
    const { executor, calls } = createFakeExecutor({});
    const exitCode = await main(
      argv,
      { ...fullEnv(), AAPT2_PATH: "" },
      {
        executor,
        errorSink: (line) => errors.push(line),
      },
    );

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("AAPT2_PATH is empty");
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Badging parsing
// ---------------------------------------------------------------------------

describe("aapt2 badging parsing", () => {
  it("parses package name, versionCode and versionName from aapt2 output", () => {
    expect(parseBadging(goodBadging)).toEqual({
      ok: true,
      packageName: "com.kisok.kiosk",
      versionCode: "7",
      versionName: "1.2.0",
    });
  });

  it("output without a package line is a precise failure, not a crash", () => {
    const result = parseBadging("sdkVersion:'24'\napplication-label:'KISOK'");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('no "package:" line');
    }
  });

  it("a package line missing its version fields is a precise failure echoing the line", () => {
    const result = parseBadging("package: name='com.kisok.kiosk'\nsdkVersion:'24'");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("malformed");
      expect(result.reason).toContain("package: name='com.kisok.kiosk'");
    }
  });
});

// ---------------------------------------------------------------------------
// Version matching (expected vs actual)
// ---------------------------------------------------------------------------

describe("badging comparison", () => {
  const actual: BadgingInfo = {
    packageName: "com.kisok.kiosk",
    versionCode: "7",
    versionName: "1.2.0",
  };

  it("matching badging produces no failures", () => {
    expect(compareBadging(actual, expected)).toEqual([]);
  });

  const mismatches: [string, BadgingInfo, string, string][] = [
    ["package", { ...actual, packageName: "com.other.app" }, "com.kisok.kiosk", "com.other.app"],
    ["versionCode", { ...actual, versionCode: "6" }, "7", "6"],
    ["versionName", { ...actual, versionName: "1.1.0" }, "1.2.0", "1.1.0"],
  ];

  it.each(mismatches)("%s mismatch fails with expected-vs-actual", (field, badging, exp, act) => {
    const failures = compareBadging(badging, expected);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain(field);
      expect(failure).toContain(`expected '${exp}'`);
      expect(failure).toContain(`actual '${act}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// Signing certificate verification
// ---------------------------------------------------------------------------

describe("signing certificate verification", () => {
  it("a release certificate passes", () => {
    expect(checkSigningCertificates(releaseCerts)).toEqual([]);
  });

  it("the Android debug certificate is rejected with the release-cert message", () => {
    const failures = checkSigningCertificates(debugCerts);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("CN=Android Debug");
      expect(failure).toContain("upload/release certificate");
      expect(failure).toContain("never the debug one");
    }
  });

  it.each([
    ["empty apksigner output", ""],
    ["apksigner output with no certificate DN line", "Verifying\n"],
  ])("%s fails as an unsigned APK", (_label, output) => {
    const failures = checkSigningCertificates(output);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("no signing certificate");
    }
  });
});

// ---------------------------------------------------------------------------
// Embedded JS bundle presence
// ---------------------------------------------------------------------------

describe("embedded JS bundle presence", () => {
  it("a listing containing assets/index.android.bundle passes", () => {
    expect(checkBundleEntry(apkListing(true))).toEqual([]);
  });

  it("a listing without the bundle fails naming the expected entry", () => {
    const failures = checkBundleEntry(apkListing(false));

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("assets/index.android.bundle");
    }
  });
});

// ---------------------------------------------------------------------------
// Orchestration against the fake executor
// ---------------------------------------------------------------------------

describe("verifyApk orchestration", () => {
  it("a green APK passes and runs exactly the three documented commands", async () => {
    const { executor, calls } = createFakeExecutor(greenResponses());

    const result = await verifyApk(goodInputs(), executor);

    expect(result).toEqual({ ok: true, failures: [] });
    expect(calls.map((call) => [call.command, ...call.args])).toEqual([
      ["aapt2", "dump", "badging", "dist/app-release.apk"],
      ["apksigner", "verify", "--print-certs", "dist/app-release.apk"],
      ["unzip", "-l", "dist/app-release.apk"],
    ]);
  });

  it("emits every failure as it is found, in check order", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(badgingOutput("com.kisok.kiosk", "6", "1.2.0")),
      apksigner: success(releaseCerts),
      unzip: success(apkListing(false)),
    });
    const emitted: string[] = [];

    const result = await verifyApk(goodInputs(), executor, (line) => emitted.push(line));

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(emitted).toEqual(result.failures);
    expect(result.failures[0]).toContain("versionCode");
    expect(result.failures[1]).toContain("assets/index.android.bundle");
  });

  it("a missing aapt2 binary fails closed naming AAPT2_PATH", async () => {
    const { executor } = createFakeExecutor({
      aapt2: { stdout: "", stderr: "spawn aapt2 ENOENT", exitCode: 127, notFound: true },
      apksigner: success(releaseCerts),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("AAPT2_PATH");
  });

  it("a non-zero apksigner exit fails the verification with its stderr", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: { stdout: "", stderr: "DOES NOT VERIFY\nERROR: missing signer", exitCode: 1 },
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("apksigner verify failed");
    expect(result.failures.join("\n")).toContain("DOES NOT VERIFY");
  });
});

// ---------------------------------------------------------------------------
// Input resolution and the CLI exit-code contract
// ---------------------------------------------------------------------------

describe("input resolution", () => {
  it("resolves all inputs from the environment when no flags are given", () => {
    expect(resolveInputs(argv, fullEnv())).toEqual({ ok: true, inputs: goodInputs() });
  });

  it("accepts --flag=value form, and flags override the environment", () => {
    const result = resolveInputs(
      ["node", "s.ts", "--apk=/tmp/app-release.apk", "--package", "com.other.app"],
      fullEnv(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inputs.apkPath).toBe("/tmp/app-release.apk");
      expect(result.inputs.expectedPackageName).toBe("com.other.app");
    }
  });
});

describe("main (CLI exit-code contract)", () => {
  it("exits 0 with no failure output when every check passes", async () => {
    const { executor } = createFakeExecutor(greenResponses());
    const errors: string[] = [];
    const output: string[] = [];

    const exitCode = await main(argv, fullEnv(), {
      executor,
      errorSink: (line) => errors.push(line),
      outputSink: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    // The success summary is the script's one positive output — pin it, and
    // never let it reach the real stdout (zero console output in the suite).
    expect(output).toHaveLength(1);
    const summary = output.join("");
    expect(summary).toContain("APK verification passed");
    expect(summary).toContain("package com.kisok.kiosk");
    expect(summary).toContain("versionName 1.2.0");
    expect(summary).toContain("versionCode 7");
    expect(summary).toContain("non-debug certificate");
    expect(summary).toContain("JS bundle present");
  });

  it("with no inputs at all it exits non-zero naming every required variable", async () => {
    const errors: string[] = [];
    const { executor, calls } = createFakeExecutor({});

    const exitCode = await main(argv, {}, { executor, errorSink: (line) => errors.push(line) });

    expect(exitCode).not.toBe(0);
    const output = errors.join("\n");
    for (const name of [
      "APK_PATH",
      "EXPECTED_PACKAGE_NAME",
      "EXPECTED_VERSION_CODE",
      "EXPECTED_VERSION_NAME",
    ]) {
      expect(output).toContain(`${name} is empty`);
    }
    expect(calls).toHaveLength(0);
  });

  it("unknown flags are rejected instead of ignored", async () => {
    const errors: string[] = [];

    const exitCode = await main([...argv, "--wat"], fullEnv(), {
      executor: createFakeExecutor(greenResponses()).executor,
      errorSink: (line) => errors.push(line),
    });

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("--wat");
  });

  it("a flag given without a value is rejected naming the flag, before any command runs", async () => {
    const errors: string[] = [];
    const { executor, calls } = createFakeExecutor(greenResponses());

    const exitCode = await main([...argv, "--apk"], fullEnv(), {
      executor,
      errorSink: (line) => errors.push(line),
    });

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("--apk requires a value");
    expect(calls).toHaveLength(0);
  });

  it("flag values flow into the verification (a wrong --package fails)", async () => {
    const errors: string[] = [];

    const exitCode = await main([...argv, "--package", "com.other.app"], fullEnv(), {
      executor: createFakeExecutor(greenResponses()).executor,
      errorSink: (line) => errors.push(line),
    });

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("expected 'com.other.app'");
  });

  it("--help prints usage naming the input mechanisms and exits 0", async () => {
    const output: string[] = [];

    const exitCode = await main(
      [...argv, "--help"],
      {},
      {
        executor: createFakeExecutor({}).executor,
        errorSink: () => {},
        outputSink: (line) => output.push(line),
      },
    );

    expect(exitCode).toBe(0);
    const usage = output.join("\n");
    for (const name of [
      "APK_PATH",
      "EXPECTED_PACKAGE_NAME",
      "EXPECTED_VERSION_CODE",
      "EXPECTED_VERSION_NAME",
      "AAPT2_PATH",
    ]) {
      expect(usage).toContain(name);
    }
  });
});
