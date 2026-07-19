import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Settings,
  MessageSquare,
  Sparkles,
  Users,
  Check,
  Loader2,
  Send,
  Clock,
  Building2,
  Shield,
  Database,
  ScrollText,
  Download,
  Zap,
  BookOpen,
  KeyRound,
  LogOut,
  Trash2,
  UserCog,
  RefreshCw,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  disconnectWhatsAppChannel,
  sendTestWhatsAppMessage,
} from "@/lib/whatsapp.functions";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { getAiSettings, saveAiSettings, previewAiReply } from "@/lib/ai.functions";
import { AI_STYLES, type AiStyle } from "@/lib/ai-styles";
import {
  getCompanyProfile,
  updateCompanyProfile,
  updateMyProfile,
  listTeamMembers,
  updateMemberRole,
  removeMember,
  getAuditTrail,
  exportData,
  getSettingsSummary,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Dialen" },
      { name: "description", content: "Panel de control de tu espacio Dialen." },
    ],
  }),
  component: ConfigPage,
});

type TabKey =
  | "general"
  | "equipo"
  | "ia"
  | "whatsapp"
  | "seguimiento"
  | "datos"
  | "auditoria"
  | "seguridad";


const TABS: { key: TabKey; label: string; icon: any; adminOnly?: boolean }[] = [
  { key: "general", label: "General", icon: Building2 },
  { key: "equipo", label: "Equipo", icon: Users },
  { key: "ia", label: "Inteligencia IA", icon: Sparkles },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "seguimiento", label: "Seguimiento", icon: Clock },
  { key: "datos", label: "Datos", icon: Database },
  { key: "auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
  { key: "seguridad", label: "Seguridad", icon: Shield },
];

function ConfigPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "general";
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    return t && TABS.some((x) => x.key === t) ? t : "general";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, [tab]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <AppShell>
      <style>{`
        .cfg-input { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color .15s ease; }
        .cfg-input:focus { border-color: hsl(var(--primary)); }
        .cfg-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; transition: opacity .15s ease; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; }
        .btn-secondary:hover { background: hsl(var(--secondary)); }
        .btn-danger { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid hsl(var(--destructive) / 0.3); background: hsl(var(--destructive) / 0.05); color: hsl(var(--destructive)); padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; }
        .btn-danger:hover { background: hsl(var(--destructive) / 0.1); }
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: hsl(var(--primary)); }
      `}</style>
      <div className="h-full overflow-y-auto">
        <div className="border-b border-border bg-card/40 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Configuración
                </h1>
                <p className="text-sm text-muted-foreground">
                  Centro de control del espacio Dialen — cuenta, equipo, IA y datos.
                </p>
              </div>
            </div>
            <SummaryStrip onSelectTab={setTab} />
            <div className="mt-4 flex flex-wrap gap-1 overflow-x-auto">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 py-6">
          {tab === "general" && <GeneralTab isAdmin={isAdmin} />}
          {tab === "equipo" && <TeamTab isAdmin={isAdmin} />}
          {tab === "ia" && <AiStyleSection isAdmin={isAdmin} />}
          {tab === "whatsapp" && <WhatsAppSection isAdmin={isAdmin} />}
          {tab === "seguimiento" && <FollowUpTab isAdmin={isAdmin} />}
          {tab === "datos" && <DataTab />}
          {tab === "auditoria" && isAdmin && <AuditTab />}
          {tab === "seguridad" && <SecurityTab />}
        </div>
      </div>
    </AppShell>
  );
}


/* ----------------------------- Summary strip ---------------------------- */

