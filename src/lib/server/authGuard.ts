import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTeamSession, getMarshalSession } from "./session";
import { createHash } from "node:crypto";

export interface TeamSessionContext {
  teamId: string;
}

export interface MarshalSessionContext {
  marshalId: string;
}

/**
 * Validates the current team session server-side using the database token hash.
 * Returns the authenticated team context, or null if unauthenticated or expired.
 */
export async function getAuthenticatedTeam(): Promise<TeamSessionContext | null> {
  const token = await getTeamSession();
  if (!token) return null;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("internal_validate_team_session", {
      p_session_token: token,
    });

    if (error || !data) {
      return null;
    }

    return { teamId: data as string };
  } catch {
    return null;
  }
}

/**
 * Validates the current marshal session server-side.
 * Returns the authenticated marshal context, or null if unauthenticated.
 */
export async function getAuthenticatedMarshal(): Promise<MarshalSessionContext | null> {
  const token = await getMarshalSession();
  if (!token) return null;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("internal_validate_marshal_session", {
      p_session_token: token,
    });

    if (error || !data) {
      // Fallback check against marshal_sessions table handling both \x hex and raw hex
      const hex = createHash("sha256").update(token).digest("hex");
      const { data: record } = await admin
        .from("marshal_sessions")
        .select("marshal_id")
        .or(`token_hash.eq.\\x${hex},token_hash.eq.${hex}`)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (!record) return null;
      return { marshalId: (record as { marshal_id: string }).marshal_id };
    }

    return { marshalId: data as string };
  } catch {
    return null;
  }
}
