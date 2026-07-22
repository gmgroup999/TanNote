-- Slip auto-verification scaffold (EasySlip).
--
-- Adds the columns needed to record a machine verification of a payment slip and,
-- critically, a unique transaction reference so the same slip can never be used twice.
-- The verification code itself stays dormant until the EASYSLIP_API_KEY secret is set —
-- with no key, line-webhook keeps behaving exactly as it does today (manual approval).

alter table payment_requests add column if not exists trans_ref      text;
alter table payment_requests add column if not exists verify_status  text;   -- null | verified | mismatch | duplicate | failed
alter table payment_requests add column if not exists verified_amount numeric;
alter table payment_requests add column if not exists verified_at    timestamptz;
alter table payment_requests add column if not exists verify_note    text;   -- human-readable reason when not verified

-- One slip = one payment. A replayed slip hits this constraint instead of granting a
-- second upgrade. Partial so the many rows without a ref (manual flow) stay unaffected.
create unique index if not exists payment_requests_trans_ref_uniq
  on payment_requests (trans_ref)
  where trans_ref is not null;

-- Surface the verification result to the Admin Panel so the reviewer can see at a glance
-- whether the slip was machine-checked before tapping approve.
create or replace function admin_list_payment_requests()
returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select pr.id, pr.line_user_id, pr.plan, pr.amount, pr.slip_url, pr.created_at,
           pr.trans_ref, pr.verify_status, pr.verified_amount, pr.verified_at, pr.verify_note,
           up.id as user_id, up.display_name, up.nickname, up.picture_url,
           up.plan as current_plan
    from payment_requests pr
    left join users_profile up on up.line_user_id = pr.line_user_id
    where pr.status = 'pending'
  ) t
$$;

revoke execute on function admin_list_payment_requests() from public, anon, authenticated;
grant  execute on function admin_list_payment_requests() to service_role;
