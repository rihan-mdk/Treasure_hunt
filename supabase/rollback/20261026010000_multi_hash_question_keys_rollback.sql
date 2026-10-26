-- ============================================================================
-- THE HUNT EXPEDITION — ROLLBACK: MULTI-HASH QUESTION KEYS
-- Rollback for: 20261026010000_multi_hash_question_keys.sql
-- ============================================================================
--
-- INTENDED CONSEQUENCES:
-- 1. Deterministically prunes all secondary answer variant verifiers (is_canonical = false).
-- 2. Preserves the exact authoritative canonical verifier for every question (is_canonical = true).
-- 3. Restores single-row primary key constraint on public.question_keys(question_id).
-- 4. Reverts submit_team_answer to single-hash lookup.
-- 5. Reverts internal_verify_expedition_dataset to single-hash count check (COUNT(*) = 45).
--
-- CAUTION:
-- Rollback removes all multi-variant matching capabilities. Participants submitting
-- approved secondary variants will no longer be accepted.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PRUNE SECONDARY VARIANTS AND RESTORE SINGLE-ROW PRIMARY KEY
-- ----------------------------------------------------------------------------

-- Deterministically remove all non-canonical variant verifiers
DELETE FROM public.question_keys WHERE is_canonical = false;

-- Drop surrogate primary key and auxiliary indexes
ALTER TABLE public.question_keys DROP CONSTRAINT IF EXISTS question_keys_pkey CASCADE;
DROP INDEX IF EXISTS public.uq_question_keys_canonical;
DROP INDEX IF EXISTS public.uq_question_key_hash;
DROP INDEX IF EXISTS public.idx_question_keys_question_id;

-- Drop surrogate id and canonical flag columns
ALTER TABLE public.question_keys DROP COLUMN IF EXISTS id;
ALTER TABLE public.question_keys DROP COLUMN IF EXISTS is_canonical;

-- Restore original single-row primary key on question_id
ALTER TABLE public.question_keys ADD CONSTRAINT question_keys_pkey PRIMARY KEY (question_id);

-- Re-affirm foreign key to questions
ALTER TABLE public.question_keys DROP CONSTRAINT IF EXISTS fk_question_keys_question;
ALTER TABLE public.question_keys ADD CONSTRAINT fk_question_keys_question
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 2. RESTORE SINGLE-HASH SUBMISSION FUNCTION
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
    v_key record;
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

    -- 3. Verify event status and strict time window
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

    -- 4. Lock team row
    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

    -- 5. Lookup question
    SELECT * INTO v_q FROM public.questions WHERE id = p_question_id;
    IF v_q.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_QUESTION_NOT_FOUND');
    END IF;

    -- 6. Check if already solved
    IF EXISTS (SELECT 1 FROM public.team_progress WHERE team_id = v_team_id AND question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', true, 'correct', true, 'already_solved', true);
    END IF;

    -- 7. Sequential level check
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

    -- Level 5 linear order check
    IF v_q.level_number = 5 AND v_q.dependency_question_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.team_progress
            WHERE team_id = v_team_id AND question_id = v_q.dependency_question_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'ERR_PREREQUISITE_CLUE_LOCKED');
        END IF;
    END IF;

    -- 8. Single-hash lookup
    v_norm_ans := LOWER(REGEXP_REPLACE(TRIM(p_submitted_answer), '\s+', ' ', 'g'));
    SELECT * INTO v_key FROM public.question_keys WHERE question_id = p_question_id;

    IF v_key.answer_hash IS NULL OR extensions.crypt(v_norm_ans, v_key.answer_hash) IS DISTINCT FROM v_key.answer_hash THEN
        RETURN jsonb_build_object('success', true, 'correct', false);
    END IF;

    -- 9. Record progress
    INSERT INTO public.team_progress (team_id, question_id, level_number)
    VALUES (v_team_id, p_question_id, v_q.level_number)
    ON CONFLICT (team_id, question_id) DO NOTHING;

    -- 10. Completion evaluation
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
-- 3. RESTORE SINGLE-HASH DATASET VALIDATOR
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
    SELECT COUNT(*) INTO v_count FROM public.levels;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 5 levels, found %', v_count;
    END IF;

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

    SELECT COUNT(*) INTO v_count FROM public.questions;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 questions total, found %', v_count;
    END IF;

    -- Exactly 45 single answer keys
    SELECT COUNT(*) INTO v_count FROM public.question_keys;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 answer keys, found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.questions q
        LEFT JOIN public.question_keys k ON q.id = k.question_id
        WHERE k.question_id IS NULL OR k.answer_hash IS NULL OR LENGTH(k.answer_hash) < 20
    ) THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: One or more questions are missing valid answer keys';
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.hints;
    IF v_count <> 135 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 135 hints, found %', v_count;
    END IF;

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

    SELECT id INTO v_l5_q1 FROM public.questions WHERE level_number = 5 AND order_seq = 1;
    IF v_l5_q1 IS NULL THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue 1 is missing';
    END IF;

    SELECT dependency_question_id INTO v_curr_dep FROM public.questions WHERE id = v_l5_q1;
    IF v_curr_dep IS NOT NULL THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue 1 must have NULL dependency';
    END IF;

    v_prev_id := v_l5_q1;
    FOR n IN 2..5 LOOP
        SELECT id, dependency_question_id INTO v_curr_id, v_curr_dep
        FROM public.questions WHERE level_number = 5 AND order_seq = n;

        IF v_curr_id IS NULL THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue % is missing', n;
        END IF;

        IF v_curr_dep IS DISTINCT FROM v_prev_id THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Clue % must depend directly on Clue %', n, (n - 1);
        END IF;

        v_prev_id := v_curr_id;
    END LOOP;

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

ALTER FUNCTION public.submit_team_answer(text, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.internal_verify_expedition_dataset() OWNER TO postgres;
ALTER FUNCTION public.validate_entire_dataset() OWNER TO postgres;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_team_answer(text, uuid, text) TO service_role;

COMMIT;
