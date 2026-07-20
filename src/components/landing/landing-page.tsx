import { Link } from "@tanstack/react-router";
import { Sparkles, MessageCircle, ArrowRight, Zap, Brain, TrendingUp } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] overflow-hidden relative">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-[#00C853]/20 blur-[140px]" />
        <div className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-[#00695C]/30 blur-[140px]" />
        <div className="absolute top-1/3 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[#00E676]/10 blur-[120px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      {/* Nav */}
      <header className="relative z-10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00695C] shadow-[0_0_24px_-4px_rgba(0,200,83,0.55)]">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Dialen</div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">by Nova Corp</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/politicas-de-privacidad"
              className="hidden text-sm text-white/60 transition hover:text-white sm:inline"
            >
              Privacidad
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-[#00C853]/50 hover:bg-white/10"
            >
              Iniciar sesión
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="mx-auto flex max-w-7xl flex-col items-center px-6 pb-24 pt-16 text-center lg:px-10 lg:pt-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00C853]/30 bg-[#00C853]/10 px-3 py-1 text-xs font-medium text-[#00E676] backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00E676] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00E676]" />
            </span>
            WhatsApp + IA que vende por ti
          </div>

          <h1 className="max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
            Convierte cada conversación de{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[#00E676] via-[#00C853] to-[#00695C] bg-clip-text text-transparent">
                WhatsApp
              </span>
              <svg
                aria-hidden
                className="absolute -bottom-2 left-0 w-full text-[#00C853]/60"
                viewBox="0 0 300 12"
                fill="none"
              >
                <path
                  d="M2 8 Q75 2 150 6 T298 5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            en una venta cerrada.
          </h1>

          <p className="mt-7 max-w-2xl text-balance text-base text-white/70 sm:text-lg lg:text-xl">
            Dialen conecta tu WhatsApp Business con una IA comercial que responde, cotiza y da seguimiento
            <span className="text-white"> 24/7</span>, mientras tu equipo se enfoca en cerrar.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00C853] to-[#00695C] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(0,200,83,0.6)] transition hover:shadow-[0_16px_50px_-10px_rgba(0,200,83,0.8)]"
            >
              Ingresar a Dialen
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-medium text-white/80 backdrop-blur transition hover:border-white/25 hover:text-white"
            >
              Cómo funciona
            </a>
          </div>

          {/* Trust strip */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] uppercase tracking-widest text-white/40">
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#00C853]" /> API oficial de Meta
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#00C853]" /> Datos alojados en Chile
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#00C853]" /> IA de última generación
            </span>
          </div>
        </section>

        {/* Hero mockup — chat + AI panel */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 pb-24 lg:px-10">
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-[#1E293B] to-[#1E293B]/60 p-4 shadow-[0_40px_120px_-30px_rgba(0,200,83,0.35)] backdrop-blur sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              {/* Chat */}
              <div className="rounded-2xl border border-white/5 bg-[#0F172A]/80 p-5">
                <div className="mb-4 flex items-center gap-3 border-b border-white/5 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00C853]/20 text-sm font-semibold text-[#00E676]">
                    JR
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Javier Rojas</div>
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#00E676]" />
                      escribiendo…
                    </div>
                  </div>
                  <MessageCircle className="h-4 w-4 text-white/40" />
                </div>
                <div className="space-y-3 text-sm">
                  <Bubble side="in">Hola, vi su producto en Instagram. ¿Aún tienen stock?</Bubble>
                  <Bubble side="out" ai>
                    ¡Hola Javier! Sí, aún tenemos stock del modelo que viste. ¿Lo prefieres en negro o
                    blanco?
                  </Bubble>
                  <Bubble side="in">Negro. ¿Cuánto sale con envío a Concepción?</Bubble>
                  <Bubble side="out" ai>
                    Te preparé una cotización: <span className="text-[#00E676]">$89.990 CLP</span> con envío
                    incluido. Te la envío en un momento 📎
                  </Bubble>
                </div>
              </div>

              {/* IA Panel */}
              <div className="rounded-2xl border border-[#00C853]/20 bg-gradient-to-b from-[#00C853]/[0.06] to-transparent p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00C853]/20">
                    <Brain className="h-3.5 w-3.5 text-[#00E676]" />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#00E676]">
                    Copiloto IA
                  </div>
                </div>
                <div className="space-y-4">
                  <MiniStat
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                    label="Probabilidad de compra"
                    value="84%"
                  />
                  <MiniStat
                    icon={<Zap className="h-3.5 w-3.5" />}
                    label="Etapa del embudo"
                    value="Cotizado"
                  />
                  <div className="rounded-xl border border-white/5 bg-[#0F172A]/60 p-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      Próxima acción sugerida
                    </div>
                    <div className="text-xs leading-relaxed text-white/80">
                      Confirmar dirección de envío y enviar link de pago para cerrar hoy.
                    </div>
                  </div>
                  <button className="w-full rounded-lg bg-gradient-to-r from-[#00C853] to-[#00695C] py-2 text-xs font-semibold text-white shadow-[0_6px_20px_-6px_rgba(0,200,83,0.6)]">
                    Enviar cotización por WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#0F172A]/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-white/40 sm:flex-row lg:px-10">
          <div>© {new Date().getFullYear()} Dialen — Nova Corp. Todos los derechos reservados.</div>
          <div className="flex items-center gap-5">
            <Link to="/politicas-de-privacidad" className="transition hover:text-white/70">
              Política de privacidad
            </Link>
            <Link to="/login" className="transition hover:text-white/70">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Bubble({
  children,
  side,
  ai,
}: {
  children: React.ReactNode;
  side: "in" | "out";
  ai?: boolean;
}) {
  const isOut = side === "out";
  return (
    <div className={isOut ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isOut
            ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#00C853] to-[#00695C] px-3.5 py-2 text-white shadow-[0_6px_20px_-8px_rgba(0,200,83,0.6)]"
            : "max-w-[85%] rounded-2xl rounded-tl-sm border border-white/5 bg-[#1E293B] px-3.5 py-2 text-white/90"
        }
      >
        {ai && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/80">
            <Sparkles className="h-3 w-3" /> IA
          </div>
        )}
        <div className="leading-snug">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0F172A]/60 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="text-[#00E676]">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
