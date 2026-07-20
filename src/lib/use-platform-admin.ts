import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isPlatformAdmin } from "@/lib/platform-admin.functions";
import { useAuth } from "@/lib/auth-context";

export function usePlatformAdmin() {
  const { user } = useAuth();
  const fn = useServerFn(isPlatformAdmin);
  const q = useQuery({
    queryKey: ["is-platform-admin", user?.id ?? "anon"],
    queryFn: () => fn(),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  return { isPlatformAdmin: !!q.data?.isAdmin, isLoading: q.isLoading };
}
