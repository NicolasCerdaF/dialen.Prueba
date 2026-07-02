// Automation Engine — Central registry.
// Triggers, Conditions and Actions are pure metadata + pure evaluator functions.
// New modules add capabilities by pushing entries into these arrays; the executor
// and UI stay untouched. This is the extensibility contract of the engine.

import type { CrmCustomer } from "@/lib/crm.functions";

// ---------------- Types ----------------
export type FieldSpec = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "multiselect" | "duration" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
  optional?: boolean;
  help?: string;
};

export type CatalogEntry<TKind extends string> = {
  type: string;
  kind: TKind;
  label: string;
  description: string;
  category: string;
  icon: string;         // lucide icon name (rendered by UI)
  soon?: boolean;       // "Próximamente" marker
  fields?: FieldSpec[]; // config schema
};

export type TriggerEntry = CatalogEntry<"trigger">;
export type ConditionEntry = CatalogEntry<"condition"> & {
  ops?: { value: string; label: string }[];
};
export type ActionEntry = CatalogEntry<"action">;

// ---------------- Triggers ----------------
export const TRIGGERS: TriggerEntry[] = [
  { type: "message_received", kind: "trigger", category: "Bandeja", icon: "MessageSquare",
    label: "Nuevo mensaje recibido", description: "Se dispara al ingresar un mensaje entrante en cualquier conversación." },
  { type: "customer_created", kind: "trigger", category: "CRM", icon: "UserPlus",
    label: "Cliente creado", description: "Cuando el CRM registra un cliente nuevo (automático o manual)." },
  { type: "stage_changed", kind: "trigger", category: "Embudo", icon: "TrendingUp",
    label: "Cambio de etapa", description: "Al mover un cliente a otra etapa del embudo.",
    fields: [{ key: "to_stage", label: "Nueva etapa (opcional)", type: "text", optional: true, placeholder: "ej. propuesta" }] },
  { type: "assignee_changed", kind: "trigger", category: "CRM", icon: "UserCog",
    label: "Cambio de responsable", description: "Cuando cambia el responsable comercial del cliente." },
  { type: "tags_changed", kind: "trigger", category: "CRM", icon: "Tag",
    label: "Etiquetas modificadas", description: "Al agregar o quitar etiquetas del cliente." },
  { type: "priority_changed", kind: "trigger", category: "CRM", icon: "AlertCircle",
    label: "Cambio de prioridad", description: "Cuando cambia la prioridad comercial." },
  { type: "conversation_resolved", kind: "trigger", category: "Bandeja", icon: "CheckCircle2",
    label: "Conversación resuelta", description: "Al cerrar una conversación." },
  { type: "conversation_reopened", kind: "trigger", category: "Bandeja", icon: "RotateCcw",
    label: "Conversación reabierta", description: "Al reabrir una conversación cerrada." },
  { type: "note_created", kind: "trigger", category: "CRM", icon: "StickyNote",
    label: "Nota interna creada", description: "Cuando un agente agrega una nota al cliente o conversación." },
  { type: "custom_field_updated", kind: "trigger", category: "CRM", icon: "Sliders",
    label: "Campo personalizado actualizado", description: "Al modificar un campo del CRM.",
    fields: [{ key: "field", label: "Campo", type: "text", optional: true, placeholder: "clave del campo" }] },
  { type: "no_response_for", kind: "trigger", category: "Bandeja", icon: "Clock",
    label: "Cliente sin responder", description: "Se dispara si un cliente lleva X minutos sin recibir respuesta.",
    fields: [{ key: "minutes", label: "Minutos sin responder", type: "number", placeholder: "60" }] },
  { type: "manual", kind: "trigger", category: "Manual", icon: "Play",
    label: "Ejecución manual", description: "El flujo solo se dispara desde un botón (útil para pruebas)." },
  // Disparadores de IA (Motor de Inteligencia)
  { type: "ai_high_intent", kind: "trigger", category: "IA", icon: "Sparkles",
    label: "IA detecta alta intención de compra", description: "Se dispara cuando el Agente de Ventas marca el cliente como high_intent o ready_to_close." },
  { type: "ai_churn_risk", kind: "trigger", category: "IA", icon: "AlertTriangle",
    label: "IA detecta riesgo de pérdida", description: "Cuando el Motor de Análisis eleva el churn_risk del cliente por encima del umbral.",
    fields: [{ key: "threshold", label: "Umbral (0-1)", type: "number", placeholder: "0.6" }] },
  { type: "ai_objection_detected", kind: "trigger", category: "IA", icon: "MessageSquare", soon: true,
    label: "IA detecta objeción", description: "Cuando el Agente de Ventas identifica una objeción específica (próximamente enlazable con secuencias de rebatimiento)." },
  // Disparadores de Catálogo
  { type: "product_linked", kind: "trigger", category: "Catálogo", icon: "Package",
    label: "Producto vinculado al cliente", description: "Se dispara cuando un producto se vincula a un cliente desde Bandeja o CRM.",
    fields: [{ key: "product_id", label: "Producto (opcional)", type: "text", placeholder: "uuid del producto" }] },
  { type: "product_low_stock", kind: "trigger", category: "Catálogo", icon: "AlertTriangle", soon: true,
    label: "Producto en bajo stock", description: "Cuando un producto con seguimiento de stock cruza su umbral mínimo." },
  { type: "ai_recommendation_created", kind: "trigger", category: "IA", icon: "Sparkles",
    label: "IA recomienda un producto", description: "Cuando el Motor de Recomendación genera una nueva sugerencia para un cliente.",
    fields: [
      { key: "reason_code", label: "Motivo (opcional)", type: "text", placeholder: "high_intent, churn_rescue, …" },
      { key: "min_score", label: "Score mínimo (0-1)", type: "number", placeholder: "0.5" },
    ] },
  { type: "ai_recommendation_accepted", kind: "trigger", category: "IA", icon: "Sparkles",
    label: "Recomendación aceptada", description: "Cuando un agente acepta una recomendación de la IA." },
  // Cotizaciones
  { type: "quote_created", kind: "trigger", category: "Ventas", icon: "FileText",
    label: "Cotización creada", description: "Se dispara al crear una cotización (manual o generada por IA)." },
  { type: "quote_sent", kind: "trigger", category: "Ventas", icon: "Send",
    label: "Cotización enviada", description: "Cuando una cotización pasa a estado enviada." },
  { type: "quote_viewed", kind: "trigger", category: "Ventas", icon: "Eye",
    label: "Cotización vista por el cliente", description: "Cuando el cliente abre el enlace de la cotización." },
  { type: "quote_accepted", kind: "trigger", category: "Ventas", icon: "CheckCircle2",
    label: "Cotización aceptada", description: "Cuando el cliente acepta la cotización. Mueve el embudo a Venta Ganada." },
  { type: "quote_rejected", kind: "trigger", category: "Ventas", icon: "XCircle",
    label: "Cotización rechazada", description: "Cuando el cliente rechaza la cotización." },
  { type: "quote_expired", kind: "trigger", category: "Ventas", icon: "Clock",
    label: "Cotización expirada", description: "Cuando una cotización vence sin respuesta." },
  // Placeholders — futuras integraciones
  { type: "order_created", kind: "trigger", category: "Ventas", icon: "ShoppingCart", soon: true,
    label: "Pedido creado", description: "Cuando se registre un pedido nuevo." },
  { type: "appointment_booked", kind: "trigger", category: "Agenda", icon: "Calendar", soon: true,
    label: "Cita agendada", description: "Cuando el módulo de Agenda registre una nueva cita." },
];

