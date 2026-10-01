import { View } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { fireEvent, renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogProductView } from "../model/catalog-view";

import { CatalogGrid, type CatalogGridProps, type CatalogGridRowInfo } from "./catalog-grid";
import { ProductCard } from "./product-card";

/**
 * The grid re-reports its scroll offset whenever its screen regains focus.
 * Outside a navigator, run the focus callback as an ordinary effect — the
 * screen is focused while it is mounted.
 */
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.useFakeTimers();

const catalogView = createCatalogView(createCatalogSnapshotFixture());
const products = catalogView.products;

function requireProduct(productId: string): CatalogProductView {
  const product = catalogView.resolveProduct(productId);
  if (product === undefined) {
    throw new Error(`fixture product ${productId} was not projected into the view`);
  }
  return product;
}

const coffee = requireProduct(catalogFixtureIds.products.coffee);

function keyExtractor(product: CatalogProductView): string {
  return product.id;
}

function renderItem({ item, onPress }: CatalogGridRowInfo<CatalogProductView>) {
  return <ProductCard product={item} onPress={onPress} />;
}

const GRID_TEST_ID = "catalog-grid";
const HOST_TEST_ID = "catalog-grid-host";

type GridOverrides = Partial<CatalogGridProps<CatalogProductView>>;

/**
 * A fresh element per call with the same stable prop values: `rerender` must
 * receive a new element, otherwise React bails out on identical element
 * identity.
 */
function gridElement(
  onItemPress: (item: CatalogProductView) => void,
  overrides: GridOverrides = {},
) {
  return (
    <View testID={HOST_TEST_ID}>
      <CatalogGrid
        data={products}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onItemPress={onItemPress}
        testID={GRID_TEST_ID}
        {...overrides}
      />
    </View>
  );
}

type HostNode = { children: readonly (HostNode | string)[] };

/** The grid measures the width it is given; deliver that layout pass. */
async function layoutGrid(width: number) {
  const host = screen.getByTestId(HOST_TEST_ID) as unknown as HostNode;
  const container = host.children[0];
  if (container === undefined || typeof container === "string") {
    throw new Error("CatalogGrid did not render its measuring container");
  }
  await fireEvent(container as never, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } },
  });
}

beforeEach(() => {
  // Product cards resolve fixture media whose stored public ids differ from
  // their delivery paths; the Cloudinary helper reports that at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  resetLogging();
});

describe("CatalogGrid", () => {
  it("renders nothing until it has measured the width it is given", async () => {
    await renderWithProviders(gridElement(jest.fn()));

    expect(screen.queryByTestId(GRID_TEST_ID)).not.toBeOnTheScreen();
    expect(screen.queryByText("Café Crème")).not.toBeOnTheScreen();
  });

  it.each([
    [500, 1],
    [560, 2],
    [840, 3],
    [1200, 4],
    [2400, 4],
  ])("lays out a %ipx-wide grid in %i columns", async (width, columns) => {
    await renderWithProviders(gridElement(jest.fn()));
    await layoutGrid(width);

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(columns);
  });

  it("gives up a column to the region reserved beside it and to its padding", async () => {
    await renderWithProviders(gridElement(jest.fn(), { leadingInset: 300 }));
    await layoutGrid(1200);
    // 1200 − 300 leaves room for three 260dp cells, not four.
    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(3);
  });

  it("honours a caller's maximum column count", async () => {
    await renderWithProviders(gridElement(jest.fn(), { maxColumns: 2 }));
    await layoutGrid(2400);

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(2);
  });

  it("renders every item through the row contract", async () => {
    await renderWithProviders(gridElement(jest.fn()));
    await layoutGrid(1200);

    // One card — one whole-card button — per product, never per variant.
    expect(screen.getAllByRole("button")).toHaveLength(products.length);
    for (const product of products) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${product.name}, `) }),
      ).toBeOnTheScreen();
    }
  });

  it("renders the caller's empty state when there is no data", async () => {
    await renderWithProviders(
      gridElement(jest.fn(), {
        data: [],
        listEmptyComponent: <View accessibilityLabel="Nothing here" accessible />,
      }),
    );
    await layoutGrid(1200);

    expect(screen.getByLabelText("Nothing here")).toBeOnTheScreen();
  });

  it("hands every row one stable press handler and routes presses to onItemPress", async () => {
    const onItemPress = jest.fn();
    const rowHandlers: ((item: CatalogProductView) => void)[] = [];
    const renderTrackingItem = (info: CatalogGridRowInfo<CatalogProductView>) => {
      rowHandlers.push(info.onPress);
      return renderItem(info);
    };

    await renderWithProviders(gridElement(onItemPress, { renderItem: renderTrackingItem }));
    await layoutGrid(1200);

    expect(rowHandlers.length).toBeGreaterThanOrEqual(products.length);
    for (const handler of rowHandlers.slice(1)) {
      expect(handler).toBe(rowHandlers[0]);
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    );

    expect(onItemPress).toHaveBeenCalledTimes(1);
    expect(onItemPress).toHaveBeenCalledWith(coffee);
  });

  it("keeps the virtualizer's row props stable across re-renders", async () => {
    const onItemPress = jest.fn();
    const { rerender } = await renderWithProviders(gridElement(onItemPress));
    await layoutGrid(840);

    const before = screen.getByTestId(GRID_TEST_ID);
    const rowRenderer = before.props.renderItem;
    const contentContainerStyle = before.props.contentContainerStyle;

    await rerender(gridElement(onItemPress));

    const after = screen.getByTestId(GRID_TEST_ID);
    expect(after.props.renderItem).toBe(rowRenderer);
    expect(after.props.contentContainerStyle).toBe(contentContainerStyle);
  });

  it("re-lays out when its measured width crosses a column boundary", async () => {
    await renderWithProviders(gridElement(jest.fn()));
    await layoutGrid(560);

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(2);

    await layoutGrid(1200);

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(4);
    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
  });

  it("reports the list offset: zero when it (re)mounts, then every scroll", async () => {
    const onScrollOffset = jest.fn();
    await renderWithProviders(gridElement(jest.fn(), { onScrollOffset }));
    await layoutGrid(1200);

    expect(onScrollOffset).toHaveBeenLastCalledWith(0);

    await fireEvent.scroll(screen.getByTestId(GRID_TEST_ID), {
      nativeEvent: {
        contentOffset: { x: 0, y: 320 },
        contentSize: { width: 1200, height: 3000 },
        layoutMeasurement: { width: 1200, height: 900 },
      },
    });

    expect(onScrollOffset).toHaveBeenLastCalledWith(320);

    // A new column count remounts the list at the top; say so.
    await layoutGrid(560);

    expect(onScrollOffset).toHaveBeenLastCalledWith(0);
  });
});
