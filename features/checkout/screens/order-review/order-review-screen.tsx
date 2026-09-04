import { useEffect, useRef, useState } from "react";

import { ShoppingCart } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BlockingOverlay, EmptyState, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Alert, Button, Text } from "@/components/ui";
import { createLogger } from "@/core/logging";
import { getCartSnapshot, useCart } from "@/features/cart";

import { OrderLineRow } from "../../components/order-line-row";
import { normalizeCartLines, type NormalizedRequest } from "../../model/normalized-request";
import { useSubmitOrderMutation } from "../../queries/use-submit-order-mutation";
import {
  classifySubmitOutcome,
  useAttemptStore,
  type AttemptPhase,
} from "../../state/attempt-store";

import {
  FailureOutcomePanel,
  StockConflictPanel,
  UnknownOutcomePanel,
} from "./components/outcome-panels";

const log = createLogger("checkout.review");

// The Screen primitive's edges contract (R-T09-01): the bottom inset has
// exactly ONE owner per presentation — the fixed footer's own bottom-edge
// SafeAreaView while the footer is mounted (populated), Screen itself (all
// four edges) in the footer-less presentations (restore-pending, empty),
// exactly like full-cart-screen and the other footer-less screens.
const FOOTER_EDGES = ["top", "left", "right"] as const;
const FOOTERLESS_EDGES = ["top", "bottom", "left", "right"] as const;

