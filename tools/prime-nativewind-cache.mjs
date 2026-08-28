#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Create NativeWind's CSS cache file before Metro builds its file map.
 *
 * Without this, the FIRST `expo export` after a fresh `pnpm install` fails with:
 *
 *   Failed to get the SHA-1 for:
 *   node_modules/react-native-css-interop/.cache/web.css
 *
 * NativeWind writes that file during the build, but Metro has already resolved
 * it by then and cannot hash a file that did not exist when the map was built.
 * A second run succeeds because the file is now on disk — which is why this only
 * ever bites CI and a freshly cloned checkout, and never a warm dev machine.
 *
 * Seeding an EMPTY file is safe: NativeWind overwrites it with the real CSS
 * during the build. Verified by comparing exports with a warm cache and with a
 * cold-but-seeded cache — both produce a byte-identical, identically-hashed
 * stylesheet.
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE_DIR = path.join(ROOT, "node_modules", "react-native-css-interop", ".cache");
const WEB_CSS = path.join(CACHE_DIR, "web.css");

if (!fs.existsSync(path.join(ROOT, "node_modules", "react-native-css-interop"))) {
  // NativeWind is not installed yet; nothing to prime and nothing to warn about.
  process.exit(0);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });

if (!fs.existsSync(WEB_CSS)) {
  fs.writeFileSync(WEB_CSS, "", "utf8");
  console.log("Primed NativeWind CSS cache for the first web bundle.");
}
