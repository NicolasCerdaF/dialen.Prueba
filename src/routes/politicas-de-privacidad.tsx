import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, Lock, Database, UserCheck, Mail, FileText, Cookie, Globe, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/politicas-de-privacidad")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad — Dialen" },
      {
        name: "description",
        content:
          "Política de privacidad de Dialen: cómo recopilamos, usamos, almacenamos y protegemos los datos personales de nuestros usuarios y clientes.",
      },
      { property: "og:title", content: "Política de Privacidad — Dialen" },
      {
        property: "og:description",
        content:
          "Conoce cómo Dialen protege tus datos personales y los de tus clientes: seguridad, derechos ARCO, retención y contacto del responsable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Política de Privacidad — Dialen" },
      {
        name: "twitter:description",
        content:
          "Cómo Dialen recopila, usa y protege los datos personales de sus usuarios.",
      },
    ],
  }),
  component: PrivacyPolicyPage,
});

const LAST_UPDATED = "20 de julio de 2026";
const CONTACT_EMAIL = "privacidad@novacorp.app";
const SITE_URL = "www.dialen.novacorp.app";

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold tracking-tight">
                <span className="text-gradient-primary">Dialen</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                by Nova Corp
              </div>
            </div>
          </Link>
          <Link
            to="/"
            className="text-xs font-medium text-muted-foreground transition-smooth hover:text-foreground"
          >
            ← Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Privacidad y protección de datos
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Política de Privacidad
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            En Dialen, operado por Nova Corp, la privacidad y protección de los datos personales
            son un compromiso central. Este documento explica de forma clara qué datos
            recopilamos, con qué finalidad, cómo los protegemos y qué derechos tienes sobre ellos.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Última actualización: {LAST_UPDATED} · Aplicable a {SITE_URL}
          </p>
        </div>

        {/* Content sections */}
        <article className="prose-dialen space-y-10">
          <Section icon={FileText} title="1. Identidad del responsable">
            <p>
              El responsable del tratamiento de los datos personales recopilados a través de
              Dialen es <strong>Nova Corp</strong>, con domicilio comercial en Chile, propietaria
              y operadora de la plataforma disponible en <strong>{SITE_URL}</strong>.
            </p>
            <p>
              Para cualquier consulta relacionada con esta política, el ejercicio de derechos
              sobre tus datos o incidentes de seguridad, puedes escribirnos a{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section icon={Database} title="2. Datos que recopilamos">
            <p>
              Recopilamos únicamente los datos necesarios para operar la plataforma y prestar el
              servicio contratado. Los datos se agrupan en las siguientes categorías:
            </p>
            <h4>2.1 Datos de la cuenta del usuario</h4>
            <ul>
              <li>Nombre completo y correo electrónico corporativo.</li>
              <li>Nombre de la empresa y rol dentro de ella.</li>
              <li>Credenciales de acceso (contraseña cifrada, nunca almacenada en texto plano).</li>
              <li>Preferencias de configuración (idioma, tema visual, zona horaria).</li>
            </ul>
            <h4>2.2 Datos comerciales del cliente final</h4>
            <p>
              Cuando conectas tu número de WhatsApp Business, Dialen procesa las conversaciones
              que tus clientes finales mantienen contigo. Esto puede incluir:
            </p>
            <ul>
              <li>Número de teléfono y nombre público del contacto.</li>
              <li>Contenido de los mensajes intercambiados (texto, imágenes, documentos, audios).</li>
              <li>Historial de interacciones, estado en el embudo comercial y cotizaciones asociadas.</li>
              <li>Metadatos técnicos: fecha, hora, estado de entrega y lectura.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              <strong>Importante:</strong> tú, como cliente de Dialen, eres el responsable del
              tratamiento de los datos de tus contactos finales. Nova Corp actúa como encargado
              del tratamiento y procesa esos datos únicamente bajo tus instrucciones.
            </p>
            <h4>2.3 Datos técnicos y de uso</h4>
            <ul>
              <li>Dirección IP, tipo de dispositivo, navegador y sistema operativo.</li>
              <li>Registros de acceso, acciones realizadas dentro de la plataforma y errores.</li>
              <li>Métricas agregadas de uso para mejorar el rendimiento del producto.</li>
            </ul>
          </Section>

          <Section icon={UserCheck} title="3. Finalidades del tratamiento">
            <p>Usamos tus datos exclusivamente para las siguientes finalidades:</p>
            <ul>
              <li>Prestar, mantener y mejorar el servicio de Dialen.</li>
              <li>
                Ejecutar las funciones comerciales que solicitas: envío de cotizaciones,
                automatizaciones, respuestas de IA y seguimiento de oportunidades.
              </li>
              <li>Autenticar tu identidad y proteger tu cuenta frente a accesos no autorizados.</li>
              <li>Entregar soporte técnico y atender solicitudes.</li>
              <li>
                Enviar notificaciones operativas y, solo si lo aceptas expresamente, comunicaciones
                sobre novedades del producto.
              </li>
              <li>Cumplir obligaciones legales, contables y regulatorias aplicables.</li>
            </ul>
            <p>
              <strong>No vendemos ni cedemos tus datos a terceros con fines publicitarios.</strong>
            </p>
          </Section>

          <Section icon={Lock} title="4. Base legal y consentimiento">
            <p>
              Tratamos tus datos bajo alguna de las siguientes bases: (i) tu consentimiento libre
              e informado al registrarte, (ii) la ejecución del contrato de servicio, (iii) el
              cumplimiento de obligaciones legales, o (iv) un interés legítimo compatible con tus
              derechos, como la prevención de fraude y la seguridad del sistema.
            </p>
            <p>
              Puedes retirar tu consentimiento en cualquier momento sin afectar la licitud del
              tratamiento previo, cerrando tu cuenta o escribiéndonos a {CONTACT_EMAIL}.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="5. Seguridad de la información">
            <p>
              Aplicamos medidas técnicas y organizativas alineadas con estándares reconocidos de
              la industria para proteger tus datos:
            </p>
            <ul>
              <li>Cifrado en tránsito mediante TLS 1.2+ en todas las conexiones.</li>
              <li>Cifrado en reposo de la base de datos y de credenciales sensibles.</li>
              <li>Control de acceso por roles (RBAC) y políticas de seguridad a nivel de fila.</li>
              <li>Autenticación robusta con contraseñas cifradas y sesiones firmadas.</li>
              <li>
                Registros de auditoría de acciones sensibles (envío de cotizaciones, cambios de rol,
                conexiones de canal).
              </li>
              <li>Copias de respaldo cifradas y planes de recuperación ante incidentes.</li>
              <li>Monitoreo continuo y alertas automáticas ante actividad sospechosa.</li>
            </ul>
            <p>
              Ningún sistema es infalible. En caso de detectar una brecha de seguridad que afecte
              tus datos, notificaremos a los usuarios impactados y a las autoridades competentes
              dentro de los plazos exigidos.
            </p>
          </Section>

          <Section icon={Globe} title="6. Terceros y proveedores">
            <p>
              Para operar la plataforma nos apoyamos en proveedores tecnológicos que actúan como
              encargados del tratamiento, únicamente bajo instrucciones documentadas y con
              acuerdos de confidencialidad y seguridad. Entre ellos:
            </p>
            <ul>
              <li><strong>Meta Platforms (WhatsApp Business API):</strong> mensajería con clientes finales.</li>
              <li><strong>Proveedores de infraestructura cloud:</strong> hospedaje, base de datos y respaldos.</li>
              <li><strong>Proveedores de inteligencia artificial:</strong> generación de respuestas, resúmenes y sugerencias comerciales sobre las conversaciones autorizadas.</li>
              <li><strong>Proveedores de correo transaccional:</strong> envío de notificaciones y recuperación de contraseña.</li>
            </ul>
            <p>
              Estos proveedores pueden operar servidores fuera de Chile. En esos casos exigimos
              garantías contractuales equivalentes a las que aplicamos internamente y limitamos el
              acceso a los datos estrictamente necesarios para prestar su servicio.
            </p>
          </Section>

          <Section icon={RefreshCw} title="7. Retención y eliminación">
            <p>
              Conservamos los datos personales solo por el tiempo necesario para cumplir las
              finalidades descritas o cuando exista una obligación legal de retención.
            </p>
            <ul>
              <li>
                <strong>Datos de cuenta:</strong> mientras exista una relación contractual activa.
              </li>
              <li>
                <strong>Conversaciones y datos comerciales:</strong> durante la vigencia del
                servicio y hasta 12 meses adicionales, salvo instrucción contraria del cliente.
              </li>
              <li>
                <strong>Registros de auditoría:</strong> hasta 24 meses para cumplir con
                trazabilidad y seguridad.
              </li>
              <li>
                <strong>Datos anonimizados:</strong> pueden conservarse indefinidamente con fines
                estadísticos, ya que no permiten identificarte.
              </li>
            </ul>
            <p>
              Al cerrar tu cuenta, tus datos personales serán eliminados o anonimizados dentro de
              un plazo razonable, salvo aquellos que debamos conservar por obligación legal.
            </p>
          </Section>

          <Section icon={UserCheck} title="8. Tus derechos sobre los datos">
            <p>Como titular de datos personales, tienes derecho a:</p>
            <ul>
              <li><strong>Acceso:</strong> saber qué datos tratamos sobre ti.</li>
              <li><strong>Rectificación:</strong> corregir información inexacta o desactualizada.</li>
              <li><strong>Cancelación / supresión:</strong> solicitar la eliminación de tus datos cuando ya no sean necesarios.</li>
              <li><strong>Oposición:</strong> oponerte a determinados tratamientos por motivos legítimos.</li>
              <li><strong>Portabilidad:</strong> recibir tus datos en un formato estructurado y de uso común.</li>
              <li><strong>Revocación del consentimiento:</strong> retirar en cualquier momento las autorizaciones otorgadas.</li>
            </ul>
            <p>
              Para ejercer estos derechos escríbenos a{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              indicando tu solicitud y un medio para verificar tu identidad. Responderemos dentro
              de un plazo máximo de 15 días hábiles.
            </p>
          </Section>

          <Section icon={Cookie} title="9. Cookies y tecnologías similares">
            <p>
              Dialen utiliza cookies y almacenamiento local únicamente para fines esenciales:
              mantener tu sesión activa, recordar tus preferencias (tema, idioma, estado del menú)
              y garantizar la seguridad de la aplicación.
            </p>
            <p>
              No utilizamos cookies publicitarias ni de perfilado de terceros. Puedes deshabilitar
              las cookies desde la configuración de tu navegador; sin embargo, algunas
              funcionalidades del servicio podrían dejar de operar correctamente.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="10. Menores de edad">
            <p>
              Dialen es una plataforma orientada a empresas y no está dirigida a menores de 18
              años. No recopilamos deliberadamente datos personales de menores. Si tomamos
              conocimiento de que se han recolectado datos de un menor sin la autorización
              correspondiente, procederemos a eliminarlos de forma inmediata.
            </p>
          </Section>

          <Section icon={RefreshCw} title="11. Cambios en esta política">
            <p>
              Podemos actualizar esta política para reflejar cambios legales, técnicos u
              operativos. Cuando el cambio sea sustancial, te notificaremos por correo electrónico
              o mediante un aviso destacado dentro de la plataforma con al menos 15 días de
              antelación a su entrada en vigor.
            </p>
            <p>
              La fecha de la última actualización se indica al inicio de este documento.
              Continuar utilizando Dialen tras la entrada en vigor implica la aceptación de la
              versión vigente.
            </p>
          </Section>

          <Section icon={Mail} title="12. Contacto">
            <p>
              Si tienes dudas, quejas o solicitudes relacionadas con esta política o con el
              tratamiento de tus datos personales, puedes contactarnos en:
            </p>
            <div className="rounded-lg border border-border bg-secondary/40 p-5">
              <div className="text-sm">
                <div className="font-semibold">Nova Corp — Dialen</div>
                <div className="mt-1 text-muted-foreground">
                  Correo:{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                </div>
                <div className="text-muted-foreground">Sitio: {SITE_URL}</div>
              </div>
            </div>
          </Section>
        </article>

        {/* Footer */}
        <div className="mt-16 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Nova Corp · Dialen. Todos los derechos reservados.
        </div>
      </main>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-20">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/60">
          <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85 [&_a]:transition-smooth [&_h4]:mt-4 [&_h4]:font-semibold [&_h4]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
