// Sales pipeline configuration — enfocado en ventas por WhatsApp.
// Se redujo a 5 etapas operativas + Perdido (archivo). Todas las llaves
// legacy siguen mapeándose para no romper datos existentes.

export type PipelineStage = {
  key: string;
  label: string;
  color: string; // tailwind hue token
  kind: "open" | "won" | "lost";
  order: number;
};

export const STAGES: PipelineStage[] = [
  { key: "nuevo_lead",  label: "Nuevo",       color: "sky",     kind: "open", order: 1 },
  { key: "interesado",  label: "Interesado",  color: "indigo",  kind: "open", order: 2 },
  { key: "cotizado",    label: "Cotizado",    color: "amber",   kind: "open", order: 3 },
  { key: "negociando",  label: "Negociando",  color: "orange",  kind: "open", order: 4 },
  { key: "ganado",      label: "Ganado",      color: "emerald", kind: "won",  order: 5 },
  { key: "perdido",     label: "Perdido",     color: "rose",    kind: "lost", order: 6 },
];

// Legacy stage keys → nuevas etapas. Cubre datos previos al reenfoque.
const LEGACY: Record<string, string> = {
  nuevo: "nuevo_lead",
  lead: "nuevo_lead",
  contactado: "interesado",
  primer_contacto: "interesado",
  calificado: "interesado",
  contact: "interesado",
  qualified: "interesado",
  propuesta: "cotizado",
  propuesta_enviada: "cotizado",
  proposal: "cotizado",
  negociacion: "negociando",
  negotiation: "negociando",
  venta_ganada: "ganado",
  won: "ganado",
  postventa: "ganado",
  venta_perdida: "perdido",
  lost: "perdido",
};

export function normalizeStage(raw: string | null | undefined): string {
  if (!raw) return "nuevo_lead";
  const k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (LEGACY[k]) return LEGACY[k];
  return STAGES.some((s) => s.key === k) ? k : "nuevo_lead";
}

export function getStage(key: string): PipelineStage | undefined {
  return STAGES.find((s) => s.key === key);
}

// Tailwind class fragments per stage color. Kept explicit so Tailwind's
// JIT doesn't purge them.
export const STAGE_STYLES: Record<string, { bar: string; badge: string; ring: string }> = {
  sky:     { bar: "bg-sky-500",     badge: "bg-sky-500/10 text-sky-300 border-sky-500/30",         ring: "ring-sky-500/40" },
  indigo:  { bar: "bg-indigo-500",  badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30", ring: "ring-indigo-500/40" },
  violet:  { bar: "bg-violet-500",  badge: "bg-violet-500/10 text-violet-300 border-violet-500/30", ring: "ring-violet-500/40" },
  amber:   { bar: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-300 border-amber-500/30",   ring: "ring-amber-500/40" },
  orange:  { bar: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-300 border-orange-500/30", ring: "ring-orange-500/40" },
  emerald: { bar: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", ring: "ring-emerald-500/40" },
  rose:    { bar: "bg-rose-500",    badge: "bg-rose-500/10 text-rose-300 border-rose-500/30",       ring: "ring-rose-500/40" },
  teal:    { bar: "bg-teal-500",    badge: "bg-teal-500/10 text-teal-300 border-teal-500/30",       ring: "ring-teal-500/40" },
};

export function stageStyle(stageKey: string) {
  const s = getStage(stageKey);
  return STAGE_STYLES[s?.color ?? "sky"];
}

// Stagnation threshold in days: an open card older than this raises a visual alert.
export const STAGNANT_DAYS_BY_STAGE: Record<string, number> = {
  nuevo_lead: 2,
  interesado: 4,
  cotizado: 5,
  negociando: 7,
};
