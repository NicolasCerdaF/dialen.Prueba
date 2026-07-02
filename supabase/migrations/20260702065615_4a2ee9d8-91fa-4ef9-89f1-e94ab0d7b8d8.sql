
create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

grant select on public.knowledge_chunks to authenticated;
grant all on public.knowledge_chunks to service_role;

alter table public.knowledge_chunks enable row level security;

create policy "members read knowledge chunks"
on public.knowledge_chunks for select to authenticated
using (public.is_member(auth.uid(), company_id));

create index if not exists knowledge_chunks_company_idx
  on public.knowledge_chunks (company_id);
create index if not exists knowledge_chunks_document_idx
  on public.knowledge_chunks (document_id);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_knowledge(
  _company_id uuid,
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  document_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable security definer set search_path = public
as $$
  select kc.document_id, kc.chunk_index, kc.content,
         1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.company_id = _company_id
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge(uuid, vector, int) to authenticated, service_role;
