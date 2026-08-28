import { demoRealItemSchema, demoRealPayloadSchema } from "../schemas/demo-real-schema";

/**
 * Schema tests are the cheapest guard against a backend contract change.
 * Extend these as you replace the placeholder fields with the real ones.
 */
describe("demo-real schema", () => {
  it("accepts a well-formed item", () => {
    const result = demoRealItemSchema.safeParse({
      id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
      label: "Example",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an item with a non-uuid id", () => {
    const result = demoRealItemSchema.safeParse({ id: "not-a-uuid", label: "Example" });

    expect(result.success).toBe(false);
  });

  it("rejects a payload that is not an array", () => {
    expect(demoRealPayloadSchema.safeParse({}).success).toBe(false);
  });
});
