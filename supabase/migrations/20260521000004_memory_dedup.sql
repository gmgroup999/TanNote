-- Fix duplicate user_memory entries: add unique constraint on (user_id, key)
-- First remove duplicate rows, keeping the latest created_at per (user_id, key)
delete from user_memory
where id not in (
  select distinct on (user_id, key) id
  from user_memory
  order by user_id, key, created_at desc
);

-- Add unique constraint so upsert works correctly
alter table user_memory
  add constraint uq_user_memory_user_key unique (user_id, key);
