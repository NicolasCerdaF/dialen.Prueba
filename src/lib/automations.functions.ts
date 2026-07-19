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
        // Uniqueness rule: 1 active quote per conversation. Skip silently
        // if one already exists — never create duplicates from automations.
        if (convo?.id) {
          const { data: active } = await supabase
            .from("quotes")
            .select("id")
            .eq("conversation_id", convo.id)
            .in("status", ["draft", "sent", "viewed"])
            .limit(1)
            .maybeSingle();
          if (active) return;
        }
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

// ============================================================
// Production additions: advanced list, bulk ops, global runs,
// aggregates, version history, dispatcher, AI recipe scoring.
// ============================================================

// -------- Advanced list (search, filter, sort, page) --------
export const listAutomationsAdvanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    search?: string | null;
    status?: "all" | "draft" | "active" | "paused" | "error";
    triggerCategory?: string | null;
    sort?: "recent" | "name" | "runs" | "errors" | "last_run";
    page?: number;
    pageSize?: number;
  }) =>
    z.object({
      search: z.string().max(160).nullable().optional(),
      status: z.enum(["all", "draft", "active", "paused", "error"]).default("all"),
      triggerCategory: z.string().max(60).nullable().optional(),
      sort: z.enum(["recent", "name", "runs", "errors", "last_run"]).default("recent"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(5).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("automations").select("*", { count: "exact" });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.trim();
      if (s) q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    switch (data.sort) {
      case "name": q = q.order("name", { ascending: true }); break;
      case "runs": q = q.order("run_count", { ascending: false, nullsFirst: false }); break;
      case "errors": q = q.order("error_count", { ascending: false, nullsFirst: false }); break;
      case "last_run": q = q.order("last_run_at", { ascending: false, nullsFirst: false }); break;
      default: q = q.order("updated_at", { ascending: false });
    }
    const from = (data.page - 1) * data.pageSize;
    q = q.range(from, from + data.pageSize - 1);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    let filtered = (rows ?? []) as unknown as Automation[];
    if (data.triggerCategory && data.triggerCategory !== "all") {
      const cat = data.triggerCategory;
      // registry lookup is cheap
      const { TRIGGER_BY_TYPE } = await import("@/lib/automations/registry");
      filtered = filtered.filter((a: any) => TRIGGER_BY_TYPE[a.trigger?.type ?? ""]?.category === cat);
    }
    return { rows: filtered, total: count ?? filtered.length };
  });

// -------- Bulk operations --------
export const bulkAutomationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    ids: string[];
    action: "activate" | "pause" | "delete" | "duplicate";
  }) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    action: z.enum(["activate", "pause", "delete", "duplicate"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.action === "delete") {
      const { error } = await supabase.from("automations").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
      return { ok: true, count: data.ids.length };
    }
    if (data.action === "duplicate") {
      const { data: src } = await supabase.from("automations").select("*").in("id", data.ids);
      if (!src) return { ok: true, count: 0 };
      let count = 0;
      for (const s of src as any[]) {
        const { error } = await supabase.from("automations").insert({
          company_id: s.company_id,
          name: `${s.name} (copia)`,
          description: s.description,
          status: "draft",
          trigger: s.trigger,
          conditions: s.conditions,
          actions: s.actions,
          version: 1,
          created_by: userId,
        });
        if (!error) count += 1;
      }
      return { ok: true, count };
    }
    const status = data.action === "activate" ? "active" : "paused";
    const { error } = await supabase.from("automations").update({ status }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

// -------- Export bundle --------
export const exportAutomationsBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids?: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("automations").select("name, description, trigger, conditions, actions, version, status");
    if (data.ids && data.ids.length > 0) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      exported_at: new Date().toISOString(),
      count: rows?.length ?? 0,
      automations: rows ?? [],
    };
  });

// -------- Aggregates (dashboard KPIs) --------
export type AutomationsAggregate = {
  total: number;
  active: number;
  paused: number;
  draft: number;
  errored: number;
  totalRuns: number;
  totalErrors: number;
  runsLast7d: number;
  errorsLast7d: number;
  avgDurationMs: number;
  topByRuns: { id: string; name: string; run_count: number }[];
  topByErrors: { id: string; name: string; error_count: number; error_rate: number }[];
  recentActivity: { day: string; total: number; errors: number }[];
};

