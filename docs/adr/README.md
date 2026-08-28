# Architecture decision records

Short notes on decisions that are non-obvious, that a future agent might
otherwise reverse by accident, or that were made under a constraint worth
remembering.

Not every dependency needs one. Add an ADR when a decision would be
expensive to unwind or when "why not the obvious thing?" is a fair question.

| #                                         | Decision                                                        |
| ----------------------------------------- | --------------------------------------------------------------- |
| [0001](./0001-expo-sdk-version.md)        | Stay on Expo SDK 54 for now                                     |
| [0002](./0002-testing-stack.md)           | jest-expo + RNTL, not Vitest                                    |
| [0003](./0003-client-state.md)            | Zustand + AsyncStorage, with explicit persistence results       |
| [0004](./0004-architecture-boundaries.md) | Enforce boundaries with ESLint, not convention                  |
| [0005](./0005-generator.md)               | A local Ignite-convention generator, not the ignite-cli package |
| [0006](./0006-customer-tracking-gap.md)   | Customer order tracking is blocked on a backend contract        |
| [0007](./0007-react-native-reusables.md)  | Vendor RNR-architecture primitives                              |
