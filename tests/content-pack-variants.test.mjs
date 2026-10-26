/**
 * THE HUNT EXPEDITION -- Comprehensive Content Pack Variant Test Suite
 *
 * Verifies all organizer-approved answer variants, wrong-answer rejection,
 * dataset integrity (45 canonical keys, 98 total rows, 135 hints),
 * hint content non-leakage, and canonical flag invariants.
 *
 * OFFLINE ONLY. No remote connections.
 * Applies full migration chain: phase1_core -> seven_team_tokens -> multi_hash_question_keys.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import { loadContentPack, seedContentPack } from "./fixtures/contentPackSeeder.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIGRATION_PATHS = [
  "supabase/migrations/20261025000000_phase1_core.sql",
  "supabase/migrations/20261026000000_seven_team_tokens.sql",
  "supabase/migrations/20261026010000_multi_hash_question_keys.sql",
];

// 7 synthetic teams required by internal_verify_expedition_dataset()
const SEVEN_SYNTH_TEAMS = [
  { name: "Synth Alpha",   callsign: "SYNTH-ALPHA-01",   pw: "PwAlpha123!",   token: "OFFLINE-TOKEN-ALPHA-2026" },
  { name: "Synth Bravo",   callsign: "SYNTH-BRAVO-02",   pw: "PwBravo123!",   token: "OFFLINE-TOKEN-BRAVO-2026" },
  { name: "Synth Charlie", callsign: "SYNTH-CHARLIE-03", pw: "PwCharlie123!", token: "OFFLINE-TOKEN-CHARLIE-2026" },
  { name: "Synth Delta",   callsign: "SYNTH-DELTA-04",   pw: "PwDelta123!",   token: "OFFLINE-TOKEN-DELTA-2026" },
  { name: "Synth Echo",    callsign: "SYNTH-ECHO-05",    pw: "PwEcho123!",    token: "OFFLINE-TOKEN-ECHO-2026" },
  { name: "Synth Foxtrot", callsign: "SYNTH-FOXTROT-06", pw: "PwFoxtrot123!", token: "OFFLINE-TOKEN-FOXTROT-2026" },
  { name: "Synth Golf",    callsign: "SYNTH-GOLF-07",    pw: "PwGolf123!",    token: "OFFLINE-TOKEN-GOLF-2026" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a fully-migrated, content-seeded in-memory database.
 * Chain: phase1_core -> seven_team_tokens -> multi_hash_question_keys.
 * Seeds content pack (event stays in 'draft'), then adds 7 synth teams + treasure secrets.
 */
