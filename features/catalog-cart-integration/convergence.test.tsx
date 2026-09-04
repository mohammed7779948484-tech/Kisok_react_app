import { readFileSync, readdirSync } from "fs";
import { dirname, relative, resolve, sep } from "path";
import type { ReactNode } from "react";
import { Dimensions } from "react-native";

import { useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import {
  act,
  installMockAuth,
  renderWithProviders,
  screen,
  TEST_PROFILE,
  userEvent,
  waitFor,
} from "@/core/testing";
import { addItem, getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";
/**
 * THE seam under pin: everything this suite touches in the integration arrives
 * through its public index — the exact path Product Detail and the customer
 * layout consume. The one relative import below is the feature-internal mapper
 * (in-feature imports are relative by convention), whose output is exactly what
 * AddToCartButton feeds the cart's public `addItem`.
 */
import * as publicApi from "@/features/catalog-cart-integration";
import { buildAddToCartInput } from "./model/add-to-cart-mapping";

/**
 * T05 — the convergence suite that locks the feature's truth.
 *
 * Four nets, one file (plan: T05 owns the key-equality pin, the boundary
 * scans, and the convergence regression nets — the public index trio itself
 * was wired in T03 as the C-T03-R1 reconciled deviation, so this suite PINS
 * that surface; it never widens it):
 *
 * 1. The public-API key-equality pin (AC-11, plan decision 2): the runtime
 *    surface is exactly {AddToCartButton, CatalogCartProvider}, the type
 *    surface exactly {CatalogCartSource}, the forbidden names (the internal
 *    mapper, the context, the affordance — and anything cart-flavored, intern
 *    or public) are absent, and `index.ts` composes its own internals only —
 *    the cart owns its own surface; the integration composes, never proxies.
 * 2. The boundary scans (AC-11): grep-equivalent fs checks (the full-cart
 *    suite's readFileSync pattern) over the integration's own sources plus
 *    the two plan-sanctioned edits — zero deep feature imports, zero Supabase
 *    in any form, one-directional seam (nothing here imports catalog).
 * 3. The convergence regression nets (AC-07, AC-08): merge / distinct /
 *    re-hydration driven through the cart's PUBLIC actions with inputs built
 *    by the REAL T01 mapper. Line identity stays the cart's own: deriveLineId
 *    is observed through the public snapshot, never reimplemented here.
 * 4. The end-to-end composition net: the real provider + the real Add button,
 *    both from the public index, pressed twice in a rendered tree — the
 *    merge, the sheet, and the affordance badge all reflect the single cart
 *    model through the whole public path.
 *
 * ESLint note: this suite reaches the cart ONLY through `@/features/cart`
 * (the public index) — the same boundary every integration file respects —
 * so the store singleton is NOT importable here; per-test unique owner ids
 * plus the store's owner-switch reset inside hydrate() re-baseline memory
 * between tests (the provider/button suites' pattern).
 */

/**
 * The provider calls `useRouter()`/`usePathname()` from expo-router (plan
 * decisions 5/8); the repo-standard minimal module mock keeps the rendered
 * tree possible (the provider/button suites' pattern). The pathname reports
 * Product Detail — a browsing route — so the affordance renders exactly as
 * the delivered app shows it there. The `mock` prefix keeps the reference
 * inside jest's factory allowlist.
 */
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => "/product-detail",
}));

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The provider/button/sheet
 * graph renders several icons; they are decorative SVGs, so the standardized
 * null-rendering stand-ins keep this a test of the contracts (see the cart
 * and integration suites).
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    Minus: makeIcon("Minus"),
    Plus: makeIcon("Plus"),
    Trash2: makeIcon("Trash2"),
    ImageOff: makeIcon("ImageOff"),
    ShoppingCart: makeIcon("ShoppingCart"),
  };
});

/** The single durable key the cart's hydrate() reads (cart plan decision 1). */
const KEY = storageKey("cart", "lines");

/**
 * One unique owner id per test: the store's owner-switch reset inside
 * hydrate() re-baselines memory between tests, using only the public surface.
 */
