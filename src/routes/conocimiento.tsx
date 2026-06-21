import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/conocimiento")({
  head: () => ({ meta: [{ title: "Conocimiento — Dialen" }] }),
  component: () => (
    <AppShell>
      <div className="flex h-full items-center justify-center p-10">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="font-display text-xl font-semibold">Base de conocimiento vacía</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sube PDFs, DOCX o agrega links de venta para que la IA los use al responder.
            Disponible próximamente.
          </p>
        </div>
      </div>
    </AppShell>
  ),
});
