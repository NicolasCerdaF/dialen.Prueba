import { createFileRoute } from "@tanstack/react-router";
import { Route as InboxRoute } from "./index";

const InboxComponent = InboxRoute.options.component ?? (() => null);

export const Route = createFileRoute("/conversaciones")({
  head: () => ({
    meta: [
      { title: "Conversaciones — Dialen" },
      { name: "description", content: "Centro comercial de conversaciones con IA" },
    ],
  }),
  component: InboxComponent,
});
