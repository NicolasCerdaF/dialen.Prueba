// AI Orchestrator — event-driven AI CRM engine.
//
// The rest of the system does NOT call analyzeConversation / generateRecommendations
// directly anymore. It emits *intents* here ("a message arrived", "stage changed",
// "customer updated") and this orchestrator decides — using debounce + snapshot
// diffing — whether the customer's commercial context actually changed enough to
// justify re-running the AI chain.
//
// When it decides to run:
//   1. runSalesAnalysis (Sales + Analysis agents)  -> ai_suggestions + ai_insights
//   2. runGenerateRecommendations                  -> product_recommendations
//   3. customer_events "ai_orchestration" audit    -> CRM timeline
//
// When it decides NOT to run (unchanged snapshot / debounced), it logs the skip
// reason on the insight signals so the timeline shows why nothing happened.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withCredits } from "@/lib/plan-middleware";

export type OrchestrationTrigger =
  | "message_received"
  | "stage_changed"
  | "customer_updated"
  | "conversation_reopened"
  | "automation"
  | "manual";

const OrchestrateInput = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  trigger: z
    .enum([
      "message_received",
      "stage_changed",
      "customer_updated",
      "conversation_reopened",
      "automation",
      "manual",
    ])
    .default("manual"),
  force: z.boolean().optional().default(false),
});

// Minimum time between full AI runs for the same customer (unless force=true or
// a strong trigger like stage_changed). Cheap protection against runaway loops.
const DEBOUNCE_MS = 45_000;
// If the snapshot is unchanged, allow re-run only after this window.
const UNCHANGED_TTL_MS = 15 * 60_000;

function makeSignature(input: {
  stage: string | null;
  priority: string | null;
  tags: string[] | null;
  assignee_id: string | null;
  last_inbound_id: string | null;
  last_inbound_body: string | null;
}): string {
  const tags = [...(input.tags ?? [])].sort().join(",");
  const body = (input.last_inbound_body ?? "").slice(0, 160).replace(/\s+/g, " ").trim();
  return [
    input.stage ?? "-",
    input.priority ?? "-",
    tags,
    input.assignee_id ?? "-",
    input.last_inbound_id ?? "-",
    body,
  ].join("|");
}

