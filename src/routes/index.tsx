import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Send, Loader2, ArrowRight, Pause, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsAppMessage, toggleConversationAiPause } from "@/lib/whatsapp.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Bandeja — Dialen" }] }),
  component: ChatsPage,
});

type Conversation = {
  id: string;
  customer_id: string;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  is_demo: boolean;
  ai_paused: boolean;
  customers: { name: string | null; phone: string } | null;
};

function ChatsPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: channel } = useQuery({
    queryKey: ["wa-channel-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_channels")
        .select("status")
        .maybeSingle();
      return data;
    },
  });


  const { data: convos = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, customer_id, last_message_at, unread_count, status, is_demo, ai_paused, customers(name, phone)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("inbox")
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
          const convId = (payload.new as any)?.conversation_id;
          if (convId) qc.invalidateQueries({ queryKey: ["messages", convId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    if (!activeId && convos[0]) setActiveId(convos[0].id);
  }, [convos, activeId]);

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
        <div className="w-[320px] shrink-0 border-r border-border overflow-y-auto">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bandeja
          </div>
          <ul>
            {convos.map((c) => (
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
                  <div className="flex items-center justify-between">
                    <div className="truncate text-sm font-medium">
                      {c.customers?.name ?? c.customers?.phone ?? "Sin nombre"}
                    </div>
                    {c.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.last_message_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
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
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 overflow-hidden">
          {activeId ? <ChatView conversationId={activeId} /> : null}
        </div>
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
};

function ChatView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendWhatsAppMessage);
  const pauseFn = useServerFn(toggleConversationAiPause);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, direction, created_at, status")
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
        .select("id, is_demo, ai_paused, customers(name, phone)")
        .eq("id", conversationId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const header = useMemo(
    () => ({
      name: (convo as any)?.customers?.name ?? (convo as any)?.customers?.phone ?? "Conversación",
      phone: (convo as any)?.customers?.phone ?? "",
      isDemo: Boolean((convo as any)?.is_demo),
      aiPaused: Boolean((convo as any)?.ai_paused),
    }),
    [convo],
  );

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

  return (
    <div className="flex h-full flex-col">
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
          </div>
          <div className="text-xs text-muted-foreground">{header.phone}</div>
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
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.direction === "outbound" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm",
                m.direction === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground",
              )}
            >
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="mt-1 text-[10px] opacity-70">
                {new Date(m.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
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
          placeholder="Escribe un mensaje…"
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
