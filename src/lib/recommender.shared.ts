// Client-safe shared constants for the recommender. Kept out of the
// server-only .server.ts so components can import REASON_CODES freely.

export const REASON_CODES = {
  high_intent: "Alta intención de compra detectada por IA",
  stage_fit: "Encaja con la etapa actual del embudo",
  category_affinity: "Categoría afín a los productos que ya vio",
  purchase_history: "Similar a lo que ya compró",
  bestseller: "Producto con mayor tracción comercial",
  high_margin: "Alto margen y buena aceptación",
  stagnant_recovery: "Oferta para reactivar cliente estancado",
  churn_rescue: "Oferta para retener cliente en riesgo",
} as const;
export type ReasonCode = keyof typeof REASON_CODES;

/** Canonical live recommendation status (AL-1). Legacy rows may still use "pending". */
export const RECOMMENDATION_ACTIVE_STATUS = "active" as const;
export const RECOMMENDATION_LIVE_STATUSES = ["active", "pending"] as const;

export function isLiveRecommendationStatus(status: string): boolean {
  return status === RECOMMENDATION_ACTIVE_STATUS || status === "pending";
}
