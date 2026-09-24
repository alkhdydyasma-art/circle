-- Local-only stand-in for the pieces of Supabase's auth schema the migrations use.
-- Never run this against a real Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text not null);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
