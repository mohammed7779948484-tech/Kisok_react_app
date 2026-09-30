import { View } from "react-native";
import { CloudOff } from "lucide-react-native";

import { toAppError } from "@/core/errors";
import { cn } from "@/core/utils";

import { Button } from "../primitives/button";
import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

/**
 * A failure the person can act on. The message is the error's own
 * `userMessage`; retry is offered only when the error says retrying can help.
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
  const canRetry = Boolean(onRetry) && (appError === null || appError.retryable);

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("flex-1 items-center justify-center p-8", className)}
    >
      <View className="w-full max-w-xl items-center gap-4 rounded-3xl border border-border bg-card px-8 py-10">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icon as={CloudOff} size={26} className="text-destructive" />
        </View>
        <Text variant="h2" className="text-center" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="muted" className="max-w-md text-center">
          {message}
        </Text>
        {canRetry ? (
          <Button variant="primary" onPress={onRetry} className="mt-2 self-center">
            <Text>Try again</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
