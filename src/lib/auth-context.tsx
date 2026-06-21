import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  company_id: string | null;
};
type Role = "admin" | "manager" | "vendedor";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  companyName: string | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setRole(null);
        setCompanyName(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email, company_id")
        .eq("id", session.user.id)
        .maybeSingle();
      setProfile(p ?? null);
      if (p?.company_id) {
        const [{ data: c }, { data: r }] = await Promise.all([
          supabase.from("companies").select("name").eq("id", p.company_id).maybeSingle(),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("company_id", p.company_id)
            .maybeSingle(),
        ]);
        setCompanyName(c?.name ?? null);
        setRole((r?.role as Role) ?? null);
      }
    })();
  }, [session?.user?.id]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        companyName,
        role,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
