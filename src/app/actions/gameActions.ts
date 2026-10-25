"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTeamSession, getMarshalSession } from "@/lib/server/session";

export interface SubmitAnswerInput {
  questionId: string;
  answer: string;
}

export interface SubmitAnswerResponse {
  success: boolean;
  correct?: boolean;
  levelCompleted?: boolean;
  treasureMissionUnlocked?: boolean;
  alreadySolved?: boolean;
  error?: string;
}

export interface RevealHintInput {
  hintId: string;
}

export interface RevealHintResponse {
  success: boolean;
  content?: string;
  hintsRemaining?: number;
  alreadyRevealed?: boolean;
  error?: string;
}

export interface VerifyTreasureInput {
  teamCallsign: string;
  rawToken: string;
}

export interface VerifyTreasureResponse {
  success: boolean;
  teamId?: string;
  verifiedAt?: string;
  error?: string;
}

export interface WinnerResponse {
  event_completed: boolean;
  team_name?: string;
  callsign?: string;
  won_at?: string;
}

/**
 * Submits an answer for the authenticated team.
 * The session token is extracted server-side from the HttpOnly cookie.
 */
export async function submitAnswerAction(input: SubmitAnswerInput): Promise<SubmitAnswerResponse> {
  const token = await getTeamSession();
  if (!token) {
    return { success: false, error: "ERR_UNAUTHORIZED" };
  }

  const questionId = input?.questionId?.trim();
  const answer = input?.answer;

  if (!questionId) {
    return { success: false, error: "ERR_INVALID_QUESTION_ID" };
  }

  // Pre-check: empty answers fail closed without solving
  if (!answer || answer.trim() === "") {
    return { success: true, correct: false };
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("submit_team_answer", {
      p_session_token: token,
      p_question_id: questionId,
      p_submitted_answer: answer,
    });

    if (error) {
      return { success: false, error: "ERR_SUBMISSION_FAILED" };
    }

    const payload = data as Record<string, unknown>;
    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: (payload?.error as string) || "ERR_SUBMISSION_REJECTED",
      };
    }

    return {
      success: true,
      correct: Boolean(payload.correct),
      levelCompleted: Boolean(payload.level_completed),
      treasureMissionUnlocked: Boolean(payload.treasure_mission_unlocked),
      alreadySolved: Boolean(payload.already_solved),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_SUBMISSION_EXCEPTION" };
  }
}

/**
 * Requests revealing a hint for the authenticated team.
 */
export async function revealHintAction(input: RevealHintInput): Promise<RevealHintResponse> {
  const token = await getTeamSession();
  if (!token) {
    return { success: false, error: "ERR_UNAUTHORIZED" };
  }

  const hintId = input?.hintId?.trim();
  if (!hintId) {
    return { success: false, error: "ERR_INVALID_HINT_ID" };
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("request_reveal_hint", {
      p_session_token: token,
      p_hint_id: hintId,
    });

    if (error) {
      return { success: false, error: "ERR_HINT_REQUEST_FAILED" };
    }

    const payload = data as Record<string, unknown>;
    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: (payload?.error as string) || "ERR_HINT_REVEAL_REJECTED",
      };
    }

    return {
      success: true,
      content: payload.content as string,
      hintsRemaining: typeof payload.hints_remaining === "number" ? payload.hints_remaining : undefined,
      alreadyRevealed: Boolean(payload.already_revealed),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_HINT_EXCEPTION" };
  }
}

/**
 * Marshal-only operation: Verifies the physical token retrieved by a qualified team.
 * Strictly checks the marshal session; team sessions CANNOT authorize this action.
 */
export async function verifyTreasureAction(input: VerifyTreasureInput): Promise<VerifyTreasureResponse> {
  const marshalToken = await getMarshalSession();
  if (!marshalToken) {
    return { success: false, error: "ERR_UNAUTHORIZED_MARSHAL" };
  }

  const callsign = input?.teamCallsign?.trim();
  const rawToken = input?.rawToken?.trim();

  if (!callsign || !rawToken) {
    return { success: false, error: "ERR_INVALID_VERIFICATION_INPUT" };
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("marshal_verify_treasure", {
      p_marshal_session_token: marshalToken,
      p_team_callsign: callsign,
      p_raw_token: rawToken,
    });

    if (error) {
      return { success: false, error: "ERR_VERIFICATION_FAILED" };
    }

    const payload = data as Record<string, unknown>;
    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: (payload?.error as string) || "ERR_VERIFICATION_REJECTED",
      };
    }

    return {
      success: true,
      teamId: payload.team_id as string,
      verifiedAt: payload.verified_at as string,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_VERIFICATION_EXCEPTION" };
  }
}

/**
 * Public operation: Retrieves the sanitized winner details for the leaderboard/status.
 */
export async function getWinnerAction(): Promise<WinnerResponse> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("get_public_winner");

    if (error || !data) {
      return { event_completed: false };
    }

    const payload = data as Record<string, unknown>;
    return {
      event_completed: Boolean(payload.event_completed),
      team_name: payload.team_name as string | undefined,
      callsign: payload.callsign as string | undefined,
      won_at: payload.won_at as string | undefined,
    };
  } catch {
    return { event_completed: false };
  }
}
