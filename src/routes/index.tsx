import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  Send,
  Loader2,
  ArrowRight,
  Pause,
  Play,
  Wand2,
  Search,
  UserPlus,
  UserCheck,
  CheckCircle2,
  Circle,
  Sparkles,
  RefreshCw,
  Radio,
  StickyNote,
  Tag,
  Phone,
  Building2,
  Calendar,
  ShoppingBag,
  FileText,
  ClipboardList,
  Users as UsersIcon,
  Lock,
  X,
  Plus,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsAppMessage, toggleConversationAiPause } from "@/lib/whatsapp.functions";
import {
  assignConversation,
  takeConversation,
  setConversationStatus,
  addConversationNote,
  updateCustomer,
  markConversationRead,
} from "@/lib/inbox.functions";
import { useAuth } from "@/lib/auth-context";
import { analyzeConversation, setSuggestionStatus } from "@/lib/ai-agents.functions";
import { orchestrateCustomer } from "@/lib/ai-orchestrator.functions";
import {
  generateRecommendations,
  listRecommendations,
  setRecommendationStatus,
  REASON_CODES,
  type ReasonCode,
} from "@/lib/recommender.functions";
import { linkProductToCustomer } from "@/lib/catalog.functions";
import {
  sendQuoteFromConversation,
  draftQuoteFromMessage,
} from "@/lib/quotes.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Bandeja Unificada — Dialen" }] }),
  component: InboxPage,
});

type Conversation = {
  id: string;
  customer_id: string;
  last_message_at: string | null;
  unread_count: number;
  status: "open" | "pending" | "resolved" | "closed";
  is_demo: boolean;
  ai_paused: boolean;
  assignee_id: string | null;
  customers: { name: string | null; phone: string; tags: string[] | null; stage: string | null } | null;
};

type FilterKey = "all" | "mine" | "unassigned" | "unread" | "resolved";

function InboxPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [rtOk, setRtOk] = useState(false);

  const { data: channel } = useQuery({
    queryKey: ["wa-channel-status"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_channels").select("status").maybeSingle();
      return data;
    },
  });

  const { data: convos = [], refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, customer_id, last_message_at, unread_count, status, is_demo, ai_paused, assignee_id, customers(name, phone, tags, stage)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const orchestrateFn = useServerFn(orchestrateCustomer);
  // Per-conversation debounce so a burst of inbound messages fires one AI run.
  const orchestrateTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const ch = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => qc.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          const row = payload.new as any;
          const convId = row?.conversation_id;
          if (convId) qc.invalidateQueries({ queryKey: ["messages", convId] });
          // Event-driven AI: only trigger on inbound (customer) messages.
          if (row?.direction === "inbound" && convId) {
            const key = String(convId);
            const prev = orchestrateTimers.current[key];
            if (prev) clearTimeout(prev);
            orchestrateTimers.current[key] = setTimeout(() => {
              (async () => {
                const { data: c } = await supabase
                  .from("conversations")
                  .select("customer_id")
                  .eq("id", convId)
                  .maybeSingle();
                if (c?.customer_id) {
                  try {
                    await orchestrateFn({
                      data: {
                        customer_id: c.customer_id,
                        conversation_id: convId,
                        trigger: "message_received",
                      },
                    });
                  } catch {
                    /* silent — this is background intelligence */
                  }
                }
              })();
            }, 5000); // 5s debounce: absorb typing bursts
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => qc.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .subscribe((status) => setRtOk(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
      for (const t of Object.values(orchestrateTimers.current)) clearTimeout(t);
      orchestrateTimers.current = {};
    };
  }, [qc, orchestrateFn]);

  const counts = useMemo(() => {
    const c = { all: 0, mine: 0, unassigned: 0, unread: 0, resolved: 0 };
    for (const x of convos) {
      if (x.status === "resolved" || x.status === "closed") {
        c.resolved++;
        continue;
      }
      c.all++;
      if (x.assignee_id === user?.id) c.mine++;
      if (!x.assignee_id) c.unassigned++;
      if (x.unread_count > 0) c.unread++;
    }
    return c;
  }, [convos, user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return convos.filter((c) => {
      if (filter === "resolved") {
        if (c.status !== "resolved" && c.status !== "closed") return false;
      } else {
        if (c.status === "resolved" || c.status === "closed") return false;
        if (filter === "mine" && c.assignee_id !== user?.id) return false;
        if (filter === "unassigned" && c.assignee_id) return false;
        if (filter === "unread" && c.unread_count <= 0) return false;
      }
      if (!q) return true;
      const name = c.customers?.name?.toLowerCase() ?? "";
      const phone = c.customers?.phone?.toLowerCase() ?? "";
      return name.includes(q) || phone.includes(q);
    });
  }, [convos, filter, search, user?.id]);

  useEffect(() => {
    if (!activeId && filtered[0]) setActiveId(filtered[0].id);
    if (activeId && !filtered.some((c) => c.id === activeId) && filtered[0]) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  if (convos.length === 0) {
    const notConnected = !channel || channel.status !== "connected";
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center p-10">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {notConnected ? "Aún no has conectado WhatsApp" : "Aún no hay conversaciones"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {notConnected
                ? "Mientras tanto, prueba tu IA en Modo demo y, cuando estés listo, conecta tu número."
                : "Los mensajes entrantes aparecerán aquí en tiempo real."}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                to="/demo-chat"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Wand2 className="h-4 w-4" /> Probar en Modo demo
              </Link>
              {notConnected && (
                <Link
                  to="/onboarding/whatsapp"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-6 text-sm font-semibold hover:bg-secondary"
                >
                  Conectar WhatsApp <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-full">
        {/* LEFT: filters + list */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bandeja Unificada
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                  rtOk
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
                title={rtOk ? "Conectado en tiempo real" : "Reconectando…"}
              >
                <Radio className="h-2.5 w-2.5" />
                {rtOk ? "Live" : "…"}
              </span>
              <button
                onClick={() => refetch()}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Refrescar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre o teléfono…"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {(
              [
                ["all", "Todas", counts.all],
                ["mine", "Míos", counts.mine],
                ["unassigned", "Sin asignar", counts.unassigned],
                ["unread", "Sin leer", counts.unread],
                ["resolved", "Resueltos", counts.resolved],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                onClick={() => setFilter(k as FilterKey)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition",
                  filter === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>

          <ul className="flex-1 overflow-y-auto">
            {filtered.map((c) => {
              const mine = c.assignee_id === user?.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "block w-full border-l-2 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                      activeId === c.id
                        ? "border-primary bg-secondary/40"
                        : "border-transparent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">
                        {c.customers?.name ?? c.customers?.phone ?? "Sin nombre"}
                      </div>
                      <div className="flex items-center gap-1">
                        {c.unread_count > 0 && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                        {c.last_message_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.last_message_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="truncate text-xs text-muted-foreground">
                        {c.customers?.phone}
                      </span>
                      {c.is_demo && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          Demo
                        </span>
                      )}
                      {c.ai_paused && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          IA off
                        </span>
                      )}
                      {!c.assignee_id ? (
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                          Sin asignar
                        </span>
                      ) : mine ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          Míos
                        </span>
                      ) : null}
                      {c.customers?.tags?.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                Sin conversaciones en este filtro.
              </li>
            )}
          </ul>
        </div>

        {/* CENTER: chat */}
        <div className="flex-1 overflow-hidden">
          {activeId ? <ChatView conversationId={activeId} /> : null}
        </div>

        {/* RIGHT: context */}
        {activeId && (
          <div className="hidden w-[340px] shrink-0 flex-col border-l border-border xl:flex">
            <ContextSidebar conversationId={activeId} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

type Message = {
  id: string;
  body: string | null;
  direction: "inbound" | "outbound";
  created_at: string;
  status: string;
  sender_id: string | null;
};

function ChatView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const sendFn = useServerFn(sendWhatsAppMessage);
  const pauseFn = useServerFn(toggleConversationAiPause);
  const takeFn = useServerFn(takeConversation);
  const assignFn = useServerFn(assignConversation);
  const statusFn = useServerFn(setConversationStatus);
  const markReadFn = useServerFn(markConversationRead);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, direction, created_at, status, sender_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const { data: convo } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, is_demo, ai_paused, assignee_id, status, customer_id, customers(name, phone)")
        .eq("id", conversationId)
        .maybeSingle();
      return data;
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return (data as { id: string; full_name: string | null; email: string | null }[]) ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Auto mark-read when opening
  useEffect(() => {
    markReadFn({ data: { conversation_id: conversationId } }).catch(() => {});
  }, [conversationId, markReadFn]);

  const header = useMemo(
    () => ({
      name:
        (convo as any)?.customers?.name ??
        (convo as any)?.customers?.phone ??
        "Conversación",
      phone: (convo as any)?.customers?.phone ?? "",
      isDemo: Boolean((convo as any)?.is_demo),
      aiPaused: Boolean((convo as any)?.ai_paused),
      assigneeId: (convo as any)?.assignee_id as string | null,
      status: ((convo as any)?.status as string) ?? "open",
    }),
    [convo],
  );

  const assignee = teamMembers.find((m) => m.id === header.assigneeId);

  async function send() {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      await sendFn({ data: { conversation_id: conversationId, text: value } });
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }

  async function togglePause() {
    setTogglingPause(true);
    try {
      const res = await pauseFn({
        data: { conversation_id: conversationId, paused: !header.aiPaused },
      });
      toast.success(res.paused ? "IA pausada — respondes tú" : "IA reactivada");
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setTogglingPause(false);
    }
  }

  async function handleTake() {
    try {
      await takeFn({ data: { conversation_id: conversationId } });
      toast.success("Conversación asignada a ti");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function handleAssign(assigneeId: string | null) {
    try {
      await assignFn({ data: { conversation_id: conversationId, assignee_id: assigneeId } });
      toast.success(assigneeId ? "Reasignado" : "Sin responsable");
      setShowAssign(false);
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function handleResolve() {
    try {
      const newStatus = header.status === "resolved" ? "open" : "resolved";
      await statusFn({ data: { conversation_id: conversationId, status: newStatus as any } });
      toast.success(newStatus === "resolved" ? "Conversación resuelta" : "Reabierta");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
          {(header.name[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {header.name}
            {header.isDemo && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                Demo
              </span>
            )}
            {header.status === "resolved" && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Resuelto
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{header.phone}</div>
        </div>

        {/* Assignment control */}
        <div className="relative">
          {header.assigneeId ? (
            <button
              onClick={() => setShowAssign((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
              title="Reasignar"
            >
              <UserCheck className="h-3 w-3" />
              {assignee?.full_name ?? assignee?.email ?? "Asignado"}
            </button>
          ) : (
            <button
              onClick={handleTake}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
              title="Tomar conversación"
            >
              <UserPlus className="h-3 w-3" />
              Tomar
            </button>
          )}
          {showAssign && (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Asignar a
              </div>
              {teamMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleAssign(m.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
                    m.id === header.assigneeId && "bg-secondary",
                  )}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-primary text-[9px] font-bold text-primary-foreground">
                    {(m.full_name ?? m.email ?? "?")[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">
                    {m.full_name ?? m.email}
                    {m.id === user?.id && " (tú)"}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => handleAssign(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3 w-3" /> Quitar responsable
              </button>
            </div>
          )}
        </div>

        <button
          onClick={togglePause}
          disabled={togglingPause}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
            header.aiPaused
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border text-muted-foreground hover:bg-secondary",
          )}
          title={header.aiPaused ? "La IA está pausada en este chat" : "Pausar la IA en este chat"}
        >
          {togglingPause ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : header.aiPaused ? (
            <Play className="h-3 w-3" />
          ) : (
            <Pause className="h-3 w-3" />
          )}
          {header.aiPaused ? "Reactivar IA" : "Pausar IA"}
        </button>

        <button
          onClick={handleResolve}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
            header.status === "resolved"
              ? "border-border text-muted-foreground hover:bg-secondary"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20",
          )}
          title={header.status === "resolved" ? "Reabrir" : "Marcar como resuelto"}
        >
          {header.status === "resolved" ? (
            <>
              <Circle className="h-3 w-3" /> Reabrir
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3" /> Resolver
            </>
          )}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.map((m) => {
          const fromAi = m.direction === "outbound" && !m.sender_id;
          return (
            <div
              key={m.id}
              className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm",
                  m.direction === "outbound"
                    ? fromAi
                      ? "bg-primary/85 text-primary-foreground ring-1 ring-primary/40"
                      : "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground",
                )}
              >
                {fromAi && (
                  <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase opacity-80">
                    <Sparkles className="h-2.5 w-2.5" /> IA
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t border-border px-4 py-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={header.aiPaused ? "Escribe (IA pausada)…" : "Escribe un mensaje…"}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

// ================= Context Sidebar =================
function ContextSidebar({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const noteFn = useServerFn(addConversationNote);
  const updCustomer = useServerFn(updateCustomer);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");

  const { data: convo } = useQuery({
    queryKey: ["conversation-ctx", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select(
          "id, customer_id, created_at, customers(id, name, phone, tags, stage, notes, created_at)",
        )
        .eq("id", conversationId)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["conversation-notes", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_notes")
        .select("id, body, created_at, author_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as any[]) ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["conversation-events", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_events")
        .select("id, event_type, payload, created_at, actor_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as any[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`conv-ctx-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_notes", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_events", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation-events", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  const customer = convo?.customers;
  const isNewLead =
    customer?.created_at && Date.now() - new Date(customer.created_at).getTime() < 1000 * 60 * 60 * 24 * 3;

  async function submitNote() {
    const v = newNote.trim();
    if (!v) return;
    try {
      await noteFn({ data: { conversation_id: conversationId, body: v } });
      setNewNote("");
      qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function addTag() {
    const v = newTag.trim();
    if (!v || !customer) return;
    const next = Array.from(new Set([...(customer.tags ?? []), v]));
    try {
      await updCustomer({ data: { customer_id: customer.id, tags: next } });
      setNewTag("");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function removeTag(t: string) {
    if (!customer) return;
    const next = (customer.tags ?? []).filter((x: string) => x !== t);
    try {
      await updCustomer({ data: { customer_id: customer.id, tags: next } });
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function setStage(stage: string | null) {
    if (!customer) return;
    try {
      await updCustomer({ data: { customer_id: customer.id, stage } });
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  if (!customer) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
        Cargando ficha…
      </div>
    );
  }

  const stages = ["nuevo", "contactado", "calificado", "propuesta", "ganado", "perdido"];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Customer header */}
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground">
            {(customer.name?.[0] ?? customer.phone?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-semibold">{customer.name ?? "Sin nombre"}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="truncate">{customer.phone}</span>
            </div>
          </div>
        </div>
        {isNewLead && (
          <div className="mt-3 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            🌱 Nuevo Lead
          </div>
        )}
        <div className="mt-3">
          <Link
            to="/clientes"
            className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-secondary"
          >
            <UsersIcon className="h-3 w-3" /> Ver ficha completa en CRM
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* AI Panel — Agente de Ventas + Motor de Análisis */}
      <AiPanel conversationId={conversationId} customerId={customer.id} />

      {/* AI Recommendation Engine — Productos recomendados en este momento */}
      <RecommendedProducts customerId={customer.id} conversationId={conversationId} />

      {/* Cotizaciones dentro del chat — canal de cierre */}
      <ConversationQuotes customerId={customer.id} conversationId={conversationId} />


      {/* Stage */}
      <Section icon={<ClipboardList className="h-3.5 w-3.5" />} title="Etapa del embudo">
        <div className="flex flex-wrap gap-1">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(customer.stage === s ? null : s)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition",
                customer.stage === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </Section>

      {/* Tags */}
      <Section icon={<Tag className="h-3.5 w-3.5" />} title="Etiquetas">
        <div className="flex flex-wrap gap-1">
          {(customer.tags ?? []).map((t: string) => (
            <span
              key={t}
              className="group flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px]"
            >
              #{t}
              <button onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Añadir etiqueta…"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
          />
          <button
            onClick={addTag}
            className="rounded-md bg-primary px-2 text-primary-foreground disabled:opacity-50"
            disabled={!newTag.trim()}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </Section>

      {/* Notes */}
      <Section icon={<StickyNote className="h-3.5 w-3.5" />} title="Notas internas">
        <div className="space-y-2">
          <div className="flex gap-1">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Añadir nota interna (solo visible para tu equipo)…"
              rows={2}
              className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={submitNote}
            disabled={!newNote.trim()}
            className="w-full rounded-md bg-primary py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            Guardar nota
          </button>
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {notes.map((n) => (
              <div key={n.id} className="rounded-md bg-secondary/60 px-2 py-1.5 text-[11px]">
                <div className="whitespace-pre-wrap">{n.body}</div>
                <div className="mt-0.5 text-[9px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {notes.length === 0 && (
              <div className="text-[10px] text-muted-foreground">Sin notas aún.</div>
            )}
          </div>
        </div>
      </Section>

      {/* Audit */}
      <Section icon={<History className="h-3.5 w-3.5" />} title="Historial de acciones">
        <div className="space-y-1">
          {events.map((e) => (
            <div key={e.id} className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">{eventLabel(e.event_type)}</span>
              {" · "}
              {new Date(e.created_at).toLocaleString()}
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-[10px] text-muted-foreground">Sin eventos.</div>
          )}
        </div>
      </Section>

      {/* Coming soon integrations */}
      <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="Acciones comerciales">
        <div className="grid grid-cols-2 gap-1.5">
          <ComingSoon icon={<ShoppingBag className="h-3 w-3" />} label="Nuevo pedido" />
          <ComingSoon icon={<FileText className="h-3 w-3" />} label="Cotización" />
          <ComingSoon icon={<Calendar className="h-3 w-3" />} label="Agendar" />
          <ComingSoon icon={<Building2 className="h-3 w-3" />} label="Oportunidad" />
        </div>
      </Section>

      <Section icon={<ShoppingBag className="h-3.5 w-3.5" />} title="Historial de compras">
        <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[10px] text-muted-foreground">
          <Lock className="mx-auto mb-1 h-3 w-3" />
          Próximamente — al conectar el módulo de Pedidos.
        </div>
      </Section>

      <Section icon={<Calendar className="h-3.5 w-3.5" />} title="Agenda y campañas">
        <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[10px] text-muted-foreground">
          <Lock className="mx-auto mb-1 h-3 w-3" />
          Próximamente — módulos de Agenda, Campañas y Automatizaciones.
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ComingSoon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      disabled
      className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground opacity-70"
      title="Próximamente"
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      <Lock className="h-2.5 w-2.5" />
    </button>
  );
}

function eventLabel(type: string) {
  switch (type) {
    case "assigned":
      return "Conversación asignada";
    case "reassigned":
      return "Conversación reasignada";
    case "unassigned":
      return "Responsable retirado";
    case "taken":
      return "Un agente tomó la conversación";
    case "status_changed":
      return "Estado actualizado";
    default:
      return type;
  }
}

// ================= AI Panel (Inbox) =================
function AiPanel({ conversationId, customerId }: { conversationId: string; customerId: string }) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeConversation);
  const statusFn = useServerFn(setSuggestionStatus);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: suggestion } = useQuery({
    queryKey: ["ai-suggestion", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_suggestions")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: insight } = useQuery({
    queryKey: ["ai-insight", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ai-panel-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_suggestions", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["ai-suggestion", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_insights", filter: `customer_id=eq.${customerId}` },
        () => qc.invalidateQueries({ queryKey: ["ai-insight", customerId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, customerId, qc]);

  async function analyze() {
    setAnalyzing(true);
    try {
      await analyzeFn({ data: { conversation_id: conversationId } });
      toast.success("Análisis de IA generado");
      qc.invalidateQueries({ queryKey: ["ai-suggestion", conversationId] });
      qc.invalidateQueries({ queryKey: ["ai-insight", customerId] });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo analizar");
    } finally {
      setAnalyzing(false);
    }
  }

  async function copyReply(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      await statusFn({ data: { id, status: "used" } });
      toast.success("Respuesta copiada — marcada como usada");
      qc.invalidateQueries({ queryKey: ["ai-suggestion", conversationId] });
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function discard(id: string) {
    try {
      await statusFn({ data: { id, status: "discarded" } });
      qc.invalidateQueries({ queryKey: ["ai-suggestion", conversationId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  const intentColor: Record<string, string> = {
    high_intent: "bg-emerald-500/15 text-emerald-600",
    ready_to_close: "bg-emerald-500/20 text-emerald-700",
    objection: "bg-amber-500/15 text-amber-600",
    browsing: "bg-sky-500/15 text-sky-600",
    not_interested: "bg-rose-500/15 text-rose-600",
    support: "bg-indigo-500/15 text-indigo-600",
  };

  return (
    <Section icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} title="Inteligencia comercial">
      <div className="space-y-2">
        {insight && (
          <div className="grid grid-cols-3 gap-1.5">
            <MiniStat label="Cierre" value={pct(insight.probability)} tone="emerald" />
            <MiniStat label="Riesgo" value={pct(insight.churn_risk)} tone="rose" />
            <MiniStat label="Calidad" value={pct(insight.quality_score)} tone="sky" />
          </div>
        )}

        {suggestion ? (
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
            <div className="flex flex-wrap items-center gap-1">
              {suggestion.intent && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    intentColor[suggestion.intent] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {suggestion.intent.replace(/_/g, " ")}
                </span>
              )}
              {suggestion.probability != null && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium">
                  {Math.round(Number(suggestion.probability) * 100)}% cierre
                </span>
              )}
              {suggestion.status === "used" && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600">
                  ✓ usada
                </span>
              )}
            </div>

            {suggestion.payload?.summary && (
              <p className="text-[11px] italic text-muted-foreground">
                "{suggestion.payload.summary}"
              </p>
            )}

            {suggestion.text && (
              <div className="rounded-md border border-border/60 bg-background p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Respuesta sugerida
                </div>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{suggestion.text}</p>
              </div>
            )}

            {suggestion.next_step && (
              <div className="text-[11px]">
                <span className="font-semibold">Siguiente paso:</span>{" "}
                <span className="text-muted-foreground">{suggestion.next_step}</span>
              </div>
            )}

            {Array.isArray(suggestion.objections) && suggestion.objections.length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Objeciones: {suggestion.objections.join(" · ")}
              </div>
            )}

            <div className="flex gap-1 pt-1">
              {suggestion.text && suggestion.status !== "used" && (
                <button
                  onClick={() => copyReply(suggestion.text, suggestion.id)}
                  className="flex-1 rounded-md bg-primary py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Copiar y usar
                </button>
              )}
              <button
                onClick={analyze}
                disabled={analyzing}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-secondary disabled:opacity-50"
                title="Volver a analizar"
              >
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </button>
              {suggestion.status === "pending" && (
                <button
                  onClick={() => discard(suggestion.id)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                  title="Descartar"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              <span>IA en modo automático</span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed">
              La inteligencia se actualiza sola con cada mensaje del cliente y cambios del embudo. No hace falta pulsar nada.
            </p>
            <button
              onClick={analyze}
              disabled={analyzing}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-secondary disabled:opacity-50"
              title="Forzar un análisis ahora"
            >
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Forzar análisis
            </button>
          </div>
        )}

        <Link
          to="/ia"
          className="block text-center text-[10px] text-muted-foreground hover:text-foreground"
        >
          Ver Panel de IA →
        </Link>
      </div>
    </Section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "sky";
}) {
  const toneMap = {
    emerald: "text-emerald-600 bg-emerald-500/10",
    rose: "text-rose-600 bg-rose-500/10",
    sky: "text-sky-600 bg-sky-500/10",
  };
  return (
    <div className={cn("rounded-md px-2 py-1.5 text-center", toneMap[tone])}>
      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function pct(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  return `${Math.round(Number(n) * 100)}%`;
}

// ================= Recommendation Engine Panel =================
const REASON_STYLES: Record<ReasonCode, string> = {
  high_intent: "bg-emerald-500/15 text-emerald-600",
  churn_rescue: "bg-rose-500/15 text-rose-600",
  purchase_history: "bg-indigo-500/15 text-indigo-600",
  category_affinity: "bg-violet-500/15 text-violet-600",
  bestseller: "bg-sky-500/15 text-sky-600",
  high_margin: "bg-amber-500/15 text-amber-600",
  stagnant_recovery: "bg-orange-500/15 text-orange-600",
  stage_fit: "bg-teal-500/15 text-teal-600",
};

function RecommendedProducts({
  customerId,
  conversationId,
}: {
  customerId: string;
  conversationId: string;
}) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateRecommendations);
  const listFn = useServerFn(listRecommendations);
  const statusFn = useServerFn(setRecommendationStatus);
  const linkFn = useServerFn(linkProductToCustomer);
  const [busy, setBusy] = useState(false);

  const { data: recos } = useQuery({
    queryKey: ["recos", customerId],
    queryFn: () => listFn({ data: { customer_id: customerId, limit: 20 } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`recos-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_recommendations",
          filter: `customer_id=eq.${customerId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["recos", customerId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [customerId, qc]);

  async function refresh() {
    setBusy(true);
    try {
      await genFn({
        data: { customer_id: customerId, conversation_id: conversationId, limit: 4 },
      });
      toast.success("Recomendaciones actualizadas");
      qc.invalidateQueries({ queryKey: ["recos", customerId] });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo generar");
    } finally {
      setBusy(false);
    }
  }

  async function accept(recoId: string, productId: string) {
    try {
      await linkFn({
        data: {
          product_id: productId,
          customer_id: customerId,
          conversation_id: conversationId,
          context: "recommended",
        },
      });
      await statusFn({ data: { id: recoId, status: "accepted" } });
      toast.success("Producto agregado al cliente");
      qc.invalidateQueries({ queryKey: ["recos", customerId] });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo aceptar");
    }
  }

  async function ignore(recoId: string) {
    try {
      await statusFn({ data: { id: recoId, status: "ignored" } });
      qc.invalidateQueries({ queryKey: ["recos", customerId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  const active = (recos ?? []).filter((r) => r.status === "pending").slice(0, 4);

  return (
    <Section
      icon={<ShoppingBag className="h-3.5 w-3.5 text-primary" />}
      title="Productos recomendados"
    >
      <div className="space-y-2">
        {active.length === 0 ? (
          <button
            onClick={refresh}
            disabled={busy}
            className="w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Calculando…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Generar recomendaciones
              </span>
            )}
          </button>
        ) : (
          <>
            {active.map((r) => (
              <div
                key={r.id}
                className="space-y-1.5 rounded-lg border border-border/60 bg-background p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold">
                      {r.product?.name ?? "Producto"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.product?.currency ?? "USD"}{" "}
                      {Number(r.product?.price ?? 0).toLocaleString()}
                    </div>
                  </div>
                  {r.score != null && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium">
                      {Math.round(Number(r.score) * 100)}%
                    </span>
                  )}
                </div>
                {r.reason_code && (
                  <span
                    className={cn(
                      "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      REASON_STYLES[r.reason_code] ?? "bg-muted",
                    )}
                  >
                    {REASON_CODES[r.reason_code]}
                  </span>
                )}
                <div className="flex gap-1 pt-0.5">
                  <button
                    onClick={() => accept(r.id, r.product_id)}
                    className="flex-1 rounded-md bg-primary py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Ofrecer
                  </button>
                  <button
                    disabled
                    title="Próximamente"
                    className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-60"
                  >
                    Cotizar
                  </button>
                  <button
                    onClick={() => ignore(r.id)}
                    className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
                    title="Ignorar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={refresh}
              disabled={busy}
              className="w-full rounded-md border border-border py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="mx-auto h-3 w-3 animate-spin" />
              ) : (
                <span className="inline-flex items-center justify-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Recalcular
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </Section>
  );
}
