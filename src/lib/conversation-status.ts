/** UI status used in inbox filters and actions. */
export type ConversationUiStatus = "open" | "pending" | "resolved" | "closed";

/** Postgres enum on public.conversations (no "resolved"). */
export type ConversationDbStatus = "open" | "pending" | "closed" | "archived";

/** Map UI "resolved" → DB "closed" (AL-2). */
export function toDbConversationStatus(status: ConversationUiStatus): ConversationDbStatus {
  if (status === "resolved") return "closed";
  if (status === "closed") return "closed";
  return status;
}

/** Map DB "closed" → UI "resolved" for inbox semantics. */
export function toUiConversationStatus(status: string): ConversationUiStatus {
  if (status === "closed") return "resolved";
  if (status === "archived") return "closed";
  return status as ConversationUiStatus;
}
