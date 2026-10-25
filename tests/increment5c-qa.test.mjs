import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import { loadContentPack } from "./fixtures/contentPackSeeder.mjs";

test("Increment 5C: Content quality and answer validation regression test", async () => {
  const db = await createDisposableDatabase();
  const migrationSql = fs.readFileSync(path.resolve("supabase/migrations/20261025000000_phase1_core.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.resolve("supabase/seed_content_pack_v1.sql"), "utf-8");

  // 1. Execute migration and regenerated seed
  await db.exec(migrationSql);
  await db.exec(seedSql);

  // 2. Verify dataset constraints
  const levelsCount = (await db.query("SELECT COUNT(*) as c FROM public.levels;")).rows[0].c;
  const questionsCount = (await db.query("SELECT COUNT(*) as c FROM public.questions;")).rows[0].c;
  const keysCount = (await db.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
  const hintsCount = (await db.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c;
  const eventStatus = (await db.query("SELECT status FROM public.event_config WHERE id = 1;")).rows[0].status;

  assert.equal(Number(levelsCount), 5, "Must have exactly 5 levels");
  assert.equal(Number(questionsCount), 45, "Must have exactly 45 questions");
  assert.equal(Number(keysCount), 45, "Must have exactly 45 question keys");
  assert.equal(Number(hintsCount), 135, "Must have exactly 135 hints (3 per question)");
  assert.equal(eventStatus, "draft", "Event must be in draft status");

  // 3. Create test team and authenticate
  await db.query(`
    INSERT INTO public.teams (id, team_name, callsign, password_hash)
    VALUES ('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 'QA Verification Team', 'QA-VERIFY', extensions.crypt('SecureQA2026!', extensions.gen_salt('bf', 8)));
  `);

  // Provision temporary test treasure verifier for event activation
  await db.query(`
    INSERT INTO public.treasure_secrets (id, token_verifier, is_claimed)
    VALUES (1, extensions.crypt('TEMP-QA-TEST-TREASURE-TOKEN', extensions.gen_salt('bf', 8)), false)
    ON CONFLICT (id) DO UPDATE SET token_verifier = EXCLUDED.token_verifier;
  `);

  // Activate event
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() - INTERVAL '10 minutes',
        end_at = clock_timestamp() + INTERVAL '3 hours'
    WHERE id = 1;
  `);

  const loginRes = (await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as res;",
    ["QA-VERIFY", "SecureQA2026!", "127.0.0.1"]
  )).rows[0].res;
  assert.equal(loginRes.success, true);
  const token = loginRes.session_token;
  const teamId = loginRes.team_id;

  // Helper function to get question by level and seq
  async function getQ(level, seq) {
    const res = await db.query(
      "SELECT id, prompt, title FROM public.questions WHERE level_number = $1 AND order_seq = $2;",
      [level, seq]
    );
    return res.rows[0];
  }

  // Helper to submit answer
  async function submit(qId, ans) {
    const res = await db.query(
      "SELECT public.submit_team_answer($1, $2, $3) as res;",
      [token, qId, ans]
    );
    return res.rows[0].res;
  }

  // Helper to simulate completing a level with placeholder records
  async function completeLevel(levelNum) {
    const questions = (await db.query(
      "SELECT id FROM public.questions WHERE level_number = $1;",
      [levelNum]
    )).rows;
    for (const q of questions) {
      await db.query(
        `INSERT INTO public.team_progress (team_id, question_id, level_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, question_id) DO NOTHING;`,
        [teamId, q.id, levelNum]
      );
    }
  }

  // Helper to remove team progress for specific question
  async function resetProgressForQ(qId) {
    await db.query("DELETE FROM public.team_progress WHERE team_id = $1 AND question_id = $2;", [teamId, qId]);
  }

  // --- Regression Tests for Level 1 ---

  // Q3: Clock Angle (Level 1, Seq 3)
  const q3 = await getQ(1, 3);
  assert.ok(q3.prompt.includes("(Enter the number only)"), "Q3 prompt must instruct number only");
  // Incorrect answer rejected
  const q3Wrong = await submit(q3.id, "15");
  assert.equal(q3Wrong.success, true);
  assert.equal(q3Wrong.correct, false, "Q3 wrong answer must be rejected");
  // Outdated variant rejected
  const q3Old = await submit(q3.id, "7.5 degrees");
  assert.equal(q3Old.correct, false, "Q3 formatted string with units must be rejected when number only requested");
  // Canonical answer accepted (case/whitespace normalization tested)
  const q3Correct = await submit(q3.id, "  7.5  ");
  assert.equal(q3Correct.success, true);
  assert.equal(q3Correct.correct, true, "Q3 canonical '7.5' must be accepted");

  // Q8: Battery Hours (Level 1, Seq 8)
  const q8 = await getQ(1, 8);
  assert.ok(q8.prompt.includes("(Enter the number only)"), "Q8 prompt must instruct number only");
  const q8Wrong = await submit(q8.id, "6");
  assert.equal(q8Wrong.correct, false, "Q8 wrong answer must be rejected");
  const q8Old = await submit(q8.id, "8 hours");
  assert.equal(q8Old.correct, false, "Q8 old unit answer must be rejected");
  const q8Correct = await submit(q8.id, "8");
  assert.equal(q8Correct.success, true);
  assert.equal(q8Correct.correct, true, "Q8 canonical '8' must be accepted");

  // Complete Level 1 to unlock Level 2
  await completeLevel(1);

  // --- Regression Tests for Level 2 ---

  // Q15: Three Switches (Level 2, Seq 5)
  const q15 = await getQ(2, 5);
  await resetProgressForQ(q15.id);
  assert.ok(q15.prompt.includes("(Enter one word)"), "Q15 prompt must instruct one word");
  assert.ok(q15.prompt.includes("Besides light, what physical property"), "Q15 prompt must ask for specific property");
  // Incorrect answers rejected
  const q15Wrong = await submit(q15.id, "color");
  assert.equal(q15Wrong.correct, false, "Q15 wrong answer must be rejected");
  const q15Old = await submit(q15.id, "heat method");
  assert.equal(q15Old.correct, false, "Q15 obsolete phrase 'heat method' must be rejected");
  // Canonical answer accepted
  const q15Correct = await submit(q15.id, "  HEAT  ");
  assert.equal(q15Correct.success, true);
  assert.equal(q15Correct.correct, true, "Q15 canonical 'heat' must be accepted");

  // Complete Level 2 to unlock Level 3
  await completeLevel(2);

  // --- Regression Tests for Level 3 ---

  // Q26: Network Route (Level 3, Seq 6)
  const q26 = await getQ(3, 6);
  await resetProgressForQ(q26.id);
  assert.ok(q26.prompt.includes("(Enter the number only)"), "Q26 prompt must instruct number only");
  const q26Wrong = await submit(q26.id, "10");
  assert.equal(q26Wrong.correct, false, "Q26 wrong answer must be rejected");
  const q26Old = await submit(q26.id, "14 ms");
  assert.equal(q26Old.correct, false, "Q26 old unit answer must be rejected");
  const q26Correct = await submit(q26.id, "14");
  assert.equal(q26Correct.success, true);
  assert.equal(q26Correct.correct, true, "Q26 canonical '14' must be accepted");

  // Q29: Hash Clue (Level 3, Seq 9)
  const q29 = await getQ(3, 9);
  await resetProgressForQ(q29.id);
  assert.ok(q29.prompt.includes("(Enter one word)"), "Q29 prompt must instruct one word");
  // Reject incorrect variant and confusion
  const q29Barcode = await submit(q29.id, "2d barcode");
  assert.equal(q29Barcode.correct, false, "Q29 must reject '2d barcode'");
  const q29Old = await submit(q29.id, "fixed length digest");
  assert.equal(q29Old.correct, false, "Q29 must reject multi-word 'fixed length digest'");
  // Canonical answer accepted
  const q29Correct = await submit(q29.id, "  Digest  ");
  assert.equal(q29Correct.success, true);
  assert.equal(q29Correct.correct, true, "Q29 canonical 'digest' must be accepted");

  // Complete Level 3 to unlock Level 4
  await completeLevel(3);

  // --- Regression Tests for Level 4 ---

  // Q32: Canteen Calculation (Level 4, Seq 2)
  const q32 = await getQ(4, 2);
  await resetProgressForQ(q32.id);
  assert.ok(q32.prompt.includes("(Enter the number only)"), "Q32 prompt must instruct number only");
  const q32Wrong = await submit(q32.id, "85");
  assert.equal(q32Wrong.correct, false, "Q32 wrong answer must be rejected");
  const q32Old = await submit(q32.id, "₹90");
  assert.equal(q32Old.correct, false, "Q32 rupee symbol must be rejected when number only requested");
  const q32Correct = await submit(q32.id, "90");
  assert.equal(q32Correct.success, true);
  assert.equal(q32Correct.correct, true, "Q32 canonical '90' must be accepted");

  // Q33: Stage Geometry (Level 4, Seq 3)
  const q33 = await getQ(4, 3);
  await resetProgressForQ(q33.id);
  assert.ok(q33.prompt.includes("(Enter the number only)"), "Q33 prompt must instruct number only");
  const q33Wrong = await submit(q33.id, "40");
  assert.equal(q33Wrong.correct, false, "Q33 wrong answer must be rejected");
  const q33Old = await submit(q33.id, "26 m");
  assert.equal(q33Old.correct, false, "Q33 meter unit must be rejected when number only requested");
  const q33Correct = await submit(q33.id, "26");
  assert.equal(q33Correct.success, true);
  assert.equal(q33Correct.correct, true, "Q33 canonical '26' must be accepted");

  // Q35: Route Planning (Level 4, Seq 5)
  const q35 = await getQ(4, 5);
  await resetProgressForQ(q35.id);
  assert.ok(q35.prompt.includes("(Enter the number only)"), "Q35 prompt must instruct number only");
  const q35Wrong = await submit(q35.id, "15");
  assert.equal(q35Wrong.correct, false, "Q35 wrong answer must be rejected");
  const q35Old = await submit(q35.id, "12 minutes");
  assert.equal(q35Old.correct, false, "Q35 minutes unit must be rejected when number only requested");
  const q35Correct = await submit(q35.id, "12");
  assert.equal(q35Correct.success, true);
  assert.equal(q35Correct.correct, true, "Q35 canonical '12' must be accepted");

  // --- Preservation Check for Questions 41 to 45 ---
  const { master } = loadContentPack();
  const l5Questions = (await db.query(
    "SELECT id, order_seq, title, prompt FROM public.questions WHERE level_number = 5 ORDER BY order_seq;"
  )).rows;

  assert.equal(l5Questions.length, 5, "Level 5 must have 5 clues");
  for (let i = 0; i < 5; i++) {
    const qNum = 41 + i;
    const original = master.questions.find(x => x.question_id === qNum);
    assert.equal(l5Questions[i].title, original.title, `Q${qNum} title must be preserved`);
    assert.equal(l5Questions[i].prompt, original.participant_prompt, `Q${qNum} prompt must be preserved exactly`);
  }
});
