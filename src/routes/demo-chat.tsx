import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles, RotateCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { simulateInboundMessage, resetDemoConversation } from "@/lib/demo.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo-chat")({
  head: () => ({ meta: [{ title: "Modo demo — Dialen" }] }),
  component: DemoChatPage,
});

type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  created_at: string;
};

function DemoChatPage() {
  const qc = useQueryClient();
  const sendFn = useServerFn(simulateInboundMessage);
  const resetFn = useServerFn(resetDemoConversation);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: convoId } = useQuery({
    queryKey: ["demo-convo-id"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, customers!inner(phone)")
        .eq("is_demo", true)
        .eq("customers.phone", "+demo")
        .maybeSingle();
      return (data as any)?.id ?? null;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["demo-messages", convoId],
    enabled: !!convoId,
    queryFn: async (): Promise<Msg[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, body, created_at")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  useEffect(() => {
    if (!convoId) return;
    const ch = supabase
      .channel(`demo-${convoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${convoId}` },
        () => qc.invalidateQueries({ queryKey: ["demo-messages", convoId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [convoId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const v = text.trim();
    if (!v) return;
    setText("");
    setSending(true);
    try {
      const res = await sendFn({ data: { text: v } });
      qc.setQueryData(["demo-convo-id"], res.conversation_id);
      qc.invalidateQueries({ queryKey: ["demo-messages"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
      setText(v);
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (!confirm("¿Borrar la conversación demo?")) return;
    await resetFn({});
    qc.invalidateQueries({ queryKey: ["demo-convo-id"] });
    qc.invalidateQueries({ queryKey: ["demo-messages"] });
    toast.success("Conversación reiniciada");
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-primary/5 px-6 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-sm font-semibold">Modo demo</div>
                <div className="text-xs text-muted-foreground">
                  Escribe como si fueras un cliente. La IA responderá con tu estilo.
                </div>
              </div>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" /> Reiniciar
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-2">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
                <div className="font-medium">Prueba a saludar</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Por ejemplo: "Hola, ¿qué precios tienen?"
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.direction === "inbound" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                    m.direction === "inbound"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> La IA está escribiendo…
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-border bg-background px-6 py-4"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe como un cliente…"
              className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
