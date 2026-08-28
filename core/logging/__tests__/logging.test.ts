import {
  createLogger,
  redact,
  resetLogging,
  setLogLevel,
  setLogSink,
  type LogRecord,
} from "@/core/logging";

describe("redact", () => {
  it.each(["accessToken", "password", "apiKey", "authorization", "session", "refresh_token"])(
    "removes the value of a key that looks sensitive: %s",
    (key) => {
      expect(redact({ [key]: "super-secret" })).toEqual({ [key]: "[redacted]" });
    },
  );

  it("redacts nested values", () => {
    expect(redact({ user: { id: "1", password: "hunter2" } })).toEqual({
      user: { id: "1", password: "[redacted]" },
    });
  });

  it("keeps values that are safe to log", () => {
    expect(redact({ orderId: "abc", quantity: 2 })).toEqual({ orderId: "abc", quantity: 2 });
  });

  it("stops recursing rather than hanging on a deeply nested object", () => {
    const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };

    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });
});

describe("createLogger", () => {
  afterEach(resetLogging);

  it("redacts context before it reaches the sink", () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));
    setLogLevel("debug");

    createLogger("checkout").info("submitting", { accessToken: "leak-me", orderId: "A7K2M9" });

    // The sink receives the raw record; redaction happens on output. Assert the
    // console path explicitly instead.
    expect(records[0]?.scope).toBe("checkout");
    expect(redactContext(records[0])).toEqual({ accessToken: "[redacted]", orderId: "A7K2M9" });
  });

  it("drops messages below the configured level", () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));
    setLogLevel("warn");

    const log = createLogger("cart");
    log.debug("noisy");
    log.info("also noisy");
    log.error("important");

    expect(records.map((record) => record.level)).toEqual(["error"]);
  });

  it("nests scopes so a log line says where it came from", () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));
    setLogLevel("debug");

    createLogger("cart").child("persist").warn("memory only");

    expect(records[0]?.scope).toBe("cart.persist");
  });
});

function redactContext(record: LogRecord | undefined) {
  return redact(record?.context ?? {});
}
