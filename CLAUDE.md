# UEL / Niko Portal — working notes for Claude

This project is the launcher for the UEL / NIKO applications: one signed-in landing page listing
every application, one click to open any of them. One company, one Supabase project, one Cloudflare
Worker, to live at **https://uelnikoportal.com**.

It is the smallest project in the family on purpose. Resist making it bigger.

Read these before changing anything:

- `docs/SPECIFICATION.md` — what it does and why, with the requirement ids (PL-03, AU-02, SE-04,
  CI-01 …) that the code comments cite. It quotes Patrick's brief of 30 September 2026 in full.
- `docs/DECISIONS.md` — every assumption and choice, numbered D1, D2, D3 … Code comments and commit
  messages cite these numbers. If you decide something not written down, add a D-number for it.
- `docs/PLAN.md` — what is built, what is next, and what is waiting on Patrick.
- `docs/USER_GUIDE.md` — how a person uses the finished thing.

## THE NON-NEGOTIABLE RULES

1. **This project never touches Intact IQ.** Not a `SELECT`, not through `pai_reader`, not at all.
   A launcher has no business with the ERP, and no reason to acquire one has ever appeared.
2. **The sibling projects under `C:\Famous` are read-only from here** (the workspace guard enforces
   it). Copy patterns from `UELNikoBooking` — the closest relative — freely; never edit them, never
   name them in a deploy or git command. In particular never name `uelnikobooking`, `uelnikosop`,
   `gowansop`, `uelniko-pos`, `uelniko-pod`, `nikouel-mobile-app`, `uelnikoiq` or `uelnikostock` in
   a deploy command. The only deploy name this project may use is `uelnikoportal`.
3. **The portal is a launcher, not single sign-on (D2).** It stores the address of each application
   and nothing else: no credentials, no tokens, no shared session. If a request ever arrives to
   "just log people straight in", that is a different project with a different threat model — stop
   and talk to Patrick rather than starting it here.
4. **Secrets** live only in the gitignored `.env`, `.env.local` and `.dev.vars`. **Never a `VITE_`
   secret** — everything behind a `VITE_` name is published in the browser bundle. The Supabase anon
   key is public by design; the service-role key never leaves `.dev.vars`.
5. **The route guard is cosmetic; RLS is the enforcement.** Every rule about who may do what is
   written twice: once in `RequireAuth` / the screens so the app is pleasant, and once in a Row
   Level Security policy so the app is safe. If you add a rule to one, add it to the other (SE-05).
6. **Never edit a shipped migration.** Add `supabase/migrations/000N_….sql` and run
   `node scripts/setup-supabase.mjs --migrate-only`. Each migration records itself in
   `public.app_migrations`, which is how the runner knows what is outstanding.
   Supabase MCP write tools are blocked in this folder by the workspace guard; use the CLI scripts.
7. **Display is Irish**: en-IE, dd/MM/yyyy, 24-hour clock, Europe/Dublin. Times are stored as UTC
   `timestamptz` and shown in Dublin local time.
8. **The engine is pure.** Everything in `src/engine/` is plain TypeScript with no React, no
   network and no clock of its own. That is what makes the link rules testable, and they are the
   only logic this application has.
9. **A tile address is `https` only — plus `localhost` — and the check is written twice.**
   `safeHref` in `src/engine/links.ts` refuses any scheme that is not `http(s)` — `javascript:`,
   `data:`, `vbscript:`, `file:` — and the `portal_links_url_scheme` constraint refuses anything
   that is not TLS **except** `http://localhost` and `http://127.0.0.1`, for tools that run on the
   person's own machine (D19). A tile URL is admin-supplied data that ends up in an `href`; those
   two checks are what stands between the two. Never widen the exception beyond the local machine:
   plain `http` to a real host puts a live session on the office network in clear text.
10. **The padlock is a signpost, not a lock (D18).** A tile marked `invite` is greyed for anyone
    who has not been granted it, and that is a *presentation* decision. The address is still
    readable through the API by any signed-in person, because the landing page has to draw the tile.
    What IS enforced is that only an administrator may grant or revoke. Never describe the padlock
    to anybody as though it keeps them out of an application — the thing that keeps people out of an
    application is that application's own login (D2). If a request ever arrives to "make the portal
    properly block X", the answer is a change in X, not here.
11. **Configuration is data (CI-01).** The tile list, the welcome line, whether tiles open in a new
    tab, whether the search box shows — all of it lives in `portal_links` and `app_settings` and is
    edited on the Admin screen. **Adding the eighth application is not a code change.** Do not add
    it to `0001_init.sql`, and do not add it to `src/backend/seed.ts`.

## Working loop for a change

`npm run dev` → change → `npm test` → `npm run typecheck` → `npm run build` → `npm run e2e`.
Nothing reaches the live site except through `npm run deploy` from the office PC.

**After any change to a migration, a policy or a role**, also run `npm run verify:rls`. `npm run
e2e` drives the screens; that one drives the database, which is where the enforcement actually is
(rule 5). It makes two throwaway accounts on the reserved `.test` TLD, asks the API seventeen
questions as those people, and deletes them and its own audit rows afterwards — so it is safe
against the live project and **nobody is ever emailed** (the accounts are made with a password and
`email_confirm`, not with an invitation).

