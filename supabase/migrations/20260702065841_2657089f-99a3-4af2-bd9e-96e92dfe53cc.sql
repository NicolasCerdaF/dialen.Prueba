
create or replace function public.match_knowledge_admin(
  _company_id uuid,
  query_embedding vector(1536),
  match_count int default 4
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

revoke all on function public.match_knowledge_admin(uuid, vector, int) from public, anon, authenticated;
grant execute on function public.match_knowledge_admin(uuid, vector, int) to service_role;
