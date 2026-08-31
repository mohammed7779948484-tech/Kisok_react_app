import { Text as RNText } from "react-native";

import { AppErrorBoundary } from "@/components/app/error-boundary";
import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <RNText>all good</RNText>;
}

beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

describe("AppErrorBoundary", () => {
  it("renders its children when nothing throws", async () => {
    await renderWithProviders(
      <AppErrorBoundary>
        <Boom explode={false} />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("all good")).toBeOnTheScreen();
  });

  it("shows a recovery screen instead of crashing the tree", async () => {
    // React logs the caught error itself; silence it so the suite stays clean.
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    await renderWithProviders(
      <AppErrorBoundary>
        <Boom explode />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    consoleError.mockRestore();
  });

  it("recovers when the user retries", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    // Controlled from outside the component: React may re-render a throwing
    // component once to improve the stack, so the component must not decide for
    // itself when to stop throwing.
    let explode = true;
    function Flaky() {
      if (explode) throw new Error("kaboom");
      return <RNText>recovered</RNText>;
    }

    await renderWithProviders(
      <AppErrorBoundary>
        <Flaky />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();

    explode = false;
    await user.press(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeOnTheScreen();
    consoleError.mockRestore();
  });
});
