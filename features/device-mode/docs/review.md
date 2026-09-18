# DeviceMode — review

Independent findings and their disposition. Implementation notes belong in
`worklog.md`.

## Round 1 review — `code-reviewer`, fresh context, on be1e961 + 81f686a

Scope: the full diff (34 files), the control documents, and the tests. The
reviewer ran `pnpm typecheck`, `pnpm lint` and the focused suites itself.

Verdict on the shape: "the runtime guard is genuinely minimal and well-shaped —
the pure model is total, the Context choice is justified, the native module
writes no device policy, and the tests exercise real behaviour rather than
mocks." Twelve findings, concentrated in operational edges and the release
tooling.

| ID  | Severity | Finding                                                                | Disposition                                                                                        |
| --- | -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R01 | major    | `expo prebuild`'s mutation of `package.json` was committed             | **FIXED** — confirmed and reverted                                                                 |
| R02 | major    | Free-text `kiosk_device_role` fails OPEN on an operator typo           | **FIXED** — declared as a `choice` restriction                                                     |
| R03 | major    | A failed read strands preparation on the startup screen forever        | **FIXED** — bounded retry, then a terminal `unavailable` with sign-out                             |
| R04 | major    | Pagination could stop on page 1 and CREATE a duplicate app             | **FIXED** — `limit` on the first request, and a total-aware terminator                             |
| R05 | minor    | A 2xx write with an empty body was reported as a failed run            | **FIXED** — writes accept an empty 2xx body                                                        |
| R06 | minor    | The exchanged access token was not in the redaction set                | **FIXED** — it joins the set as soon as it exists                                                  |
| R07 | minor    | Two tests printed `console.error`; the suite runs with no output       | **FIXED** — silent sink, and the log is now asserted rather than ignored                           |
| R08 | minor    | `app/index.tsx` and `app/_layout.tsx` stated the same rule differently | **FIXED in the second pass** — the first pass changed only `_layout.tsx` and the row overstated it |
| R09 | minor    | Kotlin receiver field unsynchronized; `androidx.core` only transitive  | **FIXED** — `@Volatile` + a lock, and the dependency declared explicitly                           |
| R10 | minor    | No native compile evidence recorded                                    | **CLOSED** — `android-build` SUCCESS on the FINAL head db5fe97; run id in `worklog.md`             |
| R11 | minor    | Dead ternary with two identical branches                               | **FIXED** — deleted                                                                                |
| R12 | minor    | Release tooling is large relative to the product guard                 | **PARTLY ACCEPTED** — see below                                                                    |

### Two findings worth reading rather than just ticking

**R03 was the real one.** `readDeviceMode` failed closed to `unknown`, but
nothing re-read unless the MDM changed something — so a permanently failing
read held a preparation employee on an indeterminate loading screen with no
retry and _no sign-out_. On the kiosk tablet that meant no way to hand the
tablet back without a reboot. The fix keeps the fail-closed direction and adds
an exit: three bounded retries, then a terminal `unavailable` mode that still
blocks preparation but renders a screen explaining it, with the shared
sign-out. A managed-configuration broadcast restarts the attempts.

**R02 is the one that would have bitten in the shop.** The restriction was
declared `android:restrictionType="string"`, so the console renders a text box,
and `deriveDeviceMode` matches the exact literal `customer_kiosk`. An operator
typing `customer-kiosk` would have produced a _silent fail-open_: the kiosk
tablet treated as ordinary, Preparation reachable on it, no signal anywhere.
It is now a `choice` restriction with one entry, so the typo cannot be typed.

### R12 — partly accepted, with the reasoning stated

The reviewer is right that the release tooling is large next to the guard, and
right that it is the same criticism the plan levelled at the superseded
`upload-beta.ts`. Split:

- `LIST_MAX_PAGES` reduced 40 → 10. Accepted.
- `DATA_CENTRES` (nine regions) **kept**. It is a constant lookup, not
  machinery, and it is what lets `resolveDataCentre` REFUSE an unknown code
  rather than guess a host — which is what stops the refresh token being sent
  to the wrong tenant. Deleting eight rows would trade a real safety property
  for eight lines.
- `verify-release-apk.ts` (708 lines + 868 of test) **kept as salvaged**. It is
  the delivery gate, it was already correct, and its 65 tests include the
  mismatch cases that make it a gate rather than decoration. Rewriting it
  smaller would have discarded that evidence for no behavioural gain.

## Round 2 review — re-review of the remediation (4123266)

Nine of twelve closed and verified. Two not closed as recorded, and four new
items. The reviewer also confirmed the Kotlin question I raised:
`return@OnStartObserving` from inside `synchronized { }` is correct — it is an
`inline` function, so the labelled return crosses it legally and the inlined
`finally` releases the monitor.

| ID  | Severity | Finding                                                                | Disposition                                                                                                  |
| --- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R08 | minor    | Not actually fixed — only `_layout.tsx` had changed                    | **FIXED** — both files branch on the same `deviceAccess`                                                     |
| R10 | minor    | Compile evidence missing, and the green run predates the Kotlin change | **CLOSED** — SUCCESS on db5fe97, which compiles the remediated Kotlin and resolves the new gradle dependency |
| N01 | minor    | Exhausting the page bound fell through to `absent` → duplicate app     | **FIXED** — returns `ambiguous` naming the bound                                                             |
| N02 | minor    | A transient re-read failure dropped a settled session to `unknown`     | **FIXED** — the settled mode is held through the retry window                                                |
| N03 | minor    | `worklog.md` recorded nothing for the remediation commit               | **FIXED** — the remediation section above                                                                    |
| N04 | minor    | The screen suite still printed act warnings, and the new tests added 3 | **FIXED** — presses wrapped in `act`; 8 warnings → 0                                                         |

N02's fix deliberately stops short of what it could have done: once the retries
are exhausted the mode still falls to `unavailable` rather than keeping the last
good reading. A change broadcast is exactly the event that can turn an ordinary
tablet into a kiosk one, so a stale `standard` is not something to keep trusting.
The fix only prevents the _flash_ to `unknown` mid-retry, which is what was
tearing down a working session.

## Quality audit

PENDING.
