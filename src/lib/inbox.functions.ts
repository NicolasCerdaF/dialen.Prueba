import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Assign / reassign / unassign conversation ----------
const AssignInput = z.object({
  conversation_id: z.string().uuid(),
  assignee_id: z.string().uuid().nullable(),
});

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AssignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo, error: cErr } = await supabase
      .from("conversations")
      .select("id, company_id, assignee_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (cErr || !convo) throw new Error("Conversación no encontrada");

    const { error } = await supabase
      .from("conversations")
      .update({ assignee_id: data.assignee_id, updated_at: new Date().toISOString() })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);

    await supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      company_id: convo.company_id,
      actor_id: userId,
      event_type: data.assignee_id
        ? convo.assignee_id
          ? "reassigned"
          : "assigned"
        : "unassigned",
      payload: { from: convo.assignee_id, to: data.assignee_id },
    });
    return { ok: true };
  });

// ---------- Take conversation (assign to self) ----------
export const takeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo } = await supabase
      .from("conversations")
      .select("company_id, assignee_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");
    const { error } = await supabase
      .from("conversations")
      .update({ assignee_id: userId, updated_at: new Date().toISOString() })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    await supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      company_id: convo.company_id,
      actor_id: userId,
      event_type: "taken",
      payload: { from: convo.assignee_id, to: userId },
    });
    return { ok: true };
  });

// ---------- Change conversation status ----------
const StatusInput = z.object({
  conversation_id: z.string().uuid(),
  status: z.enum(["open", "pending", "resolved", "closed"]),
});

export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo } = await supabase
      .from("conversations")
      .select("company_id, status")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");
    const { error } = await supabase
      .from("conversations")
      .update({ status: data.status as any, updated_at: new Date().toISOString() })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    await supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      company_id: convo.company_id,
      actor_id: userId,
      event_type: "status_changed",
      payload: { from: convo.status, to: data.status },
    });
    return { ok: true };
  });

// ---------- Add internal note ----------
const NoteInput = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => NoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: convo } = await supabase
      .from("conversations")
      .select("company_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");
    const { error } = await supabase.from("conversation_notes").insert({
      conversation_id: data.conversation_id,
      company_id: convo.company_id,
      author_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Update customer fields (name/tags/stage/notes) ----------
const CustomerInput = z.object({
  customer_id: z.string().uuid(),
  name: z.string().max(200).optional(),
  stage: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CustomerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      updated_at: string;
      name?: string;
      stage?: string | null;
      tags?: string[];
      notes?: string | null;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.stage !== undefined) patch.stage = data.stage;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("customers").update(patch).eq("id", data.customer_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Mark conversation read (reset unread_count) ----------
export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversation_id);
    return { ok: true };
  });
