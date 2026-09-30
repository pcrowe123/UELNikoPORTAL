# Decisions

Every assumption and choice, numbered. Code comments and commit messages cite these numbers.
If you decide something that is not written down here, add a D-number for it.

Dates are absolute. "Confirmed" means Patrick said so; "assumed" means nobody has, and the
assumption is written down so it can be overturned cheaply.

---

**D1 — One company, one Supabase project.** UEL and NIKO Bathrooms are one company for the
portal's purposes, so there is no `company_id` column anywhere and no company switcher. Same shape
as UELNikoBooking. *Assumed, following the sibling applications.*

**D2 — The portal is a launcher, not single sign-on.** It stores the address of each application
and nothing else: no credentials, no tokens, no shared session, no shared user list. A person signs
in to the portal, then signs in again to whichever application they open.

This is the decision that keeps the portal cheap and safe. The brief asks for "one-click
navigation", not one-click access, and it states that each site's own login "remains the primary
access control". A portal that held credentials would become the most attractive thing on the
network to break into, and would need to be built to a completely different standard.
*Confirmed by the brief, 30 September 2026.*

**D3 — Two roles, and everyone sees every tile.** `admin` and `member`. There is no per-person tile
visibility: anyone who can sign in to the portal sees all seven applications. A tile somebody has
no account for simply fails at that application's own login, which is where it should fail.

The alternative — an admin screen assigning tiles per person — was offered and declined: it is real
extra build and ongoing administration for a list of seven links that are not themselves secret to
anyone inside the company. *Confirmed with Patrick, 30 September 2026.*

**D4 — Invitation only; no signup page.** An administrator runs
`node scripts/create-user.mjs --email … --role …`, the person is emailed a link and chooses their
own password. Nobody here ever knows it. A trigger on `auth.users` turns the invitation metadata
into the profile row, defaulting to `member` if the metadata says anything unexpected.
*Assumed, following UELNikoBooking.*

**D5 — A tile with a bad address is shown as broken, not hidden.** If `safeHref` refuses a stored
URL, the tile still appears, greyed, saying it needs fixing.

Hiding it would be tidier and worse: a missing tile looks like a portal fault and gets reported as
"the portal is broken", whereas a tile that says what is wrong with it gets fixed in a minute on the
Admin screen. *Assumed.*

**D6 — Removing a tile retires it if anyone has used it.** `removeLink` counts the launches in
`audit_log` first. None, and the row is deleted outright; one or more, and `is_active` goes false so
the activity list keeps pointing at something real. The `link_id` foreign key is
`on delete set null` rather than cascade for the same reason: losing a tile must not quietly erase
the record that people used it. *Assumed, following the room-retirement pattern in UELNikoBooking.*

**D7 — The seven starting tiles are written out twice, and neither copy generates the other.**
`supabase/migrations/0001_init.sql` seeds the cloud; `src/backend/seed.ts` seeds the local demo.
They are the same seven rows typed twice.

Generating one from the other would mean either running TypeScript during a migration or parsing
SQL in the browser bundle, both worse than the duplication. The duplication is safe because it is
a one-time seed: after the first migration the list lives on the Admin screen, and nobody adds the
eighth application by editing either file (CI-01). *Assumed.*

**D8 — camelCase above `src/backend/supabase.ts`, snake_case below it.** That file holds the only
mappers that know both. Same rule as the sibling applications. *Assumed.*

**D9 — A local demo backend, with no cloud project at all.** With no `VITE_SUPABASE_URL`, the app
runs against IndexedDB with a demo administrator and the seven seeded tiles, and the top bar says
"Demo". It is what makes `npm run e2e` safe to run at any time: the smoke test builds its own
bundle with `DEMO_BUILD=1`, which blanks the Supabase values whatever `.env.local` says, so it can
never touch the real user list. *Assumed, following UELNikoBooking.*

**D10 — No Edge Function, and no inviting from the browser.** Creating an account needs the
service-role key. UELNikoBooking wraps that in a `user-management` Edge Function so an administrator
can invite somebody from the Admin screen. The portal does not: it is a launcher with a handful of
users, and a function to deploy, secure and maintain is not worth it for a command Patrick runs a
few times a year. The Admin screen changes and deactivates the people who exist; `create-user.mjs`
makes new ones. Revisit if the user list ever grows past a couple of dozen. *Assumed.*

**D11 — An assets-only Cloudflare Worker.** No server code: the built Vite app in `dist/` is served
by Cloudflare and unknown paths fall back to `index.html` for the SPA router, through
`not_found_handling: "single-page-application"`. There is nothing for a server to do — the database
is Supabase and a launcher has no server logic of its own. Same shape as the siblings.
*Assumed.*

**D12 — No Content-Security-Policy header, for now.** Considered and deliberately deferred. None of
the sibling applications sets one, the brief asks for the same standards as those applications, and
a CSP on a Worker-with-assets needs care to avoid breaking the Supabase connection or the dev
server. The protection a CSP would add here is largely covered already: the one place
admin-supplied data reaches the DOM is a tile's `href`, and that is checked in the engine and again
in the database (SE-06).

Worth revisiting for the whole family of sites at once rather than for the portal alone — it is a
sensible thing to standardise, just not a reason to make this project different from its siblings.
*Assumed; flagged in `docs/PLAN.md` as a possible improvement.*

**D13 — Two letters for the tile badge, skipping "UEL" and "Niko".** Every application shares those
words, so initials taken naively would put "UN" on all seven. `initials()` drops them and uses the
distinctive words, giving IQ, CR, SA, ST, SO, PO, BO. *Assumed.*

**D14 — Launch recording is best-effort and never blocks.** `recordLaunch` is called without being
awaited and swallows its own errors. The browser is already following the link; a slow or failed
audit write must not delay it, and a launch that goes unrecorded is a much smaller problem than a
launcher that hesitates. Ctrl-click and middle-click may not be counted, and the Activity tab says
so. *Assumed (SE-03).*


**D15 — The legacy `anon` / `service_role` JWT keys, not the newer publishable/secret pair.**
Supabase now issues both: the legacy JWT pair and `sb_publishable_…` / `sb_secret_…`, and its own
tooling recommends the newer ones for new projects, because they rotate independently.

The portal uses the legacy pair anyway, because every sibling application does and the brief asks
for the same conventions across the family. A key that works differently here from the other six
sites is a trap for whoever debugs this at 6pm. The protection does not depend on which pair is
used — the anon key is public by design either way, and RLS is what guards the data (SE-01).

Moving the whole family to publishable keys is a worthwhile job; doing it to one site alone is not.
*Assumed, 30 September 2026.*

**D16 — `app_migrations` has RLS on and no policies at all.** Supabase's linter flagged it as an
error after `0001`: it sat in the `public` schema with RLS off, so PostgREST served the list of
migration names to anyone holding the anon key. Nothing dangerous, but nothing that should answer
either.

RLS enabled with **no** policy is the whole fix, and is deliberate rather than an oversight — the
linter now reports "RLS enabled, no policy" as INFO, and that is the intended end state. `supabase
db push` connects as the database owner and the service-role key bypasses RLS, so the migration
runner never needed a policy. *Decided 30 September 2026, `0002_harden.sql`.*
