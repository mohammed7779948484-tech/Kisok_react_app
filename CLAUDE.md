# KISOK — always-loaded agent instructions

KISOK is a **private in-store catalog and ordering app** for store-owned Android
tablets. Two experiences share one client: **Customer** (browse, cart, order) and
**Preparation** (fulfil orders). Admin is a separate web app — not this codebase.

**Read [`AGENTS.md`](./AGENTS.md) before doing any work** — it is not loaded
automatically, so open it. It is the operating
manual: architecture, boundaries, Supabase rules, and the Definition of Done.
This file is only the always-loaded summary.

## Source-of-truth hierarchy

When sources disagree, higher wins:

1. **`supabase/migrations/*.sql`** — the ONLY truth for schema, RPCs, RLS, roles,
   and Realtime. Read the migration before writing data code.
2. **This repository's code and docs** — architecture and conventions.
3. **The Flutter reference** (`KISOK_FLUTTER_PRODUCT_REFERENCE.md`) — product
   behaviour, user journeys, and safety invariants ONLY.

⚠️ The Flutter app was built against an **older database**. Its table names,
RPC names, and data models are **wrong** for this project. Never copy a data
contract from it. In particular there is no `Flavor` — the model is
`Product → ProductVariant → option types/values`.

## Non-negotiable rules

- **Never bypass RLS.** No new grants, no security-definer workarounds, no
  reading a table your role has no policy for. If data is unreachable, that is a
  backend decision to raise — not a client problem to route around.
- **Never put a secret in the client.** Only `EXPO_PUBLIC_SUPABASE_URL` and the
  publishable key. Never the secret/`service_role` key, database password, JWT
  secret, or Cloudinary API secret. Never log tokens.
- **Never invent a database contract.** If the RPC you want does not exist in a
  migration, stop and say so.
- **No prices, payments, delivery, shipping, public signup, or social login.**
  These are deliberate product boundaries.
- **Use `pnpm generate` for new feature code.** `feature` scaffolds a slice;
  `query`, `mutation`, `store`, `screen`, `component`, `schema`, `realtime` and
  `route` add one piece each. Do not hand-roll a feature directory.
- **Never call Supabase inside an `onAuthStateChange` callback.** The client
  holds a lock there; it can deadlock the app.
- **Read `features/<name>/TODO.md` first**, expand it into a real plan, and keep
  it updated with evidence as you work.

## Commands

```bash
pnpm install            # setup (copy .env.example to .env.local first)
pnpm web                # dev server + browser preview
pnpm android            # dev server for an Android device
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint (also enforces architecture boundaries)
pnpm format:check       # prettier
pnpm test               # jest + @testing-library/react-native
pnpm generate feature <n> --role=customer   # scaffold a feature vertical slice
pnpm db:verify          # prove database.types.ts matches the migrations
pnpm verify             # everything CI runs — do this before opening a PR
```

## Where code goes

| Kind                      | Location           |
| ------------------------- | ------------------ |
| Route (thin, no logic)    | `app/`             |
| Feature vertical slice    | `features/<name>/` |
| Shared foundation         | `core/`            |
| Shared UI / design system | `components/`      |

Supabase may only be called from a feature's `api/` module. ESLint enforces this.

## Before you finish

Run `pnpm verify`, and check your work against the **Definition of Done** in
[`AGENTS.md`](./AGENTS.md). When you are unsure about a library or API, consult
its current official documentation rather than relying on memory.
