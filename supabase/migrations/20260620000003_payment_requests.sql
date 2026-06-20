-- Payment approval queue: links a user → requested plan → slip, so the admin
-- can approve the right person/plan in one tap (instead of guessing from a LINE ID).

create table if not exists payment_requests (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null,
  line_user_id text not null,
  plan         text,                 -- requested plan (null if slip sent without going through the modal)
  amount       numeric,              -- expected amount (THB)
  slip_url     text,                 -- attached when the slip image arrives via LINE
  status       text not null default 'pending',  -- pending | approved | rejected | superseded
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

create index if not exists payment_requests_status_idx on payment_requests (status, created_at desc);
create index if not exists payment_requests_user_idx   on payment_requests (line_user_id, status);

alter table payment_requests enable row level security;
-- No public policies: access only via security-definer RPCs (client) and service role (admin-api).

-- ── Client: record an upgrade intent (called from PaymentModal) ───────────────
-- Supersedes any earlier pending request from the same user so only the latest stands.
create or replace function create_payment_request(p_line_user_id text, p_plan text, p_amount numeric)
returns uuid language plpgsql security definer as $$
declare v_node uuid; v_id uuid;
begin
  select node_id into v_node from users_profile where line_user_id = p_line_user_id limit 1;
  if v_node is null then return null; end if;
  update payment_requests set status = 'superseded'
    where line_user_id = p_line_user_id and status = 'pending';
  insert into payment_requests (node_id, line_user_id, plan, amount)
  values (v_node, p_line_user_id, p_plan, p_amount)
  returning id into v_id;
  return v_id;
end $$;

-- ── Admin: list pending requests with user info ──────────────────────────────
create or replace function admin_list_payment_requests()
returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select pr.id, pr.line_user_id, pr.plan, pr.amount, pr.slip_url, pr.created_at,
           up.id as user_id, up.display_name, up.nickname, up.picture_url,
           up.plan as current_plan
    from payment_requests pr
    left join users_profile up on up.line_user_id = pr.line_user_id
    where pr.status = 'pending'
  ) t
$$;
