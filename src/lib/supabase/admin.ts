import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { assertSafeDatabaseUrl } from "./guard";

/**
 * Creates an administrative Supabase client using the server-only service-role key.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Protected by `import "server-only"` — build fails if imported into client code.
 * 2. Uses non-public `SUPABASE_SERVICE_ROLE_KEY` — never exposed in NEXT_PUBLIC_*.
 * 3. Verified through fail-closed URL guard — blocks production kcupmzqnyitkchkmftcl.
 */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("CONFIGURATION ERROR: Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "CONFIGURATION ERROR: SUPABASE_SERVICE_ROLE_KEY is required for privileged server actions."
    );
  }

  const verifiedUrl = assertSafeDatabaseUrl(supabaseUrl);

  return createClient<Database>(verifiedUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
