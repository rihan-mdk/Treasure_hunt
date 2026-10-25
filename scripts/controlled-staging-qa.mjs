/**
 * ============================================================================
 * THE HUNT EXPEDITION — CONTROLLED STAGING QA EXECUTION SCRIPT (CHECKPOINT F)
 * Target: uguvotvttdtclnhbsywr (Staging Only)
 * Forbidden: kcupmzqnyitkchkmftcl (Production — Strictly Off-Limits)
 * ============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const AUTHORIZED_STAGING_REF = "uguvotvttdtclnhbsywr";
const FORBIDDEN_PRODUCTION_REF = "kcupmzqnyitkchkmftcl";
const CREDENTIALS_PATH = "C:\\Users\\Muhammed Rihan MR\\the-hunt-staging-creds\\staging-qa-identities.json";

async function runStagingQA() {
  console.log("================================================================================");
  console.log(" THE HUNT EXPEDITION — CHECKPOINT F: CONTROLLED STAGING QA");
  console.log(" Target: uguvotvttdtclnhbsywr (Staging Database)");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // Phase 1: Read-Only Staging Preflight
  // --------------------------------------------------------------------------
  console.log("--- PHASE 1: READ-ONLY STAGING PREFLIGHT ---");

  // 1. Verify credential file exists outside repo
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`PREFLIGHT_FAIL: QA credentials file not found at '${CREDENTIALS_PATH}'.`);
  }
  const rawCreds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  if (rawCreds.target_project_ref !== AUTHORIZED_STAGING_REF) {
    throw new Error(`PREFLIGHT_FAIL: Credential file ref '${rawCreds.target_project_ref}' mismatch.`);
  }
  console.log("✔ Private QA credentials file loaded securely into memory.");

  // Map credentials by callsign/username (held in-memory only, never logged)
  const credsMap = {};
  for (const t of rawCreds.identities.teams) {
    credsMap[t.callsign] = t.password;
  }
  credsMap[rawCreds.identities.marshal.username] = rawCreds.identities.marshal.password;

  // 2. Connect to staging pooler
  const host = "aws-0-ap-south-1.pooler.supabase.com";
  const port = 5432;
  const user = `postgres.${AUTHORIZED_STAGING_REF}`;
  const database = "postgres";
  const password = process.env.PGPASSWORD;

  if (!password) {
    throw new Error("PREFLIGHT_FAIL: PGPASSWORD environment variable missing.");
  }

  const pool = new pg.Pool({
    host,
    port,
    user,
    database,
    password,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();
  console.log("✔ Connected to Supabase staging session pooler.");

  try {
    // 3. Query connection identity
    const identRes = await client.query(`
      SELECT 
        current_database() AS db_name,
        current_user AS user_name,
        clock_timestamp() AS server_time;
    `);
    const ident = identRes.rows[0];
    if (ident.db_name.includes(FORBIDDEN_PRODUCTION_REF) || ident.user_name.includes(FORBIDDEN_PRODUCTION_REF)) {
      throw new Error("FATAL_SECURITY_TRAP: Connected identity matches forbidden production project!");
    }
    if (ident.user_name.startsWith("postgres.") && !ident.user_name.includes(AUTHORIZED_STAGING_REF)) {
      throw new Error(`PREFLIGHT_FAIL: Connected user '${ident.user_name}' does not match staging ref.`);
    }
    console.log(`✔ Verified live database identity: DB=${ident.db_name}, User=${ident.user_name}`);

    // 4. Query event_config
    const eventRow = (await client.query("SELECT * FROM public.event_config WHERE id = 1;")).rows[0];
    if (!eventRow) throw new Error("PREFLIGHT_FAIL: event_config row 1 is missing.");
    if (eventRow.status !== "draft") throw new Error(`PREFLIGHT_FAIL: event_config status is '${eventRow.status}', expected 'draft'.`);
    if (eventRow.is_locked !== false) throw new Error("PREFLIGHT_FAIL: event_config is_locked is true.");
    if (eventRow.winner_team_id !== null) throw new Error("PREFLIGHT_FAIL: event_config winner_team_id is set.");
    if (eventRow.start_at !== null || eventRow.end_at !== null) throw new Error("PREFLIGHT_FAIL: event_config dates are set.");
    console.log("✔ Verified event_config: status='draft', is_locked=false, dates=NULL, winner=NULL.");

    // 5. Query content catalog counts
    const levelsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.levels;")).rows[0].c);
    const questionsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.questions;")).rows[0].c);
    const keysCount = Number((await client.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c);
    const hintsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c);

    if (levelsCount !== 5 || questionsCount !== 45 || keysCount !== 45 || hintsCount !== 135) {
      throw new Error(`PREFLIGHT_FAIL: Catalog mismatch (levels=${levelsCount}, questions=${questionsCount}, keys=${keysCount}, hints=${hintsCount}).`);
    }
    console.log(`✔ Verified catalog: 5 levels, 45 questions, 45 question keys, 135 hints.`);

    // 6. Query QA accounts
    const teams = (await client.query("SELECT id, team_name, callsign FROM public.teams ORDER BY callsign;")).rows;
    const marshals = (await client.query("SELECT id, username, callsign FROM public.marshals ORDER BY callsign;")).rows;

    if (teams.length !== 3 || marshals.length !== 1) {
      throw new Error(`PREFLIGHT_FAIL: QA identities mismatch (teams=${teams.length}, marshals=${marshals.length}).`);
    }
    console.log(`✔ Verified QA identities: 3 teams (${teams.map(t => t.callsign).join(", ")}), 1 marshal (${marshals[0].callsign}).`);

    // 7. Verify zero unexpected records
    const teamProgressCount = Number((await client.query("SELECT COUNT(*) as c FROM public.team_progress;")).rows[0].c);
    const teamHintsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.team_hints;")).rows[0].c);
    const secretsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c);
    const winnersCount = Number((await client.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c);

    if (teamProgressCount !== 0 || teamHintsCount !== 0 || secretsCount !== 0 || winnersCount !== 0) {
      throw new Error(`PREFLIGHT_FAIL: Unexpected records found (progress=${teamProgressCount}, hints=${teamHintsCount}, secrets=${secretsCount}, winners=${winnersCount}).`);
    }
    console.log("✔ Verified clean baseline: 0 progress rows, 0 revealed hints, 0 secrets, 0 winner records.");
    console.log("--- PHASE 1 PREFLIGHT PASSED WITH ZERO DISCREPANCIES ---\n");

    const testResults = [];

    // --------------------------------------------------------------------------
    // Phase 2: Controlled Authentication Tests
    // --------------------------------------------------------------------------
    console.log("--- PHASE 2: CONTROLLED AUTHENTICATION TESTS ---");

    // AUTH-01: Valid team login (QA-TEAM-ALPHA)
    const authAlphaRes = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credsMap["QA-TEAM-ALPHA"], "127.0.0.1"]
    )).rows[0].res;

    if (authAlphaRes.success && authAlphaRes.session_token && authAlphaRes.callsign === "QA-TEAM-ALPHA") {
      testResults.push({ id: "AUTH-01", name: "Valid team login (QA-TEAM-ALPHA)", status: "PASS", evidence: `Session issued for ${authAlphaRes.callsign}` });
      console.log("✔ AUTH-01: Valid team login -> PASS");
    } else {
      testResults.push({ id: "AUTH-01", name: "Valid team login", status: "FAIL", evidence: JSON.stringify(authAlphaRes) });
      console.log("✖ AUTH-01: Valid team login -> FAIL");
    }

    const alphaToken = authAlphaRes.session_token;

    // AUTH-02: Invalid team credentials rejected
    const authAlphaInvalid = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", "WrongPassword123!", "127.0.0.1"]
    )).rows[0].res;

    if (!authAlphaInvalid.success && authAlphaInvalid.error === "ERR_INVALID_CREDENTIALS") {
      testResults.push({ id: "AUTH-02", name: "Invalid team credentials rejected", status: "PASS", evidence: "Returned ERR_INVALID_CREDENTIALS" });
      console.log("✔ AUTH-02: Invalid team credentials rejected -> PASS");
    } else {
      testResults.push({ id: "AUTH-02", name: "Invalid team credentials rejected", status: "FAIL", evidence: JSON.stringify(authAlphaInvalid) });
      console.log("✖ AUTH-02: Invalid team credentials rejected -> FAIL");
    }

    // AUTH-03: Valid marshal login (qa_marshal_ground)
    const authMarshalRes = (await client.query(
      "SELECT public.authenticate_marshal($1, $2, $3) as res;",
      ["qa_marshal_ground", credsMap["qa_marshal_ground"], "127.0.0.1"]
    )).rows[0].res;

    if (authMarshalRes.success && authMarshalRes.session_token && authMarshalRes.callsign === "QA-MARSHAL-GROUND") {
      testResults.push({ id: "AUTH-03", name: "Valid marshal login (qa_marshal_ground)", status: "PASS", evidence: `Session issued for ${authMarshalRes.callsign}` });
      console.log("✔ AUTH-03: Valid marshal login -> PASS");
    } else {
      testResults.push({ id: "AUTH-03", name: "Valid marshal login", status: "FAIL", evidence: JSON.stringify(authMarshalRes) });
      console.log("✖ AUTH-03: Valid marshal login -> FAIL");
    }

    const marshalToken = authMarshalRes.session_token;

    // AUTH-04: Invalid marshal credentials rejected
    const authMarshalInvalid = (await client.query(
      "SELECT public.authenticate_marshal($1, $2, $3) as res;",
      ["qa_marshal_ground", "WrongMarshalPass!", "127.0.0.1"]
    )).rows[0].res;

    if (!authMarshalInvalid.success && authMarshalInvalid.error === "ERR_INVALID_CREDENTIALS") {
      testResults.push({ id: "AUTH-04", name: "Invalid marshal credentials rejected", status: "PASS", evidence: "Returned ERR_INVALID_CREDENTIALS" });
      console.log("✔ AUTH-04: Invalid marshal credentials rejected -> PASS");
    } else {
      testResults.push({ id: "AUTH-04", name: "Invalid marshal credentials rejected", status: "FAIL", evidence: JSON.stringify(authMarshalInvalid) });
      console.log("✖ AUTH-04: Invalid marshal credentials rejected -> FAIL");
    }

    // AUTH-05: Session persistence across page navigation / validation query
    const validateAlpha = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [alphaToken]
    )).rows[0].team_id;

    if (validateAlpha && validateAlpha === authAlphaRes.team_id) {
      testResults.push({ id: "AUTH-05", name: "Team session persistence / validation", status: "PASS", evidence: `Token resolves to team_id ${validateAlpha}` });
      console.log("✔ AUTH-05: Team session persistence / validation -> PASS");
    } else {
      testResults.push({ id: "AUTH-05", name: "Team session persistence", status: "FAIL", evidence: `Resolved ${validateAlpha}` });
      console.log("✖ AUTH-05: Team session persistence -> FAIL");
    }

    // AUTH-06: Role boundary separation (Team token cannot authenticate as marshal)
    const marshalBoundaryCheck = (await client.query(
      "SELECT public.internal_validate_marshal_session($1) as marshal_id;",
      [alphaToken]
    )).rows[0].marshal_id;

    if (marshalBoundaryCheck === null) {
      testResults.push({ id: "AUTH-06", name: "Team token rejected by marshal route guard", status: "PASS", evidence: "internal_validate_marshal_session returned NULL" });
      console.log("✔ AUTH-06: Team token rejected by marshal guard -> PASS");
    } else {
      testResults.push({ id: "AUTH-06", name: "Team token rejected by marshal route guard", status: "FAIL", evidence: `Leaked marshal_id ${marshalBoundaryCheck}` });
      console.log("✖ AUTH-06: Team token rejected by marshal guard -> FAIL");
    }

    // AUTH-07: Role boundary separation (Marshal token cannot authenticate as team)
    const teamBoundaryCheck = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [marshalToken]
    )).rows[0].team_id;

    if (teamBoundaryCheck === null) {
      testResults.push({ id: "AUTH-07", name: "Marshal token rejected by team route guard", status: "PASS", evidence: "internal_validate_team_session returned NULL" });
      console.log("✔ AUTH-07: Marshal token rejected by team guard -> PASS");
    } else {
      testResults.push({ id: "AUTH-07", name: "Marshal token rejected by team route guard", status: "FAIL", evidence: `Leaked team_id ${teamBoundaryCheck}` });
      console.log("✖ AUTH-07: Marshal token rejected by team guard -> FAIL");
    }

    // AUTH-08: Tampered or invalid session token rejected
    const tamperedToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const tamperedCheck = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [tamperedToken]
    )).rows[0].team_id;

    if (tamperedCheck === null) {
      testResults.push({ id: "AUTH-08", name: "Tampered session token rejected", status: "PASS", evidence: "Tampered token returned NULL" });
      console.log("✔ AUTH-08: Tampered session token rejected -> PASS");
    } else {
      testResults.push({ id: "AUTH-08", name: "Tampered session token rejected", status: "FAIL", evidence: "Tampered token accepted" });
      console.log("✖ AUTH-08: Tampered session token rejected -> FAIL");
    }

    // AUTH-09: Logout invalidates session
    await client.query("SELECT public.revoke_team_session($1);", [alphaToken]);
    const postLogoutCheck = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [alphaToken]
    )).rows[0].team_id;

    if (postLogoutCheck === null) {
      testResults.push({ id: "AUTH-09", name: "Session revocation on logout", status: "PASS", evidence: "Revoked token returns NULL on validation" });
      console.log("✔ AUTH-09: Session revocation on logout -> PASS");
    } else {
      testResults.push({ id: "AUTH-09", name: "Session revocation on logout", status: "FAIL", evidence: "Session still valid after revoke" });
      console.log("✖ AUTH-09: Session revocation on logout -> FAIL");
    }

    // Revoke marshal session as well
    await client.query("SELECT public.revoke_marshal_session($1);", [marshalToken]);
    console.log("✔ Marshal test session revoked cleanly.");

    // --------------------------------------------------------------------------
    // Phase 3: Controlled Gameplay & Hints Under Draft Invariants
    // --------------------------------------------------------------------------
    console.log("\n--- PHASE 3: CONTROLLED GAMEPLAY & HINT DRAFT-GATE INVARIANTS ---");

    // Obtain a fresh valid session for QA-TEAM-ALPHA
    const alphaFreshLogin = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credsMap["QA-TEAM-ALPHA"], "127.0.0.1"]
    )).rows[0].res;
    const alphaActiveToken = alphaFreshLogin.session_token;

    // Fetch Level 1 Question 1 ID and Hint 1 ID for testing
    const q1Res = await client.query(
      "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
    );
    const q1Id = q1Res.rows[0].id;

    const h1Res = await client.query(
      "SELECT id FROM public.hints WHERE question_id = $1 AND hint_number = 1;",
      [q1Id]
    );
    const h1Id = h1Res.rows[0].id;

    // GAME-01: Answer submission blocked while event is in 'draft' mode
    const answerRes = (await client.query(
      "SELECT public.submit_team_answer($1, $2, $3) as res;",
      [alphaActiveToken, q1Id, "test-answer"]
    )).rows[0].res;

    if (!answerRes.success && answerRes.error === "ERR_EVENT_NOT_ACTIVE") {
      testResults.push({ id: "GAME-01", name: "Answer submission blocked in draft status", status: "PASS", evidence: "submit_team_answer returned ERR_EVENT_NOT_ACTIVE" });
      console.log("✔ GAME-01: Answer submission blocked in draft status -> PASS");
    } else {
      testResults.push({ id: "GAME-01", name: "Answer submission blocked in draft status", status: "FAIL", evidence: JSON.stringify(answerRes) });
      console.log("✖ GAME-01: Answer submission blocked in draft status -> FAIL");
    }

    // GAME-02: Hint reveal blocked while event is in 'draft' mode
    const hintRes = (await client.query(
      "SELECT public.request_reveal_hint($1, $2) as res;",
      [alphaActiveToken, h1Id]
    )).rows[0].res;

    if (!hintRes.success && hintRes.error === "ERR_EVENT_NOT_ACTIVE") {
      testResults.push({ id: "GAME-02", name: "Hint reveal blocked in draft status", status: "PASS", evidence: "request_reveal_hint returned ERR_EVENT_NOT_ACTIVE" });
      console.log("✔ GAME-02: Hint reveal blocked in draft status -> PASS");
    } else {
      testResults.push({ id: "GAME-02", name: "Hint reveal blocked in draft status", status: "FAIL", evidence: JSON.stringify(hintRes) });
      console.log("✖ GAME-02: Hint reveal blocked in draft status -> FAIL");
    }

    // GAME-03: Gameplay progression advancing on remote staging
    // In draft mode, answers advancing progress is BLOCKED by design because event is draft and dates are unset
    testResults.push({
      id: "GAME-03",
      name: "Gameplay progression advancing on staging",
      status: "BLOCKED",
      evidence: "Blocked by design: event is in draft mode. submit_team_answer strictly enforces status='active' and valid dates. Event activation is not authorized.",
    });
    console.log("🔒 GAME-03: Gameplay progression advancing -> BLOCKED (Enforces event draft gate)");

    // GAME-04: Hint reveal quota consumption on remote staging
    testResults.push({
      id: "GAME-04",
      name: "Hint quota consumption on staging",
      status: "BLOCKED",
      evidence: "Blocked by design: event is in draft mode. request_reveal_hint strictly enforces status='active'. Event activation is not authorized.",
    });
    console.log("🔒 GAME-04: Hint quota consumption -> BLOCKED (Enforces event draft gate)");

    // Clean up alpha active session
    await client.query("SELECT public.revoke_team_session($1);", [alphaActiveToken]);

    // --------------------------------------------------------------------------
    // Phase 4: Session Security, Concurrency & Rate Limiting
    // --------------------------------------------------------------------------
    console.log("\n--- PHASE 4: SESSION SECURITY, CONCURRENCY & RATE LIMITING ---");

    // SEC-01: Cross-team session isolation
    const loginAlpha = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credsMap["QA-TEAM-ALPHA"], "127.0.0.1"]
    )).rows[0].res;

    const loginBravo = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-BRAVO", credsMap["QA-TEAM-BRAVO"], "127.0.0.1"]
    )).rows[0].res;

    const valAlpha = (await client.query("SELECT public.internal_validate_team_session($1) as team_id;", [loginAlpha.session_token])).rows[0].team_id;
    const valBravo = (await client.query("SELECT public.internal_validate_team_session($1) as team_id;", [loginBravo.session_token])).rows[0].team_id;

    if (valAlpha === loginAlpha.team_id && valBravo === loginBravo.team_id && valAlpha !== valBravo) {
      testResults.push({ id: "SEC-01", name: "Cross-team session isolation", status: "PASS", evidence: `Alpha ID (${valAlpha}) !== Bravo ID (${valBravo})` });
      console.log("✔ SEC-01: Cross-team session isolation -> PASS");
    } else {
      testResults.push({ id: "SEC-01", name: "Cross-team session isolation", status: "FAIL", evidence: "Session cross-contamination" });
      console.log("✖ SEC-01: Cross-team session isolation -> FAIL");
    }

    // SEC-02: Single active session enforcement (concurrent login revokes previous session)
    const loginAlphaSecond = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credsMap["QA-TEAM-ALPHA"], "127.0.0.1"]
    )).rows[0].res;

    const oldSessionCheck = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [loginAlpha.session_token]
    )).rows[0].team_id;

    const newSessionCheck = (await client.query(
      "SELECT public.internal_validate_team_session($1) as team_id;",
      [loginAlphaSecond.session_token]
    )).rows[0].team_id;

    if (oldSessionCheck === null && newSessionCheck === loginAlpha.team_id) {
      testResults.push({ id: "SEC-02", name: "Single active session enforcement (concurrency)", status: "PASS", evidence: "Previous session automatically revoked on new login" });
      console.log("✔ SEC-02: Single active session enforcement -> PASS");
    } else {
      testResults.push({ id: "SEC-02", name: "Single active session enforcement", status: "FAIL", evidence: `Old=${oldSessionCheck}, New=${newSessionCheck}` });
      console.log("✖ SEC-02: Single active session enforcement -> FAIL");
    }

    // Revoke sessions
    await client.query("SELECT public.revoke_team_session($1);", [loginAlphaSecond.session_token]);
    await client.query("SELECT public.revoke_team_session($1);", [loginBravo.session_token]);

    // SEC-03: Rate-limiting lockout verification
    // Use dedicated negative fixture QA-TEAM-CHARLIE with synthetic IP to isolate lockout
    console.log("Testing rate-limiting lockout against QA-TEAM-CHARLIE (5 failed attempts, then verify lockout)...");
    const testIp = "192.168.100.99";

    // First 5 attempts fail with wrong credentials
    for (let attempt = 1; attempt <= 5; attempt++) {
      await client.query(
        "SELECT public.authenticate_team($1, $2, $3) as res;",
        ["QA-TEAM-CHARLIE", `WrongPassAttempt${attempt}`, testIp]
      );
    }

    // 6th attempt should now be rate limited and return ERR_AUTH_RATE_LIMITED immediately
    const lockedRes = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-CHARLIE", credsMap["QA-TEAM-CHARLIE"], testIp]
    )).rows[0].res;

    if (lockedRes.error === "ERR_AUTH_RATE_LIMITED") {
      testResults.push({ id: "SEC-03", name: "Rate-limiting lockout triggered (after 5 failed attempts)", status: "PASS", evidence: "Subsequent attempt returned ERR_AUTH_RATE_LIMITED even with valid credentials" });
      console.log("✔ SEC-03: Rate-limiting lockout triggered after 5 failed attempts -> PASS");
    } else {
      testResults.push({ id: "SEC-03", name: "Rate-limiting lockout", status: "FAIL", evidence: `Expected ERR_AUTH_RATE_LIMITED, received: ${JSON.stringify(lockedRes)}` });
      console.log("✖ SEC-03: Rate-limiting lockout -> FAIL");
    }

    // SEC-04: Rate-limiting account isolation (QA-TEAM-ALPHA and BRAVO remain unlocked)
    const alphaUnlockedCheck = (await client.query(
      "SELECT public.authenticate_team($1, $2, $3) as res;",
      ["QA-TEAM-ALPHA", credsMap["QA-TEAM-ALPHA"], "127.0.0.1"]
    )).rows[0].res;

    if (alphaUnlockedCheck.success) {
      testResults.push({ id: "SEC-04", name: "Rate-limiting lockout isolation", status: "PASS", evidence: "QA-TEAM-ALPHA remains unlocked and authenticated successfully" });
      console.log("✔ SEC-04: Rate-limiting lockout isolation -> PASS");
      await client.query("SELECT public.revoke_team_session($1);", [alphaUnlockedCheck.session_token]);
    } else {
      testResults.push({ id: "SEC-04", name: "Rate-limiting lockout isolation", status: "FAIL", evidence: JSON.stringify(alphaUnlockedCheck) });
      console.log("✖ SEC-04: Rate-limiting lockout isolation -> FAIL");
    }

    // --------------------------------------------------------------------------
    // Phase 5: Final Read-Only Audit
    // --------------------------------------------------------------------------
    console.log("\n--- PHASE 5: FINAL READ-ONLY STATE AUDIT ---");

    const postEvent = (await client.query("SELECT * FROM public.event_config WHERE id = 1;")).rows[0];
    const postTeamsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.teams;")).rows[0].c);
    const postMarshalsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.marshals;")).rows[0].c);
    const postTeamProgressCount = Number((await client.query("SELECT COUNT(*) as c FROM public.team_progress;")).rows[0].c);
    const postTeamHintsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.team_hints;")).rows[0].c);
    const postSecretsCount = Number((await client.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c);
    const postWinnersCount = Number((await client.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c);

    // Active (non-revoked) sessions
    const activeTeamSessions = Number((await client.query("SELECT COUNT(*) as c FROM public.team_sessions WHERE revoked_at IS NULL AND expires_at > clock_timestamp();")).rows[0].c);
    const activeMarshalSessions = Number((await client.query("SELECT COUNT(*) as c FROM public.marshal_sessions WHERE revoked_at IS NULL AND expires_at > clock_timestamp();")).rows[0].c);

    console.log(` Teams count:              ${postTeamsCount} (Expected: 3)`);
    console.log(` Marshals count:           ${postMarshalsCount} (Expected: 1)`);
    console.log(` Active team sessions:     ${activeTeamSessions} (Expected: 0)`);
    console.log(` Active marshal sessions:  ${activeMarshalSessions} (Expected: 0)`);
    console.log(` Team progress rows:       ${postTeamProgressCount} (Expected: 0)`);
    console.log(` Team hints rows:          ${postTeamHintsCount} (Expected: 0)`);
    console.log(` Event status:             ${postEvent.status} (Expected: draft)`);
    console.log(` Event is_locked:          ${postEvent.is_locked} (Expected: false)`);
    console.log(` Event winner_team_id:     ${postEvent.winner_team_id === null ? "NULL" : postEvent.winner_team_id}`);
    console.log(` Treasure secrets:         ${postSecretsCount} (Expected: 0)`);
    console.log(` Winner verifications:     ${postWinnersCount} (Expected: 0)`);

    return {
      testResults,
      postAudit: {
        teamsCount: postTeamsCount,
        marshalsCount: postMarshalsCount,
        activeTeamSessions,
        activeMarshalSessions,
        teamProgressCount: postTeamProgressCount,
        teamHintsCount: postTeamHintsCount,
        eventStatus: postEvent.status,
        eventIsLocked: postEvent.is_locked,
        eventWinnerTeamId: postEvent.winner_team_id,
        treasureSecretsCount: postSecretsCount,
        winnerVerificationsCount: postWinnersCount,
      },
    };
  } finally {
    client.release();
    await pool.end();
  }
}

runStagingQA()
  .then((res) => {
    console.log("\n================================================================================");
    console.log(" CONTROLLED STAGING QA SUMMARY");
    console.log("================================================================================");
    for (const t of res.testResults) {
      console.log(` [${t.status.padEnd(7)}] ${t.id}: ${t.name} -> ${t.evidence}`);
    }
    console.log("================================================================================");
  })
  .catch((err) => {
    console.error("FATAL STAGING QA ERROR:", err.message);
    process.exit(1);
  });
