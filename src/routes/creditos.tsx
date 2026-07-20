import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Coins, Sparkles, Check, CreditCard, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useMyUsage } from "@/lib/use-plan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creditos")({
  head: () => ({ meta: [{ title: "Comprar créditos — Dialen" }] }),
  component: CreditosPage,
});

type Pack = {
  id: string;
  credits: number;
  bonusCredits?: number;
  label: string;
  bonus?: string;
  popular?: boolean;
  price: number; // CLP
  tagline: string;
};

// Precios alineados al costo del software:
// Plan Básico incluye 500 créditos/mes → Starter equivale a una recarga mensual.
// Plan Premium incluye 3.000 créditos/mes → Scale ≈ una recarga Premium.
const PACKS: Pack[] = [
  { id: "starter", credits: 500, label: "Starter", price: 9990, tagline: "Ideal para el Plan Básico" },
  { id: "growth", credits: 2000, bonusCredits: 200, label: "Growth", bonus: "+10% extra", popular: true, price: 29990, tagline: "Refuerzo mensual para equipos activos" },
  { id: "scale", credits: 5000, bonusCredits: 1000, label: "Scale", bonus: "+20% extra", price: 59990, tagline: "Equivalente a un mes Premium" },
  { id: "enterprise", credits: 15000, bonusCredits: 4500, label: "Enterprise", bonus: "+30% extra", price: 149990, tagline: "Para operaciones Premium a gran escala" },
];

const fmtCLP = (n: number) => `$${n.toLocaleString("es-CL")}`;

function CreditosPage() {
  const [selected, setSelected] = useState<string>("growth");
  const [processing, setProcessing] = useState(false);
  const { data: usage } = useMyUsage();
  const included = usage?.included ?? 0;
  const used = usage?.used ?? 0;
  const remaining = usage?.remaining ?? 0;
  const pct = usage?.pct ?? 0;

  const buy = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      toast.info("Pasarela de pago próximamente disponible", {
        description: "Estamos integrando Stripe para procesar las compras de créditos.",
      });
    }, 800);
  };

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
            Los créditos se consumen al usar la IA (Director Comercial, sugerencias, cotizaciones, análisis). Compra
            paquetes adicionales cuando lo necesites — no expiran.
          </p>
        </header>

        <div className="mb-8 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Coins className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo disponible este mes</div>
                <div className="font-display text-2xl font-semibold tabular-nums">
                  {remaining.toLocaleString("es-CL")} <span className="text-sm font-normal text-muted-foreground">/ {included.toLocaleString("es-CL")} créditos</span>
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Usados: <span className="font-semibold text-foreground tabular-nums">{used.toLocaleString("es-CL")}</span> ({pct}%)</div>
              <div className="mt-0.5">Se recargan según tu plan cada mes.</div>
            </div>
          </div>
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
                <div className="text-xs text-muted-foreground">créditos IA</div>
                {p.bonus && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> {p.bonus}
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground">Precio próximamente</div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Método de pago</h2>
            <p className="mt-1 text-sm text-muted-foreground">Estamos habilitando la pasarela de pago. Muy pronto podrás cargar créditos al instante.</p>

            <div className="mt-5 space-y-3">
              {[
                { label: "Tarjeta de crédito/débito", desc: "Visa, Mastercard, Amex" },
                { label: "Transferencia bancaria", desc: "Chile — Webpay/Servipag" },
                { label: "Facturación empresa", desc: "Orden de compra + factura electrónica" },
              ].map((m, i) => (
                <label
                  key={m.label}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 opacity-60",
                    i === 0 ? "border-primary/40" : "border-border",
                  )}
                >
                  <input type="radio" disabled name="pay" defaultChecked={i === 0} className="h-4 w-4" />
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    Próximamente
                  </span>
                </label>
              ))}
            </div>

            <button
              onClick={buy}
              disabled={processing}
              className="mt-6 w-full rounded-lg bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {processing ? "Procesando…" : "Comprar créditos"}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Resumen</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paquete</span>
                <span className="font-medium">{PACKS.find((p) => p.id === selected)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créditos</span>
                <span className="font-medium">{PACKS.find((p) => p.id === selected)?.credits.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bonus</span>
                <span className="font-medium">{PACKS.find((p) => p.id === selected)?.bonus ?? "—"}</span>
              </div>
              <div className="my-3 h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-display text-lg font-semibold">Próximamente</span>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 flex-none text-emerald-500" />
              Pagos procesados de forma segura. No almacenamos datos de tarjeta.
            </div>
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
