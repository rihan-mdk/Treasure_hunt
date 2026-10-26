-- ============================================================================
-- THE HUNT EXPEDITION — MIGRATION: SEVEN TEAM-BOUND TREASURE TOKENS
-- Migration: 20261026000000_seven_team_tokens.sql
-- ============================================================================
--
-- DESCRIPTION:
-- Transitions physical treasure token verification from a single shared secret
-- to seven unique team-assigned secret tokens.
--
-- INVARIANTS PRESERVED:
-- 1. One physical treasure item at the final location (no secret printed on it).
-- 2. Seven unique secret tokens, each cryptographically bound to a registered team.
-- 3. Atomic single-winner verification: The first team to clear all 45 questions
--    and present their assigned physical token is crowned champion.
-- 4. Cross-team token rejection: Team A's token cannot verify Team B.
-- 5. Strict lock acquisition order prevents deadlocks and double-winner commits:
--    Lock 1: event_config (id = 1) FOR UPDATE
--    Lock 2: treasure_secrets (team_id = v_team_id) FOR UPDATE
--    Lock 3: teams (id = v_team_id) FOR UPDATE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABLE STRUCTURE: public.treasure_secrets
-- ----------------------------------------------------------------------------

-- Drop legacy single-row restriction constraint
ALTER TABLE public.treasure_secrets DROP CONSTRAINT IF EXISTS single_secret_row;

-- Drop legacy primary key if bound to old integer id
ALTER TABLE public.treasure_secrets DROP CONSTRAINT IF EXISTS treasure_secrets_pkey CASCADE;

-- Reconfigure id and team_id columns
ALTER TABLE public.treasure_secrets DROP COLUMN IF EXISTS id;
ALTER TABLE public.treasure_secrets ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.treasure_secrets ADD COLUMN IF NOT EXISTS team_id uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE RESTRICT;

-- Ensure Row Level Security remains enabled
ALTER TABLE public.treasure_secrets ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. MARSHAL VERIFICATION FUNCTION (TEAM-BOUND TOKEN & ATOMIC SINGLE WINNER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marshal_verify_treasure(
    p_marshal_session_token text,
    p_team_callsign text,
    p_raw_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_marshal_hash text;
    v_marshal_id uuid;
    v_team_id uuid;
    v_solved_count int4;
    v_event record;
    v_secret record;
    v_norm_token text;
    v_masked_token text;
BEGIN
    -- 1. Validate marshal session
    IF p_marshal_session_token IS NULL OR LENGTH(p_marshal_session_token) < 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_UNAUTHORIZED_MARSHAL');
    END IF;

    v_marshal_hash := extensions.digest(p_marshal_session_token, 'sha256')::text;
    SELECT marshal_id INTO v_marshal_id
    FROM public.marshal_sessions
    WHERE token_hash = v_marshal_hash AND expires_at > clock_timestamp() AND revoked_at IS NULL;

    IF v_marshal_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_UNAUTHORIZED_MARSHAL');
    END IF;

    -- 2. Lookup team strictly by canonical callsign
    IF p_team_callsign IS NULL OR TRIM(p_team_callsign) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_NOT_FOUND');
    END IF;

    SELECT id INTO v_team_id
    FROM public.teams
    WHERE callsign = UPPER(TRIM(p_team_callsign)) AND is_disqualified = false;

    IF v_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_NOT_FOUND');
    END IF;

    -- 3. Deterministic Lock 1: Lock event_config globally
    -- Serializes all winner verification transactions; prevents concurrent double-winner commits.
    SELECT * INTO v_event FROM public.event_config WHERE id = 1 FOR UPDATE;

    -- Check single-winner status first (if winner already crowned, report ERR_EVENT_ALREADY_WON)
    IF v_event.is_locked = true OR v_event.winner_team_id IS NOT NULL OR v_event.status = 'completed' OR
       EXISTS (SELECT 1 FROM public.winner_verifications WHERE event_id = 1) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_ALREADY_WON');
    END IF;

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

    -- 4. Deterministic Lock 2: Lock team-specific treasure_secrets row
    SELECT * INTO v_secret FROM public.treasure_secrets WHERE team_id = v_team_id FOR UPDATE;
    IF v_secret.team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TREASURE_SECRET_NOT_CONFIGURED');
    END IF;
    IF v_secret.is_claimed = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_ALREADY_WON');
    END IF;

    -- 5. Deterministic Lock 3: Lock winning team row
    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

    -- 6. Exhaustive verification of all 45 required questions & level distribution
    SELECT COUNT(DISTINCT question_id) INTO v_solved_count
    FROM public.team_progress
    WHERE team_id = v_team_id;

    IF v_solved_count <> 45 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_INCOMPLETE_QUESTIONS');
    END IF;

    IF (SELECT COUNT(*) FROM public.team_progress WHERE team_id = v_team_id AND level_number = 1) <> 10 OR
       (SELECT COUNT(*) FROM public.team_progress WHERE team_id = v_team_id AND level_number = 2) <> 10 OR
       (SELECT COUNT(*) FROM public.team_progress WHERE team_id = v_team_id AND level_number = 3) <> 10 OR
       (SELECT COUNT(*) FROM public.team_progress WHERE team_id = v_team_id AND level_number = 4) <> 10 OR
       (SELECT COUNT(*) FROM public.team_progress WHERE team_id = v_team_id AND level_number = 5) <> 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_INCOMPLETE_QUESTIONS');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.team_progress tp
        LEFT JOIN public.questions q ON tp.question_id = q.id AND tp.level_number = q.level_number
        WHERE tp.team_id = v_team_id AND q.id IS NULL
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_CORRUPT_PROGRESS');
    END IF;

    -- 7. Verify 128-bit team-specific physical token (NULL-safe timing-safe comparison)
    IF p_raw_token IS NULL OR TRIM(p_raw_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_PHYSICAL_TOKEN');
    END IF;

    v_norm_token := UPPER(TRIM(p_raw_token));
    IF LENGTH(v_norm_token) < 20 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_PHYSICAL_TOKEN');
    END IF;

    IF v_secret.token_verifier IS NULL OR extensions.crypt(v_norm_token, v_secret.token_verifier) IS DISTINCT FROM v_secret.token_verifier THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_PHYSICAL_TOKEN');
    END IF;

    -- 8. Atomically commit single winner
    v_masked_token := '***-' || RIGHT(v_norm_token, 4);

    INSERT INTO public.winner_verifications (
        event_id, winning_team_id, verified_by_marshal_id, token_masked
    ) VALUES (
        1, v_team_id, v_marshal_id, v_masked_token
    );

    UPDATE public.treasure_secrets SET is_claimed = true WHERE team_id = v_team_id;

    UPDATE public.event_config
    SET winner_team_id = v_team_id,
        is_locked = true,
        status = 'completed'
    WHERE id = 1;

    RETURN jsonb_build_object(
        'success', true,
        'team_id', v_team_id,
        'verified_at', clock_timestamp()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. DATASET INTEGRITY VALIDATOR (USED BY ACTIVATION TRIGGER)
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

    -- 4. Exactly 1 answer key per question for all 45 questions
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

COMMIT;