## Layout

```
docs/                 SPECIFICATION, DECISIONS, PLAN, USER_GUIDE
scripts/              setup-supabase.mjs, create-user.mjs, e2e-smoke.mjs, lib/
supabase/migrations/  0001_init.sql - never edited once shipped
src/engine/           pure logic: safeHref, normaliseUrl, initials, sort, search, install, access
src/backend/          the storage interface; supabase.ts and local.ts implement it; seed.ts
src/state/            React context (AppContext, useApp)
src/components/       AppShell, LinkCard, InstallButton, Modal, Toast
src/screens/          Home (the landing page), Login, ResetPassword, Admin + admin/*Tab
supabase/functions/   user-management (invites), _shared/
```

The layering runs one way only: `engine` ← `backend` ← `state` ← `screens`/`components`.
`src/backend/supabase.ts` is the only file that knows the database is snake_case; everything above
it sees camelCase (D8). Tests sit next to the code they test (`links.ts`, `links.test.ts`).

`src/components/LinkCard.tsx` is the single most important file in the project: it is where an
admin-supplied URL becomes an `href`. Read rule 9 before touching it.

## Deployment

- **Cloudflare Worker `uelnikoportal`**, assets-only (D11), to serve `uelnikoportal.com` and
  `www.uelnikoportal.com`. Deploy with `npm run deploy` from the office PC, where wrangler is
  already signed in.
  **Unconfirmed:** the brief records the domain as registered with Cloudflare but says the provider
  is to be confirmed. `custom_domain: true` only works if the zone is already in this account — check
  before the first deploy, or the deploy fails on the routes. See `docs/PLAN.md`.
- **Supabase project `UELNikoPortal`**, ref **`zeujzuxkjozlelayerkz`**, region eu-west-1, micro, in
  org `szhdpkrgrfsmojpfvftn` (the same org as the sibling apps). Created 30 September 2026 with
  Patrick's go-ahead; `0001_init.sql` and `0002_harden.sql` are applied and the seven tiles are
  seeded. The ref is also in `.env` as `SUPABASE_PROJECT_REF`, along with `SUPABASE_DB_PASSWORD` —
  the password exists **only** in that gitignored file, so if it is lost it has to be reset from
  the dashboard.
  Dashboard: https://supabase.com/dashboard/project/zeujzuxkjozlelayerkz
  - `node scripts/setup-supabase.mjs --status` says what it can see.
  - `node scripts/setup-supabase.mjs --link` links this folder to the project.
  - `node scripts/setup-supabase.mjs --migrate-only` applies outstanding migrations.
  - `node scripts/create-user.mjs --email x@uel.ie --name "X" --role admin` invites a person.
  - `npm run verify:rls` proves the database still refuses what it should — see below.
  The project uses the **legacy** `anon` / `service_role` JWT keys rather than the newer
  `sb_publishable_` / `sb_secret_` pair, to match every sibling application (D15).
- **Edge Function `user-management`** holds the service-role key and is the only way an account is
  created from the browser (D22). Deploy with
  `node scripts/setup-supabase.mjs --functions-only`. It needs the `APP_URL` secret, set with
  `npx supabase secrets set APP_URL=… --project-ref <ref>`; it is on the workers.dev address while
  the office blocks the custom domain. **Its own admin check is the whole protection** — the
  service-role key bypasses RLS, so nothing downstream will catch a caller who should not be there.
- **Email**: invitations and password resets go through Supabase Auth's SMTP settings, pointed at
  Resend, sender `noreply@uel.ie`. **That address has to stay in step with `APP.authEmailFrom` in
  `src/config.ts`**, which is what the login page tells people to look for after asking for a
  password reset — change one and change the other, or the page names an address that never appears
  in anybody's inbox. There are no Edge Functions in this project and no application mail of its
  own (D10).
- **GitHub `pcrowe123/UELNikoPORTAL`**, private, branch `main`, plain `git push`. Note the casing:
  the repository is `UELNikoPORTAL`, not `UELNikoPortal`. GitHub serves the mixed-case spelling as a
  redirect, so pushing to the wrong one appears to work and prints "This repository moved" — set the
  remote to the canonical name rather than living on the redirect.

## Lessons that cost time

- The shell mangles `\b`, `\n` and `${}` inside heredocs on this PC: write source files with the
  Write tool, not with `cat <<EOF`.
- Vite 8 bundles with rolldown, not rollup. `build.rollupOptions.output.manualChunks` as an object
  fails the build outright with "manualChunks is not a function"; the replacement is
  `output.codeSplitting.groups`.
- **Every sibling project's smoke test serves a build on a port around 4173–4191, and preview
  servers get left running.** `npm run e2e` spent a while failing with "timed out waiting for the
  login card" because port 4191 was already answering — with UELNikoBooking. The smoke test now
  finds a free port itself and, as its second step, checks that the page it got is actually the
  Portal. If a smoke test ever fails in a way that makes no sense, check what is on the port first.
