/**
 * content-pack-integration.test.mjs
 *
 * Integration tests for the content pack seed and gameplay flow.
 * Applies the full migration chain:
 *   phase1_core -> seven_team_tokens -> multi_hash_question_keys
 * Leaves the event in 'draft' status unless explicitly activated.
 *
 * OFFLINE ONLY. No remote connections.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import { loadContentPack } from "./fixtures/contentPackSeeder.mjs";

const MIGRATION_PATHS = [
  "supabase/migrations/20261025000000_phase1_core.sql",
  "supabase/migrations/20261026000000_seven_team_tokens.sql",
  "supabase/migrations/20261026010000_multi_hash_question_keys.sql",
];

const SEED_SQL_PATH = "supabase/seed_content_pack_v1.sql";

// 7 synthetic teams required by internal_verify_expedition_dataset()
const SYNTH_TEAMS = [
  { name: "Alpha",   callsign: "CI-ALPHA-01",   pw: "PwCiAlpha1!",   token: "CI-TOKEN-ALPHA-2026" },
  { name: "Bravo",   callsign: "CI-BRAVO-02",   pw: "PwCiBravo2!",   token: "CI-TOKEN-BRAVO-2026" },
  { name: "Charlie", callsign: "CI-CHARLIE-03", pw: "PwCiCharlie3!", token: "CI-TOKEN-CHARLIE-2026" },
  { name: "Delta",   callsign: "CI-DELTA-04",   pw: "PwCiDelta4!",   token: "CI-TOKEN-DELTA-2026" },
  { name: "Echo",    callsign: "CI-ECHO-05",    pw: "PwCiEcho5!",    token: "CI-TOKEN-ECHO-2026" },
  { name: "Foxtrot", callsign: "CI-FOXTROT-06", pw: "PwCiFoxtrot6!", token: "CI-TOKEN-FOXTROT-2026" },
  { name: "Golf",    callsign: "CI-GOLF-07",    pw: "PwCiGolf7!",    token: "CI-TOKEN-GOLF-2026" },
];

async function buildDb() {
  const db = await createDisposableDatabase();
  for (const mp of MIGRATION_PATHS) {
    await db.exec(fs.readFileSync(path.resolve(mp), "utf-8"));
  }
  await db.exec(fs.readFileSync(path.resolve(SEED_SQL_PATH), "utf-8"));
  return db;
}

async function seed7Teams(db) {
  for (const t of SYNTH_TEAMS) {
    const res = await db.query(
      `INSERT INTO public.teams (team_name, callsign, password_hash)
       VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 8)))
       ON CONFLICT (callsign) DO UPDATE SET team_name = EXCLUDED.team_name
       RETURNING id;`,
      [t.name, t.callsign, t.pw]
    );
    const teamId = res.rows[0].id;
    await db.query(
      `INSERT INTO public.treasure_secrets (team_id, token_verifier, is_claimed)
       VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)), false)
       ON CONFLICT (team_id) DO UPDATE SET token_verifier = EXCLUDED.token_verifier;`,
      [teamId, t.token]
    );
  }
}

// ---------------------------------------------------------------------------
// Test 1: Seed SQL executes cleanly
// ---------------------------------------------------------------------------

test("Content Pack: Seed SQL executes cleanly and matches schema constraints", async () => {
  const db = await buildDb();

  const levelsCount = (await db.query("SELECT COUNT(*) as c FROM public.levels;")).rows[0].c;
  const questionsCount = (await db.query("SELECT COUNT(*) as c FROM public.questions;")).rows[0].c;
  const keysCount = (await db.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
  const hintsCount = (await db.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c;
  const eventStatus = (await db.query("SELECT status FROM public.event_config WHERE id = 1;")).rows[0].status;

  assert.equal(Number(levelsCount), 5, "Must have exactly 5 levels");
  assert.equal(Number(questionsCount), 45, "Must have exactly 45 questions");
  assert.ok(Number(keysCount) >= 45, `Must have at least 45 question_keys rows (multi-hash), got ${keysCount}`);
  assert.equal(Number(hintsCount), 135, "Must have exactly 135 hints");
  assert.equal(eventStatus, "draft", "Event must remain in draft status");
});

// ---------------------------------------------------------------------------
// Test 2: Level 5 dependency chain
// ---------------------------------------------------------------------------

test("Content Pack: Level 5 Questions 41-45 retain exact prompts and sequential dependencies", async () => {
  const db = await buildDb();

  const { master } = loadContentPack();

  const l5Questions = (await db.query(`
    SELECT id, level_number, order_seq, title, prompt, cipher_type, dependency_question_id
    FROM public.questions
    WHERE level_number = 5
    ORDER BY order_seq;
  `)).rows;

  assert.equal(l5Questions.length, 5, "Level 5 must have 5 questions");

  // Q41 (order_seq 1) must have NULL dependency
  assert.equal(l5Questions[0].dependency_question_id, null);
  const q41Expected = master.questions.find(x => x.question_id === 41);
  assert.equal(l5Questions[0].title, q41Expected.title);
  assert.equal(l5Questions[0].prompt, q41Expected.participant_prompt);

  // Q42..Q45 must depend directly on immediately preceding question
  for (let i = 1; i < 5; i++) {
    const qNum = 41 + i;
    const expected = master.questions.find(x => x.question_id === qNum);
    assert.equal(l5Questions[i].dependency_question_id, l5Questions[i - 1].id, `Q${qNum} must depend on Q${qNum - 1}`);
    assert.equal(l5Questions[i].title, expected.title);
    assert.equal(l5Questions[i].prompt, expected.participant_prompt);
  }
});

// ---------------------------------------------------------------------------
// Test 3: Gameplay flow with content pack and canonical answers
// ---------------------------------------------------------------------------

test("Content Pack: Gameplay flow with content pack questions and canonical answers", async () => {
  const db = await buildDb();
  const { privateKey } = loadContentPack();

  // Seed 7 teams with treasure secrets
  await seed7Teams(db);

  // Verify fail-closed activation gate: event CANNOT be activated without treasure secrets (already seeded above)
  // First test with 0 teams, separate DB
  const dbFail = await createDisposableDatabase();
  for (const mp of MIGRATION_PATHS) {
    await dbFail.exec(fs.readFileSync(path.resolve(mp), "utf-8"));
  }
  await dbFail.exec(fs.readFileSync(path.resolve(SEED_SQL_PATH), "utf-8"));

  await assert.rejects(
    async () => {
      await dbFail.exec(`UPDATE public.event_config SET status = 'active' WHERE id = 1;`);
    },
    /DATASET_INTEGRITY_FAIL/,
    "Activation must fail-closed if treasure secret verifiers are missing"
  );

  // Activate event on our main DB (7 teams + secrets already seeded)
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() - INTERVAL '1 hour',
        end_at = clock_timestamp() + INTERVAL '4 hours'
    WHERE id = 1;
  `);

  // Authenticate team (use first synth team)
  const loginRes = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    [SYNTH_TEAMS[0].callsign, SYNTH_TEAMS[0].pw, "198.51.100.99"]
  )).rows[0].res;
  assert.equal(loginRes.success, true);
  const token = loginRes.session_token;

  // Retrieve Question 1
  const q1 = (await db.query(
    "SELECT id, prompt FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
  )).rows[0];

  // Submit wrong answer
  const wrongRes = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, q1.id, "WRONG_ANSWER"]
  )).rows[0].res;
  assert.equal(wrongRes.success, true);
  assert.equal(wrongRes.correct, false);

  // Reveal hint 1 for Question 1
  const q1Hints = (await db.query(
    "SELECT id FROM public.hints WHERE question_id = $1 ORDER BY hint_number;",
    [q1.id]
  )).rows;

  const hint1 = (await db.query(
    "SELECT public.request_reveal_hint($1, $2) as res;",
    [token, q1Hints[0].id]
  )).rows[0].res;
  assert.equal(hint1.success, true);
  assert.equal(hint1.hints_remaining, 2);

  // Submit correct canonical answer for Question 1
  const k1 = privateKey.private_answer_keys.find(x => x.question_id === 1);
  const correctRes = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as res;",
    [token, q1.id, k1.canonical_answer]
  )).rows[0].res;
  assert.equal(correctRes.success, true);
  assert.equal(correctRes.correct, true);

  // Question 1 now marked solved
  const isSolved = (await db.query(
    "SELECT COUNT(*) as c FROM public.team_progress WHERE team_id = $1 AND question_id = $2;",
    [loginRes.team_id, q1.id]
  )).rows[0].c;
  assert.equal(Number(isSolved), 1);
});
