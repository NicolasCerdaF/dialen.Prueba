import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACTION_BY_TYPE,
  evaluateConditions,
  type FlowDefinition,
  type FlowAction,
} from "@/lib/automations/registry";
import type { CrmCustomer } from "@/lib/crm.functions";

// -------- Types --------
export type Automation = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "error";
  trigger: any;
  conditions: any;
  actions: any;
  version: number;
  run_count: number;
  error_count: number;
  last_run_at: string | null;
  last_error: string | null;
  avg_duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  automation_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  triggered_by: string;
  status: "success" | "skipped" | "error";
  skip_reason: string | null;
  error: string | null;
  actions_result: any;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
};

// -------- Schemas --------
const FlowSchema = z.object({
  trigger: z.object({ type: z.string(), config: z.record(z.any()).optional() }),
  conditions: z.array(z.object({
    type: z.string(), op: z.string().optional(), config: z.record(z.any()).optional(),
  })).default([]),
  actions: z.array(z.object({
    type: z.string(), config: z.record(z.any()).optional(),
  })).default([]),
});

// -------- List --------
export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("automations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Automation[];
  });

// -------- Get one --------
export const getAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("automations").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as Automation | null;
  });

// -------- Create --------
export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string }) =>
    z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Sin compañía");
    const { data: row, error } = await supabase.from("automations").insert({
      company_id: profile.company_id,
      name: data.name,
      description: data.description ?? null,
      status: "draft",
      trigger: { type: "manual" } as any,
      conditions: [] as any,
      actions: [] as any,
      version: 1,
      created_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as Automation;
  });

// -------- Update flow (bumps version + snapshot) --------
export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string; name?: string; description?: string | null; flow?: FlowDefinition;
  }) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    flow: FlowSchema.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: current, error: getErr } = await supabase
      .from("automations").select("*").eq("id", data.id).maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!current) throw new Error("Automatización no encontrada");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    let nextVersion = current.version;
    if (data.flow) {
      patch.trigger = data.flow.trigger;
      patch.conditions = data.flow.conditions;
      patch.actions = data.flow.actions;
      nextVersion = (current.version ?? 1) + 1;
      patch.version = nextVersion;
    }
    const { error } = await supabase.from("automations").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.flow) {
      await supabase.from("automation_versions").insert({
        automation_id: data.id,
        company_id: current.company_id,
        version: nextVersion,
        snapshot: {
          name: data.name ?? current.name,
          description: data.description ?? current.description,
          trigger: data.flow.trigger,
          conditions: data.flow.conditions,
          actions: data.flow.actions,
        } as any,
        created_by: userId,
      });
    }
    return { ok: true, version: nextVersion };
  });

// -------- Status toggle --------
export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "draft"|"active"|"paused"|"error" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft","active","paused","error"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("automations").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Duplicate --------
export const duplicateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src } = await supabase.from("automations").select("*").eq("id", data.id).maybeSingle();
    if (!src) throw new Error("Automatización no encontrada");
    const { data: row, error } = await supabase.from("automations").insert({
      company_id: src.company_id,
      name: `${src.name} (copia)`,
      description: src.description,
      status: "draft",
      trigger: src.trigger,
      conditions: src.conditions,
      actions: src.actions,
      version: 1,
      created_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as Automation;
  });

// -------- Delete --------
export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Import from JSON --------
export const importAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string | null; flow: FlowDefinition }) =>
    z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).nullable().optional(),
      flow: FlowSchema,
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Sin compañía");
    const { data: row, error } = await supabase.from("automations").insert({
      company_id: profile.company_id,
      name: data.name,
      description: data.description ?? null,
      status: "draft",
      trigger: data.flow.trigger as any,
      conditions: data.flow.conditions as any,
      actions: data.flow.actions as any,
      version: 1,
      created_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as Automation;
  });

// -------- List recent runs --------
export const listAutomationRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { automation_id: string; limit?: number }) =>
    z.object({ automation_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("automation_runs").select("*")
      .eq("automation_id", data.automation_id)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AutomationRun[];
  });

