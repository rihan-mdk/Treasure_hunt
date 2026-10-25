import fs from "node:fs";
import path from "node:path";

const masterPath = path.resolve("the_hunt_expedition_content_pack_v1/content_master.json");
const participantPath = path.resolve("the_hunt_expedition_content_pack_v1/participant_questions.json");
const privateKeyPath = path.resolve("the_hunt_expedition_content_pack_v1/private_answer_key.json");

const master = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
const participant = JSON.parse(fs.readFileSync(participantPath, "utf-8"));
const privateKey = JSON.parse(fs.readFileSync(privateKeyPath, "utf-8"));

const updates = [
  {
    question_id: 3,
    prompt: "At 3:15, what is the smaller angle between the hands of an analogue clock in degrees? (Enter the number only)",
    hint_3: "7.5",
    canonical_answer: "7.5",
    accepted_variants: ["7.5", "7.5 degrees", "7.5°"],
  },
  {
    question_id: 8,
    prompt: "Four batteries each power a torch for 2 hours, one at a time. How many total hours does the torch run? (Enter the number only)",
    hint_3: "8",
    canonical_answer: "8",
    accepted_variants: ["8", "8 hours", "eight hours"],
  },
  {
    question_id: 15,
    prompt: "Three switches outside a closed room control an incandescent bulb inside. You may enter the room only once. Besides light, what physical property of the bulb allows you to identify which switch was turned on? (Enter one word)",
    hint_1: "Use the bulb's thermal state.",
    hint_2: "A bulb that was turned on stays warm for a while.",
    hint_3: "heat",
    canonical_answer: "heat",
    accepted_variants: ["heat", "temperature", "warmth"],
  },
  {
    question_id: 26,
    prompt: "Links A→B, B→C, and C→D take 4 ms, 7 ms, and 3 ms respectively. What is the total latency in milliseconds? (Enter the number only)",
    hint_3: "14",
    canonical_answer: "14",
    accepted_variants: ["14", "14 ms", "14 milliseconds"],
  },
  {
    question_id: 29,
    prompt: "A cryptographic hash function processes input data of any size to produce a fixed-length output known as a what? (Enter one word)",
    hint_1: "It is not ordinary two-way encryption.",
    hint_2: "The fixed-length output is commonly called a message ______.",
    hint_3: "digest",
    canonical_answer: "digest",
    accepted_variants: ["digest", "hash", "hash digest", "message digest"],
  },
  {
    question_id: 32,
    prompt: "Three water bottles cost ₹20 each and two snacks cost ₹15 each. What is the total cost in rupees? (Enter the number only)",
    hint_3: "90",
    canonical_answer: "90",
    accepted_variants: ["90", "₹90", "90 rupees", "ninety"],
  },
  {
    question_id: 33,
    prompt: "A rectangular stage is 8 m by 5 m. What is its perimeter in meters? (Enter the number only)",
    hint_3: "26",
    canonical_answer: "26",
    accepted_variants: ["26", "26 m", "26 metres", "26 meters"],
  },
  {
    question_id: 35,
    prompt: "A safe marked route P→Q→R→S takes 3, 5, and 4 minutes per leg. What is the total time in minutes? (Enter the number only)",
    hint_3: "12",
    canonical_answer: "12",
    accepted_variants: ["12", "12 minutes", "12 mins"],
  },
];

for (const u of updates) {
  // 1. Update in master questions
  const mq = master.questions.find(q => q.question_id === u.question_id);
  if (mq) {
    mq.participant_prompt = u.prompt;
    if (u.hint_1) mq.hints[0].text = u.hint_1;
    if (u.hint_2) mq.hints[1].text = u.hint_2;
    if (u.hint_3) mq.hints[2].text = u.hint_3;
  }

  // 2. Update in participant questions
  const pq = participant.questions.find(q => q.question_id === u.question_id);
  if (pq) {
    pq.participant_prompt = u.prompt;
    if (u.hint_1) pq.hints[0].text = u.hint_1;
    if (u.hint_2) pq.hints[1].text = u.hint_2;
    if (u.hint_3) pq.hints[2].text = u.hint_3;
  }

  // 3. Update in master private_answer_keys
  const mk = master.private_answer_keys.find(k => k.question_id === u.question_id);
  if (mk) {
    mk.canonical_answer = u.canonical_answer;
    mk.accepted_variants = u.accepted_variants;
  }

  // 4. Update in private_answer_key.json
  const pk = privateKey.private_answer_keys.find(k => k.question_id === u.question_id);
  if (pk) {
    pk.canonical_answer = u.canonical_answer;
    pk.accepted_variants = u.accepted_variants;
  }
}

// Write back with 2-space indentation and trailing newline
fs.writeFileSync(masterPath, JSON.stringify(master, null, 2) + "\n", "utf-8");
fs.writeFileSync(participantPath, JSON.stringify(participant, null, 2) + "\n", "utf-8");
fs.writeFileSync(privateKeyPath, JSON.stringify(privateKey, null, 2) + "\n", "utf-8");

console.log("Successfully updated content pack files for questions:", updates.map(u => u.question_id));
