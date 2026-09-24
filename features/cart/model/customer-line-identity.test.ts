import { customerLineIdentity } from "./customer-line-identity";

describe("customer line identity", () => {
  it("removes a repeated variant caption without losing ordered selections", () => {
    expect(
      customerLineIdentity({
        productDisplayName: "Fruit Ice",
        variantLabel: " Frozen  Watermelon ",
        optionSelections: [
          {
            optionTypeId: "type-1",
            optionValueId: "value-1",
            optionValueLabel: "Frozen watermelon",
          },
          { optionTypeId: "type-2", optionValueId: "value-2", optionValueLabel: "Large" },
        ],
      }),
    ).toEqual({ title: "Fruit Ice", caption: "Frozen watermelon · Large" });
  });

  it("keeps a distinct override and handles older snapshots with no options", () => {
    expect(
      customerLineIdentity({
        productDisplayName: "Water",
        variantLabel: "500 ml Bottle",
        optionSelections: [],
      }).caption,
    ).toBe("500 ml Bottle");
    expect(
      customerLineIdentity({
        productDisplayName: "Water",
        variantLabel: "water",
        optionSelections: [],
      }).caption,
    ).toBe("");
  });
});
