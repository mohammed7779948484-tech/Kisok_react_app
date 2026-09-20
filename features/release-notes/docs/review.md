# release-notes — review

## Findings

No independent round has been run on this feature specifically; it was built
inside the device-mode PR's final remediation round and is covered by that PR's
review. Two self-caught defects are recorded in `worklog.md` rather than here,
because both were found by running tests rather than by reading:

- the eager-rejection / `restoreAllMocks` leakage that made three tests pass in
  isolation and fail in the suite;
- the versionName-only token that would have missed a versionCode-only release.

## Accepted risks

**AR-01 — the message is only as truthful as the bundled notes.** Release-note
bullets are static copy committed with the release. A release whose bullets
were forgotten shows a generic line; a release whose bullets are WRONG shows
wrong text. There is no validation that the notes match the diff, deliberately
— the alternative is a changelog service.

**AR-02 — a write failure means the message can repeat.** Accepted over the
alternative of blocking dismissal. See D5 in `plan.md`.

## Not verified here

**PHYSICAL VALIDATION REQUIRED.** No real N→N+1 silent update has been
observed. That the message appears exactly once on a real Galaxy Tab A9+ after
ManageEngine installs a new build, and does not reappear after Continue plus a
restart, is a hardware gate.