// ---------------- Conditions ----------------
export const CONDITIONS: ConditionEntry[] = [
  { type: "stage", kind: "condition", category: "CRM", icon: "TrendingUp",
    label: "Etapa del embudo", description: "Filtrar por etapa comercial.",
    ops: [{ value: "eq", label: "es" }, { value: "neq", label: "no es" }],
    fields: [{ key: "value", label: "Etapa", type: "text", placeholder: "ej. propuesta" }] },
  { type: "has_tag", kind: "condition", category: "CRM", icon: "Tag",
    label: "Tiene etiqueta", description: "Filtrar por etiqueta del cliente.",
    ops: [{ value: "has", label: "incluye" }, { value: "not_has", label: "no incluye" }],
    fields: [{ key: "value", label: "Etiqueta", type: "text", placeholder: "vip" }] },
  { type: "priority", kind: "condition", category: "CRM", icon: "AlertCircle",
    label: "Prioridad", description: "Filtrar por prioridad comercial.",
    ops: [{ value: "eq", label: "es" }, { value: "neq", label: "no es" }],
    fields: [{ key: "value", label: "Prioridad", type: "select",
      options: ["low","normal","high","urgent"].map(v => ({ value: v, label: v })) }] },
  { type: "channel", kind: "condition", category: "CRM", icon: "Radio",
    label: "Canal de origen", description: "Filtrar por canal (whatsapp, web, etc).",
    ops: [{ value: "eq", label: "es" }],
    fields: [{ key: "value", label: "Canal", type: "text", placeholder: "whatsapp" }] },
  { type: "assignee_is", kind: "condition", category: "Equipo", icon: "User",
    label: "Responsable", description: "Filtrar por responsable asignado.",
    ops: [{ value: "assigned", label: "asignado" }, { value: "unassigned", label: "sin asignar" }] },
  { type: "estimated_value", kind: "condition", category: "Ventas", icon: "DollarSign",
    label: "Valor estimado", description: "Filtrar por valor estimado del negocio.",
    ops: [{ value: "gt", label: ">" }, { value: "lt", label: "<" }, { value: "eq", label: "=" }],
    fields: [{ key: "value", label: "Valor", type: "number", placeholder: "10000" }] },
  { type: "created_days_ago", kind: "condition", category: "CRM", icon: "Calendar",
    label: "Antigüedad del cliente", description: "Días desde la creación del cliente.",
    ops: [{ value: "gt", label: "más de" }, { value: "lt", label: "menos de" }],
    fields: [{ key: "value", label: "Días", type: "number", placeholder: "7" }] },
  { type: "last_interaction_days", kind: "condition", category: "CRM", icon: "Clock",
    label: "Días desde última interacción", description: "Filtro por inactividad.",
    ops: [{ value: "gt", label: "más de" }, { value: "lt", label: "menos de" }],
    fields: [{ key: "value", label: "Días", type: "number", placeholder: "3" }] },
  { type: "keyword_in_message", kind: "condition", category: "Bandeja", icon: "Search",
    label: "Palabra clave en mensaje", description: "El evento incluye estas palabras.",
    ops: [{ value: "contains", label: "contiene" }, { value: "not_contains", label: "no contiene" }],
    fields: [{ key: "value", label: "Palabras (coma)", type: "text", placeholder: "precio, cotizar" }] },
  { type: "business_hours", kind: "condition", category: "Tiempo", icon: "Clock",
    label: "Horario comercial", description: "Se cumple dentro de un rango horario.",
    ops: [{ value: "within", label: "dentro de" }, { value: "outside", label: "fuera de" }],
    fields: [
      { key: "from", label: "Desde (HH:mm)", type: "text", placeholder: "09:00" },
      { key: "to", label: "Hasta (HH:mm)", type: "text", placeholder: "18:00" },
    ] },
  { type: "wait_days", kind: "condition", category: "Tiempo", icon: "Hourglass",
    label: "Días de espera", description: "El cliente lleva N días esperando.",
    ops: [{ value: "gt", label: "más de" }],
    fields: [{ key: "value", label: "Días", type: "number", placeholder: "2" }] },
  { type: "custom_field", kind: "condition", category: "CRM", icon: "Sliders",
    label: "Campo personalizado", description: "Filtrar por un campo del CRM.",
    ops: [{ value: "eq", label: "es" }, { value: "neq", label: "no es" }, { value: "contains", label: "contiene" }],
    fields: [
      { key: "field", label: "Campo", type: "text", placeholder: "clave" },
      { key: "value", label: "Valor", type: "text" },
    ] },
];

