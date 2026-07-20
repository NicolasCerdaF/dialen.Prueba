import { Link } from "@tanstack/react-router";
import { Crown, Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useMyPlan } from "@/lib/use-plan";
import type { PremiumFeature } from "@/lib/plans.functions";

type Props = {
  feature: PremiumFeature;
  title: string;
  description?: string;
  children: ReactNode;
  /** When true, wraps the locked state in AppShell. Default true. */
  withShell?: boolean;
};

/**
 * Renders children when the current plan includes the feature; otherwise
 * shows a lock screen with an upgrade CTA to /mi-plan.
 */
export function PremiumGate({ feature, title, description, children, withShell = true }: Props) {
  const { has, isLoading } = useMyPlan();
  if (isLoading) return <>{children}</>;
  if (has(feature)) return <>{children}</>;

  const locked = (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="relative mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent ring-1 ring-amber-500/30">
            <Lock className="h-9 w-9 text-amber-500" strokeWidth={1.75} />
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg">
            <Crown className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <Sparkles className="h-3 w-3" /> Función Premium
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
        ) : (
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Esta función está disponible solo en el <strong>Plan Premium</strong>. Actualiza tu plan para
            desbloquearla junto con el resto de las herramientas de IA avanzada.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/mi-plan"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <Crown className="h-4 w-4" /> Actualizar a Premium
          </Link>
          <Link
            to="/dashboard"
            className="rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );

  return withShell ? <AppShell>{locked}</AppShell> : locked;
}
