---
name: kisok-code-review
description: Review a KISOK change against this repository's real failure modes — architecture boundaries, Supabase/RPC/RLS correctness, auth and session safety, server vs client state ownership, Realtime misuse, design-system and accessibility conventions, React Native performance, test quality, and generator conformity. Use this whenever you are reviewing a diff, a pull request, or a feature before it merges, whether the code was written by you, another agent, or a person. Report findings; do not silently fix them.
---

# Reviewing a KISOK change

You are an independent reviewer with fresh context. Your job is to **find and
report** problems with evidence. You do not quietly fix what you find: the
author needs to see the finding, and a reviewer that edits code stops being an
independent check on it.

Findings go into the **Findings** table of `features/<feature>/docs/review.md`.
If you are the `code-reviewer` subagent you have no edit tools: return the
findings and let the Lead record them. That separation is what keeps the review
independent.

## How to read the change

1. **Read the brief and plan first.** Most real defects are gaps between what
   was promised and what was built, and you cannot see those from the diff.
2. **Read the tests before the implementation.** They tell you what the author
   believed the behaviour was. A test that asserts on a mock, or that would pass
   against an empty function, is itself a finding.
3. **Then the implementation**, against the checklist below.
4. **Then look for what is missing** — the error branch, the empty state, the
   loading state, the accessibility label.

## What actually goes wrong here

Ordered by how expensive it is when missed.

### Database contract and RLS

- Is every RPC and column in `supabase/migrations/*.sql`? Names taken from the
  Flutter reference are wrong — that app targets an older database.
- Is every RPC payload validated with Zod through `callRpc`? Every KISOK RPC
  returns `jsonb`, typed as the wide `Json`; an unvalidated payload is untyped.
- Is `create_order` returning `kind: "stock_conflict"` treated as a **successful
  call**? It is a normal outcome, not an error.
- Is checkout correctness left to the server? Idempotency, request fingerprint,
  advisory locking, stock validation and the inventory ledger are server-owned.
  Reimplementing any of it in JavaScript is a blocking finding.
- Does a retry of an ambiguous submission reuse the same `client_request_id`?
  Generating a new one can create a duplicate order.
- Any new grant, weakened policy, or security-definer function is **blocking**.
- Is `core/supabase/database.types.ts` hand-edited? It is generated.

### Architecture boundaries

ESLint enforces most of this, so a violation usually means someone disabled a
rule — check for suppressions:

- Supabase only in `features/*/api/**`
- `core/**` and `components/**` must not import a feature
- No deep cross-feature imports; use the feature's `index.ts`
- Routes stay thin: no data loading, no state, no business logic
- Feature code stays inside its own directory

### Auth and session safety

- Nothing async inside an `onAuthStateChange` callback — it runs while Supabase
  holds its auth lock and can deadlock the app.
- Is `signOut`'s three-way outcome handled? `void signOut()` discards both
  `blocked` and `failed`. Use `useSignOutAction`.
- Is the sign-out safety gate intact? Nothing may clear pending checkout
  recovery state before the gate allows it.

### State ownership

- Server data belongs in TanStack Query; client-owned state in Zustand. Server
  data copied into a store goes stale and is a common source of subtle bugs.
- Are persistence failures surfaced rather than swallowed? Telling a customer
  their cart is saved when it is not is a correctness bug on a shared kiosk.
- Realtime is an **invalidation signal**. Rendering from a Realtime payload
  bypasses RLS-shaped reads and is a finding.

### UI, design system, accessibility

See `kisok-design-system`. In review, look for: raw hex colours or inline
dimensions instead of tokens; a new shared primitive that duplicates an existing
one; missing loading, empty and error states; a dead end with nowhere to go
next; interactive elements without a role or label; meaning carried by colour
alone; layouts that assume one orientation.

### React Native performance

See `kisok-react-native-rules`. Judge by measurable failure modes, not dogma —
"this list is unbounded and re-renders every row on each keystroke" is a
finding; "this should be memoized" on its own is not.

### Tests

- Does each test name a behaviour, and would it fail if that behaviour broke?
- Is the RED evidence in `worklog.md` a real failure for the intended reason?
- Are tests colocated with their subject?
- Does the suite still run with zero console output?

### Generator conformity and dependencies

- Was the structure generated, or hand-rolled into a different shape?
- Does anything edit a shared registry, barrel or route table?
- New dependencies: is each justified, SDK 54 compatible, and not a duplicate of
  something already present?

## Reporting

Each finding gets an ID, a severity, the evidence, and a proposed remediation.

| Severity     | Means                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **blocking** | Must not merge: data loss, duplicate orders, RLS or secret exposure, a broken contract, a boundary violation |
| **major**    | Fix in this feature: wrong state ownership, a missing error path, a test that cannot fail                    |
| **minor**    | Worth doing, safe to defer with a note                                                                       |

Be specific — `file:line`, or the command that shows it. "Consider improving
error handling" is not actionable. "`fetchCatalog` throws the raw PostgrestError
instead of `toAppError`, so the screen shows a Postgres message to a customer"
is.

Say plainly when you found nothing in an area. A review that lists only problems
gives no signal about what was actually examined.

## Re-review

After remediation, re-run against the same scope and record what is resolved,
what is still open, and anything the fix introduced. If findings stop
converging — each fix producing a new one — say so rather than continuing.
