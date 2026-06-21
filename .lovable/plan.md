…

# Plan: Dialen 100% funcional — en fases

Objetivo: dejar la plataforma operando de extremo a extremo aunque todavía no tengas el WhatsApp Business API completamente aprobado por Meta. Cada fase entrega valor real por sí sola.

---

## Estado actual (auditoría rápida)

Ya hecho:
- Branding "Dialen by Nova Corp".
- Auth con Google + email.
- Tablas: companies, profiles, user_roles, customers, conversations, messages, whatsapp_channels, knowledge_documents, ai_suggestions, sales_links.
- Embedded Signup de Meta con logs de depuración + página `/debug/whatsapp`.
- Webhook `/api/public/whatsapp/webhook` recibiendo mensajes y guardándolos.
- IA real con Gemini 3 Flash + 4 estilos (formal / cercano / vendedor / soporte) respondiendo automáticamente.
- Dashboard de métricas con datos reales.
- Configuración de estilo IA con vista previa.

Lo que **falta** para "100% funcional":
1. **Modo demo / sandbox** — para que el usuario pruebe TODO sin tener aún el número de Meta aprobado.
2. **Bandeja de conversaciones** (inbox) — hoy se guardan mensajes pero no hay UI para verlos / responder manualmente.
3. **Base de conocimiento usada de verdad por la IA** — hoy se suben documentos pero el webhook no los inyecta al prompt.
4. **Envío manual + plantillas** desde la UI (probar envío, responder un cliente).
5. **Onboarding guiado de 1 minuto** post-registro.
6. **Health-check del canal** (token expirado, webhook no verificado, etc.) visible para el usuario.
7. **Calendario / agendamiento** (Google Calendar) — pendiente desde el plan anterior.
8. **Hardening**: cifrado de `access_token`, RLS revisada, manejo de errores 402/429 de Lovable AI visible al usuario.

---

## Fase 1 — Modo Demo (desbloquea uso inmediato sin Meta)  [PRIORIDAD MÁXIMA]

Para que el usuario use Dialen **hoy** aunque Meta no haya aprobado su número.

- Toggle "Modo demo" en `/configuracion` (per-company).
- Simulador de chat en `/demo-chat`: el usuario escribe como si fuera un cliente, se guarda en `conversations` con un `channel_id` virtual, y la IA responde con el estilo configurado.
- Misma lógica `maybeAutoReply` que producción → lo que pruebe en demo es exactamente lo que verá en WhatsApp real.
- Banner global "Estás en modo demo" hasta que conecte WhatsApp real.

Entregable: el usuario puede ver la IA contestar con su estilo, su tono y su conocimiento — sin Meta.

---

## Fase 2 — Bandeja de conversaciones (Inbox)

UI tipo WhatsApp Web:
- Ruta `/conversaciones`: lista a la izquierda (último mensaje, no leídos), chat a la derecha.
- Realtime con Supabase Realtime (`postgres_changes` en `messages`).
- Botón "Tomar control" → pausa la IA en esa conversación (campo `ai_paused` en conversations) y permite responder manualmente.
- Envío manual a través de `sendWhatsAppMessage` server fn (Graph API si es real, no-op si es demo).
- Marcar como resuelto / reabrir.

---

## Fase 3 — Conocimiento real (RAG simple)

Hoy `knowledge_documents` se sube a Storage pero la IA no lo lee.

- Server fn que al subir un PDF/TXT/DOCX lo parsea (`document--parse_document`) y guarda el texto plano en una nueva columna `extracted_text`.
- En `buildSystemPrompt`, inyectar los primeros ~6000 caracteres de conocimiento de la empresa (sin embeddings todavía — simple y suficiente para empezar).
- Indicador en `/conocimiento` de qué documentos están "Activos en la IA".

Más adelante (no esta fase): embeddings con `pgvector` cuando el volumen lo justifique.

---

## Fase 4 — Onboarding 1-minuto + Health-check

Onboarding post-signup (wizard de 4 pasos):
1. Nombre del negocio + idioma.
2. Elegir estilo de IA (las 4 cards grandes).
3. Subir 1 documento o pegar info básica (web, horarios, productos).
4. Conectar WhatsApp **o** "Probar primero en modo demo".

Health-check visible en `/configuracion`:
- 🟢/🟡/🔴 por: WhatsApp conectado, webhook verificado, token válido (ping a Graph API), IA activa, conocimiento cargado.
- Mensajes en lenguaje claro ("Tu token de WhatsApp expira en 30 días — reconecta aquí").

---

## Fase 5 — Calendario + Hardening

Calendario (Google Calendar, OAuth por usuario):
- Tabla `calendar_connections` con tokens cifrados.
- Detección de intención de agendar en la IA → propone slots → confirma → crea evento + envía confirmación por WhatsApp.

Hardening:
- Cifrar `whatsapp_channels.access_token` con `pgcrypto` (o moverlo a Vault).
- Capturar errores 402 (créditos) y 429 (rate-limit) de Lovable AI y mostrarlos al usuario en `/configuracion` con CTA "Agregar créditos".
- Revisar políticas RLS de `whatsapp_channels` (hoy admin-only OK, confirmar).
- Job de limpieza para `ai_suggestions` viejas.

---

## Detalles técnicos (resumen)

- Fase 1: nueva columna `companies.demo_mode boolean`, nuevo route `/demo-chat`, `simulateInboundMessage` server fn que inserta en `messages` con `direction='inbound'` y dispara `maybeAutoReply`.
- Fase 2: nueva columna `conversations.ai_paused boolean default false`. `maybeAutoReply` respeta el flag. Suscripción realtime cliente.
- Fase 3: columna `knowledge_documents.extracted_text text`. `buildSystemPrompt({ knowledge })` ya existe — solo hay que pasarle el texto desde el webhook.
- Fase 4: route `/onboarding` con stepper; `getChannelHealth` server fn que llama `GET /{phone_number_id}` con el access_token.
- Fase 5: route `/api/public/google/oauth/callback`, lib `calendar.functions.ts`, tool calling de Gemini para detectar intención.

---

## ¿Qué te recomiendo?

Empezar por **Fase 1 (Demo) + Fase 2 (Inbox)** ahora mismo en este turno — eso te da una plataforma usable hoy aunque Meta no esté aprobado todavía. Luego Fase 3 (conocimiento real) y 4 (onboarding) en el siguiente turno, y Fase 5 al final.

¿Avanzo con Fase 1 + 2 ahora?
