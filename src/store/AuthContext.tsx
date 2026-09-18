import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isCloudConfigured } from "../lib/supabase";

type AuthValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  displayName: string;
  signInPassword: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function nameFromUser(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { display_name?: string; full_name?: string };
  return (
    meta.display_name?.trim() ||
    meta.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Dispatcher"
  );
}

function authFailMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? "");
  if (/no such host|dns error|os error 11001/i.test(text)) {
    return "Desktop .env has a Supabase URL that does not exist. Set VITE_SUPABASE_URL to the Project URL from Supabase → Settings → API, then rebuild.";
  }
  if (
    /failed to fetch|networkerror|timed?\s*out|load failed|error sending request/i.test(
      text,
    )
  ) {
    return `Could not reach the cloud from this desktop. ${text}`;
  }
  return text || "Sign-in failed.";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sign-in timed out.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isCloudConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    // If Supabase/API gateway is down, getSession can hang forever and trap the UI on "Signing in...".
    withTimeout(supabase.auth.getSession(), 10000)
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setSession(null);
        setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const signInPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return "Cloud is not configured.";
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        20000,
      );
      return error?.message ?? null;
    } catch (err) {
      return authFailMessage(err);
    }
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) return "Cloud is not configured.";
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        }),
        20000,
      );
      return error?.message ?? null;
    } catch (err) {
      return authFailMessage(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      displayName: nameFromUser(session?.user ?? null),
      signInPassword,
      sendMagicLink,
      signOut,
    }),
    [configured, loading, sendMagicLink, session, signInPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
