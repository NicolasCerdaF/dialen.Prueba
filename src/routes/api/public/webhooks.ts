// Public alias for the WhatsApp webhook so customers can use
// https://dialen.novacorp.app/webhooks as the Callback URL in Meta.
// This route lives under /api/public/* so it bypasses auth on the published
// site, but is exposed to the outside world as /webhooks via the redirect
// route at src/routes/webhooks.ts.
import { createFileRoute } from "@tanstack/react-router";
import { Route as WhatsAppWebhook } from "./whatsapp.webhook";

export const Route = createFileRoute("/api/public/webhooks")({
  server: (WhatsAppWebhook.options as any).server,
});
