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

## Quality audit — `quality-auditor`, fresh context, on db5fe97

Verdict: "the delivery is substantially sound … Everything I could re-run
reproduced." The auditor re-ran `pnpm verify` (95/1284), the four focused
suites, the three guard scripts, and checked the CI run IDs against the GitHub
API. All matched the worklog exactly. **No code defects found.** Fourteen
findings, all about the RECORD rather than the software.

| ID    | Finding                                                                    | Disposition                                                                  |
| ----- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| QA-01 | `brief.md` AC-09 claimed a workflow run as its observable; none exists     | **FIXED** — AC-09 and AC-10 now say NEVER DISPATCHED / NEVER EXECUTED        |
| QA-02 | Round 2 `PASS` did not say the pipeline had never been executed            | **FIXED** — the gate now states it rests on static evidence only             |
| QA-03 | The final-head CI and runtime evidence was uncommitted                     | **ALREADY FIXED** — committed as 7df2408 while the audit was running         |
| QA-04 | The new screen has never been opened in a browser                          | **FIXED (recorded)** — it is unreachable on web by design; now stated        |
| QA-05 | T07's active path showed file contents but named no command                | **FIXED** — the prebuild invocation is recorded                              |
| QA-06 | `plan.md` `READY`-before-T01 is unfalsifiable (one commit)                 | **ACCEPTED** — true, and not repairable after the fact                       |
| QA-07 | Release tooling is ~7x the product guard                                   | **ACCEPTED, owned** — see R12 above; the judgement is the Lead's             |
| QA-08 | Three small additions no task named (`versionCode`, `--dry-run`, artifact) | **FIXED** — recorded in `plan.md`                                            |
| QA-09 | PR #16's body described the branch two commits ago                         | **FIXED** — rewritten                                                        |
| QA-10 | `todo.md` checkpoint stale                                                 | **FIXED**                                                                    |
| QA-11 | Dangling "see below" pointer in `worklog.md`                               | **FIXED**                                                                    |
| QA-12 | The first native run was attributed to be1e961; the API says 81f686a       | **FIXED** — corrected, with the correction noted rather than silently edited |
| QA-13 | `docs/ci.md` did not list the new `android-release.yml`                    | **FIXED** — documented, including why it is the one workflow with secrets    |
| QA-14 | Maestro framed as a job of the CI run; it is a separate workflow           | **FIXED**                                                                    |

Two worth keeping visible rather than burying in a table:

**QA-01 was the real honesty gap.** `worklog.md`, `plan.md` and
`mdm-operations.md` all said plainly that the release workflow had never been
dispatched — but `brief.md`'s AC-09 row still listed "workflow run" as its
observable, unqualified, and the PR body did not mention AC-09 or AC-10 at all.
A reader of the brief alone would have concluded the pipeline was exercised end
to end. Both now say NEVER DISPATCHED and NEVER EXECUTED.

**QA-06 cannot be repaired and should not be papered over.** `plan.md` says
`Status: READY`, but the brief, plan, todo, worklog and all of Round 1's code
landed in one commit, so there is no commit-level proof the plan was READY
before T01 began. It was — but the record cannot demonstrate it, and saying so
is better than asserting a gate nobody can check.

## Round 3 review — CodeRabbit, manually triggered on the draft (35ec2d0)

Five findings, three major. **All five verified against the code and all five
were real** — the three major ones are fail-opens, which is the exact failure
class this feature exists to prevent, so none was arguable.

| ID   | Severity | Finding                                                                        | Disposition                                                            |
| ---- | -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| CR-1 | minor    | The documented `sha256sum` command emits a trailing `  -` the verifier rejects | **FIXED** — `\| cut -d' ' -f1`; confirmed against `normalizeDigest`    |
| CR-2 | minor    | `plan.md`'s `deviceRoleAccess` contract predated the `unavailable` state       | **FIXED** — contract and the D1 derivation table both updated          |
| CR-3 | major    | A present-but-unrecognised `kiosk_device_role` derived `standard`              | **FIXED** — absent is `standard`; any other present value is `unknown` |
| CR-4 | major    | A native module missing ON ANDROID derived `standard`                          | **FIXED** — `standard` only off Android; on Android it is `unknown`    |
| CR-5 | major    | The page bound sat after the `paging.next` `continue`, so that path skipped it | **FIXED** — hoisted; it now guards both advance paths                  |

