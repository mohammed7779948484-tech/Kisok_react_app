import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the dynamic-receiver flag used for Android's managed-configuration
 * change broadcast. The source lives in the local Expo module rather than the
 * JS boundary, so this structural test protects a native contract that Jest
 * cannot execute directly.
 */
describe("KioskPolicy managed-configuration receiver", () => {
  const source = readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "modules",
      "kiosk-policy",
      "android",
      "src",
      "main",
      "java",
      "expo",
      "modules",
      "kioskpolicy",
      "KioskPolicyModule.kt",
    ),
    "utf8",
  );

  it("registers ACTION_APPLICATION_RESTRICTIONS_CHANGED as RECEIVER_EXPORTED", () => {
    expect(source).toContain("Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED");
    expect(source).toContain("ContextCompat.RECEIVER_EXPORTED");
    expect(source).not.toContain("ContextCompat.RECEIVER_NOT_EXPORTED");
  });
});
