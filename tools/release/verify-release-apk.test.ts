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
 *
 * The certificate-digest fixtures follow the AOSP ApkSignerTool output
 * contract (research R6): every signer block prints "<label> certificate DN:
 * <subjectDN>", "<label> certificate SHA-256 digest: <hex>" (lowercase
 * contiguous hex over the DER certificate) and "<label> key SHA-256 digest:
 * <hex>"; <label> is "Signer #1" (or the legacy multi-space spelling), a
 * rotated-block "Signer (minSdkVersion=…, maxSdkVersion=…)" or "Source Stamp
 * Signer" — so the pin parses on the line SUFFIX, never the label shape. The
 * pinned value itself is PUBLIC (anyone holding the shipped APK can compute
 * it); keytool prints the same digest UPPERCASE with colons.
 */

import {
  checkBundleEntry,
  checkCertificateDigests,
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

/**
 * The pinned upload-certificate SHA-256. PUBLIC by construction (research
 * R6): it is the fingerprint anyone holding the shipped APK computes with
 * `apksigner verify --print-certs`; keytool prints the same digest UPPERCASE
 * with colons, and both spellings must verify.
 */
const pinnedCertSha256 = "4c1f22cb1a9e33f0a3c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1";

/** keytool's spelling of the same digest: uppercase hex bytes joined with colons. */
const pinnedCertSha256ColonHex = (pinnedCertSha256.toUpperCase().match(/../g) ?? []).join(":");

/** A DIFFERENT, equally plausible release-certificate digest — the IR-06 hole. */
const otherCertSha256 = "bb0705ef2c9d41a86e5f0c3b9d2a8e74c1f6b3d08a4e2f7c5b1d9a6ef3c07d84";

/** The debug key's digest — a debug-signed APK never carries the upload key's digest. */
const debugCertSha256 = "5f0a3c9d8e1b4a72d6c3f0951a7e2b84c0d9f3a648b1e5c72f8a0d936b4e7c15";

const releaseDn = "CN=Kisok Upload, OU=Mobile, O=Kisok, C=DE";
const debugDn = "CN=Android Debug, O=Android, C=US";

/**
 * One apksigner --print-certs signer block in the AOSP-documented shape
 * (research R6): DN, certificate SHA-256 digest, certificate SHA-1 digest
 * (T17-R2 — printed unconditionally, must never satisfy the SHA-256 pin) and
 * the key SHA-256 digest line (also real output, also never a certificate
 * digest).
 */
const SHA1_DIGEST = "3f9a1c8b2d7e6f5a4b0c9d8e7f6a5b4c3d2e1f0a";

/** The signer's key digest — a real 64-hex SHA-256, but of the KEY, never the certificate. */
const KEY_SHA256_DIGEST = "9f2b0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a";

const signerCerts = (label: string, dn: string, certSha256: string) =>
  `${label} certificate DN: ${dn}\n` +
  `${label} certificate SHA-256 digest: ${certSha256}\n` +
  `${label} certificate SHA-1 digest: ${SHA1_DIGEST}\n` +
  `${label} key SHA-256 digest: ${KEY_SHA256_DIGEST}`;

const releaseCerts = signerCerts("Signer      #1", releaseDn, pinnedCertSha256);
const debugCerts = signerCerts("Signer      #1", debugDn, debugCertSha256);

/** A plausible non-debug identity signed by a DIFFERENT key — the IR-06 hole: the DN alone cannot catch this. */
const wrongKeyCerts = signerCerts("Signer      #1", releaseDn, otherCertSha256);

/** A single signer reported with the v3.1 rotated-block label shape. */
const rotatedLabelCerts = signerCerts(
  "Signer (minSdkVersion=24, maxSdkVersion=34)",
  releaseDn,
  pinnedCertSha256,
);

/** A rotated lineage: TWO different certificate digests, the pinned one among them. */
const rotatedLineageCerts =
  signerCerts("Signer #1", releaseDn, pinnedCertSha256) +
  "\n" +
  signerCerts("Signer (minSdkVersion=24, maxSdkVersion=34)", releaseDn, otherCertSha256);

/**
 * sha256sum's WHOLE output line ("<hex>  -") — the paste the workflow's own
 * documented `keytool -exportcert … | sha256sum` procedure invites (T17-R1).
 */
const sha256sumPaste = `${pinnedCertSha256}  -`;

/** A source-stamp block appended to the signer output: a second certificate digest. */
const stampCerts = (stampSha256: string) =>
  `${releaseCerts}\nSource Stamp certificate SHA-256 digest: ${stampSha256}`;

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
  expectedCertSha256: pinnedCertSha256,
  aapt2: "aapt2",
  apksigner: "apksigner",
  unzip: "unzip",
});

