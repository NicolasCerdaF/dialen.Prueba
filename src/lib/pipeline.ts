// Sales pipeline configuration.
// Single source of truth for stage keys used across CRM, Inbox, Kanban and Dashboard.
// Designed so an admin can later persist these in a `pipeline_stages` table without
// touching UI code — just replace `STAGES` with a Realtime query.

export type PipelineStage = {
  key: string;
  label: string;
  color: string; // tailwind hue token
  kind: "open" | "won" | "lost" | "post";
  order: number;
};

export const STAGES: PipelineStage[] = [
  { key: "nuevo_lead",      label: "Nuevo Lead",         color: "sky",     kind: "open", order: 1 },
  { key: "primer_contacto", label: "Primer Contacto",    color: "indigo",  kind: "open", order: 2 },
  { key: "calificado",      label: "Calificado",         color: "violet",  kind: "open", order: 3 },
  { key: "propuesta",       label: "Propuesta Enviada",  color: "amber",   kind: "open", order: 4 },
  { key: "negociacion",     label: "Negociación",        color: "orange",  kind: "open", order: 5 },
  { key: "ganado",          label: "Venta Ganada",       color: "emerald", kind: "won",  order: 6 },
  { key: "perdido",         label: "Venta Perdida",      color: "rose",    kind: "lost", order: 7 },
  { key: "postventa",       label: "Postventa",          color: "teal",    kind: "post", order: 8 },
];

// Legacy stage keys that existed before the pipeline module was introduced.
const LEGACY: Record<string, string> = {
  nuevo: "nuevo_lead",
  contactado: "primer_contacto",
  propuesta_enviada: "propuesta",
  venta_ganada: "ganado",
  venta_perdida: "perdido",
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
  primer_contacto: 3,
  calificado: 5,
  propuesta: 7,
  negociacion: 7,
};
