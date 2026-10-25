import fs from "node:fs";
import path from "node:path";

const masterPath = path.resolve("the_hunt_expedition_content_pack_v1/content_master.json");
const participantPath = path.resolve("the_hunt_expedition_content_pack_v1/participant_questions.json");
const privateKeyPath = path.resolve("the_hunt_expedition_content_pack_v1/private_answer_key.json");

const master = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
const participant = JSON.parse(fs.readFileSync(participantPath, "utf-8"));
const privateKey = JSON.parse(fs.readFileSync(privateKeyPath, "utf-8"));

console.log("=== THE HUNT EXPEDITION — CONTENT PACK v1 AUDIT ===");

// 1. Total counts
console.log(`\n1. Question Count in Master: ${master.questions.length}`);
console.log(`   Question Count in Participant: ${participant.questions.length}`);
console.log(`   Answer Key Count in Private: ${privateKey.private_answer_keys.length}`);

// 2. Questions per level
const levelCounts = {};
for (const q of master.questions) {
  levelCounts[q.level_id] = (levelCounts[q.level_id] || 0) + 1;
}
console.log("\n2. Distribution per Level:", levelCounts);

// 3. Hints audit
let totalHints = 0;
const hintIssues = [];
for (const q of master.questions) {
  if (!Array.isArray(q.hints) || q.hints.length !== 3) {
    hintIssues.push(`Question ${q.question_id} has ${q.hints?.length} hints (expected 3)`);
  } else {
    totalHints += q.hints.length;
    const nums = q.hints.map(h => h.hint_number).sort();
    if (nums[0] !== 1 || nums[1] !== 2 || nums[2] !== 3) {
      hintIssues.push(`Question ${q.question_id} hints not numbered 1, 2, 3: ${JSON.stringify(nums)}`);
    }
  }
}
console.log(`\n3. Total Hints in Master: ${totalHints}`);
if (hintIssues.length > 0) {
  console.log("   Hint Issues:", hintIssues);
} else {
  console.log("   All 45 questions have exactly hints 1, 2, and 3!");
}

// 4. Dependencies audit
console.log("\n4. Question Dependencies:");
for (const q of master.questions) {
  if (q.level_id === 5 || (q.requires_question_ids && q.requires_question_ids.length > 0)) {
    console.log(`   Q${q.question_id} (Level ${q.level_id}, Seq ${q.sequence_in_level}): requires ->`, q.requires_question_ids);
  }
}

// 5. Questions 41-45 inspection
console.log("\n5. Questions 41-45 Detailed Inspection:");
for (let id = 41; id <= 45; id++) {
  const q = master.questions.find(x => x.question_id === id);
  const k = privateKey.private_answer_keys.find(x => x.question_id === id);
  console.log(`\n   --- Question ${id} (Level ${q.level_id}, Seq ${q.sequence_in_level}) ---`);
  console.log(`   Title: "${q.title}"`);
  console.log(`   Type: ${q.question_type}`);
  console.log(`   Prompt: "${q.participant_prompt}"`);
  console.log(`   Hints: [1: "${q.hints[0].text}", 2: "${q.hints[1].text}", 3: "${q.hints[2].text}"]`);
  console.log(`   Canonical Answer: "${k?.canonical_answer}"`);
  console.log(`   Accepted Variants:`, k?.accepted_variants);
}

console.log("\n6. All 45 Canonical Answers & Accepted Variants:");
for (const k of privateKey.private_answer_keys) {
  console.log(`   Q${k.question_id.toString().padStart(2, '0')}: canonical="${k.canonical_answer}" | variants=${JSON.stringify(k.accepted_variants)}`);
}
