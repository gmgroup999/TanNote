-- Plan expiry: auto-downgrade starter plans that have passed plan_expires_at

create or replace function enforce_plan_expiry()
returns int language plpgsql security definer as $$
declare
  updated_count int;
begin
  update users_profile
  set plan = 'free',
      plan_expires_at = null
  where plan = 'starter'
    and plan_expires_at is not null
    and plan_expires_at < now();

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- Run every hour
select cron.schedule(
  'enforce-plan-expiry',
  '0 * * * *',
  'select enforce_plan_expiry()'
);
