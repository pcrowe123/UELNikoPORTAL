-- Hidden tiles are hidden in the database too, not just on the screen.
--
-- Found by `npm run verify:rls` the moment a check was added for it, which is the whole argument
-- for having that script.
--
-- `0001` let any active person select every row of `portal_links`, and the application narrowed it
-- to `is_active = true` in `listLinks()`. That is the rule written once, in the place that does not
-- count (CLAUDE.md rule 5). A member could ask PostgREST directly and read tiles that are switched
-- off - which right now means the two unfinished ones, their names and their addresses.
--
-- Not a catastrophe: a tile's address is not a secret, and each application still has its own
-- login (D2). But "switched off" should mean switched off, and an administrator switching a tile
-- off to take an application down for the afternoon should not be publishing its address to
-- everybody while they do it.
--
-- Administrators keep reading everything, because the Admin screen has to list what is hidden in
-- order to switch it back on.

drop policy if exists links_read on public.portal_links;
create policy links_read on public.portal_links for select to authenticated
  using (public.current_user_active() and (is_active or public.is_admin()));

insert into public.app_migrations (name) values ('0005_hidden_tiles.sql') on conflict (name) do nothing;
