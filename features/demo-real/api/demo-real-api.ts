import { AppError } from "@/core/errors";
import { demoRealPayloadSchema, type DemoRealItem } from "../schemas/demo-real-schema";

/**
 * The ONLY place in this feature that talks to Supabase.
 *
 * Screens and components must not import the Supabase client — ESLint enforces
 * this. Keeping the network in one module is what makes the feature testable:
 * a test mocks this boundary, not the whole client.
 *
 * Rules:
 *  - Validate every payload with the feature's Zod schema.
 *  - Let `callRpc` normalise failures into `AppError`; do not catch and rethrow
 *    raw Postgres errors.
 *  - Never work around RLS. If the data is not reachable for this role, that is
 *    a backend contract decision, not something to solve in the client.
 */

export async function fetchDemoRealList(): Promise<DemoRealItem[]> {
  // TODO: implement. Replace the throw below with a real call, e.g.
  //
  //   import { callRpc } from "@/core/supabase";
  //   return callRpc("get_customer_catalog", {}, demoRealPayloadSchema);
  //
  // Available RPCs for this client (see docs/data-and-supabase.md):
  //   current_active_profile()                     — identity
  //   get_customer_catalog()                       — customer catalog snapshot
  //   create_order(client_request_id, items)       — customer checkout
  //   update_order_status(order_id, status, reason)— preparation/admin transition
  //
  // Preparation may also SELECT directly from `orders` and `order_items`.
  // Customers may not read any table directly.
  throw new AppError({
    kind: "unknown",
    userMessage: "This isn't available yet.",
    technicalMessage: "fetchDemoRealList is not implemented — see features/demo-real/TODO.md",
    code: "NOT_IMPLEMENTED",
  });
}