export const orchestrateCustomer = createServerFn({ method: "POST" })
  .middleware(withCredits(1))
  .inputValidator((d) => OrchestrateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const strongTrigger =
      data.trigger === "stage_changed" || data.trigger === "conversation_reopened";

    // 1. Load current commercial context.
    const [{ data: customer }, { data: insight }, { data: convo }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, company_id, stage, priority, tags, assignee_id")
        .eq("id", data.customer_id)
        .maybeSingle(),
      supabase
        .from("ai_insights")
        .select("company_id, signals, last_analysis_at")
        .eq("customer_id", data.customer_id)
        .maybeSingle(),
      data.conversation_id
        ? supabase
            .from("conversations")
            .select("id, customer_id, company_id")
            .eq("id", data.conversation_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    if (!customer) {
      return { ran: false, reason: "customer_not_found" as const };
    }

    // Prefer the conversation attached to the event; otherwise pick the most
    // recently active conversation for this customer.
    let conversationId: string | null = convo?.id ?? null;
    if (!conversationId) {
      const { data: latestConvo } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", data.customer_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      conversationId = latestConvo?.id ?? null;
    }

    // 2. Snapshot: newest inbound message + customer commercial fields.
    let lastInbound: { id: string; body: string | null } | null = null;
    if (conversationId) {
      const { data: msg } = await supabase
        .from("messages")
        .select("id, body")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastInbound = msg ?? null;
    }

    const signature = makeSignature({
      stage: customer.stage ?? null,
      priority: customer.priority ?? null,
      tags: (customer.tags as string[] | null) ?? null,
      assignee_id: customer.assignee_id ?? null,
      last_inbound_id: lastInbound?.id ?? null,
      last_inbound_body: lastInbound?.body ?? null,
    });

    const prevSignals = (insight?.signals ?? {}) as Record<string, any>;
    const prevSignature: string | undefined = prevSignals.orchestrator_signature;
    const lastRunAt = insight?.last_analysis_at
      ? new Date(insight.last_analysis_at).getTime()
      : 0;
    const now = Date.now();

    // 3. Decide.
    let skipReason: string | null = null;
    if (!data.force && !strongTrigger) {
      if (lastRunAt && now - lastRunAt < DEBOUNCE_MS) {
        skipReason = "debounced";
      } else if (
        prevSignature &&
        prevSignature === signature &&
        lastRunAt &&
        now - lastRunAt < UNCHANGED_TTL_MS
      ) {
        skipReason = "unchanged_context";
      }
    }

    // Nothing to analyze if we have no conversation with messages yet.
    if (!conversationId) skipReason = skipReason ?? "no_conversation";

    if (skipReason) {
      // Persist the current signature so a later different context can be diffed
      // even if we didn't run. Also log a lightweight skip event so the timeline
      // reflects that the orchestrator saw the event.
      if (insight) {
        await supabase
          .from("ai_insights")
          .update({
            signals: {
              ...prevSignals,
              orchestrator_signature: signature,
              orchestrator_last_trigger: data.trigger,
              orchestrator_last_skip: skipReason,
              orchestrator_last_seen_at: new Date().toISOString(),
            } as any,
          })
          .eq("customer_id", data.customer_id);
      }
      return {
        ran: false,
        reason: skipReason,
        trigger: data.trigger,
        signature,
      };
    }

    // 4. Run the AI chain (server-only helpers, no RPC round-trip).
    let analysis: any = null;
    let recs: any = null;
    let error: string | null = null;
    try {
      if (conversationId) {
        const { runSalesAnalysis } = await import("@/lib/ai-agents.server");
        analysis = await runSalesAnalysis(supabase, userId, conversationId);
      }
      const { runGenerateRecommendations } = await import("@/lib/recommender.server");
      recs = await runGenerateRecommendations(supabase, userId, {
        customer_id: data.customer_id,
        conversation_id: conversationId,
      });
    } catch (e: any) {
      error = e?.message ?? "orchestration_failed";
    }

    // 4b. Auto-draft: high-intent + recommendations + no recent quote → build
    // a WhatsApp-ready draft. The vendor closes with 1 click from the inbox.
    let autoDraftId: string | null = null;
    try {
      const prob = Number(analysis?.probability ?? 0);
      const recCount = Number(recs?.recommendations?.length ?? 0);
      if (
        !error &&
        data.trigger === "message_received" &&
        prob >= 0.7 &&
        recCount > 0 &&
        conversationId
      ) {
        // Uniqueness rule: 1 active quote per conversation.
        // If a draft/sent/viewed quote already exists on this conversation,
        // never create a second one — the operator edits the existing one.
        const { data: activeQuote } = await supabase
          .from("quotes")
          .select("id, status")
          .eq("conversation_id", conversationId)
          .in("status", ["draft", "sent", "viewed"])
          .limit(1)
          .maybeSingle();
        if (!activeQuote) {
          const { generateQuoteDraft } = await import("@/lib/quotes.functions");
          const res: any = await (generateQuoteDraft as any).handler({
            data: {
              customer_id: data.customer_id,
              conversation_id: conversationId,
              max_items: 3,
            },
            context: { supabase, userId },
          });
          autoDraftId = res?.id ?? null;
          if (autoDraftId) {
            await supabase
              .from("quotes")
              .update({
                ai_context: {
                  source: "ai_auto",
                  probability: prob,
                  trigger: data.trigger,
                },
              })
              .eq("id", autoDraftId);
            await supabase.from("customer_events").insert({
              customer_id: data.customer_id,
              company_id: customer.company_id,
              actor_id: userId,
              event_type: "quote_auto_drafted",
              payload: {
                quote_id: autoDraftId,
                probability: prob,
                conversation_id: conversationId,
              } as any,
            });
          }
        } else {
          autoDraftId = activeQuote.id;
        }
      }
    } catch {
      /* non-critical — never block orchestration on auto-draft */
    }


    // 5. Stamp the signature on the (now-updated) insight so future events can
    // debounce against it, and log a single orchestration audit event.
    await supabase
      .from("ai_insights")
      .update({
        signals: {
          ...(analysis
            ? {
                urgency: analysis.urgency,
                objections: analysis.objections,
                suggested_stage: analysis.suggested_stage,
                summary: analysis.summary,
              }
            : prevSignals),
          orchestrator_signature: signature,
          orchestrator_last_trigger: data.trigger,
          orchestrator_last_ran_at: new Date().toISOString(),
          orchestrator_last_skip: null,
        } as any,
      })
      .eq("customer_id", data.customer_id);

    await supabase.from("customer_events").insert({
      customer_id: data.customer_id,
      company_id: customer.company_id,
      actor_id: userId,
      event_type: error ? "ai_orchestration_failed" : "ai_orchestration",
      payload: {
        trigger: data.trigger,
        conversation_id: conversationId,
        analysis: analysis
          ? {
              intent: analysis.intent,
              probability: analysis.probability,
              churn_risk: analysis.churn_risk,
            }
          : null,
        recommendations_generated: recs?.recommendations?.length ?? 0,
        error,
      } as any,
    });

    return {
      ran: !error,
      trigger: data.trigger,
      signature,
      analysis: analysis
        ? {
            intent: analysis.intent,
            probability: analysis.probability,
            churn_risk: analysis.churn_risk,
            summary: analysis.summary,
          }
        : null,
      recommendations: recs?.recommendations?.length ?? 0,
      auto_draft_id: autoDraftId,
      error,
    };
  });
