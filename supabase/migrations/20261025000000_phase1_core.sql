-- ============================================================================
-- THE HUNT EXPEDITION — PHASE 1 CORE DATABASE SCHEMA & SECURITY DEFINER ENGINE
-- Target Project: uguvotvttdtclnhbsywr (Staging)
-- Version: 20261025000000
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSION VERIFICATION
-- Ensure pgcrypto exists in a supported schema (extensions or public)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_ext_schema text;
BEGIN
    -- 1. Check if pgcrypto extension already exists
    SELECT n.nspname INTO v_ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pgcrypto';

    -- 2. If missing, attempt installation in dedicated extensions schema
    IF v_ext_schema IS NULL THEN
        CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

        SELECT n.nspname INTO v_ext_schema
        FROM pg_extension e
        JOIN pg_namespace n ON e.extnamespace = n.oid
        WHERE e.extname = 'pgcrypto';
    END IF;

    -- 3. Fail closed if pgcrypto is not in 'extensions' schema
    -- Phase 1 functions strictly invoke extensions.crypt, extensions.digest, and extensions.gen_random_bytes.
    IF v_ext_schema IS DISTINCT FROM 'extensions' THEN
        RAISE EXCEPTION 'EXTENSION_SCHEMA_MISMATCH: pgcrypto is installed in schema "%", but Phase 1 functions strictly invoke extensions.crypt, extensions.digest, and extensions.gen_random_bytes. Manual DBA review required to avoid modifying shared extensions.', COALESCE(v_ext_schema, 'UNKNOWN');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. EVENT CONFIGURATION
