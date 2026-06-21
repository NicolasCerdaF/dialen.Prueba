import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Dialen" }] }),
  component: () => (
    <AppShell>
      <EmptyState />
    </AppShell>
  ),
});

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-display text-xl font-semibold">Sin clientes todavía</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Los clientes aparecerán automáticamente cuando reciban un mensaje en tu WhatsApp.
        </p>
      </div>
    </div>
  );
}
