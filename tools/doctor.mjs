#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

/**
 * Run `expo-doctor` and decide whether its failure is the project's fault.
 *
 *     pnpm doctor
 *
 * expo-doctor compares installed versions against a compatibility manifest it
 * fetches from Expo, so it fails for two very different reasons:
 *
 *   - a REAL incompatibility in this project — which must fail the build, or the
 *     check is theatre; and
 *   - it could not reach Expo — which says nothing about the code, and must not
 *     block an otherwise correct PR.
 *
 * Hiding both behind an always-green job was the previous behaviour and it was
 * wrong: it would have silently swallowed a genuine SDK mismatch.
 */
const NETWORK_FAILURE =
  /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|getaddrinfo|Host not in|network (?:error|timeout)|request to .* failed|certificate|is not valid JSON|Unable to fetch compatibility data|unexpected server response/i;

/**
 * Checks that CANNOT run without reaching a remote service.
 *
 * A network error alone is not enough to excuse a failure: expo-doctor can fail
 * a real check and hit a flaky service in the same run, and excusing everything
 * because "network" appeared somewhere in the output is how a genuine SDK
 * mismatch gets swallowed. So a run is only inconclusive when EVERY failing
 * check is one of these AND the output shows a transport problem. Anything else
 * — a version mismatch, a bad config field — fails, as it should.
 */
const NETWORK_DEPENDENT_CHECKS = new Set([
  "Check Expo config (app.json/ app.config.js) schema",
  "Validate packages against React Native Directory package metadata",
]);

/** The checks expo-doctor reported as failed, taken from its `✖` lines. */
function failedChecks(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("✖"))
    .map((line) => line.replace(/^\s*✖\s*/, "").trim())
    .filter(Boolean);
}

const result = spawnSync("npx", ["--yes", "expo-doctor"], { encoding: "utf8" });
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

process.stdout.write(output);

function summarise(title, body) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  fs.appendFileSync(target, `### ${title}\n\n${body}\n`);
}

if (result.status === 0) {
  summarise("Expo doctor", "No issues reported.");
  process.exit(0);
}

const failed = failedChecks(output);
const onlyNetworkChecksFailed =
  failed.length > 0 && failed.every((check) => NETWORK_DEPENDENT_CHECKS.has(check));

if (NETWORK_FAILURE.test(output) && onlyNetworkChecksFailed) {
  console.warn(
    "\nexpo-doctor could not reach the services these checks depend on, so their result " +
      "says nothing about this project. Treating as inconclusive rather than failing.\n" +
      `Affected: ${failed.join("; ")}\n`,
  );
  summarise(
    "Expo doctor",
    "**Inconclusive** — could not reach Expo's compatibility services. This does not " +
      `indicate a problem with the project.\n\nAffected checks: ${failed.join("; ")}\n\n` +
      "```\n" +
      output.trim() +
      "\n```",
  );
  process.exit(0);
}

console.error(
  "\nexpo-doctor reported a real project issue. Fix it with `npx expo install --check`, " +
    "or record a deliberate exception in package.json under `expo.install.exclude`.\n",
);
summarise(
  "Expo doctor",
  "**Failed** — a genuine project issue.\n\n```\n" + output.trim() + "\n```",
);
process.exit(1);