/**
 * The routed Checkout Review screen (T08 content, T09 submission flow):
 * the final read-only review AND the orchestration that submits it.
 *
 * Division of labour (plan D8): the ATTEMPT STORE owns every phase
 * transition — `review → submitting → {confirmed | stock-conflict | unknown |
 * failed}` — and this screen owns the sequence: guard → normalize (T02) →
 * `prepareAttempt` (durable-before-network, AC-06) → submit through the
 * generated mutation hook (plan D13 — the screen's transport; the store's
 * replay path calls the api module directly) → `classifySubmitOutcome` (D3's
 * single ambiguity boundary) → the store's resolve actions. No screen-local
 * `isLoading + error`: the six states are the store's, so the recovery gate
 * and every surface render the SAME machine.
 *
 * It consumes `useCart()` from `@/features/cart`'s public API for the
 * content, `getCartSnapshot()` for the press-time defensive read, and the
 * attempt store through per-field selectors — the narrow imports sanctioned
 * for this feature (the store import is relative and inside `features/
 * checkout`; no Supabase anywhere near a screen).
 *
 * States (capability-aware — exactly the six the machine can reach plus the
 * review's pre-submission cart states): restore-pending → `SkeletonList`;
 * empty → shared `EmptyState` escape; populated → rows + summary + footer.
 * The outcome phases render from the store: submitting → the shared
 * `BlockingOverlay` over the screen with BOTH footer actions disabled
 * beneath it (the double-press and touch-interception mechanism, AC-04 —
 * the doc comment on BlockingOverlay names this exact use); stock-conflict
 * → the conflict panel replaces the rows and Return to Cart replaces
 * Confirm (AC-08); unknown → the warning alert + Check Again, and NO Back
 * to Cart (the cart is locked while the outcome is unknown — movement
 * stays possible only through the panel's action, which is exactly why the
 * panel is the only affordance); failed → the destructive alert + Try Again
 * only where the kind is retryable, always Back to Cart (AC-10). Confirmed
 * → navigate to `/checkout-success` (the route materializes in T13; the
 * push string is the contract).
 *
 * Persistence honesty (AC-03, unchanged from T08): `memoryOnly` → warning
 * Alert, `clearFailed` → destructive Alert. Pre-submission REFUSALS
 * (normalization throw, a failed durable write, a defensive prepare
 * refusal) are screen-LOCAL warnings — the store stayed idle, so they never
 * masquerade as outcome phases — held in local React state that clears on
 * the next attempt or Back.
 *
 * The fixed footer follows the Screen primitive's edges contract (see
 * R-T09-01 above). Use design-system components and semantic token classes
 * — never a raw hex colour or an inline dimension that should be a token.
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

  // The store is the single phase authority (D8): per-field subscriptions so
  // this screen re-renders only when the fields it renders change — the
  // phase (which presentation), the conflict payload, the failure payload.
  const phase = useAttemptStore((state) => state.phase);
  const conflict = useAttemptStore((state) => state.conflict);
  const failure = useAttemptStore((state) => state.failure);
  // D13: the screen's transport — the generated mutation hook. Deliberately
  // thin; the attempt lifecycle lives in the store.
  const submitOrderMutation = useSubmitOrderMutation();

  // A pre-submission refusal (a local validation throw, a failed durable
  // write, a defensive prepare refusal): screen-local, cleared on the next
  // attempt or Back. The store stayed idle — this is a warning, never an
  // outcome phase.
  const [prepareNotice, setPrepareNotice] = useState<{ title: string; description: string } | null>(
    null,
  );

  // Mount reset (T09): re-entering review from the cart after a previous
  // DEFINITE outcome must not greet the corrected cart with the stale
  // panel. `enterReview` is the store's own action (resets to idle + clears
  // the payloads; it refuses from unknown/submitting/confirmed, which is
  // exactly the right refusal — those phases own the session until the
  // recovery gate or the success flow resolves them).
  //
  // Mount-time ONLY, read through `getState()` inside the effect with empty
  // deps: resetting on phase CHANGES while mounted would destroy a panel the
  // customer is still reading — the machine persists an outcome until the
  // customer leaves (or a fresh mount resets it).
  useEffect(() => {
    const { phase: phaseAtMount } = useAttemptStore.getState();
    if (phaseAtMount === "stock-conflict" || phaseAtMount === "failed") {
      useAttemptStore.getState().enterReview();
    }
  }, []);

  // Confirmed → the success route. Fires ONCE per phase TRANSITION (the ref
  // holds the previous phase), not once per render: the re-renders that
  // follow confirmation (the cart clear, the cleanup tracker) must not
  // re-navigate, while a legitimate SECOND confirmation on a later attempt
  // still would.
  const lastPhaseRef = useRef<AttemptPhase>("idle");
  useEffect(() => {
    if (phase === "confirmed" && lastPhaseRef.current !== "confirmed") {
      router.push("/checkout-success");
    }
    lastPhaseRef.current = phase;
  }, [phase, router]);

  /**
   * The submission orchestration (T09). One press = guard → normalize →
   * prepare (durable-before-network) → submit through the hook → classify →
   * resolve. Everything that can refuse does so honestly and locally; the
   * store owns every phase flip in between.
   */
  const handleConfirm = async () => {
    // AC-04 duplicate suppression, handler layer: while a submission (first
    // attempt or replay) is in flight the machine is "submitting" and this
    // press is ignored. The overlay and the disabled affordance are the two
    // UI layers of the same guarantee; this guard holds when a press slips
    // through them (and for a Try Again double-press during the failed →
    // submitting window).
    if (useAttemptStore.getState().phase === "submitting") return;

    // Defensive press-time re-check of the live cart. The button's
    // enablement encodes this rule for the footer's own press, but Try
    // Again reaches the same flow, and the future's entry points are not
    // all known: nothing is submitted from an unrestored, empty, or locked
    // cart, whatever pressed the button.
    const snapshot = getCartSnapshot();
    if (
      !snapshot.hydrated ||
      snapshot.lines.length === 0 ||
      snapshot.locked ||
      snapshot.ownerId === null
    ) {
      log.warn("Confirm Order ignored: the cart is not safely submittable");
      return;
    }

    // A previous attempt's pre-submission notice clears on the next attempt.
    setPrepareNotice(null);

    // T02's pure rules. The guards above preclude the EMPTY cart only: the
    // cart caps each line's QUANTITY (1..99, cart-rules addLine), never the
    // line count, so a cart with more than 100 DISTINCT variants passes
    // them and reaches this call — where normalizeCartLines legitimately
    // refuses it (as it does any per-variant quantity outside the RPC
    // ceiling). Every throw is handled as a LOCAL validation refusal: the
    // warning below, the store stays idle, no network call — never a
    // crash, never a silent reshape of what the customer confirmed
    // (AC-05's hard stops).
    let normalized: NormalizedRequest;
    try {
      normalized = normalizeCartLines(snapshot.lines);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("Confirm Order refused: the cart could not be normalized into a request", {
        reason,
      });
      setPrepareNotice({
        title: "We couldn't prepare your order",
        description: "Please try again. If it keeps happening, please let store staff know.",
      });
      return;
    }

    // Durable-before-network (AC-06): prepareAttempt mints the idempotency
    // identity and persists the record BEFORE it hands back a request to
    // submit — an ambiguous result is always recoverable by replaying the
    // durable id.
    const prepare = await useAttemptStore.getState().prepareAttempt({
      ownerId: snapshot.ownerId,
      lines: snapshot.lines,
      normalized,
    });
    if (!prepare.ok) {
      if (prepare.reason === "persist-failed") {
        // The pre-submit durable write was rejected: the network call never
        // happened (AC-06) — the honest, specific warning.
        setPrepareNotice({
          title: "We couldn't save your order details to this tablet",
          description: "Your order wasn't submitted — please try again.",
        });
      } else {
        // recovery-pending / unresolved-attempt-exists / confirmed-attempt-
        // present — unreachable through this screen's own phase gating in
        // the delivered app: T12's RecoveryGate runs `recover()` at layout
        // mount before any review is reachable, and unknown/confirmed never
        // render this footer's Confirm. Defensive, logged, generic.
        log.warn("Confirm Order refused by the attempt store", { reason: prepare.reason });
        setPrepareNotice({
          title: "We couldn't start your submission",
          description: "Please try again in a moment.",
        });
      }
      return;
    }

    // D13: the screen path submits through the generated hook; the store's
    // replay path (Check Again) calls the api module directly — both end at
    // the same classifier below.
    try {
      const response = await submitOrderMutation.mutateAsync(prepare.request);
      const outcome = classifySubmitOutcome({ response });
      if (outcome.kind === "success") {
        await useAttemptStore.getState().resolveSuccess({
          orderId: outcome.response.order_id,
          displayNumber: outcome.response.display_number,
          createdAt: outcome.response.created_at,
        });
      } else if (outcome.kind === "stock-conflict") {
        await useAttemptStore.getState().resolveStockConflict(outcome.conflicts);
      } else {
        // Unreachable by the classifier's contract (a response means the
        // server answered — only success and stock_conflict families
        // validate). Fail SAFE, not silent: hold the attempt unresolved
        // rather than leave the machine stuck in "submitting" with a locked
        // cart and no way out.
        log.warn("Classified a response as a non-response outcome; holding the attempt", {
          outcomeKind: outcome.kind,
        });
        useAttemptStore.getState().resolveUnknown();
      }
    } catch (error) {
      const outcome = classifySubmitOutcome({ error });
      if (outcome.kind === "definite-failure") {
        await useAttemptStore.getState().resolveDefiniteFailure(outcome.error);
      } else {
        // Ambiguous (network / unknown / an unclassifiable rejection): the
        // durable record IS the safety net — the store holds it unresolved
        // and keeps the cart locked (AC-09); Check Again replays it.
        useAttemptStore.getState().resolveUnknown();
      }
    }
  };

  /** Back to Cart — explicit navigation, and the notice-clearing escape. */
  const handleBackToCart = () => {
    setPrepareNotice(null);
    router.push("/cart");
  };

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

  // AC-03's no-unsafe-submit rule, extended for T09 (the machine's phase):
  // the confirm affordance exists only when the cart is hydrated, populated,
  // unlocked AND the machine is idle — any other phase owns the footer.
  const canSubmit = hydrated && lines.length > 0 && !locked && phase === "idle";
  // While a submission (or replay) is in flight both footer actions render
  // disabled beneath the overlay (AC-04: back navigation is prevented too).
  const submitting = phase === "submitting";

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
          {/* Outcome alerts render with the review content (the cart is
              preserved in both phases — the customer is still looking at
              what they submitted); the conflict panel REPLACES the rows
              because its rows ARE the affected lines. */}
          {phase === "unknown" ? <UnknownOutcomePanel /> : null}
          {phase === "failed" && failure !== null ? (
            <FailureOutcomePanel failure={failure} />
          ) : null}
          {prepareNotice !== null ? (
            <Alert
              variant="warning"
              title={prepareNotice.title}
              description={prepareNotice.description}
            />
          ) : null}
        </View>

        {phase === "stock-conflict" && conflict !== null ? (
          <StockConflictPanel conflicts={conflict} lines={lines} />
        ) : lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="There's nothing to review or submit yet."
            action={{ label: "Back to Cart", onPress: handleBackToCart }}
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
          state's escape is the empty cart's way forward. The footer's
          actions follow the machine's phase — the store decides which
          affordance owns the way forward. */}
      {lines.length > 0 ? (
        // The Screen primitive omits the "bottom" safe-area edge (FOOTER_EDGES)
        // while this footer is mounted, so this SafeAreaView is the bottom
        // inset's single owner (R-T09-01).
        <SafeAreaView edges={["bottom"]}>
          <View className="gap-3 border-t border-border px-6 py-4">
            <Text variant="body" tone="muted">
              {summary}
            </Text>
            {phase === "stock-conflict" ? (
              // The one way forward (AC-08): the store already unlocked the
              // cart at resolve; this button only moves. Replaces Confirm —
              // and Back with it: two buttons pushing the same route is not
              // a choice, it is noise on a kiosk.
              <Button variant="primary" size="large" block onPress={() => router.push("/cart")}>
                <Text>Return to Cart</Text>
              </Button>
            ) : phase === "unknown" ? (
              // The ONLY movement in this phase (AC-09): the cart is locked
              // because the outcome is unknown, so Back to Cart is absent —
              // the panel's action is the customer's way through, and it
              // replays the SAME idempotency identity through the store
              // (never a fresh id, which could create a second order).
              <Button
                variant="primary"
                size="large"
                block
                onPress={() => {
                  void useAttemptStore.getState().replayAttempt();
                }}
              >
                <Text>Check Again</Text>
              </Button>
            ) : phase === "failed" ? (
              <>
                {failure !== null && failure.retryable ? (
                  // A NEW attempt is legitimate after a definite failure:
                  // the old identity was discarded at resolve, so the next
                  // prepare mints a fresh id. The deliberate distinction
                  // from the unknown phase's same-identity replay — minting
                  // THERE would be the K1003 duplicate-order bug.
                  <Button
                    variant="primary"
                    size="large"
                    block
                    onPress={() => {
                      void handleConfirm();
                    }}
                  >
                    <Text>Try Again</Text>
                  </Button>
                ) : null}
                <Button variant="outline" size="large" onPress={handleBackToCart}>
                  <Text>Back to Cart</Text>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="large"
                  disabled={submitting}
                  onPress={handleBackToCart}
                >
                  <Text>Back to Cart</Text>
                </Button>
                <Button
                  variant="primary"
                  size="large"
                  block
                  disabled={!canSubmit}
                  onPress={() => {
                    void handleConfirm();
                  }}
                >
                  <Text>Confirm Order</Text>
                </Button>
              </>
            )}
          </View>
        </SafeAreaView>
      ) : null}

      {/* The submitting overlay (AC-04): covers content AND footer, claims
          the touch on native, and announces the in-flight state — the
          double-press and back-navigation-prevention mechanism, on top of
          the disabled affordances beneath it. The server's idempotency
          contract is what actually prevents a duplicate; this makes the
          double press not happen. */}
      <BlockingOverlay visible={submitting} label="Submitting your order…" />
    </Screen>
  );
}
