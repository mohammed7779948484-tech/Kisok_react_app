import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { Alert, Button, Text } from "@/components/ui";
import { useActiveProfile } from "@/core/auth";
import { cn } from "@/core/utils";
import { useCart } from "@/features/cart";

import { useAttemptStore, type RecoveryOutcome } from "../state/attempt-store";

import { ConflictRow } from "./conflict-row";

/**
 * The session-level recovery composition (T12, AC-13; plan D7): mounted ONCE
 * in `app/(customer)/_layout.tsx` INSIDE `CatalogCartProvider` (so the cart
 * hydration owner stays unique), wrapping the customer Stack.
 *
 * WHAT IT OWNS — and why it must be HERE, not in a screen:
 *
 * - `recover()` runs at MOUNT, before any checkout surface is reachable. This
 *   is what closes the sign-out guard's restart window (R2-03/todo's note):
 *   the guard reads the IN-MEMORY record, so until this read lands, a
 *   previous session's durable unresolved record is invisible to it. It also
 *   lifts `prepareAttempt`'s `recovery-pending` gate (F-06-02) for the whole
 *   session. Recovery living inside the review screen only was explicitly
 *   rejected — correctness must not depend on that screen having stayed
 *   mounted.
 * - The recovery SURFACES: the blocking panel for an unresolved same-owner
 *   attempt, and the cleanup-resolution panel for a confirmed attempt whose
 *   cart clear is not yet proven safe. Children ALWAYS render beneath
 *   (dimmed, blocked by the overlay): the cart is locked by the store, the
 *   sign-out is guarded, and the panel is the only interaction.
 *
 * Division of labour (plan D8): the ATTEMPT STORE is the single phase
 * authority — this component never mutates a phase itself. It subscribes
 * through per-field selectors (`phase`, `conflict`, `failure`, and the
 * cleanup tracker below), drives the store's PUBLIC actions only
 * (`recover`, `replayAttempt`, `retryCleanup`), and navigates. The one piece
 * of component-local state is the episode flag below, which ends THIS
 * component's involvement without touching the machine.
 *
 * Importing `@/features/checkout` in the layout (this component's public
 * entry) is also the module load that makes checkout's sign-out guard
 * registration live — the same side-effect pattern the cart feature's index
 * uses.
 *
 * It must not import the Supabase client (the store's replay path goes
 * through the feature's own api module) and reaches the cart only through
 * its public index.
 */
export type RecoveryGateProps = {
  /** The customer experience the gate composes over — the routed Stack. */
  children: ReactNode;
};

