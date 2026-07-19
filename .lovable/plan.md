## Objetivo

Dejar cada botón de la app en estado **funcional**: ejecuta la acción real en backend, da feedback visual (loading + toast), y pide confirmación cuando la acción es destructiva o irreversible.

## Definición de "funcional" (checklist por botón)

Cada botón auditado debe cumplir:
1. **Acción real**: llama a un `serverFn` o mutación existente, sin `TODO`, `console.log`, ni `onClick` vacío.
2. **Feedback**: `disabled` mientras corre, spinner/loading state, `toast.success` / `toast.error` con mensaje claro en español.
3. **Confirmación** en acciones destructivas o irreversibles (borrar, enviar cotización, cambiar estado a "Perdido/Cerrado", desconectar WhatsApp, invitar/expulsar miembro, borrar documento de conocimiento, etc.) usando `AlertDialog`.
4. **Invalidación de cache**: `queryClient.invalidateQueries` de las keys afectadas para que la UI refleje el cambio sin recargar.
5. **Navegación coherente**: si el botón lleva a otro módulo, usar `<Link to>` de TanStack con `params`, no `<a href>` ni interpolación.

## Metodología

Por cada ruta:
1. Listar cada botón/acción visible (incluye íconos clickables, menús contextuales, badges accionables).
2. Marcar estado actual: **OK** / **Placeholder** (no hace nada) / **Roto** (falla o inconsistente) / **Sin confirmación** / **Sin feedback**.
3. Aplicar fix mínimo según el checklist.
4. Verificar con Playwright + revisión de red/consola en los flujos críticos.

## Fases de ejecución

Priorizadas por impacto en el flujo comercial (mensaje → cotización → cierre).

### Fase 1 — Core comercial (bloqueante para vender)
Rutas: `index.tsx` (Conversaciones), `bandeja-ia.tsx`, `cotizaciones.tsx`, `cotizaciones.$id.tsx`, `catalogo.tsx`.

Botones típicos a revisar:
- Conversaciones: Responder, Sugerir con IA, Asignar, Cambiar estado, Marcar leída, Crear cotización, Enviar cotización por WhatsApp, Añadir nota interna, Abrir cliente.
- Bandeja IA: Aceptar sugerencia, Descartar, Ir a conversación, Marcar resuelta.
- Cotizaciones: Nueva, Duplicar, Enviar, Marcar aceptada/rechazada, Nueva versión, Descargar PDF, Copiar link.
- Catálogo: Nuevo producto, Editar, Ajustar stock, Activar/desactivar, Duplicar, Borrar.

### Fase 2 — CRM y pipeline
Rutas: `clientes.tsx`, `clientes.$id.tsx`, `contactos.tsx`, `contactos.$id.tsx`, `embudo.tsx`, `oportunidades.tsx`.

Botones típicos: Editar cliente, Añadir nota, Añadir etiqueta, Cambiar etapa, Marcar oportunidad ganada/perdida, Abrir conversación asociada, Crear cotización desde cliente.

### Fase 3 — IA y automatización
Rutas: `director-ia.tsx`, `automatizaciones.tsx`, `conocimiento.tsx`, `metricas-ia.tsx`.

Botones típicos: Aplicar recomendación del director, Activar/pausar automatización, Duplicar, Probar flujo, Ver historial, Subir documento, Reindexar, Borrar documento, Playground RAG.

### Fase 4 — Reportes, canal y administración
Rutas: `dashboard.tsx`, `dashboard-ejecutivo.tsx`, `whatsapp.tsx`, `onboarding.whatsapp.tsx`, `configuracion.tsx`.

Botones típicos: Refrescar canal, Reenviar plantilla, Probar mensaje, Volver en onboarding, Invitar miembro, Cambiar rol, Expulsar miembro, Cerrar sesión, Actualizar empresa, Guardar preferencias.

## Entregable por módulo

Al ejecutar cada fase, se produce un mini-reporte en el chat con:
- Tabla `Botón | Estado antes | Fix aplicado`.
- Lista de acciones destructivas que ahora piden confirmación.
- Verificación (screenshot o log) del flujo más crítico del módulo.

## Detalles técnicos

- Toasts vía `sonner` (`toast.success`, `toast.error`, `toast.promise` para operaciones largas).
- Confirmaciones vía `AlertDialog` de shadcn (envolver el botón destructivo con `AlertDialogTrigger`).
- Mutaciones: `useMutation` + `useServerFn` con `onSuccess` invalidando queries y `onError` mostrando el mensaje del backend.
- Botones que abren flujos largos (enviar cotización, subir documento) usan `toast.promise({ loading, success, error })`.
- No se crean nuevas server functions salvo que un botón hoy no tenga backend detrás; en ese caso se documenta explícitamente antes de agregarla.
- Sin cambios de esquema DB ni de lógica de negocio: solo cableado UI ↔ backend existente.

## Fuera de alcance

- Rediseño visual.
- Nuevos features.
- Cambios en RLS / migraciones.
- Refactor de rutas gigantes (eso vive en `.lovable/plan.md`, Etapa 2).

## Orden sugerido de ejecución

```text
1. Fase 1 (core comercial)  →  el flujo de venta queda 100% clickeable
2. Fase 2 (CRM/pipeline)    →  gestión de clientes y oportunidades
3. Fase 3 (IA/automatización) →  acciones de inteligencia
4. Fase 4 (admin/canal)     →  configuración y WhatsApp
```

Al aprobar, empiezo por **Fase 1**.
