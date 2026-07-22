-- Safety net for notes that never finish processing.
--
-- transcribe's catch block now marks its own note as 'error', but it cannot help when
-- the isolate dies outright — an Edge Function wall-clock timeout or OOM kills the
-- request before any catch runs, leaving the row on 'processing' forever again.
--
-- A note is only ever 'processing' for the duration of one transcribe call (a couple
-- of minutes at worst, bounded by the platform timeout). Anything older than an hour
-- is definitively dead, so flip it to 'error' and say so.

create or replace function sweep_stuck_notes()
returns int language plpgsql security definer as $$
declare
  swept int;
begin
  update notes
  set status = 'error',
      error_message = coalesce(
        error_message,
        'ประมวลผลไม่สำเร็จ — ระบบหยุดกลางคัน (ตรวจพบอัตโนมัติ)'
      )
  where status = 'processing'
    and created_at < now() - interval '1 hour';

  get diagnostics swept = row_count;
  return swept;
end;
$$;

select cron.schedule(
  'sweep-stuck-notes',
  '15 * * * *',            -- hourly, offset from the other jobs
  'select sweep_stuck_notes()'
);