// -------- Executor: run one flow against a customer --------
export const runAutomationForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { automation_id: string; customer_id: string; message_body?: string; triggered_by?: string }) =>
    z.object({
      automation_id: z.string().uuid(),
      customer_id: z.string().uuid(),
      message_body: z.string().max(4000).optional(),
      triggered_by: z.string().max(60).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const start = Date.now();

    const { data: flow } = await supabase.from("automations").select("*").eq("id", data.automation_id).maybeSingle();
    if (!flow) throw new Error("Automatización no encontrada");
    if (flow.status === "paused") {
      return await logRun(supabase, flow, data.customer_id, "skipped", "Flujo pausado", null, [], Date.now() - start, data.triggered_by ?? "manual");
    }

    const { data: customer } = await supabase.from("customers").select("*").eq("id", data.customer_id).maybeSingle();
    if (!customer) throw new Error("Cliente no encontrado");

    const conditions = (flow.conditions ?? []) as any[];
    const evalResult = evaluateConditions(customer as unknown as CrmCustomer, conditions, {
      message_body: data.message_body,
    });
    if (!evalResult.pass) {
      const dur = Date.now() - start;
      await logRun(supabase, flow, data.customer_id, "skipped", evalResult.reason ?? "Condiciones no cumplidas", null, [], dur, data.triggered_by ?? "manual");
      await bumpCounters(supabase, flow, dur, false);
      return { ok: true, status: "skipped", reason: evalResult.reason };
    }

    const actions = (flow.actions ?? []) as FlowAction[];
    const results: { type: string; status: "ok" | "skipped" | "error"; note?: string }[] = [];
    let anyError: string | null = null;

    for (const a of actions) {
      const meta = ACTION_BY_TYPE[a.type];
      if (!meta) {
        results.push({ type: a.type, status: "skipped", note: "Acción desconocida" });
        continue;
      }
      if (meta.soon) {
        results.push({ type: a.type, status: "skipped", note: "Próximamente" });
        continue;
      }
      try {
        await executeAction(supabase, userId, customer.id, customer.company_id, a);
        results.push({ type: a.type, status: "ok" });
      } catch (e) {
        const msg = (e as Error).message;
        anyError = msg;
        results.push({ type: a.type, status: "error", note: msg });
      }
    }

    const dur = Date.now() - start;
    await logRun(
      supabase, flow, data.customer_id,
      anyError ? "error" : "success",
      null, anyError, results, dur, data.triggered_by ?? "manual",
    );
    await bumpCounters(supabase, flow, dur, !!anyError);
    return { ok: !anyError, status: anyError ? "error" : "success", results };
  });

