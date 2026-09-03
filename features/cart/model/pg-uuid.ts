import { z } from "zod";

/**
 * PostgreSQL-canonical UUID text, Cart-local.
 *
 * The server's `uuid` type accepts ANY 8-4-4-4-12 hex string — case
 * insensitive, with no RFC 9562 version ([1-8]) or variant ([89ab]) nibble
 * rule — and the migrations constrain nothing beyond that: ids default to
 * `gen_random_uuid()`'s v4 shape, but no CHECK forbids other canonical
 * values. Zod 4's `z.uuid()` enforces the RFC nibbles, so it is stricter
 * than the contract at this boundary: a canonical id that passed Catalog's
 * own canonical-uuid check would be rejected by `addToCartInputSchema`, and
 * the store's add path is a logged no-op on invalid input — a silent
 * user-facing failure (B-REMEDIATE-UUID).
 *
 * Cart-local deliberately. Catalog's equivalent `postgresUuidSchema` is
 * evidence for the semantics, not a dependency: cross-feature imports go
 * through public APIs only, and no shared uuid abstraction exists to reuse.
 */
export const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: "Expected canonical PostgreSQL UUID text",
  });
