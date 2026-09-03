import { postgresUuidSchema } from "./pg-uuid";

/**
 * Colocated with the validator it protects. The pinned contract is
 * PostgreSQL's uuid text input semantics — the shape of every id that flows
 * through the cart schemas — not RFC 9562: any 8-4-4-4-12 hex,
 * case-insensitive, with no version/variant nibble rules (B-REMEDIATE-UUID).
 *
 * The schema-level regression tests in cart-line.schema.test.ts and
 * persisted-cart.schema.test.ts are the failing-entry evidence for this
 * contract; this file pins the regex's own edge cases so a future
 * "simplification" of the pattern cannot silently reintroduce the nibble
 * restrictions or drop case-insensitivity.
 */

const ALL_HEX_NIBBLES = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
];

describe("postgresUuidSchema", () => {
  it("accepts an RFC 9562 v4 uuid — gen_random_uuid()'s shape must keep passing", () => {
    expect(postgresUuidSchema.safeParse("3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f").success).toBe(true);
  });

  it("accepts every version nibble 0-9 and a-f (PostgreSQL has no version rule)", () => {
    ALL_HEX_NIBBLES.forEach((nibble) => {
      const value = `0f4a9d3e-2b1c-${nibble}f8a-8e7d-5c6b8a3f1d2e`;
      expect(postgresUuidSchema.safeParse(value).success).toBe(true);
    });
  });

  it("accepts every variant nibble 0-9 and a-f (PostgreSQL has no variant rule)", () => {
    ALL_HEX_NIBBLES.forEach((nibble) => {
      const value = `3a7f2c1d-9b4e-4d6a-${nibble}f2c-7e1b5d9a4c3f`;
      expect(postgresUuidSchema.safeParse(value).success).toBe(true);
    });
  });

  it("accepts the exact nil and max uuids, and near-nil canonical hex", () => {
    expect(postgresUuidSchema.safeParse("00000000-0000-0000-0000-000000000000").success).toBe(true);
    expect(postgresUuidSchema.safeParse("ffffffff-ffff-ffff-ffff-ffffffffffff").success).toBe(true);
    expect(postgresUuidSchema.safeParse("00000000-0000-0000-0000-000000000001").success).toBe(true);
  });

  it("accepts uppercase hex — PostgreSQL uuid input is case-insensitive", () => {
    expect(postgresUuidSchema.safeParse("3A7F2C1D-9B4E-4D6A-8F2C-7E1B5D9A4C3F").success).toBe(true);
    expect(postgresUuidSchema.safeParse("0F4A9D3E-2B1C-0F8A-8E7D-5C6B8A3F1D2E").success).toBe(true);
  });

  it("rejects malformed values: grouping, non-hex, lengths, separators, empty, non-strings", () => {
    [
      "3a7f2c1d9b4e4d6a8f2c7e1b5d9a4c3f", // right characters, no dashes
      "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3", // 35 chars
      "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f0", // 37 chars
      "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3g", // 36 chars, one non-hex
      "3a7f2c1d_9b4e_4d6a_8f2c_7e1b5d9a4c3f", // wrong separator
      "not-a-uuid",
      "",
      42,
      null,
      undefined,
    ].forEach((value) => {
      expect(postgresUuidSchema.safeParse(value).success).toBe(false);
    });
  });
});
