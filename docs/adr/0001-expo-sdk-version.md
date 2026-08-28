# 0001 — Stay on Expo SDK 54 for now

**Status:** accepted · **Date:** 2026-08

## Context

The repository is pinned to Expo SDK 54 (React Native 0.81.5, React 19.1). Newer
SDKs exist. The obvious move during a foundation rebuild is to take the latest.

Research into the current ecosystem turned up two things that argue against it:

- SDK 55 **dropped the legacy architecture entirely** and shipped Expo Router
  v7 — a real breaking change, not a version bump.
- A memory regression was reported in the SDK following it, with a further
  release expected to address it.

More importantly: this environment has **no Android device or emulator**. An SDK
upgrade's real risk is native — build configuration, native modules, New
Architecture behaviour — and none of that can be verified here. Upgrading two
majors and declaring it done on the strength of a passing typecheck would be
exactly the kind of unverified claim this foundation is supposed to discourage.

## Decision

Stay on SDK 54. Keep the existing pins, which are internally consistent and have
a working lockfile. Keep `newArchEnabled: true`, `reactCompiler`, and
`typedRoutes` as configured.

## Consequences

- The foundation is verifiable _now_, with the tooling actually available.
- The upgrade remains outstanding and should be done as **its own change**, by
  someone who can run it on a tablet — not folded into feature work.
- Dependabot groups all `expo-*` / `react-native-*` packages together so they can
  only move as a set. **Never merge a single Expo package bump on its own.**
- Before upgrading: read the SDK's upgrade guide, run `pnpm doctor`, and build
  and exercise the app on a real Android tablet.
