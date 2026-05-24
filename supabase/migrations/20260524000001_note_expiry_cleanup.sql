-- Note expiry cleanup: delete expired notes + their related data daily

-- ─── cleanup function ─────────────────────────────────────────────────────────
create or replace function cleanup_expired_notes()
returns int language plpgsql security definer as $$
declare
  deleted_count int;
begin
  -- delete note_links first (FK)
  delete from note_links
  where source_note_id in (
    select id from notes where expires_at < now() and status = 'done'
  )
  or target_note_id in (
    select id from notes where expires_at < now() and status = 'done'
  );

  -- delete note_tags (FK)
  delete from note_tags
  where note_id in (
    select id from notes where expires_at < now() and status = 'done'
  );

  -- delete reminders linked to expired notes
  delete from reminders
  where note_id in (
    select id from notes where expires_at < now() and status = 'done'
  );

  -- delete notes
  delete from notes
  where expires_at < now() and status = 'done';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ─── pg_cron: run daily at 01:00 Bangkok time (18:00 UTC) ────────────────────
select cron.schedule(
  'cleanup-expired-notes',
  '0 18 * * *',
  'select cleanup_expired_notes()'
);
