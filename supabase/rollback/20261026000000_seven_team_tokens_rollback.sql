-- ============================================================================
-- THE HUNT EXPEDITION — ROLLBACK: SEVEN TEAM-BOUND TREASURE TOKENS
-- Rollback: 20261026000000_seven_team_tokens_rollback.sql
-- ============================================================================
--
-- EXPLICIT WARNING:
-- Rolling back this migration reverts the physical treasure token schema from the
-- 7-team-bound design back to the single shared secret baseline (CHECK id = 1).
-- Because a single-row constraint cannot hold multiple team tokens, this rollback
-- DESTRUCTIVELY TRUNCATES all rows in public.treasure_secrets, removing all
-- existing team-token assignments. Any physical tokens previously assigned to
-- teams will become invalid and must be re-provisioned if the event continues.
-- ============================================================================

BEGIN;

-- 1. Explicitly clear existing team-bound token assignments to prevent primary key conflicts.
-- Restoring id int4 PRIMARY KEY DEFAULT 1 and single_secret_row CHECK (id = 1) requires
-- that at most one row can exist. Truncate treasure_secrets explicitly.
TRUNCATE TABLE public.treasure_secrets;

-- 2. Restore public.treasure_secrets to single-token schema
ALTER TABLE public.treasure_secrets DROP CONSTRAINT IF EXISTS treasure_secrets_team_id_key CASCADE;
ALTER TABLE public.treasure_secrets DROP CONSTRAINT IF EXISTS treasure_secrets_team_id_fkey CASCADE;
ALTER TABLE public.treasure_secrets DROP COLUMN IF EXISTS team_id;
ALTER TABLE public.treasure_secrets DROP COLUMN IF EXISTS id;
ALTER TABLE public.treasure_secrets ADD COLUMN id int4 PRIMARY KEY DEFAULT 1;
ALTER TABLE public.treasure_secrets ADD CONSTRAINT single_secret_row CHECK (id = 1);

-- 2. Restore single-token marshal_verify_treasure
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

    IF p_team_callsign IS NULL OR TRIM(p_team_callsign) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_NOT_FOUND');
    END IF;

    SELECT id INTO v_team_id
    FROM public.teams
    WHERE callsign = UPPER(TRIM(p_team_callsign)) AND is_disqualified = false;

    IF v_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_TEAM_NOT_FOUND');
    END IF;

    SELECT * INTO v_event FROM public.event_config WHERE id = 1 FOR UPDATE;

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

    SELECT * INTO v_secret FROM public.treasure_secrets WHERE id = 1 FOR UPDATE;
    IF v_secret.is_claimed = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_ALREADY_WON');
    END IF;

    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

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

    v_masked_token := '***-' || RIGHT(v_norm_token, 4);

    INSERT INTO public.winner_verifications (
        event_id, winning_team_id, verified_by_marshal_id, token_masked
    ) VALUES (
        1, v_team_id, v_marshal_id, v_masked_token
    );

    UPDATE public.treasure_secrets SET is_claimed = true WHERE id = 1;

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

-- 3. Restore single-token validate_entire_dataset
CREATE OR REPLACE FUNCTION public.validate_entire_dataset()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_count int4;
    v_level_rec record;
    v_q_rec record;
    v_prev_id uuid;
    v_curr_id uuid;
    v_prev_order int4;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.levels;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 5 levels, found %', v_count;
    END IF;

    FOR v_level_rec IN SELECT level_number, required_questions, hints_allocated FROM public.levels ORDER BY level_number LOOP
        IF v_level_rec.level_number IN (1, 2, 3, 4) AND v_level_rec.required_questions <> 10 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level % required questions must be 10', v_level_rec.level_number;
        ELSIF v_level_rec.level_number = 5 AND v_level_rec.required_questions <> 5 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 required questions must be 5';
        END IF;
        IF v_level_rec.hints_allocated <> 3 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level % hints allocated must be 3', v_level_rec.level_number;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count FROM public.questions;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 questions, found %', v_count;
    END IF;

    FOR v_level_rec IN SELECT level_number, required_questions FROM public.levels ORDER BY level_number LOOP
        SELECT COUNT(*) INTO v_count FROM public.questions WHERE level_number = v_level_rec.level_number;
        IF v_count <> v_level_rec.required_questions THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level % question count mismatch. Expected %, found %',
                v_level_rec.level_number, v_level_rec.required_questions, v_count;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count FROM public.question_keys;
    IF v_count <> 45 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Expected exactly 45 question keys, found %', v_count;
    END IF;

    FOR v_q_rec IN SELECT id FROM public.questions LOOP
        SELECT COUNT(*) INTO v_count FROM public.hints WHERE question_id = v_q_rec.id;
        IF v_count <> 3 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Question % does not have exactly 3 hints (found %)', v_q_rec.id, v_count;
        END IF;
    END LOOP;

    v_prev_id := NULL;
    v_prev_order := 0;

    FOR v_q_rec IN
        SELECT id, order_seq, dependency_question_id
        FROM public.questions
        WHERE level_number = 5
        ORDER BY order_seq ASC
    LOOP
        v_curr_id := v_q_rec.id;
        IF v_q_rec.order_seq <> v_prev_order + 1 THEN
            RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 sequence broken at order %', v_q_rec.order_seq;
        END IF;
        v_prev_order := v_q_rec.order_seq;

        IF v_q_rec.order_seq = 1 THEN
            IF v_q_rec.dependency_question_id IS NOT NULL THEN
                RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Question 1 must have null dependency';
            END IF;
        ELSE
            IF v_q_rec.dependency_question_id IS DISTINCT FROM v_prev_id THEN
                RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Level 5 Question % dependency must point strictly to preceding question %',
                    v_q_rec.order_seq, v_prev_id;
            END IF;
        END IF;

        v_prev_id := v_curr_id;
    END LOOP;

    SELECT COUNT(*) INTO v_count
    FROM public.treasure_secrets
    WHERE id = 1 AND token_verifier IS NOT NULL AND LENGTH(token_verifier) >= 20;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Active treasure secret verifier missing or invalid in treasure_secrets';
    END IF;

    RETURN true;
END;
$$;

COMMIT;
