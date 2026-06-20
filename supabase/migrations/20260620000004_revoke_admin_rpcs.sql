-- SECURITY: PostgREST exposes every function to anon/authenticated by default.
-- The admin list RPCs dump all users (names, emails, plans, slips) — they must
-- be callable ONLY by the service role (used server-side by the admin-api
-- function after verifying the caller's admin email). The functions are
-- SECURITY DEFINER, so the caller still needs EXECUTE to invoke them.
revoke execute on function admin_list_users(text)        from public, anon, authenticated;
revoke execute on function admin_list_payment_requests() from public, anon, authenticated;
grant  execute on function admin_list_users(text)        to service_role;
grant  execute on function admin_list_payment_requests() to service_role;
