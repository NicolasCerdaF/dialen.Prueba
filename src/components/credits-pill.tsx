import { Link } from "@tanstack/react-router";
import { Coins, Crown } from "lucide-react";
import { useMyPlan, useMyUsage } from "@/lib/use-plan";
import { cn } from "@/lib/utils";

export function CreditsPill() {
  const { plan, isPremium } = useMyPlan();
  const { data } = useMyUsage();
  const used = data?.used ?? 0;
  const included = data?.included ?? 0;
  const pct = data?.pct ?? 0;
  const critical = pct >= 90;
  const warning = pct >= 70 && !critical;

  return (
    <div className="flex items-center gap-2">
      <Link
        to="/creditos"
        title={`${used.toLocaleString("es-CL")} de ${included.toLocaleString("es-CL")} créditos IA usados este mes`}
        className="group hidden items-center gap-2 rounded-full border border-border bg-card/60 px-2.5 py-1 transition hover:border-primary/40 hover:bg-card sm:inline-flex"
      >
        <Coins
          className={cn(
            "h-3.5 w-3.5",
            critical ? "text-red-500" : warning ? "text-amber-500" : "text-primary",
          )}
        />
        <div className="flex items-baseline gap-1 text-[11px]">
          <span className="font-semibold tabular-nums">{used.toLocaleString("es-CL")}</span>
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
        title={isPremium ? "Plan Premium" : "Plan Básico"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition",
          isPremium
            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
            : "border border-border bg-secondary text-muted-foreground hover:text-foreground",
        )}
      >
        {isPremium ? <Crown className="h-3 w-3" /> : null}
        {plan === "premium" ? "Premium" : "Básico"}
      </Link>
    </div>
  );
}