export const getAutomationsAggregate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutomationsAggregate> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) {
      return {
        total: 0, active: 0, paused: 0, draft: 0, errored: 0,
        totalRuns: 0, totalErrors: 0, runsLast7d: 0, errorsLast7d: 0, avgDurationMs: 0,
        topByRuns: [], topByErrors: [], recentActivity: [],
      };
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [autoRes, runsRes] = await Promise.all([
      supabase.from("automations")
        .select("id, name, status, run_count, error_count, avg_duration_ms")
        .eq("company_id", profile.company_id),
      supabase.from("automation_runs")
        .select("status, started_at, duration_ms")
        .eq("company_id", profile.company_id)
        .gte("started_at", since)
        .limit(5000),
    ]);
    const automations = (autoRes.data ?? []) as any[];
    const runs = (runsRes.data ?? []) as any[];
    const total = automations.length;
    const active = automations.filter((a) => a.status === "active").length;
    const paused = automations.filter((a) => a.status === "paused").length;
    const draft = automations.filter((a) => a.status === "draft").length;
    const errored = automations.filter((a) => a.status === "error").length;
    const totalRuns = automations.reduce((s, a) => s + (a.run_count ?? 0), 0);
    const totalErrors = automations.reduce((s, a) => s + (a.error_count ?? 0), 0);
    const runsLast7d = runs.length;
    const errorsLast7d = runs.filter((r) => r.status === "error").length;
    const durs = runs.map((r) => r.duration_ms ?? 0).filter((n) => n > 0);
    const avgDurationMs = durs.length ? Math.round(durs.reduce((s, n) => s + n, 0) / durs.length) : 0;
    const topByRuns = [...automations]
      .sort((a, b) => (b.run_count ?? 0) - (a.run_count ?? 0))
      .slice(0, 5)
      .map((a) => ({ id: a.id, name: a.name, run_count: a.run_count ?? 0 }));
    const topByErrors = [...automations]
      .filter((a) => (a.error_count ?? 0) > 0)
      .map((a) => ({
        id: a.id, name: a.name, error_count: a.error_count ?? 0,
        error_rate: a.run_count ? (a.error_count / a.run_count) * 100 : 0,
      }))
      .sort((a, b) => b.error_rate - a.error_rate)
      .slice(0, 5);
    const days: Record<string, { total: number; errors: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days[key] = { total: 0, errors: 0 };
    }
    for (const r of runs) {
      const key = String(r.started_at).slice(0, 10);
      if (days[key]) {
        days[key].total += 1;
        if (r.status === "error") days[key].errors += 1;
      }
    }
    const recentActivity = Object.entries(days).map(([day, v]) => ({ day, ...v }));
    return {
      total, active, paused, draft, errored,
      totalRuns, totalErrors, runsLast7d, errorsLast7d, avgDurationMs,
      topByRuns, topByErrors, recentActivity,
    };
  });

// -------- Global runs feed --------
export type GlobalRun = AutomationRun & {
  automation_name: string;
  customer_name: string | null;
  customer_phone: string | null;
};

export const listAllRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    status?: "all" | "success" | "skipped" | "error";
    automation_id?: string | null;
    search?: string | null;
    limit?: number;
  }) => z.object({
    status: z.enum(["all", "success", "skipped", "error"]).default("all"),
    automation_id: z.string().uuid().nullable().optional(),
    search: z.string().max(160).nullable().optional(),
    limit: z.number().int().min(10).max(500).default(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { rows: [] as GlobalRun[] };
    let q = supabase.from("automation_runs")
      .select("*, automations!inner(name, company_id), customers(name, phone)")
      .eq("company_id", profile.company_id)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.automation_id) q = q.eq("automation_id", data.automation_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let mapped: GlobalRun[] = (rows ?? []).map((r: any) => ({
      ...r,
      automation_name: r.automations?.name ?? "—",
      customer_name: r.customers?.name ?? null,
      customer_phone: r.customers?.phone ?? null,
    }));
    if (data.search) {
      const s = data.search.trim().toLowerCase();
      mapped = mapped.filter((r) =>
        (r.automation_name ?? "").toLowerCase().includes(s) ||
        (r.customer_name ?? "").toLowerCase().includes(s) ||
        (r.error ?? "").toLowerCase().includes(s) ||
        (r.skip_reason ?? "").toLowerCase().includes(s),
      );
    }
    return { rows: mapped };
  });

// -------- Version history --------
export type AutomationVersion = {
  id: string;
  automation_id: string;
  version: number;
  snapshot: any;
  created_by: string | null;
  created_at: string;
};

export const listAutomationVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { automation_id: string }) =>
    z.object({ automation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("automation_versions")
      .select("*")
      .eq("automation_id", data.automation_id)
      .order("version", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AutomationVersion[];
  });

export const restoreAutomationVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { automation_id: string; version: number }) =>
    z.object({ automation_id: z.string().uuid(), version: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ver } = await supabase.from("automation_versions").select("*")
      .eq("automation_id", data.automation_id).eq("version", data.version).maybeSingle();
    if (!ver) throw new Error("Versión no encontrada");
    const snap = (ver as any).snapshot ?? {};
    const { data: current } = await supabase.from("automations").select("version, company_id")
      .eq("id", data.automation_id).maybeSingle();
    if (!current) throw new Error("Automatización no encontrada");
    const nextVersion = ((current as any).version ?? 1) + 1;
    const { error } = await supabase.from("automations").update({
      name: snap.name ?? undefined,
      description: snap.description ?? null,
      trigger: snap.trigger ?? { type: "manual" },
      conditions: snap.conditions ?? [],
      actions: snap.actions ?? [],
      version: nextVersion,
      updated_at: new Date().toISOString(),
    } as any).eq("id", data.automation_id);
    if (error) throw new Error(error.message);
    await supabase.from("automation_versions").insert({
      automation_id: data.automation_id,
      company_id: (current as any).company_id,
      version: nextVersion,
      snapshot: {
        name: snap.name, description: snap.description,
        trigger: snap.trigger, conditions: snap.conditions, actions: snap.actions,
        restored_from: data.version,
      } as any,
      created_by: userId,
    });
    return { ok: true, version: nextVersion };
  });