### Why these three matter, and what they say about the earlier passes

**CR-3 is the one I had pinned with a test.** `deriveDeviceMode` mapped every
unrecognised value to `standard`, and a test asserted exactly that. But only an
MDM managing this device can set `kiosk_device_role` at all — an employee
tablet has no managed configuration whatsoever. So a typo, a stale value or a
wrong primitive type means "a managed device whose policy I cannot read", and
calling that an ordinary tablet is a fail-open. Absence is the positive
evidence for `standard`; a wrong value never was. The R02 `choice` restriction
makes the typo hard to enter through the console, but it does not make the
derivation correct, and the two earlier review rounds both read past it.

**CR-5 is the same mistake twice.** N01 added the page bound, but placed it
after the `paging.next` `continue`, so only the offset path was guarded — the
identical positioning error as the first R04 attempt, and the N01 test only
exercised the offset path, so it passed. The bound is now hoisted above both
advance paths and there is a `paging.next` fixture.

**CR-4** conflated two different absences: no module because the platform has
no DPC (web, jest — genuinely ordinary) and no module on Android (autolinking
or registration failed — a broken kiosk build). The second now derives
`unknown`.

Three independent reviewers, three passes, and the third still found two
fail-opens the first two missed. Worth recording plainly rather than framing
as convergence.

## Round 4 review — re-review of the round 3 fixes (ff60aad)

All five CR fixes confirmed correct and complete, with the `restrictions_pending`
precedence intact and the wholesale `react-native` mock confirmed not to be
hiding anything (jest-expo pins `Platform.OS = "ios"`, so the other 94 suites
genuinely take the non-Android branch rather than the branch being dead).

It also answered the question I set it — _is there a fourth fail-open?_ — with
yes, in the one file no round had re-read since the first commit.

| ID  | Severity | Finding                                                                                        | Disposition                                                        |
| --- | -------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| N04 | major    | Kotlin turned an unreadable read (null service, null bundle) into an empty bundle → `standard` | **FIXED** — both throw; JS fails closed to `unknown`               |
| N05 | major    | CR-5's class survived: an EMPTY page with a total promising more still fell to `absent`        | **FIXED** — returns `ambiguous`; the no-metadata case still breaks |
| N06 | minor    | A present non-boolean `restrictions_pending` fell through to the role check                    | **FIXED** — present and not `false` is `unknown`                   |
| N07 | minor    | A key the DPC set to NULL was dropped, so a cleared role looked absent                         | **FIXED** — emitted as `""`, which derives `unknown`               |
| N08 | minor    | Retention held a settled `standard` through the retry window on a managed device               | **FIXED** — retention is downgrade-only                            |
| N09 | minor    | `mdm-operations.md` did not state CR-3's operational consequence                               | **FIXED**                                                          |
| N10 | —        | The invariant the guard rests on was only a caveat                                             | **RECORDED as an accepted risk** — below                           |

**N04 is the finding that justifies the whole round.** The three previous
rounds were all looking at the JS layer; the Kotlin made an unreadable state
indistinguishable from an unmanaged device _before_ JS could see it, so the
fail-closed derivation above it had nothing to work with. Same mistake as CR-4,
one layer down.

