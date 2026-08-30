# Environment and setup

## Setup

```bash
pnpm install
pnpm web                       # browser preview
pnpm android                   # Android device or emulator
```

That is the whole setup. **No `.env` copying, no Supabase CLI, no Docker, no
local Supabase stack.** `.env` is committed and already points at the shared
hosted test project, so a fresh clone runs against a working backend.

If configuration is missing, the app shows a readable "Configuration required"
screen naming what to fix — not a blank screen.

## The shared hosted test project

Every agent and developer shares one hosted Supabase **test** project. It exists
so that running the app is never blocked on infrastructure setup.

|                           |                                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| URL                       | `https://akxigjsifwyolkadofnj.supabase.co`                               |
| Key                       | the publishable key in `.env` — the key the client is meant to ship with |
| `EXPO_PUBLIC_ENVIRONMENT` | `test`                                                                   |

Rules for this project:

- **Do not reset, recreate, or migrate it** unless explicitly asked. The project
  owner applies migrations and manages its data.
- **Do not add seed files or a seeding workflow.** Test data lives in the project.
- **It does not replace `pnpm db:verify`.** That still proves the committed types
  match the migrations deterministically, against a throwaway PostgreSQL. A
  hosted project you can query is not evidence that the schema is what the
  repository says it is.
- **Nothing production goes here**, and no credential from here is reused for a
  production account.

### Test logins

Disposable accounts on that project, for runtime testing only:

| Role        | Email                 | Password    |
| ----------- | --------------------- | ----------- |
| Preparation | `preparing@gmail.com` | `777994899` |
| Customer    | `Customer@gmail.com`  | `777994899` |

These are throwaway credentials for a throwaway backend, committed so an agent
can sign in and exercise both experiences without asking anyone.

**Be clear about what that costs.** Unlike the publishable key — which ships
inside the APK regardless — a password is a real grant. Per
`20260826050013_lean_rls_grants.sql`, an active `preparation` session may
`select` from `orders`, `order_items` and `store_settings`, and may call
`update_order_status`. So anyone who can read this repository can read and
change order state on the shared test project. The key alone could not do that.

That is an accepted trade for a disposable backend whose data the project owner
manages. It stops being acceptable the moment this project points at anything
real: rotate both passwords and move them out of the tree before that happens,
and never reuse this pattern for an account holding real data.

This is also the one place credentials are written down. **Maestro flows still
must not contain any** — see `kisok-maestro-e2e`. A flow is run against whatever
device someone has; a committed test login in a flow would follow the app
everywhere it runs.

### Pointing somewhere else

Create `.env.local` (git-ignored) with the same variables. Expo loads it after
`.env`, so it wins. That is where a staging or production value belongs, and it
must never be committed.

## Variables

All client configuration is `EXPO_PUBLIC_*`, **inlined into the bundle at build
time**. Every value here is readable by anyone with the APK. That is fine — Row
Level Security is what protects data, not obscurity.

| Variable                               | Required | Purpose                                                                          |
| -------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | yes      | Project URL, e.g. `https://xyz.supabase.co`                                      |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes      | Publishable key (`sb_publishable_…`, formerly `anon`)                            |
| `EXPO_PUBLIC_ENVIRONMENT`              | no       | `local` \| `test` \| `staging` \| `production`, shown in maintenance diagnostics |

Because they are inlined, they must be read as static member expressions
(`process.env.EXPO_PUBLIC_SUPABASE_URL`). A dynamic lookup yields `undefined` in
a production build. `core/env` does this correctly — go through it.

**Changing `.env` or `.env.local` requires restarting the bundler.**

## Never in the client

- The Supabase **secret key** (formerly `service_role`)
- The database password or any Postgres connection string
- The JWT secret
- The Cloudinary API secret
- Any server-side credential

`.env.local` is git-ignored. `.env` IS committed, and holds only the shared test
project's URL and publishable key — public client configuration, never a secret.
`.env.example` is the variable reference and must never contain a real value.

The tablet displays already-authorised Cloudinary delivery URLs from
`media_assets.secure_url`. It never uploads or signs, so it needs no Cloudinary
credential.

## Validation

`core/env` validates at startup with Zod and fails fast with a message naming the
variable and the fix. Errors never include the offending value — a malformed key
must not end up in a log.

## CI

CI uses placeholder values so `expo export` can bundle. No real project is
contacted and no secret is required for ordinary PR validation — a PR from any
contributor gets the same signal.
