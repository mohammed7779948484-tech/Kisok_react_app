/**
 * verify-release-apk.ts — the release pipeline's verify-before-delivery gate.
 *
 * Run by the android-release workflow after the signed APK exists:
 *
 *     node tools/release/verify-release-apk.ts \
 *       --apk dist/app-release.apk \
 *       --package com.kisok.kiosk --version-code 7 --version-name 1.2.0
 *
 * …or with the same values from the environment: APK_PATH,
 * EXPECTED_PACKAGE_NAME, EXPECTED_VERSION_CODE, EXPECTED_VERSION_NAME (flags
 * override the environment). The expected package name, versionCode and
 * versionName come from the EVALUATED app config — the workflow evaluates
 * app.config.ts and passes the values in. This script deliberately does NOT
 * import expo/jiti, or anything else from the repository or npm: node-builtin
 * imports only, so it runs under Node 24 native type-stripping (the plan's
 * probed constraint: jest cannot import .mjs, so repo tools are TypeScript
 * executed with plain `node`).
 *
 * Checks (AC-08): `aapt2 dump badging` → package/versionCode/versionName match
 * the expectations (package identity com.kisok.kiosk — AC-01);
 * `apksigner verify --print-certs` → a signing certificate is present and is
 * NOT the Android debug certificate; `unzip -l` → the APK embeds
 * assets/index.android.bundle.
 *
 * Fail-closed (AC-07): every required input is checked for missing/empty
 * BEFORE any command runs, and a failure exits non-zero with a message NAMING
 * the variable/flag. Nothing is guessed and no default is invented for a
 * required value. Tool binaries are resolved from --flag / env / PATH; a
 * binary that cannot be found is a named failure, never a guess.
 *
 * Exit status: 0 = every check passed; non-zero = any failure, with each
 * failure printed to stderr as it is found. There are no secrets in this
 * script, but the discipline holds anyway: env-sourced inputs are named, and
 * only their non-secret values (paths, package names, versions) are ever
 * printed.
 *
 * Structure: parsing, validation and comparison are pure exported functions;
 * command execution goes through the injectable CommandExecutor — the CLI
 * wires an execFile-based implementation, the colocated jest test injects
 * fakes and never runs a real tool.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The three identity fields asserted from `aapt2 dump badging` (AC-08/AC-01). */
export interface BadgingInfo {
  packageName: string;
  versionCode: string;
  versionName: string;
}

/** Expectations handed in by the caller (the workflow, from the evaluated app config). */
export interface ExpectedApkIdentity {
  packageName: string;
  versionCode: string;
  versionName: string;
}

export type BadgingParseResult = (BadgingInfo & { ok: true }) | { ok: false; reason: string };

/** One executed command's outcome — the injectable execution seam. */
export interface CommandOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** true when the binary could not be found (ENOENT) — mapped to a named failure. */
  notFound?: boolean;
}

export interface CommandExecutor {
  run(command: string, args: readonly string[]): Promise<CommandOutcome>;
}

/** Every value the script needs. All strings; required inputs have no defaults. */
export interface VerifyInputs {
  apkPath: string;
  expectedPackageName: string;
  expectedVersionCode: string;
  expectedVersionName: string;
  aapt2: string;
  apksigner: string;
  unzip: string;
}

export type InputResolution =
  | { ok: true; inputs: VerifyInputs }
  | { ok: false; failures: string[] };

export interface VerificationResult {
  ok: boolean;
  failures: string[];
}