const MERGE_OWNER = "b9f0a1b2-2c3d-4e4f-9a5b-6c7d8e9f0a1b";
const SAME_VARIANT_OWNER = "c0a1b2c3-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const OTHER_VARIANT_OWNER = "d1b2c3d4-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
const REHYDRATION_OWNER = "e2c3d4e5-5f6a-4b7c-8d8e-9f0a1b2c3d4e";
const REHYDRATION_TAKEOVER_OWNER = "f3d4e5f6-6a7b-4c8d-9e9f-0a1b2c3d4e5f";
const END_TO_END_OWNER = "a4e5f6a7-7b8c-4d9e-8f0a-1b2c3d4e5f6a";

/** Option pieces shared by the convergence sources (all canonical uuids — the cart's schema is strict). */
const HAZELNUT = {
  optionTypeId: "d1e2f3a4-1b2c-4c3d-9e8f-0a1b2c3d4e5f",
  optionValueId: "e2f3a4b5-2c3d-4d4e-8f9a-1b2c3d4e5f6a",
  optionValueLabel: "Hazelnut",
  optionTypeName: "Flavor",
};

/** The SAME option TYPE as HAZELNUT, a different VALUE — the distinct-selection case. */
const VANILLA = {
  optionTypeId: HAZELNUT.optionTypeId,
  optionValueId: "f3a4b5c6-3d4e-4e5f-9a8b-2c3d4e5f6a7b",
  optionValueLabel: "Vanilla",
  optionTypeName: "Flavor",
};

const OAT = {
  optionTypeId: "a4b5c6d7-4e5f-4f5a-8b9c-3d4e5f6a7b8c",
  optionValueId: "b5c6d7e8-5f6a-4a5b-9c8d-4e5f6a7b8c9d",
  optionValueLabel: "Oat",
  optionTypeName: "Milk",
};

const FIRST_VARIANT_ID = "c4a5b6c7-7d8e-4f9a-8b0c-9d1e2f3a4b5c";
const SECOND_VARIANT_ID = "d5b6c7d8-8e9f-4a0b-9c1d-2e3f4a5b6c7d";

/** V1 + [Hazelnut, Oat] — the base selection every convergence case builds on. */
const hazelnutOatSource: publicApi.CatalogCartSource = {
  productId: "e6c7d8e9-9f0a-4b1c-8d2e-3f4a5b6c7d8e",
  productName: "Almond Cold Brew",
  variant: {
    id: FIRST_VARIANT_ID,
    titleOverride: null,
    isAvailable: true,
    primaryImageUri: "https://images.example.com/products/almond-cold-brew.jpg",
    options: [HAZELNUT, OAT],
  },
  variantCount: 3,
  variantIndex: 1,
};

/** The SAME variant, a DIFFERENT option selection (the Flavor value is swapped). */
const vanillaOatSource: publicApi.CatalogCartSource = {
  ...hazelnutOatSource,
  variant: { ...hazelnutOatSource.variant, options: [VANILLA, OAT] },
};

/** A DIFFERENT variant carrying the SAME option-value set as the base selection. */
const sameOptionsOtherVariantSource: publicApi.CatalogCartSource = {
  ...hazelnutOatSource,
  variant: { ...hazelnutOatSource.variant, id: SECOND_VARIANT_ID },
};

/**
 * A COMPLETE structural literal of the public type — every field present and
 * correctly typed. `pnpm typecheck` is the judge: if the public path stops
 * exporting `CatalogCartSource`, or its shape drifts (a renamed or missing
 * field), this file no longer compiles.
 */
const catalogCartSourceSample: publicApi.CatalogCartSource = {
  productId: "f7d8e9f0-0a1b-4c2d-9e3f-4a5b6c7d8e9f",
  productName: "Convergence Sample Brew",
  variant: {
    id: "a8e9f0a1-1b2c-4d3e-8f4a-5b6c7d8e9f0a",
    titleOverride: null,
    isAvailable: true,
    primaryImageUri: null,
    options: [],
  },
  variantCount: 1,
  variantIndex: 0,
};

/**
 * The public TYPE surface, pinned by const assertion: `satisfies` fails at
 * compile time if the key set drifts off {"CatalogCartSource"} or the value
 * stops being the exported structural type. (A type-only export is invisible
 * to `Object.keys`, so the exactness of the type surface needs this
 * compile-time layer plus the index export-statement scan below — together
 * they leave no gap.)
 */
const publicTypeSurface = {
  CatalogCartSource: catalogCartSourceSample,
} satisfies Record<"CatalogCartSource", publicApi.CatalogCartSource>;