async function buildSeededDb() {
  const db = await createDisposableDatabase();
  for (const mp of MIGRATION_PATHS) {
    await db.exec(fs.readFileSync(path.resolve(mp), "utf-8"));
  }

  // Seed content pack (event left in 'draft')
  await seedContentPack(db, { bcryptRounds: 8 });

  // Seed 7 synthetic teams with per-team treasure secrets (required by dataset validator)
  for (const t of SEVEN_SYNTH_TEAMS) {
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
  return db;
}

/** Activate event (requires exactly 7 teams with treasure secrets to already exist). */
async function activateEvent(db) {
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() - INTERVAL '1 hour',
        end_at   = clock_timestamp() + INTERVAL '6 hours'
    WHERE id = 1;
  `);
}

/** Log in as synthetic team by index (0-6). */
async function loginSynthTeam(db, idx = 0) {
  const t = SEVEN_SYNTH_TEAMS[idx];
  const res = await db.query(
    "SELECT public.authenticate_team($1, $2, $3) as r;",
    [t.callsign, t.pw, "127.0.0.1"]
  );
  const r = res.rows[0].r;
  assert.equal(r.success, true, `Login failed for ${t.callsign}`);
  return { token: r.session_token, teamId: r.team_id };
}

// ---------------------------------------------------------------------------
// TEST 1: Schema invariants after seeding
// ---------------------------------------------------------------------------

test("Schema invariants: 45 canonical keys, exactly 98 total rows", async () => {
  const db = await buildSeededDb();

  const canonicalCount = (await db.query(
    "SELECT COUNT(*) as c FROM public.question_keys WHERE is_canonical = true;"
  )).rows[0].c;

  const totalKeysCount = (await db.query(
    "SELECT COUNT(*) as c FROM public.question_keys;"
  )).rows[0].c;

  const distinctQCount = (await db.query(
    "SELECT COUNT(DISTINCT question_id) as c FROM public.question_keys;"
  )).rows[0].c;

  assert.equal(Number(canonicalCount), 45, "Exactly 45 canonical keys required");
  assert.equal(Number(totalKeysCount), 98, "Exactly 98 total verifier rows (45 canonical + 53 variants)");
  assert.equal(Number(distinctQCount), 45, "All 45 questions must have at least one verifier");
});

test("Schema invariants: No question has more than one canonical key", async () => {
  const db = await buildSeededDb();

  const dupCanon = (await db.query(`
    SELECT question_id, COUNT(*) as cnt
    FROM public.question_keys
    WHERE is_canonical = true
    GROUP BY question_id
    HAVING COUNT(*) > 1;
  `)).rows;

  assert.equal(dupCanon.length, 0, "No question should have multiple canonical keys");
});

test("Schema invariants: Exactly 135 hints; all questions have hints 1, 2, and 3", async () => {
  const db = await buildSeededDb();

  const hintCount = (await db.query("SELECT COUNT(*) as c FROM public.hints;")).rows[0].c;
  assert.equal(Number(hintCount), 135, "Exactly 135 hints required");

  // Every question must have hint_number 1, 2, AND 3
  const missingHints = (await db.query(`
    SELECT q.id
    FROM public.questions q
    CROSS JOIN (VALUES (1),(2),(3)) AS req(h)
    LEFT JOIN public.hints h ON h.question_id = q.id AND h.hint_number = req.h
    WHERE h.id IS NULL;
  `)).rows;
  assert.equal(missingHints.length, 0, "Every question must have hints 1, 2, and 3");
});

// ---------------------------------------------------------------------------
// TEST 2: All canonical answers accepted (bcrypt match)
// ---------------------------------------------------------------------------

test("All 45 canonical answers produce a bcrypt match in question_keys", async () => {
  const db = await buildSeededDb();
  const { privateKey } = loadContentPack();

  const questions = (await db.query(`
    SELECT q.id AS qid, q.level_number, q.order_seq
    FROM public.questions q
    ORDER BY q.level_number, q.order_seq;
  `)).rows;

  assert.equal(questions.length, 45, "Must have 45 questions");

  let acceptedCount = 0;
  for (const q of questions) {
    const qNum = (q.level_number - 1) * 10 + Number(q.order_seq);
    const keyData = privateKey.private_answer_keys.find(k => k.question_id === qNum);
    if (!keyData) continue;

    const norm = normalize(keyData.canonical_answer);
    const matchRow = (await db.query(`
      SELECT COUNT(*) as c
      FROM public.question_keys
      WHERE question_id = $1
        AND is_canonical = true
        AND extensions.crypt($2, answer_hash) = answer_hash;
    `, [q.qid, norm])).rows[0].c;

    assert.equal(Number(matchRow), 1, `Canonical answer for Q${qNum} must produce bcrypt match`);
    acceptedCount++;
  }

  assert.equal(acceptedCount, 45, "All 45 canonical answers must produce bcrypt match");
});

// ---------------------------------------------------------------------------
// TEST 3: All approved variant answers accepted (bcrypt match)
// ---------------------------------------------------------------------------

test("All 53 secondary variant answers produce bcrypt matches", async () => {
  const db = await buildSeededDb();
  const { privateKey } = loadContentPack();

  const questions = (await db.query(`
    SELECT q.id AS qid, q.level_number, q.order_seq
    FROM public.questions q
    ORDER BY q.level_number, q.order_seq;
  `)).rows;

  let totalVariantsTested = 0;
  let totalVariantMatches = 0;

  for (const q of questions) {
    const qNum = (q.level_number - 1) * 10 + Number(q.order_seq);
    const keyData = privateKey.private_answer_keys.find(k => k.question_id === qNum);
    if (!keyData) continue;

    const canonNorm = normalize(keyData.canonical_answer);
    const variants = (keyData.accepted_variants || []).map(normalize).filter(v => v !== canonNorm);

    for (const variant of variants) {
      totalVariantsTested++;
      const matchRow = (await db.query(`
        SELECT COUNT(*) as c
        FROM public.question_keys
        WHERE question_id = $1
          AND extensions.crypt($2, answer_hash) = answer_hash;
      `, [q.qid, variant])).rows[0].c;

      assert.equal(
        Number(matchRow), 1,
        `Variant for Q${qNum} must match a hash in question_keys (answer text omitted)`
      );
      totalVariantMatches++;
    }
  }

  assert.ok(totalVariantsTested > 0, "Must have tested at least one secondary variant");
  assert.equal(totalVariantMatches, totalVariantsTested, "All secondary variants must have matching hashes");
  assert.equal(totalVariantsTested, 53, `Expected exactly 53 secondary variants, got ${totalVariantsTested}`);
});

// ---------------------------------------------------------------------------
// TEST 4: Wrong answers are rejected (no bcrypt match)
// ---------------------------------------------------------------------------

test("Wrong answers produce no bcrypt match for L1 questions", async () => {
  const db = await buildSeededDb();

  const questions = (await db.query(`
    SELECT q.id AS qid, q.level_number, q.order_seq
    FROM public.questions q
    WHERE q.level_number = 1
    ORDER BY q.order_seq;
  `)).rows;

  const wrongAnswers = [
    "WRONG_ANSWER_XYZ", "incorrect", "nope", "nil", "123456",
    "the answer", "i do not know", "skip", "nothing", "???",
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const wrong = wrongAnswers[i] || "WRONG_FALLBACK";
    const matchRow = (await db.query(`
      SELECT COUNT(*) as c
      FROM public.question_keys
      WHERE question_id = $1
        AND extensions.crypt($2, answer_hash) = answer_hash;
    `, [q.qid, wrong])).rows[0].c;

    assert.equal(Number(matchRow), 0, `Wrong answer must not match any hash for L1Q${i + 1}`);
  }
});

// ---------------------------------------------------------------------------
// TEST 5: submit_team_answer RPC -- canonical and variant accepted
// ---------------------------------------------------------------------------

test("submit_team_answer: canonical answer accepted via RPC for Q1", async () => {
  const db = await buildSeededDb();
  await activateEvent(db);
  const { token } = await loginSynthTeam(db, 0);
  const { privateKey } = loadContentPack();

  const q1 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
  )).rows[0];

  // Wrong answer first
  const wrongRes = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q1.id, "DEFINITELY_WRONG_ANSWER_FOR_Q1"]
  )).rows[0].r;
  assert.equal(wrongRes.success, true);
  assert.equal(wrongRes.correct, false);

  // Canonical answer
  const k1 = privateKey.private_answer_keys.find(k => k.question_id === 1);
  const correctRes = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q1.id, k1.canonical_answer]
  )).rows[0].r;
  assert.equal(correctRes.success, true);
  assert.equal(correctRes.correct, true);
});

test("submit_team_answer: first approved variant accepted via RPC for Q1 (if variant exists)", async () => {
  const db = await buildSeededDb();
  await activateEvent(db);
  const { token } = await loginSynthTeam(db, 1);
  const { privateKey } = loadContentPack();

  const k1 = privateKey.private_answer_keys.find(k => k.question_id === 1);
  const variants = (k1.accepted_variants || []).map(normalize)
    .filter(v => v !== normalize(k1.canonical_answer));

  if (variants.length === 0) {
    // Q1 has no secondary variants -- skip gracefully
    return;
  }

  const q1 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
  )).rows[0];

  const varRes = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q1.id, variants[0]]
  )).rows[0].r;
  assert.equal(varRes.success, true);
  assert.equal(varRes.correct, true, "First approved variant for Q1 must be accepted via RPC");
});

// ---------------------------------------------------------------------------
// TEST 6: Event lifecycle gates
// ---------------------------------------------------------------------------

test("submit_team_answer: ERR_EVENT_NOT_ACTIVE when event is in draft", async () => {
  const db = await buildSeededDb();
  // Event remains in 'draft' after seeding

  const { token } = await loginSynthTeam(db, 2);
  const q1 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
  )).rows[0];

  const res = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q1.id, "any answer"]
  )).rows[0].r;

  assert.equal(res.success, false);
  assert.equal(res.error, "ERR_EVENT_NOT_ACTIVE");
});

test("submit_team_answer: ERR_EVENT_NOT_STARTED when start_at is in the future", async () => {
  const db = await buildSeededDb();

  // Force event active but future start
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() + INTERVAL '3 hours',
        end_at   = clock_timestamp() + INTERVAL '8 hours'
    WHERE id = 1;
  `);

  const { token } = await loginSynthTeam(db, 3);
  const q1 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
  )).rows[0];

  const res = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q1.id, "any answer"]
  )).rows[0].r;

  assert.equal(res.success, false);
  assert.equal(res.error, "ERR_EVENT_NOT_STARTED");
});

