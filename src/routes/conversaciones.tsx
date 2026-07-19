import { createFileRoute } from "@tanstack/react-router";
import { Route as InboxRoute } from "./index";

function ConversacionesPage() {
  const Comp = InboxRoute.options.component;
  if (!Comp) return null;
  return <Comp />;
}

export const Route = createFileRoute("/conversaciones")({
  head: () => ({
    meta: [
      { title: "Conversaciones — Dialen" },
      { name: "description", content: "Centro comercial de conversaciones con IA" },
    ],
  }),
  component: ConversacionesPage,
});
