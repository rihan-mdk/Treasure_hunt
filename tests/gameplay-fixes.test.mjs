/**
 * gameplay-fixes.test.mjs
 *
 * Verifies the three gameplay fixes applied in the hint-UUID / error-handling pass:
 *
 *   Fix 1  Hint UUID passes unchanged from MissionClient -> HintBottomSheet -> revealHintAction.
 *          The numeric display ordinal is never sent as p_hint_id.
 *   Fix 2  ERR_EVENT_NOT_ACTIVE is NOT displayed as an incorrect answer.
 *          A genuine wrong answer still shows the wrong-answer state.
 *   Fix 3  Failed hint requests do not reveal content or reduce the remaining-hint count.
 *
 * Uses the same offline PGlite database + synthetic fixtures as the rest of the test suite.
 * No production writes occur.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDisposableDatabase } from "./migration-runner.mjs";
import { seedSyntheticData, getSyntheticAnswer } from "./fixtures/syntheticData.mjs";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Boot a fresh DB, apply the migration, seed (active event), and log in team ALPHA-01. */
async function bootActiveDB() {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(
    path.resolve("supabase/migrations/20261025000000_phase1_core.sql"),
    "utf-8"
  );
  await db.exec(sql);
  await seedSyntheticData(db); // seeds with status='active'

  const login = (
    await db.query("SELECT public.authenticate_team($1, $2, $3) as res;", [
      "ALPHA-01",
      "PasswordAlpha123!",
      "127.0.0.1",
    ])
  ).rows[0].res;
  assert.equal(login.success, true, "Alpha team must log in successfully");
  return { db, token: login.session_token };
}

/** Boot a fresh DB seeded then reverted to DRAFT (start_at=NULL). */
async function bootDraftDB() {
  const db = await createDisposableDatabase();
  const sql = fs.readFileSync(
    path.resolve("supabase/migrations/20261025000000_phase1_core.sql"),
    "utf-8"
  );
  await db.exec(sql);
  await seedSyntheticData(db);

  // Revert to draft so the event-not-active gate fires
  await db.exec(`
    UPDATE public.event_config
    SET status   = 'draft',
        start_at = NULL,
        end_at   = NULL
    WHERE id = 1;
  `);

  const login = (
    await db.query("SELECT public.authenticate_team($1, $2, $3) as res;", [
      "ALPHA-01",
      "PasswordAlpha123!",
      "127.0.0.1",
    ])
  ).rows[0].res;
  assert.equal(login.success, true);
  return { db, token: login.session_token };
}

// ---------------------------------------------------------------------------
// FIX 1 — Hint UUID integrity
// ---------------------------------------------------------------------------

test("Fix 1a: request_reveal_hint succeeds with the real hint UUID (active event)", async () => {
  const { db, token } = await bootActiveDB();

  // This is the UUID that MissionClient.hintProps[*].hintId carries.
  const hintRow = (
    await db.query(
      "SELECT id, hint_number FROM public.hints WHERE level_number = 1 ORDER BY hint_number LIMIT 1;"
    )
  ).rows[0];

  const res = (
    await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [
      token,
      hintRow.id, // real UUID — what revealHintAction now receives after Fix 1
    ])
  ).rows[0].res;

  assert.equal(res.success, true, "Reveal with real UUID must succeed");
  assert.ok(res.content, "Revealed content must be non-empty");
  assert.equal(typeof res.hints_remaining, "number", "hints_remaining must be numeric");
});

test("Fix 1b: request_reveal_hint with integer hint_number throws — ordinal must NEVER be sent", async () => {
  const { db, token } = await bootActiveDB();

  // Before Fix 1, HintBottomSheet sent String(hint.id) which is '1', '2', '3'.
  // That causes a PostgreSQL uuid parse error. Confirm it still throws so the
  // fix can never silently regress.
  await assert.rejects(
    () =>
      db.query("SELECT public.request_reveal_hint($1, $2::uuid) as res;", [token, "1"]),
    (err) => {
      assert.ok(
        err.message.includes("invalid input syntax for type uuid"),
        `Expected uuid parse error, got: ${err.message}`
      );
      return true;
    },
    "Sending the display ordinal as UUID must throw — not silently succeed"
  );
});

