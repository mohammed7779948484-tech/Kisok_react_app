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
