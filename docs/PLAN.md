# Plan and progress

Where the project is, what comes next, and what only Patrick can do.

Last updated **30 September 2026**.

---

## What is built and checked

The application is written, the Supabase project exists, the schema is applied and the database's
own rules have been proved against it. What is left is sender mail, the first account and the
deploy.

| | |
|---|---|
| Unit tests | **29 pass** — `npm test`, all of `src/engine/links.ts` |
| Types | **clean** — `npm run typecheck` |
| Production build | **clean** — `npm run build` |
| Browser smoke test | **15 steps pass** — `npm run e2e` |
| Database rules | **17 checks pass** — `npm run verify:rls`, against the live project |
| Supabase security linter | **no errors**; two expected warnings (D16) |

`npm run e2e` drives the screens in a real headless browser: the seven tiles appear, every one of
them is an `https` link carrying `rel="noopener noreferrer"` (SE-04), the search box narrows the
list, nothing overflows a 390px phone, a tile can be added and removed, and a `javascript:` address
is refused with a sentence rather than saved.

`npm run verify:rls` drives the database, which is where the enforcement actually lives: a stranger
with the anon key sees nothing (SE-01), a member sees all seven tiles but cannot add, change or hide
one (SE-05), cannot read the activity log and cannot promote themselves (SE-08), the `http://` and
`javascript:` addresses are refused by the check constraint (SE-06), a launch cannot be recorded in
somebody else's name and the log cannot be rewritten (SE-03), and a deactivated account loses access
immediately even holding a valid token (SE-02).

## What is done

- **Supabase project `UELNikoPortal`** — created 30 September 2026. Ref `zeujzuxkjozlelayerkz`,
  eu-west-1, micro, org `szhdpkrgrfsmojpfvftn`.
  Dashboard: https://supabase.com/dashboard/project/zeujzuxkjozlelayerkz
- **`.env`, `.env.local`, `.dev.vars`** — written, and all three confirmed gitignored. The database
  password exists **only** in `.env`; if it is lost it has to be reset from the dashboard.
- **Schema** — `0001_init.sql` and `0002_harden.sql` applied. The seven tiles and the starting
  settings are seeded. No accounts yet, and the activity log is empty.
- **Domain `uelnikoportal.com`** — registered 30 September 2026, and the zone is in this
  Cloudflare account (account `f96d22a4a289d4a088d3539d2e84dc4f`, `pcrowe123@gmail.com`).
- **Deployed** — Worker `uelnikoportal`, 30 September 2026. Both custom domains attached; Cloudflare
  created the DNS records and issued the certificate. Verified live: the portal's own HTML is
  served, the SPA fallback works (`/login` and `/admin` both return 200 rather than a 404), `www`
  serves too, and the TLS chain verifies.
  - https://uelnikoportal.com
  - https://www.uelnikoportal.com
  - https://uelnikoportal.pcrowe123.workers.dev (keeps working, and is not DNS-blocked in the
    office — see the note at the end)
- **GitHub `pcrowe123/UELNikoPORTAL`** — created, and the first commit is pushed to `main`
  (30 September 2026). Mind the casing: the repository is `UELNikoPORTAL`. The mixed-case spelling
  is a GitHub redirect and works, but `origin` is set to the canonical name so nothing depends on
  it.

## What is waiting on Patrick

**1. Set up sender mail.** Invitations and password resets go through Supabase Auth's SMTP settings.
Go to https://supabase.com/dashboard/project/zeujzuxkjozlelayerkz/auth/smtp — **Authentication** is
a top-level section in the narrow icon rail down the far-left edge of the dashboard (the padlock,
above Storage). It is *not* under Project Settings, whatever older notes say. Turn on **Enable
Custom SMTP**, then point it at Resend:

| | |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender | `portal@uel.ie` |
| Sender name | `UEL / Niko Portal` |

`uel.ie` has to be a verified sending domain in Resend — it already is, for Booking. Put the same
password in `.env` as `SMTP_PASS` so the scripts can see it.

Until this is done, invitation mail goes through Supabase's own sender, which is rate-limited to a
few messages an hour. Fine for testing with one address; not enough to invite a dozen people.

**2. Tell Supabase Auth where the portal lives.**
https://supabase.com/dashboard/project/zeujzuxkjozlelayerkz/auth/url-configuration

| | |
|---|---|
| Site URL | `https://uelnikoportal.com` |
| Redirect URLs | `https://uelnikoportal.com/**` (add `http://localhost:5173/**` for development) |

This is easy to skip and annoying to debug. `scripts/create-user.mjs` asks Supabase to send people
to `<APP_URL>/reset-password`, and Supabase **refuses a redirect it has not been told to allow** —
it silently falls back to the Site URL instead, which is `http://localhost:3000` on a new project.
The invitation still arrives; it just takes the person somewhere that is not the portal.

**3. The first administrator — last, not first.** Nobody can sign in until this is run, and it
cannot be done from the app, because there is no signup page (D4).

Decided with Patrick, 30 September 2026: the account is **`pcrowe123@gmail.com`**, and the
invitation waits until Resend is configured so it arrives from `portal@uel.ie` rather than
Supabase's rate-limited sender.

```
node scripts/create-user.mjs --email pcrowe123@gmail.com --name "Patrick Crowe" --role admin
```

It **sends a real email**. Patrick gets a link and chooses his own password; nobody else ever knows
it. That address is then his portal login — unrelated to his accounts on any of the seven
applications (D2).

**4. Invite everyone else** as `member`, and tell them the portal exists. `docs/USER_GUIDE.md` is
written for them and explains the one thing worth understanding — that the portal password is not
the same as their password for any of the applications.

## Worth doing later

- **A Content-Security-Policy header**, for this and the sibling sites together (D12). Deferred
  deliberately, not forgotten.
- **Move the family to Supabase's publishable/secret keys** (D15). Worth doing across all seven
  sites at once; not worth doing to this one alone.
- **Inviting from the Admin screen**, if the user list ever grows past a couple of dozen (D10).
  Today it needs an Edge Function that is not worth deploying.
- **An eighth tile is not a code change.** When the next application appears, it is a row added on
  the Admin screen — not a migration and not a release (CI-01). Do not add it to `0001_init.sql`
  or to `src/backend/seed.ts`.

## The office network is blocking the site (and the site is fine)

**This is happening right now, and it was confirmed by measurement on the day of the deploy.** The
FortiGate on the office network blocks newly registered domains for the first days of their life.
From inside the office, `uelnikoportal.com` resolves to `208.91.112.55` —
`fortinet-block-page-55.fortinet.com` — and the browser shows nothing.

Nothing about the deployment is wrong. Measured on 30 September 2026, minutes after deploying:

```
office resolver   -> 208.91.112.55                      (Fortinet block page)
Cloudflare DNS    -> 104.21.47.253, 172.67.174.220      (the real edge)
```

and going straight to the edge, past the office resolver, returns the portal:

```
curl -sI --resolve uelnikoportal.com:443:104.21.47.253 https://uelnikoportal.com | head -1
# HTTP/2 200 — and curl verified the TLS chain, so the certificate is right too
```

`uelnikobooking.com` did exactly the same thing on the day it went live and cleared on its own.

**Until it clears**, two things work from any office machine:

- **https://uelnikoportal.pcrowe123.workers.dev** — the same Worker, the same site, a domain the
  FortiGate is not blocking. Use this to test, and to sign in if the invitation arrives before the
  block lifts.
- A phone on mobile data.

It will clear by itself in a few days, or IT can allow the domain. **Do not change DNS and do not
redeploy over it** — the deployment is correct and the network is lying about where the domain
points.