/**
 * Names that must NEVER appear on the public surface. The T01 mapper and the
 * T02 context are feature-internal (plan decision 2 — the Lead Planning
 * Review correction), the T04 affordance is composed by the provider (never
 * exported), and everything cart-flavored belongs to the cart's own public
 * API or internals — the integration composes the cart, it never proxies it
 * (AC-11; the R-T05-05 lesson: even the cart's own index refuses to
 * re-export its test-only hook).
 */
const FORBIDDEN_EXPORT_NAMES = [
  // the integration's own internals — composed, never public
  "buildAddToCartInput",
  "useQuickCart",
  "QuickCartContext",
  "quickCartContext",
  "CartAccessButton",
  // the cart's public runtime surface — the cart owns it
  "useCart",
  "addItem",
  "setLineQuantity",
  "removeLine",
  "clearCart",
  "lockCart",
  "unlockCart",
  "hydrateCart",
  "getCartSnapshot",
  "QuickCartSheet",
  "CartItemRow",
  "QuantityStepper",
  "FullCartScreen",
  // the cart's internals — never public from anywhere
  "useCartStore",
  "deriveLineId",
  "selectTotalQuantity",
  "selectDistinctLineCount",
  "persistedCartSchema",
  "clearCartForSignOut",
] as const;

/** The durable envelope's shape as the integration observes it on read (the cart owns the schema). */
type DurableCartEnvelope = { version: number; ownerId: string; lines: CartLine[] };

/** This suite lives at the feature root, so the whole feature is its own directory. */
const FEATURE_ROOT = __dirname;

/** The two plan-sanctioned edits this feature made outside its own directory (brief AC-11). */
const PRODUCT_DETAIL_PATH = resolve(
  __dirname,
  "../catalog/screens/product-detail/product-detail-screen.tsx",
);
const CUSTOMER_LAYOUT_PATH = resolve(__dirname, "../../app/(customer)/_layout.tsx");

/**
 * Which AdaptiveSheet presentation a test exercises is decided by
 * `useLayout()` → `useWindowDimensions()`; setting the frame BEFORE render
 * means no mounted tree reacts to the change (the provider suite's pattern).
 * 1024×768 → expanded landscape side panel.
 */
type Frame = { width: number; height: number };
const LANDSCAPE: Frame = { width: 1024, height: 768 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

/**
 * The cart's mutations persist fire-and-forget; this feature's tests cannot
 * call the store's own `persistNow` (deep import), so one macrotask turn —
 * the button suite's `settleDurableWrites` pattern — lets the serialized
 * write chain settle inside act.
 */
async function settleDurableWrites() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Read the durable envelope back through the app's real storage API — fail loudly if it is not there. */
async function readDurableEnvelope(): Promise<DurableCartEnvelope> {
  const read = await storage.read(KEY, (raw) => raw as DurableCartEnvelope);
  expect(read.status).toBe("hit");
  if (read.status !== "hit") {
    throw new Error(`the durable cart envelope read came back ${read.status}`);
  }
  return read.value;
}

/** Every module specifier a source file imports (from-imports and side-effect imports). */
function importSpecifiers(source: string): string[] {
  // Each regex captures exactly one specifier, but `noUncheckedIndexedAccess`
  // types a match group as possibly absent — narrow honestly rather than cast.
  const fromImports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
  const sideEffectImports = [...source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
  return [...fromImports, ...sideEffectImports];
}

/** Every `.ts`/`.tsx` file under the feature (source and tests — the boundary owns them all). */
function listFeatureSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFeatureSourceFiles(entryPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * Classify one import specifier from one integration file against the
 * boundary contract. `null` = allowed; a string = the violation's reason.
 *
 * The rules, task-verbatim (AC-11): NO deep `@/features/cart/**`, NO
 * `@/features/catalog` in ANY form (the seam is one-directional — Catalog
 * consumes the integration, never the reverse), NO `@supabase` and NO
 * `@/core/supabase` (the cart is client-owned local state with no backend).
 * Two guard rails the same spirit adds: no deep import into this feature's
 * own internals via the alias (in-feature imports are relative), and no
 * relative import escaping the feature directory (the alias boundary must
 * not be bypassable with `../../`).
 */
function boundaryViolation(specifier: string, importingFile: string): string | null {
  // The ONE sanctioned cross-feature import: the cart's public index.
  if (specifier === "@/features/cart") return null;
  if (specifier.startsWith("@/features/cart/")) {
    return "deep import into @/features/cart/** (the public index is the only door)";
  }
  if (specifier === "@/features/catalog" || specifier.startsWith("@/features/catalog/")) {
    return "import of @/features/catalog (any form) — the seam is one-directional";
  }
  if (specifier.startsWith("@supabase")) {
    return "Supabase package import — the cart is client-owned local state, no backend";
  }
  if (specifier === "@/core/supabase" || specifier.startsWith("@/core/supabase/")) {
    return "Supabase client import — the cart is client-owned local state, no backend";
  }
  if (specifier.startsWith("@/features/catalog-cart-integration/")) {
    return "deep import into this feature's own internals (relative imports inside the feature)";
  }
  if (specifier === "@/features/catalog-cart-integration") {
    // The public self path — this suite's own pin imports; nothing else uses it.
    return null;
  }
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(importingFile), specifier);
    if (!target.startsWith(FEATURE_ROOT + sep)) {
      return "relative import escaping the feature directory";
    }
  }
  return null;
}

/**
 * Gates the composition on auth readiness, exactly as the app does: the
 * (customer) group only mounts under `ready && profile?.role === "customer"`,
 * and `useActiveProfile()` throwing outside authenticated surfaces is
 * core/auth's contract (the provider/button suites' AuthedHarness pattern).
 * Both wrapped components come from the PUBLIC index.
 */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <publicApi.CatalogCartProvider>{children}</publicApi.CatalogCartProvider>;
}

