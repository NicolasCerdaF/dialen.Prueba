import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  MessageCircle,
  ArrowRight,
  Zap,
  Brain,
  TrendingUp,
  Bot,
  Users,
  BarChart3,
  ShieldCheck,
  Target,
  FileText,
  Workflow,
  Database,
  Headphones,
  CheckCircle2,
  Star,
  Quote,
  Rocket,
  Layers,
  Globe,
  Lock,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

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
      <header className="relative z-20 sticky top-0 backdrop-blur-xl bg-[#0F172A]/70 border-b border-white/5">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00695C] shadow-[0_0_24px_-4px_rgba(0,200,83,0.55)]">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Dialen</div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">by Nova Corp</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-7 text-sm text-white/60">
            <a href="#producto" className="transition hover:text-white">Producto</a>
            <a href="#como-funciona" className="transition hover:text-white">Cómo funciona</a>
            <a href="#beneficios" className="transition hover:text-white">Beneficios</a>
            <a href="#faq" className="transition hover:text-white">Preguntas</a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-[#00C853]/50 hover:bg-white/10"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#00C853] to-[#00695C] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(0,200,83,0.6)]"
            >
              Empezar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        {/* HERO */}
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
            Dialen conecta tu WhatsApp Business con una IA comercial que responde, cotiza y da
            seguimiento <span className="text-white">24/7</span>, mientras tu equipo se enfoca en
            cerrar.
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

        {/* HERO MOCKUP */}
        <section id="producto" className="mx-auto max-w-6xl px-6 pb-24 lg:px-10">
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
                    ¡Hola Javier! Sí, aún tenemos stock del modelo que viste. ¿Lo prefieres en
                    negro o blanco?
                  </Bubble>
                  <Bubble side="in">Negro. ¿Cuánto sale con envío a Concepción?</Bubble>
                  <Bubble side="out" ai>
                    Te preparé una cotización:{" "}
                    <span className="text-[#00E676]">$89.990 CLP</span> con envío incluido. Te la
                    envío en un momento 📎
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

        {/* METRICS BAR */}
        <section className="mx-auto max-w-6xl px-6 pb-24 lg:px-10">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur md:grid-cols-4 md:gap-6 md:p-8">
            <MetricStat value="3.2×" label="Más conversiones" />
            <MetricStat value="−68%" label="Tiempo de respuesta" />
            <MetricStat value="24/7" label="Cobertura comercial" />
            <MetricStat value="+41%" label="Ticket promedio" />
          </div>
        </section>

        {/* PROBLEMA / SOLUCIÓN */}
        <section className="mx-auto max-w-6xl px-6 pb-28 lg:px-10">
          <SectionHeader
            eyebrow="El problema"
            title="Tus mejores leads se enfrían en WhatsApp"
            subtitle="Mientras respondes uno, otros cinco esperan. Sin visibilidad, sin seguimiento y sin datos, cada venta perdida es dinero que se va."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-6">
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-red-300/80">
                Sin Dialen
              </div>
              <ul className="space-y-3 text-sm text-white/70">
                <PainPoint>Mensajes que quedan sin responder por horas</PainPoint>
                <PainPoint>Cero visibilidad sobre en qué etapa está cada cliente</PainPoint>
                <PainPoint>Cotizaciones que se pierden en el chat</PainPoint>
                <PainPoint>Sin seguimiento automático a leads tibios</PainPoint>
                <PainPoint>Datos dispersos entre WhatsApp, Excel y correos</PainPoint>
              </ul>
            </div>
            <div className="rounded-2xl border border-[#00C853]/25 bg-[#00C853]/[0.04] p-6">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#00E676]">
                <Sparkles className="h-3.5 w-3.5" /> Con Dialen
              </div>
              <ul className="space-y-3 text-sm text-white/80">
                <WinPoint>IA que responde en segundos, incluso fuera de horario</WinPoint>
                <WinPoint>Embudo visual con cada conversación clasificada</WinPoint>
                <WinPoint>Cotizaciones generadas y enviadas en un clic</WinPoint>
                <WinPoint>Recordatorios automáticos que reactivan clientes fríos</WinPoint>
                <WinPoint>Un solo panel: CRM + WhatsApp + IA + métricas</WinPoint>
              </ul>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section id="beneficios" className="mx-auto max-w-7xl px-6 pb-28 lg:px-10">
          <SectionHeader
            eyebrow="Producto"
            title="Todo lo que necesitas para vender por WhatsApp"
            subtitle="Un sistema comercial completo, no solo un chatbot. Diseñado para equipos que viven en WhatsApp."
          />
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              title="IA Comercial 24/7"
              desc="Responde consultas, califica leads y sugiere el siguiente paso. Nunca pierdas un cliente por no contestar."
            />
            <FeatureCard
              icon={<MessageCircle className="h-5 w-5" />}
              title="Bandeja Unificada"
              desc="Todas tus conversaciones en un panel. Con contexto del cliente, historial y alertas priorizadas por la IA."
            />
            <FeatureCard
              icon={<Layers className="h-5 w-5" />}
              title="Embudo Visual"
              desc="Kanban automático: Nuevo, Interesado, Cotizado, Negociando, Ganado. Sin arrastrar tarjetas a mano."
            />
            <FeatureCard
              icon={<FileText className="h-5 w-5" />}
              title="Cotizaciones al Instante"
              desc="La IA arma la cotización desde el chat y la envía por WhatsApp. Con estados en vivo: vista, aceptada, pagada."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="CRM Inteligente"
              desc="Cada contacto con memoria comercial: qué le interesa, cuánto compró, cuándo darle seguimiento."
            />
            <FeatureCard
              icon={<Workflow className="h-5 w-5" />}
              title="Automatizaciones"
              desc="Recetas listas: dar la bienvenida, reactivar frío, recuperar cotización sin respuesta. Todo pasivo."
            />
            <FeatureCard
              icon={<Database className="h-5 w-5" />}
              title="Catálogo Conectado"
              desc="Productos, stock y precios integrados a la IA. Recomienda lo correcto según el contexto del cliente."
            />
            <FeatureCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Métricas Ejecutivas"
              desc="Ingresos, conversión, ticket, ranking de vendedores. En tiempo real y sin planillas."
            />
            <FeatureCard
              icon={<Brain className="h-5 w-5" />}
              title="Director Comercial IA"
              desc="Prioriza tu día con la IA: a quién llamar, qué cotización cerrar, qué automatizar."
            />
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 pb-28 lg:px-10">
          <SectionHeader
            eyebrow="Cómo funciona"
            title="De WhatsApp a venta cerrada en 4 pasos"
            subtitle="Sin migrar tu número, sin cambiar tu operación. Solo conectas y empiezas a vender más."
          />
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StepCard
              step="01"
              icon={<Rocket className="h-5 w-5" />}
              title="Conecta tu WhatsApp"
              desc="Vincula tu número en 3 minutos con el flujo oficial de Meta. Sin desarrolladores."
            />
            <StepCard
              step="02"
              icon={<Brain className="h-5 w-5" />}
              title="Entrena tu IA"
              desc="Carga tu catálogo, precios y preguntas frecuentes. La IA aprende tu negocio."
            />
            <StepCard
              step="03"
              icon={<Target className="h-5 w-5" />}
              title="Recibe y prioriza"
              desc="La IA responde, califica y ubica cada lead en el embudo por probabilidad de compra."
            />
            <StepCard
              step="04"
              icon={<TrendingUp className="h-5 w-5" />}
              title="Cierra más ventas"
              desc="Cotiza, da seguimiento y cobra sin salir de WhatsApp. Con métricas en tiempo real."
            />
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="mx-auto max-w-6xl px-6 pb-28 lg:px-10">
          <SectionHeader
            eyebrow="Testimonios"
            title="Equipos que ya venden con Dialen"
            subtitle="Empresas chilenas que reemplazaron el caos de WhatsApp por un sistema comercial serio."
          />
          <TestimonialsCarousel />
        </section>

        {/* SEGURIDAD / CONFIANZA */}
        <section className="mx-auto max-w-6xl px-6 pb-28 lg:px-10">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 md:p-12">
            <div className="grid gap-10 md:grid-cols-2 md:items-center">
              <div>
                <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#00E676]">
                  Seguridad y confianza
                </div>
                <h3 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Datos protegidos con estándares empresariales
                </h3>
                <p className="mt-4 text-white/70">
                  Tus conversaciones y las de tus clientes se procesan de forma segura, con
                  cifrado, controles de acceso y almacenamiento en Chile.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TrustBadge icon={<ShieldCheck className="h-4 w-4" />} label="API oficial Meta" />
                <TrustBadge icon={<Lock className="h-4 w-4" />} label="Cifrado end-to-end" />
                <TrustBadge icon={<Globe className="h-4 w-4" />} label="Datos en Chile" />
                <TrustBadge icon={<CheckCircle2 className="h-4 w-4" />} label="Ley 19.628" />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-4xl px-6 pb-28 lg:px-10">
          <SectionHeader
            eyebrow="Preguntas frecuentes"
            title="Todo lo que necesitas saber"
            subtitle="¿No encuentras tu respuesta? Escríbenos y te ayudamos personalmente."
          />
          <div className="mt-12 space-y-3">
            <FaqItem
              q="¿Tengo que cambiar mi número de WhatsApp?"
              a="No. Dialen se conecta a tu número actual mediante el flujo oficial de Meta. Tus clientes te siguen escribiendo al mismo lugar de siempre."
            />
            <FaqItem
              q="¿La IA reemplaza a mi equipo comercial?"
              a="No. La IA se encarga de responder rápido, calificar leads y sugerir acciones. Tu equipo se dedica a cerrar ventas. Trabajan juntos."
            />
            <FaqItem
              q="¿Cuánto se demora la implementación?"
              a="Entre 10 y 30 minutos. Conectas tu WhatsApp, cargas tu catálogo y ya estás operando. No requiere desarrolladores."
            />
            <FaqItem
              q="¿Puedo controlar qué responde la IA?"
              a="Sí. Tú entrenas a la IA con tu tono, catálogo y preguntas frecuentes. Además, puedes intervenir cualquier chat cuando quieras."
            />
            <FaqItem
              q="¿Dialen funciona con WhatsApp Business normal?"
              a="Usa la API oficial de WhatsApp Business, que es la versión empresarial de Meta. Es más potente y estable que la app tradicional."
            />
            <FaqItem
              q="¿Qué pasa con mis datos y los de mis clientes?"
              a="Se almacenan cifrados en Chile. Nunca vendemos ni compartimos información. Cumplimos con la normativa local vigente."
            />
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto max-w-5xl px-6 pb-28 lg:px-10">
          <div className="relative overflow-hidden rounded-3xl border border-[#00C853]/30 bg-gradient-to-br from-[#00C853]/15 via-[#00695C]/10 to-transparent p-10 text-center md:p-16">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#00C853]/30 blur-[100px]" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
                <Sparkles className="h-3.5 w-3.5 text-[#00E676]" />
                Empieza hoy en menos de 10 minutos
              </div>
              <h3 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Deja de perder ventas en WhatsApp.
              </h3>
              <p className="mx-auto mt-4 max-w-2xl text-white/70 sm:text-lg">
                Únete a los equipos que ya venden con IA. Conecta tu WhatsApp Business y transforma
                cada chat en una oportunidad real.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00C853] to-[#00695C] px-7 py-4 text-sm font-semibold text-white shadow-[0_16px_50px_-10px_rgba(0,200,83,0.7)] transition hover:shadow-[0_20px_60px_-10px_rgba(0,200,83,0.9)]"
                >
                  Ingresar a Dialen
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#producto"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-4 text-sm font-medium text-white/80 backdrop-blur transition hover:border-white/25 hover:text-white"
                >
                  Ver el producto
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/50">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#00E676]" /> Sin tarjeta de crédito</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#00E676]" /> Setup guiado</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#00E676]" /> Soporte en español</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#0F172A]/60">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00695C]">
                  <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
                </div>
                <div className="leading-tight">
                  <div className="font-semibold tracking-tight">Dialen</div>
                  <div className="text-[10px] uppercase tracking-widest text-white/50">by Nova Corp</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/50">
                WhatsApp + IA que vende por ti. Diseñado en Chile para equipos comerciales
                modernos.
              </p>
            </div>
            <FooterCol
              title="Producto"
              links={[
                { label: "Cómo funciona", href: "#como-funciona" },
                { label: "Beneficios", href: "#beneficios" },
                { label: "Preguntas", href: "#faq" },
              ]}
            />
            <FooterCol
              title="Empresa"
              links={[
                { label: "Iniciar sesión", to: "/login" },
                { label: "Política de privacidad", to: "/politicas-de-privacidad" },
              ]}
            />
            <FooterCol
              title="Contacto"
              links={[
                { label: "hola@dialen.novacorp.app", href: "mailto:hola@dialen.novacorp.app" },
                { label: "Soporte", href: "mailto:soporte@dialen.novacorp.app" },
              ]}
            />
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-white/40 sm:flex-row">
            <div>© {new Date().getFullYear()} Dialen — Nova Corp. Todos los derechos reservados.</div>
            <div className="flex items-center gap-2 text-white/40">
              <Headphones className="h-3.5 w-3.5" />
              Hecho con foco comercial en Chile 🇨🇱
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

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

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#00E676]">
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-white/60 sm:text-lg">{subtitle}</p>}
    </div>
  );
}

function MetricStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-semibold text-white sm:text-4xl">
        <span className="bg-gradient-to-r from-[#00E676] to-[#00C853] bg-clip-text text-transparent">
          {value}
        </span>
      </div>
      <div className="mt-2 text-xs uppercase tracking-widest text-white/50">{label}</div>
    </div>
  );
}

function PainPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
      <span>{children}</span>
    </li>
  );
}

function WinPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00E676]" />
      <span>{children}</span>
    </li>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-[#00C853]/30 hover:bg-white/[0.04]">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#00C853]/0 blur-2xl transition group-hover:bg-[#00C853]/20" />
      <div className="relative">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853]/20 to-[#00695C]/20 text-[#00E676]">
          {icon}
        </div>
        <div className="font-display text-base font-semibold text-white">{title}</div>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{desc}</p>
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  desc,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00C853] to-[#00695C] text-white shadow-[0_6px_20px_-6px_rgba(0,200,83,0.5)]">
          {icon}
        </div>
        <div className="font-display text-2xl font-semibold text-white/10">{step}</div>
      </div>
      <div className="font-display text-base font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{desc}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  author,
  role,
}: {
  quote: string;
  author: string;
  role: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <Quote className="h-6 w-6 text-[#00C853]/60" />
      <p className="mt-4 text-sm leading-relaxed text-white/80">{quote}</p>
      <div className="mt-5 flex items-center gap-3 border-t border-white/5 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00C853]/15 text-xs font-semibold text-[#00E676]">
          {author
            .split(" ")
            .map((n) => n[0])
            .join("")}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-white">{author}</div>
          <div className="text-xs text-white/50">{role}</div>
        </div>
        <div className="flex gap-0.5 text-[#00E676]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-3 w-3 fill-current" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00C853]/15 text-[#00E676]">
        {icon}
      </span>
      {label}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white transition hover:bg-white/[0.03]"
      >
        <span>{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/50 transition ${open ? "rotate-180 text-[#00E676]" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-white/65">
          {a}
        </div>
      )}
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href?: string; to?: string }[];
}) {
  return (
    <div>
      <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
        {title}
      </div>
      <ul className="space-y-2.5 text-sm text-white/60">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className="transition hover:text-white">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} className="transition hover:text-white">
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
