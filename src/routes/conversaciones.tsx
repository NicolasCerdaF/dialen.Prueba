import { createFileRoute } from "@tanstack/react-router";
import { Route as InboxRoute } from "./index";

// El módulo Conversaciones vive en el mismo componente que la bandeja.
// Este alias expone la URL comercial `/conversaciones` y se enlaza desde
// el panel lateral y el Dashboard.
export const Route = createFileRoute("/conversaciones")({
  head: () => ({
    meta: [
      { title: "Conversaciones — Dialen" },
      { name: "description", content: "Centro comercial de conversaciones con IA" },
    ],
  }),
  component: InboxRoute.options.component!,
});
