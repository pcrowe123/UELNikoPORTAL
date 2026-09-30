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
- **Domain `uelnikoportal.com`** — registered (confirmed by Patrick, 30 September 2026).
- **GitHub `pcrowe123/UELNikoPortal`** — created (confirmed by Patrick). The local repository is
  initialised on `main` with the first commit.

## What is waiting on Patrick

**1. Push the first commit.** The commit is made; the remote has not been set, because the exact
repository address should be the one you actually created:

```
git remote add origin https://github.com/pcrowe123/UELNikoPortal.git
git push -u origin main
```

**2. Set up sender mail.** Invitations and password resets go through Supabase Auth's SMTP settings.
On the dashboard → Project Settings → Authentication → SMTP Settings, point them at Resend:

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

**3. Say the word on the first administrator.** Nobody can sign in until this is run, and it cannot
be done from the app, because there is no signup page (D4). It **sends a real email**, so it has
been left for you — tell me which address and I will run it, or run it yourself:

```
node scripts/create-user.mjs --email patrick@uel.ie --name "Patrick Crowe" --role admin
```

(Which address? Your Supabase login is `pcrowe123@gmail.com`; the docs assume a `uel.ie` address.
Whichever you use is the one you will sign in to the portal with.)

**4. Confirm the Cloudflare zone, then deploy.** `wrangler.jsonc` claims `uelnikoportal.com` and
`www.uelnikoportal.com` with `custom_domain: true`, which makes Cloudflare create the DNS records
and the certificate on deploy — but **only if the zone is already in this Cloudflare account**. If
the domain is registered somewhere else, move the nameservers to Cloudflare first, or take the two
`routes` out and use the workers.dev address to begin with. Then, from the office PC:

```
npm run deploy
```

**5. Invite everyone else** as `member`, and tell them the portal exists. `docs/USER_GUIDE.md` is
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

## A note on the office network

Worth knowing before anyone reports the new site as broken: the FortiGate on the office network
blocks newly registered domains for the first few days of their life, and returns
`208.91.112.55` — `fortinet-block-page-55.fortinet.com` — for them. `uelnikobooking.com` did exactly
this on the day it went live and the deployment was entirely fine. `uelnikoportal.com` is newer
still, so expect it.

If it does not resolve from inside the office just after the first deploy, check from a phone on
mobile data before changing anything, or go straight to the Cloudflare edge:

```
curl -s -o /dev/null -w "%{http_code}\n" --resolve uelnikoportal.com:443:104.21.89.39 https://uelnikoportal.com
```

Do not go changing DNS or redeploying over it.