-- ----------------------------------------------------------------------------
CREATE TABLE public.event_config (
    id int4 PRIMARY KEY DEFAULT 1,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    start_at timestamptz NULL,
    end_at timestamptz NULL,
    is_locked boolean NOT NULL DEFAULT false,
    winner_team_id uuid NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT single_event_row CHECK (id = 1),
    CONSTRAINT chk_event_window_order CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

-- Seed default initial row for fail-closed checks
INSERT INTO public.event_config (id, status, is_locked)
VALUES (1, 'draft', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. LEVELS METADATA
-- Authoritative rules: 5 levels, 10 questions for L1-L4, 5 clues for L5 (Total 45)
-- ----------------------------------------------------------------------------
CREATE TABLE public.levels (
    level_number int4 PRIMARY KEY CHECK (level_number BETWEEN 1 AND 5),
    name text NOT NULL,
    codename text NOT NULL,
    required_questions int4 NOT NULL CHECK (
        (level_number BETWEEN 1 AND 4 AND required_questions = 10) OR
        (level_number = 5 AND required_questions = 5)
    ),
    hints_allocated int4 NOT NULL DEFAULT 3 CHECK (hints_allocated = 3)
);

-- ----------------------------------------------------------------------------
-- 3. QUESTIONS
-- Composite keys enforce level consistency. Level 5 has sequential dependencies.
-- ----------------------------------------------------------------------------
CREATE TABLE public.questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level_number int4 NOT NULL REFERENCES public.levels(level_number) ON DELETE RESTRICT,
    order_seq int4 NOT NULL,
    title text NOT NULL,
    prompt text NOT NULL,
    cipher_type text NOT NULL,
    cipher_payload text NULL,
    coordinates_hint text NULL,
    dependency_question_id uuid NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_question_level_order UNIQUE (level_number, order_seq),
    CONSTRAINT uq_question_id_level UNIQUE (id, level_number),
    CONSTRAINT chk_level_order_range CHECK (
        (level_number BETWEEN 1 AND 4 AND order_seq BETWEEN 1 AND 10) OR
        (level_number = 5 AND order_seq BETWEEN 1 AND 5)
    ),
    CONSTRAINT chk_level5_dependency_rule CHECK (
        (level_number < 5 AND dependency_question_id IS NULL) OR
        (level_number = 5)
    )
);

-- ----------------------------------------------------------------------------
-- 4. QUESTION KEYS (Exactly 1 key per question, hashed via bcrypt cost 12)
-- ----------------------------------------------------------------------------
CREATE TABLE public.question_keys (
    question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
    answer_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 5. HINTS (Exactly 3 contextual hints per question numbered 1, 2, 3)
-- Composite foreign key guarantees hint belongs to genuine question & level
-- ----------------------------------------------------------------------------
CREATE TABLE public.hints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL,
    level_number int4 NOT NULL,
    hint_number int4 NOT NULL CHECK (hint_number BETWEEN 1 AND 3),
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_hint_per_question UNIQUE (question_id, hint_number),
    CONSTRAINT uq_hint_composite UNIQUE (id, question_id, level_number),
    CONSTRAINT fk_hints_questions_composite
        FOREIGN KEY (question_id, level_number)
        REFERENCES public.questions(id, level_number)
        ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 6. TEAMS
-- One team account per squad. Strict callsign syntax.
-- ----------------------------------------------------------------------------
CREATE TABLE public.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name text NOT NULL UNIQUE,
    callsign text NOT NULL UNIQUE CHECK (callsign ~ '^[A-Z0-9_-]{3,20}$'),
    password_hash text NOT NULL,
    is_disqualified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Link winner in event_config back to teams
ALTER TABLE public.event_config
    ADD CONSTRAINT fk_event_winner
    FOREIGN KEY (winner_team_id)
    REFERENCES public.teams(id)
    ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- 7. TEAM PROGRESS (Authoritative Ground Truth)
-- Single source of truth. Unique per (team_id, question_id).
-- ----------------------------------------------------------------------------
CREATE TABLE public.team_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    question_id uuid NOT NULL,
    level_number int4 NOT NULL,
    solved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_team_question_solved UNIQUE (team_id, question_id),
    CONSTRAINT fk_team_progress_questions_composite
        FOREIGN KEY (question_id, level_number)
        REFERENCES public.questions(id, level_number)
        ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 8. TEAM HINTS (Revealed Hints Log)
-- Enforces that a revealed hint corresponds to genuine question & level.
-- ----------------------------------------------------------------------------
CREATE TABLE public.team_hints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    hint_id uuid NOT NULL,
    question_id uuid NOT NULL,
    level_number int4 NOT NULL,
    revealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_team_hint_reveal UNIQUE (team_id, hint_id),
    CONSTRAINT fk_team_hints_hints_composite
        FOREIGN KEY (hint_id, question_id, level_number)
        REFERENCES public.hints(id, question_id, level_number)
        ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 9. AUTHENTICATION RATE LIMITS
-- Row-locked buckets for both canonical account identifiers and client IP addresses
-- ----------------------------------------------------------------------------
CREATE TABLE public.auth_rate_limits (
    identifier_type text NOT NULL CHECK (identifier_type IN ('account', 'ip')),
    identifier_key text NOT NULL,
    failed_attempts int4 NOT NULL DEFAULT 0,
    window_start_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    locked_until timestamptz NULL,
    CONSTRAINT pk_auth_rate_limits PRIMARY KEY (identifier_type, identifier_key)
);

-- ----------------------------------------------------------------------------
-- 10. TEAM SESSIONS (24-hour lifetime, single active session)
-- ----------------------------------------------------------------------------
CREATE TABLE public.team_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 11. MARSHALS (Field staff portal)
-- ----------------------------------------------------------------------------
CREATE TABLE public.marshals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    callsign text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 12. MARSHAL SESSIONS (12-hour lifetime)
-- ----------------------------------------------------------------------------
CREATE TABLE public.marshal_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marshal_id uuid NOT NULL REFERENCES public.marshals(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 13. TREASURE SECRETS (128-bit CSPRNG physical token verifier store)
-- ----------------------------------------------------------------------------
CREATE TABLE public.treasure_secrets (
    id int4 PRIMARY KEY DEFAULT 1,
    token_verifier text NOT NULL,
    is_claimed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT single_secret_row CHECK (id = 1)
);

-- ----------------------------------------------------------------------------
-- 14. WINNER VERIFICATIONS (Database-enforced single winner per event)
-- ----------------------------------------------------------------------------
CREATE TABLE public.winner_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id int4 NOT NULL DEFAULT 1 REFERENCES public.event_config(id) ON DELETE RESTRICT,
    winning_team_id uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE RESTRICT,
    verified_by_marshal_id uuid NOT NULL REFERENCES public.marshals(id) ON DELETE RESTRICT,
    verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    token_masked text NOT NULL CHECK (token_masked ~ '^\*\*\*\-[A-Z0-9]{4,8}$'),
    CONSTRAINT uq_single_event_winner UNIQUE (event_id)
);

-- Indexes for performance
CREATE INDEX idx_questions_level_order ON public.questions (level_number, order_seq);
CREATE INDEX idx_team_progress_team_level ON public.team_progress (team_id, level_number);
CREATE INDEX idx_team_hints_team_level ON public.team_hints (team_id, level_number);
CREATE INDEX idx_team_sessions_hash ON public.team_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_marshal_sessions_hash ON public.marshal_sessions (token_hash) WHERE revoked_at IS NULL;

-- ============================================================================
-- FUNCTIONS & PROCEDURAL BUSINESS LOGIC
-- All routines declare hardened search_path = pg_catalog, extensions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Pre-Launch Dataset Validator (Exhaustive Per-Question Key & Hint Verification)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_verify_expedition_dataset()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_count int4;
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

    -- Ensure no hint has invalid hint_number (< 1 or > 3)
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

    -- 8. Verify physical treasure secret verifier exists
    SELECT COUNT(*) INTO v_count
    FROM public.treasure_secrets
    WHERE id = 1 AND token_verifier IS NOT NULL AND LENGTH(token_verifier) >= 20;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'DATASET_INTEGRITY_FAIL: Active treasure secret verifier missing or invalid in treasure_secrets';
    END IF;

    RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- B. Dynamic Activation Gate & Data Protection Triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_check_event_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
BEGIN
    IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
        PERFORM public.internal_verify_expedition_dataset();
    END IF;
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_activation_gate
BEFORE UPDATE OF status ON public.event_config
FOR EACH ROW EXECUTE FUNCTION public.trg_check_event_activation();

CREATE OR REPLACE FUNCTION public.trg_protect_active_dataset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status FROM public.event_config WHERE id = 1;
    IF v_status = 'active' THEN
        RAISE EXCEPTION 'MUTATION_REJECTED: Dataset cannot be modified while event is active.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_protect_questions_row
BEFORE INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_active_dataset();

CREATE TRIGGER trg_protect_keys_row
BEFORE INSERT OR UPDATE OR DELETE ON public.question_keys
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_active_dataset();

CREATE TRIGGER trg_protect_hints_row
BEFORE INSERT OR UPDATE OR DELETE ON public.hints
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_active_dataset();

-- ----------------------------------------------------------------------------
-- C. Rate Limiting Utilities (Deterministic Lock Ordering: account < ip)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_acquire_rate_locks(
    p_account_key text,
    p_ip_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
BEGIN
    -- Ensure rows exist via atomic upsert
    INSERT INTO public.auth_rate_limits (identifier_type, identifier_key, failed_attempts, window_start_at)
    VALUES ('account', p_account_key, 0, clock_timestamp())
    ON CONFLICT (identifier_type, identifier_key) DO NOTHING;

    INSERT INTO public.auth_rate_limits (identifier_type, identifier_key, failed_attempts, window_start_at)
    VALUES ('ip', p_ip_key, 0, clock_timestamp())
    ON CONFLICT (identifier_type, identifier_key) DO NOTHING;

    -- Lock in deterministic order ('account' < 'ip') to prevent deadlocks
    PERFORM 1 FROM public.auth_rate_limits
    WHERE identifier_type = 'account' AND identifier_key = p_account_key
    FOR UPDATE;

    PERFORM 1 FROM public.auth_rate_limits
    WHERE identifier_type = 'ip' AND identifier_key = p_ip_key
    FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_check_auth_lockout(
    p_account_key text,
    p_ip_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_locked_until timestamptz;
BEGIN
    PERFORM public.internal_acquire_rate_locks(p_account_key, p_ip_key);

    -- Check account lock
    SELECT locked_until INTO v_locked_until
    FROM public.auth_rate_limits
    WHERE identifier_type = 'account' AND identifier_key = p_account_key;

    IF v_locked_until IS NOT NULL AND v_locked_until > clock_timestamp() THEN
        RETURN false;
    END IF;

    -- Check IP lock
    SELECT locked_until INTO v_locked_until
    FROM public.auth_rate_limits
    WHERE identifier_type = 'ip' AND identifier_key = p_ip_key;

    IF v_locked_until IS NOT NULL AND v_locked_until > clock_timestamp() THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_record_auth_result(
    p_account_key text,
    p_ip_key text,
    p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_window interval := INTERVAL '15 minutes';
    v_acc_record record;
    v_ip_record record;
BEGIN
    PERFORM public.internal_acquire_rate_locks(p_account_key, p_ip_key);

    IF p_success THEN
        UPDATE public.auth_rate_limits
        SET failed_attempts = 0, locked_until = NULL, window_start_at = clock_timestamp()
        WHERE (identifier_type = 'account' AND identifier_key = p_account_key)
           OR (identifier_type = 'ip' AND identifier_key = p_ip_key);
    ELSE
        -- Update account bucket
        SELECT * INTO v_acc_record
        FROM public.auth_rate_limits
        WHERE identifier_type = 'account' AND identifier_key = p_account_key;

        IF v_acc_record.window_start_at < clock_timestamp() - v_window THEN
            UPDATE public.auth_rate_limits
            SET failed_attempts = 1, window_start_at = clock_timestamp(), locked_until = NULL
            WHERE identifier_type = 'account' AND identifier_key = p_account_key;
        ELSE
            UPDATE public.auth_rate_limits
            SET failed_attempts = failed_attempts + 1,
                locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN clock_timestamp() + v_window ELSE NULL END
            WHERE identifier_type = 'account' AND identifier_key = p_account_key;
        END IF;

        -- Update IP bucket
        SELECT * INTO v_ip_record
        FROM public.auth_rate_limits
        WHERE identifier_type = 'ip' AND identifier_key = p_ip_key;

        IF v_ip_record.window_start_at < clock_timestamp() - v_window THEN
            UPDATE public.auth_rate_limits
            SET failed_attempts = 1, window_start_at = clock_timestamp(), locked_until = NULL
            WHERE identifier_type = 'ip' AND identifier_key = p_ip_key;
        ELSE
            UPDATE public.auth_rate_limits
            SET failed_attempts = failed_attempts + 1,
                locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN clock_timestamp() + v_window ELSE NULL END
            WHERE identifier_type = 'ip' AND identifier_key = p_ip_key;
        END IF;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- D. Team Authentication (Server-Generated CSPRNG Token, NULL-Safe Check)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authenticate_team(
    p_team_identifier text,
    p_password text,
    p_client_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_norm_ident text;
    v_client_ip text;
    v_team record;
    v_account_key text;
    v_allowed boolean;
    v_raw_token text;
    v_token_hash text;
BEGIN
    -- 1. Reject NULL, empty, or whitespace-only inputs immediately
    IF p_team_identifier IS NULL OR TRIM(p_team_identifier) = '' OR p_password IS NULL OR p_password = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_CREDENTIALS');
    END IF;

    v_norm_ident := UPPER(TRIM(p_team_identifier));
    v_client_ip := COALESCE(NULLIF(TRIM(p_client_ip), ''), '127.0.0.1');

    -- 2. Canonicalize identity before rate limiting
    SELECT * INTO v_team
    FROM public.teams
    WHERE (callsign = v_norm_ident OR UPPER(team_name) = v_norm_ident) AND is_disqualified = false;

    IF v_team.id IS NOT NULL THEN
        v_account_key := 'team:' || v_team.id::text;
    ELSE
        -- Unknown account: hash identifier to prevent unbounded string key growth
        v_account_key := 'unknown:' || extensions.digest(v_norm_ident, 'sha256')::text;
    END IF;

    -- 3. Pre-check rate limit before expensive password verification
    v_allowed := public.internal_check_auth_lockout(v_account_key, v_client_ip);
    IF NOT v_allowed THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_AUTH_RATE_LIMITED');
    END IF;

    -- 4. Explicit NULL-safe password verification
    IF v_team.id IS NULL OR v_team.password_hash IS NULL OR extensions.crypt(p_password, v_team.password_hash) IS DISTINCT FROM v_team.password_hash THEN
        PERFORM public.internal_record_auth_result(v_account_key, v_client_ip, false);
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_CREDENTIALS');
    END IF;

    -- 5. Record success (clears failure counters)
    PERFORM public.internal_record_auth_result(v_account_key, v_client_ip, true);

    -- 6. Generate cryptographically random 256-bit token inside database
    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := extensions.digest(v_raw_token, 'sha256')::text;

    -- 7. Single active session per team: Revoke previous active sessions
    PERFORM 1 FROM public.teams WHERE id = v_team.id FOR UPDATE;

    UPDATE public.team_sessions
    SET revoked_at = clock_timestamp()
    WHERE team_id = v_team.id AND revoked_at IS NULL;

    INSERT INTO public.team_sessions (team_id, token_hash, expires_at)
    VALUES (v_team.id, v_token_hash, clock_timestamp() + INTERVAL '24 hours');

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_token,
        'team_id', v_team.id,
        'team_name', v_team.team_name,
        'callsign', v_team.callsign
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- E. Marshal Authentication (Server-Generated CSPRNG Token, NULL-Safe Check)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authenticate_marshal(
    p_username text,
    p_password text,
    p_client_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_norm_user text;
    v_client_ip text;
    v_marshal record;
    v_account_key text;
    v_allowed boolean;
    v_raw_token text;
    v_token_hash text;
BEGIN
    -- 1. Reject NULL, empty, or whitespace-only inputs immediately
    IF p_username IS NULL OR TRIM(p_username) = '' OR p_password IS NULL OR p_password = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_CREDENTIALS');
    END IF;

    v_norm_user := UPPER(TRIM(p_username));
    v_client_ip := COALESCE(NULLIF(TRIM(p_client_ip), ''), '127.0.0.1');

    -- 2. Canonicalize identity
    SELECT * INTO v_marshal
    FROM public.marshals
    WHERE UPPER(username) = v_norm_user AND is_active = true;

    IF v_marshal.id IS NOT NULL THEN
        v_account_key := 'marshal:' || v_marshal.id::text;
    ELSE
        v_account_key := 'unknown_m:' || extensions.digest(v_norm_user, 'sha256')::text;
    END IF;

    -- 3. Rate limit check
    v_allowed := public.internal_check_auth_lockout(v_account_key, v_client_ip);
    IF NOT v_allowed THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_AUTH_RATE_LIMITED');
    END IF;

    -- 4. Explicit NULL-safe password verification
    IF v_marshal.id IS NULL OR v_marshal.password_hash IS NULL OR extensions.crypt(p_password, v_marshal.password_hash) IS DISTINCT FROM v_marshal.password_hash THEN
        PERFORM public.internal_record_auth_result(v_account_key, v_client_ip, false);
        RETURN jsonb_build_object('success', false, 'error', 'ERR_INVALID_CREDENTIALS');
    END IF;

    -- 5. Record success
    PERFORM public.internal_record_auth_result(v_account_key, v_client_ip, true);

    -- 6. Generate secure 256-bit token
    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := extensions.digest(v_raw_token, 'sha256')::text;

    -- 7. Revoke existing active sessions
    PERFORM 1 FROM public.marshals WHERE id = v_marshal.id FOR UPDATE;

    UPDATE public.marshal_sessions
    SET revoked_at = clock_timestamp()
    WHERE marshal_id = v_marshal.id AND revoked_at IS NULL;

    INSERT INTO public.marshal_sessions (marshal_id, token_hash, expires_at)
    VALUES (v_marshal.id, v_token_hash, clock_timestamp() + INTERVAL '12 hours');

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_token,
        'marshal_id', v_marshal.id,
        'username', v_marshal.username,
        'callsign', v_marshal.callsign
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- F. Session Validation Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_validate_team_session(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_token_hash text;
    v_team_id uuid;
BEGIN
    IF p_session_token IS NULL OR LENGTH(p_session_token) < 32 THEN
        RETURN NULL;
    END IF;
    v_token_hash := extensions.digest(p_session_token, 'sha256')::text;
    SELECT team_id INTO v_team_id
    FROM public.team_sessions
    WHERE token_hash = v_token_hash AND expires_at > clock_timestamp() AND revoked_at IS NULL;
    RETURN v_team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_validate_marshal_session(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_token_hash text;
    v_marshal_id uuid;
BEGIN
    IF p_session_token IS NULL OR LENGTH(p_session_token) < 32 THEN
        RETURN NULL;
    END IF;
    v_token_hash := extensions.digest(p_session_token, 'sha256')::text;
    SELECT marshal_id INTO v_marshal_id
    FROM public.marshal_sessions
    WHERE token_hash = v_token_hash AND expires_at > clock_timestamp() AND revoked_at IS NULL;
    RETURN v_marshal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_team_session(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_token_hash text;
BEGIN
    IF p_session_token IS NULL OR LENGTH(p_session_token) < 32 THEN
        RETURN false;
    END IF;

    v_token_hash := extensions.digest(p_session_token, 'sha256')::text;

    UPDATE public.team_sessions
    SET revoked_at = clock_timestamp()
    WHERE token_hash = v_token_hash AND revoked_at IS NULL;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_marshal_session(p_marshal_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_token_hash text;
BEGIN
    IF p_marshal_session_token IS NULL OR LENGTH(p_marshal_session_token) < 32 THEN
        RETURN false;
    END IF;

    v_token_hash := extensions.digest(p_marshal_session_token, 'sha256')::text;

    UPDATE public.marshal_sessions
    SET revoked_at = clock_timestamp()
    WHERE token_hash = v_token_hash AND revoked_at IS NULL;

    RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- G. Answer Submission (Serialized progression check per team, unlimited attempts)
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

    -- 8. Normalize answer and compare against stored bcrypt hash (NULL-safe)
    v_norm_ans := LOWER(REGEXP_REPLACE(TRIM(p_submitted_answer), '\s+', ' ', 'g'));
    SELECT * INTO v_key FROM public.question_keys WHERE question_id = p_question_id;

    IF v_key.answer_hash IS NULL OR extensions.crypt(v_norm_ans, v_key.answer_hash) IS DISTINCT FROM v_key.answer_hash THEN
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
-- H. Hint Reveal (Strict Event Window, Lock Team First, Validate Prerequisites)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_reveal_hint(
    p_session_token text,
    p_hint_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_team_id uuid;
    v_event record;
    v_hint record;
    v_q record;
    v_revealed_cnt int4;
    v_solved_cnt int4;
BEGIN
    -- 1. Validate session
    v_team_id := public.internal_validate_team_session(p_session_token);
    IF v_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_UNAUTHORIZED');
    END IF;

    -- 2. Verify event status and strict time window (Fail closed on NULL or missing)
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

    -- 3. Lock team record first to serialize all team quota & progress checks
    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

    -- 4. Lookup hint and parent question
    SELECT * INTO v_hint FROM public.hints WHERE id = p_hint_id;
    IF v_hint.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_HINT_NOT_FOUND');
    END IF;

    SELECT * INTO v_q FROM public.questions WHERE id = v_hint.question_id;
    IF v_q.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_QUESTION_NOT_FOUND');
    END IF;

    -- 5. If already revealed by this team, return content (idempotent, no quota deduction)
    IF EXISTS (SELECT 1 FROM public.team_hints WHERE team_id = v_team_id AND hint_id = p_hint_id) THEN
        RETURN jsonb_build_object('success', true, 'content', v_hint.content, 'already_revealed', true);
    END IF;

    -- 6. Validate level unlock: team cannot reveal hints for locked future levels
    IF v_hint.level_number > 1 THEN
        FOR l IN 1..(v_hint.level_number - 1) LOOP
            SELECT COUNT(*) INTO v_solved_cnt
            FROM public.team_progress
            WHERE team_id = v_team_id AND level_number = l;

            IF v_solved_cnt <> (CASE WHEN l < 5 THEN 10 ELSE 5 END) THEN
                RETURN jsonb_build_object('success', false, 'error', 'ERR_PREVIOUS_LEVEL_INCOMPLETE');
            END IF;
        END LOOP;
    END IF;

    -- 7. Validate Level 5 prerequisite: clue must be unlocked before revealing hints
    IF v_hint.level_number = 5 AND v_q.dependency_question_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.team_progress
            WHERE team_id = v_team_id AND question_id = v_q.dependency_question_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'ERR_PREREQUISITE_CLUE_LOCKED');
        END IF;
    END IF;

    -- 8. Disallow reveals on already solved questions
    IF EXISTS (SELECT 1 FROM public.team_progress WHERE team_id = v_team_id AND question_id = v_hint.question_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_QUESTION_ALREADY_SOLVED');
    END IF;

    -- 9. Enforce 3 hints per level quota
    SELECT COUNT(*) INTO v_revealed_cnt
    FROM public.team_hints
    WHERE team_id = v_team_id AND level_number = v_hint.level_number;

    IF v_revealed_cnt >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_HINT_QUOTA_EXCEEDED');
    END IF;

    -- 10. Record reveal
    INSERT INTO public.team_hints (team_id, hint_id, question_id, level_number)
    VALUES (v_team_id, p_hint_id, v_hint.question_id, v_hint.level_number);

    RETURN jsonb_build_object(
        'success', true,
        'content', v_hint.content,
        'hints_remaining', (2 - v_revealed_cnt)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- I. Marshal Winner Verification (Deterministic Lock Order, Exhaustive 45 Check)
-- ----------------------------------------------------------------------------
-- LOCK ACQUISITION ORDER TO PREVENT DEADLOCKS:
-- 1. public.event_config (id = 1) FOR UPDATE
-- 2. public.treasure_secrets (id = 1) FOR UPDATE
-- 3. public.teams (id = v_team_id) FOR UPDATE
-- All transactions verifying a winner follow this strict order.
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

    -- 3. Deterministic Lock 1: Lock event_config
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

    -- 4. Deterministic Lock 2: Lock treasure_secrets
    SELECT * INTO v_secret FROM public.treasure_secrets WHERE id = 1 FOR UPDATE;
    IF v_secret.is_claimed = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'ERR_EVENT_ALREADY_WON');
    END IF;

    -- 5. Deterministic Lock 3: Lock winning team row
    PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

    -- 7. Exhaustive verification of all 45 required questions & level distribution
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

    -- 8. Verify 128-bit physical token (NULL-safe timing-safe comparison)
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

    -- 9. Atomically commit winner
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

-- ----------------------------------------------------------------------------
-- J. Public Winner Retrieval (Sanitized RPC, Leaks Zero Private Fields)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_winner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_res jsonb;
BEGIN
    SELECT jsonb_build_object(
        'event_completed', (e.status = 'completed'),
        'team_name', t.team_name,
        'callsign', t.callsign,
        'won_at', v.verified_at
    ) INTO v_res
    FROM public.event_config e
    LEFT JOIN public.winner_verifications v ON e.id = v.event_id
    LEFT JOIN public.teams t ON v.winning_team_id = t.id
    WHERE e.id = 1;

    RETURN COALESCE(v_res, jsonb_build_object('event_completed', false));
END;
$$;

-- Explicit ownership assignment
ALTER FUNCTION public.authenticate_team(text, text, text) OWNER TO postgres;
ALTER FUNCTION public.authenticate_marshal(text, text, text) OWNER TO postgres;
ALTER FUNCTION public.revoke_team_session(text) OWNER TO postgres;
ALTER FUNCTION public.revoke_marshal_session(text) OWNER TO postgres;
ALTER FUNCTION public.internal_validate_team_session(text) OWNER TO postgres;
ALTER FUNCTION public.internal_validate_marshal_session(text) OWNER TO postgres;
ALTER FUNCTION public.submit_team_answer(text, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.request_reveal_hint(text, uuid) OWNER TO postgres;
ALTER FUNCTION public.marshal_verify_treasure(text, text, text) OWNER TO postgres;
ALTER FUNCTION public.get_public_winner() OWNER TO postgres;

-- ============================================================================
-- ROW LEVEL SECURITY & PERMISSION REVOCATIONS
-- ============================================================================

-- Enable RLS across all tables
ALTER TABLE public.event_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marshals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marshal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasure_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winner_verifications ENABLE ROW LEVEL SECURITY;

-- Revoke all table, sequence, and function access from untrusted roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Public RLS policy: only levels table is directly readable
CREATE POLICY p_read_levels ON public.levels FOR SELECT TO anon, authenticated, service_role USING (true);
GRANT SELECT ON public.levels TO anon, authenticated, service_role;

-- Sanitized RPC execution grant for public
GRANT EXECUTE ON FUNCTION public.get_public_winner() TO anon, authenticated, service_role;

-- Dedicated Service Role Grants (Used strictly by Server Actions)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT EXECUTE ON FUNCTION public.authenticate_team(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.authenticate_marshal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_team_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_marshal_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_validate_team_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_validate_marshal_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_team_answer(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_reveal_hint(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marshal_verify_treasure(text, text, text) TO service_role;

