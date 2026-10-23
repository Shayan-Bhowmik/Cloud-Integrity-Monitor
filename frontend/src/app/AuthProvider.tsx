import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigError } from "../lib/supabase";
import { sessionExpired } from "../lib/events";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been restored from storage. */
  loading: boolean;
  configError: string | null;
  /** Set when the session was ended because the token could not be refreshed. */
  expired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setExpired(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(
    () =>
      sessionExpired.subscribe(() => {
        setExpired(true);
        void supabase?.auth.signOut({ scope: "local" });
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(supabaseConfigError ?? "Authentication is unavailable.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(supabaseConfigError ?? "Authentication is unavailable.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) throw error;
    // With email confirmation enabled Supabase returns a user but no session.
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configError: supabaseConfigError,
      expired,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, expired, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
