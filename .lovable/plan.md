
# Flujo Real de Venta Dialen — Comportamiento Core

Objetivo: convertir Dialen en una máquina que reduce el tiempo entre **mensaje → cotización → cierre** por WhatsApp. **No se crean módulos nuevos**; solo se refactoriza el comportamiento existente para eliminar fricción.

## Alcance

Cambios de comportamiento en 4 superficies existentes:
1. **Bandeja** (`src/routes/index.tsx`) — panel lateral IA reforzado.
2. **Orquestador IA** (`src/lib/ai-orchestrator.functions.ts`) — decide cuándo autogenerar cotización.
3. **Cotizaciones** (`src/lib/quotes.functions.ts`) — soporta modo "auto-draft" desde IA.
4. **Automatizaciones — recetas** (`src/routes/automatizaciones.tsx`) — receta de follow-up de cotización no vista, activable en 1 click.

Sin nuevas tablas, sin nuevas rutas, sin dashboards adicionales.

## Cambios de comportamiento

### 1. IA obligatoria en cada conversación
- Al abrir una conversación en la bandeja, el sidebar derecho muestra siempre 3 bloques en este orden:
  1. **Intención + probabilidad de compra** (badge grande con color por umbral).
  2. **Producto recomendado** (top 1 del recommender, con botón "Adjuntar a cotización").
  3. **Respuesta lista para enviar** (borrador IA — un click envía por WhatsApp).
- Si aún no hay análisis IA, se dispara `orchestrateCustomer` al abrir la conversación (además del listener actual de mensajes entrantes).

### 2. Cotización automática (auto-draft)
Umbral: `ai_insights.probability >= 0.7` **Y** existe recomendación activa **Y** cliente activo (mensaje entrante en las últimas 24h) **Y** no existe cotización `draft`/`sent` en las últimas 48h para ese cliente.

Cuando el orquestador detecta esas condiciones tras un mensaje entrante:
- Llama a `generateQuoteDraft` con las top 1–3 recomendaciones.
- Registra evento `quote_auto_drafted` en `customer_events`.
- En la bandeja, el panel "Cotizaciones" del sidebar muestra el draft con badge **"IA generó una cotización"** y dos acciones: **Enviar por WhatsApp** (usa `sendQuoteFromConversation`) y **Editar**.

Nada se envía sin acción humana explícita — el auto-draft solo abre el borrador; el vendedor cierra con 1 click.

### 3. Follow-up automático de cotización no vista
Se agrega una **receta** al tab Recetas existente: *"Follow-up cotización sin abrir (24h)"*.
- Trigger: `quote_sent` + condición `hours_since_sent >= 24` + `quote_status != viewed/accepted/rejected`.
- Acción: crear una **sugerencia** en el sidebar de la bandeja (no envía sola). El operador ve una tarjeta "Recordatorio listo" con mensaje pre-redactado tipo *"Hola {nombre}, ¿pudiste revisar la cotización que te envié?"* y un botón **Enviar**.
- Reutiliza el motor de automatizaciones actual y `ai_suggestions` para persistir el borrador — sin tablas nuevas.

### 4. Catálogo → chat en 1 click
- En el sidebar de bandeja, el bloque "Producto recomendado" pasa a ser el punto de entrada principal al catálogo. Debajo, un buscador compacto de productos (`products` filtrado por `ai_recommendable` primero) con acción única: **"Agregar y cotizar"** → crea draft si no existe, o agrega ítem al draft actual.
- Los productos con flag `ai_recommendable` se muestran primero y con badge.

### 5. Embudo = espejo (solo lectura operativa)
- Se retira el drag-and-drop del Kanban en `embudo.tsx`. Las tarjetas se vuelven read-only con link al cliente.
- El stage sigue actualizándose automáticamente por eventos (cotización aceptada → `venta_ganada`, etc.) — la lógica ya existe.
- Los 5 estados actuales se mantienen: Nuevo → Interesado → Cotizado → Negociando → Ganado.

### 6. Métrica única visible
En el header de la Bandeja (no un dashboard nuevo), se muestra un único KPI en vivo:
**Tiempo medio mensaje → cotización enviada (últimos 7 días)**.
Se calcula desde `customer_events` (`message_received` → `quote_sent_from_conversation`). Reutiliza `metrics.functions.ts` — sin tabla nueva.

## Cambios técnicos por archivo

- `src/lib/ai-orchestrator.functions.ts`: agregar rama `maybeAutoDraftQuote(customerId)` tras el análisis IA; respeta debounce actual.
- `src/lib/quotes.functions.ts`: exponer `autoDraftFromRecommendations({ customerId, source: 'ai_auto' })` que envuelve `generateQuoteDraft` con logging del evento `quote_auto_drafted`.
- `src/lib/automations/registry.ts` + `automations.functions.ts`: agregar action `create_followup_suggestion` que inserta en `ai_suggestions`.
- `src/routes/index.tsx` (Bandeja):
  - Reordenar sidebar derecho: Intención → Producto recomendado → Respuesta lista → Cotizaciones → Follow-ups.
  - Agregar buscador compacto de catálogo con "Agregar y cotizar".
  - Header con KPI "tiempo medio mensaje → cotización".
  - Disparar orquestador on-open.
- `src/routes/embudo.tsx`: quitar handlers de drag; tarjetas read-only.
- `src/routes/automatizaciones.tsx`: agregar la receta "Follow-up cotización sin abrir".

## Fuera de alcance (restricciones respetadas)
- No se crean tablas, rutas, dashboards ni módulos.
- No se toca el backend de IA (agentes, scoring, insights) — solo se consumen sus señales.
- No se expande CRM ni se duplica lógica en pipelines paralelos.
- El constructor libre de automatizaciones se mantiene.

## Riesgos
- Auto-draft repetitivo → mitigado por ventana de 48h y bloqueo si existe draft activo.
- Costo IA por análisis on-open → mitigado por el debounce/snapshot ya implementado en el orquestador.

¿Apruebas para ejecutar?