// ---------------- Actions ----------------
export const ACTIONS: ActionEntry[] = [
  // ---- Implementadas ----
  { type: "set_stage", kind: "action", category: "Embudo", icon: "TrendingUp",
    label: "Mover a etapa", description: "Cambia la etapa del cliente en el embudo.",
    fields: [{ key: "stage", label: "Etapa destino", type: "text", placeholder: "propuesta" }] },
  { type: "assign_owner", kind: "action", category: "Equipo", icon: "UserCog",
    label: "Asignar responsable", description: "Define el responsable comercial del cliente.",
    fields: [{ key: "assignee_id", label: "ID del responsable (UUID)", type: "text", optional: true, help: "Vacío = sin responsable" }] },
  { type: "add_tag", kind: "action", category: "CRM", icon: "Tag",
    label: "Agregar etiqueta", description: "Agrega una etiqueta al cliente.",
    fields: [{ key: "tag", label: "Etiqueta", type: "text", placeholder: "seguimiento" }] },
  { type: "remove_tag", kind: "action", category: "CRM", icon: "TagX",
    label: "Quitar etiqueta", description: "Remueve una etiqueta del cliente.",
    fields: [{ key: "tag", label: "Etiqueta", type: "text", placeholder: "seguimiento" }] },
  { type: "set_priority", kind: "action", category: "CRM", icon: "AlertCircle",
    label: "Cambiar prioridad", description: "Actualiza la prioridad comercial.",
    fields: [{ key: "priority", label: "Prioridad", type: "select",
      options: ["low","normal","high","urgent"].map(v => ({ value: v, label: v })) }] },
  { type: "create_note", kind: "action", category: "CRM", icon: "StickyNote",
    label: "Crear nota interna", description: "Agrega una nota al cliente (visible para el equipo).",
    fields: [{ key: "body", label: "Contenido", type: "textarea", placeholder: "Cliente calificado por IA…" }] },
  { type: "set_ai_paused", kind: "action", category: "IA", icon: "Bot",
    label: "Pausar o reactivar IA", description: "Pausa/reactiva la respuesta automática de la IA en las conversaciones del cliente.",
    fields: [{ key: "paused", label: "Estado", type: "select",
      options: [{ value: "true", label: "Pausar" }, { value: "false", label: "Reactivar" }] }] },
  { type: "update_custom_field", kind: "action", category: "CRM", icon: "Sliders",
    label: "Actualizar campo personalizado", description: "Escribe un valor en un campo del CRM.",
    fields: [
      { key: "field", label: "Campo", type: "text", placeholder: "clave" },
      { key: "value", label: "Valor", type: "text" },
    ] },
  { type: "run_ai_orchestration", kind: "action", category: "IA", icon: "Sparkles",
    label: "Ejecutar orquestador de IA", description: "Fuerza un ciclo de IA (análisis + recomendaciones) sobre el cliente del evento.",
    fields: [
      { key: "force", label: "Forzar aunque no haya cambios", type: "boolean", optional: true },
    ] },
  // ---- Preparadas (arquitectura lista) ----
  { type: "send_whatsapp_message", kind: "action", category: "Mensajería", icon: "Send",
    label: "Enviar mensaje de WhatsApp", description: "Envía un mensaje al cliente por WhatsApp.",
    soon: true,
    fields: [
      { key: "body", label: "Mensaje", type: "textarea", placeholder: "Hola {{cliente.nombre}}…" },
      { key: "template", label: "Plantilla (opcional)", type: "text", optional: true },
    ] },
  { type: "create_task", kind: "action", category: "Operación", icon: "CheckSquare", soon: true,
    label: "Crear tarea de seguimiento", description: "Genera una tarea asignada al responsable.",
    fields: [
      { key: "title", label: "Título", type: "text" },
      { key: "due_in_hours", label: "Vence en (h)", type: "number", optional: true },
    ] },
  { type: "schedule_follow_up", kind: "action", category: "CRM", icon: "Bell", soon: true,
    label: "Programar seguimiento", description: "Marca una próxima actividad en el CRM.",
    fields: [{ key: "in_hours", label: "En (horas)", type: "number", placeholder: "24" }] },
  { type: "create_opportunity", kind: "action", category: "Ventas", icon: "TrendingUp", soon: true,
    label: "Crear oportunidad", description: "Registra una oportunidad comercial." },
  // ---- Próximamente (a la espera de módulos) ----
  { type: "create_quote", kind: "action", category: "Ventas", icon: "FileText", soon: true,
    label: "Crear cotización", description: "Cuando se construya el módulo de Cotizaciones." },
  { type: "create_order", kind: "action", category: "Ventas", icon: "ShoppingCart", soon: true,
    label: "Generar pedido", description: "Cuando exista el módulo de Pedidos." },
  { type: "book_meeting", kind: "action", category: "Agenda", icon: "Calendar", soon: true,
    label: "Programar reunión", description: "Integración futura con Agenda." },
  { type: "start_campaign", kind: "action", category: "Marketing", icon: "Megaphone", soon: true,
    label: "Iniciar campaña", description: "Integración futura con Campañas." },
  { type: "issue_invoice", kind: "action", category: "Facturación", icon: "Receipt", soon: true,
    label: "Emitir factura", description: "Integración futura con Facturación." },
  { type: "call_webhook", kind: "action", category: "Integraciones", icon: "Webhook", soon: true,
    label: "Ejecutar webhook", description: "Llamada HTTP saliente configurable.",
    fields: [
      { key: "url", label: "URL", type: "text" },
      { key: "method", label: "Método", type: "select",
        options: ["GET","POST","PUT","PATCH","DELETE"].map(v => ({ value: v, label: v })) },
    ] },
  { type: "call_external_api", kind: "action", category: "Integraciones", icon: "Cable", soon: true,
    label: "Consumir API externa", description: "Conector genérico a APIs externas." },
  { type: "run_ai_agent", kind: "action", category: "IA", icon: "Sparkles", soon: true,
    label: "Ejecutar agente de IA", description: "Delega a un agente especializado (comercial, soporte, cobranza…)." },
];

