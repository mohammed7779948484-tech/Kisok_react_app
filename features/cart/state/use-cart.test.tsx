import { Text, View } from "react-native";

import { runSignOutCleanup, useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import { act, installMockAuth, renderWithProviders, screen, TEST_PROFILE } from "@/core/testing";

// The ONLY feature import for the public-surface assertions: `@/features/cart`,
// exactly the way a future Catalog or Checkout consumer reaches the cart. The
// plan's failing-test line for T10 is literally "importing `@/features/cart`
// exposes hook/actions/components/types and registers cleanup", so every
// public-API assertion — including the hook's own behaviour — drives the feature
// through this one import. The store singleton and the model rules are imported
// directly below (the sanctioned T05/T08/T09 pattern: hook tests may import the
// store/test helpers directly for seeding and store-state assertions).
import * as cartApi from "@/features/cart";
import type { AddToCartInput, CartLine, PersistenceStatus } from "@/features/cart";

import { useCartStore } from "./cart-store";
import { deriveLineId } from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. This suite renders no
 * lucide-using component — but the public index re-exports the feature's
 * components and screen, and THOSE value-import lucide, so the module graph
 * needs the standardized stand-ins (T06-T09) just to load. The icons are
 * decorative SVGs; nothing here asserts on them. (expo-router, which the
 * screen value-imports, needs no mock here: the real module loads cleanly
 * under jest-expo as long as nothing renders the screen — probed empirically
 * during RED; this suite only checks `FullCartScreen` is exported.)
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

const KEY = storageKey("cart", "lines");
/** A second customer for the owner-switch test — only the id and name differ. */
const OTHER_OWNER = "77777777-8888-4999-aaaa-bbbbbbbbbbbb";
/** A plain non-auth owner for the non-React action tests (the T05 suite's id). */
const OWNER = "11111111-2222-4333-8444-555555555555";

const sizeSelection = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  optionValueLabel: "Large",
};

const milkSelection = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  optionValueLabel: "Oat Milk",
};

/** A populated line with an image and two ordered option selections. */
const cappuccinoLine: CartLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

