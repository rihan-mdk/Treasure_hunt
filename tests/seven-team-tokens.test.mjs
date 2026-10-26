/**
 * ============================================================================
 * THE HUNT EXPEDITION — OFFLINE TESTS: SEVEN TEAM TREASURE TOKENS
 * File: tests/seven-team-tokens.test.mjs
 * ============================================================================
 *
 * Verifies the 7-team physical treasure token architecture:
 * 1. Migration applies cleanly on top of core migration.
 * 2. All 7 teams can be assigned unique tokens and dataset integrity passes.
 * 3. Cross-team token rejection (Team A cannot use Team B's token).
 * 4. Invalid/short/malformed tokens rejected fail-closed.
 * 5. Incomplete teams (<45 questions) cannot claim even with valid token.
 * 6. First eligible team with valid token is crowned atomically.
 * 7. Duplicate claim by the winning team is rejected (ERR_EVENT_ALREADY_WON).
 * 8. Subsequent claim by another fully qualified team is rejected (single winner).
 * 9. Rollback applies cleanly and allows clean reapplication.
 *
 * Runs exclusively offline using disposable in-memory PGlite instances.
 * ZERO network calls or writes to remote Supabase projects.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createDisposableDatabase } from "./migration-runner.mjs";

const CORE_MIGRATION_PATH = path.resolve("supabase/migrations/20261025000000_phase1_core.sql");
const SEVEN_TOKENS_MIGRATION_PATH = path.resolve("supabase/migrations/20261026000000_seven_team_tokens.sql");
const ROLLBACK_MIGRATION_PATH = path.resolve("supabase/rollback/20261026000000_seven_team_tokens_rollback.sql");

const SEVEN_TEAMS = [
  { name: "Synthetic Alpha", callsign: "ALPHA-01", password: "PasswordAlpha123!" },
  { name: "Synthetic Bravo", callsign: "BRAVO-02", password: "PasswordBravo123!" },
  { name: "Synthetic Charlie", callsign: "CHARLIE-03", password: "PasswordCharlie123!" },
  { name: "Synthetic Delta", callsign: "DELTA-04", password: "PasswordDelta123!" },
  { name: "Synthetic Echo", callsign: "ECHO-05", password: "PasswordEcho123!" },
  { name: "Synthetic Foxtrot", callsign: "FOXTROT-06", password: "PasswordFoxtrot123!" },
  { name: "Synthetic Golf", callsign: "GOLF-07", password: "PasswordGolf123!" },
];

const MARSHAL = {
  username: "marshal_lead",
  callsign: "MARSHAL-LEAD-01",
  password: "MarshalSecretPass123!",
};

/** Generates a 128+ bit CSPRNG token */
function generateToken(seedSuffix) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let token = "HUNT-";
  for (let g = 0; g < 5; g++) {
    if (g > 0) token += "-";
    for (let i = 0; i < 5; i++) {
      token += chars[crypto.randomInt(chars.length)];
    }
  }
  return token;
}

/** Boots a database with core migration + seven tokens migration */
async function bootMigratedDatabase() {
  const db = await createDisposableDatabase();
  const coreSql = fs.readFileSync(CORE_MIGRATION_PATH, "utf-8");
  const sevenTokensSql = fs.readFileSync(SEVEN_TOKENS_MIGRATION_PATH, "utf-8");

  await db.exec(coreSql);
  await db.exec(sevenTokensSql);
  return db;
}

