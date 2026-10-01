# Nomi backend (Supabase)

Everything the server needs, as code:

| Path | What it is |
|---|---|
| `migrations/20250101000000_init.sql` | Schema, integrity rules, row-level security, AI allowance, export and account deletion |
| `migrations/20250101000100_system_categories.sql` | The shared category list. Generated: `npm run gen:seed -w @nomi/core` |
| `migrations/20250101000200…000400` | Profile name, onboarding fields, dismissed Radar signals |
| `migrations/20250101000500_sync.sql` | Offline sync: `sync_push` and `sync_pull`, version-checked transactions, deletion markers for budgets, change stamps |
| `functions/interpret/` | Edge Function that turns a sentence into a structured proposal with Claude |
| `config.toml` | Local and deploy configuration: email confirmation, Google, redirect URLs, JWT required |
| `.env.example` | The server-side secrets (names only) |

## Status: what is verified, and what is not

**Verified by automated tests (run on every change):**
- The migrations apply to a real PostgreSQL (PGlite) and the rules hold when attacked: users cannot read, change, delete or reference each other's rows; anonymous callers get nothing; system categories cannot be changed; the audit log cannot be altered; money, transfer, loan and split rules are enforced by the database itself; per-day AI allowance; export contains only the caller's data; account deletion removes everything of theirs and nothing of anyone else's.
- Sync, with two simulated phones talking to the real `sync_push` / `sync_pull` on PostgreSQL: first upload, a second phone receiving everything, edits and deletions travelling, wording-only clashes merged, amount/date/account clashes held for a person to decide, delete-versus-edit, a lost reply replayed harmlessly, a refused change staying queued while the rest syncs, one account never reaching another's rows, anonymous callers refused.
- The Claude request is built correctly for the current model, only names and the user's sentence are sent, replies are validated against the schema, and refusals, truncation and API errors become safe codes. The Edge Function's logic (authentication order, validation, allowance, privacy setting, error mapping, no content in logs or responses) is tested without Deno. The function entry bundles with every import resolved.
- The app's sign-in adapter against a stub of the Supabase client (including the Google code flow and every failure path), session chunking for secure storage, and when the app uses AI versus on-device understanding.

**Not verified, because it needs your accounts:** a live Supabase project, a live Google sign-in, a live Anthropic call, a real Deno runtime, and `config.toml` against the Supabase CLI. The first deploy is where these meet reality. Use the checklist at the bottom.

## What you need to provide

1. **A Supabase project** (supabase.com, free tier is enough to start). Note the project URL, the `anon` key and the project ref.
2. **A Google OAuth client** for sign-in: Google Cloud Console, APIs and Services, Credentials, Create OAuth client ID, type *Web application*. Add the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Keep the client ID and secret.
3. **An Anthropic API key** for the interpreter.

## Set up

```bash
# once
npm install -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <project-ref>

# database
supabase db push                   # applies all migrations

# Google: in the dashboard, Authentication -> Providers -> Google: paste client ID and secret.
# Redirect URLs: Authentication -> URL Configuration: add  nomi://auth/callback

# interpreter
cp supabase/.env.example supabase/.env       # fill in ANTHROPIC_API_KEY (and the Google pair if you manage them here)
supabase secrets set --env-file supabase/.env
supabase functions deploy interpret

# app
cp apps/mobile/.env.example apps/mobile/.env # EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
```

## First-deploy checklist

1. `supabase db push` succeeds, and in the dashboard every table in `public` shows RLS enabled.
2. Sign up with an email in the app (or the dashboard). Confirm the email arrives and the link opens the app.
3. Call the function without a token; expect `401`:
   `curl -i -X POST https://<ref>.supabase.co/functions/v1/interpret -H "apikey: <anon>"`
4. Call it signed in (use a real access token) with a body like the one in `packages/core/test/claude.test.ts`; expect `200` and `{"interpretation": ...}`.
5. Send 201 requests in a day to confirm `429 quota_exceeded`.
6. In the function logs confirm you see only lines like `{"event":"interpret","code":"200","ms":812}` and never any message text.
7. Turn "Use AI to understand messages" off in the app and confirm the function now returns `403 ai_disabled`.

## Decisions for the product owner

- **Model and cost.** The function defaults to `claude-opus-5-5` (the current most capable general model) at low effort. Each capture is a short request and a short JSON reply. A smaller model is cheaper and probably adequate for this narrow extraction task, but that is a cost-versus-accuracy choice for you: set `INTERPRETER_MODEL` (for example `claude-haiku-4-5` or `claude-sonnet-5-5`) and compare on real messages before committing. The reply is schema-validated either way.
- **Refusal fallback.** The request asks the API to re-run a request on a fallback model if a safety classifier declines it. This is on by default and is retried without the parameter if the API rejects it. Set `INTERPRETER_FALLBACKS=0` to turn it off.
- **Daily limit.** 200 per user per day by default (`INTERPRETER_DAILY_LIMIT`). The on-device interpreter still works after the limit, so capture never stops.

## Security notes

- The Anthropic key exists only as a function secret. The app holds only the public anon key plus the user's own session.
- The function checks the signed-in user, then the user's privacy setting, then the allowance, before it ever calls Claude. Clients cannot read or change the allowance.
- Only these reach Claude: the user's sentence (max 500 characters), today's date, locale, currency, and the names of their accounts, categories, people and goals. Never balances, totals, history or ids.
- Row-level security is the tenant boundary. Never use the service-role key in the app.