/** A plain line: no options, no image. */
const waterLine: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/** The matching AddToCartInput — a line minus its derived identity. */
const cappuccinoInput: AddToCartInput = {
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

const waterInput: AddToCartInput = {
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/** The thirteen runtime exports the plan's public API allows — no more, no less. */
const PUBLIC_RUNTIME_EXPORTS = [
  "CartItemRow",
  "FullCartScreen",
  "QuantityStepper",
  "QuickCartSheet",
  "addItem",
  "clearCart",
  "getCartSnapshot",
  "hydrateCart",
  "lockCart",
  "removeLine",
  "setLineQuantity",
  "unlockCart",
  "useCart",
];

/**
 * Store control, the sanctioned pattern (see state/sign-out-cleanup.test.ts):
 * the hook and actions read the SINGLETON `useCartStore`, so tests place state
 * with real zustand `setState` and reset it between tests — no mock framework
 * involved.
 */
function resetCartSingleton() {
  useCartStore.setState({
    lines: [],
    ownerId: null,
    persistence: "unknown",
    hydrated: false,
    locked: false,
  });
}

/**
 * The store's mutations persist fire-and-forget; settle the write queue inside
 * act so its honest status update can never land outside it.
 */
async function settleDurableWrites() {
  await act(async () => {
    await useCartStore.getState().persistNow();
  });
}

/**
 * `clearCart()`'s durable clear is fire-and-forget too; one macrotask turn
 * lets the serialized remove→fallback chain settle and report its honest
 * status inside act.
 */
async function settleDurableClear() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Read the cart key back through the app's real storage API. */
async function readPersistedCart() {
  return storage.read(KEY, (raw) => persistedCartSchema.parse(raw));
}

/**
 * Seed the durable envelope for an owner through the store's OWN write path
 * (T05's honest-seed pattern), then reset memory — so any restore asserted
 * afterwards must genuinely come from disk, never from what seeding left in
 * the store.
 */
async function seedDurableEnvelope(lines: CartLine[], ownerId: string) {
  resetCartSingleton();
  useCartStore.setState({ lines, ownerId, hydrated: true });
  await settleDurableWrites();
  // The seed really is on disk, or the restore assertions prove nothing.
  expect((await readPersistedCart()).status).toBe("hit");
  resetCartSingleton();
}

/**
 * The probe's most recent `useCart()` view, captured per render so a test can
 * invoke the bound actions exactly the way a consumer would.
 */
let latestView: ReturnType<typeof cartApi.useCart> | null = null;

function currentView(): ReturnType<typeof cartApi.useCart> {
  if (latestView === null) {
    throw new Error("the probe has not rendered a useCart view yet");
  }
  return latestView;
}

/**
 * A minimal authenticated consumer of `useCart()` — the future catalog-shell
 * shape. The values it renders are the hook's OWN view fields, so every
 * assertion below reads what a real consumer would see.
 */
function CartProbe() {
  const view = cartApi.useCart();
  latestView = view;
  return (
    <View>
      <Text>{`hydrated:${view.hydrated} total:${view.totalQuantity} lines:${view.distinctLineCount} persistence:${view.persistence} locked:${view.locked}`}</Text>
      {view.lines.map((line) => (
        <Text key={line.lineId}>{`line:${line.productDisplayName}:${line.quantity}`}</Text>
      ))}
    </View>
  );
}

/**
 * Gates the probe on auth readiness, exactly like the app's authenticated
 * surfaces: `useActiveProfile()` throwing outside an authenticated experience
 * is core/auth's contract, not a defect for `useCart()` to code around.
 */
function AuthedCartProbe() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CartProbe />;
}

/**
 * Registry hygiene (the T05 suite's sanctioned adaptation): the index import
 * above registers the cart's sign-out cleanup ONCE, at module load. Clearing
 * the registry between tests — core/auth's own sign-out.test.ts pattern —
 * would delete the very registration under test, and a dynamic re-import
 * cannot restore it (the module graph is cached), so the registration stays
 * live for the whole file exactly as in sign-out-cleanup.test.ts. Jest
 * isolates module registries per FILE, so nothing leaks into other suites;
 * within THIS file, each test resets the store singleton and the durable key
 * instead.
 *
 * The installed mock auth client is restored after every test, and the store's
 * mutation paths log by design — the sink keeps the suite silent per the repo
 * convention.
 */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

beforeEach(async () => {
  setLogSink(() => {});
  resetCartSingleton();
  // Disk hygiene: `hydrate()` reads this key, so a previous test's envelope
  // must not leak into the next one's restore. Through the app's own API.
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("cart public API (AC-13)", () => {
  it("exposes exactly the planned surface: components, hook, actions — and nothing else", () => {
    // Components for composition by future catalog surfaces.
    expect(typeof cartApi.QuantityStepper).toBe("function");
    expect(typeof cartApi.CartItemRow).toBe("function");
    expect(typeof cartApi.QuickCartSheet).toBe("function");
    // The routed screen — the T09 route test proves the wiring by rendering it
    // through this same import; here the presence pin is the contract.
    expect(typeof cartApi.FullCartScreen).toBe("function");
    // The consumer hook.
    expect(typeof cartApi.useCart).toBe("function");
    // Plain actions for non-React callers (future Checkout).
    expect(typeof cartApi.addItem).toBe("function");
    expect(typeof cartApi.setLineQuantity).toBe("function");
    expect(typeof cartApi.removeLine).toBe("function");
    expect(typeof cartApi.clearCart).toBe("function");
    expect(typeof cartApi.lockCart).toBe("function");
    expect(typeof cartApi.unlockCart).toBe("function");
    expect(typeof cartApi.hydrateCart).toBe("function");
    expect(typeof cartApi.getCartSnapshot).toBe("function");

    // The runtime surface is EXACTLY the thirteen planned names. FULL key
    // equality — not a function-valued filter — so a future accidental export
    // of ANY kind (a stray `export const CART_KEY = …` is the reviewer's
    // R-T10-03 example) fails right here; type re-exports are erased at
    // runtime and correctly do not count.
    expect(Object.keys(cartApi).sort()).toEqual([...PUBLIC_RUNTIME_EXPORTS].sort());

    // FORBIDDEN (R-T05-05 + plan decision 11): the store, its factory, and
    // the test-only sign-out cleanup must never be public. Checked by NAME —
    // a direct property access would be a compile error precisely because the
    // exports are (correctly) absent, and the exact-surface assertion above
    // already fails if any export beyond the thirteen ever appears.
    expect("useCartStore" in cartApi).toBe(false);
    expect("createCartStore" in cartApi).toBe(false);
    expect("clearCartForSignOut" in cartApi).toBe(false);

    // The type half of the surface is compile-time only (types are erased at
    // runtime): the fixtures above (CartLine/AddToCartInput annotations) and
    // this annotation import through the index, so `pnpm typecheck` fails if
    // the type re-exports ever go missing.
    const statusContract: PersistenceStatus = "persisted";
    expect(statusContract).toBe("persisted");
  });

  it("registers sign-out cleanup through the index side-effect: runSignOutCleanup() clears memory AND the durable key", async () => {
    // Seed honestly — real lines, real owner, real write through the store's
    // own write path, and a stale lock — so the post-run assertions have
    // something to be false about (T05's lifecycle-test pattern, now reached
    // through the public entry instead of a direct module import).
    useCartStore.setState({ lines: [waterLine], ownerId: OWNER, hydrated: true, locked: true });
    await settleDurableWrites();
    expect((await readPersistedCart()).status).toBe("hit");

    const result = await runSignOutCleanup();

    // No failure recorded, memory cleared (lines AND the stale lock), and the
    // durable key is gone: importing `@/features/cart` really did register the
    // cart's cleanup — the T05 module is finally reachable through the public
    // entry (plan decision 10).
    expect(result).toEqual({ failures: [] });
    expect(useCartStore.getState().lines).toEqual([]);
    expect(useCartStore.getState().locked).toBe(false);
    expect((await readPersistedCart()).status).toBe("miss");
  });
});

describe("useCart()", () => {
  it("renders the REAL restored cart through the hook — hydration ownership proven by restoration", async () => {
    // A previous session's durable cart for the signed-in profile. The store
    // starts un-hydrated; only the hook's own effect may restore it — this
    // test never calls hydrate itself, so a restore can only mean the hook
    // hydrated (T09 carry-forward: nothing else hydrates).
    await seedDurableEnvelope([cappuccinoLine, waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();

    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });

    // The view a consumer sees: restored lines, selector-derived totals, the
    // honest persisted status — all from durable state, not from seed memory.
    await screen.findByText("hydrated:true total:3 lines:2 persistence:persisted locked:false");
    expect(screen.getByText("line:Cappuccino:2")).toBeOnTheScreen();
    expect(screen.getByText("line:Sparkling Water:1")).toBeOnTheScreen();
    // The hook hydrated for the authed profile's id.
    expect(useCartStore.getState().ownerId).toBe(TEST_PROFILE.id);
  });

  it("bound actions delegate through the store: addItem from the probe updates the view AND the store", async () => {
    await seedDurableEnvelope([waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();
    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });
    await screen.findByText("hydrated:true total:1 lines:1 persistence:persisted locked:false");

    // A consumer invoking the view's bound action: the delegate resolves the
    // CURRENT store through getState(), so the same selection merges by
    // summing (AC-03). RNTL's `act` is an async act under the hood — it MUST
    // be awaited, or the interleaved act queue corrupts later renders in this
    // file.
    await act(async () => {
      currentView().addItem(waterInput);
    });
    await settleDurableWrites();

    // The store changed…
    expect(useCartStore.getState().lines).toEqual([{ ...waterLine, quantity: 2 }]);
    // …and the subscribed view re-rendered with the new state — the totals
    // are derived through the selectors, never mirrored in hook state.
    expect(
      screen.getByText("hydrated:true total:2 lines:1 persistence:persisted locked:false"),
    ).toBeOnTheScreen();
    expect(screen.getByText("line:Sparkling Water:2")).toBeOnTheScreen();
  });

  it("re-hydrates when the profile id changes: the old owner's lines and durable envelope are discarded", async () => {
    // First customer: their cart is in memory and durably on disk.
    await seedDurableEnvelope([waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();
    const firstTree = await renderWithProviders(<AuthedCartProbe />, { withAuth: true });
    await screen.findByText("hydrated:true total:1 lines:1 persistence:persisted locked:false");

    // RNTL's `unmount` is an async act — awaiting it is mandatory, exactly like
    // every other act in this file.
    await firstTree.unmount();
    mockAuthHolder.current?.restore();
    // A different customer signs in on the same tablet.
    mockAuthHolder.current = installMockAuth({
      profile: { ...TEST_PROFILE, id: OTHER_OWNER, display_name: "Next Customer" },
    });

    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });

    // The hook re-hydrated for the new owner: their cart is empty (nothing of
    // theirs on disk), the previous owner's in-memory lines were discarded by
    // the owner-switch reset, and the mismatched durable envelope was
    // discarded too — the next cold start cannot read it back (AC-01).
    await screen.findByText("hydrated:true total:0 lines:0 persistence:persisted locked:false");
    expect(screen.queryByText("line:Sparkling Water:1")).toBeNull();
    expect(useCartStore.getState().ownerId).toBe(OTHER_OWNER);
    expect((await readPersistedCart()).status).toBe("miss");
  });
});

describe("plain cart actions (non-React callers)", () => {
  it("hydrateCart hydrates the singleton for an owner, and addItem works outside any component", async () => {
    await cartApi.hydrateCart(OWNER);

    expect(useCartStore.getState().hydrated).toBe(true);
    expect(useCartStore.getState().ownerId).toBe(OWNER);

    cartApi.addItem(waterInput);
    await settleDurableWrites();

    expect(useCartStore.getState().lines).toEqual([waterLine]);
  });

  it("lockCart locks the cart (addItem becomes a no-op) until unlockCart", async () => {
    await cartApi.hydrateCart(OWNER);
    cartApi.addItem(waterInput);

    cartApi.lockCart();
    expect(useCartStore.getState().locked).toBe(true);

    // AC-09: user-driven mutations are no-ops while locked, never throws.
    cartApi.addItem(cappuccinoInput);
    expect(useCartStore.getState().lines).toEqual([waterLine]);

    cartApi.unlockCart();
    expect(useCartStore.getState().locked).toBe(false);

    cartApi.addItem(cappuccinoInput);
    // The store derives the line identity itself (variantId + SORTED option
    // value ids — plan decision 3), so the expected line carries the derived
    // id, never the display-order id of the cappuccinoLine fixture above.
    expect(useCartStore.getState().lines).toEqual([
      waterLine,
      { ...cappuccinoInput, lineId: deriveLineId(cappuccinoInput) },
    ]);
  });

  it("setLineQuantity, removeLine and clearCart drive the store from a non-React context", async () => {
    await cartApi.hydrateCart(OWNER);
    cartApi.addItem(waterInput);
    await settleDurableWrites();

    cartApi.setLineQuantity(waterLine.lineId, 5);
    await settleDurableWrites();
    expect(useCartStore.getState().lines).toEqual([{ ...waterLine, quantity: 5 }]);

    cartApi.removeLine(waterLine.lineId);
    await settleDurableWrites();
    expect(useCartStore.getState().lines).toEqual([]);

    cartApi.clearCart();
    await settleDurableClear();
    // Memory was already empty; the durable key is gone and the honest status
    // is reported (a clear, not a memory-only warning).
    expect((await readPersistedCart()).status).toBe("miss");
    expect(useCartStore.getState().persistence).toBe("persisted");
  });

  it("getCartSnapshot returns a frozen-in-time plain snapshot, derived through the same selectors", async () => {
    useCartStore.setState({
      lines: [waterLine, cappuccinoLine],
      ownerId: OWNER,
      persistence: "persisted",
      hydrated: true,
      locked: false,
    });

    const snapshot = cartApi.getCartSnapshot();

    expect(snapshot).toEqual({
      lines: [waterLine, cappuccinoLine],
      totalQuantity: 3,
      distinctLineCount: 2,
      persistence: "persisted",
      hydrated: true,
      locked: false,
      ownerId: OWNER,
    });

    // A snapshot, never a live view: after the store changes, the values
    // captured at call time stand still (the store's rules replace arrays
    // and objects, never mutate them in place).
    cartApi.lockCart();
    cartApi.addItem(waterInput);
    await settleDurableWrites();
    expect(snapshot.locked).toBe(false);
    expect(snapshot.totalQuantity).toBe(3);
    expect(snapshot.lines).toEqual([waterLine, cappuccinoLine]);
    // The snapshot's status field carries the public type contract.
    const status: PersistenceStatus = snapshot.persistence;
    expect(status).toBe("persisted");
  });
});
