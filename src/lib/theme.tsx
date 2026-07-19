import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

type ThemeCtx = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "dialen-theme";

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "dark";
}

function applyClass(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Hydration: read from localStorage after mount
  useEffect(() => {
    const t = readInitial();
    setThemeState(t);
    applyClass(t);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyClass(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) return { theme: "dark", toggle: () => {}, setTheme: () => {} };
  return v;
}
