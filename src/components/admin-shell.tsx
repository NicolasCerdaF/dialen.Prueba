import { useRouterState } from "@tanstack/react-router";
import { LogOut, Shield, LayoutDashboard, Users, Building2, LineChart } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import dialenLogo from "@/assets/dialen-isotipo.png.asset.json";

/**
 * Dedicated shell for platform administrators. Completely separate from the
 * client-facing AppShell: no sales sidebar, no plan/credits pill — just the
 * platform-management surface.
 */
export function AdminShell({
  children,
  section,
}: {
  children: ReactNode;
  /** Which admin section is active for the side nav */
  section?: "overview" | "companies" | "users" | "metrics";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, signOut } = useAuth();

  const derived: typeof section =
    section ??
    (pathname.includes("empresas")
      ? "companies"
      : pathname.includes("usuarios")
        ? "users"
        : "overview");

  const tabs = [
    { id: "overview" as const, label: "Vista general", icon: LayoutDashboard, hash: "#overview" },
    { id: "metrics" as const, label: "Métricas", icon: LineChart, hash: "#metrics" },
    { id: "users" as const, label: "Usuarios", icon: Users, hash: "#users" },
    { id: "companies" as const, label: "Empresas", icon: Building2, hash: "#companies" },
  ];


  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="flex min-h-screen">
        {/* Left sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800/70 bg-[#0a0e17] md:flex">
          {/* Brand */}
          <div className="flex items-center gap-3 border-b border-slate-800/70 px-5 py-4">
            <img src={dialenLogo.url} alt="Dialen" className="h-9 w-9 object-contain" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-wide">Dialen</span>
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                <Shield className="h-2.5 w-2.5" />
                Admin Plataforma
              </span>
            </div>
          </div>

          {/* Sections */}
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Plataforma
            </div>
            <nav className="flex flex-col gap-1">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = derived === t.id;
                return (
                  <a
                    key={t.id}
                    href={t.hash}
                    className={`inline-flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                      active
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </a>
                );
              })}
            </nav>
          </div>

          {/* User footer */}
          <div className="border-t border-slate-800/70 p-3">
            <div className="mb-2 px-2">
              <div className="truncate text-xs font-medium text-slate-200">
                {profile?.full_name ?? "Administrador"}
              </div>
              <div className="truncate text-[11px] text-slate-500">{profile?.email}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </aside>

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800/70 bg-[#0b0f19]/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-2">
              <img src={dialenLogo.url} alt="Dialen" className="h-7 w-7 object-contain" />
              <span className="text-sm font-semibold">Dialen</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                <Shield className="h-2.5 w-2.5" />
                Admin
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </header>
          {/* Mobile tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/70 px-4 py-2 md:hidden">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = derived === t.id;
              return (
                <a
                  key={t.id}
                  href={t.hash}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
                    active ? "bg-slate-800 text-white" : "text-slate-400"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </a>
              );
            })}
          </nav>

          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