/** installMockAuth restored after every test — the provider suite's holder pattern. */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

beforeEach(async () => {
  // The store's mutation and hydration paths log by design; keep the suite
  // silent per the repo convention.
  setLogSink(() => {});
  mockRouterPush.mockClear();
  // Disk hygiene: hydrate() reads this key, so a previous test's envelope must
  // not leak into the next one's restore. Through the app's own API.
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("public API key-equality pin (AC-11, plan decision 2; C-T03-R1 surface locked)", () => {
  it("the runtime export surface is exactly the plan-named duo — no more, no fewer", () => {
    expect(Object.keys(publicApi).sort()).toEqual(["AddToCartButton", "CatalogCartProvider"]);
  });

  it("the forbidden names are absent from the runtime surface — the internals stay internal and the cart is never proxied", () => {
    const runtimeKeys = Object.keys(publicApi);
    for (const name of FORBIDDEN_EXPORT_NAMES) {
      expect(runtimeKeys).not.toContain(name);
    }
  });

  it("the type surface is exactly CatalogCartSource — the real structural contract from the public path", () => {
    // Layer 1 (compile-time, judged by `pnpm typecheck`): the `satisfies`
    // const above fails to compile if the public path stops exporting the
    // type or its shape drifts; a complete literal is the assignment proof.
    // Layer 2 (runtime mirror): the const's key set is the pinned type surface.
    expect(Object.keys(publicTypeSurface)).toEqual(["CatalogCartSource"]);
    // Layer 3 (source): pinned by the index export-statement scan below — a
    // type-only export is invisible to Object.keys, so the scan closes the gap.
  });

  it("index.ts exports exactly the trio from relative in-feature modules — the integration composes, never re-exports @/features/cart", () => {
    const indexSource = readFileSync(resolve(FEATURE_ROOT, "index.ts"), "utf8");

    // No star re-exports: `export *` would re-export an unknown surface wholesale.
    expect(indexSource).not.toMatch(/export\s+\*/);

    // And no export declaration beyond the three export-from statements — a
    // plain `export const`/`export type X` would widen the surface invisibly
    // to the Object.keys and statement-scan layers.
    const exportStatementLines = indexSource
      .split("\n")
      .filter((line) => line.trim().startsWith("export"));
    expect(exportStatementLines).toHaveLength(3);

    const reExports = [
      ...indexSource.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s+["']([^"']+)["']/g),
    ].map((match) => ({
      kind: match[1] === undefined ? ("value" as const) : ("type" as const),
      names: (match[2] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
      from: match[3] ?? "",
    }));

    // The exact surface: two runtime exports + one type export — nothing else,
    // no aliases (the parsed names are the exported names verbatim).
    const surface = reExports
      .flatMap((reExport) => reExport.names.map((name) => ({ kind: reExport.kind, name })))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind),
      );
    expect(surface).toEqual([
      { kind: "type", name: "CatalogCartSource" },
      { kind: "value", name: "AddToCartButton" },
      { kind: "value", name: "CatalogCartProvider" },
    ]);

    // Compose, never proxy: every re-export target is a RELATIVE in-feature
    // module. Nothing from @/features/cart is re-exported here — the cart owns
    // its own surface (the mapper imports the cart's TYPE internally, but the
    // index never forwards any of it).
    for (const reExport of reExports) {
      expect(reExport.from.startsWith("./")).toBe(true);
      expect(reExport.from.startsWith("@/")).toBe(false);
    }
  });
});

