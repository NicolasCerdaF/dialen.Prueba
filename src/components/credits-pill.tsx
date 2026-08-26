import { Link } from "@tanstack/react-router";
import { Coins, Crown } from "lucide-react";
import { useMyPlan, useMyUsage } from "@/lib/use-plan";
import { cn } from "@/lib/utils";

export function CreditsPill() {
  const { plan, isPremium } = useMyPlan();
  const { data, remaining, included, used, pct, isExhausted } = useMyUsage();
  const critical = pct >= 90 || isExhausted;
  const warning = (pct >= 70 && !critical) || (remaining > 0 && remaining <= Math.ceil((included || 1) * 0.1));

  return (
    <div className="flex items-center gap-2">
      <Link
        to="/creditos"
        title={
          isExhausted
            ? "Sin créditos IA — compra más"
            : `${remaining.toLocaleString("es-CL")} disponibles de ${included.toLocaleString("es-CL")} (${used.toLocaleString("es-CL")} usados)`
        }
        className={cn(
          "group hidden items-center gap-2 rounded-full border bg-card/60 px-2.5 py-1 transition hover:border-primary/40 hover:bg-card sm:inline-flex",
          isExhausted && "border-red-500/40 bg-red-500/5",
        )}
      >
        <Coins
          className={cn(
            "h-3.5 w-3.5",
            critical ? "text-red-500" : warning ? "text-amber-500" : "text-primary",
          )}
        />
        <div className="flex items-baseline gap-1 text-[11px]">
          <span className="font-semibold tabular-nums">
            {isExhausted ? "0" : remaining.toLocaleString("es-CL")}
          </span>
          <span className="text-muted-foreground">/ {included.toLocaleString("es-CL")}</span>
        </div>
        <div className="h-1 w-14 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              critical ? "bg-red-500" : warning ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Link>
      <Link
        to="/mi-plan"
        title={isPremium ? "Plan Business" : "Plan Start"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition",
          isPremium
            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
            : "border border-border bg-secondary text-muted-foreground hover:text-foreground",
        )}
      >
        {isPremium ? <Crown className="h-3 w-3" /> : null}
        {plan === "premium" ? "Business" : "Start"}
      </Link>
    </div>
  );
}
