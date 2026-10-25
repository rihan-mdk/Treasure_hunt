# The Hunt Expedition — Content Pack v1

- `participant_questions.json`: participant-safe prompts and hints; no answers.
- `private_answer_key.json`: organizer-only canonical answers and accepted variants. Never ship to clients.
- `content_master.json`: combined source of truth and venue/rule metadata.
- `seed_template.sql`: safety notes only; not directly executable.

Review checkpoint-card placement before the event. Questions 31 and 38 require organizer-placed cards, but no precise campus locations are assumed. Treasure location and physical token remain unset. Check all accepted variants against the actual RPC normalization. This pack is not yet a schema-mapped Supabase seed.

Rules: 180 minutes; levels 1–4 have 10 questions each; level 5 has 5 sequential questions; 3 hints per question but max 3 unique hint reveals per team per level. Completing all 45 questions only qualifies a team for marshal-verified physical treasure.

Level 5 Q41 requires completion of questions 1–40; Q42–Q45 each require the immediately preceding question.