/** Seeds 5 levels, 45 questions, 7 teams, 1 marshal, and 7 team tokens */
async function seedFullScenario(db) {
  // 1. Seed levels
  await db.exec(`
    INSERT INTO public.levels (level_number, name, codename, required_questions, hints_allocated)
    VALUES
      (1, 'Level 1', 'SECTOR_1', 10, 3),
      (2, 'Level 2', 'SECTOR_2', 10, 3),
      (3, 'Level 3', 'SECTOR_3', 10, 3),
      (4, 'Level 4', 'SECTOR_4', 10, 3),
      (5, 'Level 5', 'SECTOR_5', 5, 3)
    ON CONFLICT (level_number) DO NOTHING;
  `);

  // 2. Seed questions (Levels 1-4: 10 each, Level 5: 5 linear)
  const questionIds = [];
  for (let l = 1; l <= 4; l++) {
    for (let s = 1; s <= 10; s++) {
      const qRes = await db.query(
        `INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type)
         VALUES ($1, $2, $3, $4, 'vigenere') RETURNING id;`,
        [l, s, `L${l}Q${s}`, `Prompt L${l}Q${s}`]
      );
      const qId = qRes.rows[0].id;
      questionIds.push({ id: qId, level: l, order: s });
      await db.query(
        `INSERT INTO public.question_keys (question_id, answer_hash)
         VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)));`,
        [qId, `ans-l${l}-q${s}`]
      );
      for (let h = 1; h <= 3; h++) {
        await db.query(
          `INSERT INTO public.hints (question_id, level_number, hint_number, content)
           VALUES ($1, $2, $3, $4);`,
          [qId, l, h, `Hint ${h} for L${l}Q${s}`]
        );
      }
    }
  }

  // Level 5 questions
  let prevId = null;
  for (let s = 1; s <= 5; s++) {
    const qRes = await db.query(
      `INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
       VALUES (5, $1, $2, $3, 'linear', $4) RETURNING id;`,
      [s, `L5Q${s}`, `Prompt L5Q${s}`, prevId]
    );
    const qId = qRes.rows[0].id;
    prevId = qId;
    questionIds.push({ id: qId, level: 5, order: s });
    await db.query(
      `INSERT INTO public.question_keys (question_id, answer_hash)
       VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)));`,
      [qId, `ans-l5-q${s}`]
    );
    for (let h = 1; h <= 3; h++) {
      await db.query(
        `INSERT INTO public.hints (question_id, level_number, hint_number, content)
         VALUES ($1, 5, $2, $3);`,
        [qId, h, `Hint ${h} for L5Q${s}`]
      );
    }
  }

  // 3. Seed 7 teams
  const teamTokens = new Map();
  for (const t of SEVEN_TEAMS) {
    const teamRes = await db.query(
      `INSERT INTO public.teams (team_name, callsign, password_hash)
       VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 8)))
       RETURNING id;`,
      [t.name, t.callsign, t.password]
    );
    const teamId = teamRes.rows[0].id;
    const token = generateToken(t.callsign);
    teamTokens.set(t.callsign, { teamId, rawToken: token });

    // Seed team-bound secret
    await db.query(
      `INSERT INTO public.treasure_secrets (team_id, token_verifier, is_claimed)
       VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)), false);`,
      [teamId, token]
    );
  }

  // 4. Seed marshal
  await db.query(
    `INSERT INTO public.marshals (username, callsign, password_hash, is_active)
     VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 8)), true);`,
    [MARSHAL.username, MARSHAL.callsign, MARSHAL.password]
  );

  // 5. Activate event window
  await db.query(`
    UPDATE public.event_config
    SET status = 'active',
        is_locked = false,
        start_at = clock_timestamp() - INTERVAL '1 hour',
        end_at = clock_timestamp() + INTERVAL '5 hours'
    WHERE id = 1;
  `);

  return { questionIds, teamTokens };
}

/** Helper: solves all 45 questions for a given team */
async function solveAll45(db, teamId, questionIds) {
  for (const q of questionIds) {
    await db.query(
      `INSERT INTO public.team_progress (team_id, question_id, level_number, solved_at)
       VALUES ($1, $2, $3, clock_timestamp())
       ON CONFLICT (team_id, question_id) DO NOTHING;`,
      [teamId, q.id, q.level]
    );
  }
}

// ============================================================================
// TESTS
// ============================================================================

