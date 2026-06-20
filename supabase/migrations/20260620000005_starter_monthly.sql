-- Starter changed to a MONTHLY plan (was yearly): 800min/150ask/50suggest reset
-- each month, price 199/month, plan_expires_at = +1 month. Quota period for
-- starter now matches free (YYYY-MM). pro/extra stay lifetime.
create or replace function period_for_plan(p_plan text)
returns text language sql stable as $$
  select case p_plan
    when 'pro'   then 'lifetime'
    when 'extra' then 'lifetime'
    else to_char((now() at time zone 'Asia/Bangkok'), 'YYYY-MM')  -- free + starter = monthly
  end;
$$;
