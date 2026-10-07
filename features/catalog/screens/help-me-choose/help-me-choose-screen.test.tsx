import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import { createCatalogSnapshotFixture } from "../../model/catalog-snapshot.fixture";
import type { CatalogSnapshot } from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { HelpMeChooseScreen, type HelpMeChooseScreenProps } from "./help-me-choose-screen";

/**
 * Screen behaviour for Help Me Choose (phase 4, GD-04 – GD-07).
 *
 * The feature's own `api/` module is the seam; the guided rules themselves are
 * pinned in `model/guided-discovery.test.ts`, so these tests assert what a
 * customer sees and can do. `useFocusEffect` runs as a plain effect, and the
 * page only lays out once its container is measured, so every populated test
 * delivers that layout pass with `measureLayout()`.
 *
 * Fake timers: FlashList's deferred layout work fires timers that would escape
 * `act` under real timers, and TanStack's batched observer notification is a
 * `setTimeout(0)` that only lands once timers advance.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.useFakeTimers();

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

type HostNode = {
  props: Record<string, unknown>;
  children: readonly (HostNode | string)[];
};

/** Deliver a layout pass to every container that renders nothing until measured. */
async function measureLayout(width = 1200) {
  const measured = new Set<HostNode>();
  for (let pass = 0; pass < 5; pass += 1) {
    const pending: HostNode[] = [];
    const visit = (node: HostNode) => {
      if (
        typeof node.props.onLayout === "function" &&
        node.children.length === 0 &&
        !measured.has(node)
      ) {
        pending.push(node);
      }
      node.children.forEach((child) => {
        if (typeof child !== "string") visit(child);
      });
    };
    visit(screen.container as unknown as HostNode);
    if (pending.length === 0) return;
    for (const node of pending) {
      measured.add(node);
      await fireEvent(node as never, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } },
      });
    }
  }
}

// --- A small catalog with the real store's shape --------------------------
// Two roots; vapes split by brand with many mostly-unique flavours (too many
// to tap); pouches with a Strength of two values; some variants out of stock.

type VariantSpec = { options?: Record<string, string>; title?: string; available?: boolean };
type ProductSpec = {
  id: string;
  name: string;
  brand: string;
  category: string;
  variants: VariantSpec[];
};

const CATEGORY = { vapes: "cat-vapes", pouches: "cat-pouches" } as const;
const BRAND = {
  cloud: "brand-cloud",
  puff: "brand-puff",
  velo: "brand-velo",
  zyn: "brand-zyn",
} as const;
const PRODUCT = {
  cloudOne: "product-cloud-one",
  cloudTwo: "product-cloud-two",
  puffMax: "product-puff-max",
  puffMini: "product-puff-mini",
  veloFreeze: "product-velo-freeze",
  zynCool: "product-zyn-cool",
  zynCitrus: "product-zyn-citrus",
} as const;

const brands = [
  { id: BRAND.cloud, name: "Cloud Co" },
  { id: BRAND.puff, name: "Puff Lab" },
  { id: BRAND.velo, name: "Velo" },
  { id: BRAND.zyn, name: "Zyn" },
];

const flavors = (...names: string[]): VariantSpec[] =>
  names.map((name) => ({ options: { Flavor: name } }));

