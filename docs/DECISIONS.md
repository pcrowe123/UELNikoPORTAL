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

**D3 — Two roles, and everyone sees every tile.** *(Superseded in part by D18 on 30 September 2026:
tiles can now be marked invitation-only. The two roles, and the default of everyone seeing
everything, still stand. Kept as written because the reasoning is still why the default is what it
is.)* `admin` and `member`. There is no per-person tile
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

**D10 — No Edge Function, and no inviting from the browser.** *(Superseded by D22 on 30 September
2026: Patrick needs to add people himself, so the function now exists. The reasoning below was
sound for a portal nobody else administered; the requirement changed, not the argument.)* Creating an account needs the
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

**D17 — The portal is an installable PWA, and its service worker caches the shell but never the
tiles.** A launcher earns its keep by being one tap away, so it ships a web app manifest, icons and
a service worker, with an **Install** button in the top bar (PL-09).

Two choices inside that are worth writing down.

*`registerType: 'autoUpdate'`, where the sibling stock app uses `'prompt'`.* Stock is an offline
counting tool and must never reload under somebody mid-count, so it downloads a new version and
offers an "Update app" button. The portal has no in-progress work to lose — it is a list of links —
so it updates silently and skips the button. A launcher with a permanent "Update app" chip in the
corner would be all chrome and no content.

*The service worker precaches the app shell only.* The tile list is fetched from Supabase on every
load and is deliberately not cached. A launcher that opened instantly and showed an application
that has since moved, been renamed or been retired would be worse than one that takes another
second — the whole value of the tile list being data (CI-01) is that a change reaches people at
once.

The Install button hides itself rather than going grey when there is nothing to offer, because a
disabled button invites a second and third click. On iOS it opens instructions instead: Apple does
not implement `beforeinstallprompt` and does not let a site install itself, so the honest thing is
to say where the Share menu is. *Assumed, 30 September 2026.*

**D18 — Per-application access: padlocked, not hidden, and a signpost rather than a lock.**
Patrick asked for applications to be "blocked out" for people without access, and for two more
tiles (SQL and MRP). D3 had settled on everyone seeing everything; this revisits that, narrowly.

Each tile carries an `access_mode`: `everyone` (the default, and what all seven existing tiles are)
or `invite`. An `invite` tile is shown to everybody but drawn padlocked and greyed for anyone who
has not been granted it, and it is rendered as a `<button>` rather than an `<a>`, so there is no
href to middle-click and no address to copy out of the page.

**Blocked out rather than hidden**, because somebody who cannot see an application cannot ask for
it. A padlocked tile is self-documenting: it says the thing exists, that you have not got it, and
who to ask. A hidden one just makes the portal look different on different desks, which generates
questions rather than answering them.

**Open unless marked restricted**, chosen by Patrick over the alternatives. It means shipping this
changed nothing for anybody: all seven tiles stayed `everyone`, and restriction is applied
deliberately where it is wanted. The opposite default would have needed every existing person
granted all seven tiles before anyone could work.

**Administrators are never padlocked.** One can open the Access dialog and tick themselves in two
clicks, so a lock in front of the person holding the key is theatre. Better to be plain about it.

