# KioskRuntime — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID      | Severity | Finding                                                                                                                                                            | Evidence                                                    | Disposition                    | Remediation                                                                                                                                                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01-F01 | major    | check:docs flagged 3 bare docs/&lt;doc&gt;.md references in this feature's control documents                                                                       | `pnpm check:docs` output; brief.md/plan.md/worklog.md lines | fixed                          | Lead rephrased with feature-local qualifiers (reviewer agent-077e8b21)                                                                                                                                                                       |
| T01-F02 | major    | worklog/todo did not yet record the T01 implementation state before gating                                                                                         | worklog.md (pre-fix)                                        | fixed                          | Full T01 entry recorded; todo updated before gate                                                                                                                                                                                            |
| T01-F03 | minor    | null-valued restriction keys would cross the bridge as null, breaking the TS union and making T02's Zod boundary reject the WHOLE snapshot (fail-open consequence) | KioskPolicyModule.kt applicationRestrictionsAsMap           | fixed                          | Implementer resumed: null-valued keys dropped (Android: explicit null == unset); doc comments updated; Lead re-verified. Fresh full re-review not re-run for this 2-line minor remediation — Round 1 gate review covers the accumulated diff |
| T01-F04 | minor    | plan said kiosk_device_role "choice"; shipped schema uses "string"                                                                                                 | plan.md design decision 4 vs app.plugin.js                  | fixed                          | Plan text reconciled with the choice→string rejection rationale                                                                                                                                                                              |
| T02-R1  | minor    | Control-record lag: todo/worklog did not yet carry the T02 RED/GREEN evidence before gating                                                                        | todo.md/worklog.md (pre-fix)                                | fixed                          | Full T02 entry recorded with RED failure output, GREEN output, affected checks; todo updated before gate                                                                                                                                     |
| T02-R2  | minor    | Brief AC-02 wording tension: "contradictory values leave the device standard" vs plan decision 2 resolving config-vs-allowlist contradiction toward kiosk          | brief.md:65 vs plan.md decision 2                           | accepted (interpretation note) | See Accepted risks — "contradictory" means contradictory VALUES; the config-vs-allowlist contradiction resolves kiosk per plan decision 2 (safety first)                                                                                     |

| T05-R1 | minor | Plan's test strategy promised "(blocked/failed message surfaced)"; only the blocked outcome was tested at the screen seam (the failed→message mapping is owned and tested by core/auth) | plan.md test strategy vs screen test (blocked only) | fixed | Implementer resumed: one failed-outcome test (mock signOut error + session retained → pipeline's failed reason in the announced Alert, exactly one signOut call, scope "local"); seam-sensitivity probe proves it pins the failed mapping |
| T05-R2 | minor | Committed todo.md status board contradicted the worklog (T01–T04 "not started/PENDING" vs GATE: PASS) — previous session's record lag, carried by the PR HEAD | git show ae8f9ca:...todo.md vs ...worklog.md | fixed | Board catch-up (T01–T04 → done/PASS) committed with the T05 gate commit; board+checkpoint updated in the same commit as each gate from now on |

