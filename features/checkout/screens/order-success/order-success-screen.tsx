import { useEffect, useRef, useState } from "react";

import { BackHandler, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Alert, Button, Text } from "@/components/ui";
import { createLogger } from "@/core/logging";
import { useCustomerCatalogSettings } from "@/features/catalog";

import { OrderLineRow } from "../../components/order-line-row";
import { useAttemptStore } from "../../state/attempt-store";

import { SuccessCountdown } from "./components/success-countdown";

const log = createLogger("checkout.success");

/**
 * AC-14: the fallback window when the setting is absent (the snapshot's `{}`
 * settings member) or the shared query failed to resolve — the migration's
 * own default is 25s.
 */
const DEFAULT_RESET_SECONDS = 25;

// The Screen primitive's edges contract (R-T09-01, the review screen's
// convention): the bottom inset has exactly ONE owner per presentation — the
// fixed footer's own bottom-edge SafeAreaView while the footer is mounted
// (the confirmed experience), Screen itself (all four edges) in the
// footer-less presentations (escape, settings-pending skeleton, the blank
// post-reset frame during navigation).
const FOOTER_EDGES = ["top", "left", "right"] as const;
const FOOTERLESS_EDGES = ["top", "bottom", "left", "right"] as const;

/**
 * The routed Order Success screen (T11, AC-07/AC-14/AC-15): the confirmed
 * experience rendered from the attempt store's CONFIRMED record, and nothing
 * else — a "loading order from server" state deliberately does NOT exist
 * (customers cannot re-read orders; the record is local).
 *
 * Division of labour (plan D8): the ATTEMPT STORE owns the machine — this
 * screen only reads per-field selectors (`record`, `phase`, `persistence`)
 * and drives the store's public actions (`resetForNextCustomer`,
 * `retryCleanup`). The valid-confirmed gate mirrors the store's own reset
 * gate (record confirmed AND phase confirmed), so the screen can never offer
 * a reset the store would refuse for a reason it can see coming. Recovery
 * itself (loading the durable record) is T12's layout gate, not this
 * screen's — in the delivered app `recover()` has run before this route is
 * reachable.
 *
 * States (capability-aware — exactly the ones this screen can reach):
 *
 * - NO valid confirmed record (a stale/direct route, an unresolved attempt,
 *   or the moment after a completed reset): the AC-15 SAFE escape — a
 *   warning that explicitly does NOT encourage resubmission plus a single
 *   Back to Browse action to the customer home. NEVER the success content,
 *   never the cart.
 * - valid record + settings pending: a skeleton for the WHOLE presentation
 *   (documented call: the confirmed content includes the countdown, which
 *   needs a number; a half-rendered success state swapping its countdown in
 *   mid-presentation is a jarring kiosk experience, and the settings read is
 *   normally instant — the catalog query the customer already loaded). An
 *   ERROR settings read resolves the same way as an absent setting: the 25s
 *   fallback (AC-14).
 * - valid + settings resolved: the confirmed experience — the strong
 *   confirmed state, the display number (mono, LARGE — it is read aloud
 *   across a counter), the immutable submitted line snapshots through T08's
 *   read-only OrderLineRow, and the summary DERIVED from the record (never
 *   mirrored state). The footer follows the record's cleanup tracker:
 *   cleanup done → the countdown + Next Customer (the gated reset, shared by
 *   the button press and the countdown's expiry); cleanup pending → the same
 *   presentation with Next Customer DISABLED behind an accessible reason
 *   (the store's gate would refuse the reset until the clear is proven);
 *   cleanup unsafe (a failed clear, a failed durable discard, or a reset the
 *   store REFUSED) → the destructive honesty: the warning alert and ONE
 *   retry action, and NO reset affordance of any kind (AC-11 — the reset
 *   must never be offered while unsafe).
 *
 * The retry action's one behaviour (documented call): `retryCleanup()` then
 * the gated reset again — it completes the Next-Customer flow the customer
 * was trying to achieve, and the store's own gate decides again on every
 * attempt (a still-unsafe clear refuses and this presentation stays
 * standing, driven by the honest record/persistence selectors).
 *
 * R3-02 (AC-14's back-navigation half): the whole VALID confirmed
 * presentation guards Android's hardware/gesture BACK (the press is
 * consumed — the countdown's auto-reset cannot be killed by a pop); the
 * ESCAPE deliberately keeps standard back semantics (its one affordance,
 * Back to Browse, is the way forward, and hardware back from a
 * dead-end-free surface is an equally valid exit).
 *
 * No Supabase anywhere near the screen: the settings arrive through the
 * Catalog feature's public seam (plan D6 — the same shared query the catalog
 * screens loaded, no second fetch), the store is the feature's own state,
 * and the lines render through the checkout feature's shared read-only row.
 */
