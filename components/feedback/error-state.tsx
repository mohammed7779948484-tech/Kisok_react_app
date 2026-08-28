import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { isAppError, toAppError } from "@/core/errors";
import { cn } from "@/core/utils";

/**
 * Standard failure surface with a retry.
 *
 * Pass the caught error directly — this renders `AppError.userMessage`, which is
 * the vetted customer-safe string, and never leaks the technical detail. If you
 * find yourself writing a custom error screen, add a variant here instead so
 * every feature fails the same way.
 */
export function ErrorState({
  error,
  onRetry,
  title = "Something went wrong",
  className,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const appError = error === undefined ? null : toAppError(error);
  const message = appError?.userMessage ?? "Please try again.";
  // Offering "Try again" on a permission or validation failure just wastes taps.
  const canRetry = Boolean(onRetry) && (appError === null || appError.retryable);

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("flex-1 items-center justify-center gap-3 p-8", className)}
    >
      <Text variant="h3" tone="destructive" className="text-center">
        {title}
      </Text>
      <Text variant="body" tone="muted" className="max-w-md text-center">
        {message}
      </Text>
      {canRetry ? (
        <Button variant="secondary" onPress={onRetry} className="mt-2">
          <Text>Try again</Text>
        </Button>
      ) : null}
    </View>
  );
}

/** Narrow banner for a failure that sits alongside content instead of replacing it. */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  const appError = isAppError(error) ? error : toAppError(error);
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("rounded-lg border border-destructive/40 bg-destructive/10 p-3", className)}
    >
      <Text variant="label" tone="destructive">
        {appError.userMessage}
      </Text>
    </View>
  );
}