const fullEnv = (): Record<string, string | undefined> => ({
  APK_PATH: "dist/app-release.apk",
  EXPECTED_PACKAGE_NAME: expected.packageName,
  EXPECTED_VERSION_CODE: expected.versionCode,
  EXPECTED_VERSION_NAME: expected.versionName,
  EXPECTED_CERT_SHA256: pinnedCertSha256,
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
    ["EXPECTED_CERT_SHA256", { EXPECTED_CERT_SHA256: undefined }],
    ["EXPECTED_CERT_SHA256", { EXPECTED_CERT_SHA256: "" }],
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
// Signing-certificate SHA-256 pinning (IR-06 — the DN is not identity)
// ---------------------------------------------------------------------------

describe("signing certificate SHA-256 pinning", () => {
  it("the pinned digest on the legacy multi-space signer line passes", () => {
    expect(checkCertificateDigests(releaseCerts, pinnedCertSha256)).toEqual([]);
  });

  it("the pinned digest on a single-space 'Signer #1' line passes", () => {
    const singleSpace = signerCerts("Signer #1", releaseDn, pinnedCertSha256);

    expect(checkCertificateDigests(singleSpace, pinnedCertSha256)).toEqual([]);
  });

  it("the pinned digest on a rotated-block label line passes (suffix-anchored parsing)", () => {
    expect(checkCertificateDigests(rotatedLabelCerts, pinnedCertSha256)).toEqual([]);
  });

  it("a keytool-style pinned value (uppercase, colons) matches the lowercase contiguous output", () => {
    expect(checkCertificateDigests(releaseCerts, pinnedCertSha256ColonHex)).toEqual([]);
  });

  it("the signer's KEY SHA-256 digest line is never parsed as the certificate digest", () => {
    // The pin is a SHAPE-VALID 64-hex value equal to the key line's digest —
    // so only the parse can discriminate: had the key line been parsed as a
    // certificate digest, actual would equal the pin and pass. It must
    // mismatch instead.
    const failures = checkCertificateDigests(releaseCerts, KEY_SHA256_DIGEST);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("SHA-256 mismatch");
    }
  });

  it("the same certificate printed on two block shapes is ONE signer, not multi-signer", () => {
    const twice =
      signerCerts("Signer #1", releaseDn, pinnedCertSha256) +
      "\n" +
      signerCerts("Signer (minSdkVersion=24, maxSdkVersion=34)", releaseDn, pinnedCertSha256);

    expect(checkCertificateDigests(twice, pinnedCertSha256)).toEqual([]);
  });

  it("a different digest behind a plausible non-debug DN is the IR-06 mismatch, quoting both prefixes", () => {
    const failures = checkCertificateDigests(wrongKeyCerts, pinnedCertSha256);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("SHA-256 mismatch");
      expect(failure).toContain(pinnedCertSha256.slice(0, 12));
      expect(failure).toContain(otherCertSha256.slice(0, 12));
    }
  });

  it("two different digests — even with the pinned one present — fail closed as multi-signer", () => {
    const failures = checkCertificateDigests(rotatedLineageCerts, pinnedCertSha256);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("more than one signing certificate");
      expect(failure).toContain("single pinned upload key");
    }
  });

  it.each([
    ["empty apksigner output", ""],
    [
      "a DN line but no certificate SHA-256 digest line",
      `Signer      #1 certificate DN: ${releaseDn}\n`,
    ],
  ])("%s fails closed — the digest was never checked", (_label, output) => {
    const failures = checkCertificateDigests(output, pinnedCertSha256);

    expect(failures).toHaveLength(1);
    for (const failure of failures) {
      expect(failure).toContain("no certificate SHA-256 digest");
    }
  });

  it("the IR-06 hole: a plausible non-debug DN with a DIFFERENT digest fails the verification", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(wrongKeyCerts),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures.join("\n")).toContain("SHA-256 mismatch");
  });

  it("a debug-signed APK fails on BOTH the debug DN and the digest pin", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(debugCerts),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.join("\n")).toContain("CN=Android Debug");
    expect(result.failures.join("\n")).toContain("SHA-256 mismatch");
  });

  it("the pinned digest in a rotated-block label shape passes the full verification", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(rotatedLabelCerts),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("a keytool-style pinned value (uppercase, colons) verifies the lowercase output digest", async () => {
    const { executor } = createFakeExecutor(greenResponses());
    const inputs = { ...goodInputs(), expectedCertSha256: pinnedCertSha256ColonHex };

    const result = await verifyApk(inputs, executor);

    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("multi-signer output fails closed even when the pinned digest is among the signers", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(rotatedLineageCerts),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("more than one signing certificate");
  });

  it("main: the IR-06 hole — a plausible non-debug identity with the WRONG digest exits non-zero", async () => {
    const errors: string[] = [];
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(wrongKeyCerts),
      unzip: success(apkListing(true)),
    });

    const exitCode = await main(argv, fullEnv(), {
      executor,
      errorSink: (line) => errors.push(line),
    });

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("SHA-256 mismatch");
    expect(errors.join("\n")).toContain(pinnedCertSha256.slice(0, 12));
    expect(errors.join("\n")).toContain(otherCertSha256.slice(0, 12));
  });

  it("main: a keytool-style pinned value (uppercase, colons) exits 0", async () => {
    const output: string[] = [];
    const { executor } = createFakeExecutor(greenResponses());

    const exitCode = await main(
      argv,
      { ...fullEnv(), EXPECTED_CERT_SHA256: pinnedCertSha256ColonHex },
      {
        executor,
        errorSink: () => {},
        outputSink: (line) => output.push(line),
      },
    );

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("APK verification passed");
  });

  it("main: --cert-sha256 overrides the environment (a wrong flag value fails the pin)", async () => {
    const errors: string[] = [];

    const exitCode = await main([...argv, "--cert-sha256", otherCertSha256], fullEnv(), {
      executor: createFakeExecutor(greenResponses()).executor,
      errorSink: (line) => errors.push(line),
    });

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("SHA-256 mismatch");
    expect(errors.join("\n")).toContain(otherCertSha256.slice(0, 12));
  });

  // -------------------------------------------------------------------------
  // Pinned-value SHAPE (T17-R1): the workflow's documented computation
  // procedure (`keytool -exportcert … | sha256sum`) invites pasting
  // sha256sum's whole line — after normalization the trailing "-" survives
  // and a raw comparison would surface as an unactionable mismatch whose
  // two 12-char prefixes are IDENTICAL. A malformed pin gets its own named
  // failure instead.
  // -------------------------------------------------------------------------

  it.each([
    ["a sha256sum-style paste ('<hex>  -')", sha256sumPaste],
    ["a 0x-prefixed pin", `0x${pinnedCertSha256}`],
    ["an MD5-length (32-hex) pin", pinnedCertSha256.slice(0, 32)],
  ])(
    "%s is the named shape failure, not the unactionable identical-prefix mismatch",
    (_label, pin) => {
      const failures = checkCertificateDigests(releaseCerts, pin);

      expect(failures).toHaveLength(1);
      expect(failures.join("\n")).toContain("EXPECTED_CERT_SHA256 is not a 64-hex-digit");
      // NOT the generic mismatch (which quotes byte-for-byte) — its prefixes
      // would be identical and say nothing.
      expect(failures.join("\n")).not.toContain("byte-for-byte");
    },
  );

  it("the shape failure echoes the normalized value so the trailing '-' is visible", () => {
    const failures = checkCertificateDigests(releaseCerts, sha256sumPaste);

    expect(failures).toHaveLength(1);
    expect(failures.join("\n")).toContain(`${pinnedCertSha256}-`);
  });

  it("main: a sha256sum-style paste in EXPECTED_CERT_SHA256 exits non-zero with the shape failure", async () => {
    const errors: string[] = [];
    const { executor } = createFakeExecutor(greenResponses());

    const exitCode = await main(
      argv,
      { ...fullEnv(), EXPECTED_CERT_SHA256: sha256sumPaste },
      {
        executor,
        errorSink: (line) => errors.push(line),
      },
    );

    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("EXPECTED_CERT_SHA256 is not a 64-hex-digit");
    expect(errors.join("\n")).not.toContain("byte-for-byte");
  });

  // -------------------------------------------------------------------------
  // Probed-safe parse rows (T17-R2): three more output shapes the AOSP
  // contract documents. Each pins behaviour that must survive future edits
  // of the parse.
  // -------------------------------------------------------------------------

  it("the signer's certificate SHA-1 digest line is ignored by the SHA-256 pin", () => {
    // The standard signerCerts fixture (every test above) now carries the
    // AOSP-documented SHA-1 digest line; the pin still verifies.
    expect(checkCertificateDigests(releaseCerts, pinnedCertSha256)).toEqual([]);
  });

  it("output carrying only a SHA-1 digest line has no SHA-256 digest to check", () => {
    const sha1Only =
      `Signer      #1 certificate DN: ${releaseDn}\n` +
      `Signer      #1 certificate SHA-1 digest: ${SHA1_DIGEST}\n`;
    const failures = checkCertificateDigests(sha1Only, pinnedCertSha256);

    expect(failures).toHaveLength(1);
    expect(failures.join("\n")).toContain("no certificate SHA-256 digest");
  });

  it("an uppercase colon-separated digest on the ACTUAL side matches a lowercase contiguous pin", () => {
    const colonHexActual = signerCerts("Signer      #1", releaseDn, pinnedCertSha256ColonHex);

    expect(checkCertificateDigests(colonHexActual, pinnedCertSha256)).toEqual([]);
  });

  it("an uppercase colon-separated ACTUAL digest passes the full verification", async () => {
    const { executor } = createFakeExecutor({
      aapt2: success(goodBadging),
      apksigner: success(signerCerts("Signer      #1", releaseDn, pinnedCertSha256ColonHex)),
      unzip: success(apkListing(true)),
    });

    const result = await verifyApk(goodInputs(), executor);

    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("a source-stamp block with a DISTINCT digest fails closed as multi-signer", () => {
    const failures = checkCertificateDigests(stampCerts(otherCertSha256), pinnedCertSha256);

    expect(failures).toHaveLength(1);
    expect(failures.join("\n")).toContain("more than one signing certificate");
  });

  it("a source-stamp block carrying the SAME digest is one certificate, not multi-signer", () => {
    expect(checkCertificateDigests(stampCerts(pinnedCertSha256), pinnedCertSha256)).toEqual([]);
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
    expect(summary).toContain("pinned upload certificate");
    expect(summary).toContain(`SHA-256 ${pinnedCertSha256.slice(0, 12)}`);
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
      "EXPECTED_CERT_SHA256",
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
      "EXPECTED_CERT_SHA256",
      "AAPT2_PATH",
    ]) {
      expect(usage).toContain(name);
    }
  });
});
