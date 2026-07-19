import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageSquare,
  Users,
  Settings,
  Sparkles,
  LogOut,
  TrendingUp,
  Zap,
  Package,
  FileText,
  BookOpen,
  Menu,
  Home,
  LayoutDashboard,
  Inbox,
  Briefcase,
  Target,
  Bot,
  Brain,
  BarChart3,
  Cog,
  ChevronDown,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";

type ExistingRoute =
  | "/"
  | "/conversaciones"
  | "/dashboard"
  | "/dashboard-ejecutivo"
  | "/bandeja-ia"
  | "/director-ia"
  | "/contactos"
  | "/oportunidades"
  | "/metricas-ia"
  | "/embudo"
  | "/clientes"
  | "/catalogo"
  | "/cotizaciones"
  | "/automatizaciones"
  | "/conocimiento"
  | "/configuracion"
  | "/onboarding/whatsapp"
  | "/whatsapp";

type NavItem = {
  label: string;
  icon: typeof MessageSquare;
  to?: ExistingRoute;
  soon?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof Home;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: Home,
    items: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
      { label: "Conversaciones", icon: MessageSquare, to: "/conversaciones" },
      { label: "Bandeja IA", icon: Inbox, to: "/bandeja-ia" },
    ],
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: Briefcase,
    items: [
      { label: "Contactos", icon: Users, to: "/contactos" },
      { label: "Clientes", icon: Users, to: "/clientes" },
      { label: "Oportunidades", icon: Target, to: "/oportunidades" },
      { label: "Embudo Comercial", icon: TrendingUp, to: "/embudo" },
      { label: "Cotizaciones", icon: FileText, to: "/cotizaciones" },
      { label: "Catálogo", icon: Package, to: "/catalogo" },
    ],
  },
  {
    id: "ia",
    label: "IA Comercial",
    icon: Bot,
    items: [
      { label: "Director Comercial IA", icon: Sparkles, to: "/director-ia" },
      { label: "Automatizaciones", icon: Zap, to: "/automatizaciones" },
      { label: "Conocimiento Empresarial", icon: BookOpen, to: "/conocimiento" },
      { label: "Análisis IA", icon: Brain, to: "/metricas-ia" },
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: BarChart3,
    items: [
      { label: "Dashboard Ejecutivo", icon: LayoutDashboard, to: "/dashboard-ejecutivo" },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    icon: Cog,
    items: [
      { label: "WhatsApp", icon: MessageSquare, to: "/whatsapp" },
      { label: "Configuración", icon: Settings, to: "/configuracion" },
    ],
  },
];


function isItemActive(pathname: string, to?: ExistingRoute) {
  if (!to) return false;
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, companyName, role, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Open groups: persist user choice in localStorage; only ever add the
  // active group, never auto-close groups the user opened.
  const STORAGE_KEY = "dialen.sidebar.openGroups";
  const initialOpen = () => {
    let stored: Record<string, boolean> = {};
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) stored = JSON.parse(raw) as Record<string, boolean>;
      } catch {
        stored = {};
      }
    }
    const map: Record<string, boolean> = { ...stored };
    for (const g of navGroups) {
      if (g.items.some((i) => isItemActive(pathname, i.to))) map[g.id] = true;
    }
    if (!Object.values(map).some(Boolean)) map["inicio"] = true;
    return map;
  };
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of navGroups) {
        if (g.items.some((i) => isItemActive(pathname, i.to))) next[g.id] = true;
      }
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
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
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-1">
        <ul className="space-y-1">
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = open[group.id] ?? false;
            const isAiGroup = group.id === "ia";
            return (
              <li key={group.id} className="pt-2 first:pt-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((p) => ({ ...p, [group.id]: !p[group.id] }))
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-smooth",
                    isAiGroup
                      ? "text-[color:var(--ai)] hover:text-[color:var(--ai-glow)]"
                      : "text-muted-foreground/80 hover:text-foreground",
                  )}
                  aria-expanded={isOpen}
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{group.label}</span>
                  {isAiGroup && <span className="ai-dot h-1.5 w-1.5 rounded-full" />}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      isOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
                {isOpen && (
                  <ul className="mt-1 space-y-px">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(pathname, item.to);
                      if (item.soon || !item.to) {
                        return (
                          <li key={`${group.id}-${item.label}`}>
                            <div
                              className="group relative flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground/55"
                              title="Próximamente"
                            >
                              <Icon className="h-4 w-4" strokeWidth={1.75} />
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                Pronto
                              </span>
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={`${group.id}-${item.label}`}>
                          <Link
                            to={item.to}
                            onClick={onNavigate}
                            className={cn(
                              "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-smooth",
                              active
                                ? isAiGroup
                                  ? "bg-[color-mix(in_oklab,var(--ai)_10%,transparent)] text-foreground"
                                  : "bg-secondary text-foreground"
                                : "text-sidebar-foreground/75 hover:bg-secondary/70 hover:text-foreground",
                            )}
                          >
                            {active && (
                              <span
                                className={cn(
                                  "absolute inset-y-1.5 left-0 w-0.5 rounded-r",
                                  isAiGroup ? "bg-[color:var(--ai)]" : "bg-primary",
                                )}
                              />
                            )}
                            <Icon
                              className={cn(
                                "h-4 w-4 transition-smooth",
                                active
                                  ? isAiGroup
                                    ? "text-[color:var(--ai)]"
                                    : "text-primary"
                                  : "text-muted-foreground/80 group-hover:text-foreground",
                              )}
                              strokeWidth={1.75}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 transition-smooth hover:bg-secondary/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <div className="text-xs leading-tight">
            <div className="font-medium">WhatsApp no conectado</div>
            <div className="text-[11px] text-muted-foreground">Configura en ajustes</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-xs)]">
            {initials}
          </div>
          <div className="flex-1 overflow-hidden text-xs">
            <div className="truncate font-medium">
              {profile?.full_name ?? profile?.email ?? "—"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {role ?? "—"} · {companyName ?? "—"}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Cerrar sesión"
            className="rounded-md p-1.5 text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}


export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] border-r border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SidebarInner onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile: hamburger + brand; desktop: theme toggle on the right) */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-md">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md transition-smooth hover:bg-secondary md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-primary">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display text-base font-semibold text-gradient-primary">Dialen</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
