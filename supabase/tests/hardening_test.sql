-- Launch hardening: rate limiting and removal of the legacy platform fields.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect_eq(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare got text;
begin
  execute p_sql into got;
  if got is distinct from p_expected then raise exception 'FAIL: % — expected %, got %', p_label, p_expected, got; end if;
  raise notice 'ok: % = %', p_label, got;
end $$;

create or replace function pg_temp.expect_fail(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'SECURITY FAIL: % — statement succeeded', p_label;
exception
  when raise_exception then
    if sqlerrm like 'SECURITY FAIL%' then raise; end if;
    raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
  when others then raise notice 'ok (blocked): % [%]', p_label, sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Rate limiter (called by the server with the service role; here as superuser).
select pg_temp.expect_eq('hits 1–3 allowed',
  $$select string_agg(public.rate_limit_hit('test:ip1', 3, 3600)::text, ',') from generate_series(1, 3)$$, 'true,true,true');
select pg_temp.expect_eq('4th hit refused', $$select public.rate_limit_hit('test:ip1', 3, 3600)::text$$, 'false');
select pg_temp.expect_eq('other keys unaffected', $$select public.rate_limit_hit('test:ip2', 3, 3600)::text$$, 'true');

set role anon;
select pg_temp.expect_fail('visitors cannot call the limiter', $$select public.rate_limit_hit('x', 1, 60)$$);
select pg_temp.expect_fail('visitors cannot read counters', $$select count(*) from public.rate_limits$$);
reset role;
set role authenticated;
select pg_temp.expect_fail('signed-in users cannot call the limiter', $$select public.rate_limit_hit('x', 1, 60)$$);
reset role;

-- Circle is the platform: no external-platform columns remain.
select pg_temp.expect_eq('legacy platform columns removed',
  $$select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'clinics' and column_name in ('platform', 'platform_url')$$, '0');
select pg_temp.expect_eq('old 4-argument activate_lead removed',
  $$select count(*)::text from pg_proc where proname = 'activate_lead' and pronargs = 4$$, '0');

select 'ALL HARDENING TESTS PASSED' as result;