export interface MainOptions {
  executor?: CommandExecutor;
  errorSink?: (line: string) => void;
  outputSink?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Pure parsing, validation and comparison
// ---------------------------------------------------------------------------

const PACKAGE_LINE_PATTERN =
  /^package:\s*name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/;

export function parseBadging(badgingOutput: string): BadgingParseResult {
  const packageLine = badgingOutput.split(/\r?\n/).find((line) => line.startsWith("package:"));
  if (packageLine === undefined) {
    return {
      ok: false,
      reason: 'aapt2 badging output is malformed: no "package:" line was found',
    };
  }
  const match = PACKAGE_LINE_PATTERN.exec(packageLine);
  if (match === null) {
    return {
      ok: false,
      reason:
        'aapt2 badging output is malformed: the "package:" line does not match the expected ' +
        `"package: name='…' versionCode='…' versionName='…'" format — got "${packageLine.trim()}"`,
    };
  }
  const [, packageName = "", versionCode = "", versionName = ""] = match;
  return { ok: true, packageName, versionCode, versionName };
}

export function compareBadging(actual: BadgingInfo, expected: ExpectedApkIdentity): string[] {
  const failures: string[] = [];
  if (actual.packageName !== expected.packageName) {
    failures.push(
      `badging mismatch — package: expected '${expected.packageName}', actual '${actual.packageName}'`,
    );
  }
  if (actual.versionCode !== expected.versionCode) {
    failures.push(
      `badging mismatch — versionCode: expected '${expected.versionCode}', actual '${actual.versionCode}'`,
    );
  }
  if (actual.versionName !== expected.versionName) {
    failures.push(
      `badging mismatch — versionName: expected '${expected.versionName}', actual '${actual.versionName}'`,
    );
  }
  return failures;
}

const DEBUG_CERTIFICATE_MARKER = "CN=Android Debug";

export function checkSigningCertificates(apksignerOutput: string): string[] {
  const distinguishedNames = apksignerOutput.split(/\r?\n/).flatMap((line) => {
    const match = /certificate DN:\s*(.*)$/.exec(line);
    const name = match === null ? "" : (match[1] ?? "").trim();
    return name === "" ? [] : [name];
  });
  if (distinguishedNames.length === 0) {
    return [
      "no signing certificate found in the apksigner output — a release APK must be signed " +
        "with the upload/release certificate",
    ];
  }
  if (distinguishedNames.some((name) => name.includes(DEBUG_CERTIFICATE_MARKER))) {
    return [
      `the APK is signed with the Android debug certificate (${DEBUG_CERTIFICATE_MARKER}) — ` +
        "the release build must be signed with the upload/release certificate, never the debug one",
    ];
  }
  return [];
}

export const BUNDLE_ENTRY = "assets/index.android.bundle";

export function checkBundleEntry(apkListing: string): string[] {
  const entryListed = apkListing
    .split(/\r?\n/)
    .some((line) => line.trim().split(/\s+/).includes(BUNDLE_ENTRY));
  if (entryListed) {
    return [];
  }
  return [`the APK does not contain ${BUNDLE_ENTRY} — the embedded JavaScript bundle is missing`];
}

// ---------------------------------------------------------------------------
// Command execution — the injectable seam (CLI wires execFile; tests fake it)
// ---------------------------------------------------------------------------

export function createNodeExecutor(): CommandExecutor {
  return {
    run: (command, args) =>
      new Promise<CommandOutcome>((resolve) => {
        execFile(
          command,
          [...args],
          { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error === null) {
              resolve({ stdout, stderr, exitCode: 0 });
              return;
            }
            const code = (error as { code?: unknown }).code;
            if (typeof code === "number") {
              resolve({ stdout, stderr, exitCode: code });
              return;
            }
            resolve({
              stdout,
              stderr: stderr === "" ? error.message : stderr,
              exitCode: 127,
              notFound: code === "ENOENT",
            });
          },
        );
      }),
  };
}

// ---------------------------------------------------------------------------
// Input resolution (fail-closed: every message names the variable/flag)
// ---------------------------------------------------------------------------

interface InputSpec {
  flag: string;
  envName: string;
  inputKey: keyof VerifyInputs;
  required: boolean;
  valueHint: string;
}

const INPUT_SPECS: InputSpec[] = [
  {
    flag: "--apk",
    envName: "APK_PATH",
    inputKey: "apkPath",
    required: true,
    valueHint: "<path>",
  },
  {
    flag: "--package",
    envName: "EXPECTED_PACKAGE_NAME",
    inputKey: "expectedPackageName",
    required: true,
    valueHint: "<name>",
  },
  {
    flag: "--version-code",
    envName: "EXPECTED_VERSION_CODE",
    inputKey: "expectedVersionCode",
    required: true,
    valueHint: "<code>",
  },
  {
    flag: "--version-name",
    envName: "EXPECTED_VERSION_NAME",
    inputKey: "expectedVersionName",
    required: true,
    valueHint: "<name>",
  },
  {
    flag: "--aapt2",
    envName: "AAPT2_PATH",
    inputKey: "aapt2",
    required: false,
    valueHint: "<path>",
  },
  {
    flag: "--apksigner",
    envName: "APKSIGNER_PATH",
    inputKey: "apksigner",
    required: false,
    valueHint: "<path>",
  },
  {
    flag: "--unzip",
    envName: "UNZIP_PATH",
    inputKey: "unzip",
    required: false,
    valueHint: "<path>",
  },
];

const KNOWN_FLAGS = INPUT_SPECS.map((spec) => spec.flag).join(", ");

interface ParsedFlags {
  values: Map<string, string>;
  problems: string[];
}

function parseFlags(args: readonly string[]): ParsedFlags {
  const values = new Map<string, string>();
  const problems: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") continue;
    if (!arg.startsWith("--")) {
      problems.push(`unexpected argument "${arg}" — only --flag <value> inputs are accepted`);
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flagName = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
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
  return { values, problems };
}

export function resolveInputs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): InputResolution {
  const flags = parseFlags(argv.slice(2));
  const failures: string[] = [...flags.problems];
  const inputs: VerifyInputs = {
    apkPath: "",
    expectedPackageName: "",
    expectedVersionCode: "",
    expectedVersionName: "",
    aapt2: "aapt2",
    apksigner: "apksigner",
    unzip: "unzip",
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
      continue; // Optional tool path: keep the default bare name (resolved via PATH).
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

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, inputs };
}

// ---------------------------------------------------------------------------
// Verification (each phase records and emits failures as they are found)
// ---------------------------------------------------------------------------

