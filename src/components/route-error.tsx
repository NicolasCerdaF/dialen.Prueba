import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

type Props = {
  error: Error;
  reset?: () => void;
  title?: string;
};

/**
 * Standard error boundary UI for route-level errors. Wraps in AppShell so the
 * sidebar/chrome remains usable while the user retries.
 */
export function RouteError({ error, reset, title = "No pudimos cargar este módulo" }: Props) {
  const router = useRouter();
  return (
    <AppShell>
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error?.message || "Ocurrió un error inesperado. Vuelve a intentarlo en unos segundos."}
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              reset?.();
              router.invalidate();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reintentar
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