**What is, and is not, enforced.** Only an administrator may grant or revoke — that is a real Row
Level Security policy, proved by `npm run verify:rls`, and it is what stops the Admin screen being
a lie. The padlock itself is **not** enforcement: the tile's address is readable by any signed-in
person through the API, because the landing page has to be able to draw the tile at all. Anybody
determined could paste the address into their browser and would then meet that application's own
login, which is where access has always actually been decided (D2, and the brief's own position
that each site's login "remains the primary access control").

That distinction is written into the migration, the engine, the People dialog and the user guide,
because a control that looks like security and is not is worse than no control at all. If something
must genuinely be kept from somebody, it has to be kept from them in that application, not here.
*Decided with Patrick, 30 September 2026.*

**D19 — `http://localhost` is allowed; plain `http://` to anything else is not.** Two of the UEL
applications — the Intact SQL generator and Central Purchasing — are not deployed anywhere and run
only on Patrick's own PC. The https-only rule from `0001` meant neither could have a tile at all.

The exception is as narrow as it can be: `localhost` and `127.0.0.1`, and nothing that merely
starts with them (`localhost.evil.test` is refused, and there is a test for it). That is not a hole
in the rule, for two reasons: browsers already classify `http://localhost` as a **secure context**,
giving it the same treatment as https for service workers and credentials, precisely because the
request never crosses a network; and a request to localhost cannot be intercepted, redirected or
read by anybody else, so the threat TLS exists to answer is not present.

What stays refused is plain `http://` to a real host. A tile pointing at `http://something.uel.ie`
would put a real person's session on the office network in clear text, and that is the case the
original rule was written for.

The constraint was renamed from `portal_links_url_https` to `portal_links_url_scheme`, because it
no longer means only https and a constraint whose name lies is one people misread.

Both tiles are invitation-only, so they are padlocked for everybody who has not been given them
(D18). They are also, unavoidably, **machine-specific**: a localhost tile works on the PC running
the tool and nowhere else, so it will fail on a phone or another desk. That is a property of the
tools, not of the portal, and it resolves itself the day either one is deployed properly.
*Decided with Patrick, 30 September 2026.*

**D20 — A switched-off tile is hidden from members by the database, not only by the screen.**
`0001` let any active person select every row of `portal_links` and left `listLinks()` to filter
out the inactive ones — the rule written once, in the place that does not count. `npm run
verify:rls` found it the moment a check was added, which is the argument for that script in one
line.

Not a catastrophe: a tile's address is not secret and each application has its own login. But
"switched off" ought to mean switched off, and an administrator taking an application down for an
afternoon should not be publishing its address to everyone meanwhile. Administrators still read
everything, because the Admin screen has to list hidden tiles in order to switch them back on.
*Found and fixed 30 September 2026, `0005_hidden_tiles.sql`.*

**D21 — A tile has three states, because one boolean was doing two jobs.** Patrick asked for
applications that are not ready to appear on the landing page greyed out, rather than vanish. But
`is_active = false` was already doing a second job: `Remove` used it to retire a tile somebody had
opened (D6), and a retired application must not sit on the page forever. One flag cannot mean both
"not yet" and "no longer".

So: `live`, `coming_soon` (on the page, greyed, inert, "Not available yet") and `retired` (off the
page; administrators still see it, to bring it back). `is_active` was **dropped** rather than left
beside the new column — a column that no longer decides anything but still looks like it does is
how the next person introduces a bug.

`visibleLinks` deliberately does **not** filter out `coming_soon`; `LinkCard` greys it. A tile
filtered out in the engine could never be shown as coming soon however it was styled, and putting
the decision in one place keeps the two states honest. *Decided with Patrick, 30 September 2026.*

**D22 — A `user-management` Edge Function, reversing D10.** Patrick needs to add people and grant
them applications himself, rather than asking for a command to be run on the office PC. Creating an
account needs the service-role key, and that key can never go near a browser, so the only way is a
function that holds it server-side.

D10 argued this was not worth it. That was right for a portal only I administered and wrong the
moment Patrick had to do it himself, which is the whole point of an admin screen.

The function's own check is the entire protection: the service-role key bypasses Row Level Security
completely, so nothing downstream will catch a caller who should not be there. It verifies the
token, reads the caller's role from `profiles` — never from anything the caller sent — and refuses
anyone who is not an active administrator. `npm run verify:rls` proves that from the outside, as a
member and as a stranger, and checks no account was created by either attempt.

Inviting can grant applications in the same action, so adding a new starter is one dialog rather
than two. If the grant fails after the account is made, it is reported as a warning rather than
thrown: the invitation has already gone out by then and cannot be recalled, so pretending the whole
thing failed would be a lie.

`scripts/create-user.mjs` stays. It is how the very first administrator is made, before anybody can
sign in to invite anyone. *Decided with Patrick, 30 September 2026.*
