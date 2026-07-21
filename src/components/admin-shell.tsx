import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Shield, LayoutDashboard, Users, Building2 } from "lucide-react";
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
  /** Which admin section is active for the top nav */
  section?: "overview" | "companies" | "users";
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
    { id: "users" as const, label: "Usuarios", icon: Users, hash: "#users" },
    { id: "companies" as const, label: "Empresas", icon: Building2, hash: "#companies" },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-[#0b0f19]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-3">
            <img src={dialenLogo.url} alt="Dialen" className="h-9 w-9 object-contain" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide">Dialen</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                <Shield className="h-3 w-3" />
                Admin Plataforma
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = derived === t.id;
              return (
                <a
                  key={t.id}
                  href={t.hash}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
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

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-medium text-slate-200">
                {profile?.full_name ?? "Administrador"}
              </div>
              <div className="text-[11px] text-slate-500">{profile?.email}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </div>
        {/* Mobile tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-800/70 px-4 py-2 md:hidden">
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
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