describe("boundary scans (AC-11)", () => {
  it("no file under the feature deep-imports cart or catalog, or reaches any Supabase surface — and no relative escape", () => {
    const files = listFeatureSourceFiles(FEATURE_ROOT).sort();

    // The walk really covers the feature's sources — a silently-empty walk
    // would make this scan vacuous.
    expect(files).toContain(resolve(FEATURE_ROOT, "index.ts"));
    expect(files).toContain(resolve(FEATURE_ROOT, "model/add-to-cart-mapping.ts"));
    expect(files).toContain(resolve(FEATURE_ROOT, "model/add-to-cart-mapping.test.ts"));
    expect(files).toContain(resolve(FEATURE_ROOT, "components/quick-cart-context.tsx"));
    expect(files).toContain(resolve(FEATURE_ROOT, "components/catalog-cart-provider.tsx"));
    expect(files).toContain(resolve(FEATURE_ROOT, "components/add-to-cart-button.tsx"));
    expect(files).toContain(resolve(FEATURE_ROOT, "components/cart-access-button.tsx"));

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const violation = boundaryViolation(specifier, file);
        if (violation !== null) {
          violations.push(`${relative(FEATURE_ROOT, file)} imports "${specifier}" — ${violation}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("Product Detail consumes the integration's public API and never imports the cart feature", () => {
    const screenSource = readFileSync(PRODUCT_DETAIL_PATH, "utf8");
    const specifiers = importSpecifiers(screenSource);

    // The plan-sanctioned owning-feature edit: the Add action arrives through
    // the integration's public index — the one sanctioned way to reach it.
    expect(specifiers).toContain("@/features/catalog-cart-integration");

    // The edit's whole point: the screen renders the integration's Add action
    // and never learns the cart exists.
    const cartImports = specifiers.filter(
      (specifier) => specifier === "@/features/cart" || specifier.startsWith("@/features/cart/"),
    );
    expect(cartImports).toEqual([]);

    // And it reaches the integration only through the public index — never deep.
    const deepIntegrationImports = specifiers.filter((specifier) =>
      specifier.startsWith("@/features/catalog-cart-integration/"),
    );
    expect(deepIntegrationImports).toEqual([]);
  });

  it("the customer layout imports only the integration's public index and expo-router (the thin mount)", () => {
    const layoutSource = readFileSync(CUSTOMER_LAYOUT_PATH, "utf8");
    const specifiers = importSpecifiers(layoutSource);

    // The T04 mount: the provider arrives through the integration's public
    // index — the one sanctioned way another module may reach this feature.
    expect(specifiers).toContain("@/features/catalog-cart-integration");

    // Thin-mount discipline, the full-cart route suite's sanctioned-set shape:
    // anything beyond the router's own Stack and the public index is out of
    // place here (and would fail the app/** ESLint boundary anyway).
    const sanctioned = new Set(["expo-router", "@/features/catalog-cart-integration"]);
    expect(specifiers.filter((specifier) => !sanctioned.has(specifier))).toEqual([]);
  });
});

describe("convergence: cart semantics through the public path (AC-07)", () => {
  it("the same variant + same option-value set added twice merges into ONE line, quantity 2", async () => {
    await hydrateCart(MERGE_OWNER);

    // The input is built exactly the way AddToCartButton builds it: the real
    // T01 mapper over the same structural source.
    const input = buildAddToCartInput(hazelnutOatSource);
    addItem(input);
    addItem(input); // the SAME input — same variant, same option-value set

    const snapshot = getCartSnapshot();
    expect(snapshot.distinctLineCount).toBe(1);
    expect(snapshot.totalQuantity).toBe(2);
    expect(snapshot.lines).toHaveLength(1);

    // The cart's own merge rule, observed through the public snapshot — the
    // identity (variantId + sorted optionValueIds, the cart's deriveLineId)
    // is NEVER reimplemented here; the merge above is the proof it matched.
    const line = snapshot.lines[0];
    expect(line?.variantId).toBe(FIRST_VARIANT_ID);
    expect(line?.quantity).toBe(2);
    expect(line?.optionSelections.map((selection) => selection.optionValueId).sort()).toEqual(
      [HAZELNUT.optionValueId, OAT.optionValueId].sort(),
    );
  });

  it("the same variant + a DIFFERENT option selection creates a distinct line", async () => {
    await hydrateCart(SAME_VARIANT_OWNER);

    addItem(buildAddToCartInput(hazelnutOatSource)); // V1 + [Hazelnut, Oat]
    addItem(buildAddToCartInput(vanillaOatSource)); // V1 + [Vanilla, Oat]

    const snapshot = getCartSnapshot();
    expect(snapshot.distinctLineCount).toBe(2);
    expect(snapshot.totalQuantity).toBe(2);
    expect(snapshot.lines.map((line) => line.quantity)).toEqual([1, 1]);

    // Distinct identities on the SAME variant — the option selection is the
    // difference (observed through the snapshot, never recomputed).
    expect(snapshot.lines[0]?.lineId).not.toBe(snapshot.lines[1]?.lineId);
    expect(new Set(snapshot.lines.map((line) => line.variantId))).toEqual(
      new Set([FIRST_VARIANT_ID]),
    );
    expect(snapshot.lines[0]?.optionSelections.map((s) => s.optionValueId).sort()).not.toEqual(
      snapshot.lines[1]?.optionSelections.map((s) => s.optionValueId).sort(),
    );
  });

  it("a DIFFERENT variant + the SAME option-value set creates a distinct line", async () => {
    await hydrateCart(OTHER_VARIANT_OWNER);

    addItem(buildAddToCartInput(hazelnutOatSource)); // V1 + [Hazelnut, Oat]
    addItem(buildAddToCartInput(sameOptionsOtherVariantSource)); // V2 + [Hazelnut, Oat]

    const snapshot = getCartSnapshot();
    expect(snapshot.distinctLineCount).toBe(2);
    expect(snapshot.totalQuantity).toBe(2);
    expect(snapshot.lines.map((line) => line.quantity)).toEqual([1, 1]);

    // The option-value sets are IDENTICAL — the variant alone separates the
    // lines (the cart's identity rule, observed; never reimplemented here).
    expect(new Set(snapshot.lines.map((line) => line.variantId))).toEqual(
      new Set([FIRST_VARIANT_ID, SECOND_VARIANT_ID]),
    );
    expect(snapshot.lines[0]?.optionSelections.map((s) => s.optionValueId).sort()).toEqual(
      snapshot.lines[1]?.optionSelections.map((s) => s.optionValueId).sort(),
    );
    expect(snapshot.lines[0]?.lineId).not.toBe(snapshot.lines[1]?.lineId);
  });
});

describe("convergence: re-hydration through the public path (AC-08)", () => {
  it("a populated store's durable envelope restores through the public hydrateCart — lines and quantities persist", async () => {
    // Populate the store for a unique owner through the public path, exactly
    // the way the seam populates it: the mapper builds the inputs, addItem
    // applies the cart's own rules (a merged line + a distinct line).
    await hydrateCart(REHYDRATION_OWNER);
    addItem(buildAddToCartInput(hazelnutOatSource));
    addItem(buildAddToCartInput(hazelnutOatSource)); // merges to quantity 2
    addItem(buildAddToCartInput(vanillaOatSource)); // a distinct line
    await settleDurableWrites();

    const populated = getCartSnapshot();
    expect(populated.ownerId).toBe(REHYDRATION_OWNER);
    expect(populated.lines).toHaveLength(2);
    expect(populated.totalQuantity).toBe(3);

    // The durable envelope, read through the app's REAL storage API: the
    // populated store's own write is on disk — owner, version, and the exact
    // lines with their quantities (the write side of AC-08).
    const envelope = await readDurableEnvelope();
    expect(envelope.version).toBe(1);
    expect(envelope.ownerId).toBe(REHYDRATION_OWNER);
    expect(envelope.lines).toHaveLength(2);
    expect(envelope.lines.map((line) => line.quantity).sort((a, b) => a - b)).toEqual([1, 2]);

    // The reload's hard part, driven through public actions only: another
    // profile hydrating resets memory (and durably discards the previous
    // owner's envelope — the kiosk mismatch safety path, so the re-seed below
    // is needed; in a real reload nothing removes the envelope between runs).
    await hydrateCart(REHYDRATION_TAKEOVER_OWNER);
    const afterSwitch = getCartSnapshot();
    expect(afterSwitch.ownerId).toBe(REHYDRATION_TAKEOVER_OWNER);
    expect(afterSwitch.lines).toEqual([]);

    // The previous session's durable cart — the exact envelope bytes the
    // populated store wrote — is back on disk, as it is across a real reload.
    await storage.write(KEY, envelope);

    // And the reload's restore: the PUBLIC hydrateCart reads the envelope
    // back into the single store — a genuine disk → memory restore, not the
    // same-owner idempotent no-op.
    await hydrateCart(REHYDRATION_OWNER);

    const restored = getCartSnapshot();
    expect(restored.hydrated).toBe(true);
    expect(restored.ownerId).toBe(REHYDRATION_OWNER);
    expect(restored.lines).toHaveLength(2);
    expect(restored.totalQuantity).toBe(3);

    // Lines and quantities persist exactly: the merged line and the distinct
    // one (both carry the SAME variantId — the selection is the identity),
    // each with its option snapshot intact.
    const merged = restored.lines.find((line) =>
      line.optionSelections.some((selection) => selection.optionValueLabel === "Hazelnut"),
    );
    expect(merged?.variantId).toBe(FIRST_VARIANT_ID);
    expect(merged?.quantity).toBe(2);
    expect(merged?.optionSelections.map((selection) => selection.optionValueLabel)).toEqual([
      "Hazelnut",
      "Oat",
    ]);
    const distinct = restored.lines.find((line) =>
      line.optionSelections.some((selection) => selection.optionValueLabel === "Vanilla"),
    );
    expect(distinct?.variantId).toBe(FIRST_VARIANT_ID);
    expect(distinct?.quantity).toBe(1);
    expect(distinct?.optionSelections.map((selection) => selection.optionValueLabel)).toEqual([
      "Vanilla",
      "Oat",
    ]);
  });
});

describe("convergence: the public surface composes end-to-end (AC-07 through the real components)", () => {
  it("a real Add press ×2 inside the real provider merges to one line — the sheet and the affordance badge show the merged total", async () => {
    const user = userEvent.setup();
    setFrame(LANDSCAPE);
    mockAuthHolder.current = installMockAuth({
      profile: { ...TEST_PROFILE, id: END_TO_END_OWNER },
    });
    await renderWithProviders(
      <AuthedHarness>
        <publicApi.AddToCartButton source={hazelnutOatSource} />
      </AuthedHarness>,
      { withAuth: true },
    );

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    // Enabled once the provider's own hydration has landed (the awaited
    // render drains the microtask chains).
    await waitFor(() => expect(addButton).not.toBeDisabled());

    // First press: one unit, and the sheet the press opens shows it.
    await user.press(addButton);
    await settleDurableWrites();
    expect(await screen.findByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
    expect(getCartSnapshot().totalQuantity).toBe(1);

    // Back to browsing — Continue Shopping closes the sheet.
    await user.press(screen.getByRole("button", { name: "Continue Shopping" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Your Cart · 1" })).toBeNull(),
    );

    // …and the SAME selection pressed again: the merge the whole seam exists
    // for, observed end-to-end through the public path.
    await user.press(addButton);
    await settleDurableWrites();

    const snapshot = getCartSnapshot();
    expect(snapshot.distinctLineCount).toBe(1);
    expect(snapshot.totalQuantity).toBe(2);
    expect(snapshot.lines[0]?.quantity).toBe(2);
    expect(snapshot.lines[0]?.variantId).toBe(FIRST_VARIANT_ID);

    // The reopened sheet's title reflects the merged total…
    expect(await screen.findByRole("heading", { name: "Your Cart · 2" })).toBeOnTheScreen();
    // …and so does the persistent affordance's accessible name — the count
    // from the single cart model (no mirrored state), announced with the
    // badge it carries.
    expect(screen.getByRole("button", { name: "Open cart, 2 items" })).toBeOnTheScreen();
  });
});