// ---------------------------------------------------------------------------
// TEST 7: Level progression gate
// ---------------------------------------------------------------------------

test("submit_team_answer: ERR_PREVIOUS_LEVEL_INCOMPLETE for L2 without finishing L1", async () => {
  const db = await buildSeededDb();
  await activateEvent(db);
  const { token } = await loginSynthTeam(db, 4);
  const { privateKey } = loadContentPack();

  const q11 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 2 AND order_seq = 1;"
  )).rows[0];

  const k11 = privateKey.private_answer_keys.find(k => k.question_id === 11);

  const res = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q11.id, k11.canonical_answer]
  )).rows[0].r;

  assert.equal(res.success, false);
  assert.equal(res.error, "ERR_PREVIOUS_LEVEL_INCOMPLETE");
});

// ---------------------------------------------------------------------------
// TEST 8: Level 5 dependency chain gate
// ---------------------------------------------------------------------------

test("Level 5: Q42 locked until Q41 solved (ERR_PREREQUISITE_CLUE_LOCKED)", async () => {
  const db = await buildSeededDb();
  await activateEvent(db);
  const { token, teamId } = await loginSynthTeam(db, 5);
  const { privateKey } = loadContentPack();

  // Simulate completing levels 1-4
  const allL1toL4 = (await db.query(`
    SELECT id, level_number FROM public.questions
    WHERE level_number BETWEEN 1 AND 4
    ORDER BY level_number, order_seq;
  `)).rows;

  for (const q of allL1toL4) {
    await db.query(
      "INSERT INTO public.team_progress (team_id, question_id, level_number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;",
      [teamId, q.id, q.level_number]
    );
  }

  // Attempt Q42 (order_seq 2) without solving Q41
  const q42 = (await db.query(
    "SELECT id FROM public.questions WHERE level_number = 5 AND order_seq = 2;"
  )).rows[0];

  const k42 = privateKey.private_answer_keys.find(k => k.question_id === 42);

  const res = (await db.query(
    "SELECT public.submit_team_answer($1, $2, $3) as r;",
    [token, q42.id, k42.canonical_answer]
  )).rows[0].r;

  assert.equal(res.success, false);
  assert.equal(res.error, "ERR_PREREQUISITE_CLUE_LOCKED");
});

