import { isAppError, toAppError } from "@/core/errors";

import { Alert } from "./alert";

/** A failure shown in place, beside the thing that failed. */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  const appError = isAppError(error) ? error : toAppError(error);
  return <Alert variant="destructive" title={appError.userMessage} className={className} />;
}