const products: ProductSpec[] = [
  {
    id: PRODUCT.cloudOne,
    name: "Cloud One",
    brand: BRAND.cloud,
    category: CATEGORY.vapes,
    variants: [
      ...flavors("Mint Ice", "Blueberry Ice", "Peach", "Lemon Lime"),
      { options: { Flavor: "Mango" }, available: false },
    ],
  },
  {
    id: PRODUCT.cloudTwo,
    name: "Cloud Two",
    brand: BRAND.cloud,
    category: CATEGORY.vapes,
    variants: flavors("Strawberry", "Spearmint", "Cherry", "Grape", "Banana"),
  },
  {
    id: PRODUCT.puffMax,
    name: "Puff Max",
    brand: BRAND.puff,
    category: CATEGORY.vapes,
    variants: flavors("Watermelon", "Cola", "Mint Ice"),
  },
  {
    id: PRODUCT.puffMini,
    name: "Puff Mini",
    brand: BRAND.puff,
    category: CATEGORY.vapes,
    variants: flavors("Grape"),
  },
  {
    id: PRODUCT.veloFreeze,
    name: "Velo Freeze",
    brand: BRAND.velo,
    category: CATEGORY.pouches,
    variants: [
      { options: { Strength: "6mg" }, title: "Freeze 6mg" },
      { options: { Strength: "10mg" }, title: "Freeze 10mg" },
    ],
  },
  {
    id: PRODUCT.zynCool,
    name: "Zyn Cool",
    brand: BRAND.zyn,
    category: CATEGORY.pouches,
    variants: [{ options: { Strength: "6mg" } }],
  },
  {
    id: PRODUCT.zynCitrus,
    name: "Zyn Citrus",
    brand: BRAND.zyn,
    category: CATEGORY.pouches,
    variants: [
      { options: { Strength: "10mg" } },
      { options: { Strength: "6mg" }, available: false },
    ],
  },
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const typeId = (name: string) => `type-${slug(name)}`;
const valueId = (type: string, value: string) => `value-${slug(type)}-${slug(value)}`;

function guidedSnapshot({ withoutBrand }: { withoutBrand?: string } = {}): CatalogSnapshot {
  const keptBrands = brands.filter((brand) => brand.id !== withoutBrand);
  const keptProducts = products.filter((product) => product.brand !== withoutBrand);

  const optionValues: CatalogSnapshot["option_values"] = [];
  const variants: CatalogSnapshot["variants"] = [];
  const links: CatalogSnapshot["variant_option_values"] = [];
  for (const product of keptProducts) {
    product.variants.forEach((variant, index) => {
      const id = `${product.id}-v${index + 1}`;
      variants.push({
        id,
        product_id: product.id,
        sku: `SKU-${id}`,
        barcode: null,
        title_override: variant.title ?? null,
        search_keywords: null,
        display_order: (index + 1) * 10,
        is_available: variant.available ?? true,
        available_quantity: variant.available === false ? 0 : 10,
      });
      for (const [type, value] of Object.entries(variant.options ?? {})) {
        const id2 = valueId(type, value);
        if (!optionValues.some((existing) => existing.id === id2)) {
          optionValues.push({
            id: id2,
            option_type_id: typeId(type),
            value,
            display_order: (optionValues.length + 1) * 10,
          });
        }
        links.push({ variant_id: id, option_type_id: typeId(type), option_value_id: id2 });
      }
    });
  }

  return createCatalogSnapshotFixture({
    brands: keptBrands.map((brand, index) => ({
      id: brand.id,
      name: brand.name,
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
      display_order: (index + 1) * 10,
    })),
    categories: [
      { id: CATEGORY.vapes, name: "Vapes" },
      { id: CATEGORY.pouches, name: "Pouches" },
    ].map((category, index) => ({
      ...category,
      parent_id: null,
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
      display_order: (index + 1) * 10,
    })),
    products: keptProducts.map((product, index) => ({
      id: product.id,
      name: product.name,
      brand_id: product.brand,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: (index + 1) * 10,
      is_featured: false,
    })),
    product_categories: keptProducts.map((product) => ({
      product_id: product.id,
      category_id: product.category,
    })),
    option_types: ["Flavor", "Strength"].map((name, index) => ({
      id: typeId(name),
      name,
      display_order: (index + 1) * 10,
    })),
    option_values: optionValues,
    variants,
    variant_option_values: links,
    variant_media: [],
  });
}

// --- Helpers ----------------------------------------------------------------

const allProductNames = [
  "Cloud One",
  "Cloud Two",
  "Puff Max",
  "Puff Mini",
  "Velo Freeze",
  "Zyn Cool",
  "Zyn Citrus",
];

/** The product cards in the results, by product name. */
function resultNames(): string[] {
  const grid = screen.getByTestId("help-me-choose-results");
  return within(grid)
    .queryAllByRole("button")
    .map((element) => element.props.accessibilityLabel as string | undefined)
    .flatMap((label) => {
      const name = label?.split(",")[0];
      return name && allProductNames.includes(name) ? [name] : [];
    })
    .sort();
}

function heading(name: string | RegExp) {
  return screen.getByRole("header", { name });
}

async function renderGuided(
  props: HelpMeChooseScreenProps = {},
  {
    snapshot = guidedSnapshot(),
    width = 1200,
  }: { snapshot?: CatalogSnapshot; width?: number } = {},
) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<HelpMeChooseScreen {...props} />);
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "KISOK Test Store, explore the store" }),
    ).toBeOnTheScreen(),
  );
  await measureLayout(width);
  return result;
}

