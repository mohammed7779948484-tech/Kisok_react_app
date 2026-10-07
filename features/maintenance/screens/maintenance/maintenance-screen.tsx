import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { useActiveProfile, useAuth } from "@/core/auth";
import { toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { cn } from "@/core/utils";
import { Alert, Button, Card, Eyebrow, Screen, Text, useLayout } from "@/design-system";
import { discardCart, useCart } from "@/features/cart";

const log = createLogger("maintenance.signOut");

const CART_DISCARD_FAILED =
  "We couldn't clear this tablet's cart, so it is still signed in. Please try again.";
const SIGN_OUT_THREW = "We couldn't finish signing out. Please try again.";

function cartSentence(totalQuantity: number): string | null {
  if (totalQuantity <= 0) return null;
  const items = totalQuantity === 1 ? "1 item" : `${totalQuantity} items`;
  return `A cart with ${items} is in progress. Signing out clears it.`;
}

/**
 * The Staff page: signs the SHARED Customer tablet account out so another
 * operator can sign in. Reached only by a hidden long press in the catalog
 * header; it lives inside the customer route group, so `CheckoutGate` covers it
 * while an order is unresolved.
 *
 * Order matters: the shared cart is discarded first (memory and tablet
 * storage), and if that cannot be saved the account stays signed in — the next
 * sign-in to the same account would otherwise restore a stranger's cart. The
 * checkout record is never touched here.
 *
 * On success nothing is rendered: the root auth guard moves the tablet to
 * sign-in and this screen unmounts.
 */
export function MaintenanceScreen() {
  const router = useRouter();
  const profile = useActiveProfile();
  const { signOut } = useAuth();
  const { totalQuantity } = useCart();
  const { isCompact } = useLayout();

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const runSignOut = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);

    void (async () => {
      let failure: string | null = null;
      try {
        const { saved } = await discardCart();
        if (!saved) {
          log.warn("Cart discard was not saved; sign-out not started");
          failure = CART_DISCARD_FAILED;
        } else {
          const outcome = await signOut();
          if (outcome.status !== "ok") failure = outcome.reason;
        }
      } catch (error) {
        // Fail CLOSED, as `useSignOutAction` does: known failures arrive as
        // outcomes; this is the backstop for an unexpected exception.
        log.error("Staff sign-out threw unexpectedly", {
          message: toAppError(error).technicalMessage,
        });
        failure = SIGN_OUT_THREW;
      } finally {
        inFlight.current = false;
        // A successful sign-out unmounts this screen; do not update it then.
        if (mounted.current) {
          setPending(false);
          setMessage(failure);
        }
      }
    })();
  }, [signOut]);

  const cart = cartSentence(totalQuantity);

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center p-6 md:p-10"
        keyboardShouldPersistTaps="handled"
      >
        <Card className="w-full max-w-xl gap-6 p-6 md:p-8">
          <View className="gap-3">
            <Eyebrow>Staff</Eyebrow>
            <Text variant="h2" accessibilityRole="header">
              Sign out of this tablet
            </Text>
            <Text variant="title">Signed in as {profile.display_name}</Text>
          </View>

          <View className="gap-3">
            <Text tone="muted">
              Signing out ends this tablet&apos;s customer session. A staff member will need to sign
              in again before customers can order.
            </Text>
            {cart ? <Text>{cart}</Text> : null}
          </View>

          {message ? (
            // `accessible` groups the alert into one element, so TalkBack reads
            // the message as a unit under its alert role.
            <Alert accessible variant="destructive" title={message} />
          ) : null}

          <View className={cn("gap-3", isCompact ? "flex-col" : "flex-row justify-end")}>
            <Button
              testID="maintenance-back"
              size="large"
              block={isCompact}
              onPress={goBack}
              disabled={pending}
            >
              <Text>Back to the catalog</Text>
            </Button>
            <Button
              testID="maintenance-sign-out"
              variant="destructive"
              size="large"
              block={isCompact}
              onPress={runSignOut}
              disabled={pending}
              accessibilityState={{ disabled: pending, busy: pending }}
            >
              <Text>{pending ? "Signing out…" : "Sign out"}</Text>
            </Button>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
