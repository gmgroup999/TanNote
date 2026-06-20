-- Public bucket to host payment slip images so the bot can forward them to the
-- admin's LINE (LINE image push requires an HTTPS URL, not binary).
insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', true)
on conflict (id) do nothing;
