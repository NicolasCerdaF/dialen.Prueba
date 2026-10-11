import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlatformClientAccount } from "@/lib/platform-admin.functions";

type PlanChoice = "basico" | "premium";

export function CreateClientAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createFn = useServerFn(createPlatformClientAccount);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState<PlanChoice>("basico");
  const [sevenDayTrial, setSevenDayTrial] = useState(false);
  const [result, setResult] = useState<{
    email: string;
    password: string;
    trialEndsAt: string | null;
  } | null>(null);

  function resetForm() {
    setEmail("");
    setFullName("");
    setCompanyName("");
    setPlan("basico");
    setSevenDayTrial(false);
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          email,
          fullName,
          companyName,
          plan,
          sevenDayTrial,
        },
      });
      setResult({
        email: res.email,
        password: res.password,
        trialEndsAt: res.trialEndsAt,
      });
      toast.success(
        sevenDayTrial
          ? "Cuenta creada con 7 días gratis"
          : "Cuenta creada correctamente",
      );
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      qc.invalidateQueries({ queryKey: ["platform-companies"] });
      qc.invalidateQueries({ queryKey: ["platform-metrics"] });
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo crear la cuenta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear cuenta de cliente</DialogTitle>
          <DialogDescription>
            Alta manual con plan Start o Business. Opcionalmente activa una prueba gratuita de 7
            días con el cupo completo del plan.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Comparte estas credenciales por un canal seguro. La contraseña no se volverá a
              mostrar.
            </p>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Correo</div>
              <div className="font-mono">{result.email}</div>
              <div className="mt-2 text-xs text-muted-foreground">Contraseña temporal</div>
              <div className="font-mono text-lg">{result.password}</div>
              {result.trialEndsAt && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Prueba gratis hasta el{" "}
                  {new Date(result.trialEndsAt).toLocaleString("es-CL")}. Desde esa fecha se
                  renuevan los créditos y comienza el ciclo mensual de facturación.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
              >
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cca-email">Correo</Label>
              <Input
                id="cca-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cca-name">Nombre</Label>
              <Input
                id="cca-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cca-company">Empresa</Label>
              <Input
                id="cca-company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Nombre comercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cca-plan">Plan</Label>
              <select
                id="cca-plan"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={plan}
                onChange={(e) => setPlan(e.target.value as PlanChoice)}
              >
                <option value="basico">Start (1.400 créditos / periodo)</option>
                <option value="premium">Business (4.600 créditos / periodo)</option>
              </select>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <Checkbox
                id="cca-trial"
                checked={sevenDayTrial}
                onCheckedChange={(v) => setSevenDayTrial(v === true)}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="cca-trial" className="cursor-pointer font-medium">
                  Gratis por 7 días
                </Label>
                <p className="text-xs text-muted-foreground">
                  Durante 7 días tiene el cupo completo del plan elegido. Al terminar la prueba se
                  reinician los créditos (primer cobro) y los siguientes periodos se renuevan cada
                  mes desde esa fecha.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando…
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" /> Crear cuenta
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CreateClientAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        className="border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="mr-1.5 h-4 w-4" />
        Crear cuenta
      </Button>
      <CreateClientAccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
