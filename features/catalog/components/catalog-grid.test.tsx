import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogProductView } from "../model/catalog-view";

import { CatalogGrid, type CatalogGridRowInfo } from "./catalog-grid";
import { ProductCard } from "./product-card";

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

jest.useFakeTimers();

/**
 * `core/responsive` reads `useWindowDimensions` off the react-native module
 * object at call time, so redefining that property on the actual module is the
 * seam that drives `useLayout`/`useResponsiveValue` in this suite. Verified
 * against `useResponsiveValue` before relying on it.
 */
const actualReactNative = jest.requireActual("react-native") as typeof import("react-native");

type WindowDimensions = { width: number; height: number; scale: number; fontScale: number };

const mockUseWindowDimensions = jest.fn<WindowDimensions, []>(() => ({
  width: 480,
  height: 900,
  scale: 2,
  fontScale: 1,
}));

Object.defineProperty(actualReactNative, "useWindowDimensions", {
  configurable: true,
  writable: true,
  value: mockUseWindowDimensions,
});

function setWindowWidth(width: number) {
  mockUseWindowDimensions.mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
}

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

/**
 * A fresh element per call with the same stable prop values: `rerender` must
 * receive a new element, otherwise React bails out on identical element
 * identity and never re-reads the mocked window width.
 */
function gridElement(
  onItemPress: (item: CatalogProductView) => void,
  renderItemFn: (info: CatalogGridRowInfo<CatalogProductView>) => React.ReactElement = renderItem,
  className?: string,
) {
  return (
    <CatalogGrid
      data={products}
      renderItem={renderItemFn}
      keyExtractor={keyExtractor}
      onItemPress={onItemPress}
      testID={GRID_TEST_ID}
      className={className}
    />
  );
}

describe("CatalogGrid", () => {
  afterEach(() => {
    mockUseWindowDimensions.mockReturnValue({ width: 480, height: 900, scale: 2, fontScale: 1 });
  });

  it.each([
    [480, 2],
    [800, 3],
    [1280, 4],
  ])("renders %i columns at window width %i", async (width, columns) => {
    setWindowWidth(width);
    await renderWithProviders(gridElement(jest.fn()));

    const list = screen.getByTestId(GRID_TEST_ID);
    expect(list.props.numColumns).toBe(columns);
  });

  it("renders every item through the row contract", async () => {
    await renderWithProviders(gridElement(jest.fn()));

    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
    expect(screen.getByText("Everyday Tote")).toBeOnTheScreen();
    expect(screen.getByText("Pocket Notebook")).toBeOnTheScreen();
  });

  it("hands every row one stable press handler and routes presses to onItemPress", async () => {
    const onItemPress = jest.fn();
    const rowHandlers: ((item: CatalogProductView) => void)[] = [];
    const renderTrackingItem = (info: CatalogGridRowInfo<CatalogProductView>) => {
      rowHandlers.push(info.onPress);
      return renderItem(info);
    };

    await renderWithProviders(gridElement(onItemPress, renderTrackingItem));

    expect(rowHandlers.length).toBe(products.length);
    for (const handler of rowHandlers.slice(1)) {
      expect(handler).toBe(rowHandlers[0]);
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole("button", { name: "Café Crème, Available" }));

    expect(onItemPress).toHaveBeenCalledTimes(1);
    expect(onItemPress).toHaveBeenCalledWith(coffee);
  });

  it("keeps the virtualizer's row props stable across re-renders", async () => {
    setWindowWidth(800);
    const onItemPress = jest.fn();
    const { rerender } = await renderWithProviders(gridElement(onItemPress));

    const before = screen.getByTestId(GRID_TEST_ID);
    const rowRenderer = before.props.renderItem;
    const contentContainerStyle = before.props.contentContainerStyle;

    await rerender(gridElement(onItemPress));

    const after = screen.getByTestId(GRID_TEST_ID);
    expect(after.props.renderItem).toBe(rowRenderer);
    expect(after.props.contentContainerStyle).toBe(contentContainerStyle);
  });

  it("re-lays out when the window width crosses a breakpoint", async () => {
    setWindowWidth(480);
    const onItemPress = jest.fn();
    const { rerender } = await renderWithProviders(gridElement(onItemPress));

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(2);

    setWindowWidth(1280);
    await rerender(gridElement(onItemPress));

    expect(screen.getByTestId(GRID_TEST_ID).props.numColumns).toBe(4);
    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
  });

  it("accepts a className without disturbing the grid", async () => {
    await renderWithProviders(<View>{gridElement(jest.fn(), renderItem, "test-grid-class")}</View>);

    expect(screen.getByTestId(GRID_TEST_ID)).toBeOnTheScreen();
    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
  });
});
