-- Hardening, from Supabase's own database linter run straight after 0001 was applied
-- (30 September 2026). Four findings, all of them fair; none of them was exploitable on its own,
-- and all four are cheap to close.
--
-- 0001 is already applied to the live project, so it is shipped and is never edited (CLAUDE.md
-- rule 6). This is the change instead.

-- ---------------------------------------------------------------- 1. app_migrations (ERROR)
--
-- The migration ledger sat in the `public` schema with RLS disabled, which means PostgREST served
-- it: anybody holding the anon key - which is in the browser bundle, by design - could read the
-- list of migration names. That leaks nothing dangerous, but it is a table in a public schema with
-- no policy on it, and the linter is right to call it an error.
--
-- RLS on and NO policies at all is the whole fix. Nothing should ever read this through the API.
-- `supabase db push` connects as the database owner and the service-role key bypasses RLS, so the
-- migration runner is unaffected.
alter table public.app_migrations enable row level security;

-- ---------------------------------------------------------------- 2. touch_updated_at (WARN)
--
-- The only function in 0001 that was left without a fixed `search_path`. It is SECURITY INVOKER,
-- so the exposure is much smaller than it would be on a definer function, but a trigger that runs
-- on every write is not the place to leave the schema resolution up to whoever is calling.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- 3. and 4. who may call what
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so all three SECURITY DEFINER
-- helpers were reachable as RPC endpoints - `/rest/v1/rpc/is_admin` and the rest.
--
-- `handle_new_user` is a trigger function and nothing else. Calling it directly fails anyway
-- ("trigger functions can only be called as triggers"), and the trigger itself runs as the
-- function's owner when Supabase Auth inserts the row, so no application role needs this at all.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- `current_user_active()` and `is_admin()` are a different case, and worth being careful about:
-- they are named inside the RLS policies in 0001, and Postgres evaluates a policy expression with
-- the privileges of whoever is running the query. Revoke EXECUTE from `authenticated` and every
-- policy that uses them breaks - which is to say every table in this schema stops being readable.
-- So `authenticated` keeps it.
--
-- `anon` does not. Every policy in 0001 is `to authenticated`; there is no anonymous access to
-- anything here by design (SE-01), so an anonymous caller has no reason to reach these. Both
-- functions only ever report on `auth.uid()`, so this was never a leak - an anonymous caller would
-- get `false` - but an endpoint nobody needs is an endpoint that should not answer.
revoke execute on function public.current_user_active() from public, anon;
revoke execute on function public.is_admin() from public, anon;

-- `revoke ... from public` above also strips the grant that `authenticated` inherits through
-- PUBLIC, so give it back explicitly to the one role that genuinely needs it.
grant execute on function public.current_user_active() to authenticated;
grant execute on function public.is_admin() to authenticated;

insert into public.app_migrations (name) values ('0002_harden.sql') on conflict (name) do nothing;