- **Detect a busy port by fetching it, not by binding to it.** A `net` probe on `127.0.0.1:4191`
  succeeds on Windows while another server holds `[::]:4191`, and `localhost` resolves to `::1`
  first — so the probe says "free" and the browser still reaches the other server.
- `window.confirm` stops the whole page, and the headless browser in `npm run e2e` cannot get past
  it. Confirmations go through `Modal`, like everything else.
- PostgREST types an embedded relation (`profiles:actor_id(display_name)`) as an **array** even where
  the foreign key makes it at most one row, and supabase-js infers it that way. `auditFromRow`
  accepts both shapes rather than casting the difference away.
- `_redirects` files break a Cloudflare Worker with Assets. The SPA fallback comes from
  `not_found_handling: "single-page-application"` in `wrangler.jsonc` and from nothing else.
- **Run Supabase's own linter after every migration.** `get_advisors` (security) on the fresh
  project found four things 0001 had left: `app_migrations` was in the `public` schema with RLS off
  and so was being served by PostgREST to anyone holding the anon key; `touch_updated_at` had no
  fixed `search_path`; and all three `SECURITY DEFINER` helpers were callable as RPC endpoints by
  `anon`, because Postgres grants EXECUTE to PUBLIC by default. `0002_harden.sql` closes all four.
- **Do not revoke EXECUTE on a function an RLS policy calls.** Postgres evaluates a policy
  expression with the privileges of whoever is running the query, so taking it from `authenticated`
  would make every table in this schema unreadable. `current_user_active()` and `is_admin()` keep it
  for `authenticated` and lose it for `anon`; the linter still warns about the former and that
  warning is expected. Note `revoke ... from public` also strips what a role inherits through
  PUBLIC, so the grant has to be given back to `authenticated` explicitly.
- **supabase-js hides an Edge Function's error message.** Any non-2xx becomes
  "Edge Function returned a non-2xx status code", with the real body on `error.context` as a
  `Response`. `readFunctionError` in `src/backend/supabase.ts` digs it out; without it every
  careful sentence the function writes is thrown away before anybody reads it.
- **`--window-size` cannot make a Chrome window narrower than about 500px on Windows.** The smoke
  test asked for 390 and laid out at 496 for weeks' worth of runs, so "nothing overflows a 390px
  screen" was passing without ever seeing a phone. Force the viewport with
  `Emulation.setDeviceMetricsOverride` instead, which is not bound by the OS window — and assert
  `document.documentElement.clientWidth` really is what you asked for, so the check cannot go back
  to passing for the wrong reason.
- **Headless Chrome never fires `beforeinstallprompt`**, so the Install button never appears on its
  own and the whole install path would go untested. The smoke test synthesises the event, with
  `prompt()` and `userChoice` stubbed, which exercises the button, the phone layout and the
  dismissal. `appinstalled` can be synthesised the same way.
- **Authentication is not under Project Settings in the Supabase dashboard.** It is a top-level
  section in the far-left icon rail, and the settings worth knowing are at
  `/project/<ref>/auth/smtp` and `/project/<ref>/auth/url-configuration`. Plenty of older notes and
  guides say Project Settings → Authentication; that layout is gone. Link the paths, not the
  clicks.
- **`generateLink` builds a link without sending it; `resetPasswordForEmail` sends one.** Easy to
  reach for the wrong one in a "resend the invitation" button and ship something that looks like it
  works while nobody ever gets an email.
- **`admin/generate_link` is the way to test an invitation without sending one.** It builds the
  link and returns it rather than emailing it, and the `redirect_to` in that link shows whether
  Supabase honoured the address or silently substituted the Site URL — so the allow-list can be
  proved before a real one-shot email goes to a real person. Two traps: it **creates the user** as a
  side effect, and it returns the user's fields at the **top level**, not nested under `user` as
  `POST /admin/users` does. Reading `out.user.id` gets `undefined`, the cleanup skips, and the
  throwaway accounts stay in `auth.users`.
- **Supabase silently ignores a `redirect_to` it has not been told to allow.** `create-user.mjs`
  sends people to `<APP_URL>/reset-password`; unless that address is in Authentication → URL
  Configuration → Redirect URLs, Supabase falls back to the Site URL — `http://localhost:3000` on a
  new project — and the invitation arrives looking perfectly fine while taking the person nowhere.
  It does not warn, and the failure looks like a broken app rather than a missing setting.
- The workspace guard reads the **text** of an `execute_sql` call, not its meaning, so a read-only
  `SELECT` that merely contains the word EXECUTE (say, `has_function_privilege(..., 'EXECUTE')`) is
  blocked as a write. Ask for `proacl` instead and the same question gets answered.

## Working with Patrick

Patrick is learning as we build. Explain in plain English, one step at a time, and show the
evidence rather than asserting that something works. Stop at decision points — anything that costs
money, sends an email to a real person, or changes the live site — and ask. Suggest a commit at each
milestone.