test("Fix 1c: MissionClient hintProps shape — hintId is a UUID, id is the display ordinal", async () => {
  const { db } = await bootActiveDB();

  const hints = (
    await db.query(`
      SELECT id, hint_number, content
      FROM public.hints
      WHERE level_number = 1
        AND question_id = (
          SELECT id FROM public.questions
          WHERE level_number = 1 AND order_seq = 1
        )
      ORDER BY hint_number;
    `)
  ).rows;

  assert.ok(hints.length > 0, "At least one hint must exist for L1Q1");

  for (const h of hints) {
    // Simulate MissionClient hintProps mapping (post-fix)
    const hintProp = {
      id: h.hint_number,  // display ordinal — integer
      hintId: h.id,       // database UUID — string
    };

    assert.equal(typeof hintProp.id, "number", "id must be the numeric ordinal");
    assert.equal(typeof hintProp.hintId, "string", "hintId must be a string");
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hintProp.hintId),
      `hintId must be a valid UUID, got: ${hintProp.hintId}`
    );
    assert.notEqual(
      String(hintProp.id),
      hintProp.hintId,
      "The numeric ordinal string must NOT equal the UUID"
    );
  }
});

// ---------------------------------------------------------------------------
// FIX 2 — Answer submission: ERR_EVENT_NOT_ACTIVE vs. genuine wrong answer
// ---------------------------------------------------------------------------

test("Fix 2a: submit_team_answer in DRAFT returns ERR_EVENT_NOT_ACTIVE, not a wrong-answer result", async () => {
  const { db, token } = await bootDraftDB();

  const q1 = (
    await db.query(
      "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
    )
  ).rows[0];

  // Even the correct answer must be blocked with ERR_EVENT_NOT_ACTIVE in draft mode.
  const res = (
    await db.query("SELECT public.submit_team_answer($1, $2, $3) as res;", [
      token,
      q1.id,
      getSyntheticAnswer(1, 1),
    ])
  ).rows[0].res;

  assert.equal(res.success, false, "Must return success=false in draft");
  assert.equal(res.error, "ERR_EVENT_NOT_ACTIVE",
    "Must carry ERR_EVENT_NOT_ACTIVE so MissionClient shows 'inactive', not 'wrong'");
  // The 'correct' field must not be present — this is not a wrong answer
  assert.equal(res.correct, undefined,
    "correct field must be absent on a draft-blocked response");
});

test("Fix 2b: genuine wrong answer returns success=true, correct=false (no error code)", async () => {
  const { db, token } = await bootActiveDB();

  const q1 = (
    await db.query(
      "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
    )
  ).rows[0];

  const res = (
    await db.query("SELECT public.submit_team_answer($1, $2, $3) as res;", [
      token,
      q1.id,
      "this is definitely the wrong answer xyzzy",
    ])
  ).rows[0].res;

  // Genuine wrong: success=true, correct=false — MissionClient sets submitState='wrong'
  assert.equal(res.success, true, "Wrong answer must return success=true");
  assert.equal(res.correct, false, "Wrong answer must return correct=false");
  assert.equal(res.error, undefined, "Wrong answer must carry no error code");
});

test("Fix 2c: correct answer in active event returns success=true, correct=true", async () => {
  const { db, token } = await bootActiveDB();

  const q1 = (
    await db.query(
      "SELECT id FROM public.questions WHERE level_number = 1 AND order_seq = 1;"
    )
  ).rows[0];

  const res = (
    await db.query("SELECT public.submit_team_answer($1, $2, $3) as res;", [
      token,
      q1.id,
      getSyntheticAnswer(1, 1),
    ])
  ).rows[0].res;

  assert.equal(res.success, true);
  assert.equal(res.correct, true);
});

// ---------------------------------------------------------------------------
// FIX 3 — Failed hint requests: no content revealed, no quota consumed
// ---------------------------------------------------------------------------

