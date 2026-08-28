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
    summary: "Feature shell: public API and TODO.md. Orchestrates other capabilities via --with.",
  },
  schema: { summary: "A Zod schema validating one payload shape." },
  // Anything that touches the query cache also needs the feature's key factory.
  // Declaring it here keeps one copy of the template instead of three that drift.
  query: { summary: "A read: an api/ function plus a TanStack Query hook.", also: ["_keys"] },
  mutation: { summary: "A write: an api/ function plus a mutation hook.", also: ["_keys"] },
  store: { summary: "A Zustand store for client-owned state, with persistence." },
  component: { summary: "A presentational, feature-private component." },
  screen: { summary: "A screen composing the feature's hooks and components." },
  realtime: { summary: "A Realtime subscription that invalidates a query.", also: ["_keys"] },
  // A route renders a screen through the feature's public API, so generating
  // one without a screen would emit an import of something that does not exist.
  route: { summary: "A thin Expo Router route rendering a screen.", also: ["screen"] },
};

/** Capabilities `feature --with=...` understands. */
export const FEATURE_CAPABILITIES = Object.keys(CAPABILITIES).filter((name) => name !== "feature");

export const DEFAULT_WITH = ["schema", "query", "component", "screen", "route"];

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

  return {
    ...artefactNames,
    feature: featureNames.kebabCaseName,
    featurePascal: featureNames.pascalCaseName,
    featureCamel: featureNames.camelCaseName,
    featureDir: `features/${featureNames.kebabCaseName}`,
    role,
    routeDir: routeDirForRole(role),
    ...options,
  };
}

/** Render one capability's templates, plus any shared ones it declares. */
export function planCapability(capability, props) {
  const dirs = [capability, ...(CAPABILITIES[capability]?.also ?? [])];
  return dirs.flatMap((dir) => renderTemplateDir(path.join(TEMPLATES, dir), props));
}
