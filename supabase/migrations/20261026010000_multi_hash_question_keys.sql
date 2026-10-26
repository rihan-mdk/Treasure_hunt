-- ============================================================================
-- THE HUNT EXPEDITION — MIGRATION: MULTI-HASH QUESTION KEYS
-- Migration: 20261026010000_multi_hash_question_keys.sql
-- ============================================================================
--
-- DESCRIPTION:
-- Transitions public.question_keys from a single-verifier-per-question constraint
-- to supporting multiple independently hashed, organizer-approved answer variants.
--
-- INVARIANTS PRESERVED:
-- 1. Exactly 45 questions across 5 levels (10, 10, 10, 10, 5).
-- 2. Each question retains exactly ONE designated canonical verifier (is_canonical = true)
--    and zero or more approved variant verifiers (is_canonical = false).
-- 3. submit_team_answer evaluates the normalized submission against all approved
--    bcrypt hashes for the question; matches return correct = true.
-- 4. Incorrect answers fail closed (no fuzzy, regex, or partial matching).
-- 5. Foreign key integrity to public.questions(id) ON DELETE CASCADE is preserved.
-- 6. Strict RLS and service_role access controls remain intact.
-- 7. Deterministic rollback capability via explicit is_canonical flag.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABLE STRUCTURE: public.question_keys
-- ----------------------------------------------------------------------------

-- Drop legacy primary key constraint on question_id if bound to single-row
ALTER TABLE public.question_keys DROP CONSTRAINT IF EXISTS question_keys_pkey CASCADE;

-- Add surrogate UUID primary key and canonical designation flag
ALTER TABLE public.question_keys ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.question_keys ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT false;

-- Mark any existing legacy keys as canonical
UPDATE public.question_keys SET is_canonical = true WHERE is_canonical = false;

-- Enforce primary key on surrogate id
ALTER TABLE public.question_keys ADD PRIMARY KEY (id);

-- Enforce foreign key relationship to questions
ALTER TABLE public.question_keys DROP CONSTRAINT IF EXISTS fk_question_keys_question;
ALTER TABLE public.question_keys ADD CONSTRAINT fk_question_keys_question
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

-- Enforce exactly one canonical verifier per question via partial unique index
DROP INDEX IF EXISTS public.uq_question_keys_canonical;
CREATE UNIQUE INDEX uq_question_keys_canonical ON public.question_keys (question_id) WHERE is_canonical = true;

-- Enforce uniqueness of verifier hash per question
DROP INDEX IF EXISTS public.uq_question_key_hash;
CREATE UNIQUE INDEX uq_question_key_hash ON public.question_keys (question_id, answer_hash);

-- Fast lookup index for question submissions
DROP INDEX IF EXISTS public.idx_question_keys_question_id;
CREATE INDEX idx_question_keys_question_id ON public.question_keys (question_id);

