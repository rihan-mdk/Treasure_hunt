"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTrustedClientIp } from "@/lib/server/ip";
import {
  setTeamSession,
  getTeamSession,
  clearTeamSession,
  setMarshalSession,
  getMarshalSession,
  clearMarshalSession,
} from "@/lib/server/session";

export interface TeamLoginInput {
  teamIdentifier: string;
  password: string;
}

export interface TeamLoginResponse {
  success: boolean;
  error?: string;
  teamId?: string;
  teamName?: string;
  callsign?: string;
}

export interface MarshalLoginInput {
  username: string;
  password: string;
}

export interface MarshalLoginResponse {
  success: boolean;
  error?: string;
  marshalId?: string;
  username?: string;
  callsign?: string;
}

/**
 * Authenticates a team squad via privileged RPC.
 * Raw session token is placed strictly inside HttpOnly cookie and never returned to the client.
 */
export async function teamLoginAction(input: TeamLoginInput): Promise<TeamLoginResponse> {
  const identifier = input?.teamIdentifier?.trim();
  const password = input?.password;

  if (!identifier || !password) {
    return { success: false, error: "ERR_INVALID_CREDENTIALS" };
  }

  try {
    const admin = createAdminSupabaseClient();
    const clientIp = await getTrustedClientIp();

    const { data, error } = await admin.rpc("authenticate_team", {
      p_team_identifier: identifier,
      p_password: password,
      p_client_ip: clientIp,
    });

    if (error) {
      return { success: false, error: "ERR_AUTH_FAILED" };
    }

    const payload = data as Record<string, unknown>;

    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: (payload?.error as string) || "ERR_INVALID_CREDENTIALS",
      };
    }

    // Secure cookie storage — raw token NEVER exposed in return payload
    const sessionToken = payload.session_token as string;
    await setTeamSession(sessionToken);

    return {
      success: true,
      teamId: payload.team_id as string,
      teamName: payload.team_name as string,
      callsign: payload.callsign as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_AUTH_EXCEPTION" };
  }
}

/**
 * Revokes the team database session and clears the HttpOnly cookie.
 */
export async function teamLogoutAction(): Promise<{ success: boolean }> {
  try {
    const token = await getTeamSession();
    if (token) {
      const admin = createAdminSupabaseClient();
      await admin.rpc("revoke_team_session", { p_session_token: token });
    }
  } catch {
    // Fail-safe cleanup
  } finally {
    await clearTeamSession();
  }
  return { success: true };
}

/**
 * Authenticates an authorized event marshal.
 */
export async function marshalLoginAction(input: MarshalLoginInput): Promise<MarshalLoginResponse> {
  const username = input?.username?.trim();
  const password = input?.password;

  if (!username || !password) {
    return { success: false, error: "ERR_INVALID_CREDENTIALS" };
  }

  try {
    const admin = createAdminSupabaseClient();
    const clientIp = await getTrustedClientIp();

    const { data, error } = await admin.rpc("authenticate_marshal", {
      p_username: username,
      p_password: password,
      p_client_ip: clientIp,
    });

    if (error) {
      return { success: false, error: "ERR_AUTH_FAILED" };
    }

    const payload = data as Record<string, unknown>;

    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: (payload?.error as string) || "ERR_INVALID_CREDENTIALS",
      };
    }

    const sessionToken = payload.session_token as string;
    await setMarshalSession(sessionToken);

    return {
      success: true,
      marshalId: payload.marshal_id as string,
      username: payload.username as string,
      callsign: payload.callsign as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_AUTH_EXCEPTION" };
  }
}

/**
 * Revokes the marshal database session and clears the HttpOnly cookie.
 */
export async function marshalLogoutAction(): Promise<{ success: boolean }> {
  try {
    const token = await getMarshalSession();
    if (token) {
      const admin = createAdminSupabaseClient();
      await admin.rpc("revoke_marshal_session", { p_marshal_session_token: token });
    }
  } catch {
    // Fail-safe cleanup
  } finally {
    await clearMarshalSession();
  }
  return { success: true };
}
