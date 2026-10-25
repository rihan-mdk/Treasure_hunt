import "server-only";
import { cookies } from "next/headers";

export const TEAM_SESSION_COOKIE = "hunt_team_session";
export const MARSHAL_SESSION_COOKIE = "hunt_marshal_session";

// 24 hours for team sessions
export const TEAM_SESSION_MAX_AGE = 24 * 60 * 60;

// 12 hours for marshal sessions
export const MARSHAL_SESSION_MAX_AGE = 12 * 60 * 60;

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

export function getCookieOptions(maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * Sets the team session cookie with 24-hour lifetime and HttpOnly protection.
 */
export async function setTeamSession(rawToken: string): Promise<void> {
  if (!rawToken || rawToken.trim().length < 32) {
    throw new Error("ERR_INVALID_SESSION_TOKEN");
  }
  const store = await cookies();
  store.set(TEAM_SESSION_COOKIE, rawToken.trim(), getCookieOptions(TEAM_SESSION_MAX_AGE));
}

/**
 * Retrieves the raw team session token from the HttpOnly cookie.
 */
export async function getTeamSession(): Promise<string | null> {
  const store = await cookies();
  const cookie = store.get(TEAM_SESSION_COOKIE);
  return cookie?.value || null;
}

/**
 * Clears the team session cookie upon logout or invalidation.
 */
export async function clearTeamSession(): Promise<void> {
  const store = await cookies();
  store.set(TEAM_SESSION_COOKIE, "", {
    ...getCookieOptions(0),
    maxAge: 0,
  });
}

/**
 * Sets the marshal session cookie with 12-hour lifetime and HttpOnly protection.
 */
export async function setMarshalSession(rawToken: string): Promise<void> {
  if (!rawToken || rawToken.trim().length < 32) {
    throw new Error("ERR_INVALID_SESSION_TOKEN");
  }
  const store = await cookies();
  store.set(MARSHAL_SESSION_COOKIE, rawToken.trim(), getCookieOptions(MARSHAL_SESSION_MAX_AGE));
}

/**
 * Retrieves the raw marshal session token from the HttpOnly cookie.
 */
export async function getMarshalSession(): Promise<string | null> {
  const store = await cookies();
  const cookie = store.get(MARSHAL_SESSION_COOKIE);
  return cookie?.value || null;
}

/**
 * Clears the marshal session cookie upon logout.
 */
export async function clearMarshalSession(): Promise<void> {
  const store = await cookies();
  store.set(MARSHAL_SESSION_COOKIE, "", {
    ...getCookieOptions(0),
    maxAge: 0,
  });
}