function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  setLogSink(() => {});
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
});

describe("HelpMeChooseScreen", () => {
  it("asks for a root category first, with product counts, over live results", async () => {
    await renderGuided();

    expect(screen.getByText("Help me choose")).toBeOnTheScreen();
    expect(heading("What are you shopping for?")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Vapes, 4 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pouches, 3 products" })).toBeOnTheScreen();
    expect(screen.getByTestId(`help-me-choose-choice-${CATEGORY.vapes}`)).toBeOnTheScreen();

    // Results are there from the first moment, before any answer.
    expect(screen.getByText("7 matches")).toBeOnTheScreen();
    expect(resultNames()).toEqual([...allProductNames].sort());
    // Nothing to start over from yet.
    expect(screen.queryByTestId("help-me-choose-start-over")).toBeNull();
  });

  it("narrows the results when a category is tapped and asks the next question", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));

    expect(screen.getByText("4 matches")).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two", "Puff Max", "Puff Mini"]);
    // Vapes split by brand: flavours are too many to tap.
    expect(heading("Which brand?")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cloud Co, 2 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Puff Lab, 2 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Change Vapes" })).toBeOnTheScreen();
  });

  it("asks pouches by strength and narrows to products with an available variant of it", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Pouches, 3 products" }));

    expect(heading("Which strength?")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "6mg, 2 products" }));

    // Zyn Citrus's 6mg is out of stock, so it is not a 6mg result.
    expect(resultNames()).toEqual(["Velo Freeze", "Zyn Cool"]);
    expect(screen.getByText("2 matches")).toBeOnTheScreen();
  });

  it("skips a question with No preference and moves on without narrowing", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByTestId("help-me-choose-skip"));

    expect(heading("Anything specific?")).toBeOnTheScreen();
    expect(screen.getByText("4 matches")).toBeOnTheScreen();
    expect(screen.getByLabelText("Describe what you want")).toBeOnTheScreen();
  });

  it("removes an answer with its ✕, which only widens the results", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two"]);

    await user.press(screen.getByRole("button", { name: "Remove Cloud Co" }));
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two", "Puff Max", "Puff Mini"]);
    expect(screen.queryByRole("button", { name: "Change Cloud Co" })).toBeNull();
    expect(heading("Which brand?")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Remove Vapes" }));
    expect(screen.getByText("7 matches")).toBeOnTheScreen();
    expect(heading("What are you shopping for?")).toBeOnTheScreen();
  });

  it("changes an answer from its chip, replacing it in place", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    expect(heading("Anything specific?")).toBeOnTheScreen();
    // With Cloud Co chosen only vapes remain, so Vapes can be removed but
    // there is nothing to change it to.
    expect(screen.queryByRole("button", { name: "Change Vapes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Vapes" })).toBeOnTheScreen();

    // Editing, then cancelling, leaves everything as it was.
    await user.press(screen.getByRole("button", { name: "Change Cloud Co" }));
    expect(heading("Which brand?")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Cloud Co, 2 products", selected: true }),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cancel" }));
    expect(heading("Anything specific?")).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two"]);

    await user.press(screen.getByRole("button", { name: "Change Cloud Co" }));
    await user.press(screen.getByRole("button", { name: "Puff Lab, 2 products" }));

    expect(screen.getByRole("button", { name: "Change Puff Lab" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Remove Cloud Co" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Vapes" })).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Puff Max", "Puff Mini"]);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("narrows by free text over variant text and says how many options match", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));

    expect(heading("Anything specific?")).toBeOnTheScreen();
    const input = screen.getByLabelText("Describe what you want");
    expect(input.props.placeholder).toBe("e.g. mint, ice, 10mg");

    await user.type(input, "ice");

    expect(screen.getByText("1 match")).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Cloud One"]);
    // Mint Ice and Blueberry Ice; the card says so.
    expect(screen.getByText("Your choices · 2 options")).toBeOnTheScreen();
    // The term is an answer of its own, removable like the others.
    expect(screen.getByText("“ice”")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Remove “ice”" }));
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two"]);
    expect(screen.getByLabelText("Describe what you want").props.value).toBe("");
  });

  it("fills the term from a suggestion chip", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Pouches, 3 products" }));
    await user.press(screen.getByTestId("help-me-choose-skip"));
    // Strength is settled; brand stays eligible for pouches.
    await user.press(screen.getByTestId("help-me-choose-skip"));
    expect(heading("Anything specific?")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: /^10mg, / }));

    expect(screen.getByLabelText("Describe what you want").props.value).toBe("10mg");
    expect(resultNames()).toEqual(["Velo Freeze", "Zyn Citrus"]);
  });

  it("keeps a term with no match recoverable: announced, editable, clearable, answers kept", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    await user.type(screen.getByLabelText("Describe what you want"), "cola");

    const message = "No matches for “cola” with your other choices.";
    const [announcement] = screen.getAllByText(message);
    expect(announcement).toHaveProp("accessibilityLiveRegion", "polite");
    expect(screen.getByText("0 matches")).toBeOnTheScreen();
    expect(resultNames()).toEqual([]);

    // Nothing else was taken away, and the term is still there to edit.
    expect(screen.getByRole("button", { name: "Remove Vapes" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Cloud Co" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Describe what you want").props.value).toBe("cola");
    // The results area is not a dead end either.
    expect(screen.getByTestId("help-me-choose-results-clear-term")).toBeOnTheScreen();

    await user.press(screen.getByTestId("help-me-choose-clear-term"));

    expect(screen.queryByText(message)).toBeNull();
    expect(screen.getByText("2 matches")).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Cloud One", "Cloud Two"]);
    expect(screen.getByLabelText("Describe what you want").props.value).toBe("");
  });

  it("says no-match once when the questions sit above the results", async () => {
    const user = setupUser();
    await renderGuided({}, { width: 700 });

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    await user.type(screen.getByLabelText("Describe what you want"), "cola");

    // Stacked, the panel's message sits right above the results: one is enough.
    expect(screen.getAllByText("No matches for “cola” with your other choices.")).toHaveLength(1);
    expect(screen.getByTestId("help-me-choose-clear-term")).toBeOnTheScreen();
    expect(screen.queryByTestId("help-me-choose-results-clear-term")).toBeNull();
  });

  it("starts over back to the opening question", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    await user.type(screen.getByLabelText("Describe what you want"), "ice");

    await user.press(screen.getByTestId("help-me-choose-start-over"));

    expect(heading("What are you shopping for?")).toBeOnTheScreen();
    expect(screen.getByText("7 matches")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByTestId("help-me-choose-start-over")).toBeNull();
  });

  it("opens pre-scoped to a category, shown as a removable answer", async () => {
    const user = setupUser();
    await renderGuided({ categoryId: CATEGORY.pouches });

    expect(screen.getByRole("button", { name: "Change Pouches" })).toBeOnTheScreen();
    expect(heading("Which strength?")).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Velo Freeze", "Zyn Citrus", "Zyn Cool"]);

    // Start over returns to that scope, not to the whole store.
    await user.press(screen.getByRole("button", { name: "6mg, 2 products" }));
    await user.press(screen.getByTestId("help-me-choose-start-over"));
    expect(screen.getByRole("button", { name: "Change Pouches" })).toBeOnTheScreen();
    expect(screen.getByText("3 matches")).toBeOnTheScreen();
  });

  it("drops a scope with nothing in stock on first open without claiming the catalog changed", async () => {
    await renderGuided({ categoryId: "no-such-category" });

    expect(screen.queryByText("Some choices changed because the catalog was updated.")).toBeNull();
    expect(screen.getByRole("button", { name: "Vapes, 4 products" })).toBeOnTheScreen();
  });

  it("opens pre-scoped to a brand", async () => {
    await renderGuided({ brandId: BRAND.zyn });

    expect(screen.getByRole("button", { name: "Remove Zyn" })).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Zyn Citrus", "Zyn Cool"]);
    expect(screen.getByText("2 matches")).toBeOnTheScreen();
  });

  it("hands the committed answers to Product Detail with the result", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Pouches, 3 products" }));
    await user.press(screen.getByRole("button", { name: "6mg, 2 products" }));
    await user.press(screen.getByRole("button", { name: "Zyn Cool, by Zyn, Available" }));

    // Category and brand are product-level; only the option answer travels on.
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/product-detail",
      params: {
        productId: PRODUCT.zynCool,
        backLabel: "Back to Help me choose",
        match: expect.stringMatching(/^o\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      },
    });
  });

  it("opens Product Detail for a result, named for the way back", async () => {
    const user = setupUser();
    await renderGuided();

    await user.press(screen.getByRole("button", { name: "Zyn Cool, by Zyn, Available" }));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/product-detail",
      params: { productId: PRODUCT.zynCool, backLabel: "Back to Help me choose" },
    });
  });

  it("puts the questions beside the results when wide and above them when narrow", async () => {
    await renderGuided();
    const grid = screen.getByTestId("help-me-choose-results");
    expect(within(grid).queryByTestId("help-me-choose-question")).toBeNull();
    expect(screen.getByTestId("help-me-choose-question")).toBeOnTheScreen();
  });

  it("keeps the questions in the one scrolling list on a narrow screen", async () => {
    await renderGuided({}, { width: 700 });
    const grid = screen.getByTestId("help-me-choose-results");
    expect(within(grid).getByTestId("help-me-choose-question")).toBeOnTheScreen();
    expect(resultNames()).toEqual([...allProductNames].sort());
  });

  it("reconciles answers when the catalog refreshes and says so", async () => {
    const user = setupUser();
    const { queryClient } = await renderGuided();

    await user.press(screen.getByRole("button", { name: "Vapes, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Cloud Co, 2 products" }));
    expect(screen.queryByText("Some choices changed because the catalog was updated.")).toBeNull();

    mockFetchCatalog.mockResolvedValue(guidedSnapshot({ withoutBrand: BRAND.cloud }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    const notice = screen.getByText("Some choices changed because the catalog was updated.");
    expect(notice).toHaveProp("accessibilityLiveRegion", "polite");
    expect(screen.queryByRole("button", { name: "Remove Cloud Co" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change Vapes" })).toBeOnTheScreen();
    expect(resultNames()).toEqual(["Puff Max", "Puff Mini"]);
  });

  it("announces loading before the first snapshot", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<HelpMeChooseScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    expect(screen.queryByTestId("help-me-choose-question")).toBeNull();
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(
      new AppError({
        kind: "server",
        userMessage: "We couldn't load the catalog. Please try again.",
        technicalMessage: "rpc failed",
      }),
    );
    const user = setupUser();

    await renderWithProviders(<HelpMeChooseScreen />);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
