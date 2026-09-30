-- UEL / Niko Portal - the whole schema.
--
-- Re-runnable: every policy is dropped before it is created and every object is `if not exists`,
-- so applying this twice is harmless. Once shipped it is never edited - a change is a new
-- 000N_*.sql file (CLAUDE.md rule 6).
--
-- One company, one Supabase project, so no company_id column anywhere (D1).

-- The applied-migration ledger the runner reads (scripts/setup-supabase.mjs).
create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The policy helpers are defined after `profiles` exists: a `language sql` body is parsed and
-- validated when the function is created, so they cannot come before the table they read.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  -- Two roles, not three (D3). Everyone who can sign in sees every tile, so the only distinction
  -- worth having is whether a person may change the tile list and the user list.
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- These two drive every policy in the file. They are `security definer` so that reading the
-- caller's own profile is not itself subject to the policies on profiles.
create or replace function public.current_user_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- A profile is made automatically when an account is created. The role and name come from the
-- metadata scripts/create-user.mjs passes in (D4).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    -- `member` unless the invitation said otherwise. An unexpected value in the metadata must not
    -- become a role: the check constraint would reject the row and the sign-up would fail, so
    -- anything that is not one of the two known roles is treated as `member`.
    case
      when new.raw_user_meta_data ->> 'role' in ('admin', 'member')
        then new.raw_user_meta_data ->> 'role'
      else 'member'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody promotes themselves. Only an administrator may change a role, whether somebody is active,
-- or another person's name.
-- Deliberately NOT `security definer`. Inside a definer function `current_user` is the function's
-- owner, never the caller, so the trusted-connection check below would be true for everybody and
-- any member could make themselves an administrator. As an invoker function `current_user` is who
-- is actually asking. `is_admin()` is still definer, so it can read profiles either way.
create or replace function public.protect_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Trusted server-side connections are let through. They already bypass Row Level Security
  -- entirely, so this grants them nothing new - but without it the service-role key could not
  -- deactivate a leaver or correct a role from a script, which is a trap worth avoiding.
  if current_user in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.id is distinct from old.id then
    raise exception 'Only an administrator can change roles or accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_trigger on public.profiles;
create trigger protect_profile_trigger
  before update on public.profiles
  for each row execute function public.protect_profile();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- portal_links

-- The tiles on the landing page. This table IS the portal's content: adding an application is a
-- row here and a settings change, never a release (CI-01).
create table if not exists public.portal_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  url text not null,
  colour text not null default '#0f4c81',
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- THE rule that keeps a hostile address out of the page. `safeHref` in src/engine/links.ts
  -- refuses dangerous schemes in the browser; this refuses anything that is not TLS in the
  -- database. Both, always (CLAUDE.md rule 9). An admin with a valid session is the only person
  -- who can write here, so this is not a defence against a stranger - it is a defence against a
  -- mistake, and against an admin account somebody else has got hold of.
  constraint portal_links_url_https check (url ~* '^https://[^/\s]+'),
  constraint portal_links_colour check (colour ~* '^#[0-9a-f]{6}$'),
  constraint portal_links_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$')
);

create index if not exists portal_links_shown_idx on public.portal_links (is_active, sort_order);

drop trigger if exists portal_links_touch on public.portal_links;
create trigger portal_links_touch before update on public.portal_links
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- settings, audit

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_touch on public.app_settings;
create trigger settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- Who opened what. The portal's one piece of security value beyond the login itself (SE-03).
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  -- Kept so a retired tile can still be counted. `on delete set null` rather than cascade: losing
  -- the tile must not quietly erase the record that people used it.
  link_id uuid references public.portal_links (id) on delete set null,
  action text not null,
  detail text
);

create index if not exists audit_at_idx on public.audit_log (at desc);
create index if not exists audit_link_idx on public.audit_log (link_id) where link_id is not null;

-- ---------------------------------------------------------------- row level security
--
-- This is the real enforcement. The RequireAuth guard in the browser is only there to make the
-- app pleasant (CLAUDE.md rule 5). Every rule below is written again in src/backend/types.ts.

alter table public.profiles enable row level security;
alter table public.portal_links enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

-- profiles: everyone active sees who is who; only an administrator changes anyone.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.current_user_active() or id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- portal_links: every active person reads the tiles - that is what the portal is (D3). Only an
-- administrator writes them. Note there is no policy for `anon`: a stranger who finds the API
-- address gets nothing at all, not even the list of application addresses (SE-01).
drop policy if exists links_read on public.portal_links;
create policy links_read on public.portal_links for select to authenticated
  using (public.current_user_active());

drop policy if exists links_write on public.portal_links;
create policy links_write on public.portal_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings: everyone reads them (the landing page needs the welcome line); admins change them.
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated
  using (public.current_user_active());

drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit: append-only for everyone, readable by administrators. `actor_id = auth.uid()` in the
-- insert check is what stops somebody recording a launch in another person's name.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_admin());

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (public.current_user_active() and actor_id = auth.uid());

-- Nobody edits or deletes an audit entry, administrators included: there are deliberately no
-- update or delete policies on this table. Trimming it is a job for the service-role key.

-- ---------------------------------------------------------------- starting settings

insert into public.app_settings (key, value) values
  ('portal.welcome', '"Pick an application. Each one asks you to sign in with its own account."'::jsonb),
  ('portal.open_in_new_tab', 'true'::jsonb),
  ('portal.show_search', 'true'::jsonb),
  ('site.name', '"Uppercross/Niko"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- the seven applications
--
-- The UEL / Niko applications as of 30 September 2026, confirmed with Patrick on that date.
-- `src/backend/seed.ts` carries the same list for the local demo; this one is the source of truth
-- for the cloud and neither generates the other (D7). After this runs, the list is maintained on
-- the Admin screen - do not add the eighth application in a new migration.
insert into public.portal_links (slug, name, tagline, url, colour, sort_order) values
  ('iq',      'UEL Niko IQ',      'Keyboard-first sales order and quotation entry for Intact IQ.',  'https://uelnikoiq.com',      '#1f7a6c', 1),
  ('crm',     'UEL Niko CRM',     'Reps'' mobile CRM: customers, calls, pricing and orders.',        'https://uelnikocrm.com',     '#0f4c81', 2),
  ('sales',   'UEL Niko Sales',   'Offline-first point of sale for the agricultural fairs.',         'https://uelnikopos.com',     '#9a5b12', 3),
  ('stock',   'UEL Niko Stock',   'Warehouse stock checking over a read-only Intact IQ snapshot.',   'https://uelnikostock.com',   '#6b3fa0', 4),
  ('sop',     'UEL Niko SOP',     'Purchase-order documents in, validated orders out.',              'https://uelnikosop.com',     '#a33b2a', 5),
  ('pod',     'UEL Niko POD',     'Delivery routes and proof of delivery.',                          'https://uelnikopod.com',     '#2e6b3e', 6),
  ('booking', 'UEL Niko Booking', 'Meeting rooms and the boardroom, on one calendar.',               'https://uelnikobooking.com', '#0d7490', 7)
on conflict (slug) do nothing;

insert into public.app_migrations (name) values ('0001_init.sql') on conflict (name) do nothing;
