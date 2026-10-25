import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { assertSafeDatabaseUrl } from "./guard";

/**
 * Creates a server-side Supabase client for Server Components, Server Actions,
 * and Route Handlers using the publishable anonymous key and HTTP-only cookie store.
 *
 * Conforms to Next.js App Router async cookies() architecture.
 * Strictly verifies the database URL through the fail-closed environment guard.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "CONFIGURATION ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const verifiedUrl = assertSafeDatabaseUrl(supabaseUrl);

  return createServerClient<Database>(verifiedUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // In Next.js, cookies can only be modified in Server Actions or Route Handlers.
          // This can be safely ignored for read-only Server Components.
        }
      },
    },
  });
}