| T06-R1 | minor | RED relay said "2 trivially-passing tests"; empirical RED re-run shows 3 (the overlay's standard-device absence pin also passed trivially) | reviewer scratch-copy RED re-run: 21 failed / 3 passed / 24 | fixed | Lead recorded the corrected count (3 honest post-contract absence pins) in the T06 worklog entry; no test change needed |
| T06-R2 | minor | Sheet Close button not disabled while signOut.pending — mid-flight close hides a blocked/failed outcome (success unaffected) | maintenance-sheet.tsx:154 vs primary action :125 | fixed | Implementer resumed: Close mirrors the primary action's disabled state; regression RED reproduced the gap exactly, then green; in-flight test extended to both controls |

| T07-R1 | minor | Brief AC-03 lists a runtime web preview with the policy source stubbed to kiosk; Lead runtime evidence initially covered only the standard path (the plan had narrowed browser runtime deliberately) | brief.md AC-03 vs plan.md Verification scopes | fixed | RESOLVED at the T07 gate: kiosk-stubbed web preview recorded (entry + long-press + sheet + wrong/right code + 90s expiry re-lock; zero errors; uncommitted stub reverted byte-identical) + honest supersession note for the session-dependent routing (no preparation credentials in this environment; resolver/hook/12-suite test coverage; hardware at MDM enrollment) |

| R2-1 | minor | Sheet dismissible mid-sign-out-flight via the dialog primitive's built-in paths (scrim tap, hardware back, a11y escape) — onOpenChange passed through ungated; T06-R2 had gated only the Close button | maintenance-sheet.tsx:114 vs @rn-primitives/dialog sources | fixed | T06 implementer resumed: handleOpenChange wrapper ignores false while signOut.pending (one gate, all three paths); regression RED reproduced (scrim press mid-flight) then green; 12 feature suites / 129 tests |
| R2-2 | minor | brief.md out-of-scope clause not reconciled with the pre-T07 plan amendment (claimed only \_layout + route as app/ changes; app/index.tsx also edited) | brief.md:120-122 vs git diff 5aa440a..801f48c --name-status | fixed | Lead amended the brief's parenthetical to name app/index.tsx and point at plan Design decision 6 |

| T08-F01 | blocking | process.env[KEY] computed access violates expo/no-dynamic-env-var (global in the flat config) — expo lint never scans plugins/, but the pre-commit lint-staged eslint --max-warnings=0 gate hard-fails the commit | pnpm exec eslint --max-warnings=0 plugins/... (exit 1, 4 errors) | fixed | Implementer resumed: static member access (behavior-identical) + [string, string][]; gate reproduced failing before / clean after; \*\_KEY constants retained for gradle keys and sentry |
| T08-F02 | minor | .js import suffix sound but undocumented — a future cleanup to extensionless would reintroduce ERR_MODULE_NOT_FOUND under Node 24 type-stripping (expo has no exports map) | probes: import('expo/config-plugins') fails; .js resolves | fixed | 3-line comment at the import + rationale recorded in the T08 worklog entry |
| T08-F03 | minor | Config-mode evidence (prebuild matrix, md5 idempotency, control byte-identity) existed only in the handoff text — AC-07's app-side trail would be lost if the gate commit omitted it | worklog.md had no T08 entry at review time | fixed | Full T08 worklog entry written with the entire prebuild evidence matrix and committed with the gate |
| T08-F04 | minor | T10 heads-up (restore package.json after prebuild) lived only in the implementer handoff; T10's implementer reads todo.md, not the handoff | todo.md T10 focused verification (no package.json mention) | fixed | One line added to todo.md's T10 focused verification by the Lead |

| T09-F01 | minor | Green-path main test used the real outputSink — the success line leaked to stdout during test:ci and was asserted by no test | pnpm test:ci 2 \| grep -c "APK verification passed" → 1 | fixed | Implementer resumed: sink injected + success line pinned (package/versionName/versionCode/non-debug certificate/JS bundle); leak grep → 0; mutation probe failed exactly the green test |
| T09-F02 | minor | --help exits 0 and the direct-run guard is rename-coupled (hardcoded SCRIPT_FILENAME) — a mis-invoked or renamed script could pass the workflow gate silently | verify-release-apk.ts:543–568 | fixed | Recorded as a T10 requirement in todo.md: the workflow's verify step must assert the success line in its output (covers both paths) |
| T09-F03 | minor | The parseFlags "flag requires a value" failure path had no test (every other fail-closed input path was pinned) | verify-release-apk.ts:316–319 vs test file | fixed | Implementer resumed: new test — --apk without a value → non-zero, "--apk requires a value", zero executor calls |

| T10-F01 | minor | EXPECTED*VERSION_CODE had no token validation before the $GITHUB_ENV write (GITHUB_ENV line-injection class; defense-in-depth — app.config.ts is trusted repo content) | android-release.yml identity step (review T10, agent-cb06c837) | fixed | Implementer resumed: String(versionCode) tested against ^[0-9]+$ with a named single-line error; env write + log use the validated token; /tmp mock matrix (1/"12"/7 pass; "7a"/newline/"1.5"/"" fail, env file not written); Lead re-verified diff + checks. Fresh full re-review not re-run for the ~10-line minor remediation (T01-F03 precedent); Round 3 gate review covers the accumulated diff |
| T10-F02 | minor | The android-release dispatch contract (who may dispatch; human must create the four ANDROID_KEYSTORE*\* repo secrets first; workflow_dispatch needs the workflow file on the default branch before the first dispatch; 30-day artifact window the MDM workflow downloads by run id) had no durable documentation — T10's scope was exactly one file | docs/ci.md vs new workflow (review T10, agent-cb06c837) | assigned | Recorded as a T13 requirement (T09-F02 precedent): the feature's mdm-operations.md must document the android-release dispatch procedure alongside the MDM upload contract |

| T11-F01 | major | Input-resolution failure lines bypassed the redaction wrapper — a positional argv token (e.g. a pasted secret from a dropped flag) was echoed verbatim through the raw errorSink before the redacting context existed; same gap in the direct-run catch (live-reproduced) | upload-beta.ts parseFlags + main() emission ordering (review T11, agent-c2ef160a) | fixed | Implementer resumed: collectSecretValues (env + both flag forms) built before any emission; resolution failures routed through redactSecrets; positional message drops the raw value; formatDirectRunFailure (exported, tested) replaces the raw catch write; success-path secret list is the union incl. the losing side of overrides; 6 new masking tests. Fresh re-review (agent-06acbd9f): "adequately fixed as filed" — no raw-sink bypass remains; adversarial variants covered. Lead re-ran the exact reproduction: exit 1, secret absent |
| T11-F02 | minor | Optional inputs hard-fail when set-but-empty (an Actions unset var renders "") — a realistic T12 wiring trap (e.g. MDM_APP_CATEGORY_ID="" would refuse even the update path that does not need it) | upload-beta.ts optional-input resolution (review T11) | assigned | Dispositioned as a T12 wiring requirement (todo.md T12 focused verification): the workflow exports optional env vars only when non-empty. Current fail-closed semantics deliberately unchanged |
| T11-R1 | minor | Residual paste-leak class from the fresh re-review: a credential-shaped value existing ONLY in a non-credential argv slot was quoted verbatim by typed-validation messages (narrow — the wired T12 case is fully redacted; the leak needs a manual mis-paste with the credential nowhere correct) | upload-beta.ts typed validations (re-review T11, agent-06acbd9f) | fixed | Implementer resumed: typed validations of non-credential inputs (data-centre enum, numeric ids, MDM_DRY_RUN) stop quoting the received value entirely (structurally closed); free-form echoes kept and union-redacted when matching a known secret; collectSecretValues doc comment rewritten to the precise guarantee; 8 new tests with a nowhere-else PASTED_SECRET. Lead live-re-verified with env -i: pasted secret absent from all output (grep 0) |
| T11-R2 | minor | Control-record state at re-review time: no T11 worklog entry / review rows (no gate claimed PASS yet, so no contradiction — but the entry must land with the gate commit per T01-F02/T02-R1/T08-F03 precedent) | worklog.md/review.md heading census (re-review T11) | fixed | Resolved by the T11 gate commit itself: full worklog entry (RED/GREEN/affected checks/review pair) + these review rows |

| T12-F01 | minor | Belt-and-braces asymmetry on required string inputs: run-id validated early "because an API dispatch can still send one" (its own comment), but group-id — also required and also bypassable as "" via the REST dispatch API — was only caught by the tool's refusal at the last step, after checkout, install, download and re-verification had run (not a fail-open: the tool refuses pre-network with a named error) | mdm-beta-upload.yml early-validation step vs upload step (review T12, agent-5556ddac) | fixed | Implementer resumed: the early validation step now also rejects an empty group-id dispatch input (env-indirection pattern, names the dispatch input, never echoes the value); mock replays prove both branches exit 1 with named errors. Lead re-verified diff + checks |

| T13-F01 | minor | §5's parenthetical "(creating the channel if it does not exist)" asserted idempotent semantics for POST /api/v1/mdm/labels that no research record supports — the tool POSTs unconditionally; a duplicate-channel rejection would fail closed on every later upload, contradicting the reuse implication | mdm-operations.md §5 vs plan synthesis + worklog revalidation R-03 (review T13, agent-05e7557d) | fixed | Implementer resumed: reworded to the recorded contract (resolves the Beta release label id through the documented channels endpoint) AND the duplicate-channel behavior added to §9's unverified list. Lead re-verified both edits + checks |
| T13-F02 | minor | §6's "(the ANDROID*KEYSTORE*_ secrets, Section 7a)" strict-glob reading omits ANDROID*KEY_ALIAS/ANDROID_KEY_PASSWORD (the alias pair that identifies the key) — internal inconsistency with §7b's complete formulation | mdm-operations.md §6 vs §7a/§7b (review T13) | fixed | Implementer resumed: §6 now uses §7b's complete "the four ANDROID_KEYSTORE*_ / ANDROID*KEY*\* signing secrets" formulation |

| R3-1 | minor | The ops doc never stated where the repo's versionCode comes from (app.config.ts unset → every build defaults to 1) while the MDM server enforces the versionCode increase — the second-release procedure was incomplete at the exact field the server checks | app.config.ts + android-release.yml defaulting + upload-beta pre-check vs mdm-operations.md §6 (round review, agent-95fd66ea) | fixed | T13 implementer resumed: §6 "Bump BOTH version fields in app.config.ts for the next release" — version AND android.versionCode, the tool-vs-server asymmetry, and the first-update requirement (android.versionCode 2+) |
| R3-2 | minor | Mid-flight failure recovery undocumented (partial state between add-version and association; safe-retry semantics; completion paths) | upload-beta.ts mutation order vs mdm-operations.md §7d/§9 (round review) | fixed | T13 implementer resumed: §7d "If an upload run fails mid-flight" — mutation order, the monotonic pre-check's guaranteed-safe same-version retry refusal before any new mutation, console-side association or fix-forward (no downgrade) |
| R3-3 | minor | Plan text drift within the round: design decision 11 literally promised `permissions: contents: read` for both workflows while mdm-beta-upload.yml carries + `actions: read` (justified, documented in-file, but the plan and shipped workflow disagreed on a security-relevant property) | plan.md decision 11 vs mdm-beta-upload.yml permissions (round review) | fixed | Lead: decision 11 reconciled (one clause: + actions: read on the MDM upload workflow, minimal sufficient, documented in-file) and the mdm-operations.md reference made feature-local |

| FR-01 | blocking | The label-gated Android build CI on the final HEAD d468afc FAILED at :app:processDebugResources — AAPT rejected the literal string in android:description of the generated res/xml/kiosk*restrictions.xml ("is incompatible with attribute description (attr) reference") — the native-tier compile evidence the plan assigns to that job | GitHub run 33825189511 log (fetched by the Lead); modules/kiosk-policy/app.plugin.js RESTRICTIONS_XML (final review, agent-5a082a39) | fixed | Root cause: the plugin wrote literal display strings; android:description accepts a string-resource reference only (the official managed-configurations pattern uses @string for both title and description). Fresh implementer (agent-5974f4f2): the mod now also writes res/values/kiosk_policy_strings.xml and the restrictions XML references @string/kiosk_policy*\* (keys/types/comments byte-identical; T01 outputs intact). Compile re-gate: android-build re-triggered on the PR after the fix commit — outcome recorded in the worklog |
| FR-02 | minor | The sheet's blocked/failed outcome Alert rendered only in the unlocked branch — if the maintenance session cleared mid-sign-out-flight (expiry timer, AppState background, or snapshot application), the sheet flipped to the locked code form and the pipeline outcome was never surfaced (T06-R2/R2-1 fixed the close-path variants; the ephemeral-clear paths were missed); no test covered the intersection | maintenance-sheet.tsx outcome rendering + settle effect (final review, agent-5a082a39) | fixed | Fresh implementer (agent-6019068c): RED first (two failing tests — blocked and failed settles landing while the sheet shows the locked form), then the outcome Alert extracted and rendered in BOTH branches (smallest change; T06-R2/R2-1 guards byte-identical); +2 regression tests (68 suites / 798 tests) |

| FRR-01 | minor | The final-HEAD evidence trail (the android-build SUCCESS record, the 68/798 re-verify, the final runtime evidence) existed only in the working tree — the committed worklog ended at a dangling "outcome recorded below"; todo.md's checkpoint and feature-gate lines were stale (develop-integration stage / "final-HEAD run still pending") | git status at re-review time; committed worklog tail; todo.md:17,250 (fresh re-review, agent-c73d726b) | fixed | Landed with the closing control-document commit (this commit): the worklog's compile-re-gate + FINAL_HEAD entry committed, the Re-review section below filled, todo.md checkpoint/board/feature-gate checklist refreshed to the actual final state |

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

## Re-review

After remediation, re-run the reviewer against the same scope.

- Result: FRESH full re-review after the final-review remediations
  (agent-c73d726b, post-remediation, fresh context — did not watch any
  implementation): **0 unresolved blocking, 0 unresolved major.** Both
  remediations verified correct, complete, and empirically re-verified:
  FR-01 — the plugin diff leaves keys/types/comments and manifest mods
  untouched, the string values are byte-equal to the old literals, the
  cross-link check (referenced set == defined set) and byte-identical
  idempotent re-run were independently executed by the reviewer in a
  scratch tree, and the android-build SUCCESS on ae1a982 was confirmed
  through the public GitHub check-runs (the same check failed on d468afc
  under the exact run cited in the FR-01 row — the re-gate is real, not
  asserted). FR-02 — the outcome Alert renders in both branches with the
  settle effect, in-flight dismissal gate, and Close-disabled guards
  byte-identical (T06-R2/R2-1 hold); the RED was re-verified empirically
  (pre-fix component + post-fix tests → 2 failed for exactly the intended
  reason); sheet suite 14/14; full verify 68 suites / 798 tests; the
  linger semantics of signOut.message were examined and accepted
  (identical lifecycle to the unlocked branch since T06, deliberate,
  staff-facing, no secret content; clearing on close would reintroduce the
  swallowed-outcome hazard class). No new findings beyond FRR-01 (the
  uncommitted-evidence record, fixed by the closing commit).
- Findings resolved: FR-01 (blocking → fixed + compile re-gated GREEN),
  FR-02 (minor → fixed with regression tests)
- Still open: none blocking/major; FRR-01 resolved by the closing
  control-document commit

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- AC-02 interpretation (T02-R2, Lead decision): "missing, invalid, pending, or
  contradictory values" in the brief means contradictory restriction VALUES
  (e.g. a malformed role string). The config-vs-allowlist contradiction
  (explicit "standard" while the DPC allowlists this package) resolves toward
  KIOSK per plan Design decision 2 — safety first; downgrading a store tablet
  is an MDM action (remove the allowlist), not an app-config toggle. Pinned by
  `model/derive-device-policy.test.ts` (contradiction row) and recorded here
  so a later audit does not misread the brief.
- T01 Kotlin compilation is not provable in this environment (no Android SDK
  / gradle). Static contract review (fresh reviewer, verified against the
  installed expo-modules-core SDK-54 sources) found nothing expected to fail
  compile; the label-gated `android-build` CI job is the compile evidence once
  the PR exists (external dependency — no push credentials here).
- Cold-start policy-vs-auth ordering (Lead decision, T04 design): the device
  policy is read from LOCAL managed-configuration storage (disk, ~ms) while
  auth readiness requires a network profile resolution, so the kiosk policy
  lands before routing decisions in every realistic ordering. A pathological
  inversion (native read slower than the network) could show the preparation
  experience for a sub-second window on a kiosk tablet with a persisted
  preparation session. Accepted because: the root routing guard is UX
  protection (routes.md — RLS is the real authorization boundary), the MDM
  keeps the device locked regardless, and no meaningful interaction is
  possible in that window. Revisit only if a final reviewer rates it
  blocking/major.

## Quality audit

A **different question** from the review above. Code review asks "is the
implementation correct?". The audit asks "was the promised delivery actually
completed, and is the evidence real?" — comparing `brief.md`, `plan.md`,
`todo.md`, `worklog.md`, this file, and the actual diff.

Run by `quality-auditor` with fresh context, after review findings are
dispositioned. It returns findings; the Lead records them here.

| Category      | Finding                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                 | Resolution |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| not evidenced | GitHub CI on ae1a982 (all four checks SUCCESS) was recorded only by check-run names + sha — no run ids/links in the worklog final entry; PR #9's object state and the runtime browser screenshots were taken on record rather than independently re-checkable from the audit sandbox; the two new workflows have never been dispatched (secrets do not exist) — recorded, never claimed | audit re-run limits (agent-a4f4d55f)     | resolved   | The Lead added the ae1a982 run ids + job URLs to the worklog final entry (CI run 33827690769; Android build run 33827690789) and verified PR #9's state head = the final HEAD through the API; the never-dispatched items remain the documented human follow-ups (mdm-operations.md §7a/§7e/§9)                       |
| stale record  | The "FINAL HEAD" label in todo.md (ae1a982) predated the closing docs commit — the actual head was b149f16 (docs-only; code identical); inherent for a closing commit, but no CI run was then recorded on b149f16 either                                                                                                                                                                | todo.md checkpoint vs git status (audit) | resolved   | The Feature Gate commit updates the FINAL HEAD to the actual gate-commit state and records the CI state on it; the audit's two observations (AC-06's terse task-table column; the plan-amendment process letter) are noted here with no code change — the intent of the plan rules was met and recorded transparently |

