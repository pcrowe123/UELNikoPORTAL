# UEL / Niko Portal

One signed-in landing page that lists every UEL / NIKO application and opens the one you pick.

Sign in once, see the seven applications — IQ, CRM, Sales, Stock, SOP, POD and Booking — and click
through to whichever you need. That is the whole of it: the portal is a launcher, deliberately not
single sign-on. Each application still asks for its own login, which is where access to it is
actually decided.

Built to the same pattern as the sibling UEL applications: Vite + React 19 + TypeScript, Supabase
for authentication and storage, deployed as an assets-only Cloudflare Worker.

## Status

Written, and running against its real Supabase project (`zeujzuxkjozlelayerkz`, created
30 September 2026) with the schema applied and the seven tiles seeded. **Not deployed yet**, and
there are no accounts on it.

`docs/PLAN.md` lists what is left: pushing the first commit, pointing Supabase Auth at Resend so
invitations can send, creating the first administrator, and the deploy.

## Running it

Node 20 or newer.

```
npm install
npm run dev
```

With no `.env.local`, that runs against a local IndexedDB demo with the seven tiles already in it:
sign in with any email and any password. The top bar says **Demo** so there is never any doubt.

## Every command

| | |
|---|---|
| `npm run dev` | the app, on a local dev server |
| `npm test` | the unit tests (the pure link logic) |
| `npm run typecheck` | TypeScript over `src` and `scripts` |
| `npm run build` | the production bundle into `dist/` |
| `npm run e2e` | drives a real headless browser against a demo build |
| `npm run verify:rls` | proves the live database still refuses what it should |
| `npm run deploy` | build, then `wrangler deploy` — the office PC only |
| `node scripts/setup-supabase.mjs --status` | what is configured and what is not |
| `node scripts/setup-supabase.mjs --link` | link this folder to the Supabase project |
| `node scripts/setup-supabase.mjs --migrate-only` | apply outstanding migrations |
| `node scripts/create-user.mjs --email … --name … --role …` | invite a person |

`npm run e2e` always builds its own bundle with the Supabase values blanked, so it can never reach
the real user list or the real tile list.

## Configuration

Copy `.env.example` and fill in what you need. It documents which file each value belongs in and
why. The short version: `VITE_`-prefixed values are published in the browser bundle, so nothing
secret may ever be given one.

## The documents

- `docs/SPECIFICATION.md` — what it does and why, with requirement ids
- `docs/DECISIONS.md` — every assumption and choice, numbered
- `docs/PLAN.md` — progress, next steps, and what only Patrick can do
- `docs/USER_GUIDE.md` — for the people who use it
- `CLAUDE.md` — the rules and the lessons, for whoever works on it next
