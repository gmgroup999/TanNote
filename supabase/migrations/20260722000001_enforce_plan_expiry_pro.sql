-- Plan expiry: pro became a monthly plan on 2026-06-20 (migration 20260620000006)
-- but enforce_plan_expiry() still only downgraded 'starter', so an expired pro row
-- stayed 'pro' in users_profile forever.
--
-- Quota enforcement itself was never wrong (transcribe/ask and get_current_usage all
-- compute the effective plan from plan_expires_at at request time), but the stale row
-- shows up as "Pro" in the Admin Panel and in any code that reads users_profile.plan
-- directly. Widen the downgrade to every non-lifetime paid plan.
--
-- 'extra' stays untouched: it is the only lifetime plan (admin-assigned, expires_at null).

create or replace function enforce_plan_expiry()
returns int language plpgsql security definer as $$
declare
  updated_count int;
begin
  update users_profile
  set plan = 'free',
      plan_expires_at = null
  where plan in ('starter', 'pro')
    and plan_expires_at is not null
    and plan_expires_at < now();

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
