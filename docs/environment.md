# Environment and setup

## Setup

```bash
pnpm install
cp .env.example .env.local     # then fill it in
pnpm web                       # browser preview
pnpm android                   # Android device or emulator
```

If configuration is missing, the app shows a readable "Configuration required"
screen naming what to fix — not a blank screen.

## Variables

All client configuration is `EXPO_PUBLIC_*`, **inlined into the bundle at build
time**. Every value here is readable by anyone with the APK. That is fine — Row
Level Security is what protects data, not obscurity.

| Variable                               | Required | Purpose                                                                |
| -------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | yes      | Project URL, e.g. `https://xyz.supabase.co`                            |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes      | Publishable key (`sb_publishable_…`, formerly `anon`)                  |
| `EXPO_PUBLIC_ENVIRONMENT`              | no       | `local` \| `staging` \| `production`, shown in maintenance diagnostics |

Because they are inlined, they must be read as static member expressions
(`process.env.EXPO_PUBLIC_SUPABASE_URL`). A dynamic lookup yields `undefined` in
a production build. `core/env` does this correctly — go through it.

**Changing `.env.local` requires restarting the bundler.**

## Never in the client

- The Supabase **secret key** (formerly `service_role`)
- The database password or any Postgres connection string
- The JWT secret
- The Cloudinary API secret
- Any server-side credential

`.env.local` is git-ignored. `.env.example` is committed and must never contain a
real value.

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