// ---------------------------------------------------------------------------
// TEST 9: Dataset integrity validator
// ---------------------------------------------------------------------------

test("internal_verify_expedition_dataset: fails without treasure secrets (fail-closed)", async () => {
  // Use only phase1_core + multi_hash, NO team secrets -> activation must fail
  const db = await createDisposableDatabase();
  for (const mp of MIGRATION_PATHS) {
    await db.exec(fs.readFileSync(path.resolve(mp), "utf-8"));
  }
  await seedContentPack(db, { bcryptRounds: 8 });
  // No teams or treasure secrets seeded

  await assert.rejects(
    async () => {
      await db.exec(`UPDATE public.event_config SET status = 'active' WHERE id = 1;`);
    },
    /DATASET_INTEGRITY_FAIL/,
    "Dataset validator must fail-closed when treasure secrets are absent"
  );
});

test("internal_verify_expedition_dataset: passes with valid 7-team fixture", async () => {
  const db = await buildSeededDb();
  // Should succeed: 45 questions, 45 canonical keys, 7 teams, 7 treasure secrets
  await activateEvent(db);

  const status = (await db.query("SELECT status FROM public.event_config WHERE id = 1;")).rows[0].status;
  assert.equal(status, "active", "Event must be active after passing dataset validation");
});

// ---------------------------------------------------------------------------
// TEST 10: Hint 3 content -- no approved answer leaked
// ---------------------------------------------------------------------------

test("No Hint 3 text contains any approved answer variant as a substring", async () => {
  const db = await buildSeededDb();
  const { privateKey } = loadContentPack();

  const hints3 = (await db.query(`
    SELECT h.question_id, h.hint_number, h.content
    FROM public.hints h
    WHERE h.hint_number = 3
    ORDER BY h.question_id;
  `)).rows;

  assert.equal(hints3.length, 45, "Must have 45 hint-3 rows");

  const questions = (await db.query(`
    SELECT q.id AS qid, q.level_number, q.order_seq
    FROM public.questions q ORDER BY q.level_number, q.order_seq;
  `)).rows;

  const qUuidToNum = new Map();
  for (const q of questions) {
    const qNum = (q.level_number - 1) * 10 + Number(q.order_seq);
    qUuidToNum.set(q.qid, qNum);
  }

  let leakCount = 0;
  for (const hint of hints3) {
    const qNum = qUuidToNum.get(hint.question_id);
    if (!qNum) continue;
    const keyData = privateKey.private_answer_keys.find(k => k.question_id === qNum);
    if (!keyData) continue;

    const allAnswers = [
      normalize(keyData.canonical_answer),
      ...(keyData.accepted_variants || []).map(normalize),
    ];

    const hintNorm = normalize(hint.content);
    for (const ans of allAnswers) {
      if (ans.length >= 2 && hintNorm.includes(ans)) {
        leakCount++;
        console.error(`[LEAK] Q${qNum} Hint 3 leaks answer text`);
      }
    }
  }

  assert.equal(leakCount, 0, `Found ${leakCount} Hint 3 answer leak(s) -- all must be leak-free`);
});

