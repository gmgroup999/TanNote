-- Phase 3: Tags + Knowledge Graph + pgvector

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ─── notes: add embedding column ─────────────────────────────────────────────
alter table notes add column if not exists embedding vector(768);

-- ─── tags ─────────────────────────────────────────────────────────────────────
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null,
  user_id    uuid references users_profile(id) on delete set null,
  name       text not null,
  type       text not null default 'topic',  -- people|project|topic|action|status
  confirmed  boolean default false,
  created_at timestamptz default now(),
  constraint uq_tags unique (node_id, name, type)
);

alter table tags enable row level security;

create policy "service role full access" on tags for all
  to service_role using (true) with check (true);

create policy "anon read" on tags for select
  to anon using (true);

-- ─── note_tags ────────────────────────────────────────────────────────────────
create table if not exists note_tags (
  note_id      uuid not null references notes(id) on delete cascade,
  tag_id       uuid not null references tags(id) on delete cascade,
  node_id      uuid not null,
  ai_suggested boolean default true,
  primary key (note_id, tag_id)
);

alter table note_tags enable row level security;

create policy "service role full access" on note_tags for all
  to service_role using (true) with check (true);

create policy "anon read" on note_tags for select
  to anon using (true);

create policy "anon delete" on note_tags for delete
  to anon using (true);

-- ─── note_links ───────────────────────────────────────────────────────────────
create table if not exists note_links (
  id             uuid primary key default gen_random_uuid(),
  node_id        uuid not null,
  user_id        uuid references users_profile(id) on delete set null,
  source_note_id uuid not null references notes(id) on delete cascade,
  target_note_id uuid not null references notes(id) on delete cascade,
  similarity     float not null,
  confirmed      boolean,  -- null=pending, true=yes, false=no
  created_at     timestamptz default now(),
  constraint uq_note_links unique (source_note_id, target_note_id)
);

alter table note_links enable row level security;

create policy "service role full access" on note_links for all
  to service_role using (true) with check (true);

create policy "anon read" on note_links for select
  to anon using (true);

create policy "anon update" on note_links for update
  to anon using (true);

-- ─── vector similarity search (RPC) ──────────────────────────────────────────
create or replace function match_notes(
  query_embedding text,   -- '[0.1, 0.2, ...]' string for pgvector cast
  match_threshold float,
  exclude_note_id uuid,
  p_node_id       uuid
) returns table (id uuid, title text, similarity float)
language sql stable as $$
  select
    n.id,
    n.title,
    1 - (n.embedding <=> query_embedding::vector(768)) as similarity
  from notes n
  where n.node_id        = p_node_id
    and n.id            != exclude_note_id
    and n.embedding      is not null
    and n.status         = 'done'
    and 1 - (n.embedding <=> query_embedding::vector(768)) > match_threshold
  order by similarity desc
  limit 5;
$$;

-- ─── indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_tags_node            on tags(node_id);
create index if not exists idx_note_tags_note       on note_tags(note_id);
create index if not exists idx_note_links_source    on note_links(source_note_id);
create index if not exists idx_note_links_target    on note_links(target_note_id);
