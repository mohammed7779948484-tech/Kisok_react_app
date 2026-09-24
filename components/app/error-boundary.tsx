import { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Button, Text } from "@/components/ui";
import { createLogger } from "@/core/logging";

const log = createLogger("app.errorBoundary");

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence for a render-time crash.
 *
 * Without this, an unexpected throw anywhere in the tree leaves a white screen
 * on a tablet in a shop, with no way back short of a power cycle. A kiosk cannot
 * rely on someone opening a debugger.
 *
 * It deliberately shows a plain, self-service recovery screen rather than a
 * stack trace: the person looking at it is a customer or a shop employee. The
 * detail goes to the logger.
 *
 * This is NOT a substitute for handling expected failures. Network and RPC
 * errors belong in `AppError` + `ErrorState`, close to where they happen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("Unhandled render error", {
      message: error.message,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private readonly reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View className="flex-1 bg-background">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center p-6 md:p-10">
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card"
          >
            <View className="border-b border-border bg-secondary p-6 md:px-8">
              <Text variant="label" tone="primary">
                App recovery
              </Text>
            </View>
            <View className="items-start gap-5 p-6 md:p-10">
              <Text variant="h1" accessibilityRole="header">
                Something went wrong
              </Text>
              <Text variant="body" tone="muted" className="max-w-xl">
                The app hit an unexpected problem. Try again — if it keeps happening, ask a member
                of staff.
              </Text>
              <Button onPress={this.reset} className="mt-2">
                <Text>Try again</Text>
              </Button>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }
}