function firstLine(text: string): string {
  const line =
    text
      .trim()
      .split(/\r?\n/)
      .find((candidate) => candidate !== "") ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}...` : line;
}

export async function verifyApk(
  inputs: VerifyInputs,
  executor: CommandExecutor,
  emit: (failure: string) => void = () => {},
): Promise<VerificationResult> {
  const failures: string[] = [];
  const record = (failure: string): void => {
    failures.push(failure);
    emit(failure);
  };

  // 1. Package identity and versions from aapt2 badging (AC-08/AC-01).
  const badging = await executor.run(inputs.aapt2, ["dump", "badging", inputs.apkPath]);
  if (badging.notFound === true) {
    record(
      "AAPT2_PATH: aapt2 was not found — set AAPT2_PATH to the aapt2 binary path, " +
        "or add its directory to PATH",
    );
  } else if (badging.exitCode !== 0) {
    record(
      `aapt2 dump badging failed with exit code ${badging.exitCode}: ${firstLine(badging.stderr)}`,
    );
  } else {
    const parsed = parseBadging(badging.stdout);
    if (parsed.ok) {
      for (const failure of compareBadging(parsed, {
        packageName: inputs.expectedPackageName,
        versionCode: inputs.expectedVersionCode,
        versionName: inputs.expectedVersionName,
      })) {
        record(failure);
      }
    } else {
      record(parsed.reason);
    }
  }

  // 2. Signing certificate — present and NOT the debug certificate (AC-08).
  const certificates = await executor.run(inputs.apksigner, [
    "verify",
    "--print-certs",
    inputs.apkPath,
  ]);
  if (certificates.notFound === true) {
    record(
      "APKSIGNER_PATH: apksigner was not found — set APKSIGNER_PATH to the apksigner binary path, " +
        "or add its directory to PATH",
    );
  } else if (certificates.exitCode !== 0) {
    record(
      `apksigner verify failed with exit code ${certificates.exitCode}: ` +
        `${firstLine(certificates.stderr)} — the APK signature does not verify`,
    );
  } else {
    for (const failure of checkSigningCertificates(certificates.stdout)) {
      record(failure);
    }
  }

  // 3. Embedded JS bundle (AC-08).
  const listing = await executor.run(inputs.unzip, ["-l", inputs.apkPath]);
  if (listing.notFound === true) {
    record(
      "UNZIP_PATH: unzip was not found — set UNZIP_PATH to the unzip binary path, " +
        "or add its directory to PATH",
    );
  } else if (listing.exitCode !== 0) {
    record(
      `unzip -l failed with exit code ${listing.exitCode}: ${firstLine(listing.stderr)} — ` +
        "the APK could not be listed as a zip archive",
    );
  } else {
    for (const failure of checkBundleEntry(listing.stdout)) {
      record(failure);
    }
  }

  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// CLI wiring
// ---------------------------------------------------------------------------

const USAGE = `verify-release-apk — verify a built release APK before delivery (fail-closed).

Checks, in order:
  1. aapt2 dump badging          package name, versionCode and versionName must
                                 match the expectations (which come from the
                                 EVALUATED app config — this script never
                                 imports expo/jiti)
  2. apksigner verify --print-certs  a signing certificate must be present and
                                 must NOT be the Android debug certificate
  3. unzip -l                    assets/index.android.bundle must be embedded

Required inputs (flag, or the environment variable; missing or empty is a
hard error naming the variable):
  --apk <path>                   APK_PATH
  --package <name>               EXPECTED_PACKAGE_NAME
  --version-code <code>          EXPECTED_VERSION_CODE
  --version-name <name>          EXPECTED_VERSION_NAME

Tool paths (optional; default: the bare command name, resolved via PATH — a
binary that cannot be found is a named failure, never a guess):
  --aapt2 <path>                 AAPT2_PATH
  --apksigner <path>             APKSIGNER_PATH
  --unzip <path>                 UNZIP_PATH

Flags override the environment. Exit status: 0 when every check passes,
non-zero on any failure, with each failure printed to stderr as it is found.`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
    for (const failure of resolution.failures) {
      errorSink(failure);
    }
    return 1;
  }

  const executor = options.executor ?? createNodeExecutor();
  try {
    const result = await verifyApk(resolution.inputs, executor, errorSink);
    if (result.ok) {
      outputSink(
        `APK verification passed: package ${resolution.inputs.expectedPackageName}, ` +
          `versionName ${resolution.inputs.expectedVersionName}, ` +
          `versionCode ${resolution.inputs.expectedVersionCode}, ` +
          "signed with a non-debug certificate, JS bundle present.",
      );
      return 0;
    }
    return 1;
  } catch (error) {
    errorSink(`unexpected failure while verifying the APK: ${errorMessage(error)}`);
    return 1;
  }
}

const SCRIPT_FILENAME = "verify-release-apk.ts";

/**
 * Direct-run detection. import.meta.url is NOT usable here: the colocated
 * jest test imports this module through babel's commonjs transform, which
 * cannot parse import.meta (probed — the transform itself fails). argv[1] is
 * this script's path under `node tools/release/verify-release-apk.ts` and the
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
      process.stderr.write(`unexpected failure: ${errorMessage(error)}\n`);
      process.exitCode = 1;
    }
  })();
}
