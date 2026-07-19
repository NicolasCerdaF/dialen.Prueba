import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Global TanStack Query defaults tuned for a SaaS dashboard:
  // - staleTime 30s: reduces re-fetches when the user navigates back and forth
  // - gcTime 5m: keeps caches warm for module switches
  // - refetchOnWindowFocus false: avoid refetch storms when returning to the tab
  // - retry 1: fail fast on transient errors, one silent retry
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload on hover/touch intent for near-instant navigation between modules.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // Let TanStack Query decide freshness for preloaded routes.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
