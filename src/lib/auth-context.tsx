import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { syncMyCompanyPlan } from "@/lib/plans.functions";

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

async function ensureWorkspaceForUser(user: User, profile: Profile | null): Promise<Profile> {
  const email = profile?.email ?? user.email ?? null;
  const fullName =
    profile?.full_name ??
    (user.user_metadata as any)?.full_name ??
    (user.user_metadata as any)?.name ??
    (email ? email.split("@")[0] : "Mi empresa");

  if (profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (company?.owner_id === user.id) {
      await supabase.from("user_roles").insert({
        user_id: user.id,
        company_id: profile.company_id,
        role: "admin",
      });
    }

    void syncMyCompanyPlan().catch(() => {});

    return profile;
  }

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let companyId = existingCompany?.id as string | undefined;
  if (!companyId) {
    const { data: company, error } = await supabase
      .from("companies")
      .insert({ name: `${fullName} Workspace`, owner_id: user.id })
      .select("id")
      .single();
    if (error || !company?.id) throw error ?? new Error("No se pudo crear la empresa");
    companyId = company.id;
  }

  const nextProfile: Profile = {
    id: user.id,
    full_name: fullName,
    email,
    company_id: companyId,
  };

  if (profile) {
    const { error } = await supabase
      .from("profiles")
      .update({ company_id: companyId, full_name: profile.full_name ?? fullName, email })
      .eq("id", user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("profiles").insert(nextProfile);
    if (error) throw error;
  }

  await supabase.from("user_roles").insert({
    user_id: user.id,
    company_id: companyId,
    role: "admin",
  });

  void syncMyCompanyPlan().catch(() => {
    /* best-effort plan sync after bootstrap */
  });

  return nextProfile;
}

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
      const resolvedProfile = await ensureWorkspaceForUser(session.user, p ?? null);
      setProfile(resolvedProfile);
      if (resolvedProfile.company_id) {
        const [{ data: c }, { data: r }] = await Promise.all([
          supabase.from("companies").select("name").eq("id", resolvedProfile.company_id).maybeSingle(),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("company_id", resolvedProfile.company_id)
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
