import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageSquare,
  Users,
  BookOpen,
  BarChart3,
  Settings,
  Sparkles,
  CircleDot,
  LogOut,
  Wand2,
  TrendingUp,
  Zap,
  Package,
  FileText,
} from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  to: "/" | "/demo-chat" | "/clientes" | "/embudo" | "/automatizaciones" | "/ia" | "/catalogo" | "/cotizaciones" | "/conocimiento" | "/metricas" | "/configuracion";
  label: string;
  icon: typeof MessageSquare;
};

const navItems: NavItem[] = [
  { to: "/", label: "Chats", icon: MessageSquare },
  { to: "/demo-chat", label: "Modo demo", icon: Wand2 },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/embudo", label: "Embudo", icon: TrendingUp },
  { to: "/catalogo", label: "Catálogo", icon: Package },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { to: "/automatizaciones", label: "Automatizaciones", icon: Zap },
  { to: "/ia", label: "IA", icon: Sparkles },
  { to: "/conocimiento", label: "Conocimiento", icon: BookOpen },
  { to: "/metricas", label: "Métricas", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, companyName, role, signOut } = useAuth();
  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold tracking-tight">
              <span className="text-gradient-primary">Dialen</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">by Nova Corp</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active =
                item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-primary" />
                    )}
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="text-xs">
              <div className="font-medium">WhatsApp no conectado</div>
              <div className="text-muted-foreground">Configura en ajustes</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden text-xs">
              <div className="truncate font-medium">{profile?.full_name ?? profile?.email ?? "—"}</div>
              <div className="truncate text-muted-foreground">
                {role ?? "—"} · {companyName ?? "—"}
              </div>
            </div>
            <button
              onClick={signOut}
              title="Cerrar sesión"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
