-- Pro changed to a MONTHLY plan (was lifetime): 2500min/month + unlimited
-- ask/suggest, 399/month, plan_expires_at = +1 month. Only extra stays lifetime.
create or replace function period_for_plan(p_plan text)
returns text language sql stable as $$
  select case p_plan
    when 'extra' then 'lifetime'
    else to_char((now() at time zone 'Asia/Bangkok'), 'YYYY-MM')  -- free + starter + pro = monthly
  end;
$$;
