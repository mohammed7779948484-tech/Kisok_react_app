import { clearSignOutTasks, registerSignOutTask, runSignOutTasks } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";

// A blocked sign-out logs a warning by design. Capture it so an expected
// outcome does not look like a failing run.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

describe("sign-out gate", () => {
  beforeEach(clearSignOutTasks);
  afterEach(clearSignOutTasks);

  it("allows sign-out when nothing objects", async () => {
    await expect(runSignOutTasks()).resolves.toEqual({ status: "ok" });
  });

  it("runs every registered task", async () => {
    const ran: string[] = [];
    registerSignOutTask({
      name: "cart",
      run: () => {
        ran.push("cart");
        return { status: "ok" };
      },
    });
    registerSignOutTask({
      name: "search",
      run: () => {
        ran.push("search");
        return { status: "ok" };
      },
    });

    await runSignOutTasks();

    expect(ran).toEqual(["cart", "search"]);
  });

  it("BLOCKS sign-out when a task vetoes it", async () => {
    // The checkout invariant: an unresolved order attempt must not be wiped,
    // or the customer could end up submitting a second order.
    registerSignOutTask({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "An order submission is still unresolved." }),
    });

    await expect(runSignOutTasks()).resolves.toEqual({
      status: "blocked",
      reason: "An order submission is still unresolved.",
    });
  });

  it("stops at the first block so later cleanup does not run", async () => {
    const ran: string[] = [];
    registerSignOutTask({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "pending" }),
    });
    registerSignOutTask({
      name: "cart",
      run: () => {
        ran.push("cart");
        return { status: "ok" };
      },
    });

    await runSignOutTasks();

    expect(ran).toEqual([]);
  });

  it("replaces a task registered twice under the same name", async () => {
    const ran: string[] = [];
    registerSignOutTask({
      name: "cart",
      run: () => {
        ran.push("first");
        return { status: "ok" };
      },
    });
    registerSignOutTask({
      name: "cart",
      run: () => {
        ran.push("second");
        return { status: "ok" };
      },
    });

    await runSignOutTasks();

    expect(ran).toEqual(["second"]);
  });
});
