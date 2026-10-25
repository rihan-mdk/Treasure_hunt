-- ============================================================================
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

  -- Question 1 (Level 1, Seq 1)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 1, 'The Silent Keeper', 'I have pages but am not a tree. I hold stories but never speak. What am I?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('book', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Think of something you read.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'It has bound pages.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'A book.');

  -- Question 2 (Level 1, Seq 2)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 2, 'The More You Take', 'The more steps you take, the more of these you leave behind. What are they?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('footprints', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'You leave them while moving.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'They may appear in dust or sand.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'Footprints.');

  -- Question 3 (Level 1, Seq 3)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 3, 'Clock Angle', 'At 3:15, what is the smaller angle between the hands of an analogue clock in degrees? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('7.5', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'The minute hand is at 90°.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'The hour hand is 7.5° past 3.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, '7.5');

  -- Question 4 (Level 1, Seq 4)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 4, 'Odd One Out', 'Which does not belong: triangle, square, circle, cube?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('cube', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Three are flat shapes.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'One is a 3D solid.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'Cube.');

  -- Question 5 (Level 1, Seq 5)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 5, 'Letter Steps', 'Continue: A, C, F, J, O, __.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('u', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Look at the gaps.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'The jumps are +2,+3,+4,+5.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'Next jump +6 gives U.');

  -- Question 6 (Level 1, Seq 6)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 6, 'Library Code', 'Using A=1 through Z=26, decode 3-1-20.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('cat', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Convert numbers to letters.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, '3=C, 1=A.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, '20=T: CAT.');

  -- Question 7 (Level 1, Seq 7)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 7, 'Two Fathers', 'Two fathers and two sons share three apples, one each. How many people?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('3', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'The relationships can overlap.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'Think of three generations.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'Grandfather, father, son: three people.');

  -- Question 8 (Level 1, Seq 8)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 8, 'Battery Hours', 'Four batteries each power a torch for 2 hours, one at a time. How many total hours does the torch run? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('8', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Add each battery’s duration.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'Four batteries, two hours each.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, '8');

  -- Question 9 (Level 1, Seq 9)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 9, 'Mirror Letter', 'Which capital letter is vertically symmetrical: A, F, G, or R?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('a', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Left and right halves must match.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'Only one option has vertical symmetry.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'A.');

  -- Question 10 (Level 1, Seq 10)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (1, 10, 'Expedition End', 'What letter ends both EXPEDITION and DESTINATION?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('n', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 1, 'Check the last letter of each word.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 2, 'Both words finish with the same letter.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 1, 3, 'N.');

  -- Question 11 (Level 2, Seq 1)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 1, 'Caesar Shift', 'Shift each letter one place backward: DBU. Decode it.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('cat', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Move each letter back one.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'D→C, B→A.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'U→T: CAT.');

  -- Question 12 (Level 2, Seq 2)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 2, 'Binary Trail', 'Convert binary 1010 to decimal.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('10', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Use place values 8,4,2,1.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, '1010 = 8+0+2+0.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, '10.');

  -- Question 13 (Level 2, Seq 3)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 3, 'Pattern Lock', 'Find the next number: 2, 6, 12, 20, 30, __.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('42', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Find the differences.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'They are +4,+6,+8,+10.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'Next +12: 42.');

  -- Question 14 (Level 2, Seq 4)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 4, 'Anagram Signal', 'Rearrange LISTEN to make a word meaning quiet.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('silent', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Use all six letters.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'It is an anagram of LISTEN.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'SILENT.');

  -- Question 15 (Level 2, Seq 5)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 5, 'Three Switches', 'Three switches outside a closed room control an incandescent bulb inside. You may enter the room only once. Besides light, what physical property of the bulb allows you to identify which switch was turned on? (Enter one word)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('heat', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Use the bulb''s thermal state.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'A bulb that was turned on stays warm for a while.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'heat');

  -- Question 16 (Level 2, Seq 6)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 6, 'HTTPS', 'What does HTTPS primarily provide for a web connection?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('encrypted connection', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'It protects data in transit.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'It uses a security protocol.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'An encrypted connection using TLS.');

  -- Question 17 (Level 2, Seq 7)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 7, 'Number Cipher', 'Using A=1, CODE is 3-15-4-5. What is the sum?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('27', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Add 3, 15, 4, and 5.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, '3+15=18; 4+5=9.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, '27.');

  -- Question 18 (Level 2, Seq 8)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 8, 'Logic Line', 'Mira is ahead of Sam. Sam is ahead of Jo. Who is last?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('jo', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Order them front to back.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'Mira, then Sam, then the remaining person.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'Jo.');

  -- Question 19 (Level 2, Seq 9)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 9, 'QR Knowledge', 'A QR code is what kind of code?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('two dimensional barcode', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'It uses a square pattern.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'It encodes data in two dimensions.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'A two-dimensional barcode.');

  -- Question 20 (Level 2, Seq 10)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (2, 10, 'Reverse Trail', 'Reverse LEVEL. What word do you get?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('level', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 1, 'Read right to left.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 2, 'It is a palindrome.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 2, 3, 'LEVEL.');

  -- Question 21 (Level 3, Seq 1)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 1, 'Truth and Lie', 'Exactly one statement is true. A: “B is lying.” B: “A and I are both lying.” Who tells the truth?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('a', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'B cannot be telling the truth.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'If B were truthful, B’s claim contradicts itself.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, 'A tells the truth.');

  -- Question 22 (Level 3, Seq 2)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 2, 'Grid Coordinates', 'Start at (2,3). Move 4 east and 2 south. Final coordinates?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('(6,1)', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'East increases x; south decreases y.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'x=2+4, y=3−2.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, '(6,1).');

  -- Question 23 (Level 3, Seq 3)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 3, 'Hexadecimal', 'Convert hexadecimal 2F to decimal.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('47', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'F equals 15.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, '2F = 2×16 + 15.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, '47.');

  -- Question 24 (Level 3, Seq 4)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 4, 'Three Boxes', 'Boxes labelled APPLES, ORANGES, MIXED all have wrong labels. From which box should you draw one fruit to identify all boxes?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('mixed', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'The MIXED label is wrong.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'Draw from the box labelled MIXED.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, 'Its fruit identifies it; use the wrong-label rule for the other two.');

  -- Question 25 (Level 3, Seq 5)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 5, 'Bubble Sort', 'After one left-to-right bubble-sort pass ascending, what is [8,3,5,1]?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('3,5,1,8', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'Compare adjacent pairs.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'Swap 8 with 3, then 8 with 5.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, 'Then swap 8 with 1: [3,5,1,8].');

  -- Question 26 (Level 3, Seq 6)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 6, 'Network Route', 'Links A→B, B→C, and C→D take 4 ms, 7 ms, and 3 ms respectively. What is the total latency in milliseconds? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('14', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'Add link delays.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, '4+7+3.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, '14');

  -- Question 27 (Level 3, Seq 7)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 7, 'Coin Probability', 'A fair coin is flipped twice. Probability of two heads?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('1/4', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'List HH, HT, TH, TT.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'Only one outcome has two heads.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, '1/4.');

  -- Question 28 (Level 3, Seq 8)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 8, 'Handshake Count', 'Three people each shake hands with every other person once. Total handshakes?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('3', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'Count pairs, not people’s perspectives.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'Pairs: AB, AC, BC.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, 'Three handshakes.');

  -- Question 29 (Level 3, Seq 9)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 9, 'Hash Clue', 'A cryptographic hash function processes input data of any size to produce a fixed-length output known as a what? (Enter one word)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('digest', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'It is not ordinary two-way encryption.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, 'The fixed-length output is commonly called a message ______.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, 'digest');

  -- Question 30 (Level 3, Seq 10)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (3, 10, 'Sequence Deduction', 'Find the next number: 1, 1, 2, 3, 5, 8, __.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('13', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 1, 'Each term sums the previous two.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 2, '5+8.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 3, 3, '13.');

  -- Question 31 (Level 4, Seq 1)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 1, 'Checkpoint Cipher', 'At an organizer-placed checkpoint card, decode 20-18-5-1-19-21-18-5 using A=1.', 'physical_checkpoint', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('treasure', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Convert each number to a letter.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '20=T, 18=R, 5=E.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, 'TREASURE.');

  -- Question 32 (Level 4, Seq 2)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 2, 'Canteen Calculation', 'Three water bottles cost ₹20 each and two snacks cost ₹15 each. What is the total cost in rupees? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('90', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Calculate each group.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '3×20=60; 2×15=30.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '90');

  -- Question 33 (Level 4, Seq 3)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 3, 'Stage Geometry', 'A rectangular stage is 8 m by 5 m. What is its perimeter in meters? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('26', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Perimeter=2×(length+width).');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '8+5=13.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '26');

  -- Question 34 (Level 4, Seq 4)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 4, 'Library Index', 'Take the first letter of LIBRARY and the last letter of READ. What two-letter code results?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('ld', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Use the positions specified.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, 'LIBRARY begins L; READ ends D.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, 'LD.');

  -- Question 35 (Level 4, Seq 5)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 5, 'Route Planning', 'A safe marked route P→Q→R→S takes 3, 5, and 4 minutes per leg. What is the total time in minutes? (Enter the number only)', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('12', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Add each leg.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '3+5+4.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '12');

  -- Question 36 (Level 4, Seq 6)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 6, 'Error Detection', 'Using A=1, decode 3-1-20.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('cat', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Convert each number.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '3=C and 1=A.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '20=T: CAT.');

  -- Question 37 (Level 4, Seq 7)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 7, 'Binary Checksum', 'Add binary 101 and 011. Give the answer in binary.', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('1000', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Convert to decimal if easier.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '5+3=8.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '8 in binary is 1000.');

  -- Question 38 (Level 4, Seq 8)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 8, 'Observation Card', 'An organizer-placed card shows ▲ ● ▲ ▲ ●. If ▲=1 and ●=0, what five-bit code is shown?', 'physical_checkpoint', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('10110', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Replace each symbol.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, '▲●▲▲● becomes 1 0 1 1 0.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, '10110.');

  -- Question 39 (Level 4, Seq 9)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 9, 'Missing Number', 'Three consecutive even numbers sum to 42. What is the middle number?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('14', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Represent them as n−2, n, n+2.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, 'Their sum is 3n=42.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, 'n=14.');

  -- Question 40 (Level 4, Seq 10)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (4, 10, 'Expedition Checkpoint', 'Take the first letter of COMPASS, last letter of MAP, and first letter of TRAIL. Code?', 'puzzle', NULL)
  RETURNING id INTO v_q_id;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_q_id, extensions.crypt('cpt', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 1, 'Take only the requested positions.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 2, 'C, P, T.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_q_id, 4, 3, 'CPT.');

  -- Level 5 Clue 1 (Q41) - Root of linear chain (NULL dependency)
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 1, 'Final Chain 1 — The Key', 'I have keys but no locks, space but no room, and you can enter but not go inside. What am I?', 'puzzle', NULL)
  RETURNING id INTO v_l5_q1;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q1, extensions.crypt('keyboard', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q1, 5, 1, 'It is used to type.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q1, 5, 2, 'It has a Space bar and an Enter key.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q1, 5, 3, 'KEYBOARD.');

  -- Level 5 Clue 2 (Q42) - Depends on v_l5_q1
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 2, 'Final Chain 2 — The Input', 'Using your answer to Q41, on a standard QWERTY keyboard what letter is immediately to the right of K?', 'puzzle', v_l5_q1)
  RETURNING id INTO v_l5_q2;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q2, extensions.crypt('l', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q2, 5, 1, 'Find K on the home row.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q2, 5, 2, 'The home row ends ... J K L.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q2, 5, 3, 'L.');

  -- Level 5 Clue 3 (Q43) - Depends on v_l5_q2
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 3, 'Final Chain 3 — The Count', 'Take the letter from Q42. What is its position in the English alphabet?', 'puzzle', v_l5_q2)
  RETURNING id INTO v_l5_q3;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q3, extensions.crypt('12', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q3, 5, 1, 'Use A=1.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q3, 5, 2, 'K is 11; the next letter is 12.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q3, 5, 3, 'L is the 12th letter.');

  -- Level 5 Clue 4 (Q44) - Depends on v_l5_q3
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 4, 'Final Chain 4 — The Code', 'Convert the number from Q43 using A=1, B=2, ... Z=26. Which letter is it?', 'puzzle', v_l5_q3)
  RETURNING id INTO v_l5_q4;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q4, extensions.crypt('l', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q4, 5, 1, 'Look up the twelfth letter.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q4, 5, 2, 'Count through the alphabet.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q4, 5, 3, 'L.');

  -- Level 5 Clue 5 (Q45) - Depends on v_l5_q4
  INSERT INTO public.questions (level_number, order_seq, title, prompt, cipher_type, dependency_question_id)
  VALUES (5, 5, 'Final Chain 5 — The Word', 'Write the letter from Q44, then the first letter of TREASURE, then the last letter of HUNT. What code do you get?', 'puzzle', v_l5_q4)
  RETURNING id INTO v_l5_q5;

  INSERT INTO public.question_keys (question_id, answer_hash)
  VALUES (v_l5_q5, extensions.crypt('ltt', extensions.gen_salt('bf', 12)));
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q5, 5, 1, 'Start with Q44’s answer.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q5, 5, 2, 'TREASURE begins T; HUNT ends T.');
  INSERT INTO public.hints (question_id, level_number, hint_number, content)
  VALUES (v_l5_q5, 5, 3, 'LTT.');

END $$;

-- 4. Event Configuration (Safety: Event remains in 'draft' status)
INSERT INTO public.event_config (id, status, is_locked)
VALUES (1, 'draft', false)
ON CONFLICT (id) DO UPDATE SET
  status = 'draft',
  is_locked = false;

COMMIT;