// Lookups
export const TRIGGER_BY_TYPE = Object.fromEntries(TRIGGERS.map(t => [t.type, t])) as Record<string, TriggerEntry>;
export const CONDITION_BY_TYPE = Object.fromEntries(CONDITIONS.map(t => [t.type, t])) as Record<string, ConditionEntry>;
export const ACTION_BY_TYPE = Object.fromEntries(ACTIONS.map(t => [t.type, t])) as Record<string, ActionEntry>;

// ---------------- Flow shape ----------------
export type FlowTrigger = { type: string; config?: Record<string, any> };
export type FlowCondition = { type: string; op?: string; config?: Record<string, any> };
export type FlowAction = { type: string; config?: Record<string, any> };

export type FlowDefinition = {
  trigger: FlowTrigger;
  conditions: FlowCondition[];
  actions: FlowAction[];
};

// ---------------- Condition evaluator (pure) ----------------
// The engine keeps evaluation logic in one place so the executor stays simple
// and new modules can extend by adding an entry to CONDITIONS + a case here.
export function evaluateConditions(
  customer: CrmCustomer,
  conditions: FlowCondition[],
  ctx: { message_body?: string; now?: Date } = {},
): { pass: boolean; failedAt?: number; reason?: string } {
  const now = ctx.now ?? new Date();
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i];
    const cfg = c.config ?? {};
    const op = c.op ?? "eq";
    const pass = (() => {
      switch (c.type) {
        case "stage": {
          const v = String(cfg.value ?? "").trim();
          return op === "neq" ? customer.stage !== v : customer.stage === v;
        }
        case "has_tag": {
          const tags = customer.tags ?? [];
          const v = String(cfg.value ?? "").trim();
          return op === "not_has" ? !tags.includes(v) : tags.includes(v);
        }
        case "priority":
          return op === "neq" ? customer.priority !== cfg.value : customer.priority === cfg.value;
        case "channel":
          return customer.channel === cfg.value;
        case "assignee_is":
          return op === "unassigned" ? !customer.assignee_id : !!customer.assignee_id;
        case "estimated_value": {
          const v = Number(cfg.value ?? 0);
          const cur = Number(customer.estimated_value ?? 0);
          if (op === "gt") return cur > v;
          if (op === "lt") return cur < v;
          return cur === v;
        }
        case "created_days_ago": {
          const d = daysBetween(customer.created_at, now);
          const v = Number(cfg.value ?? 0);
          return op === "lt" ? d < v : d > v;
        }
        case "last_interaction_days": {
          if (!customer.last_interaction_at) return op === "gt";
          const d = daysBetween(customer.last_interaction_at, now);
          const v = Number(cfg.value ?? 0);
          return op === "lt" ? d < v : d > v;
        }
        case "wait_days": {
          const src = customer.last_interaction_at ?? customer.created_at;
          const d = daysBetween(src, now);
          return d > Number(cfg.value ?? 0);
        }
        case "keyword_in_message": {
          const text = (ctx.message_body ?? "").toLowerCase();
          const words = String(cfg.value ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
          const hit = words.some(w => text.includes(w));
          return op === "not_contains" ? !hit : hit;
        }
        case "business_hours": {
          const from = parseHm(String(cfg.from ?? "09:00"));
          const to = parseHm(String(cfg.to ?? "18:00"));
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const within = nowMin >= from && nowMin <= to;
          return op === "outside" ? !within : within;
        }
        case "custom_field": {
          const fields = (customer.custom_fields ?? {}) as Record<string, unknown>;
          const val = fields[String(cfg.field ?? "")];
          const target = cfg.value;
          if (op === "contains") return String(val ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
          if (op === "neq") return String(val ?? "") !== String(target ?? "");
          return String(val ?? "") === String(target ?? "");
        }
        default:
          return true; // unknown condition = no-op (forward-compatible)
      }
    })();
    if (!pass) return { pass: false, failedAt: i, reason: `Condición #${i + 1} (${c.type}) no cumplida` };
  }
  return { pass: true };
}

function daysBetween(iso: string, now: Date) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
function parseHm(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
