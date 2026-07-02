
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
    and public.is_member(auth.uid(), _company_id)
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
