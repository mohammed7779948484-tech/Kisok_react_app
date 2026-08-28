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
  /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|getaddrinfo|Host not in allowlist|network (?:error|timeout)|request to .* failed|certificate/i;

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

if (NETWORK_FAILURE.test(output)) {
  console.warn(
    "\nexpo-doctor could not reach Expo, so its result says nothing about this project. " +
      "Treating as inconclusive rather than failing.\n",
  );
  summarise(
    "Expo doctor",
    "**Inconclusive** — could not reach Expo's compatibility service. This does not " +
      "indicate a problem with the project.\n\n```\n" +
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
