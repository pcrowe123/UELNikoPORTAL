-- Allow a tile to point at a tool running on the person's own machine (D19).
--
-- Two of the UEL applications - the Intact SQL generator and Central Purchasing - are not deployed
-- anywhere and run only on Patrick's PC. `0001` allowed nothing but `https://`, so neither could
-- be given a tile at all.
--
-- The exception is deliberately as narrow as it can be: `localhost` and `127.0.0.1`, nothing else.
-- That is not a hole in the https rule, for two reasons worth knowing:
--
--   * browsers already classify `http://localhost` as a **secure context** - it gets the same
--     treatment as an https origin for service workers, credentials and the rest - precisely
--     because it never crosses a network;
--   * a request to localhost cannot be intercepted, redirected or read by anybody else, because it
--     never leaves the machine. The threat https protects against does not exist here.
--
-- What is NOT allowed, and must stay not allowed: plain `http://` to any other host. A tile
-- pointing at `http://something.uel.ie` would send a real person's session over the office network
-- in clear text, and that is the case the original rule exists for.
--
-- The constraint is renamed from `portal_links_url_https`, because it no longer only means https
-- and a constraint whose name lies is a constraint people misread.
--
-- The engine half of this rule is `safeHref` and `describeLinkProblem` in src/engine/links.ts.
-- Both, always (CLAUDE.md rule 9).

alter table public.portal_links drop constraint if exists portal_links_url_https;
alter table public.portal_links drop constraint if exists portal_links_url_scheme;

alter table public.portal_links add constraint portal_links_url_scheme check (
  url ~* '^https://[^/\s]+'
  -- An optional port, then either end-of-string or a path. `localhostage.com` must not match,
  -- which is why the boundary after the host is spelt out rather than left open.
  or url ~* '^http://localhost(:[0-9]{1,5})?(/|$)'
  or url ~* '^http://127\.0\.0\.1(:[0-9]{1,5})?(/|$)'
);

insert into public.app_migrations (name) values ('0004_localhost.sql') on conflict (name) do nothing;
