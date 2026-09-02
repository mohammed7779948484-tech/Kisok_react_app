import { ShoppingCart } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmDialog, EmptyState, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Alert, Button, Text } from "@/components/ui";

import { CartItemRow } from "../../components/cart-item-row";
import { selectDistinctLineCount, selectTotalQuantity, useCartStore } from "../../state/cart-store";

// The Screen primitive's edges contract (R-T09-01): the bottom inset has
// exactly ONE owner per presentation — the fixed footer's own bottom-edge
// SafeAreaView while the footer is mounted (populated), Screen itself (all
// four edges) in the footer-less presentations (restore-pending, empty),
// exactly like sign-in-screen and the other footer-less screens.
const FOOTER_EDGES = ["top", "left", "right"] as const;
const FOOTERLESS_EDGES = ["top", "bottom", "left", "right"] as const;

/**
 * The routed Full Cart management surface (plan decision 13, AC-11): the thin
 * `/cart` route renders this screen through the feature's public index. Unlike
 * the quick sheet, this screen is STATEFUL and owns its empty-state
 * navigation — "Browse Products" pushes the customer root through
 * expo-router's `useRouter()` (the sheet deliberately never imports a router;
 * its caller owns navigation, but a routed screen has nowhere else to hand the
 * escape). It reads the single cart store (`useCartStore`) and mutates it
 * through the store's own actions, so the screen can never drift from the one
 * cart model. ESLint boundaries permit store reads in feature screens; only
 * `app/**` routes are barred from Zustand.
 *
 * States (capability-aware — the cart is local-only client state, so there is
 * no server loading/error/retry here): restore-pending (async local read) →
 * `SkeletonList`, no rows, no empty state, no summary guess; empty → shared
 * `EmptyState` with the Browse Products escape; populated → ScrollView of the
 * shared `CartItemRow` (the cart is bounded at 100 lines by the create_order
 * contract, so plain ScrollView mounts every row — no virtualization).
 * Persistence honesty (AC-06, same contract as the sheet): `memoryOnly` →
 * warning Alert, `clearFailed` → destructive Alert — a safety issue is never
 * undersold as a memory-only nuisance. While locked (AC-09) every user control
 * renders disabled — the rows' controls AND the Clear Cart trigger. The
 * store-level `clearCart` lock exemption exists for the programmatic
 * post-checkout path, not for user clears mid-lock: a customer emptying the
 * cart while a critical operation runs is exactly the race the lock exists to
 * prevent, so the trigger is disabled and only the store's programmatic path
 * stays lock-exempt.
 *
 * The fixed footer follows the Screen primitive's own edges contract: the
 * bottom safe-area inset has exactly ONE owner per presentation. While the
 * cart is populated, Screen omits the bottom edge and the fixed footer wraps
 * itself in a bottom-edge SafeAreaView (the primitive's documented mechanism —
 * "Omit 'bottom' when a fixed footer handles it"); in the footer-less
 * presentations (restore-pending, empty) Screen itself takes all four edges,
 * like every other footer-less screen in the repo. When the footer unmounts
 * (the last line removed or the cart cleared), Screen re-claims the bottom
 * edge — one owner at a time, never two, never none. The summary block above
 * the destructive Clear Cart button derives its totals from the T04 module
 * selectors, never a mirrored total.
 *
 * It must not import the Supabase client or the catalog — the cart is
 * client-owned local state with no backend. Use design-system components and
 * semantic token classes — never a raw hex colour or an inline dimension that
 * should be a token.
 */
export function FullCartScreen() {
  const router = useRouter();
  // The single cart model: subscriptions are per-slice, and totals come from
  // the T04 module-level selectors — never a mirrored or recomputed duplicate.
  const lines = useCartStore((state) => state.lines);
  const persistence = useCartStore((state) => state.persistence);
  const locked = useCartStore((state) => state.locked);
  const hydrated = useCartStore((state) => state.hydrated);
  const totalQuantity = useCartStore(selectTotalQuantity);
  const distinctLineCount = useCartStore(selectDistinctLineCount);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

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

  const summary = `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · ${distinctLineCount} ${
    distinctLineCount === 1 ? "line" : "lines"
  }`;

  return (
    // The footer renders only while there are lines, so the edges follow it:
    // footer mounted → Screen omits the bottom edge (the footer owns it);
    // footer-less (empty) → Screen owns it. Exactly one bottom owner either
    // way (R-T09-01).
    <Screen edges={lines.length > 0 ? FOOTER_EDGES : FOOTERLESS_EDGES}>
      <View className="flex-1">
        <View className="gap-3 px-6 pt-6">
          <Text variant="h1">Your Cart</Text>
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
            description="Items you add while browsing will appear here."
            action={{ label: "Browse Products", onPress: () => router.push("/") }}
          />
        ) : (
          // No virtualization: the cart is bounded at 100 lines by the
          // create_order contract, so plain ScrollView mounts every row.
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-4">
            {lines.map((line) => (
              <CartItemRow
                key={line.lineId}
                line={line}
                locked={locked}
                onSetQuantity={(next) => useCartStore.getState().setLineQuantity(line.lineId, next)}
                onRemove={() => useCartStore.getState().removeLine(line.lineId)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Summary + clear affordance exist only with something to clear; the
          empty state's escape is the empty cart's way forward. */}
      {lines.length > 0 ? (
        // The Screen primitive omits the "bottom" safe-area edge (FOOTER_EDGES)
        // while this footer is mounted, so this SafeAreaView is the bottom
        // inset's single owner (R-T09-01).
        <SafeAreaView edges={["bottom"]}>
          <View className="gap-3 border-t border-border px-6 py-4">
            <Text variant="body" tone="muted">
              {summary}
            </Text>
            {/* Disabled while locked (AC-09): the store's lock exemption for
                clearCart covers the PROGRAMMATIC post-checkout clear, not a
                user clearing the cart mid-lock — that race is what the lock
                exists to prevent. */}
            <Button
              variant="destructive"
              size="large"
              block
              disabled={locked}
              onPress={() => setConfirmClearOpen(true)}
            >
              <Text>Clear Cart</Text>
            </Button>
          </View>
        </SafeAreaView>
      ) : null}

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear the cart?"
        description="All items will be removed from your cart. This can't be undone."
        confirmLabel="Remove All"
        destructive
        onConfirm={() => {
          setConfirmClearOpen(false);
          // The store's real signature: memory clears immediately, the
          // durable remove→fallback reports its honest status.
          useCartStore.getState().clearCart();
        }}
      />
    </Screen>
  );
}
