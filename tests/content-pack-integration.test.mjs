import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import { loadContentPack } from "./fixtures/contentPackSeeder.mjs";

test("Content Pack: Seed SQL executes cleanly and matches schema constraints", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");

  // Apply migration
  await db.exec(migrationSql);

  // Apply content pack seed
  await db.exec(seedSql);

  // 1. Verify counts
  const levelsCount = (await db.query("SELECT COUNT(*) as c FROM public.levels;")).rows[0].c;
  const questionsCount = (await db.query("SELECT COUNT(*) as c FROM public.questions;")).rows[0].c;
  const keysCount = (await db.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
  const hintsCount = (await db.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c;
  const eventStatus = (await db.query("SELECT status FROM public.event_config WHERE id = 1;")).rows[0].status;

  assert.equal(Number(levelsCount), 5, "Must have exactly 5 levels");
  assert.equal(Number(questionsCount), 45, "Must have exactly 45 questions");
  assert.equal(Number(keysCount), 45, "Must have exactly 45 question keys");
  assert.equal(Number(hintsCount), 135, "Must have exactly 135 hints");
  assert.equal(eventStatus, "draft", "Event must remain in draft status");
});

test("Content Pack: Level 5 Questions 41-45 retain exact prompts and sequential dependencies", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");

  await db.exec(migrationSql);
  await db.exec(seedSql);

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

test("Content Pack: Gameplay flow with content pack questions and canonical answers", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");

  await db.exec(migrationSql);
  await db.exec(seedSql);

  const { privateKey } = loadContentPack();

  // Create a test team
  await db.query(`
    INSERT INTO public.teams (team_name, callsign, password_hash)
    VALUES ('Audit Team', 'AUDIT-01', extensions.crypt('TestPassword123!', extensions.gen_salt('bf', 8)));
  `);

  // Verify fail-closed activation gate: event CANNOT be activated without a treasure secret verifier
  await assert.rejects(
    async () => {
      await db.exec(`UPDATE public.event_config SET status = 'active' WHERE id = 1;`);
    },
    /DATASET_INTEGRITY_FAIL: Active treasure secret verifier missing or invalid/,
    "Activation must fail-closed if treasure secret verifier is missing"
  );

  // For testing gameplay flow, provision temporary test treasure secret verifier
  await db.query(`
    INSERT INTO public.treasure_secrets (id, token_verifier, is_claimed)
    VALUES (1, extensions.crypt('TEMP-LOCAL-TEST-TREASURE-TOKEN-2026', extensions.gen_salt('bf', 8)), false)
    ON CONFLICT (id) DO UPDATE SET
      token_verifier = EXCLUDED.token_verifier,
      is_claimed = false;
  `);

  // Now activation succeeds through internal_verify_expedition_dataset
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() - INTERVAL '1 hour',
        end_at = clock_timestamp() + INTERVAL '4 hours'
    WHERE id = 1;
  `);

  // Authenticate team
  const loginRes = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["AUDIT-01", "TestPassword123!", "198.51.100.99"]
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

  // Submit correct canonical answer for Question 1 ("book")
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
