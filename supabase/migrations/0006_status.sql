-- A tile has three states, not two (D21).
--
-- `is_active` was doing two different jobs and could not do both. Patrick wants an application
-- that is not ready yet to appear on the landing page, greyed, so people can see it is coming -
-- but `Remove` also used `is_active = false` to retire a tile somebody had already opened (D6),
-- and a retired application must not linger on the page forever. One boolean cannot mean both
-- "not yet" and "no longer".
--
--   live         the ordinary case: a working tile
--   coming_soon  shown to everybody, greyed, not clickable. "Not available yet."
--   retired      not shown at all. Kept so the activity log still makes sense.
--
-- `is_active` is dropped rather than left beside this. A column that no longer decides anything
-- but still looks like it does is how the next person introduces a bug.

alter table public.portal_links
  add column if not exists status text not null default 'live';

do $$
begin
  alter table public.portal_links
    add constraint portal_links_status check (status in ('live', 'coming_soon', 'retired'));
exception
  when duplicate_object then null;
end
$$;

-- Backfill from the flag being replaced. Everything switched off today is one of the two
-- unfinished applications, which is exactly what `coming_soon` is for; nothing has been retired
-- yet. If anything ever is, it is retired explicitly rather than by this migration guessing.
update public.portal_links set status = case when is_active then 'live' else 'coming_soon' end;

-- The read policy follows the new column. Members see what is live or coming; only an
-- administrator sees what has been retired, because the Admin screen has to list it (D20).
drop policy if exists links_read on public.portal_links;
create policy links_read on public.portal_links for select to authenticated
  using (public.current_user_active() and (status <> 'retired' or public.is_admin()));

drop index if exists public.portal_links_shown_idx;
create index if not exists portal_links_shown_idx on public.portal_links (status, sort_order);

alter table public.portal_links drop column if exists is_active;

insert into public.app_migrations (name) values ('0006_status.sql') on conflict (name) do nothing;
