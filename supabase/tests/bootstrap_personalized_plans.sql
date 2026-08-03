-- Minimal Supabase-compatible surface for disposable PostgreSQL verification.
-- Never apply this bootstrap to a real project database.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text not null,
  role text not null,
  current_team smallint not null
);

grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
