# UEL / Niko Portal — specification

What the portal does and why, with the requirement ids the code comments cite.

The source of the requirements is Patrick's brief of **30 September 2026** ("UEL Niko Portal —
Project Brief"), reproduced in full at the end of this file so the numbered requirements below can
always be checked against the words they came from.

## 1. What it is

A signed-in landing page that lists the UEL / NIKO applications and opens the one you pick. That
is all of it. The brief is explicit: *"Nothing beyond this is planned – the portal is intended as a
simple launcher."*

It is deliberately **not** single sign-on. The portal knows the address of each application and
nothing else about it — no credentials, no session, no shared user list (D2). Signing in to the
portal does not sign anyone in to anything, and signing out of it does not sign them out.

## 2. The landing page (PL)

| id | Requirement |
|---|---|
| PL-01 | A signed-in person sees every application that is marked as shown, in the order an administrator set. |
| PL-02 | Each application appears as a tile with its name, one line about what it is, and its host. |
| PL-03 | Clicking a tile opens that application. By default in a new tab, so the portal stays open behind it (CI-01). |
| PL-04 | A tile is a real link, so middle-click, ctrl-click and "copy link address" behave as a person expects of a launcher. |
| PL-05 | A search box appears once there are more than four tiles, and matches the name, the description and the host. |
| PL-06 | The page works on a phone: one tile per row, nothing clipped, at 390px. |
| PL-07 | A tile whose address is unusable is shown as broken rather than hidden, so somebody fixes it (D5). |
| PL-08 | The page says plainly that each application asks for its own sign-in. |
| PL-09 | The portal can be installed: an **Install** button puts it on a phone's home screen or a desktop's task bar, where it opens without browser chrome. The button appears only when it can do something — never once installed, and never in a browser that cannot. On iOS, where no browser may install a site itself, it explains the Share → Add to Home Screen route instead. |
| PL-10 | An application a person has not been given is shown **padlocked and greyed in its usual place**, never hidden, with a line saying who to ask. It is not rendered as a link. |

## 3. Signing in (AU)

| id | Requirement |
|---|---|
| AU-01 | Email and password, through Supabase Auth. |
| AU-02 | There is no signup page. An administrator invites people; they choose their own password from an emailed link (D4). |
| AU-03 | "I have forgotten my password" sends a reset link. |
| AU-04 | A deactivated account cannot sign in, whatever session it is holding (SE-02). |
| AU-05 | An account with no profile row is not signed in, and no half-session is left behind. |

## 4. Administration (AD)

| id | Requirement |
|---|---|
| AD-01 | An administrator adds, edits, reorders, hides and removes tiles. This is a settings change, never a release (CI-01). |
| AD-02 | A tile needs a name and an https address; https:// is added if the person leaves it off. |
| AD-03 | Removing a tile that somebody has opened retires it; one nobody has ever opened is deleted outright (D6). |
| AD-04 | An administrator sees everyone with an account, and may change a role or deactivate somebody. |
| AD-05 | Nobody changes their own role or deactivates their own account. |
| AD-06 | An administrator sees the last 200 launches: who, what and when. |
| AD-07 | Members cannot reach the Admin screen, and cannot change anything if they get to it anyway (SE-05). |
| AD-08 | An administrator sets each tile to **Everyone** or **By invitation**. New and existing tiles default to Everyone (D18). |
| AD-09 | An administrator opens a person on the People tab and ticks which invitation-only applications they may open. Administrators are never padlocked and so are not listed for granting. |

## 5. Security (SE)

The brief says light-touch security is acceptable at portal level, because *"Each project website
enforces its own login, which remains the primary access control"* — and in the same breath that the
portal *"should still follow the same security standards applied to the other UEL Niko sites"*. So
the standards are the sibling applications' standards; what is light-touch is the amount the portal
is asked to protect, not how carefully it is built.

| id | Requirement |
|---|---|
| SE-01 | A stranger who finds the Supabase API address gets nothing — not even the list of application addresses. There is no policy for `anon` on any table. |
| SE-02 | Deactivating somebody stops them signing in to the portal immediately. It does not touch their accounts on the applications. |
| SE-03 | Every launch is recorded: who opened which application, and when. The record never delays or blocks the click, and is best-effort by design. |
| SE-04 | Outbound tile links carry `rel="noopener noreferrer"`, so the opened site cannot navigate the portal tab through `window.opener` and is not handed the portal's address. |
| SE-05 | Every rule about who may do what is written twice: once in the screens so the app is pleasant, and once as a Row Level Security policy so the app is safe. RLS is the enforcement. |
| SE-06 | Only an `https://` address can be stored as a tile — with one narrow exception, `http://localhost` and `http://127.0.0.1`, for tools that run on the person's own machine and never cross a network (D19). Only `http(s)` can become an `href`. Enforced in the engine and again as the `portal_links_url_scheme` constraint (CLAUDE.md rule 9). |
| SE-10 | A tile that is switched off is invisible to members in the database, not merely filtered out by the screen. Administrators still see it, to switch it back on (D20). |
| SE-07 | No secret is ever put behind a `VITE_` name: everything with that prefix is published in the browser bundle. |
| SE-08 | Nobody promotes themselves. A trigger on `profiles` refuses a role or activation change from anyone who is not already an administrator. |
| SE-09 | Only an administrator may grant or revoke an application. A member cannot add themselves to `link_access`, which is what would make the Admin screen a lie. This is enforced by RLS; the padlock on the landing page is **not** enforcement and is documented as such (D18). |

## 6. Configuration (CI)

| id | Requirement |
|---|---|
| CI-01 | Anything a person might reasonably want to change is data, not code: the tile list, the welcome line, whether tiles open in a new tab, whether the search box appears. Adding the eighth application is a row in a table and no release at all. |

## 7. Out of scope

Recorded so that it stays out, and so that a later "could the portal just…" has an answer:

- Single sign-on, or passing any credential to an application (D2).
- Hiding applications from people. Tiles are padlocked rather than hidden, so somebody can see an
  application exists and ask for it (D18).
- The portal enforcing access to anything. The padlock is a signpost; each application's own login
  is the control (D2, D18).
- Any contact with Intact IQ. The portal has no business with the ERP at all.
- Usage reporting beyond the activity list. The audit table would support it; nothing asks for it.

---

## Appendix: the brief as supplied, 30 September 2026

> **Overview**
> Build a simple web portal that gives users a single entry point to the UEL Niko projects
> developed over recent months. After logging in, users see a list of the project websites and
> click through to the one they want to work with.
>
> **Scope**
> - User login to the portal.
> - A landing page listing all UEL Niko project websites.
> - One-click navigation from the portal to each project website.
> - Nothing beyond this is planned – the portal is intended as a simple launcher.
>
> **Security**
> Light-touch security is acceptable at portal level. Each project website enforces its own login,
> which remains the primary access control. The portal should still follow the same security
> standards applied to the other UEL Niko sites.
>
> **Technical Standards**
> - Follow the same standards, conventions and security practices used on the other UEL Niko sites.
> - Use Supabase where a backend or authentication is needed.
>
> **Project Resources**
> - GitHub repository: UELNikoPortal (name as recorded – see open questions).
> - Domain: UelNikoportal.com, registered with "Cloudflare" (provider to be confirmed).

The two "to be confirmed" items in that last section are still open. They are tracked in
`docs/PLAN.md` under "What is waiting on Patrick", and the names are written into `wrangler.jsonc`
and `.env.example` as the brief records them so that nothing is blocked while they are checked.
