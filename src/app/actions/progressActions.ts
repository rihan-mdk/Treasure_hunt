"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTeamSession } from "@/lib/server/session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LevelStatus = "completed" | "active" | "locked";

export interface LevelProgress {
  levelNumber: number;
  name: string;
  codename: string;
  requiredQuestions: number;
  hintsAllocated: number;
  solvedQuestions: number;
  hintsUsed: number;
  status: LevelStatus;
}

export interface TeamProgressResponse {
  success: boolean;
  error?: string;
  teamId?: string;
  teamName?: string;
  callsign?: string;
  levels?: LevelProgress[];
  totalSolved?: number;
  totalTarget: number;
  activeLevel?: number;
  completedAllLevels?: boolean;
}

export interface QuestionHint {
  id: string;
  hintNumber: number;
  title: string;
  content: string | null; // null if not revealed
  isRevealed: boolean;
}

export interface CurrentQuestionResponse {
  success: boolean;
  error?: string;
  question?: {
    id: string;
    levelNumber: number;
    orderSeq: number;
    totalInLevel: number;
    title: string;
    prompt: string;
    cipherType: string;
    cipherPayload: string | null;
    coordinatesHint: string | null;
    hints: QuestionHint[];
  };
  hintsRemainingInLevel?: number;
  levelCompleted?: boolean;
  allLevelsCompleted?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTeamId(): Promise<{ teamId: string } | { error: string }> {
  const token = await getTeamSession();
  if (!token) return { error: "ERR_UNAUTHORIZED" };

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("internal_validate_team_session", {
      p_session_token: token,
    });
    if (error || !data) return { error: "ERR_SESSION_EXPIRED" };
    return { teamId: data as string };
  } catch {
    return { error: "ERR_SESSION_VALIDATION_FAILED" };
  }
}

// ---------------------------------------------------------------------------
// getTeamProgressAction
// ---------------------------------------------------------------------------

export async function getTeamProgressAction(): Promise<TeamProgressResponse> {
  const result = await resolveTeamId();
  if ("error" in result) {
    return { success: false, error: result.error, totalTarget: 45 };
  }
  const teamId = result.teamId;

  try {
    const admin = createAdminSupabaseClient();

    // 1. Get team profile
    const { data: team, error: teamErr } = await admin
      .from("teams")
      .select("id, team_name, callsign, is_disqualified")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return { success: false, error: "ERR_TEAM_NOT_FOUND", totalTarget: 45 };
    }

    if ((team as { is_disqualified: boolean }).is_disqualified) {
      return { success: false, error: "ERR_TEAM_DISQUALIFIED", totalTarget: 45 };
    }

    // 2. Get all levels
    const { data: levelsData, error: levelsErr } = await admin
      .from("levels")
      .select("level_number, name, codename, required_questions, hints_allocated")
      .order("level_number", { ascending: true });

    if (levelsErr || !levelsData) {
      return { success: false, error: "ERR_LEVELS_FETCH_FAILED", totalTarget: 45 };
    }

    // 3. Get solved counts per level
    const { data: progressData } = await admin
      .from("team_progress")
      .select("level_number")
      .eq("team_id", teamId);

    const solvedByLevel: Record<number, number> = {};
    let totalSolved = 0;
    if (progressData) {
      for (const row of progressData) {
        const lvl = (row as { level_number: number }).level_number;
        solvedByLevel[lvl] = (solvedByLevel[lvl] || 0) + 1;
        totalSolved++;
      }
    }

    // 4. Get hint usage per level
    const { data: hintsData } = await admin
      .from("team_hints")
      .select("level_number")
      .eq("team_id", teamId);

    const hintsByLevel: Record<number, number> = {};
    if (hintsData) {
      for (const row of hintsData) {
        const lvl = (row as { level_number: number }).level_number;
        hintsByLevel[lvl] = (hintsByLevel[lvl] || 0) + 1;
      }
    }

    // 5. Build level progress with status computation
    const levels: LevelProgress[] = [];
    let activeLevel: number | undefined;
    let previousComplete = true;

    for (const lvl of levelsData) {
      const l = lvl as { level_number: number; name: string; codename: string; required_questions: number; hints_allocated: number };
      const solved = solvedByLevel[l.level_number] || 0;
      const hintsUsed = hintsByLevel[l.level_number] || 0;

      let status: LevelStatus;
      if (solved >= l.required_questions) {
        status = "completed";
      } else if (previousComplete) {
        status = "active";
        activeLevel = l.level_number;
      } else {
        status = "locked";
      }

      levels.push({
        levelNumber: l.level_number,
        name: l.name,
        codename: l.codename,
        requiredQuestions: l.required_questions,
        hintsAllocated: l.level_number === 5 ? 0 : l.hints_allocated,
        solvedQuestions: solved,
        hintsUsed,
        status,
      });

      previousComplete = solved >= l.required_questions;
    }

    const completedAllLevels = totalSolved >= 45;
    const t = team as { id: string; team_name: string; callsign: string };

    return {
      success: true,
      teamId: t.id,
      teamName: t.team_name,
      callsign: t.callsign,
      levels,
      totalSolved,
      totalTarget: 45,
      activeLevel: activeLevel ?? (completedAllLevels ? 5 : 1),
      completedAllLevels,
    };
  } catch {
    return { success: false, error: "ERR_PROGRESS_FETCH_EXCEPTION", totalTarget: 45 };
  }
}

