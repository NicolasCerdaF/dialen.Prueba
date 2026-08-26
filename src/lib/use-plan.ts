import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPlan, getMyUsage, planIncludes, type PlanId, type PremiumFeature } from "@/lib/plans.functions";
import { useAuth } from "@/lib/auth-context";

export function useMyPlan() {
  const { session } = useAuth();
  const fn = useServerFn(getMyPlan);
  const q = useQuery({
    queryKey: ["my-plan"],
    queryFn: () => fn({}),
    staleTime: 60_000,
    enabled: !!session?.user,
  });
  const plan: PlanId = q.data?.plan ?? "basico";
  return {
    ...q,
    plan,
    isPremium: plan === "premium",
    has: (feature: PremiumFeature) => planIncludes(plan, feature),
  };
}

export function useMyUsage() {
  const { session } = useAuth();
  const fn = useServerFn(getMyUsage);
  const q = useQuery({
    queryKey: ["my-usage"],
    queryFn: () => fn({}),
    staleTime: 30_000,
    enabled: !!session?.user,
  });
  const remaining = q.data?.remaining ?? 0;
  const included = q.data?.included ?? 0;
  const used = q.data?.used ?? 0;
  return {
    ...q,
    remaining,
    included,
    used,
    isExhausted: included > 0 && remaining <= 0,
    isLow: included > 0 && remaining > 0 && remaining <= Math.ceil(included * 0.1),
  };
}