test("Seven Tokens 1: Migration applies cleanly and validates schema", async () => {
  const db = await bootMigratedDatabase();

  const cols = (
    await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'treasure_secrets';
    `)
  ).rows.map((r) => r.column_name);

  assert.ok(cols.includes("team_id"), "treasure_secrets must contain team_id");
  assert.ok(cols.includes("token_verifier"), "treasure_secrets must contain token_verifier");
  assert.ok(cols.includes("is_claimed"), "treasure_secrets must contain is_claimed");

  // Verify single_secret_row constraint is dropped
  const constraints = (
    await db.query(`
      SELECT conname FROM pg_constraint WHERE conname = 'single_secret_row';
    `)
  ).rows;
  assert.equal(constraints.length, 0, "single_secret_row constraint must be dropped");
});

test("Seven Tokens 2: All seven teams assigned unique tokens and dataset integrity passes", async () => {
  const db = await bootMigratedDatabase();
  const { teamTokens } = await seedFullScenario(db);

  assert.equal(teamTokens.size, 7, "Must have exactly 7 team tokens mapped");

  const secretsCount = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c
  );
  assert.equal(secretsCount, 7, "public.treasure_secrets must contain exactly 7 rows");

  // Run validate_entire_dataset()
  const valid = (await db.query("SELECT public.validate_entire_dataset() as v;")).rows[0].v;
  assert.equal(valid, true, "validate_entire_dataset() must return true for all 7 teams");
});

test("Seven Tokens 3: Cross-team token rejection (Team Alpha cannot use Team Bravo's token)", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const alpha = teamTokens.get("ALPHA-01");
  const bravo = teamTokens.get("BRAVO-02");

  // Alpha solves all 45 questions
  await solveAll45(db, alpha.teamId, questionIds);

  // Authenticate marshal
  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;
  assert.equal(marshalLogin.success, true);

  // Marshal tries to verify Alpha with Bravo's token
  const crossVerify = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "ALPHA-01",
      bravo.rawToken, // Wrong token for Alpha!
    ])
  ).rows[0].res;

  assert.equal(crossVerify.success, false, "Must fail with cross-team token");
  assert.equal(crossVerify.error, "ERR_INVALID_PHYSICAL_TOKEN");

  // Invariants remain pristine
  const winnersCount = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c
  );
  assert.equal(winnersCount, 0, "No winner must be recorded on rejected verification");
});

test("Seven Tokens 4: Invalid/short token rejection", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const alpha = teamTokens.get("ALPHA-01");
  await solveAll45(db, alpha.teamId, questionIds);

  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;

  const shortVerify = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "ALPHA-01",
      "HUNT-SHORT", // <20 chars
    ])
  ).rows[0].res;

  assert.equal(shortVerify.success, false);
  assert.equal(shortVerify.error, "ERR_INVALID_PHYSICAL_TOKEN");
});

test("Seven Tokens 5: Incomplete team rejection (<45 questions)", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const bravo = teamTokens.get("BRAVO-02");
  // Bravo solves only 44 questions (omits the 45th)
  for (let i = 0; i < 44; i++) {
    const q = questionIds[i];
    await db.query(
      `INSERT INTO public.team_progress (team_id, question_id, level_number, solved_at)
       VALUES ($1, $2, $3, clock_timestamp());`,
      [bravo.teamId, q.id, q.level]
    );
  }

  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;

  const incompVerify = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "BRAVO-02",
      bravo.rawToken,
    ])
  ).rows[0].res;

  assert.equal(incompVerify.success, false);
  assert.equal(incompVerify.error, "ERR_TEAM_INCOMPLETE_QUESTIONS");
});

test("Seven Tokens 6: First eligible team with valid token wins atomically", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const alpha = teamTokens.get("ALPHA-01");
  await solveAll45(db, alpha.teamId, questionIds);

  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;

  const winRes = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "ALPHA-01",
      alpha.rawToken,
    ])
  ).rows[0].res;

  assert.equal(winRes.success, true, "Eligible team must win");
  assert.equal(winRes.team_id, alpha.teamId);

  // Assert winner record recorded
  const winnerRow = (
    await db.query("SELECT * FROM public.winner_verifications WHERE event_id = 1;")
  ).rows[0];
  assert.ok(winnerRow);
  assert.equal(winnerRow.winning_team_id, alpha.teamId);
  assert.ok(winnerRow.token_masked.startsWith("***-"));

  // Assert secret is_claimed is true
  const secretRow = (
    await db.query("SELECT is_claimed FROM public.treasure_secrets WHERE team_id = $1;", [
      alpha.teamId,
    ])
  ).rows[0];
  assert.equal(secretRow.is_claimed, true);

  // Assert event_config is completed and locked
  const ec = (await db.query("SELECT status, is_locked, winner_team_id FROM public.event_config WHERE id = 1;")).rows[0];
  assert.equal(ec.status, "completed");
  assert.equal(ec.is_locked, true);
  assert.equal(ec.winner_team_id, alpha.teamId);
});

test("Seven Tokens 7: Duplicate claim by winning team rejected (ERR_EVENT_ALREADY_WON)", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const alpha = teamTokens.get("ALPHA-01");
  await solveAll45(db, alpha.teamId, questionIds);

  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;

  // First win succeeds
  await db.query("SELECT public.marshal_verify_treasure($1, $2, $3);", [
    marshalLogin.session_token,
    "ALPHA-01",
    alpha.rawToken,
  ]);

  // Second claim rejected
  const dup = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "ALPHA-01",
      alpha.rawToken,
    ])
  ).rows[0].res;

  assert.equal(dup.success, false);
  assert.equal(dup.error, "ERR_EVENT_ALREADY_WON");
});

test("Seven Tokens 8: Subsequent attempt by another eligible team rejected (single winner enforced)", async () => {
  const db = await bootMigratedDatabase();
  const { questionIds, teamTokens } = await seedFullScenario(db);

  const alpha = teamTokens.get("ALPHA-01");
  const charlie = teamTokens.get("CHARLIE-03");

  // Both Alpha and Charlie solve all 45
  await solveAll45(db, alpha.teamId, questionIds);
  await solveAll45(db, charlie.teamId, questionIds);

  const marshalLogin = (
    await db.query("SELECT public.authenticate_marshal($1, $2, '127.0.0.1') as res;", [
      MARSHAL.username,
      MARSHAL.password,
    ])
  ).rows[0].res;

  // Alpha wins first
  const alphaWin = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "ALPHA-01",
      alpha.rawToken,
    ])
  ).rows[0].res;
  assert.equal(alphaWin.success, true);

  // Charlie presents valid token next — must be rejected
  const charlieAttempt = (
    await db.query("SELECT public.marshal_verify_treasure($1, $2, $3) as res;", [
      marshalLogin.session_token,
      "CHARLIE-03",
      charlie.rawToken,
    ])
  ).rows[0].res;

  assert.equal(charlieAttempt.success, false);
  assert.equal(charlieAttempt.error, "ERR_EVENT_ALREADY_WON");

  // Still only 1 winner record exists
  const count = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.winner_verifications;")).rows[0].c
  );
  assert.equal(count, 1, "Must never commit a second winner record");
});

test("Seven Tokens 9: Rollback removes team-bound structure even when 7 token rows exist", async () => {
  const db = await bootMigratedDatabase();
  const { teamTokens } = await seedFullScenario(db);

  // Confirm 7 token rows exist prior to rollback
  const initialCount = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c
  );
  assert.equal(initialCount, 7, "Must have exactly 7 rows in treasure_secrets before rollback");

  const rollbackSql = fs.readFileSync(ROLLBACK_MIGRATION_PATH, "utf-8");
  const sevenTokensSql = fs.readFileSync(SEVEN_TOKENS_MIGRATION_PATH, "utf-8");

  // Apply rollback — must succeed even with 7 rows present, truncating them safely
  await db.exec(rollbackSql);

  // Check columns in treasure_secrets
  const colsAfterRollback = (
    await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'treasure_secrets';
    `)
  ).rows.map((r) => r.column_name);

  assert.ok(!colsAfterRollback.includes("team_id"), "team_id must be removed after rollback");
  assert.ok(colsAfterRollback.includes("id"), "id must be restored");

  // Check single_secret_row restored
  const check = (
    await db.query("SELECT conname FROM pg_constraint WHERE conname = 'single_secret_row';")
  ).rows;
  assert.equal(check.length, 1, "single_secret_row constraint must be restored");

  // Confirm rows were cleared to satisfy single-row constraint
  const postRollbackCount = Number(
    (await db.query("SELECT COUNT(*) as c FROM public.treasure_secrets;")).rows[0].c
  );
  assert.equal(postRollbackCount, 0, "treasure_secrets must be empty after rollback");

  // Clean reapplication of migration
  await db.exec(sevenTokensSql);
  const reapplyCols = (
    await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'treasure_secrets';
    `)
  ).rows.map((r) => r.column_name);
  assert.ok(reapplyCols.includes("team_id"), "team_id must be re-added cleanly");
});

test("Seven Tokens 10: Dataset validator rejects 6 or 8 teams", async () => {
  const db = await bootMigratedDatabase();

  // Seed standard levels and questions
  await db.exec(`
    INSERT INTO public.levels (level_number, name, codename, required_questions, hints_allocated)
    VALUES
      (1, 'L1', 'S1', 10, 3), (2, 'L2', 'S2', 10, 3), (3, 'L3', 'S3', 10, 3),
      (4, 'L4', 'S4', 10, 3), (5, 'L5', 'S5', 5, 3)
    ON CONFLICT DO NOTHING;
  `);

  for (let l = 1; l <= 4; l++) {
    for (let s = 1; s <= 10; s++) {
      const qRes = await db.query(
        `INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type)
         VALUES ($1, $2, 'Q', 'P', 'vigenere') RETURNING id;`,
        [l, s]
      );
      const qId = qRes.rows[0].id;
      await db.query(
        `INSERT INTO public.question_keys (question_id, answer_hash)
         VALUES ($1, extensions.crypt('ans', extensions.gen_salt('bf', 8)));`,
        [qId]
      );
      for (let h = 1; h <= 3; h++) {
        await db.query(
          `INSERT INTO public.hints (question_id, level_number, hint_number, content)
           VALUES ($1, $2, $3, 'H');`,
          [qId, l, h]
        );
      }
    }
  }

  let prevId = null;
  for (let s = 1; s <= 5; s++) {
    const qRes = await db.query(
      `INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
       VALUES (5, $1, 'Q', 'P', 'linear', $2) RETURNING id;`,
      [s, prevId]
    );
    const qId = qRes.rows[0].id;
    prevId = qId;
    await db.query(
      `INSERT INTO public.question_keys (question_id, answer_hash)
       VALUES ($1, extensions.crypt('ans', extensions.gen_salt('bf', 8)));`,
      [qId]
    );
    for (let h = 1; h <= 3; h++) {
      await db.query(
        `INSERT INTO public.hints (question_id, level_number, hint_number, content)
         VALUES ($1, 5, $2, 'H');`,
        [qId, h]
      );
    }
  }

  // Helper to insert a synthetic team with token
  async function addTeam(callsign) {
    const tRes = await db.query(
      `INSERT INTO public.teams (team_name, callsign, password_hash)
       VALUES ($1, $1, extensions.crypt('pass', extensions.gen_salt('bf', 8))) RETURNING id;`,
      [callsign]
    );
    const tId = tRes.rows[0].id;
    await db.query(
      `INSERT INTO public.treasure_secrets (team_id, token_verifier, is_claimed)
       VALUES ($1, extensions.crypt('HUNT-VALID-TOKEN-12345-67890', extensions.gen_salt('bf', 8)), false);`,
      [tId]
    );
    return tId;
  }

  // 1. Seed only 6 teams
  for (let i = 1; i <= 6; i++) {
    await addTeam(`TEAM-0${i}`);
  }

  // Must reject 6 teams
  await assert.rejects(
    () => db.query("SELECT public.validate_entire_dataset();"),
    (err) => {
      assert.ok(
        err.message.includes("Expected exactly 7 registered teams, found 6"),
        `Expected 6-team rejection, got: ${err.message}`
      );
      return true;
    },
    "Dataset validator must reject 6 teams"
  );

  // 2. Add 7th team -> validator must succeed
  await addTeam("TEAM-07");
  const validRes = (await db.query("SELECT public.validate_entire_dataset() as v;")).rows[0].v;
  assert.equal(validRes, true, "Validator must pass with exactly 7 teams and tokens");

  // 3. Add 8th team -> validator must reject 8 teams
  await addTeam("TEAM-08");
  await assert.rejects(
    () => db.query("SELECT public.validate_entire_dataset();"),
    (err) => {
      assert.ok(
        err.message.includes("Expected exactly 7 registered teams, found 8"),
        `Expected 8-team rejection, got: ${err.message}`
      );
      return true;
    },
    "Dataset validator must reject 8 teams"
  );
});