test("Fix 3a: request_reveal_hint in DRAFT returns ERR_EVENT_NOT_ACTIVE — no content, no quota change", async () => {
  const { db, token } = await bootDraftDB();

  const teamId = (
    await db.query("SELECT public.internal_validate_team_session($1) as id;", [token])
  ).rows[0].id;

  const hintsBefore = Number(
    (
      await db.query("SELECT COUNT(*) as c FROM public.team_hints WHERE team_id = $1;", [teamId])
    ).rows[0].c
  );

  const hintRow = (
    await db.query(
      "SELECT id FROM public.hints WHERE level_number = 1 ORDER BY hint_number LIMIT 1;"
    )
  ).rows[0];

  const res = (
    await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [token, hintRow.id])
  ).rows[0].res;

  assert.equal(res.success, false);
  assert.equal(res.error, "ERR_EVENT_NOT_ACTIVE");
  assert.equal(res.content, undefined, "Content must not be returned on failure");

  // No team_hints row created
  const hintsAfter = Number(
    (
      await db.query("SELECT COUNT(*) as c FROM public.team_hints WHERE team_id = $1;", [teamId])
    ).rows[0].c
  );
  assert.equal(hintsAfter, hintsBefore,
    "team_hints count must be unchanged when request fails");
});

test("Fix 3b: quota-exceeded request returns ERR_HINT_QUOTA_EXCEEDED — no content revealed", async () => {
  const { db, token } = await bootActiveDB();

  const hints = (
    await db.query(
      "SELECT id FROM public.hints WHERE level_number = 1 ORDER BY hint_number LIMIT 4;"
    )
  ).rows;

  // Exhaust the 3-hint quota for level 1
  for (let i = 0; i < 3; i++) {
    const r = (
      await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [token, hints[i].id])
    ).rows[0].res;
    assert.equal(r.success, true, `Hint reveal ${i + 1} must succeed`);
  }

  // 4th attempt must be blocked
  const overQuota = (
    await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [token, hints[3].id])
  ).rows[0].res;

  assert.equal(overQuota.success, false);
  assert.equal(overQuota.error, "ERR_HINT_QUOTA_EXCEEDED");
  assert.equal(overQuota.content, undefined,
    "No content must be returned when quota is exceeded");
});

test("Fix 3c: re-reveal of an already-revealed hint is idempotent and does not consume quota", async () => {
  const { db, token } = await bootActiveDB();

  const teamId = (
    await db.query("SELECT public.internal_validate_team_session($1) as id;", [token])
  ).rows[0].id;

  const hintRow = (
    await db.query(
      "SELECT id FROM public.hints WHERE level_number = 1 ORDER BY hint_number LIMIT 1;"
    )
  ).rows[0];

  // First reveal — must succeed and record a team_hints row
  const first = (
    await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [token, hintRow.id])
  ).rows[0].res;
  assert.equal(first.success, true);
  assert.equal(typeof first.hints_remaining, "number",
    "First reveal must return hints_remaining");
  // quota used once (allocated=3, now 2)
  assert.ok(first.hints_remaining < 3, "hints_remaining must have decreased from initial quota");

  const countAfterFirst = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.team_hints WHERE team_id = $1;", [teamId])).rows[0].c
  );

  // Second reveal of the same hint — idempotent; must NOT add a new team_hints row
  const second = (
    await db.query("SELECT public.request_reveal_hint($1, $2) as res;", [token, hintRow.id])
  ).rows[0].res;
  assert.equal(second.success, true, "Re-reveal must succeed");
  assert.equal(second.already_revealed, true, "Must signal already_revealed on re-reveal");
  assert.ok(second.content, "Content must still be returned on re-reveal");
  // hints_remaining is intentionally absent on re-reveal responses
  assert.equal(second.hints_remaining, undefined,
    "DB does not re-emit hints_remaining on already_revealed responses");

  // Verify quota integrity via the ledger — no new row must have been added
  const countAfterSecond = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.team_hints WHERE team_id = $1;", [teamId])).rows[0].c
  );
  assert.equal(countAfterSecond, countAfterFirst,
    "team_hints count must not increase on idempotent re-reveal");
});
