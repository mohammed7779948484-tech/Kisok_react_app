import { useRef as mockUseRef } from "react";
import { Text, View as MockView } from "react-native";

import { renderWithProviders, screen } from "@/core/testing";

import { CatalogGrid } from "./catalog-grid";

let mockLayoutSize: "compact" | "medium" | "expanded" = "compact";
let mockNextMountId = 0;

jest.mock("@/core/responsive", () => ({
  useResponsiveValue: (values: { compact: number; medium: number; expanded: number }) =>
    values[mockLayoutSize],
}));

jest.mock("@shopify/flash-list", () => {
  return {
    FlashList: ({
      data,
      renderItem,
      keyExtractor,
      numColumns,
      horizontal,
    }: {
      data: readonly string[];
      renderItem: (info: { item: string; index: number; target: "Cell" }) => React.ReactElement;
      keyExtractor: (item: string, index: number) => string;
      numColumns: number;
      horizontal: boolean;
    }) => {
      const mountId = mockUseRef(++mockNextMountId).current;

      return (
        <MockView
          testID="catalog-flash-list"
          accessibilityLabel={`columns ${numColumns}, horizontal ${horizontal}, mount ${mountId}`}
        >
          {data.map((item, index) => (
            <MockView key={keyExtractor(item, index)} testID={`flash-cell-${item}`}>
              {renderItem({ item, index, target: "Cell" })}
            </MockView>
          ))}
        </MockView>
      );
    },
  };
});

beforeEach(() => {
  mockLayoutSize = "compact";
  mockNextMountId = 0;
});

describe("CatalogGrid", () => {
  it.each([
    ["compact", 2],
    ["medium", 3],
    ["expanded", 4],
  ] as const)("uses FlashList with %s columns", async (size, columns) => {
    mockLayoutSize = size;

    await renderWithProviders(
      <CatalogGrid
        data={["alpha", "beta"]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>}
      />,
    );

    expect(screen.getByTestId("catalog-flash-list")).toHaveProp(
      "accessibilityLabel",
      `columns ${columns}, horizontal false, mount 1`,
    );
    const alpha = screen.getByText("alpha");
    const alphaFlashCell = screen.getByTestId("flash-cell-alpha");

    expect(alpha).toBeOnTheScreen();
    expect(screen.getByText("beta")).toBeOnTheScreen();
    expect(alpha.parent).not.toBe(alphaFlashCell);
    expect(alpha.parent?.parent).toBe(alphaFlashCell);
  });

  it("remounts the virtualized grid only when the responsive column count changes", async () => {
    const props = {
      data: ["alpha"],
      keyExtractor: (item: string) => item,
      renderItem: ({ item }: { item: string }) => <Text>{item}</Text>,
    };
    const { rerender } = await renderWithProviders(<CatalogGrid {...props} />);

    expect(screen.getByTestId("catalog-flash-list")).toHaveProp(
      "accessibilityLabel",
      "columns 2, horizontal false, mount 1",
    );

    await rerender(<CatalogGrid {...props} />);
    expect(screen.getByTestId("catalog-flash-list")).toHaveProp(
      "accessibilityLabel",
      "columns 2, horizontal false, mount 1",
    );

    mockLayoutSize = "medium";
    await rerender(<CatalogGrid {...props} />);
    expect(screen.getByTestId("catalog-flash-list")).toHaveProp(
      "accessibilityLabel",
      "columns 3, horizontal false, mount 3",
    );
  });
});
