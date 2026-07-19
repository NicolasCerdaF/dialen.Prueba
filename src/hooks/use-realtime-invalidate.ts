import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeTable =
  | "messages"
  | "conversations"
  | "quotes"
  | "quote_events"
  | "customers"
  | "ai_suggestions"
  | "conversation_notes"
  | "customer_notes";

type Options = {
  /** Unique channel name (must be stable across renders for the same subscription). */
  channel: string;
  /** Tables to listen to. */
  tables: RealtimeTable[];
  /** Query keys to invalidate on ANY change. Each entry is invalidated as a prefix. */
  invalidate: QueryKey[];
  /** Optional filter, e.g. `id=eq.${customerId}`. Applied to every table listed. */
  filter?: string;
  /** Disable when false (useful before an id is known). */
  enabled?: boolean;
};

/**
 * Shared Realtime subscription helper — mounts a single Supabase channel per
 * component, listens for postgres_changes on the requested tables, and
 * invalidates the given TanStack Query keys.
 *
 * Rules:
 *  - Always used inside useEffect (never at module or component scope).
 *  - Tears down cleanly on unmount to avoid subscription leaks.
 */
export function useRealtimeInvalidate({
  channel,
  tables,
  invalidate,
  filter,
  enabled = true,
}: Options) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel(channel);
    tables.forEach((t) => {
      ch.on(
        "postgres_changes",
        filter
          ? { event: "*", schema: "public", table: t, filter }
          : { event: "*", schema: "public", table: t },
        () => {
          invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        },
      );
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // Keys/tables arrays are expected to be stable literals in call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, filter, enabled, qc]);
}