// -------- Test run picker --------
export const pickTestCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return [];
    const { data } = await supabase.from("customers")
      .select("id, name, phone, stage, last_interaction_at")
      .eq("company_id", profile.company_id)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(20);
    return (data ?? []) as { id: string; name: string | null; phone: string | null; stage: string | null; last_interaction_at: string | null }[];
  });

// -------- Dispatch event: run every active automation whose trigger matches --------
// Other modules call this to fire real automations. It filters by trigger type
// and evaluates simple trigger-config guards (to_stage, min_score, field, etc.).
export const dispatchAutomationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    trigger_type: string;
    customer_id: string;
    conversation_id?: string | null;
    payload?: Record<string, any>;
  }) => z.object({
    trigger_type: z.string().min(1).max(80),
    customer_id: z.string().uuid(),
    conversation_id: z.string().uuid().nullable().optional(),
    payload: z.record(z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { ok: true, matched: 0, ran: 0 };
    const { data: flows } = await supabase.from("automations")
      .select("id, trigger")
      .eq("company_id", profile.company_id)
      .eq("status", "active");
    const matched = (flows ?? []).filter((f: any) => {
      if (f.trigger?.type !== data.trigger_type) return false;
      const cfg = f.trigger?.config ?? {};
      const pl = data.payload ?? {};
      // Lightweight guards for trigger config
      if (cfg.to_stage && pl.to_stage && String(cfg.to_stage) !== String(pl.to_stage)) return false;
      if (cfg.field && pl.field && String(cfg.field) !== String(pl.field)) return false;
      if (cfg.product_id && pl.product_id && String(cfg.product_id) !== String(pl.product_id)) return false;
      if (cfg.reason_code && pl.reason_code && String(cfg.reason_code) !== String(pl.reason_code)) return false;
      if (cfg.min_score != null && pl.score != null && Number(pl.score) < Number(cfg.min_score)) return false;
      if (cfg.threshold != null && pl.value != null && Number(pl.value) < Number(cfg.threshold)) return false;
      return true;
    });
    let ran = 0;
    for (const f of matched) {
      try {
        await (runAutomationForCustomer as any).handler?.({
          data: {
            automation_id: (f as any).id,
            customer_id: data.customer_id,
            message_body: typeof data.payload?.message_body === "string" ? data.payload.message_body : undefined,
            triggered_by: `event:${data.trigger_type}`,
          },
          context,
        });
        ran += 1;
      } catch {
        // Errors are already persisted per-run inside the executor.
      }
    }
    return { ok: true, matched: matched.length, ran };
  });

// -------- Recipe suggestions based on company data --------
export const getRecipeSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { suggestions: [] as { recipe_id: string; reason: string; score: number }[] };
    const cid = profile.company_id;
    const [{ count: openConv }, { count: coldCount }, { count: quotesUnopened }, { count: hotLeads }] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "open"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", cid)
        .lte("last_interaction_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString()),
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("status", "sent").is("viewed_at", null),
      supabase.from("ai_insights").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("kind", "sales_analysis").gte("score", 0.7),
    ]);
    const suggestions: { recipe_id: string; reason: string; score: number }[] = [];
    if ((openConv ?? 0) > 3) suggestions.push({ recipe_id: "followup-no-response", reason: `Tienes ${openConv} conversaciones abiertas: activa recordatorios sin respuesta.`, score: 0.9 });
    if ((hotLeads ?? 0) > 0) suggestions.push({ recipe_id: "hot-lead", reason: `${hotLeads} clientes con alta intención detectada por IA.`, score: 0.95 });
    if ((coldCount ?? 0) > 0) suggestions.push({ recipe_id: "cold-reengage", reason: `${coldCount} clientes sin interacción hace más de 14 días.`, score: 0.75 });
    if ((quotesUnopened ?? 0) > 0) suggestions.push({ recipe_id: "quote-unopened", reason: `${quotesUnopened} cotizaciones enviadas sin abrir.`, score: 0.85 });
    return { suggestions: suggestions.sort((a, b) => b.score - a.score) };
  });
