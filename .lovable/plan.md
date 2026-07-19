## Plan de Refactorización y Optimización — Dialen

Objetivo: dejar el sistema listo para producción real (100+ conversaciones activas, múltiples usuarios, uptime alto) sin agregar features nuevas. Solo estabilidad, velocidad, mantenibilidad y seguridad.

---

### Estado actual (auditoría rápida)

- 3 rutas gigantes: `index.tsx` (1795 líneas), `clientes.$id.tsx` (1349), `automatizaciones.tsx` (945).
- `quotes.functions.ts` con 940 líneas mezcla CRUD, IA, PDF y envío.
- 0% tests, sin límites de tasa, sin monitoreo de errores en cliente.
- 14 warnings del linter de DB (extensiones en `public`, funciones `SECURITY DEFINER` ejecutables por anon/authenticated).
- Bundle no auditado: probablemente pdfjs + mammoth se cargan siempre.

---

### Etapa 1 — Higiene y seguridad de base de datos (bajo riesgo, alto impacto)

1. Mover `pg_net` y `vector` fuera del schema `public` a `extensions`.
2. Revocar `EXECUTE` público sobre funciones `SECURITY DEFINER` que no deben ser llamadas por clientes (dejar solo `has_role` y las estrictamente necesarias).
3. Auditar policies RLS: confirmar que cada tabla exige `company_id = current company` y no solo `auth.uid() is not null`.
4. Añadir índices faltantes detectados por `slow_queries` (después de medir, no antes).
5. Añadir `CHECK` constraints en columnas críticas (estados enum tipo texto).

**Entregable:** linter en 0 warnings críticos, migración única revisable.

---

### Etapa 2 — Descomposición de rutas gigantes

Regla: ningún archivo de ruta debe superar ~400 líneas. Extraer a `src/components/<modulo>/`.

1. **`src/routes/index.tsx` (Bandeja, 1795 líneas)** → dividir en:
   - `inbox/conversation-list.tsx`
   - `inbox/conversation-header.tsx`
   - `inbox/message-composer.tsx`
   - `inbox/crm-sidebar.tsx` (ya parcial)
   - `inbox/ai-suggestions-panel.tsx`
   - `inbox/quote-status-badge.tsx`
   - Hooks: `useInboxRealtime`, `useConversationMessages`.

2. **`src/routes/clientes.$id.tsx` (1349 líneas)** → tabs a archivos separados:
   - `customer/tab-overview.tsx`
   - `customer/tab-activity.tsx`
   - `customer/tab-quotes.tsx`
   - `customer/tab-notes.tsx`
   - `customer/tab-recommendations.tsx`

3. **`src/routes/automatizaciones.tsx` (945 líneas)** → separar:
   - `automations/builder.tsx`
   - `automations/recipes-tab.tsx`
   - `automations/history-tab.tsx`
   - `automations/node-inspector.tsx`

4. **`src/lib/quotes.functions.ts` (940 líneas)** → separar:
   - `quotes/crud.functions.ts`
   - `quotes/ai-draft.functions.ts`
   - `quotes/send.functions.ts`
   - `quotes/pdf.server.ts`

**Entregable:** archivos < 400 líneas, tsgo verde, comportamiento idéntico.

---

### Etapa 3 — Rendimiento cliente (percepción)

1. **Code splitting real por ruta pesada:** `pdfjs-dist` y `mammoth` a import dinámico solo cuando el usuario sube un documento (`/conocimiento`).
2. **React Query:** subir `staleTime` en listas frías (clientes, catálogo) a 60s; `gcTime` a 5min; deshabilitar `refetchOnWindowFocus` en tablas grandes.
3. **Memoización:** `React.memo` en `CustomerCard`, `ConversationRow`, `MessageBubble`. `useMemo` en filtros/derivados de listas.
4. **Suspense boundaries** por panel en la bandeja para que el chat abra antes de que carguen sugerencias IA.
5. **Debounce** en inputs de búsqueda (CRM, catálogo) a 250ms.
6. **Preload** de la ruta más navegada (`/embudo`, `/clientes`) con `Link` `preload="intent"`.

