import {
  clearSignOutTasks,
  registerSignOutCleanup,
  registerSignOutGuard,
  runSignOutCleanup,
  runSignOutGuards,
  type SignOutContext,
} from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";

// A blocked sign-out logs a warning by design. Capture it so an expected
// outcome does not look like a failing run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

const CUSTOMER: SignOutContext = {
  sessionUserId: "customer-user",
  profileId: "customer-profile",
  role: "customer",
};
const PREPARATION: SignOutContext = {
  sessionUserId: "preparation-user",
  profileId: "preparation-profile",
  role: "preparation",
};

describe("sign-out guards (phase 1 — side-effect-free)", () => {
  beforeEach(clearSignOutTasks);
  afterEach(clearSignOutTasks);

  it("allows sign-out when nothing objects", async () => {
    await expect(runSignOutGuards()).resolves.toEqual({ status: "ok" });
  });

  it("runs every registered guard", async () => {
    const ran: string[] = [];
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("cart");
        return { status: "ok" };
      },
    });
    registerSignOutGuard({
      name: "search",
      run: () => {
        ran.push("search");
        return { status: "ok" };
      },
    });

    await runSignOutGuards();

    expect(ran).toEqual(["cart", "search"]);
  });

  it("BLOCKS sign-out when a guard vetoes it", async () => {
    // The checkout invariant: an unresolved order attempt must not be wiped,
    // or the customer could end up submitting a second order.
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "An order submission is still unresolved." }),
    });

    await expect(runSignOutGuards()).resolves.toEqual({
      status: "blocked",
      reason: "An order submission is still unresolved.",
    });
  });

  it("stops at the first block so a later guard does not run", async () => {
    const ran: string[] = [];
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "pending" }),
    });
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("cart");
        return { status: "ok" };
      },
    });

    await runSignOutGuards();

    expect(ran).toEqual([]);
  });

  it("replaces a guard registered twice under the same name", async () => {
    const ran: string[] = [];
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("first");
        return { status: "ok" };
      },
    });
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("second");
        return { status: "ok" };
      },
    });

    await runSignOutGuards();

    expect(ran).toEqual(["second"]);
  });

  it("fails CLOSED — blocked, not ok — when a guard throws", async () => {
    // An exception is exactly as uncertain as an explicit block: there is no
    // way to tell whether it is safe to destroy checkout recovery state, so
    // "we don't know" must never be treated as "proceed".
    registerSignOutGuard({
      name: "checkout",
      run: () => {
        throw new Error("boom");
      },
    });

    const result = await runSignOutGuards();

    expect(result.status).toBe("blocked");
  });

  it("a later guard never runs once an earlier one throws", async () => {
    const ran: string[] = [];
    registerSignOutGuard({
      name: "checkout",
      run: () => {
        throw new Error("boom");
      },
    });
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("cart");
        return { status: "ok" };
      },
    });

    await runSignOutGuards();

    expect(ran).toEqual([]);
  });

  it("runs applicable and unscoped guards, skipping those owned by another role", async () => {
    const ran: string[] = [];
    registerSignOutGuard({
      name: "customer",
      appliesTo: ({ role }) => role === "customer",
      run: () => {
        ran.push("customer");
        return { status: "ok" };
      },
    });
    registerSignOutGuard({
      name: "preparation",
      appliesTo: ({ role }) => role === "preparation",
      run: () => {
        ran.push("preparation");
        return { status: "ok" };
      },
    });
    registerSignOutGuard({
      name: "global",
      run: () => {
        ran.push("global");
        return { status: "ok" };
      },
    });

    await expect(runSignOutGuards(CUSTOMER)).resolves.toEqual({ status: "ok" });
    expect(ran).toEqual(["customer", "global"]);
    ran.length = 0;
    await expect(runSignOutGuards(PREPARATION)).resolves.toEqual({ status: "ok" });
    expect(ran).toEqual(["preparation", "global"]);
    ran.length = 0;
    await runSignOutGuards();
    expect(ran).toEqual(["customer", "preparation", "global"]);
  });

  it("fails closed if an applicability predicate throws", async () => {
    registerSignOutGuard({
      name: "broken-scope",
      appliesTo: () => {
        throw new Error("bad predicate");
      },
      run: () => ({ status: "ok" }),
    });
    expect((await runSignOutGuards(CUSTOMER)).status).toBe("blocked");
  });
});

describe("sign-out cleanup (phase 2 — destructive, guards-approved only)", () => {
  beforeEach(clearSignOutTasks);
  afterEach(clearSignOutTasks);

  it("runs every registered cleanup task", async () => {
    const ran: string[] = [];
    registerSignOutCleanup({ name: "cart", run: () => void ran.push("cart") });
    registerSignOutCleanup({ name: "search", run: () => void ran.push("search") });

    await runSignOutCleanup();

    expect(ran).toEqual(["cart", "search"]);
  });

  it("a guard and a cleanup task registered under the same name do not collide", async () => {
    // They are two different registries now — a feature can name both after
    // itself without one silently replacing the other, which the single
    // combined registry used to risk.
    const ran: string[] = [];
    registerSignOutGuard({
      name: "cart",
      run: () => {
        ran.push("guard");
        return { status: "ok" };
      },
    });
    registerSignOutCleanup({ name: "cart", run: () => void ran.push("cleanup") });

    await runSignOutGuards();
    await runSignOutCleanup();

    expect(ran).toEqual(["guard", "cleanup"]);
  });

  it("one task's failure does not stop the others, and is reported", async () => {
    const ran: string[] = [];
    registerSignOutCleanup({
      name: "cart",
      run: () => {
        throw new Error("disk full");
      },
    });
    registerSignOutCleanup({ name: "search", run: () => void ran.push("search") });

    const result = await runSignOutCleanup();

    expect(ran).toEqual(["search"]);
    expect(result.failures).toEqual(["cart"]);
  });

  it("replaces a cleanup task registered twice under the same name", async () => {
    const ran: string[] = [];
    registerSignOutCleanup({ name: "cart", run: () => void ran.push("first") });
    registerSignOutCleanup({ name: "cart", run: () => void ran.push("second") });

    await runSignOutCleanup();

    expect(ran).toEqual(["second"]);
  });

  it("skips unrelated cleanup and runs remaining applicable tasks after a failure", async () => {
    const ran: string[] = [];
    registerSignOutCleanup({
      name: "customer-failure",
      appliesTo: ({ role }) => role === "customer",
      run: () => {
        throw new Error("disk full");
      },
    });
    registerSignOutCleanup({
      name: "preparation-only",
      appliesTo: ({ role }) => role === "preparation",
      run: () => void ran.push("preparation"),
    });
    registerSignOutCleanup({
      name: "customer-success",
      appliesTo: ({ role }) => role === "customer",
      run: () => void ran.push("customer"),
    });
    registerSignOutCleanup({ name: "global", run: () => void ran.push("global") });

    expect(await runSignOutCleanup(CUSTOMER)).toEqual({ failures: ["customer-failure"] });
    expect(ran).toEqual(["customer", "global"]);
    ran.length = 0;
    expect(await runSignOutCleanup(PREPARATION)).toEqual({ failures: [] });
    expect(ran).toEqual(["preparation", "global"]);
  });
});