- Acceptance criteria in `brief.md` all implemented: YES (AC-01…AC-10 —
  the audit re-verified the observables: package unchanged, lock-task
  grep clean, storage/log negative assertions, both workflows'
  fail-closed first steps, the 90-test MDM client with zero production
  operations, the 551-line operational contract)
- Every task gate `PASS`, every round gate `PASS`: YES (T01–T13 + Rounds
  1/2/3; every worklog entry carries mode, scaffold paths (all exist),
  honest RED, GREEN, affected checks, fresh-reviewer findings;
  test-count arithmetic chains 17/138 → 68/798 and reproduces)
- Worklog carries real command output per task: YES (the audit re-ran
  `pnpm verify` (PASS), `pnpm test:ci` (68/798), both tools' no-input
  fail-closed smokes — messages reproduced byte-for-byte)
- Shared files touched beyond this feature: NONE beyond the plan's
  expected-change list (core/ and components/ untouched — audit-verified
  file-by-file)
- Definition of Done (`AGENTS.md`) met: YES with the two honest
  exceptions the record already carries (Android-physical and
  live-tenant items explicitly unverified; "quality audit done" discharged
  by this report)

Audit verdict: **the delivery is sound.** No "not delivered", no "not
planned", zero scope drift. Strongest evidence seen: the independently
re-run 68/798 green verify at the final HEAD plus the fail-closed tool
smokes reproducing the recorded messages; and the FR-01 chain — a failed
CI run cited by id (33825189511), root-caused from the fetched log, fixed
in-task (b7b6529), and compile-re-gated green.

Audit result: `PASS`
