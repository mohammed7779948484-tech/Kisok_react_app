import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { caseProps, renderTemplate } from "../render.mjs";

const TEMPLATE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "feature",
);

/**
 * Layers a feature can contain. A feature generates only what it needs — a
 * read-only screen has no business carrying an empty `state/` directory that
 * the next reader has to wonder about.
 */
export const LAYERS = ["api", "queries", "state", "schemas", "components", "screens", "tests"];

export const DEFAULT_LAYERS = ["api", "queries", "schemas", "components", "screens", "tests"];

export const ROLES = ["customer", "preparation", "shared"];

/** Route group each role's routes belong to. `shared` gets a top-level route. */
function routeDirForRole(role) {
  if (role === "customer") return "app/(customer)";
  if (role === "preparation") return "app/(preparation)";
  return "app";
}

export function buildProps({ name, role, layers, realtime, route }) {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown --role "${role}". Expected one of: ${ROLES.join(", ")}.`);
  }

  const unknown = layers.filter((layer) => !LAYERS.includes(layer));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown --layers value(s): ${unknown.join(", ")}. Expected: ${LAYERS.join(", ")}.`,
    );
  }

  if (realtime && !layers.includes("queries")) {
    throw new Error("--realtime needs the `queries` layer, because Realtime invalidates queries.");
  }

  const names = caseProps(name);

  return {
    ...names,
    role,
    layers,
    realtime,
    route,
    routeDir: routeDirForRole(role),
    featureDir: `features/${names.kebabCaseName}`,
  };
}

/** Render every template. Returns the planned files without touching disk. */
export function planFeature(props) {
  const templates = fs
    .readdirSync(TEMPLATE_DIR)
    .filter((entry) => entry.endsWith(".ejs"))
    .sort();

  return templates
    .map((entry) => renderTemplate(path.join(TEMPLATE_DIR, entry), props))
    .filter((file) => file !== null);
}

/**
 * Write the planned files.
 * Never overwrites unless `force` is set — a generator that can silently destroy
 * a half-finished feature is worse than no generator.
 */
export function writeFeature(files, { root, force = false, dryRun = false }) {
  const written = [];
  const skipped = [];

  for (const file of files) {
    const absolute = path.join(root, file.destination);
    if (fs.existsSync(absolute) && !force) {
      skipped.push(file.destination);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file.contents, "utf8");
    }
    written.push(file.destination);
  }

  return { written, skipped };
}
