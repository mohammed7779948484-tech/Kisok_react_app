/**
 * Jest auto-mock for lucide-react-native (root __mocks__, adjacent to
 * node_modules — Jest applies this to every test automatically, no
 * jest.mock() call needed: https://jestjs.io/docs/manual-mocks#mocking-node-modules).
 *
 * The real package ships ESM-only (`dist/esm/lucide-react-native.mjs`),
 * which jest-expo's transformIgnorePatterns does not transform, and it
 * exports one component per icon — a screen can reach any of ~1600 names
 * through its own imports or a shared component it renders (Icon, AppImage,
 * Alert, Dialog, …). Enumerating icons per test file is what produced the
 * `order-details-screen` bug: a stale local mock missing an icon a nested
 * component needed, so `Icon` received `undefined` and crashed reading
 * `displayName`. A Proxy stands in for any icon name instead, matching the
 * project's existing null-rendering-with-displayName convention (see
 * convergence.test.tsx) without needing to be kept in sync.
 *
 * A test file may still `jest.mock("lucide-react-native", () => ({...}))`
 * itself when it wants to assert something about a specific icon; that
 * local mock takes precedence over this one for that file only.
 */
function makeIconStub(name) {
  function LucideIconStub() {
    return null;
  }
  LucideIconStub.displayName = name;
  return LucideIconStub;
}

const stubs = new Map();

module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop !== "string") {
        return undefined;
      }
      if (!stubs.has(prop)) {
        stubs.set(prop, makeIconStub(prop));
      }
      return stubs.get(prop);
    },
  },
);