export function RecoveryGate({ children }: RecoveryGateProps) {
  const router = useRouter();
  // The customer layout is authenticated — the same contract `useCart` (the
  // layout's own hydration owner) relies on. `useActiveProfile()` throwing
  // outside an authenticated experience is core/auth's contract, not a defect
  // to code around.
  const profile = useActiveProfile();
  // The conflict join's display context (D9): the PRESERVED cart, restored by
  // the layout's own hydration. `useCart()` is the cart feature's public
  // consumer hook — a second subscriber here is composition, never a second
  // hydration owner (the hook's same-owner hydrate is idempotent, and the
  // provider's mount stays the owner of record).
  const { lines } = useCart();

  // The machine, subscribed per-field (D8): the phase decides which recovery
  // presentation owns the surface, and the outcome payloads render verbatim.
  const phase = useAttemptStore((state) => state.phase);
  const conflict = useAttemptStore((state) => state.conflict);
  const failure = useAttemptStore((state) => state.failure);
  // The cleanup watch (AC-11/AC-13): a boolean selector, so the gate
  // re-renders only when the confirmed record's tracker actually flips to
  // "done" — the signal that the retried clear landed and the success flow
  // can own the session.
  const cleanupDone = useAttemptStore(
    (state) => state.record?.status === "confirmed" && state.record.cleanup.cartClear === "done",
  );

  // What `recover()` found this session — null until the mount-time read
  // lands. Routing follows the store's own `RecoveryOutcome` classification.
  const [outcome, setOutcome] = useState<RecoveryOutcome | null>(null);
  // The recovery EPISODE is over: it resolved to a success handoff, or the
  // customer took a definite outcome's way out. After this the gate is inert
  // for the rest of the session — a later in-session submission and its
  // confirmation belong to the review screen and the success route, never to
  // this composition (otherwise the overlay would rise again over a live
  // submission's "submitting" phase, and a second confirmation would be
  // re-navigated from under the review screen's own handoff).
  const [episodeEnded, setEpisodeEnded] = useState(false);

  // ---- recover() at mount (D7) — once per session ---------------------------
  const recoverStartedRef = useRef(false);
  useEffect(() => {
    // The ref guard is the "once per session" intent: the layout mounts per
    // session, and while `recover()` is itself idempotent, re-running it on
    // profile re-renders would be IO driven by render noise. A profile
    // SWITCH without a remount does not happen through the delivered
    // sign-out flow (it unmounts the whole (customer) group); if it ever
    // did, the store's own guards still own correctness — `recordLoaded`,
    // the unresolved-record refusal and the sign-out guard read the machine,
    // not this component's presentation.
    if (recoverStartedRef.current) return;
    recoverStartedRef.current = true;
    let cancelled = false;
    void (async () => {
      const result = await useAttemptStore.getState().recover(profile.id);
      if (!cancelled) setOutcome(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  // ---- the auto-replay (AC-13): ONCE, with the STORED identity -------------
  const autoReplayFiredRef = useRef(false);
  useEffect(() => {
    if (outcome !== "unresolved" || autoReplayFiredRef.current) return;
    // The outcome landed and it is THIS profile's own unresolved attempt:
    // check it immediately — a customer who restarts into an ambiguous
    // submission should not have to press anything to learn whether their
    // order exists. ONE automatic flight, ever: further replays are the
    // customer's explicit "Check Again" presses, and every one re-sends the
    // same durable `clientRequestId` through the store (never a fresh mint —
    // the server's idempotency ledger is the duplicate-order barrier).
    autoReplayFiredRef.current = true;
    void useAttemptStore.getState().replayAttempt();
  }, [outcome]);

  // ---- the success handoff ---------------------------------------------------
  useEffect(() => {
    if (outcome === null || episodeEnded) return;
    const successReached =
      outcome === "confirmed-cleanup-done" ||
      (outcome === "confirmed-cleanup-pending" && cleanupDone) ||
      (outcome === "unresolved" && phase === "confirmed");
    if (!successReached) return;
    // The success screen owns the session from here: the record is confirmed,
    // and a restart mid-success lands back on it with a fresh countdown. For
    // the cleanup-pending case this fires when the retried clear is proven
    // done (the `cleanupDone` watch above) — the "poll the store state after
    // the retry resolves" contract, implemented as a subscription so no
    // landing path can be missed.
    setEpisodeEnded(true);
    router.replace("/checkout-success");
  }, [outcome, phase, cleanupDone, episodeEnded, router]);

  /** The way out of a definite no-order outcome: the (preserved) cart. */
  const handleReturnToCart = () => {
    // The episode ends here — the outcome was definite (no order exists),
    // the store discarded the record at resolve and unlocked the cart. The
    // machine's stale stock-conflict/failed phase is deliberately NOT reset
    // here: the review screen's own mount-reset (T09) cleans it when the
    // customer re-enters review, which is exactly what that reset is for —
    // a fresh review over the corrected cart.
    setEpisodeEnded(true);
    router.replace("/cart");
  };

  /** The unknown outcome's only way forward: re-check, same identity. */
  const handleCheckAgain = () => {
    void useAttemptStore.getState().replayAttempt();
  };

  /** The recovery-resolution surface's one action (AC-11/AC-13). */
  const handleRetryClear = () => {
    // Fire-and-forget by design: the `cleanupDone` selector is the watch.
    // The store's record update re-renders this gate, and the handoff effect
    // above navigates the moment the tracker flips to "done". A failed retry
    // keeps this surface standing — the store tracks the failure honestly
    // and the warning stays.
    void useAttemptStore.getState().retryCleanup();
  };

  // ---- the outcome routing (D7) -----------------------------------------------
  // Children render in EVERY branch — the overlay is the only thing above
  // them. `"none"` and both discard families never raise a surface (the
  // discards are already logged by the store; the app is simply normal), and
  // `"confirmed-cleanup-done"` never raises one either (straight to the
  // success handoff). An unresolved outcome keeps the surface up through the
  // whole episode: the in-flight check, the still-unknown hold, and the
  // definite no-order panels that end it. A cleanup-unsafe confirmation
  // keeps it up until the retried clear is proven done.
  const recoverySurfaceVisible =
    !episodeEnded &&
    (outcome === "unresolved"
      ? phase === "unknown" ||
        phase === "submitting" ||
        phase === "stock-conflict" ||
        phase === "failed"
      : outcome === "confirmed-cleanup-pending" && !cleanupDone);

  let panel: ReactNode = null;
  if (outcome === "confirmed-cleanup-pending") {
    // The recovery-resolution surface: the same honesty as the success
    // screen's unsafe-cleanup warning (the order IS confirmed — nothing is
    // wrong with it; the tablet is what is not ready) plus the one action
    // that finishes the cleanup.
    panel = (
      <>
        <Alert
          variant="destructive"
          title="We couldn't finish clearing this tablet for the next customer"
          description="This tablet isn't ready for the next person yet. Please let store staff know."
        />
        <Button variant="primary" size="large" block onPress={handleRetryClear}>
          <Text>Try Clearing Again</Text>
        </Button>
      </>
    );
  } else if (outcome === "unresolved") {
    if (phase === "submitting") {
      // The replay (auto or customer-pressed) is in flight: the honest copy
      // plus the checking state — the BlockingOverlay grammar.
      panel = (
        <>
          <RecoveryNotice />
          <View className="flex-row items-center justify-center gap-3">
            <ActivityIndicator size="large" />
            <Text variant="lead">Checking your order…</Text>
          </View>
        </>
      );
    } else if (phase === "unknown") {
      // The check came back still-ambiguous: the same honest copy, now with
      // the customer's explicit way through. No way back to the cart here —
      // the cart is locked while the outcome is unknown, so the panel's
      // action is the only movement.
      panel = (
        <>
          <RecoveryNotice />
          <Button variant="primary" size="large" block onPress={handleCheckAgain}>
            <Text>Check Again</Text>
          </Button>
        </>
      );
    } else if (phase === "stock-conflict") {
      panel = (
        <>
          <Alert
            variant="warning"
            title="Some items aren't available in the requested quantities"
            description="No order was submitted, and your cart wasn't changed. Return to your cart to adjust the quantities."
          />
          {/* Bounded like the review's rows (conflicts ≤ distinct variants
              ≤ 100): a plain ScrollView, no virtualization. */}
          {conflict !== null ? (
            <ScrollView className="max-h-96" contentContainerClassName="gap-3">
              {conflict.map((entry) => (
                <ConflictRow key={entry.variant_id} entry={entry} lines={lines} />
              ))}
            </ScrollView>
          ) : null}
          <Button variant="primary" size="large" block onPress={handleReturnToCart}>
            <Text>Return to Cart</Text>
          </Button>
        </>
      );
    } else if (phase === "failed") {
      panel = (
        <>
          <Alert
            variant="destructive"
            title="Your order didn't go through"
            description={failure?.userMessage ?? "Please let store staff know."}
          />
          <Button variant="primary" size="large" block onPress={handleReturnToCart}>
            <Text>Return to Cart</Text>
          </Button>
        </>
      );
    }
  }

  return (
    <View
      // z-50 only while a surface is up: the layout's cart affordance is
      // rendered by CatalogCartProvider as a LATER sibling of this gate, so
      // it otherwise floats above the routed content by paint order — during
      // recovery the panel is the only interaction, so the gate's subtree
      // stacks above it for exactly that long.
      className={cn("relative flex-1", recoverySurfaceVisible && "z-50")}
    >
      {children}
      {recoverySurfaceVisible ? (
        <View
          // The BlockingOverlay visual language: full-screen, dimmed,
          // touch-claiming, and `aria-modal` so assistive technology — and
          // RNTL, which mirrors it — treats the children beneath as
          // unreachable. Which is exactly the design: the panel is the only
          // interaction while a recovery surface is up.
          aria-modal
          className="absolute inset-0 z-50 items-center justify-center bg-background/85"
          onStartShouldSetResponder={() => true}
        >
          <View className="w-full max-w-xl gap-4 px-6">{panel}</View>
        </View>
      ) : null}
    </View>
  );
}

/** The recovery surface's standing honest copy (AC-13): what the check does. */
function RecoveryNotice() {
  return (
    <Alert
      variant="warning"
      title="We're checking your last order submission"
      description="It may already exist — we won't submit it twice."
    />
  );
}
