import { PLAN_CATALOG, type PlanId } from "@/lib/plans.functions";

export { PLAN_CATALOG, type PlanId };

export type PlanSearchParam = "start" | "business";

export function planToSearchParam(planId: PlanId): PlanSearchParam {
  return planId === "premium" ? "business" : "start";
}

export function planFromSearchParam(raw: string | undefined | null): PlanId | null {
  if (raw === "business") return "premium";
  if (raw === "start") return "basico";
  return null;
}

export function loginHref(planId: PlanId): string {
  return `/login?plan=${planToSearchParam(planId)}`;
}
