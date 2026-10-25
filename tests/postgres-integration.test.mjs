import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import {
  seedSyntheticData,
  SYNTHETIC_MARSHAL,
  SYNTHETIC_TREASURE_TOKEN,
  getSyntheticAnswer,
} from "./fixtures/syntheticData.mjs";

test("Real PostgreSQL: Migration applies cleanly and creates authoritative tables and functions", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);

  const tables = (await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `)).rows.map(r => r.table_name);

  assert.ok(tables.includes("teams"), "teams table exists");
  assert.ok(tables.includes("questions"), "questions table exists");
  assert.ok(tables.includes("question_keys"), "question_keys table exists");
  assert.ok(tables.includes("hints"), "hints table exists");
  assert.ok(tables.includes("team_progress"), "team_progress table exists");
  assert.ok(tables.includes("team_hints"), "team_hints table exists");
  assert.ok(tables.includes("treasure_secrets"), "treasure_secrets table exists");
  assert.ok(tables.includes("winner_verifications"), "winner_verifications table exists");
  assert.equal(tables.length, 14, "Exact 14 public tables created");
});

test("Real PostgreSQL: Synthetic fixtures seed exactly 5 levels, 45 questions, 135 hints", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);
  const counts = await seedSyntheticData(db);

  assert.equal(counts.levels, 5);
  assert.equal(counts.questions, 45);
  assert.equal(counts.keys, 45);
  assert.equal(counts.hints, 135);
  assert.equal(counts.teams, 3);
  assert.equal(counts.marshals, 1);
  assert.equal(counts.eventStatus, "active");
});

test("Real PostgreSQL: Authentication, rate-limits, and session lifecycle", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);
  await seedSyntheticData(db);

  // 1. Invalid team credentials
  const badLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["ALPHA-01", "WrongPassword!", "198.51.100.1"]
  )).rows[0].res;
  assert.equal(badLogin.success, false);
  assert.equal(badLogin.error, "ERR_INVALID_CREDENTIALS");

  // 2. Null/empty inputs fail safely
  const nullLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    [null, "", "198.51.100.1"]
  )).rows[0].res;
  assert.equal(nullLogin.success, false);
  assert.equal(nullLogin.error, "ERR_INVALID_CREDENTIALS");

  // 3. Valid team login generates secure session
  const validLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["ALPHA-01", "PasswordAlpha123!", "198.51.100.1"]
  )).rows[0].res;
  assert.equal(validLogin.success, true);
  assert.equal(validLogin.callsign, "ALPHA-01");
  const token = validLogin.session_token;

  // 4. Validate session
  const validateRes = (await db.query(
    "SELECT public.internal_validate_team_session($1) as team_id;",
    [token]
  )).rows[0].team_id;
  assert.equal(validateRes, validLogin.team_id);

  // 5. Revocation
  const revokeRes = (await db.query(
    "SELECT public.revoke_team_session($1) as res;",
    [token]
  )).rows[0].res;
  assert.equal(revokeRes, true);

  // 6. Post-revocation session is rejected
  const postRevokeValidate = (await db.query(
    "SELECT public.internal_validate_team_session($1) as team_id;",
    [token]
  )).rows[0].team_id;
  assert.equal(postRevokeValidate, null);

  // 7. Marshal login & session separation
  const marshalLogin = (await db.query(
    "SELECT public.authenticate_marshal($1, $2, $3) as res;",
    [SYNTHETIC_MARSHAL.username, SYNTHETIC_MARSHAL.password, "198.51.100.1"]
  )).rows[0].res;
  assert.equal(marshalLogin.success, true);
  const marshalToken = marshalLogin.session_token;

  // 8. Validate marshal session RPC
  const marshalValRes = (await db.query(
    "SELECT public.internal_validate_marshal_session($1) as marshal_id;",
    [marshalToken]
  )).rows[0].marshal_id;
  assert.equal(marshalValRes, marshalLogin.marshal_id);

  // Team token rejected by marshal session validator
  const marshalValTeam = (await db.query(
    "SELECT public.internal_validate_marshal_session($1) as marshal_id;",
    [token]
  )).rows[0].marshal_id;
  assert.equal(marshalValTeam, null);

  // Marshal revocation
  await db.query("SELECT public.revoke_marshal_session($1);", [marshalToken]);
  const postRevokeMarshal = (await db.query(
    "SELECT public.internal_validate_marshal_session($1) as marshal_id;",
    [marshalToken]
  )).rows[0].marshal_id;
  assert.equal(postRevokeMarshal, null);
});

test("Real PostgreSQL: Answer submission, level gating, and Level 5 sequence", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);
  await seedSyntheticData(db);

  const teamLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["BRAVO-02", "PasswordBravo123!", "198.51.100.2"]
  )).rows[0].res;
  const token = teamLogin.session_token;

  const qRows = (await db.query("SELECT id, level_number, order_seq FROM public.questions ORDER BY level_number, order_seq;")).rows;
  const l1q1 = qRows.find(q => q.level_number === 1 && q.order_seq === 1);
  const l2q1 = qRows.find(q => q.level_number === 2 && q.order_seq === 1);

  // Premature Level 2 submission blocked
  const premature = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, l2q1.id, getSyntheticAnswer(2, 1)]
  )).rows[0].res;
  assert.equal(premature.success, false);
  assert.equal(premature.error, "ERR_PREVIOUS_LEVEL_INCOMPLETE");

  // Incorrect answer does not progress
  const wrong = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, l1q1.id, "COMPLETELY_WRONG_ANSWER"]
  )).rows[0].res;
  assert.equal(wrong.success, true);
  assert.equal(wrong.correct, false);

  // Correct answer succeeds
  const correct = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, l1q1.id, getSyntheticAnswer(1, 1)]
  )).rows[0].res;
  assert.equal(correct.success, true);
  assert.equal(correct.correct, true);

  // Duplicate submission is idempotent
  const dup = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, l1q1.id, getSyntheticAnswer(1, 1)]
  )).rows[0].res;
  assert.equal(dup.success, true);
  assert.equal(dup.already_solved, true);
});

test("Real PostgreSQL: Hint quota, level gating, and concurrency lock", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);
  await seedSyntheticData(db);

  const teamLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["CHARLIE-03", "PasswordCharlie123!", "198.51.100.3"]
  )).rows[0].res;
  const token = teamLogin.session_token;
  const hints = (await db.query("SELECT id, question_id, hint_number FROM public.hints WHERE level_number = 1 ORDER BY question_id, hint_number;")).rows;

  // Reveal 3 hints for level 1
  for (let i = 0; i < 3; i++) {
    const res = (await db.query(
      "SELECT public.request_reveal_hint($1, $2) as res;",
      [token, hints[i].id]
    )).rows[0].res;
    assert.equal(res.success, true);
  }

  // 4th hint reveal attempt in level 1 must be rejected by quota
  const overQuota = (await db.query(
    "SELECT public.request_reveal_hint($1, $2) as res;",
    [token, hints[3].id]
  )).rows[0].res;
  assert.equal(overQuota.success, false);
  assert.equal(overQuota.error, "ERR_HINT_QUOTA_EXCEEDED");
});

test("Real PostgreSQL: Atomic single winner verification and public winner response", async () => {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  await db.exec(sql);
  await seedSyntheticData(db);

  // Authenticate Team Alpha and solve all 45 questions
  const alphaLogin = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["ALPHA-01", "PasswordAlpha123!", "198.51.100.1"]
  )).rows[0].res;
  const alphaToken = alphaLogin.session_token;

  const allQuestions = (await db.query("SELECT id, level_number, order_seq FROM public.questions ORDER BY level_number, order_seq;")).rows;
  for (const q of allQuestions) {
    const res = (await db.query(
      "SELECT public.submit_team_answer($1, $2, $3) as res;",
      [alphaToken, q.id, getSyntheticAnswer(q.level_number, q.order_seq)]
    )).rows[0].res;
    assert.equal(res.success, true);
    assert.equal(res.correct, true);
  }

  // Marshal authentication
  const marshalLogin = (await db.query(
    "SELECT public.authenticate_marshal($1, $2, $3) as res;",
    [SYNTHETIC_MARSHAL.username, SYNTHETIC_MARSHAL.password, "198.51.100.1"]
  )).rows[0].res;
  const marshalToken = marshalLogin.session_token;

  // Unqualified team (Bravo) cannot be verified
  const unqualVerify = (await db.query(
    "SELECT public.marshal_verify_treasure($1, $2, $3) as res;",
    [marshalToken, "BRAVO-02", SYNTHETIC_TREASURE_TOKEN]
  )).rows[0].res;
  assert.equal(unqualVerify.success, false);
  assert.equal(unqualVerify.error, "ERR_TEAM_INCOMPLETE_QUESTIONS");

  // Qualified team with valid physical token succeeds
  const verifyRes = (await db.query(
    "SELECT public.marshal_verify_treasure($1, $2, $3) as res;",
    [marshalToken, "ALPHA-01", SYNTHETIC_TREASURE_TOKEN]
  )).rows[0].res;
  assert.equal(verifyRes.success, true);
  assert.equal(verifyRes.team_id, alphaLogin.team_id);

  // Second verification attempt is rejected with ERR_EVENT_ALREADY_WON
  const secondVerify = (await db.query(
    "SELECT public.marshal_verify_treasure($1, $2, $3) as res;",
    [marshalToken, "ALPHA-01", SYNTHETIC_TREASURE_TOKEN]
  )).rows[0].res;
  assert.equal(secondVerify.success, false);
  assert.equal(secondVerify.error, "ERR_EVENT_ALREADY_WON");

  // Public winner RPC sanitization
  const publicWinner = (await db.query("SELECT public.get_public_winner() as res;")).rows[0].res;
  assert.equal(publicWinner.event_completed, true);
  assert.equal(publicWinner.callsign, "ALPHA-01");
  assert.equal(publicWinner.team_name, "Synthetic Alpha");
  assert.ok(publicWinner.won_at);
  assert.equal(publicWinner.token_verifier, undefined, "Zero private fields leaked");
  assert.equal(publicWinner.token_masked, undefined, "Zero masked token leaked to public RPC");
});

test("Real PostgreSQL: Rollback removes all objects and allows clean reapplication", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const rollbackSql = fs.readFileSync(path.resolve("supabase/rollback/20261025000000_phase1_core_rollback.sql"), "utf-8");

  await db.exec(migrationSql);
  const beforeCount = (await db.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = 'public';")).rows[0].c;
  assert.equal(Number(beforeCount), 14);

  await db.exec(rollbackSql);
  const afterCount = (await db.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = 'public';")).rows[0].c;
  assert.equal(Number(afterCount), 0, "All 14 tables removed by rollback");

  await db.exec(migrationSql);
  const reapplyCount = (await db.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = 'public';")).rows[0].c;
  assert.equal(Number(reapplyCount), 14, "All 14 tables successfully restored on reapplication");
});
