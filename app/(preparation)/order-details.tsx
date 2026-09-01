import { useLocalSearchParams } from "expo-router";

import { OrderDetailsScreen } from "@/features/preparation";

/**
 * Route only. Adding a file here is the whole registration step — there is no
 * central route table to edit, which is what keeps parallel feature work from
 * conflicting.
 *
 * The route and its screen are named independently on purpose: this file's name
 * is a URL segment, the screen's name says what it shows. `index.tsx` rendering
 * `OrderDetailsScreen` is the normal case, not an exception.
 *
 * Keep this file thin: no data loading, no state, no business logic. If you need
 * route params, read them here with `useLocalSearchParams` and pass them to the
 * screen as props.
 *
 * Plan decision 1: a STATIC route with `orderId` as a query param
 * (`/order-details?orderId=…`) — the generator writes flat route files only.
 * The param passes through unvalidated; the SCREEN branches on a missing or
 * empty value and renders the unavailable state without mounting the read
 * (T03-R03) — a fabricated id would stringify into a doomed retryable request.
 */
export default function OrderDetailsRoute() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return <OrderDetailsScreen orderId={orderId} />;
}