test("Hints 1 and 2: all present and non-empty for all 45 questions", async () => {
  const db = await buildSeededDb();

  const emptyHints = (await db.query(`
    SELECT COUNT(*) as c FROM public.hints
    WHERE hint_number IN (1, 2)
    AND (content IS NULL OR TRIM(content) = '');
  `)).rows[0].c;

  assert.equal(Number(emptyHints), 0, "No hint 1 or hint 2 may have empty content");
});

test("All 135 hints (Hints 1, 2, and 3): no premature answer leaks across entire pack", async () => {
  const db = await buildSeededDb();
  const { privateKey } = loadContentPack();

  const allHints = (await db.query(`
    SELECT h.question_id, h.hint_number, h.content
    FROM public.hints h
    ORDER BY h.question_id, h.hint_number;
  `)).rows;

  assert.equal(allHints.length, 135, "Must have exactly 135 total hints (45 questions x 3 hints)");

  const questions = (await db.query(`
    SELECT q.id AS qid, q.level_number, q.order_seq
    FROM public.questions q ORDER BY q.level_number, q.order_seq;
  `)).rows;

  const qUuidToNum = new Map();
  for (const q of questions) {
    const qNum = (q.level_number - 1) * 10 + Number(q.order_seq);
    qUuidToNum.set(q.qid, qNum);
  }

  // Documented, verified harmless substring matches that do not constitute answer leaks:
  // - Q7 H2: "Think of three generations." uses "three" as an adjective for family depth;
  //   the prompt already explicitly says "share three apples", so "three" does not reveal the answer count.
  // - Q12 H2: "1010 = 8+0+2+0." contains "10" solely as part of the binary literal 1010 from the prompt.
  const KNOWN_INCIDENTAL_MATCHES = new Set([
    "Q7-H2-three",
    "Q12-H2-10",
  ]);

  let leakCount = 0;
  let incidentalCount = 0;

  for (const hint of allHints) {
    const qNum = qUuidToNum.get(hint.question_id);
    if (!qNum) continue;
    const keyData = privateKey.private_answer_keys.find(k => k.question_id === qNum);
    if (!keyData) continue;

    const allAnswers = Array.from(new Set([
      normalize(keyData.canonical_answer),
      ...(keyData.accepted_variants || []).map(normalize),
    ]));

    const hintNorm = normalize(hint.content);
    for (const ans of allAnswers) {
      if (ans.length >= 2 && hintNorm.includes(ans)) {
        const matchKey = `Q${qNum}-H${hint.hint_number}-${ans}`;
        if (KNOWN_INCIDENTAL_MATCHES.has(matchKey)) {
          incidentalCount++;
        } else {
          leakCount++;
          console.error(`[UNEXPECTED LEAK] Q${qNum} Hint ${hint.hint_number} leaks answer variant '${ans}'`);
        }
      }
    }
  }

  assert.equal(leakCount, 0, `Found ${leakCount} unexpected hint leak(s) in 135-hint audit`);
  assert.equal(incidentalCount, 2, "Must accurately account for exactly 2 documented incidental matches");
});

// ---------------------------------------------------------------------------
// TEST 11: Rollback migration -- canonical-only rows preserved
// ---------------------------------------------------------------------------

test("Rollback migration: prunes secondary variants, preserves 45 canonical rows", async () => {
  const db = await buildSeededDb();

  const totalBefore = (await db.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
  assert.equal(Number(totalBefore), 98, "Precondition: 98 total rows before rollback");

  const rollbackSql = fs.readFileSync(
    path.resolve("supabase/rollback/20261026010000_multi_hash_question_keys_rollback.sql"),
    "utf-8"
  );
  await db.exec(rollbackSql);

  // After rollback, is_canonical column is dropped; only 45 rows (one per question) should remain
  const totalAfter = (await db.query("SELECT COUNT(*) as c FROM public.question_keys;")).rows[0].c;
  assert.equal(Number(totalAfter), 45, "After rollback: exactly 45 rows (one canonical per question)");

  // Verify primary key restored on question_id (each question has exactly 1 row)
  const uniqueQs = (await db.query(
    "SELECT COUNT(DISTINCT question_id) as c FROM public.question_keys;"
  )).rows[0].c;
  assert.equal(Number(uniqueQs), 45, "After rollback: 45 distinct question_ids (one row per question)");
});
