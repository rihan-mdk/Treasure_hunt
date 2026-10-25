-- ============================================================================
-- THE HUNT EXPEDITION — PHASE 1 CORE SCHEMA ROLLBACK DRAFT
-- Target Project: uguvotvttdtclnhbsywr (Staging)
-- Version: 20261025000000_rollback
--
-- ============================================================================
-- CRITICAL DATA LOSS & DEPENDENCY WARNING:
-- Executing this script drops all Phase 1 application tables, functions, triggers,
-- and RLS policies. Any existing participant progress, revealed hints, team
-- sessions, and winner records WILL BE PERMANENTLY DESTROYED.
-- DO NOT EXECUTE ON A LIVE PRODUCTION DATABASE.
-- Use strictly for disposable test cleanup or pre-deployment staging reversion.
-- ============================================================================

BEGIN;

-- 1. Drop Triggers on Public Tables
DROP TRIGGER IF EXISTS trg_event_activation_gate ON public.event_config;
DROP TRIGGER IF EXISTS trg_protect_questions_row ON public.questions;
DROP TRIGGER IF EXISTS trg_protect_keys_row ON public.question_keys;
DROP TRIGGER IF EXISTS trg_protect_hints_row ON public.hints;

-- 2. Drop Functions with Exact Parameter Signatures
DROP FUNCTION IF EXISTS public.trg_check_event_activation();
DROP FUNCTION IF EXISTS public.trg_protect_active_dataset();
DROP FUNCTION IF EXISTS public.internal_verify_expedition_dataset();
DROP FUNCTION IF EXISTS public.internal_acquire_rate_locks(text, text);
DROP FUNCTION IF EXISTS public.internal_check_auth_lockout(text, text);
DROP FUNCTION IF EXISTS public.internal_record_auth_result(text, text, boolean);
DROP FUNCTION IF EXISTS public.authenticate_team(text, text, text);
DROP FUNCTION IF EXISTS public.authenticate_marshal(text, text, text);
DROP FUNCTION IF EXISTS public.revoke_team_session(text);
DROP FUNCTION IF EXISTS public.revoke_marshal_session(text);
DROP FUNCTION IF EXISTS public.internal_validate_team_session(text);
DROP FUNCTION IF EXISTS public.internal_validate_marshal_session(text);
DROP FUNCTION IF EXISTS public.submit_team_answer(text, uuid, text);
DROP FUNCTION IF EXISTS public.request_reveal_hint(text, uuid);
DROP FUNCTION IF EXISTS public.marshal_verify_treasure(text, text, text);
DROP FUNCTION IF EXISTS public.get_public_winner();

-- 3. Drop RLS Policies
DROP POLICY IF EXISTS p_read_levels ON public.levels;

-- 4. Drop Tables in Strict Reverse-Dependency Order
-- Remove circular/cross-table foreign keys first
ALTER TABLE IF EXISTS public.event_config DROP CONSTRAINT IF EXISTS fk_event_winner;

-- Drop child tables with foreign keys
DROP TABLE IF EXISTS public.winner_verifications;
DROP TABLE IF EXISTS public.treasure_secrets;
DROP TABLE IF EXISTS public.team_hints;
DROP TABLE IF EXISTS public.team_progress;
DROP TABLE IF EXISTS public.hints;
DROP TABLE IF EXISTS public.question_keys;
DROP TABLE IF EXISTS public.questions;
DROP TABLE IF EXISTS public.levels;
DROP TABLE IF EXISTS public.team_sessions;
DROP TABLE IF EXISTS public.marshal_sessions;
DROP TABLE IF EXISTS public.auth_rate_limits;
DROP TABLE IF EXISTS public.marshals;
DROP TABLE IF EXISTS public.teams;
DROP TABLE IF EXISTS public.event_config;

-- Note: The pgcrypto extension is preserved as other Supabase services may depend on it.

COMMIT;