**N05 is the fourth instance of one pattern.** A guard added to this loop, and
a test that only drove the path which already worked. R04's terminator order,
N01's offset-path bound, CR-5's `paging.next` bound, and now the empty-page
branch — where my own comment ("an empty page with more promised would
otherwise loop to the bound") shows I considered the case and chose the wrong
answer.

**N08 deserves naming.** Retention looked like pure UX polish. But only a DPC
broadcast can trigger a re-read, so it only ever engages on a MANAGED device —
meaning a retained `standard` was retained on exactly the tablets where it is
wrong, such as one being converted to the kiosk. It is now downgrade-only:
`customer-kiosk` is held, `standard` is not.

## Round 7 findings

**R6-01 (blocking, mine) — a fifth fail-open, in the fix for the fourth.**
Round 6's `identifyApp` returned a boolean, so "this is somebody else's
package" and "I could not verify this at all" were the same answer, and both
led to `absent` → CREATE. The pattern is exactly CR-4, R04, N01, CR-5 and N05
again: a guard that can only say no, standing where the caller needs it to say
_why_ no. The rule this branch keeps relearning is that a verification result
must carry its reason, because the caller's safe default differs per reason.

**R6-03 (major) — the update renamed the operator's app.** The label-scoped
update echoed the workflow's own `app_name` rather than the tenant's. It passed
five review rounds because every test fixture named the app the same thing the
workflow does; the moment a fixture disagreed, the bug was one probe away. A
fixture that agrees with the code under test proves nothing.

**R6-04 — a test that passed for the wrong reason.** The fake fetch matched
routes by substring, so a request to the App Details endpoint fell through to
the listing route and the guard under test never ran. Exact-pathname matching
turned two other green tests red — which is how R6-01 surfaced.

**Rejected:** nothing in this round. All five findings were real.

## Round 8 findings — the independent review of round 7

Six findings, all accepted, none rejected. Details and probe output in
`worklog.md`.

| id  | severity | what                                                                                                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | blocking | a listing entry that is not an object was dropped before the unusable count could see it, so an unreadable repository reached CREATE |
| F2  | major    | an unreadable release label was dropped, collapsing "refuse to guess" into "use the only one" and shipping to the wrong channel      |
| F3  | major    | the duplicate-package stop and the missing-`app_name` stop had no test — including the guard round 7's commit message claimed to add |
| F4  | minor    | App Details was never checked to be about the app addressed                                                                          |
| F5  | minor    | `--dry-run` skipped the APK read, so it could not catch a wrong `--apk`                                                              |
| F6  | minor    | a wrong doc path, and the update contract documented only in a code comment                                                          |

**The class, named at last.** F1 and F2 are R6-01's shape one layer up and one
layer down, which makes six rounds of the same defect fixed six times at the
point of discovery. The rule is _never discard an input you could not read_: an
unreadable entry is not an absent one, and `absent` is the branch that mutates.
Every remaining drop site in the file was audited against that rule this round
rather than waiting for the next review to find the next one.

**F3 is the uncomfortable one.** A guard can be correct, described accurately
in a commit message, and still be worth nothing — round 7 shipped two that no
test would have noticed the removal of. Every guard added this round was
reverted one at a time against the suite to prove it is load-bearing, and that
is now the standard for this file rather than a round-8 exercise.

## Accepted risks

**AR-01 — the guard depends on the app configuration staying applied, and
cannot detect its removal.** A kiosk tablet whose KISOK app configuration is
deleted in the console, never delivered, or not reapplied after a factory reset
or app reinstall presents an empty restrictions bundle. At the Android API
level that is indistinguishable from an unmanaged tablet, so the app derives
`standard` and Preparation becomes reachable on the locked tablet with no
signal.

No unprivileged Android API distinguishes "managed device with no app config"
from "unmanaged device", so this cannot be closed in the client — the app
cannot tell, and inventing a way for it to tell would mean the device-management
framework this work exists to avoid building. It is a console-discipline
invariant: verify the app configuration is present after any factory reset,
re-enrolment or KISOK reinstall. Recorded in `mdm-operations.md` §2 and in the
physical-tablet checklist.

## Feature gate

`PASS` — recorded in `todo.md`. The draft PR may be handed to a human. It is
never merged by an agent.