function SummaryStrip() {
  const fetchSummary = useServerFn(getSettingsSummary);
  const { data } = useQuery({ queryKey: ["settings-summary"], queryFn: () => fetchSummary() });
  const items = [
    { label: "Equipo", value: data?.members ?? "—", to: "?tab=equipo" },
    {
      label: "WhatsApp",
      value:
        data?.whatsapp?.status === "connected"
          ? data.whatsapp.display_phone ?? "Conectado"
          : "Desconectado",
      tone: data?.whatsapp?.status === "connected" ? "ok" : "warn",
      to: "?tab=whatsapp",
    },
    { label: "Clientes", value: data?.customers ?? "—", to: "/clientes" },
    { label: "Productos", value: data?.products ?? "—", to: "/catalogo" },
    { label: "Cotizaciones", value: data?.quotes ?? "—", to: "/cotizaciones" },
    { label: "Automatizaciones", value: data?.automations ?? "—", to: "/automatizaciones" },
  ];
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border border-border bg-background p-3">
          <div className="text-xs text-muted-foreground">{i.label}</div>
          <div
            className={`mt-0.5 truncate font-display text-lg font-semibold ${
              i.tone === "warn" ? "text-amber-500" : ""
            }`}
          >
            {String(i.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- General ------------------------------- */

function GeneralTab({ isAdmin }: { isAdmin: boolean }) {
  const { profile, companyName, role } = useAuth();
  const qc = useQueryClient();
  const fetchCompany = useServerFn(getCompanyProfile);
  const saveCompanyFn = useServerFn(updateCompanyProfile);
  const saveProfileFn = useServerFn(updateMyProfile);

  const { data: company, isLoading } = useQuery({
    queryKey: ["company-profile"],
    queryFn: () => fetchCompany(),
  });

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es");
  const [demoMode, setDemoMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingCo, setSavingCo] = useState(false);
  const [savingMe, setSavingMe] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name ?? "");
      setLanguage(company.language ?? "es");
      setDemoMode(Boolean(company.demo_mode));
    }
  }, [company]);
  useEffect(() => {
    setFullName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  async function saveCompany() {
    setSavingCo(true);
    try {
      await saveCompanyFn({ data: { name, language, demoMode } });
      toast.success("Empresa actualizada");
      qc.invalidateQueries({ queryKey: ["company-profile"] });
      qc.invalidateQueries({ queryKey: ["settings-summary"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSavingCo(false);
    }
  }
  async function saveMe() {
    setSavingMe(true);
    try {
      await saveProfileFn({ data: { fullName, avatarUrl: avatarUrl || null } });
      toast.success("Perfil actualizado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSavingMe(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={<Building2 className="h-4 w-4" />} title="Empresa">
        {isLoading ? (
          <SkeletonRows />
        ) : (
          <div className="space-y-3">
            <Field label="Nombre de la empresa">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                className="input"
              />
            </Field>
            <Field label="Idioma predeterminado">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={!isAdmin}
                className="input"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </Field>
            <Toggle
              label="Modo demo"
              hint="Muestra datos de ejemplo si tu empresa aún no tiene actividad real."
              checked={demoMode}
              onChange={setDemoMode}
              disabled={!isAdmin}
            />
            {isAdmin ? (
              <button className="btn-primary" onClick={saveCompany} disabled={savingCo}>
                {savingCo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Guardar empresa
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Solo un administrador puede modificar estos datos.
              </p>
            )}
            <div className="mt-2 border-t border-border pt-3 text-xs text-muted-foreground">
              Creada:{" "}
              {company?.created_at
                ? new Date(company.created_at).toLocaleDateString()
                : "—"}
            </div>
          </div>
        )}
      </Section>

      <Section icon={<UserCog className="h-4 w-4" />} title="Tu perfil">
        <div className="space-y-3">
          <Field label="Nombre completo">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </Field>
          <Field label="Correo">
            <input value={profile?.email ?? ""} disabled className="input opacity-60" />
          </Field>
          <Field label="URL de avatar (opcional)">
            <input
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Rol">
            <div className="text-sm">
              <RoleBadge role={role ?? "vendedor"} />
              <span className="ml-2 text-muted-foreground">
                {role === "admin" ? "Acceso completo" : role === "manager" ? "Gestión comercial" : "Uso operativo"}
              </span>
            </div>
          </Field>
          <button className="btn-primary" onClick={saveMe} disabled={savingMe}>
            {savingMe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar perfil
          </button>
        </div>
      </Section>

      <Section icon={<Zap className="h-4 w-4" />} title="Integraciones activas">
        <div className="grid gap-2">
          <IntegrationRow
            label="WhatsApp Business"
            desc="Recibe y envía mensajes en la Bandeja."
            to="/whatsapp"
          />
          <IntegrationRow
            label="Base de conocimiento"
            desc="RAG para respuestas IA con contexto."
            to="/conocimiento"
            icon={<BookOpen className="h-4 w-4" />}
          />
          <IntegrationRow
            label="Automatizaciones"
            desc="Recetas y flujos comerciales."
            to="/automatizaciones"
            icon={<Zap className="h-4 w-4" />}
          />
          <IntegrationRow
            label="Catálogo"
            desc="Productos disponibles para cotización."
            to="/catalogo"
          />
        </div>
      </Section>

      <Section icon={<Sparkles className="h-4 w-4" />} title="Acciones rápidas">
        <div className="grid gap-2">
          <QuickLink to="/dashboard" label="Ir al Dashboard" />
          <QuickLink to="/bandeja-ia" label="Abrir Bandeja IA" />
          <QuickLink to="/director-ia" label="Director Comercial IA" />
          <QuickLink to="/metricas-ia" label="Métricas de IA" />
        </div>
      </Section>
    </div>
  );
}

function IntegrationRow({
  label,
  desc,
  to,
  icon,
}: {
  label: string;
  desc: string;
  to: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      to={to as any}
      className="flex items-center justify-between rounded-lg border border-border bg-background p-3 transition hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-secondary p-2 text-muted-foreground">
          {icon ?? <Zap className="h-4 w-4" />}
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <span className="text-xs text-primary">Abrir →</span>
    </Link>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to as any}
      className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-sm hover:border-primary/40"
    >
      <span>{label}</span>
      <span className="text-primary">→</span>
    </Link>
  );
}

/* --------------------------------- Team --------------------------------- */

function TeamTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fetchTeam = useServerFn(listTeamMembers);
  const updateRoleFn = useServerFn(updateMemberRole);
  const removeMemberFn = useServerFn(removeMember);
  const { data, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => fetchTeam(),
  });
  const [q, setQ] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const members = data?.members ?? [];
  const filtered = useMemo(
    () =>
      members.filter((m: any) => {
        if (filterRole !== "all" && m.role !== filterRole) return false;
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        return (
          (m.fullName ?? "").toLowerCase().includes(s) ||
          (m.email ?? "").toLowerCase().includes(s)
        );
      }),
    [members, q, filterRole]
  );

  async function changeRole(userId: string, role: string) {
    try {
      await updateRoleFn({ data: { userId, role: role as any } });
      toast.success("Rol actualizado");
      qc.invalidateQueries({ queryKey: ["team-members"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }
  async function remove(userId: string) {
    if (!confirm("¿Quitar acceso a este miembro? Esta acción es reversible.")) return;
    try {
      await removeMemberFn({ data: { userId } });
      toast.success("Acceso revocado");
      qc.invalidateQueries({ queryKey: ["team-members"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  function toggleSel(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }
  async function bulkRemove() {
    if (!isAdmin) return;
    if (!confirm(`¿Quitar acceso a ${selected.size} miembros?`)) return;
    for (const id of selected) {
      try {
        await removeMemberFn({ data: { userId: id } });
      } catch (e: any) {
        toast.error(e?.message ?? "Error");
      }
    }
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["team-members"] });
    toast.success("Miembros eliminados");
  }

  return (
    <Section icon={<Users className="h-4 w-4" />} title={`Equipo (${members.length})`}>
      {!isAdmin && (
        <p className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600">
          Solo un administrador puede modificar el equipo.
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar por nombre o correo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input pl-7"
          />
        </div>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="input w-auto">
          <option value="all">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="vendedor">Vendedor</option>
        </select>
        <button
          className="btn-secondary"
          onClick={() => qc.invalidateQueries({ queryKey: ["team-members"] })}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
        {isAdmin && selected.size > 0 && (
          <button className="btn-danger" onClick={bulkRemove}>
            <Trash2 className="h-3.5 w-3.5" /> Quitar {selected.size}
          </button>
        )}
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {isAdmin && <th className="w-8 p-2" />}
                <th className="p-2">Miembro</th>
                <th className="p-2">Correo</th>
                <th className="p-2">Rol</th>
                <th className="p-2">Ingreso</th>
                <th className="w-16 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: any) => (
                <tr key={m.userId} className="border-t border-border">
                  {isAdmin && (
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(m.userId)}
                        onChange={() => toggleSel(m.userId)}
                      />
                    </td>
                  )}
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(m.fullName ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium">{m.fullName ?? "—"}</span>
                    </div>
                  </td>
                  <td className="p-2 text-muted-foreground">{m.email ?? "—"}</td>
                  <td className="p-2">
                    {isAdmin ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.userId, e.target.value)}
                        className="input w-auto"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {isAdmin && (
                      <button
                        onClick={() => remove(m.userId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Quitar acceso"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                    Sin miembros que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4">
          <div className="text-sm font-medium">Invitar a un miembro</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Compárteles la URL de acceso. Cuando se registren con su correo, aparecerán automáticamente en el equipo con rol{" "}
            <RoleBadge role="vendedor" />. Podrás ajustar su rol desde esta tabla.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={typeof window !== "undefined" ? window.location.origin + "/auth" : ""}
              className="input"
            />
            <button
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/auth");
                toast.success("Enlace copiado");
              }}
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-primary/10 text-primary",
    manager: "bg-blue-500/10 text-blue-600",
    vendedor: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[role] ?? map.vendedor}`}>
      {role}
    </span>
  );
}

/* ------------------------------ Follow-up ------------------------------ */

function FollowUpTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAiSettings);
  const saveFn = useServerFn(saveAiSettings);
  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => fetchSettings(),
  });
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(24);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(Boolean((settings as any).followUpEnabled));
      setHours(Number((settings as any).followUpHours ?? 24));
    }
  }, [settings]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveFn({
        data: {
          style: settings.style,
          autoReply: settings.autoReply,
          customPrompt: settings.customPrompt ?? null,
          followUpEnabled: enabled,
          followUpHours: hours,
        },
      });
      toast.success("Recordatorio guardado");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={<Clock className="h-4 w-4" />} title="Recordatorio de seguimiento">
      <p className="mb-3 text-sm text-muted-foreground">
        Cuando un cliente no responde durante el tiempo definido, la IA creará una nota
        interna en la conversación para que puedas retomar el contacto.
      </p>
      <Toggle
        label="Activar recordatorios"
        hint="Se ejecuta automáticamente cada hora."
        checked={enabled}
        onChange={setEnabled}
        disabled={!isAdmin}
      />
      {enabled && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Recordarme si no responden en:
          </div>
          <div className="flex flex-wrap gap-2">
            {[2, 6, 24, 48, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                disabled={!isAdmin}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  hours === h
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40"
                }`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={720}
              value={hours}
              disabled={!isAdmin}
              onChange={(e) =>
                setHours(Math.max(1, Math.min(720, Number(e.target.value) || 1)))
              }
              className="input w-24"
            />
          </div>
        </div>
      )}
      {isAdmin && (
        <button className="btn-primary mt-4" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar
        </button>
      )}
    </Section>
  );
}

/* -------------------------------- Data --------------------------------- */

function DataTab() {
  const exportFn = useServerFn(exportData);
  const [loading, setLoading] = useState<string | null>(null);

  async function exportEntity(entity: "customers" | "quotes" | "products" | "conversations") {
    setLoading(entity);
    try {
      const res = await exportFn({ data: { entity } });
      if (!res.count) {
        toast.info("No hay datos para exportar");
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportadas ${res.count} filas`);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setLoading(null);
    }
  }

  const rows: {
    key: "customers" | "quotes" | "products" | "conversations";
    label: string;
    desc: string;
  }[] = [
    { key: "customers", label: "Clientes", desc: "Todos los contactos con etapa y notas." },
    { key: "quotes", label: "Cotizaciones", desc: "Historial de cotizaciones y montos." },
    { key: "products", label: "Productos", desc: "Catálogo con precios y stock." },
    { key: "conversations", label: "Conversaciones", desc: "Metadatos de conversaciones." },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={<Download className="h-4 w-4" />} title="Exportar datos">
        <p className="mb-3 text-sm text-muted-foreground">
          Descarga tus datos en formato CSV. Se generan bajo demanda y respetan los permisos de tu cuenta.
        </p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
            >
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
              <button
                className="btn-secondary"
                onClick={() => exportEntity(r.key)}
                disabled={loading === r.key}
              >
                {loading === r.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                CSV
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Database className="h-4 w-4" />} title="Importar datos">
        <p className="mb-3 text-sm text-muted-foreground">
          Las cargas masivas se realizan en cada módulo con su formato específico.
        </p>
        <div className="space-y-2">
          <QuickLink to="/catalogo" label="Importar productos (CSV) →" />
          <QuickLink to="/clientes" label="Importar clientes →" />
          <QuickLink to="/conocimiento" label="Cargar documentos de conocimiento →" />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------- Audit --------------------------------- */

function AuditTab() {
  const fetchAudit = useServerFn(getAuditTrail);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-trail"],
    queryFn: () => fetchAudit({ data: { limit: 100 } }),
  });
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");

  const filtered = useMemo(() => {
    return (data ?? []).filter((e: any) => {
      if (entity !== "all" && e.entity !== entity) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        e.eventType.toLowerCase().includes(s) ||
        e.actorName.toLowerCase().includes(s) ||
        e.entity.toLowerCase().includes(s)
      );
    });
  }, [data, q, entity]);

  return (
    <Section icon={<ScrollText className="h-4 w-4" />} title="Historial de auditoría">
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar evento o usuario"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input pl-7"
          />
        </div>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="input w-auto">
          <option value="all">Todas las entidades</option>
          <option value="Cliente">Cliente</option>
          <option value="Producto">Producto</option>
          <option value="Cotización">Cotización</option>
          <option value="Conversación">Conversación</option>
          <option value="Conocimiento">Conocimiento</option>
        </select>
        <button className="btn-secondary" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>
      {isLoading ? (
        <SkeletonRows />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Fecha</th>
                <th className="p-2">Entidad</th>
                <th className="p-2">Evento</th>
                <th className="p-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-2 text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">{e.entity}</span>
                  </td>
                  <td className="p-2 font-medium">{e.eventType}</td>
                  <td className="p-2 text-muted-foreground">{e.actorName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                    Sin actividad reciente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------ Security -------------------------------- */

function SecurityTab() {
  const { profile } = useAuth();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [changing, setChanging] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function changePassword() {
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== password2) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada");
      setPassword("");
      setPassword2("");
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setChanging(false);
    }
  }

  async function signOutAll() {
    if (!confirm("Se cerrará la sesión en todos los dispositivos. ¿Continuar?")) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Sesiones cerradas");
      window.location.href = "/auth";
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
      setSigningOut(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={<KeyRound className="h-4 w-4" />} title="Cambiar contraseña">
        <div className="space-y-3">
          <Field label="Cuenta">
            <input value={profile?.email ?? ""} disabled className="input opacity-60" />
          </Field>
          <Field label="Nueva contraseña">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirmar contraseña">
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </Field>
          <button
            className="btn-primary"
            onClick={changePassword}
            disabled={changing || !password}
          >
            {changing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Actualizar contraseña
          </button>
        </div>
      </Section>

      <Section icon={<LogOut className="h-4 w-4" />} title="Sesiones">
        <p className="mb-3 text-sm text-muted-foreground">
          Cierra tu sesión en todos los navegadores y dispositivos donde hayas iniciado sesión.
        </p>
        <button className="btn-danger" onClick={signOutAll} disabled={signingOut}>
          {signingOut && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <LogOut className="h-3.5 w-3.5" /> Cerrar todas las sesiones
        </button>
      </Section>
    </div>
  );
}

/* ------------------------- AI Style (kept & enriched) ------------------- */

function AiStyleSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAiSettings);
  const saveFn = useServerFn(saveAiSettings);
  const previewFn = useServerFn(previewAiReply);
  const fetchCompany = useServerFn(getCompanyProfile);
  const saveCompanyFn = useServerFn(updateCompanyProfile);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => fetchSettings(),
  });
  const { data: company } = useQuery({
    queryKey: ["company-profile"],
    queryFn: () => fetchCompany(),
  });

  const [style, setStyle] = useState<AiStyle>("cercano");
  const [autoReply, setAutoReply] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [preview, setPreview] = useState<string>(AI_STYLES.cercano.example);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setStyle(settings.style);
      setAutoReply(settings.autoReply);
      setCustomPrompt(settings.customPrompt ?? "");
      setPreview(AI_STYLES[settings.style].example);
    }
  }, [settings]);
  useEffect(() => {
    if (company) setThreshold(Number(company.ai_confidence_threshold ?? 0.7));
  }, [company]);

  async function selectStyle(next: AiStyle) {
    setStyle(next);
    setPreview(AI_STYLES[next].example);
    setLoadingPreview(true);
    try {
      const res = await previewFn({ data: { style: next } });
      if (res?.text) setPreview(res.text);
    } catch {
      /* fallback ya visible */
    } finally {
      setLoadingPreview(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        saveFn({
          data: {
            style,
            autoReply,
            customPrompt: customPrompt.trim() ? customPrompt.trim() : null,
            followUpEnabled: (settings as any)?.followUpEnabled ?? false,
            followUpHours: (settings as any)?.followUpHours ?? 24,
          },
        }),
        isAdmin
          ? saveCompanyFn({ data: { aiConfidenceThreshold: threshold } })
          : Promise.resolve(),
      ]);
      toast.success("Ajustes guardados");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
      qc.invalidateQueries({ queryKey: ["company-profile"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={<Sparkles className="h-4 w-4" />} title="Inteligencia comercial">
      {isLoading ? (
        <SkeletonRows />
      ) : !isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Solo un administrador puede cambiar la configuración de IA.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Define cómo habla la IA con tus clientes, cuándo responde sola y qué contexto adicional debe considerar.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(AI_STYLES) as AiStyle[]).map((s) => {
              const def = AI_STYLES[s];
              const active = style === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectStyle(s)}
                  className={`group relative rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-2xl">{def.emoji}</div>
                    {active && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-display text-base font-semibold">{def.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{def.description}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Vista previa</span>
              {loadingPreview && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <div className="rounded-lg bg-background p-3 text-sm leading-relaxed">{preview}</div>
          </div>

          <Field label="Contexto adicional para la IA (opcional)">
            <textarea
              rows={3}
              placeholder="Ej: Somos una tienda de repuestos, priorizamos entregas locales, evita hablar de precios sin confirmar disponibilidad."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              maxLength={2000}
              className="input resize-none"
            />
          </Field>

          <Toggle
            label="IA responde automáticamente"
            hint="Cuando la IA supera el umbral de confianza, responde por ti al instante."
            checked={autoReply}
            onChange={setAutoReply}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Umbral de confianza</div>
                <div className="text-xs text-muted-foreground">
                  Mínimo requerido para que la IA responda sola o autogenere una cotización.
                </div>
              </div>
              <span className="font-mono text-sm text-primary">
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-3 w-full"
            />
          </div>

          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------ WhatsApp ------------------------------- */

function WhatsAppSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const disconnectFn = useServerFn(disconnectWhatsAppChannel);
  const sendTestFn = useServerFn(sendTestWhatsAppMessage);

  const { data: channel, isLoading } = useQuery({
    queryKey: ["wa-channel"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_channels")
        .select("id, phone_number_id, display_phone, status, connected_at")
        .maybeSingle();
      return data;
    },
  });

  const connected = channel?.status === "connected";
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("Hola 👋 Este es un mensaje de prueba desde Dialen.");
  const [testing, setTesting] = useState(false);

  async function disconnect() {
    if (!confirm("¿Desconectar este número? Dejarás de recibir mensajes.")) return;
    try {
      await disconnectFn({});
      toast.success("Desconectado");
      qc.invalidateQueries({ queryKey: ["wa-channel"] });
      qc.invalidateQueries({ queryKey: ["settings-summary"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function sendTest() {
    if (!testTo.trim()) {
      toast.error("Indica un número de destino");
      return;
    }
    setTesting(true);
    try {
      await sendTestFn({ data: { to: testTo, text: testMsg } });
      toast.success("Mensaje enviado");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={<MessageSquare className="h-4 w-4" />} title="Canal de WhatsApp">
        {isLoading ? (
          <SkeletonRows />
        ) : connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
              <Check className="h-4 w-4" />
              <span className="font-medium">Conectado</span>
              <span className="text-primary/80">· {channel?.display_phone}</span>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 text-sm font-medium">Enviar prueba</div>
              <div className="space-y-2">
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="input"
                />
                <textarea
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  rows={2}
                  className="input resize-none"
                />
                <button onClick={sendTest} disabled={testing} className="btn-primary">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar prueba
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/whatsapp" className="btn-secondary">
                Consola completa →
              </Link>
              {isAdmin && (
                <button onClick={disconnect} className="btn-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Desconectar
                </button>
              )}
            </div>
          </div>
        ) : !isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Solo un administrador puede conectar el canal de WhatsApp.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de WhatsApp Business con un solo clic.
            </p>
            <EmbeddedSignupButton
              onConnected={() => {
                qc.invalidateQueries({ queryKey: ["wa-channel"] });
                qc.invalidateQueries({ queryKey: ["settings-summary"] });
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1877F2] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            />
          </div>
        )}
      </Section>

      <Section icon={<Zap className="h-4 w-4" />} title="Módulos conectados">
        <IntegrationRow
          label="Bandeja unificada"
          desc="Mensajes de WhatsApp entrantes."
          to="/conversaciones"
        />
        <IntegrationRow
          label="Plantillas y métricas"
          desc="Gestión avanzada del canal."
          to="/whatsapp"
        />
        <IntegrationRow
          label="Cotizaciones"
          desc="Enviar cotizaciones por WhatsApp."
          to="/cotizaciones"
        />
      </Section>
    </div>
  );
}

/* ------------------------------ Primitives ------------------------------ */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </div>
      <div>{children}</div>
      <style>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: hsl(var(--primary)); }
        .btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; }
        .btn-secondary { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; }
        .btn-secondary:hover { background: hsl(var(--secondary)); }
        .btn-danger { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid hsl(var(--destructive) / 0.3); background: hsl(var(--destructive) / 0.05); color: hsl(var(--destructive)); padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; }
        .btn-danger:hover { background: hsl(var(--destructive) / 0.1); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="relative">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-secondary peer-checked:bg-primary" />
        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition peer-checked:translate-x-5" />
      </div>
    </label>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-secondary/40" />
      ))}
    </div>
  );
}
