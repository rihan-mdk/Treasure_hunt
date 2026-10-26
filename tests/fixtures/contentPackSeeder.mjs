import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const masterPath = path.resolve("the_hunt_expedition_content_pack_v1/content_master.json");
const privateKeyPath = path.resolve("the_hunt_expedition_content_pack_v1/private_answer_key.json");

export function loadContentPack() {
  const master = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
  const privateKey = JSON.parse(fs.readFileSync(privateKeyPath, "utf-8"));
  return { master, privateKey };
}

/**
 * Seeds content pack v1 into target PostgreSQL database.
 * Leaves event in 'draft' status.
 */
export async function seedContentPack(db, options = { bcryptRounds: 8 }) {
  const { master, privateKey } = loadContentPack();
  const bcryptCost = options.bcryptRounds || 8;

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

  // Map question_id (1..45) to created UUID
  const questionIdMap = new Map();

  // 2. Seed Questions 1 to 40 (Levels 1 to 4)
  for (let qNum = 1; qNum <= 40; qNum++) {
    const qData = master.questions.find(x => x.question_id === qNum);
    assert.ok(qData, `Question ${qNum} must exist in content pack`);

    const qRes = await db.query(
      `
      INSERT INTO public.questions (
        level_number, order_seq, title, prompt, cipher_type, cipher_payload, coordinates_hint, dependency_question_id
      ) VALUES (
        $1, $2, $3, $4, $5, NULL, NULL, NULL
      )
      ON CONFLICT (level_number, order_seq) DO UPDATE SET
        title = EXCLUDED.title,
        prompt = EXCLUDED.prompt,
        cipher_type = EXCLUDED.cipher_type
      RETURNING id;
      `,
      [qData.level_id, qData.sequence_in_level, qData.title, qData.participant_prompt, qData.question_type]
    );

    const qUuid = qRes.rows[0].id;
    questionIdMap.set(qNum, qUuid);

    // Seed canonical answer key
    const keyData = privateKey.private_answer_keys.find(x => x.question_id === qNum);
    assert.ok(keyData, `Key for question ${qNum} must exist in private_answer_key`);
    const normCanonical = keyData.canonical_answer.trim().toLowerCase().replace(/\s+/g, " ");

    await db.query(
      `
      INSERT INTO public.question_keys (question_id, answer_hash, is_canonical)
      VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', $3)), true)
      ON CONFLICT (question_id, answer_hash) DO UPDATE SET
        is_canonical = EXCLUDED.is_canonical;
      `,
      [qUuid, normCanonical, bcryptCost]
    );

    // Seed secondary variants if any
    const seenVariants = new Set([normCanonical]);
    const variants = keyData.accepted_variants || [];
    for (const v of variants) {
      const normV = v.trim().toLowerCase().replace(/\s+/g, " ");
      if (!seenVariants.has(normV)) {
        seenVariants.add(normV);
        await db.query(
          `
          INSERT INTO public.question_keys (question_id, answer_hash, is_canonical)
          VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', $3)), false)
          ON CONFLICT (question_id, answer_hash) DO NOTHING;
          `,
          [qUuid, normV, bcryptCost]
        );
      }
    }

    // Seed 3 hints
    for (const h of qData.hints) {
      await db.query(
        `
        INSERT INTO public.hints (question_id, level_number, hint_number, content)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (question_id, hint_number) DO UPDATE SET
          content = EXCLUDED.content;
        `,
        [qUuid, qData.level_id, h.hint_number, h.text]
      );
    }
  }

  // 3. Seed Questions 41 to 45 (Level 5 with strict sequential chain)
  let prevQId = null;
  for (let qNum = 41; qNum <= 45; qNum++) {
    const qData = master.questions.find(x => x.question_id === qNum);
    assert.ok(qData, `Question ${qNum} must exist in content pack`);

    const qRes = await db.query(
      `
      INSERT INTO public.questions (
        level_number, order_seq, title, prompt, cipher_type, cipher_payload, coordinates_hint, dependency_question_id
      ) VALUES (
        5, $1, $2, $3, $4, NULL, NULL, $5
      )
      ON CONFLICT (level_number, order_seq) DO UPDATE SET
        title = EXCLUDED.title,
        prompt = EXCLUDED.prompt,
        cipher_type = EXCLUDED.cipher_type,
        dependency_question_id = EXCLUDED.dependency_question_id
      RETURNING id;
      `,
      [qData.sequence_in_level, qData.title, qData.participant_prompt, qData.question_type, prevQId]
    );

    const qUuid = qRes.rows[0].id;
    questionIdMap.set(qNum, qUuid);
    prevQId = qUuid;

    // Seed canonical answer key
    const keyData = privateKey.private_answer_keys.find(x => x.question_id === qNum);
    const normCanonical = keyData.canonical_answer.trim().toLowerCase().replace(/\s+/g, " ");

    await db.query(
      `
      INSERT INTO public.question_keys (question_id, answer_hash, is_canonical)
      VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', $3)), true)
      ON CONFLICT (question_id, answer_hash) DO UPDATE SET
        is_canonical = EXCLUDED.is_canonical;
      `,
      [qUuid, normCanonical, bcryptCost]
    );

    // Seed secondary variants
    const seenVariants = new Set([normCanonical]);
    const variants = keyData.accepted_variants || [];
    for (const v of variants) {
      const normV = v.trim().toLowerCase().replace(/\s+/g, " ");
      if (!seenVariants.has(normV)) {
        seenVariants.add(normV);
        await db.query(
          `
          INSERT INTO public.question_keys (question_id, answer_hash, is_canonical)
          VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', $3)), false)
          ON CONFLICT (question_id, answer_hash) DO NOTHING;
          `,
          [qUuid, normV, bcryptCost]
        );
      }
    }

    // Seed 3 hints
    for (const h of qData.hints) {
      await db.query(
        `
        INSERT INTO public.hints (question_id, level_number, hint_number, content)
        VALUES ($1, 5, $2, $3)
        ON CONFLICT (question_id, hint_number) DO UPDATE SET
          content = EXCLUDED.content;
        `,
        [qUuid, h.hint_number, h.text]
      );
    }
  }

  // 4. Ensure event config is in 'draft' status
  await db.exec(`
    INSERT INTO public.event_config (id, status, is_locked)
    VALUES (1, 'draft', false)
    ON CONFLICT (id) DO UPDATE SET
      status = 'draft',
      is_locked = false;
  `);

  // Verify counts
  const levelsCount = await db.query("SELECT COUNT(*) as c FROM public.levels;");
  const questionsCount = await db.query("SELECT COUNT(*) as c FROM public.questions;");
  const keysCount = await db.query("SELECT COUNT(*) as c FROM public.question_keys;");
  const hintsCount = await db.query("SELECT COUNT(*) as c FROM public.hints;");
  const eventStatus = await db.query("SELECT status FROM public.event_config WHERE id = 1;");

  assert.equal(Number(levelsCount.rows[0].c), 5, "Expected 5 levels");
  assert.equal(Number(questionsCount.rows[0].c), 45, "Expected 45 questions");
  assert.ok(Number(keysCount.rows[0].c) >= 45, `Expected at least 45 question_keys rows (multi-hash), got ${keysCount.rows[0].c}`);
  assert.equal(Number(hintsCount.rows[0].c), 135, "Expected 135 hints");
  assert.equal(eventStatus.rows[0].status, "draft", "Event must remain in draft status");

  return {
    levels: 5,
    questions: 45,
    keys: Number(keysCount.rows[0].c),
    hints: 135,
    eventStatus: "draft",
    questionIdMap,
  };
}
