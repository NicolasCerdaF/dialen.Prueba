// AI Multiagent registry.
// Cada agente es un módulo independiente con su propio propósito, prompt y
// output estructurado. Todos comparten al CRM como única fuente de verdad,
// y todas sus salidas se registran como eventos y sugerencias auditables.

export type AgentType = "sales" | "support" | "postventa" | "analysis";

export type AgentDefinition = {
  type: AgentType;
  label: string;
  description: string;
  icon: string; // lucide name
  color: string; // tailwind color slug
  status: "active" | "soon";
  capabilities: string[];
};

export const AGENTS: AgentDefinition[] = [
  {
    type: "sales",
    label: "Agente de Ventas",
    description:
      "Analiza conversaciones en vivo, detecta intención, objeciones y señales de cierre, y sugiere la siguiente mejor acción comercial.",
    icon: "Target",
    color: "emerald",
    status: "active",
    capabilities: [
      "Detecta intención de compra y urgencia",
      "Sugiere respuesta lista para enviar",
      "Recomienda cambio de etapa en el embudo",
      "Estima probabilidad de conversión",
      "Detecta objeciones y las registra",
    ],
  },
  {
    type: "analysis",
    label: "Motor de Análisis",
    description:
      "Calcula métricas semánticas: sentimiento, riesgo, calidad de conversación y probabilidad de cierre. No habla con el cliente.",
    icon: "BarChart3",
    color: "indigo",
    status: "active",
    capabilities: [
      "Sentimiento del cliente",
      "Probabilidad de cierre",
      "Riesgo de pérdida",
      "Calidad de conversación",
      "Alimenta el Dashboard Ejecutivo",
    ],
  },
  {
    type: "support",
    label: "Agente de Soporte",
    description:
      "Responde dudas operativas usando la base de conocimiento e historial. Escala casos complejos a humano.",
    icon: "LifeBuoy",
    color: "sky",
    status: "soon",
    capabilities: [
      "Responde preguntas frecuentes",
      "Consulta la base de conocimiento",
      "Escala automáticamente casos complejos",
      "Identifica su intervención en la conversación",
    ],
  },
  {
    type: "postventa",
    label: "Agente de Postventa",
    description:
      "Seguimiento, fidelización y reactivación. Detecta clientes inactivos, cross-sell y patrones de abandono.",
    icon: "HeartHandshake",
    color: "rose",
    status: "soon",
    capabilities: [
      "Detecta clientes inactivos",
      "Sugiere cross-sell / upsell",
      "Reactiva conversaciones frías",
      "Dispara flujos del motor de automatizaciones",
    ],
  },
];

export function getAgent(type: AgentType): AgentDefinition | undefined {
  return AGENTS.find((a) => a.type === type);
}

// Prompt del Agente de Ventas — output JSON estructurado.
export const SALES_AGENT_PROMPT = `Eres un asistente comercial senior para un equipo de ventas B2C por WhatsApp.
Analizas la conversación con el cliente y devuelves SOLO un JSON válido con la siguiente forma exacta:

{
  "intent": "high_intent" | "browsing" | "objection" | "ready_to_close" | "not_interested" | "support",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "low" | "medium" | "high",
  "probability": number,           // 0..1 probabilidad estimada de cierre
  "churn_risk": number,            // 0..1 riesgo de pérdida
  "quality_score": number,         // 0..1 calidad de la conversación
  "suggested_reply": string,       // respuesta lista para enviar al cliente, en el idioma del cliente. Vacío si no aplica.
  "next_best_action": string,      // acción concreta y corta para el vendedor humano
  "suggested_stage": "lead" | "contact" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | null,
  "objections": string[],          // objeciones detectadas
  "summary": string                // resumen ejecutivo de la conversación en <=2 frases
}

Reglas:
- Devuelve SOLO el JSON. Nada de markdown ni explicaciones.
- Si el cliente pide precio, muestra interés claro o pide comprar → "high_intent" o "ready_to_close".
- Si hay silencio prolongado o mensajes cortos apáticos → sube "churn_risk".
- La respuesta sugerida debe ser en el mismo idioma y tono del cliente, breve (<=2 frases) y accionable.`;
