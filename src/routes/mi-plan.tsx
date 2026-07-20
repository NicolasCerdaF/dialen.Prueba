import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Sparkles, Zap, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getMyPlan, changeMyPlan, PLAN_CATALOG, type PlanId } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mi-plan")({
  head: () => ({ meta: [{ title: "Mi Plan — Dialen" }] }),
  component: MiPlanPage,
});

function MiPlanPage() {
  const getPlan = useServerFn(getMyPlan);
  const changePlan = useServerFn(changeMyPlan);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-plan"],
    queryFn: () => getPlan({}),
  });

  const mutation = useMutation({
    mutationFn: (plan: PlanId) => changePlan({ data: { plan } }),
    onSuccess: (_, plan) => {
      toast.success(`Plan actualizado a ${PLAN_CATALOG[plan].name}`);
      qc.invalidateQueries({ queryKey: ["my-plan"] });
      qc.invalidateQueries({ queryKey: ["my-usage"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al cambiar de plan"),
  });

  const current: PlanId = data?.plan ?? "basico";

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Suscripción
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold">Mi Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona tu suscripción de Dialen. Puedes cambiar de plan cuando quieras — los cambios son inmediatos.
          </p>
        </header>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div className="mb-8 rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Plan actual</div>
                  <div className="mt-1 flex items-center gap-2">
                    {current === "premium" ? (
                      <Crown className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Zap className="h-5 w-5 text-primary" />
                    )}
                    <span className="font-display text-xl font-semibold">{PLAN_CATALOG[current].name}</span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      Activo
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {PLAN_CATALOG[current].monthlyCredits.toLocaleString("es-CL")} créditos IA incluidos por mes
                  </div>
                </div>
                <a
                  href="/creditos"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
                >
                  Comprar créditos <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Compara los planes
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {(["basico", "premium"] as PlanId[]).map((id) => {
                const plan = PLAN_CATALOG[id];
                const isCurrent = current === id;
                const isPremium = id === "premium";
                return (
                  <div
                    key={id}
                    className={cn(
                      "relative rounded-2xl border bg-card p-6 transition",
                      isCurrent ? "border-primary shadow-lg shadow-primary/5" : "border-border",
                      isPremium && !isCurrent && "ring-1 ring-amber-500/20",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-x-0 top-0 h-1 rounded-t-2xl",
                        isPremium
                          ? "bg-gradient-to-r from-amber-500 to-orange-500"
                          : "bg-gradient-to-r from-primary/60 to-primary",
                      )}
                    />
                    {isPremium && (
                      <div className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[11px] font-semibold text-white shadow">
                        Recomendado
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isPremium ? (
                          <Crown className="h-5 w-5 text-amber-500" />
                        ) : (
                          <Zap className="h-5 w-5 text-primary" />
                        )}
                        <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          isPremium
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {isPremium ? "Avanzado" : "Esencial"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>

                    <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-sm">
                      <div className="font-medium">{plan.monthlyCredits.toLocaleString("es-CL")} créditos IA / mes</div>
                    </div>

                    <div className="my-5 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Incluye
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <ul className="space-y-2 text-sm">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="my-5 h-px bg-border" />

                    <button
                      disabled={isCurrent || mutation.isPending}
                      onClick={() => mutation.mutate(id)}
                      className={cn(
                        "w-full rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-50",
                        isCurrent
                          ? "border border-border bg-secondary text-muted-foreground"
                          : isPremium
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow hover:shadow-md"
                            : "bg-primary text-primary-foreground hover:opacity-90",
                      )}
                    >
                      {isCurrent
                        ? "Plan actual"
                        : mutation.isPending
                          ? "Actualizando…"
                          : id === "premium"
                            ? "Cambiar a Premium"
                            : "Cambiar a Básico"}
                    </button>
                  </div>
                );
              })}
            </div>


            <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <p>
                Los cambios de plan se aplican de inmediato. Si necesitas facturación anual, plan corporativo o SLA
                personalizado, escríbenos y armamos un plan a medida.
              </p>
            </div>
          </>
        )}
        </div>
      </div>
    </AppShell>
  );
}
