import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { assertSafeDatabaseUrl } from "./guard";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Returns the Supabase browser client initialized with public anonymous credentials.
 * Protects against runtime exceptions if env variables are not yet configured.
 * Enforces fail-closed target project validation.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (supabaseInstance) return supabaseInstance;

  if (supabaseUrl && supabaseAnonKey) {
    const verifiedUrl = assertSafeDatabaseUrl(supabaseUrl);
    supabaseInstance = createClient<Database>(verifiedUrl, supabaseAnonKey);
    return supabaseInstance;
  }

  // Graceful fallback for preview when Supabase credentials are pending
  return null;
}
