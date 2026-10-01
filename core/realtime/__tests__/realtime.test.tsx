import { View } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { useRealtimeInvalidation, useRealtimeSubscription } from "@/core/realtime";
import { createTestQueryClient, installMockSupabase, renderWithProviders } from "@/core/testing";
import { setSupabaseClient, type KisokSupabaseClient } from "@/core/supabase";

/**
 * Records every channel created, so a test can assert how many subscriptions a
 * render sequence actually opened — the thing that regressed when the handler
 * was an effect dependency.
 */
function installChannelSpy() {
  const created: string[] = [];
  const removed: unknown[] = [];
  const handlers: ((payload: unknown) => void)[] = [];
  const statusCallbacks: ((status: string) => void)[] = [];

  const client = {
    channel: (name: string) => {
      created.push(name);
      const channel = {
        on: (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
          handlers.push(handler);
          return channel;
        },
        subscribe: (callback?: (status: string) => void) => {
          if (callback) statusCallbacks.push(callback);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: async (channel: unknown) => {
      removed.push(channel);
    },
  } as unknown as KisokSupabaseClient;

  setSupabaseClient(client);
  return {
    created,
    removed,
    handlers,
    /** Report a channel status, as supabase-js does on every join and rejoin. */
    status: (status: string) => statusCallbacks.forEach((callback) => callback(status)),
    restore: () => setSupabaseClient(null),
  };
}

describe("useRealtimeSubscription", () => {
  it("opens ONE subscription across re-renders with a new inline handler each time", async () => {
    const spy = installChannelSpy();

    function Subscriber({ tick }: { tick: number }) {
      // A fresh closure every render — the shape callers naturally write.
      useRealtimeSubscription({
        channel: "orders",
        table: "orders",
        onChange: () => {
          void tick;
        },
      });
      return <View />;
    }

    const view = await renderWithProviders(<Subscriber tick={0} />);
    await view.rerender(<Subscriber tick={1} />);
    await view.rerender(<Subscriber tick={2} />);

    expect(spy.created).toEqual(["orders"]);
    spy.restore();
  });

  it("removes the channel on unmount", async () => {
    const spy = installChannelSpy();

    function Subscriber() {
      useRealtimeSubscription({ channel: "orders", table: "orders", onChange: () => {} });
      return <View />;
    }

    const view = await renderWithProviders(<Subscriber />);
    await view.unmount();

    expect(spy.removed).toHaveLength(1);
    spy.restore();
  });

  it("opens no subscription while disabled", async () => {
    const spy = installChannelSpy();

    function Subscriber() {
      useRealtimeSubscription({
        channel: "orders",
        table: "orders",
        enabled: false,
        onChange: () => {},
      });
      return <View />;
    }

    await renderWithProviders(<Subscriber />);

    expect(spy.created).toEqual([]);
    spy.restore();
  });

  it("calls the LATEST handler, not the one captured at subscribe time", async () => {
    const spy = installChannelSpy();
    const seen: number[] = [];

    function Subscriber({ tick }: { tick: number }) {
      useRealtimeSubscription({
        channel: "orders",
        table: "orders",
        onChange: () => seen.push(tick),
      });
      return <View />;
    }

    const view = await renderWithProviders(<Subscriber tick={1} />);
    await view.rerender(<Subscriber tick={2} />);

    spy.handlers[0]?.({});

    expect(seen).toEqual([2]);
    spy.restore();
  });
});

describe("useRealtimeInvalidation", () => {
  it("invalidates the given query key when an event arrives", async () => {
    const spy = installChannelSpy();
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    function Subscriber() {
      useRealtimeInvalidation({
        channel: "preparation-orders",
        table: "orders",
        queryClient,
        queryKey: ["preparation"],
      });
      return <View />;
    }

    await renderWithProviders(<Subscriber />, { queryClient });
    spy.handlers[0]?.({});

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["preparation"] });
    spy.restore();
  });

  it("refetches each time the channel (re)subscribes, so events missed while it was down are caught up", async () => {
    // Channel status changes are logged at debug level.
    setLogSink(() => {});
    const spy = installChannelSpy();
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    function Subscriber() {
      useRealtimeInvalidation({
        channel: "preparation-orders",
        table: "orders",
        queryClient,
        queryKey: ["preparation"],
      });
      return <View />;
    }

    await renderWithProviders(<Subscriber />, { queryClient });
    spy.status("SUBSCRIBED");
    expect(invalidate).toHaveBeenCalledTimes(1);

    // The socket drops and supabase-js rejoins on its own.
    spy.status("CHANNEL_ERROR");
    spy.status("SUBSCRIBED");
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ["preparation"] });
    spy.restore();
  });
});

afterEach(() => {
  installMockSupabase().restore();
  resetLogging();
});