// ---------------------------------------------------------------------------
// getCurrentQuestionAction
// ---------------------------------------------------------------------------

export async function getCurrentQuestionAction(): Promise<CurrentQuestionResponse> {
  const result = await resolveTeamId();
  if ("error" in result) {
    return { success: false, error: result.error };
  }
  const teamId = result.teamId;

  try {
    const admin = createAdminSupabaseClient();

    // 1. Find the active level (first level not fully solved)
    const { data: progressData } = await admin
      .from("team_progress")
      .select("question_id, level_number")
      .eq("team_id", teamId);

    const solvedSet = new Set<string>();
    const solvedByLevel: Record<number, number> = {};
    if (progressData) {
      for (const row of progressData) {
        const r = row as { question_id: string; level_number: number };
        solvedSet.add(r.question_id);
        solvedByLevel[r.level_number] = (solvedByLevel[r.level_number] || 0) + 1;
      }
    }

    // Determine active level
    const levelRequirements = [10, 10, 10, 10, 5]; // L1-L5
    let activeLevel = -1;
    for (let i = 0; i < 5; i++) {
      const solved = solvedByLevel[i + 1] || 0;
      if (solved < levelRequirements[i]) {
        activeLevel = i + 1;
        break;
      }
    }

    // All levels completed
    if (activeLevel === -1) {
      return { success: true, allLevelsCompleted: true };
    }

    // 2. Get all questions for the active level, ordered by sequence
    const { data: questionsData, error: qErr } = await admin
      .from("questions")
      .select("id, level_number, order_seq, title, prompt, cipher_type, cipher_payload, coordinates_hint, dependency_question_id")
      .eq("level_number", activeLevel)
      .order("order_seq", { ascending: true });

    if (qErr || !questionsData || questionsData.length === 0) {
      return { success: false, error: "ERR_NO_QUESTIONS_FOUND" };
    }

    // 3. Find the next unsolved question
    type QuestionRow = {
      id: string; level_number: number; order_seq: number; title: string;
      prompt: string; cipher_type: string; cipher_payload: string | null;
      coordinates_hint: string | null; dependency_question_id: string | null;
    };

    let nextQuestion: QuestionRow | null = null;

    if (activeLevel === 5) {
      // Level 5: strict sequential order, find first unsolved where dependency is met
      for (const q of questionsData as QuestionRow[]) {
        if (solvedSet.has(q.id)) continue;
        // Check dependency
        if (q.dependency_question_id && !solvedSet.has(q.dependency_question_id)) {
          break; // Can't proceed past unmet dependency
        }
        nextQuestion = q;
        break;
      }
    } else {
      // Levels 1-4: any unsolved question (pick the first by order_seq)
      for (const q of questionsData as QuestionRow[]) {
        if (!solvedSet.has(q.id)) {
          nextQuestion = q;
          break;
        }
      }
    }

    if (!nextQuestion) {
      // Level just completed between checks
      return { success: true, levelCompleted: true };
    }

    // 4. Get hints for this question
    const { data: hintsData } = await admin
      .from("hints")
      .select("id, hint_number, content")
      .eq("question_id", nextQuestion.id)
      .order("hint_number", { ascending: true });

    // 5. Check which hints this team has already revealed
    const { data: revealedData } = await admin
      .from("team_hints")
      .select("hint_id")
      .eq("team_id", teamId)
      .eq("question_id", nextQuestion.id);

    const revealedSet = new Set<string>();
    if (revealedData) {
      for (const r of revealedData) {
        revealedSet.add((r as { hint_id: string }).hint_id);
      }
    }

    // 6. Get total hints used in this level for quota display
    const { data: levelHintsData } = await admin
      .from("team_hints")
      .select("id")
      .eq("team_id", teamId)
      .eq("level_number", activeLevel);

    const hintsUsedInLevel = levelHintsData?.length ?? 0;
    // Level 5 (Sector Omega) has 0 hints available
    const hintsRemainingInLevel = activeLevel === 5 ? 0 : Math.max(0, 3 - hintsUsedInLevel);

    const questionHints: QuestionHint[] = activeLevel === 5
      ? []
      : (hintsData ?? []).map((h) => {
          const hint = h as { id: string; hint_number: number; content: string };
          const isRevealed = revealedSet.has(hint.id);
          return {
            id: hint.id,
            hintNumber: hint.hint_number,
            title: `Hint ${hint.hint_number}`,
            content: isRevealed ? hint.content : null,
            isRevealed,
          };
        });

    const totalInLevel = questionsData.length;

    return {
      success: true,
      question: {
        id: nextQuestion.id,
        levelNumber: nextQuestion.level_number,
        orderSeq: nextQuestion.order_seq,
        totalInLevel,
        title: nextQuestion.title,
        prompt: nextQuestion.prompt,
        cipherType: nextQuestion.cipher_type,
        cipherPayload: nextQuestion.cipher_payload,
        coordinatesHint: nextQuestion.coordinates_hint,
        hints: questionHints,
      },
      hintsRemainingInLevel,
    };
  } catch {
    return { success: false, error: "ERR_QUESTION_FETCH_EXCEPTION" };
  }
}
