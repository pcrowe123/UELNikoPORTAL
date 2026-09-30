-- Per-person access to individual applications (D18).
--
-- A tile is open to everybody unless it is marked `invite`, and an `invite` tile is shown to
-- everyone but greyed and padlocked for anyone who has not been granted it. Nothing disappears:
-- people can see that an application exists and ask for it, which is the point.
--
-- READ THIS BEFORE TRUSTING IT. What this table controls is the **appearance** of the landing
-- page, not access to anything. A greyed tile still carries its address in the page source, and
-- the portal has no way to stop somebody pasting that address into their own browser. The real
-- gate is, as it has always been, each application's own login (D2) - which is exactly the
-- arrangement the brief describes. Treat this as a signpost, not a lock, and never let it become
-- the only thing standing between a person and something they should not see.
--
-- What IS enforced here, properly: only an administrator may grant or revoke. A member cannot
-- quietly add themselves to this table, which is what would make the Admin screen a lie.

alter table public.portal_links
  add column if not exists access_mode text not null default 'everyone';

do $$
begin
  alter table public.portal_links
    add constraint portal_links_access_mode check (access_mode in ('everyone', 'invite'));
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.link_access (
  link_id uuid not null references public.portal_links (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (link_id, user_id)
);

create index if not exists link_access_user_idx on public.link_access (user_id);

alter table public.link_access enable row level security;

-- A person may read their own grants - the landing page cannot draw itself otherwise - and an
-- administrator may read everybody's, to fill in the Access dialog.
drop policy if exists link_access_read on public.link_access;
create policy link_access_read on public.link_access for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Only an administrator grants or revokes. This is the half of the feature that is real.
drop policy if exists link_access_write on public.link_access;
create policy link_access_write on public.link_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.app_migrations (name) values ('0003_access.sql') on conflict (name) do nothing;