export function OrderSuccessScreen() {
  const router = useRouter();
  // The store is the single phase authority (D8): per-field subscriptions so
  // this screen re-renders only when the fields it renders change.
  const record = useAttemptStore((state) => state.record);
  const phase = useAttemptStore((state) => state.phase);
  const persistence = useAttemptStore((state) => state.persistence);
  // The T10 settings seam (plan D6). Hook order is unconditional; note the
  // query mounts on every presentation (the escape included) — harmless: it
  // is the SAME shared catalog query key, so it dedupes against the cache
  // the customer already loaded rather than creating a second server state.
  const settings = useCustomerCatalogSettings();

  // The screen-level interaction re-arm (F-T11-01): the countdown publishes
  // its `restart` into this ref, and the content root's pass-through
  // `onTouchStart` calls it — so ANY interaction on the success surface
  // (scrolling/reading the submitted items, not just the countdown's own
  // block) re-arms the inactivity window, per AC-14 and plan D10's "any user
  // interaction". A plain touch event, never responder negotiation: scroll
  // and nested presses behave exactly as before. Declared with the other
  // hooks — BEFORE the presentation early-returns (hooks order is
  // unconditional).
  const countdownReArmRef = useRef<(() => void) | null>(null);

  // A reset the store REFUSED that the record/persistence selectors do not
  // already explain (defensive phase drift): surfaced honestly rather than
  // silently ignored.
  const [resetRefused, setResetRefused] = useState(false);
  // The post-reset blank frame: after a successful reset the machine is idle
  // (which the escape branch would otherwise render a warning for) while the
  // router animates to the customer home — show the empty shell instead of a
  // flashing warning during the happy path.
  const [navigatingHome, setNavigatingHome] = useState(false);
  // Double-press / press-and-expiry race guard: one reset is in flight at a
  // time (the store's serialized chain makes even concurrent calls safe; the
  // guard keeps the UX from firing the same flow twice).
  const resetInFlightRef = useRef(false);

  // The valid-confirmed gate: the record IS the success payload (D1) and the
  // machine is in the confirmed phase — the same conditions the store's
  // reset gate checks, so the escape and the offered reset can never
  // disagree with the machine. Computed HERE, above the presentation
  // early-returns below, because the hardware-back guard's effect keys on it
  // and hooks order is unconditional (this screen's own convention).
  const confirmedRecord = record !== null && record.status === "confirmed" ? record : null;
  const isValidSuccess = confirmedRecord !== null && phase === "confirmed";

  // R3-02 (AC-14's back-navigation half): the hardware-back guard for the
  // confirmed presentation. The countdown owns the session here — its expiry
  // drives the AC-14 auto-reset — so a hardware back press that popped this
  // screen would kill the reset the kiosk depends on. The handler returns
  // true: the press is consumed, the router's back never runs, nothing is
  // logged. The WHOLE valid presentation is guarded — the settings-pending
  // skeleton and the unsafe-cleanup retry included — because the confirmed
  // record owns the session from the moment the presentation is valid until
  // the gated reset ends it; the ESCAPE deliberately keeps standard back
  // semantics (a dead-end-free surface whose one affordance, Back to Browse,
  // is the way forward — hardware back from it is an equally valid exit, the
  // documented call). Keyed on the derived flag so the guard leaves exactly
  // when the presentation does — the reset (phase idle) or unmount — with
  // clean removal in the teardown.
  useEffect(() => {
    if (!isValidSuccess) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [isValidSuccess]);

  /**
   * The gated Next-Customer reset (AC-14), shared by the button press and
   * the countdown's expiry: the store's own gate decides — only a CONFIRMED
   * order with proven-safe cleanup resets, and Checkout-owned success data
   * is cleared with it. A refused result surfaces the unsafe-cleanup warning
   * (the failed durable remove keeps the record for the next attempt).
   */
  const handleReset = async () => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    try {
      const result = await useAttemptStore.getState().resetForNextCustomer();
      if (result.status === "persisted") {
        setNavigatingHome(true);
        router.replace("/");
        return;
      }
      log.warn("The Next Customer reset was refused; surfacing the unsafe-cleanup warning", {
        reason: result.error.message,
      });
      setResetRefused(true);
    } finally {
      resetInFlightRef.current = false;
    }
  };

  /**
   * The one way out of the unsafe-cleanup presentation (AC-11): finish the
   * clear, then retry the gated reset — completing the Next-Customer flow.
   * A still-failing clear keeps the record honest (cartClear stays "failed"
   * / clearFailed) and this presentation standing.
   */
  const handleRetryClear = async () => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    try {
      await useAttemptStore.getState().retryCleanup();
      const result = await useAttemptStore.getState().resetForNextCustomer();
      if (result.status === "persisted") {
        setNavigatingHome(true);
        router.replace("/");
        return;
      }
      log.warn("The retried cleanup reset was refused; keeping the unsafe-cleanup warning", {
        reason: result.error.message,
      });
      setResetRefused(true);
    } finally {
      resetInFlightRef.current = false;
    }
  };

  // The post-reset blank frame during navigation.
  if (navigatingHome) {
    return <Screen edges={FOOTERLESS_EDGES} />;
  }

  // AC-15: the safe escape — a stale or direct route with no valid immutable
  // success payload. No success content, no cart, no countdown; the copy
  // explicitly does NOT encourage resubmitting an old cart.
  if (!isValidSuccess) {
    return (
      <Screen edges={FOOTERLESS_EDGES}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="gap-4 self-stretch">
            <Alert
              variant="warning"
              title="This order can't be shown here."
              description="If you just placed an order, it's safe — don't submit it again. Let store staff know if you need help."
            />
            <Button variant="primary" size="large" block onPress={() => router.replace("/")}>
              <Text>Back to Browse</Text>
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  // Settings pending: the whole presentation waits — the countdown needs a
  // number (see the doc comment for why the whole screen, not a part).
  if (settings.isPending) {
    return (
      <Screen edges={FOOTERLESS_EDGES}>
        <View className="p-6">
          <SkeletonList />
        </View>
      </Screen>
    );
  }

  // Settings resolved (data, or the fallback on absent/failed — AC-14).
  const seconds = settings.data?.customerSuccessResetSeconds ?? DEFAULT_RESET_SECONDS;

  // The cleanup presentation, derived from the record's tracker and the
  // write-honesty status — never mirrored state:
  // - `selectorUnsafe` — the record says the clear FAILED, or a durable
  //   discard failed (a stale record the next restore trips over);
  // - `resetRefused` — a reset this screen attempted was refused;
  // - pending — the clear has not finished yet (in flight in-session, or a
  //   restart landed here before T12's gate resolved it).
  const cartClear = confirmedRecord.cleanup.cartClear;
  const selectorUnsafe = cartClear === "failed" || persistence === "clearFailed";
  const cleanupUnsafe = selectorUnsafe || resetRefused;
  const cleanupPending = cartClear === "pending" && !cleanupUnsafe;
  // The retry label: the standing cleanup failure names its problem
  // ("Try Clearing Again"); a refused reset that the selectors do not
  // already explain is the generic "Try Again".
  const retryLabel = resetRefused && !selectorUnsafe ? "Try Again" : "Try Clearing Again";

  // The summary, derived from the record's snapshots on every render — the
  // same "total quantity, then distinct lines" grammar the review renders,
  // so the two surfaces can never disagree about the same submission.
  const totalQuantity = confirmedRecord.lineSnapshots.reduce((sum, line) => sum + line.quantity, 0);
  const distinctLines = confirmedRecord.lineSnapshots.length;
  const summary = `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · ${distinctLines} ${
    distinctLines === 1 ? "line" : "lines"
  }`;

  return (
    // The footer renders in every confirmed presentation, so it owns the
    // bottom edge and Screen omits it (R-T09-01).
    <Screen edges={FOOTER_EDGES}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-6 py-6"
        // The pass-through interaction listener (F-T11-01 / AC-14): a touch
        // ANYWHERE on the success content re-arms the countdown. onTouchStart
        // is a plain bubbling touch event — it never claims the responder, so
        // scrolling and row presses are unaffected.
        onTouchStart={() => {
          countdownReArmRef.current?.();
        }}
      >
        <Text variant="h1">Order Confirmed</Text>
        <Alert
          variant="success"
          title="Your order has been sent to the store"
          description="Your order is saved — nothing else is needed from you. Show the order number below if staff ask for it."
        />
        {/* The display number: mono and LARGE — it is read aloud across a
            counter, so the type carries the digits and the accessible name
            says what they are. */}
        <View className="items-center gap-1 py-6">
          <Text variant="label" tone="muted">
            Order number
          </Text>
          <Text
            variant="mono"
            className="text-5xl"
            accessibilityLabel={`Order number ${confirmedRecord.success.displayNumber}`}
          >
            {confirmedRecord.success.displayNumber}
          </Text>
        </View>
        <Text variant="body" tone="muted">
          {summary}
        </Text>
        {/* The immutable submitted snapshots through T08's read-only row —
            the record's snapshot type is structurally the CartLine shape the
            row renders (pinned at the type level in the attempt schema's own
            test), so they pass through directly: no second row component, no
            mirrored cart state. No virtualization: one order is bounded at
            100 lines by the create_order contract — a virtualizer would add
            measurement complexity for no gain. */}
        {confirmedRecord.lineSnapshots.map((line) => (
          <OrderLineRow key={line.lineId} line={line} />
        ))}
      </ScrollView>

      {/* The footer follows the record's cleanup tracker: the gated reset is
          offered ONLY where the store's gate will accept it (AC-11/AC-14). */}
      <SafeAreaView edges={["bottom"]}>
        <View className="gap-3 border-t border-border px-6 py-4">
          {cleanupUnsafe ? (
            <>
              <Alert
                variant="destructive"
                title="We couldn't finish clearing this tablet for the next customer"
                description="This tablet isn't ready for the next person yet. Please let store staff know."
              />
              <Button
                variant="primary"
                size="large"
                block
                onPress={() => {
                  void handleRetryClear();
                }}
              >
                <Text>{retryLabel}</Text>
              </Button>
            </>
          ) : (
            <>
              {/* The inactivity countdown (D10): its expiry drives the SAME
                  gated reset as the button; interaction inside it restarts
                  the window. */}
              <SuccessCountdown
                seconds={seconds}
                onExpire={handleReset}
                reArmRef={countdownReArmRef}
              />
              <Button
                variant="primary"
                size="large"
                block
                disabled={cleanupPending}
                onPress={() => {
                  void handleReset();
                }}
              >
                <Text>Next Customer</Text>
              </Button>
              {cleanupPending ? (
                <Text variant="caption" tone="muted">
                  {"We're finishing clearing this tablet for the next customer — one moment."}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    </Screen>
  );
}