-- Ensure RLS remains enabled
ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. ANSWER SUBMISSION FUNCTION (MULTI-HASH MATCHING)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_team_answer(
    p_session_token text,
    p_question_id uuid,
    p_submitted_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_team_id uuid;
    v_event record;
    v_q record;
    v_norm_ans text;
    v_solved_cnt int4;
    v_level_completed boolean := false;
    v_total_solved int4;
BEGIN
    -- 1. Validate session
    v_team_id := public.internal_validate_team_session(p_session_token);
    IF v_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_UNAUTHORIZED');
    END IF;

    -- 2. Reject NULL, empty, or whitespace-only answers immediately
    IF p_submitted_answer IS NULL OR TRIM(p_submitted_answer) = '' THEN
        RETURN jsonb_build_object('success', true, 'correct', false);
    END IF;

    -- 3. Verify event status and strict time window (Fail closed on NULL or missing)
    SELECT * INTO v_event FROM public.event_config WHERE id = 1;
    IF v_event.id IS NULL OR v_event.status IS NULL OR v_event.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_NOT_ACTIVE');
    END IF;
    IF v_event.start_at IS NULL OR v_event.end_at IS NULL OR v_event.end_at <= v_event.start_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_CONFIG_INVALID');
    END IF;
    IF clock_timestamp() < v_event.start_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_NOT_STARTED');
    END IF;
    IF clock_timestamp() > v_event.end_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_EXPIRED');
    END IF;

    -- 4. Acquire stable per-team lock to serialize progression checks
    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

    -- 5. Lookup question
    SELECT * INTO v_q FROM public.questions WHERE id = p_question_id;
    IF v_q.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_QUESTION_NOT_FOUND');
    END IF;

    -- 6. Check if already solved (idempotent response)
    IF EXISTS (SELECT 1 FROM public.team_progress WHERE team_id = v_team_id AND question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', true, 'correct', true, 'already_solved', true);
    END IF;

    -- 7. Sequential level check: All questions in preceding levels must be solved
    IF v_q.level_number > 1 THEN
        FOR l IN 1..(v_q.level_number - 1) LOOP
            SELECT COUNT(*) INTO v_solved_cnt
            FROM public.team_progress
            WHERE team_id = v_team_id AND level_number = l;

            IF v_solved_cnt <> (CASE WHEN l < 5 THEN 10 ELSE 5 END) THEN
                RETURN jsonb_build_object('success', false, 'error', 'ERR_PREVIOUS_LEVEL_INCOMPLETE');
            END IF;
        END LOOP;
    END IF;

    -- Level 5 linear order check: Preceding clue must be solved
    IF v_q.level_number = 5 AND v_q.dependency_question_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.team_progress
            WHERE team_id = v_team_id AND question_id = v_q.dependency_question_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'ERR_PREREQUISITE_CLUE_LOCKED');
        END IF;
    END IF;

    -- 8. Normalize answer and compare against all approved bcrypt hashes for this question
    v_norm_ans := LOWER(REGEXP_REPLACE(TRIM(p_submitted_answer), '\s+', ' ', 'g'));

    IF NOT EXISTS (
        SELECT 1
        FROM public.question_keys
        WHERE question_id = p_question_id
          AND answer_hash IS NOT NULL
          AND extensions.crypt(v_norm_ans, answer_hash) = answer_hash
    ) THEN
        RETURN jsonb_build_object('success', true, 'correct', false);
    END IF;

    -- 9. Record correct answer idempotently
    INSERT INTO public.team_progress (team_id, question_id, level_number)
    VALUES (v_team_id, p_question_id, v_q.level_number)
    ON CONFLICT (team_id, question_id) DO NOTHING;

    -- 10. Evaluate level completion status
    SELECT COUNT(*) INTO v_solved_cnt
    FROM public.team_progress
    WHERE team_id = v_team_id AND level_number = v_q.level_number;

    IF (v_q.level_number < 5 AND v_solved_cnt = 10) OR (v_q.level_number = 5 AND v_solved_cnt = 5) THEN
        v_level_completed := true;
    END IF;

    SELECT COUNT(DISTINCT question_id) INTO v_total_solved
    FROM public.team_progress
    WHERE team_id = v_team_id;

    RETURN jsonb_build_object(
        'success', true,
        'correct', true,
        'level_completed', v_level_completed,
        'treasure_mission_unlocked', (v_total_solved = 45)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. DATASET INTEGRITY VALIDATOR (MULTI-HASH AWARE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_verify_expedition_dataset()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_count int4;
    v_team_count int4;
    v_l5_q1 uuid;
    v_prev_id uuid;
    v_curr_id uuid;
    v_curr_dep uuid;
BEGIN
    -- 1. Levels count
    SELECT COUNT(*) INTO v_count FROM public.levels;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 5 levels, found %', v_count;
    END IF;

    -- 2. Exact question counts: 10 each for L1-L4, 5 for L5
    FOR i IN 1..4 LOOP
        SELECT COUNT(*) INTO v_count FROM public.questions WHERE level_number = i;
        IF v_count <> 10 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level % has % questions, expected 10', i, v_count;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count FROM public.questions WHERE level_number = 5;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 has % questions, expected 5', v_count;
    END IF;

    -- 3. Total question count must be exactly 45
    SELECT COUNT(*) INTO v_count FROM public.questions;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 questions total, found %', v_count;
    END IF;

    -- 4. Exactly 45 distinct questions with valid answer keys, and exactly 1 canonical key per question
    SELECT COUNT(DISTINCT question_id) INTO v_count FROM public.question_keys;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 questions with answer keys, found %', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.question_keys WHERE is_canonical = true;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 canonical answer keys, found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.questions q
        LEFT JOIN public.question_keys k ON q.id = k.question_id
        WHERE k.question_id IS NULL OR k.answer_hash IS NULL OR LENGTH(k.answer_hash) < 20
    ) THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: One or more questions are missing valid answer keys';
    END IF;

    -- 5. Exactly 135 hints total
    SELECT COUNT(*) INTO v_count FROM public.hints;
    IF v_count <> 135 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 135 hints, found %', v_count;
    END IF;

    -- 6. Per-question hint check: EVERY question MUST have hint 1, hint 2, and hint 3
    IF EXISTS (
        SELECT 1
        FROM public.questions q
        CROSS JOIN (VALUES (1), (2), (3)) AS req(h_num)
        LEFT JOIN public.hints h 
            ON h.question_id = q.id 
            AND h.level_number = q.level_number 
            AND h.hint_number = req.h_num
        WHERE h.id IS NULL
    ) THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: One or more questions are missing hint 1, 2, or 3';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.hints WHERE hint_number NOT IN (1, 2, 3)
    ) THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Detected hints with invalid hint_number';
    END IF;

    -- 7. Level 5 strictly linear chain: Q5.1 has NULL dependency; Q5.N depends on Q5.(N-1)
    SELECT id INTO v_l5_q1
    FROM public.questions
    WHERE level_number = 5 AND order_seq = 1;

    IF v_l5_q1 IS NULL THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue 1 is missing';
    END IF;

    SELECT dependency_question_id INTO v_curr_dep
    FROM public.questions
    WHERE id = v_l5_q1;

    IF v_curr_dep IS NOT NULL THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue 1 must have NULL dependency';
    END IF;

    v_prev_id := v_l5_q1;
    FOR n IN 2..5 LOOP
        SELECT id, dependency_question_id INTO v_curr_id, v_curr_dep
        FROM public.questions
        WHERE level_number = 5 AND order_seq = n;

        IF v_curr_id IS NULL THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue % is missing', n;
        END IF;

        IF v_curr_dep IS DISTINCT FROM v_prev_id THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue % must depend directly on Clue %', n, (n - 1);
        END IF;

        v_prev_id := v_curr_id;
    END LOOP;

    -- 8. Verify physical treasure secret verifier exists for each registered team (strictly 7 required)
    SELECT COUNT(*) INTO v_team_count FROM public.teams;
    IF v_team_count <> 7 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 7 registered teams, found %', v_team_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.teams t
    JOIN public.treasure_secrets ts ON t.id = ts.team_id
    WHERE ts.token_verifier IS NOT NULL AND LENGTH(ts.token_verifier) >= 20;

    IF v_count <> 7 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Active treasure secret verifier missing or invalid for one or more teams (expected 7, found %)',
            v_count;
    END IF;

    RETURN true;
END;
$$;

-- Alias for external callers/scripts
CREATE OR REPLACE FUNCTION public.validate_entire_dataset()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
BEGIN
    RETURN public.internal_verify_expedition_dataset();
END;
$$;

-- Ownership & Permission Grants
ALTER FUNCTION public.submit_team_answer(text, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.internal_verify_expedition_dataset() OWNER TO postgres;
ALTER FUNCTION public.validate_entire_dataset() OWNER TO postgres;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_team_answer(text, uuid, text) TO service_role;

COMMIT;
