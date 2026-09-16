import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isTauriRuntime } from "./layout";

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  if (url.includes("YOUR_PROJECT") || anonKey.includes("YOUR_ANON")) return null;
  return { url, anonKey };
}

export function isCloudConfigured(): boolean {
  return supabaseConfig() !== null;
}

let client: SupabaseClient | null = null;

async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isTauriRuntime()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}

export function getSupabase(): SupabaseClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  if (!client) {
    const desktop = isTauriRuntime();
    client = createClient(config.url, config.anonKey, {
      global: { fetch: supabaseFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !desktop,
      },
    });
  }
  return client;
}
