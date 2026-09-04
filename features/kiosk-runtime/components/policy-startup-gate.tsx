import { ErrorState } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppError } from "@/core/errors";
import { StartupScreen } from "@/features/auth";

import { requestDevicePolicyRead } from "../native/use-device-policy-sync";
import { useDevicePolicyStore, type PolicyReadError } from "../state/device-policy-store";

/**
 * The kiosk-runtime-owned startup gate (RD5-03 / R5-08).
 *
 * R5-08's finding: a policy read that FAILS while auth is ready and the role
 * is preparation held the app at the startup target with NO policy-specific
 * error or retry — an indefinite silent spinner (the read is documented disk
 * I/O that "may take several seconds" with no completion guarantee). This
 * gate makes that window bounded and named:
 *
 * - `readError === null` → compose `StartupScreen` from `@/features/auth`
 *   (its public API — cross-feature imports go through the index). ONE
 *   loading UI, and StartupScreen stays policy-ignorant: this feature owns
 *   the error surface, features/auth owns the auth surface.
 * - `readError` set → `ErrorState` with a visible MANUAL Retry wired to the
 *   sync seam's `requestDevicePolicyRead` trigger, which re-invokes the same
 *   single-flight refresh the mount itself uses. Retry is manual only —
 *   automatic backoff would hammer disk I/O on a broken device.
 *
 * The surfaced errors are constructed HERE, not carried from the failure:
 * generic, staff-safe copy with `retryable: true`, and a technicalMessage
 * that never carries the native rejection reason (AC-05 discipline — the
 * maintenance code travels inside the restrictions, so nothing from a
 * failed read may travel anywhere). A retry CAN authorize — but only
 * evidence does: `readError` is set only while no verdict exists, so the
 * error surface is reachable only inside the fail-closed startup hold.
 */

const ERROR_TITLE = "We couldn't check this tablet";

/** Module-level constants: the surfaced errors are fixed per reason, never built from the failure. */
const READ_FAILED: AppError = new AppError({
  kind: "server",
  userMessage:
    "The tablet's kiosk settings couldn't be read. Tap Try again, or restart the tablet if it keeps failing.",
  technicalMessage: "device-policy read failed while no verdict exists (reason: read-failed)",
  retryable: true,
});

const MODULE_ABSENT: AppError = new AppError({
  kind: "server",
  userMessage:
    "A component this tablet needs to read its kiosk settings is missing. Restart the tablet, and contact support if it keeps happening.",
  technicalMessage:
    "kiosk-policy native module unexpectedly absent on android (reason: module-absent)",
  retryable: true,
});

const READ_ERRORS: Record<PolicyReadError["reason"], AppError> = {
  "read-failed": READ_FAILED,
  "module-absent": MODULE_ABSENT,
};

/** Renders the `app/index.tsx` `startup` case: the hold's loading face or its named failure face. */
export function PolicyStartupGate() {
  const readError = useDevicePolicyStore((state) => state.readError);

  if (readError === null) {
    return <StartupScreen />;
  }

  return (
    <Screen>
      <ErrorState
        title={ERROR_TITLE}
        error={READ_ERRORS[readError.reason]}
        onRetry={() => {
          // Boolean return is ignored on purpose: a false (unmounted hook)
          // leaves the error standing — fail-closed, never an invented read.
          requestDevicePolicyRead();
        }}
      />
    </Screen>
  );
}
