import fs from "node:fs";
import path from "node:path";

const masterPath = path.resolve("the_hunt_expedition_content_pack_v1/content_master.json");
const privateKeyPath = path.resolve("the_hunt_expedition_content_pack_v1/private_answer_key.json");

const master = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
const privateKey = JSON.parse(fs.readFileSync(privateKeyPath, "utf-8"));

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + str.replace(/'/g, "''") + "'";
}

let sql = `-- ============================================================================
-- THE HUNT EXPEDITION — CONTENT PACK V1 LOCAL SEED DRAFT
-- Source: the_hunt_expedition_content_pack_v1
-- Total Questions: 45 | Total Hints: 135 | Status: DRAFT (Unactivated)
--
-- SAFETY NOTICE:
-- 1. Strictly for local testing and approved staging preparation.
-- 2. Never execute against production (kcupmzqnyitkchkmftcl).
-- 3. Keeps event in 'draft' status. Event must NOT be activated automatically.
-- 4. Physical treasure token/verifier intentionally NOT included.
-- ============================================================================

BEGIN;

-- 1. Levels (5 levels, 10 questions each for L1-L4, 5 for L5)
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

-- 2. Clean existing questions/keys/hints for repeatable seeding
DELETE FROM public.hints WHERE level_number BETWEEN 1 AND 5;
DELETE FROM public.question_keys;
DELETE FROM public.questions;

-- 3. Questions, Answer Keys, and Contextual Hints
DO $$
DECLARE
  v_q_id uuid;
  v_l5_q1 uuid;
  v_l5_q2 uuid;
  v_l5_q3 uuid;
  v_l5_q4 uuid;
  v_l5_q5 uuid;
BEGIN
`;

// Questions 1 to 40
for (let qNum = 1; qNum <= 40; qNum++) {
  const qData = master.questions.find(x => x.question_id === qNum);
  const kData = privateKey.private_answer_keys.find(x => x.question_id === qNum);
  const normAns = kData.canonical_answer.trim().toLowerCase().replace(/\s+/g, " ");

  sql += `
  -- Question ${qNum} (Level ${qData.level_id}, Seq ${qData.sequence_in_level})
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (${qData.level_id}, ${qData.sequence_in_level}, ${escapeSql(qData.title)}, ${escapeSql(qData.participant_prompt)}, ${escapeSql(qData.question_type)}, NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt(${escapeSql(normAns)}, extensions.gen_salt('bf', 12)));
`;

  for (const h of qData.hints) {
    sql += `  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, ${qData.level_id}, ${h.hint_number}, ${escapeSql(h.text)});\n`;
  }
}

// Level 5 Questions 41 to 45 (Strict sequential chain)
const q41 = master.questions.find(x => x.question_id === 41);
const k41 = privateKey.private_answer_keys.find(x => x.question_id === 41).canonical_answer.trim().toLowerCase().replace(/\s+/g, " ");
sql += `
  -- Level 5 Clue 1 (Q41) - Root of linear chain (NULL dependency)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 1, ${escapeSql(q41.title)}, ${escapeSql(q41.participant_prompt)}, ${escapeSql(q41.question_type)}, NULL)
  RETURNING id INTO v_l5_q1;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q1, extensions.crypt(${escapeSql(k41)}, extensions.gen_salt('bf', 12)));
`;
for (const h of q41.hints) {
  sql += `  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q1, 5, ${h.hint_number}, ${escapeSql(h.text)});\n`;
}

// Q42..Q45
const l5Vars = ["v_l5_q1", "v_l5_q2", "v_l5_q3", "v_l5_q4", "v_l5_q5"];
for (let i = 2; i <= 5; i++) {
  const qNum = 40 + i;
  const qData = master.questions.find(x => x.question_id === qNum);
  const kData = privateKey.private_answer_keys.find(x => x.question_id === qNum).canonical_answer.trim().toLowerCase().replace(/\s+/g, " ");
  const currVar = l5Vars[i - 1];
  const depVar = l5Vars[i - 2];

  sql += `
  -- Level 5 Clue ${i} (Q${qNum}) - Depends on ${depVar}
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, ${i}, ${escapeSql(qData.title)}, ${escapeSql(qData.participant_prompt)}, ${escapeSql(qData.question_type)}, ${depVar})
  RETURNING id INTO ${currVar};

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (${currVar}, extensions.crypt(${escapeSql(kData)}, extensions.gen_salt('bf', 12)));
`;
  for (const h of qData.hints) {
    sql += `  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (${currVar}, 5, ${h.hint_number}, ${escapeSql(h.text)});\n`;
  }
}

sql += `
END $$;

-- 4. Event Configuration (Safety: Event remains in 'draft' status)
INSERT INTO public.event_config (id, status, is_locked)
VALUES (1, 'draft', false)
ON CONFLICT (id) DO UPDATE SET
  status = 'draft',
  is_locked = false;

COMMIT;
`;

const outputPath = path.resolve("supabase/seed_content_pack_v1.sql");
fs.writeFileSync(outputPath, sql, "utf-8");
console.log("Generated:", outputPath);
