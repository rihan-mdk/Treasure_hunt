import assert from "node:assert/strict";

export const SYNTHETIC_TEAMS = [
  { name: "Synthetic Alpha", callsign: "ALPHA-01", password: "PasswordAlpha123!" },
  { name: "Synthetic Bravo", callsign: "BRAVO-02", password: "PasswordBravo123!" },
  { name: "Synthetic Charlie", callsign: "CHARLIE-03", password: "PasswordCharlie123!" },
];

export const SYNTHETIC_MARSHAL = {
  username: "marshal_lead",
  callsign: "MARSHAL-LEAD-01",
  password: "MarshalSecretPass123!",
};

export const SYNTHETIC_TREASURE_TOKEN = "HUNT-SYNTHETIC-TREASURE-TOKEN-2026-APEX";

export function getSyntheticAnswer(level, orderSeq) {
  return `answer-l${level}-q${orderSeq}`.toLowerCase();
}

/**
 * Seeds complete synthetic dataset into the target PostgreSQL database.
 */
export async function seedSyntheticData(db) {
  // 1. Seed levels
  await db.exec(`
    INSERT INTO public.levels (level_number, name, codename, required_questions, hints_allocated)
    VALUES
      (1, 'Surface Reconnaissance', 'SECTOR_ALPHA', 10, 3),
      (2, 'Cryptographic Substratum', 'SECTOR_BETA', 10, 3),
      (3, 'Subterranean Corridor', 'SECTOR_GAMMA', 10, 3),
      (4, 'Inner Sanctum', 'SECTOR_DELTA', 10, 3),
      (5, 'Vault of the Apex', 'SECTOR_OMEGA', 5, 3)
    ON CONFLICT (level_number) DO UPDATE SET
      name = EXCLUDED.name,
      codename = EXCLUDED.codename,
      required_questions = EXCLUDED.required_questions,
      hints_allocated = EXCLUDED.hints_allocated;
  `);

  // 2. Seed questions (Levels 1 to 4)
  for (let l = 1; l <= 4; l++) {
    for (let s = 1; s <= 10; s++) {
      const qRes = await db.query(
        `
        INSERT INTO public.questions (
          level_number, order_seq, title, prompt, cipher_type, cipher_payload, coordinates_hint
        ) VALUES (
          $1, $2, $3, $4, 'vigenere', 'TEST_CIPHER_PAYLOAD', 'LAT: 12.345, LON: 67.890'
        )
        ON CONFLICT (level_number, order_seq) DO UPDATE SET
          title = EXCLUDED.title,
          prompt = EXCLUDED.prompt
        RETURNING id;
        `,
        [l, s, `Level ${l} Sector ${s} Challenge`, `Decode the transmission for Sector ${s}`]
      );
      const qId = qRes.rows[0].id;
      const ans = getSyntheticAnswer(l, s);

      // Seed question key (bcrypt cost 8 for fast local testing)
      await db.query(
        `
        INSERT INTO public.question_keys (question_id, answer_hash)
        VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)))
        ON CONFLICT (question_id) DO UPDATE SET
          answer_hash = EXCLUDED.answer_hash;
        `,
        [qId, ans]
      );

      // Seed 3 hints per question
      for (let h = 1; h <= 3; h++) {
        await db.query(
          `
          INSERT INTO public.hints (question_id, level_number, hint_number, content)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (question_id, hint_number) DO UPDATE SET
            content = EXCLUDED.content;
          `,
          [qId, l, h, `Contextual synthetic clue #${h} for Level ${l} Sector ${s}`]
        );
      }
    }
  }

  // 3. Seed Level 5 questions with linear dependency chain
  let prevQId = null;
  for (let s = 1; s <= 5; s++) {
    const qRes = await db.query(
      `
      INSERT INTO public.questions (
        level_number, order_seq, title, prompt, cipher_type, cipher_payload, dependency_question_id
      ) VALUES (
        5, $1, $2, $3, 'columnar', 'FINAL_KEYSTONE_PAYLOAD', $4
      )
      ON CONFLICT (level_number, order_seq) DO UPDATE SET
        title = EXCLUDED.title,
        dependency_question_id = EXCLUDED.dependency_question_id
      RETURNING id;
      `,
      [s, `Apex Keystone Stage ${s}`, `Solve keystone cipher step ${s}`, prevQId]
    );
    const qId = qRes.rows[0].id;
    prevQId = qId;
    const ans = getSyntheticAnswer(5, s);

    // Seed question key
    await db.query(
      `
      INSERT INTO public.question_keys (question_id, answer_hash)
      VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 8)))
      ON CONFLICT (question_id) DO UPDATE SET
        answer_hash = EXCLUDED.answer_hash;
      `,
      [qId, ans]
    );

    // Seed 3 hints
    for (let h = 1; h <= 3; h++) {
      await db.query(
        `
        INSERT INTO public.hints (question_id, level_number, hint_number, content)
        VALUES ($1, 5, $2, $3)
        ON CONFLICT (question_id, hint_number) DO UPDATE SET
          content = EXCLUDED.content;
        `,
        [qId, h, `Apex Keystone guidance hint #${h} for Stage ${s}`]
      );
    }
  }

  // 4. Seed treasure secret
  await db.query(
    `
    INSERT INTO public.treasure_secrets (id, token_verifier, is_claimed)
    VALUES (1, extensions.crypt($1, extensions.gen_salt('bf', 8)), false)
    ON CONFLICT (id) DO UPDATE SET
      token_verifier = EXCLUDED.token_verifier,
      is_claimed = false;
    `,
    [SYNTHETIC_TREASURE_TOKEN]
  );

  // 5. Seed synthetic teams
  for (const team of SYNTHETIC_TEAMS) {
    await db.query(
      `
      INSERT INTO public.teams (team_name, callsign, password_hash)
      VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 8)))
      ON CONFLICT (callsign) DO UPDATE SET
        team_name = EXCLUDED.team_name,
        password_hash = EXCLUDED.password_hash;
      `,
      [team.name, team.callsign, team.password]
    );
  }

  // 6. Seed synthetic marshal
  await db.query(
    `
    INSERT INTO public.marshals (username, callsign, password_hash)
    VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 8)))
    ON CONFLICT (username) DO UPDATE SET
      callsign = EXCLUDED.callsign,
      password_hash = EXCLUDED.password_hash;
    `,
    [SYNTHETIC_MARSHAL.username, SYNTHETIC_MARSHAL.callsign, SYNTHETIC_MARSHAL.password]
  );

  // 7. Activate event via event_config update (triggers internal_verify_expedition_dataset)
  await db.exec(`
    UPDATE public.event_config
    SET status = 'active',
        start_at = clock_timestamp() - INTERVAL '1 hour',
        end_at = clock_timestamp() + INTERVAL '24 hours',
        is_locked = false,
        winner_team_id = NULL
    WHERE id = 1;
  `);

  // 8. Verify counts via database queries
  const levelsCount = await db.query("SELECT COUNT(*) as c FROM public.levels;");
  const questionsCount = await db.query("SELECT COUNT(*) as c FROM public.questions;");
  const keysCount = await db.query("SELECT COUNT(*) as c FROM public.question_keys;");
  const hintsCount = await db.query("SELECT COUNT(*) as c FROM public.hints;");
  const teamsCount = await db.query("SELECT COUNT(*) as c FROM public.teams;");
  const marshalsCount = await db.query("SELECT COUNT(*) as c FROM public.marshals;");
  const eventStatus = await db.query("SELECT status FROM public.event_config WHERE id = 1;");

  assert.equal(Number(levelsCount.rows[0].c), 5, "Expected 5 levels");
  assert.equal(Number(questionsCount.rows[0].c), 45, "Expected 45 questions");
  assert.equal(Number(keysCount.rows[0].c), 45, "Expected 45 keys");
  assert.equal(Number(hintsCount.rows[0].c), 135, "Expected 135 hints");
  assert.equal(Number(teamsCount.rows[0].c), 3, "Expected 3 teams");
  assert.equal(Number(marshalsCount.rows[0].c), 1, "Expected 1 marshal");
  assert.equal(eventStatus.rows[0].status, "active", "Expected event status 'active'");

  return {
    levels: 5,
    questions: 45,
    keys: 45,
    hints: 135,
    teams: 3,
    marshals: 1,
    eventStatus: "active",
  };
}
