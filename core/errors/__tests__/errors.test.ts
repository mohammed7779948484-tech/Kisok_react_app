import { AuthApiError } from "@supabase/supabase-js";

import { AppError, shouldRetry, toAppError } from "@/core/errors";

/**
 * These codes come from `supabase/migrations/*.sql`. If a migration changes a
 * code, this suite should fail — that is the point.
 */
function postgrestError(code: string, message = "boom") {
  return { code, message, details: "detail", hint: "hint", name: "PostgrestError" };
}

describe("toAppError", () => {
  it.each([
    ["K1001", "validation"],
    ["K1002", "unavailable"],
    ["K1003", "idempotency-conflict"],
    ["K1004", "state-conflict"],
    ["K1005", "validation"],
    ["K1006", "server"],
    ["42501", "forbidden"],
    ["PGRST301", "auth"],
    ["23514", "validation"],
    ["23503", "unavailable"],
    ["23505", "state-conflict"],
    ["22023", "validation"],
  ])("maps Postgres code %s to kind %s", (code, kind) => {
    expect(toAppError(postgrestError(code)).kind).toBe(kind);
  });

  it("keeps database detail out of the user-facing message", () => {
    const error = toAppError(postgrestError("K1002", "variant 123 is inactive"));

    expect(error.userMessage).toBe("Some items are no longer available.");
    expect(error.userMessage).not.toContain("variant 123");
    expect(error.technicalMessage).toContain("variant 123");
  });

  it("classifies a lost connection as network rather than an unknown failure", () => {
    expect(toAppError(new Error("Network request failed")).kind).toBe("network");
  });

  it("treats an unrecognised Postgres code as a server failure", () => {
    expect(toAppError(postgrestError("XX000")).kind).toBe("server");
  });

  it("passes an existing AppError through unchanged", () => {
    const original = new AppError({ kind: "auth", userMessage: "Sign in again." });

    expect(toAppError(original)).toBe(original);
  });

  it("never leaks a log context containing anything but classification detail", () => {
    const context = toAppError(postgrestError("K1006")).toLogContext();

    expect(Object.keys(context).sort()).toEqual(["code", "detail", "kind", "retryable"]);
  });

  describe("an @supabase/auth-js AuthError — the shape signInWithPassword returns", () => {
    it("does NOT report 'session expired' for rejected sign-in credentials", () => {
      // This is the regression: `isAuthError` is true for a plain wrong password
      // too, so without a code-based split every failed sign-in was reported as
      // an expired SESSION — false (nothing had a session to expire) and useless
      // to a customer typing their password wrong.
      const error = toAppError(
        new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
        "We couldn't sign you in. Check the email and password.",
      );

      expect(error.userMessage).toBe("We couldn't sign you in. Check the email and password.");
      expect(error.userMessage).not.toMatch(/session expired/i);
      expect(error.kind).toBe("auth");
    });

    it("does not reveal whether an account exists when there is no fallback", () => {
      const error = toAppError(
        new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
      );

      // No caller-specific fallback was given, so this falls back to the
      // default — which, like every credential-failure message, names neither
      // "wrong password" nor "no such account".
      expect(error.userMessage).toBe("Something went wrong.");
    });

    it.each([
      "session_expired",
      "session_not_found",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
    ])("still reports 'session expired' for the auth-js code %s", (code) => {
      const error = toAppError(
        new AuthApiError("boom", 401, code),
        "We couldn't sign you in. Check the email and password.",
      );

      expect(error.userMessage).toBe("Your session expired. Please sign in again.");
    });
  });

  describe("PostgREST transport-failure shape (F-02)", () => {
    /**
     * The EXACT error object `@supabase/postgrest-js` 2.112.4 RETURNS — does not
     * throw — when the underlying fetch rejects: a plain object (NOT an Error
     * instance), `code: ""`, and a message built as `${fetchError.name}:
     * ${fetchError.message}`. A server-side error arrives as a PostgREST JSON
     * body and never carries those name prefixes — which is what keeps the
     * transport rule surgical instead of "every unknown code is network".
     * Source: node_modules/@supabase/postgrest-js/dist/index.cjs (~lines
     * 394–437).
     */
    const transportError = (
      message: string,
      hint = "",
      details = "",
      code: string | undefined = "",
    ) => ({
      message,
      details,
      hint,
      code,
    });

    it.each([
      {
        label: "React Native fetch rejection",
        error: transportError(
          "TypeError: Network request failed",
          "",
          "TypeError: Network request failed\n    at fetch (native)",
        ),
      },
      {
        label: "undici/Node fetch rejection",
        error: transportError("FetchError: fetch failed"),
      },
      {
        label: "aborted request — a timed-out write may still have committed",
        error: transportError(
          "AbortError: The operation was aborted",
          "Request was aborted (timeout or manual cancellation)",
        ),
      },
    ])(
      "classifies the returned transport object ($label) as network, never a definite server failure",
      ({ error }) => {
        const appError = toAppError(error);

        expect(appError.kind).toBe("network");
        expect(appError.retryable).toBe(true);
      },
    );

    it("gives the returned transport object the network user message and its raw detail", () => {
      const appError = toAppError(transportError("FetchError: fetch failed"));

      expect(appError.userMessage).toBe(
        "We couldn't reach the network. Check the connection and try again.",
      );
      expect(appError.technicalMessage).toBe("FetchError: fetch failed");
    });

    it("classifies an abort by its postgrest-js hint even when the message alone doesn't match", () => {
      const error = toAppError({
        message: "The request did not complete",
        details: "",
        hint: "Request was aborted (timeout or manual cancellation)",
        code: "",
      });

      expect(error.kind).toBe("network");
    });

    it.each([
      ["", "Relation does not exist"],
      ["", "Internal Server Error"],
      // Non-empty UNMAPPED codes are server answers even when the message
      // carries transport keywords — the empty-code gate (RT01-1) is what keeps
      // the reclassification surgical, and these rows pin it.
      ["57014", "canceling statement due to statement timeout"],
      ["XX000", "TypeError: Network request failed"],
    ] as const)(
      "keeps an unmapped-code PostgrestError that is NOT transport (code %s, %s) as a definite server failure",
      (code, message) => {
        expect(toAppError(transportError(message, "", "", code)).kind).toBe("server");
      },
    );

    it.each([
      ["K1006", "server"],
      ["42501", "forbidden"],
    ])(
      "never reclassifies a mapped Postgres code (%s) even when its message looks like transport",
      (code, kind) => {
        const error = toAppError({
          message: "TypeError: Network request failed",
          details: "",
          hint: "",
          code,
        });

        expect(error.kind).toBe(kind);
      },
    );

    it("classifies a postgrest-js prefix-only transport message (FetchError: terminated) as network", () => {
      // postgrest-js constructs returned-object messages as
      // `${fetchError.name}: ${fetchError.message}` — "FetchError: terminated"
      // (undici body termination) matches ONLY via the anchored name prefix.
      expect(toAppError(transportError("FetchError: terminated")).kind).toBe("network");
    });

    it("does not classify a thrown error that merely EMBEDS an error name as network", () => {
      // "Uncaught TypeError: …" is a client-side crash report, not a fetch
      // rejection: the name prefix must be anchored at the START, so the
      // keyword-free remainder falls through to `unknown` (fail-safe, but not
      // masked as connectivity).
      expect(toAppError(new Error("Uncaught TypeError: x is not a function")).kind).toBe("unknown");
    });

    it("keeps classifying THROWN transport errors as network — one predicate for both shapes", () => {
      expect(toAppError(new TypeError("fetch failed")).kind).toBe("network");
      expect(toAppError(new Error("Network request failed")).kind).toBe("network");
      expect(toAppError(new Error("The operation was aborted")).kind).toBe("network");
    });
  });
});

describe("shouldRetry", () => {
  it("retries a network failure", () => {
    expect(shouldRetry(0, new Error("Network request failed"))).toBe(true);
  });

  it("does not retry a permission failure, which cannot succeed on a second try", () => {
    expect(shouldRetry(0, postgrestError("42501"))).toBe(false);
  });

  it("does not retry an idempotency conflict — a retry could duplicate an order", () => {
    expect(shouldRetry(0, postgrestError("K1003"))).toBe(false);
  });

  it("does not retry a constraint violation — an identical retry fails identically", () => {
    expect(shouldRetry(0, postgrestError("23514"))).toBe(false);
    expect(shouldRetry(0, postgrestError("22023"))).toBe(false);
  });

  it("stops once the attempt limit is reached", () => {
    expect(shouldRetry(2, new Error("Network request failed"))).toBe(false);
  });
});
