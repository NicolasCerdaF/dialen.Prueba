import { Link } from "@tanstack/react-router";
import { Coins, Crown, Sparkles, TrendingUp, Zap, Brain } from "lucide-react";
import { useMyPlan, useMyUsage } from "@/lib/use-plan";
import { PLAN_CATALOG } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export function CreditsUsageCard() {
  const { plan, isPremium } = useMyPlan();
  const { data, isLoading } = useMyUsage();
  const included = data?.included ?? PLAN_CATALOG[plan].monthlyCredits;
  const used = data?.used ?? 0;
  const remaining = data?.remaining ?? included;
  const pct = data?.pct ?? 0;
  const critical = pct >= 90;
  const warning = pct >= 70 && !critical;
  const bd = data?.breakdown ?? { suggestions: 0, automations: 0, insights: 0 };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              isPremium
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-1 ring-amber-500/30"
                : "bg-primary/10",
            )}
          >
            {isPremium ? (
              <Crown className="h-4 w-4 text-amber-500" />
            ) : (
              <Coins className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Consumo de créditos IA
            </div>
            <div className="font-display text-sm font-semibold">
              Plan {PLAN_CATALOG[plan].name.replace("Plan ", "")} · Este mes
            </div>
          </div>
        </div>
        <Link
          to="/creditos"
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          Comprar
        </Link>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-semibold tabular-nums">
              {isLoading ? "—" : used.toLocaleString("es-CL")}
            </span>
            <span className="text-sm text-muted-foreground">
              / {included.toLocaleString("es-CL")}
            </span>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              critical
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : warning
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {pct}% usado
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              critical ? "bg-red-500" : warning ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Te quedan <span className="font-semibold text-foreground">{remaining.toLocaleString("es-CL")}</span> créditos este mes
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <BreakdownStat icon={Sparkles} label="Sugerencias IA" value={bd.suggestions} />
        <BreakdownStat icon={Zap} label="Automatizaciones" value={bd.automations} />
        <BreakdownStat icon={Brain} label="Insights Director" value={bd.insights} />
      </div>

      {!isPremium && (
        <Link
          to="/mi-plan"
          className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/5 px-3 py-2 text-xs hover:from-amber-500/15"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Sube a Business — 6× más créditos y funciones avanzadas
          </span>
          <span className="font-semibold text-amber-600 dark:text-amber-400">Ver planes →</span>
        </Link>
      )}
    </div>
  );
}

function BreakdownStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/40 p-2">
      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
      <div className="mt-1 font-display text-sm font-semibold tabular-nums">
        {value.toLocaleString("es-CL")}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
