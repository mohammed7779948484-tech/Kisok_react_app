import { ShoppingCart } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Alert, Button, Text } from "@/components/ui";
import { useCart } from "@/features/cart";

import { OrderLineRow } from "../../components/order-line-row";

// The Screen primitive's edges contract (R-T09-01): the bottom inset has
// exactly ONE owner per presentation — the fixed footer's own bottom-edge
// SafeAreaView while the footer is mounted (populated), Screen itself (all
// four edges) in the footer-less presentations (restore-pending, empty),
// exactly like full-cart-screen and the other footer-less screens.
const FOOTER_EDGES = ["top", "left", "right"] as const;
const FOOTERLESS_EDGES = ["top", "bottom", "left", "right"] as const;

/**
 * The routed Checkout Review screen's CONTENT (T08, AC-02/AC-03): the hydrated
 * cart as a final read-only review before submission. The submission flow
 * itself is T09 — here the screen renders what will be submitted (per-line
 * product name, variant/options label, quantity), the totals summary, the
 * escapes, and the Confirm Order affordance with its real enablement but a
 * deliberately inert press.
 *
 * It consumes `useCart()` from `@/features/cart`'s public API — the narrow
 * view plus bound actions (that feature's plan decisions 11+15): the
 * per-slice subscriptions and the selector-derived totals live in the hook,
 * and mounting this screen under an authenticated profile IS the owner-scoped
 * restore trigger, exactly like the Full Cart screen — the screen itself
 * never hydrates and never touches the store beyond that one hook. No
 * Supabase, no deep feature imports, no checkout store: T08 is content only.
 *
 * States (capability-aware — the review is a local-state-driven screen, so
 * there is no server loading/error/retry here): restore-pending (async local
 * read) → `SkeletonList`, no rows, no empty state, no summary guess; empty →
 * shared `EmptyState` with the Back to Cart escape (nothing to submit, and a
 * dead end on a kiosk means an employee gets asked for help); populated → a
 * plain ScrollView of the shared read-only `OrderLineRow` + the fixed footer.
 * Persistence honesty (AC-03, the cart's exact contract and copy):
 * `memoryOnly` → warning Alert, `clearFailed` → destructive Alert — a safety
 * issue is never undersold as a memory-only nuisance. While locked, the
 * Confirm Order trigger renders DISABLED (the submission lock presentation —
 * full-cart's locked convention); the lock blocks submission and cart edits,
 * never movement, so Back to Cart stays enabled.
 *
 * The fixed footer follows the Screen primitive's own edges contract: while
 * the cart is populated, Screen omits the bottom edge and the fixed footer
 * wraps itself in a bottom-edge SafeAreaView (the primitive's documented
 * mechanism — "Omit 'bottom' when a fixed footer handles it"); in the
 * footer-less presentations (restore-pending, empty) Screen itself takes all
 * four edges. One bottom owner at a time, never two, never none.
 *
 * Back to Cart navigates EXPLICITLY (`router.push("/cart")`, AC-02): the
 * review must work from any entry — pushed from the cart's CTA, a deep link,
 * or a recovery return — so it never assumes a back stack. The summary line
 * above the actions derives its totals from the view's hook (the cart
 * feature's module selectors inside `useCart()`) — never a mirrored total.
 *
 * Use design-system components and semantic token classes — never a raw hex
 * colour or an inline dimension that should be a token.
 */
export function OrderReviewScreen() {
  const router = useRouter();
  // The single cart model through the cart feature's narrow public view: the
  // per-slice subscriptions and the selector-derived totals live inside
  // useCart() — never a mirrored or recomputed duplicate — and the hook's
  // effect, keyed on the active profile id, owns hydration: rendering this
  // screen under an authenticated profile IS the restore trigger.
  const view = useCart();
  const { lines, persistence, locked, hydrated, totalQuantity, distinctLineCount } = view;

  // Restore-pending: an async local read is in flight. Nothing else renders —
  // no rows to show, and an empty state or a summary derived from an
  // unrestored cart would be a guess presented as fact.
  if (!hydrated) {
    return (
      // No footer in this state, so Screen owns all four edges — the bottom
      // inset must never be left unowned (R-T09-01).
      <Screen edges={FOOTERLESS_EDGES}>
        <View className="p-6">
          <SkeletonList />
        </View>
      </Screen>
    );
  }

  // Full-cart's exact convention: total quantity, then distinct line count,
  // singular/plural each — derived from the same selectors the cart screen
  // renders, so the two surfaces can never disagree about the same cart.
  const summary = `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · ${distinctLineCount} ${
    distinctLineCount === 1 ? "line" : "lines"
  }`;

  // AC-03's no-unsafe-submit rule: the confirm affordance exists only when
  // the cart is hydrated, populated, and not locked. Inside the footer the
  // first two are structural (the footer mounts only with lines, and this
  // branch is only reached hydrated), but the guard stays explicit so the
  // enablement rule lives in one place when T09 wires the press.
  const canSubmit = hydrated && lines.length > 0 && !locked;

  return (
    // The footer renders only while there are lines, so the edges follow it:
    // footer mounted → Screen omits the bottom edge (the footer owns it);
    // footer-less (empty) → Screen owns it. Exactly one bottom owner either
    // way (R-T09-01).
    <Screen edges={lines.length > 0 ? FOOTER_EDGES : FOOTERLESS_EDGES}>
      <View className="flex-1">
        <View className="gap-3 px-6 pt-6">
          <Text variant="h1">Review Your Order</Text>
          {persistence === "memoryOnly" ? (
            <Alert
              variant="warning"
              title="Saved in memory only"
              description="We couldn't save your cart to this tablet, so it may be lost if the app closes."
            />
          ) : null}
          {persistence === "clearFailed" ? (
            <Alert
              variant="destructive"
              title="Couldn't clear the saved cart"
              description="A previous cart may still be stored on this tablet. Please let store staff know."
            />
          ) : null}
        </View>

        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="There's nothing to review or submit yet."
            action={{ label: "Back to Cart", onPress: () => router.push("/cart") }}
          />
        ) : (
          // No virtualization: the cart is bounded at 100 lines by the
          // create_order contract, so plain ScrollView mounts every row —
          // a virtualizer would add measurement complexity for no gain.
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-4">
            {lines.map((line) => (
              <OrderLineRow key={line.lineId} line={line} />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Summary + actions exist only with something to submit; the empty
          state's escape is the empty cart's way forward. */}
      {lines.length > 0 ? (
        // The Screen primitive omits the "bottom" safe-area edge (FOOTER_EDGES)
        // while this footer is mounted, so this SafeAreaView is the bottom
        // inset's single owner (R-T09-01).
        <SafeAreaView edges={["bottom"]}>
          <View className="gap-3 border-t border-border px-6 py-4">
            <Text variant="body" tone="muted">
              {summary}
            </Text>
            <Button variant="outline" size="large" onPress={() => router.push("/cart")}>
              <Text>Back to Cart</Text>
            </Button>
            <Button
              variant="primary"
              size="large"
              block
              disabled={!canSubmit}
              onPress={() => {
                // TODO(T09): the submission flow owns this press — confirm →
                // submitting (lock, overlay, duplicate suppression) → outcome
                // panels (conflict join, unknown retry, definite failure).
                // Until then this is a deliberate no-op: the button renders
                // its real enablement (AC-03) while wiring NO store, NO api,
                // and NO navigation — T08 is the review's content only.
              }}
            >
              <Text>Confirm Order</Text>
            </Button>
          </View>
        </SafeAreaView>
      ) : null}
    </Screen>
  );
}