**Entregable:** LCP < 2s en `/`, interacciones < 100ms.

---

### Etapa 4 — Rendimiento backend y consultas

1. Ejecutar `slow_queries`, tomar top 10, correr `EXPLAIN ANALYZE`, añadir índices dirigidos.
2. Reemplazar consultas N+1 en dashboard/metrics por vistas materializadas o RPCs agregadas.
3. Añadir paginación real (cursor) en:
   - Lista de conversaciones (hoy `limit(100)`, sin siguiente página).
   - Mensajes por conversación (hoy `limit(80)`, sin infinite scroll hacia atrás).
   - Lista de clientes y cotizaciones.
4. Cache de embeddings en `knowledge_chunks` — verificar que no se regeneren en re-subida idéntica (hash del contenido).

**Entregable:** ninguna consulta > 300ms P95 en operaciones cotidianas.

---

### Etapa 5 — Resiliencia de IA y jobs

1. Deadletter queue para llamadas IA fallidas (tabla `ai_failures` + reintento manual).
2. Idempotency keys en `automation_runs` y `quote_events` (evitar doble ejecución si el cron se atrasa).
3. Circuit breaker en `ai-fetch.ts`: si el gateway falla 5 veces en 1min, pausar IA 2min y avisar en UI.
4. Timeouts explícitos en todas las server functions (no solo IA).
5. Logging estructurado (`logger.ts`) enviado a un destino real (por definir: Cloudflare Logs, o tabla `system_logs`).

**Entregable:** ningún error de IA rompe el flujo del usuario; todos quedan trazables.

---

### Etapa 6 — Tipos, contratos y calidad

1. Eliminar todos los `as any` (hoy hay ~30, incluyendo el nuevo `VirtualMessageList messages={messages as any}`).
2. Tipos derivados de `Database` de Supabase en vez de manuales.
3. Zod en toda entrada de server function (`inputValidator`), no solo algunas.
4. ESLint estricto: `no-explicit-any`, `no-floating-promises`, `exhaustive-deps`.
5. Prettier + import sorting unificados.

**Entregable:** `tsgo --noEmit` y `eslint` verdes en modo estricto.

---

### Etapa 7 — Testing mínimo viable

No apuntamos a 80% coverage. Solo cubrir los caminos que si se rompen tumban el negocio:

1. Unit tests (`vitest`) para:
   - `recommender` (scoring).
   - `ai-orchestrator` (debounce, no duplicados).
   - `quotes.functions` (unicidad de cotización activa, IVA global).
   - `pipeline` (mapping legacy → 5 stages).
2. Integración server (mock Supabase): un flujo end-to-end mensaje → análisis → cotización → envío.
3. Un smoke test Playwright: login → abrir chat → responder → ver métricas.

**Entregable:** ~30 tests, ejecutables en CI < 60s.

---

### Etapa 8 — Observabilidad y operación

1. Página `/admin/health` (solo rol admin) con: últimos errores IA, ejecuciones de cron, colas pendientes.
2. Sentry o equivalente en cliente y server (feature flag por env).
3. Métricas de negocio expuestas: mensajes/día, cotizaciones/día, tasa de aceptación IA (ya existe la UI en `/metricas-ia`, falta persistencia histórica).
4. Backup verificable de datos críticos (export CSV programado semanal).

**Entregable:** cualquier problema en producción es diagnosticable en < 5 min.

---

### Orden de ejecución sugerido

```text
Semana 1: Etapa 1 (DB) + Etapa 2.1 (bandeja)
Semana 2: Etapa 2.2–2.4 (resto de refactor)
Semana 3: Etapa 3 + 4 (performance)
Semana 4: Etapa 5 + 6 (resiliencia y tipos)
Semana 5: Etapa 7 + 8 (tests y observabilidad)
```

Cada etapa es independiente y desplegable por separado. Si en algún momento pides "sigue", arranco por la Etapa 1 salvo que indiques otra.

---

### Fuera de alcance de este plan

- Nuevas features (multi-usuario avanzado, plantillas WhatsApp, billing).
- Migración a otro stack.
- Rediseño visual (solo ajustes finos que emerjan al descomponer componentes).
