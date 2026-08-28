import path from "node:path";
import { fileURLToPath } from "node:url";

import { caseProps, renderTemplateDir } from "./render.mjs";

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

export const ROLES = ["customer", "preparation", "shared"];

/** Route group each role's routes belong to. `shared` gets a top-level route. */
export function routeDirForRole(role) {
  if (role === "customer") return "app/(customer)";
  if (role === "preparation") return "app/(preparation)";
  return "app";
}

/**
 * The capabilities the generator can emit.
 *
 * Each is independent and feature-local: running one adds files inside
 * `features/<feature>/` (plus, for `route`, a single Expo Router file). None of
 * them edits a shared registry, which is what lets several agents generate in
 * parallel without conflicting.
 *
 * `feature` is the orchestrator — it creates the shell and then runs whichever
 * of the others were requested.
 */
export const CAPABILITIES = {
  feature: {
    summary: "Minimal feature workspace: public API + docs/. Compose the rest with --with.",
    // The control documents live in a nested directory; renderTemplateDir is
    // deliberately shallow, so they are declared as a shared template dir.
    also: ["feature/docs"],
  },
  // The command names the ARTEFACT; the architecture decides where it lands.
  // `generate schema` therefore writes into the feature's model/ directory.
  schema: {
    summary: "A Zod schema + test in model/, the feature's pure domain layer.",
    dir: "model",
  },
  // Anything that touches the query cache also needs the feature's key factory.
  // Declaring it here keeps one copy of the template instead of three that drift.
  query: { summary: "A read: an api/ function plus a TanStack Query hook.", also: ["_keys"] },
  mutation: { summary: "A write: an api/ function plus a mutation hook.", also: ["_keys"] },
  store: { summary: "A Zustand store for client-owned state, with persistence." },
  component: { summary: "A presentational component, feature-wide or screen-local." },
  screen: { summary: "A screen directory: the screen, its test, and its own components/." },
  realtime: { summary: "A Realtime subscription that invalidates a query.", also: ["_keys"] },
  // A route renders a screen through the feature's public API, so generating
  // one without a screen would emit an import of something that does not exist.
  route: { summary: "A thin Expo Router route rendering a screen.", also: ["screen"] },
};

/** Capabilities `feature --with=...` understands. */
export const FEATURE_CAPABILITIES = Object.keys(CAPABILITIES).filter((name) => name !== "feature");

/**
 * Nothing. `pnpm generate feature x` creates a WORKSPACE, not an implementation.
 *
 * It used to default to schema+query+component+screen+route, which quietly
 * assumed every feature is a read-heavy routed screen. Cart is local state,
 * Checkout is a mutation state machine, and a domain-only feature has no UI at
 * all — each of those started by deleting placeholder files, and deleting
 * generated code is exactly the friction the generator exists to remove.
 *
 * Discovery and planning decide the shape; `--with` then generates it.
 */
export const DEFAULT_WITH = [];

export function buildProps({ capability, feature, name, role, options = {} }) {
  if (!CAPABILITIES[capability]) {
    throw new Error(
      `Unknown capability "${capability}". Available: ${Object.keys(CAPABILITIES).join(", ")}.`,
    );
  }
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown --role "${role}". Expected one of: ${ROLES.join(", ")}.`);
  }

  const featureNames = caseProps(feature);
  // A capability without its own name describes the feature itself.
  const artefactNames = caseProps(name ?? feature);
  const featureDir = `features/${featureNames.kebabCaseName}`;

  // Where a generated component lives, decided by its nearest stable consumer.
  // `--screen=x` means only that screen uses it, so it lives beside that screen
  // and never becomes accidental shared surface.
  const screenName = options.screen ? caseProps(options.screen).kebabCaseName : null;
  const componentDir = screenName
    ? `${featureDir}/screens/${screenName}/components`
    : `${featureDir}/components`;

  return {
    ...artefactNames,
    feature: featureNames.kebabCaseName,
    featurePascal: featureNames.pascalCaseName,
    featureCamel: featureNames.camelCaseName,
    featureDir,
    role,
    routeDir: routeDirForRole(role),
    screenName,
    componentScope: screenName ? "screen" : "feature",
    componentDir,
    ...options,
  };
}

/** Render one capability's templates, plus any shared ones it declares. */
export function planCapability(capability, props) {
  const meta = CAPABILITIES[capability];
  const dirs = [meta?.dir ?? capability, ...(meta?.also ?? [])];
  return dirs.flatMap((dir) => renderTemplateDir(path.join(TEMPLATES, dir), props));
}
