-- Make failed transcriptions visible instead of silent.
--
-- transcribe/index.ts inserts a note row with status='processing' *before* calling
-- Gemini, but its catch block never touched that row. So any failure after the insert
-- (invalid API key, Gemini timeout, parse error) left the note stuck on 'processing'
-- forever: the user saw a note that never finished, and nobody was alerted.
--
-- On top of that cleanup_expired_notes() only deleted rows with status='done', so
-- these stuck rows also escaped the retention policy — the oldest here dates back to
-- 2026-05-24. Found on 2026-07-22 after an expired GEMINI_API_KEY silently failed
-- four recordings for a live pro user.

alter table notes add column if not exists error_message text;

-- Delete every note whose retention window has passed, whatever its status.
-- expires_at is the retention deadline; a row that never finished processing has no
-- more claim to survive it than a finished one does. Notes without expires_at
-- (paid plans) are still kept forever.
create or replace function cleanup_expired_notes()
returns int language plpgsql security definer as $$
declare
  deleted_count int;
begin
  create temp table if not exists _expired_notes on commit drop as
    select id from notes where expires_at < now();

  delete from note_links where source_note_id in (select id from _expired_notes)
                            or target_note_id in (select id from _expired_notes);
  delete from note_tags  where note_id in (select id from _expired_notes);
  delete from reminders  where note_id in (select id from _expired_notes);
  delete from notes      where id      in (select id from _expired_notes);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Retire the rows that are already stuck: they hold no transcript and no summary, so
-- there is nothing to recover — only a status that lies about what happened.
update notes
set status = 'error',
    error_message = 'ประมวลผลไม่สำเร็จ (ค้างสถานะ processing — ตรวจพบ 2026-07-22)'
where status = 'processing'
  and transcript is null
  and summary is null
  and created_at < now() - interval '1 hour';
