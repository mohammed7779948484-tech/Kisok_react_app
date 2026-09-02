import { useEffect, useState } from "react";
import { View } from "react-native";

import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  Alert,
  Button,
  Input,
  Text,
} from "@/components/ui";
import { useSignOutAction } from "@/core/auth";

export type MaintenanceSheetProps = {
  /** Whether the sheet is open — the overlay owns this state. */
  open: boolean;
  /** Reports open/close changes: scrim tap, hardware back, the Close button. */
  onOpenChange: (open: boolean) => void;
  /** Whether the maintenance session is currently unlocked (store is truth). */
  unlocked: boolean;
  /**
   * Attempt an unlock with the typed code. Returns whether it succeeded; the
   * session itself comes back through `unlocked` (the overlay re-renders from
   * the store). A false return must reveal nothing beyond "didn't work" —
   * no attempt counting, no hint that a code exists.
   */
  onTryUnlock: (code: string) => boolean;
  /**
   * The panel's account switch fully succeeded: the shared sign-out pipeline
   * finished and the session is gone. The overlay clears the maintenance
   * session (AC-05 — the unlock is ephemeral) and closes the sheet so no
   * panel lingers over the sign-in screen.
   */
  onAccountSwitched?: () => void;
};

const CODE_LABEL = "Maintenance code";
const RETRY_MESSAGE = "That code didn't work.";
const LOCKED_PROMPT = "Enter the maintenance code to continue.";
const PANEL_PROMPT = "Switch to a different customer account, or close to return to browsing.";
const UNLOCK = "Unlock";
const SWITCH_ACCOUNT = "Switch customer account";
const CLOSE = "Close";

/**
 * The maintenance unlock/panel sheet (AC-05, AC-06).
 *
 * Two states, nothing data-backed:
 * - LOCKED — a code-entry form. The typed value is the USER's entry, masked;
 *   there is no reveal toggle because there is no stored value to reveal (the
 *   code lives only in the managed config consumed by the store). A rejected
 *   code shows the same words every time.
 * - UNLOCKED — the maintenance panel. Switch customer account runs the
 *   SHARED sign-out pipeline via `useSignOutAction` (the same contract as the
 *   kiosk mismatch screen): pending disables the control, and a blocked or
 *   failed outcome surfaces the pipeline's own message verbatim on an
 *   announced Alert. No parallel sign-out logic lives here (AC-06).
 *
 * The typed code never outlives its purpose: it is cleared when the unlock
 * lands and when the sheet closes, and it is never logged or persisted.
 */
export function MaintenanceSheet({
  open,
  onOpenChange,
  unlocked,
  onTryUnlock,
  onAccountSwitched,
}: MaintenanceSheetProps) {
  const signOut = useSignOutAction();
  const [code, setCode] = useState("");
  const [rejected, setRejected] = useState(false);
  const [switchAttempted, setSwitchAttempted] = useState(false);

  // The typed code must not outlive its purpose: cleared when the unlock
  // lands (the form is replaced by the panel) and when the sheet closes.
  useEffect(() => {
    if (unlocked) {
      setCode("");
      setRejected(false);
    }
  }, [unlocked]);

  useEffect(() => {
    if (!open) {
      setCode("");
      setRejected(false);
    }
  }, [open]);

  // A switch attempt has settled. A message means the pipeline blocked or
  // failed: the panel stays put so the pipeline's own words are in front of
  // the staff member. No message after a completed run means full success —
  // report it upward; the overlay clears the session and closes the sheet.
  useEffect(() => {
    if (!switchAttempted || signOut.pending) return;
    if (signOut.message === null) onAccountSwitched?.();
    setSwitchAttempted(false);
  }, [switchAttempted, signOut.pending, signOut.message, onAccountSwitched]);

  function handleSubmit() {
    const succeeded = onTryUnlock(code);
    setRejected(!succeeded);
  }

  function handleSwitchAccount() {
    setSwitchAttempted(true);
    signOut.run();
  }

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent>
        <AdaptiveSheetHeader>
          <AdaptiveSheetTitle>Maintenance</AdaptiveSheetTitle>
        </AdaptiveSheetHeader>

        {unlocked ? (
          <View className="gap-4 px-5 pb-5">
            <Text variant="body" tone="muted">
              {PANEL_PROMPT}
            </Text>
            <Button size="large" block disabled={signOut.pending} onPress={handleSwitchAccount}>
              <Text>{SWITCH_ACCOUNT}</Text>
            </Button>
            {signOut.message ? <Alert variant="warning" title={signOut.message} /> : null}
          </View>
        ) : (
          <View className="gap-4 px-5 pb-5">
            <Text variant="body" tone="muted">
              {LOCKED_PROMPT}
            </Text>
            <Input
              label={CODE_LABEL}
              value={code}
              onChangeText={setCode}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              errorMessage={rejected ? RETRY_MESSAGE : undefined}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
            <Button size="large" block onPress={handleSubmit}>
              <Text>{UNLOCK}</Text>
            </Button>
          </View>
        )}

        <AdaptiveSheetFooter>
          {/* Disabled while a switch attempt is in flight, like the primary
              action: closing mid-flight would hide a blocked/failed outcome —
              the exact thing the shared pipeline exists to surface. */}
          <Button
            variant="outline"
            block
            disabled={signOut.pending}
            onPress={() => onOpenChange(false)}
          >
            <Text>{CLOSE}</Text>
          </Button>
        </AdaptiveSheetFooter>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
