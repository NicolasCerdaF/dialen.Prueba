import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Coins, Sparkles, Check, CreditCard, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useMyUsage } from "@/lib/use-plan";
import { purchaseCreditPack } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creditos")({
  head: () => ({ meta: [{ title: "Comprar créditos — Dialen" }] }),
  component: CreditosPage,
});

type Pack = {
  id: "starter" | "growth" | "scale" | "enterprise";
  credits: number;
  bonusCredits?: number;
  label: string;
  bonus?: string;
  popular?: boolean;
  price: number;
  tagline: string;
};

const PACKS: Pack[] = [
  { id: "starter", credits: 1500, label: "Starter", price: 6990, tagline: "Refuerzo puntual para el Plan Start" },
  { id: "growth", credits: 4500, bonusCredits: 500, label: "Growth", bonus: "+10% extra", popular: true, price: 19990, tagline: "Recarga mensual para equipos activos" },
  { id: "scale", credits: 10000, bonusCredits: 2000, label: "Scale", bonus: "+20% extra", price: 39990, tagline: "Equivalente a un mes Business" },
  { id: "enterprise", credits: 30000, bonusCredits: 8000, label: "Enterprise", bonus: "+30% extra", price: 89990, tagline: "Para operaciones Business a gran escala" },
];

const fmtCLP = (n: number) => `$${n.toLocaleString("es-CL")}`;

function CreditosPage() {
  const [selected, setSelected] = useState<Pack["id"]>("growth");
  const qc = useQueryClient();
  const { data: usage, isExhausted, remaining, included, used, pct } = useMyUsage();
  const buyFn = useServerFn(purchaseCreditPack);

  const purchase = useMutation({
    mutationFn: (packId: Pack["id"]) => buyFn({ data: { pack_id: packId } }),
    onSuccess: (res) => {
      toast.success(`${res.added.toLocaleString("es-CL")} créditos añadidos a tu saldo bonus`);
      qc.invalidateQueries({ queryKey: ["my-usage"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "No se pudo procesar la compra";
      if (msg.includes("bonus_credits")) {
        toast.error("Migración pendiente", {
          description: "Ejecuta supabase/migrations/20260826000000_ai_credits.sql en tu proyecto Supabase.",
        });
        return;
      }
      toast.error(msg);
    },
  });

  const monthlyAllowance = usage?.monthlyAllowance ?? included;
  const bonusCredits = usage?.bonusCredits ?? 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Créditos IA
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold">Comprar créditos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los créditos se consumen al usar la IA (sugerencias, auto-respuesta, embeddings, Director IA, automatizaciones).
            Compra paquetes adicionales cuando lo necesites — no expiran.
          </p>
        </header>

        <div className={cn(
          "mb-8 rounded-2xl border bg-card p-6",
          isExhausted ? "border-red-500/40 bg-red-500/5" : "border-border",
        )}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Coins className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo disponible este mes</div>
                <div className="font-display text-2xl font-semibold tabular-nums">
                  {remaining.toLocaleString("es-CL")}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {included.toLocaleString("es-CL")} créditos
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>
                Usados: <span className="font-semibold text-foreground tabular-nums">{used.toLocaleString("es-CL")}</span> ({pct}%)
              </div>
              <div className="mt-0.5">
                Plan: {monthlyAllowance.toLocaleString("es-CL")}/mes
                {bonusCredits > 0 && (
                  <> · Bonus: <span className="font-semibold text-foreground">{bonusCredits.toLocaleString("es-CL")}</span></>
                )}
              </div>
            </div>
          </div>
          {isExhausted && (
            <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
              Agotaste tus créditos IA. Compra un paquete abajo para seguir usando la IA hoy.
            </p>
          )}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((p) => {
            const isSel = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  "relative rounded-2xl border bg-card p-5 text-left transition",
                  isSel ? "border-primary shadow-md shadow-primary/10 ring-2 ring-primary/20" : "border-border hover:border-primary/50",
                )}
              >
                {p.popular && (
                  <div className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Popular
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4" /> {p.label}
                </div>
                <div className="mt-3 font-display text-2xl font-semibold">
                  {p.credits.toLocaleString("es-CL")}
                </div>
                <div className="text-xs text-muted-foreground">
                  créditos IA{p.bonusCredits ? ` + ${p.bonusCredits.toLocaleString("es-CL")} bonus` : ""}
                </div>
                {p.bonus && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> {p.bonus}
                  </div>
                )}
                <div className="mt-3 font-display text-lg font-semibold">
                  {fmtCLP(p.price)} <span className="text-xs font-normal text-muted-foreground">CLP</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {p.tagline} · ${Math.round(p.price / (p.credits + (p.bonusCredits ?? 0))).toLocaleString("es-CL")} por crédito
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Método de pago</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Stripe estará disponible pronto. Mientras tanto puedes acreditar créditos bonus en modo demo (sin cobro real).
            </p>

            <div className="mt-5 space-y-3">
              {[
                { label: "Tarjeta de crédito/débito", desc: "Visa, Mastercard, Amex — próximamente" },
                { label: "Transferencia bancaria", desc: "Chile — Webpay/Servipag — próximamente" },
                { label: "Demo / acreditación inmediata", desc: "Suma créditos bonus sin pasarela (desarrollo)" },
              ].map((m, i) => (
                <label
                  key={m.label}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    i === 2 ? "border-primary/40 bg-primary/5" : "border-border opacity-70",
                  )}
                >
                  <input type="radio" name="pay" defaultChecked={i === 2} readOnly className="h-4 w-4" />
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => purchase.mutate(selected)}
              disabled={purchase.isPending}
              className="mt-6 w-full rounded-lg bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {purchase.isPending ? "Acreditando…" : "Acreditar créditos (demo)"}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Resumen</h2>
            <div className="mt-4 space-y-2 text-sm">
              {(() => {
                const sel = PACKS.find((p) => p.id === selected)!;
                const totalCredits = sel.credits + (sel.bonusCredits ?? 0);
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paquete</span>
                      <span className="font-medium">{sel.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Créditos base</span>
                      <span className="font-medium tabular-nums">{sel.credits.toLocaleString("es-CL")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bonus</span>
                      <span className="font-medium tabular-nums">
                        {sel.bonusCredits ? `+${sel.bonusCredits.toLocaleString("es-CL")} (${sel.bonus})` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total créditos</span>
                      <span className="font-semibold tabular-nums">{totalCredits.toLocaleString("es-CL")}</span>
                    </div>
                    <div className="my-3 h-px bg-border" />
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted-foreground">Total a pagar</span>
                      <span className="font-display text-lg font-semibold">
                        {fmtCLP(sel.price)} <span className="text-xs font-normal text-muted-foreground">CLP</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Modo demo: sin cobro · créditos bonus sin vencimiento
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 flex-none text-emerald-500" />
              Los créditos bonus se suman a tu cupo mensual del plan.
            </div>
            <Link to="/mi-plan" className="mt-4 inline-block text-xs text-primary hover:underline">
              Ver mi plan y cupo mensual →
            </Link>
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