// -------- Internal helpers --------
async function executeAction(
  supabase: any,
  userId: string,
  customerId: string,
  companyId: string,
  a: FlowAction,
) {
  const cfg = a.config ?? {};
  switch (a.type) {
    case "set_stage": {
      const stage = String(cfg.stage ?? "").trim();
      if (!stage) throw new Error("Falta 'stage'");
      const { error } = await supabase.from("customers").update({ stage }).eq("id", customerId);
      if (error) throw new Error(error.message);
      await supabase.from("customer_events").insert({
        customer_id: customerId, company_id: companyId, actor_id: userId,
        event_type: "automation_stage_change", payload: { stage },
      });
      return;
    }
    case "assign_owner": {
      const assignee_id = (cfg.assignee_id as string) || null;
      const { error } = await supabase.from("customers").update({ assignee_id }).eq("id", customerId);
      if (error) throw new Error(error.message);
      return;
    }
    case "add_tag":
    case "remove_tag": {
      const tag = String(cfg.tag ?? "").trim();
      if (!tag) throw new Error("Falta 'tag'");
      const { data: c } = await supabase.from("customers").select("tags").eq("id", customerId).maybeSingle();
      const cur: string[] = c?.tags ?? [];
      const next = a.type === "add_tag"
        ? Array.from(new Set([...cur, tag]))
        : cur.filter((t: string) => t !== tag);
      const { error } = await supabase.from("customers").update({ tags: next }).eq("id", customerId);
      if (error) throw new Error(error.message);
      return;
    }
    case "set_priority": {
      const priority = String(cfg.priority ?? "normal");
      const { error } = await supabase.from("customers").update({ priority }).eq("id", customerId);
      if (error) throw new Error(error.message);
      return;
    }
    case "create_note": {
      const body = String(cfg.body ?? "").trim();
      if (!body) throw new Error("Falta 'body'");
      const { error } = await supabase.from("customer_notes").insert({
        customer_id: customerId, company_id: companyId, author_id: userId, body,
      });
      if (error) throw new Error(error.message);
      return;
    }
    case "set_ai_paused": {
      const paused = String(cfg.paused) === "true";
      const { error } = await supabase.from("conversations").update({ ai_paused: paused }).eq("customer_id", customerId);
      if (error) throw new Error(error.message);
      return;
    }
    case "update_custom_field": {
      const field = String(cfg.field ?? "").trim();
      if (!field) throw new Error("Falta 'field'");
      const { data: c } = await supabase.from("customers").select("custom_fields").eq("id", customerId).maybeSingle();
      const next = { ...(c?.custom_fields ?? {}), [field]: cfg.value };
      const { error } = await supabase.from("customers").update({ custom_fields: next }).eq("id", customerId);
      if (error) throw new Error(error.message);
      return;
    }
    case "run_ai_orchestration": {
      const force = cfg.force === true || String(cfg.force) === "true";
      // Load helpers inside the handler — server-only modules.
      const [{ runSalesAnalysis }, { runGenerateRecommendations }] = await Promise.all([
        import("@/lib/ai-agents.server"),
        import("@/lib/recommender.server"),
      ]);
      const { data: convo } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      try {
        if (convo?.id) await runSalesAnalysis(supabase, userId, convo.id);
        await runGenerateRecommendations(supabase, userId, {
          customer_id: customerId,
          conversation_id: convo?.id ?? null,
        });
        await supabase.from("customer_events").insert({
          customer_id: customerId, company_id: companyId, actor_id: userId,
          event_type: "ai_orchestration",
          payload: { trigger: "automation", force, conversation_id: convo?.id ?? null } as any,
        });
      } catch (e: any) {
        // Non-fatal for the automation run; surface as event.
        await supabase.from("customer_events").insert({
          customer_id: customerId, company_id: companyId, actor_id: userId,
          event_type: "ai_orchestration_failed",
          payload: { trigger: "automation", error: e?.message ?? String(e) } as any,
        });
      }
      return;
    }
    case "create_quote": {
      const max_items = Number(cfg.max_items ?? 4) || 4;
      try {
        const { data: convo } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_id", customerId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const { generateQuoteDraft } = await import("@/lib/quotes.functions");
        await (generateQuoteDraft as any).handler({
          data: { customer_id: customerId, conversation_id: convo?.id ?? null, max_items },
          context: { supabase, userId },
        });
      } catch (e: any) {
        await supabase.from("customer_events").insert({
          customer_id: customerId, company_id: companyId, actor_id: userId,
          event_type: "quote_generation_failed",
          payload: { error: e?.message ?? String(e) } as any,
        });
      }
      return;
    }
    default:
      throw new Error(`Acción no ejecutable en runtime: ${a.type}`);
  }
}

async function logRun(
  supabase: any,
  flow: any,
  customerId: string | null,
  status: "success" | "skipped" | "error",
  skipReason: string | null,
  error: string | null,
  results: unknown[],
  duration: number,
  triggeredBy: string,
) {
  const startedAt = new Date(Date.now() - duration).toISOString();
  await supabase.from("automation_runs").insert({
    automation_id: flow.id,
    company_id: flow.company_id,
    customer_id: customerId,
    triggered_by: triggeredBy,
    status,
    skip_reason: skipReason,
    error,
    actions_result: results as any,
    duration_ms: duration,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}

async function bumpCounters(supabase: any, flow: any, duration: number, isError: boolean) {
  const prevAvg = flow.avg_duration_ms ?? duration;
  const prevRuns = flow.run_count ?? 0;
  const nextAvg = Math.round((prevAvg * prevRuns + duration) / (prevRuns + 1));
  await supabase.from("automations").update({
    run_count: prevRuns + 1,
    error_count: (flow.error_count ?? 0) + (isError ? 1 : 0),
    last_run_at: new Date().toISOString(),
    last_error: isError ? "última ejecución con errores" : flow.last_error,
    avg_duration_ms: nextAvg,
  }).eq("id", flow.id);
}
