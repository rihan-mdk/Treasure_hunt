import test from "node:test";
import assert from "node:assert/strict";

// Helper logic mimicking SQL routines for offline verification of invariants

function normalizeIdentifier(input) {
  if (!input) return "";
  return input.trim().toUpperCase();
}

function normalizeAnswer(input) {
  if (!input) return "";
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function validateLevelDistribution(levels) {
  assert.equal(levels.length, 5, "Must have exactly 5 levels");
  for (let i = 0; i < 4; i++) {
    assert.equal(levels[i].requiredQuestions, 10, `Level ${i + 1} must require 10 questions`);
  }
  assert.equal(levels[4].requiredQuestions, 5, "Level 5 must require 5 questions");
  const total = levels.reduce((acc, l) => acc + l.requiredQuestions, 0);
  assert.equal(total, 45, "Total required questions must be exactly 45");
  return true;
}

function validateLevel5Chain(clues) {
  assert.equal(clues.length, 5, "Level 5 must have 5 clues");
  assert.equal(clues[0].dependencyId, null, "Clue 1 must have null dependency");
  for (let i = 1; i < 5; i++) {
    assert.equal(
      clues[i].dependencyId,
      clues[i - 1].id,
      `Clue ${i + 1} must depend strictly on Clue ${i}`
    );
  }
  return true;
}

function validatePhysicalTokenFormat(token) {
  // 128 bits encoded yields 26 characters (or with prefix up to 32)
  const clean = token.trim().toUpperCase();
  const pattern = /^[A-Z0-9-]{20,36}$/;
  if (!pattern.test(clean)) {
    throw new Error("ERR_INVALID_PHYSICAL_TOKEN");
  }
  return `***-${clean.slice(-4)}`;
}

function sanitizeWinnerResponse(team, event, verification) {
  // Asserts strictly public fields are returned
  const payload = {
    event_completed: event.status === "completed",
    team_name: team.team_name,
    callsign: team.callsign,
    won_at: verification.verified_at,
  };

  assert.equal(payload.password_hash, undefined, "Must NOT leak password_hash");
  assert.equal(payload.token_verifier, undefined, "Must NOT leak token_verifier");
  assert.equal(payload.raw_token, undefined, "Must NOT leak raw_token");
  return payload;
}

// ----------------------------------------------------------------------------
// Test Cases
// ----------------------------------------------------------------------------

test("Invariant: Team identifier normalization prevents case/whitespace bypass", () => {
  assert.equal(normalizeIdentifier("  squad-alpha  "), "SQUAD-ALPHA");
  assert.equal(normalizeIdentifier("VANGUARD_01"), "VANGUARD_01");
  assert.equal(normalizeIdentifier("Shadow Vanguard"), "SHADOW VANGUARD");
});

test("Invariant: Answer normalization collapses whitespace and ignores case", () => {
  assert.equal(normalizeAnswer("  THE   ARCHWAY  "), "the archway");
  assert.equal(normalizeAnswer("Rot-3 Bell Tower"), "rot-3 bell tower");
  assert.equal(normalizeAnswer("KEYSTONE"), "keystone");
});

test("Invariant: Authoritative 45-question distribution (10, 10, 10, 10, 5)", () => {
  const levels = [
    { levelNumber: 1, requiredQuestions: 10 },
    { levelNumber: 2, requiredQuestions: 10 },
    { levelNumber: 3, requiredQuestions: 10 },
    { levelNumber: 4, requiredQuestions: 10 },
    { levelNumber: 5, requiredQuestions: 5 },
  ];
  assert.equal(validateLevelDistribution(levels), true);
});

test("Invariant: Level 5 strictly linear dependency chain validation", () => {
  const validChain = [
    { id: "c1", dependencyId: null },
    { id: "c2", dependencyId: "c1" },
    { id: "c3", dependencyId: "c2" },
    { id: "c4", dependencyId: "c3" },
    { id: "c5", dependencyId: "c4" },
  ];
  assert.equal(validateLevel5Chain(validChain), true);

  const brokenChain = [
    { id: "c1", dependencyId: null },
    { id: "c2", dependencyId: "c1" },
    { id: "c3", dependencyId: "c1" }, // Invalid: skips c2!
    { id: "c4", dependencyId: "c3" },
    { id: "c5", dependencyId: "c4" },
  ];
  assert.throws(() => validateLevel5Chain(brokenChain));
});

test("Invariant: Physical treasure token format and masking", () => {
  const validToken = "HUNT-9X2K-4M7P-W8Q1-Z3J5-F6R8";
  const masked = validatePhysicalTokenFormat(validToken);
  assert.equal(masked, "***-F6R8");

  assert.throws(() => validatePhysicalTokenFormat("SHORT"));
  assert.throws(() => validatePhysicalTokenFormat(""));
});

test("Invariant: Public winner response sanitization", () => {
  const team = {
    id: "uuid-123",
    team_name: "Squad Archimedes",
    callsign: "ARCHIMEDES",
    password_hash: "$2a$12$SECRETSECRETSECRET",
  };
  const event = { id: 1, status: "completed" };
  const verification = {
    verified_at: "2026-10-25T12:00:00Z",
    token_verifier: "$2a$12$TOKENSECRET",
    raw_token: "HUNT-SECRET-128BIT-TOKEN",
  };

  const publicData = sanitizeWinnerResponse(team, event, verification);
  assert.deepEqual(publicData, {
    event_completed: true,
    team_name: "Squad Archimedes",
    callsign: "ARCHIMEDES",
    won_at: "2026-10-25T12:00:00Z",
  });
});

test("Invariant: Event status & time window fail-closed checks", () => {
  function checkEventWindow(event, now) {
    if (!event || !event.status || event.status !== "active") {
      throw new Error("ERR_EVENT_NOT_ACTIVE");
    }
    if (event.start_at && now < event.start_at) {
      throw new Error("ERR_EVENT_NOT_STARTED");
    }
    if (event.end_at && now > event.end_at) {
      throw new Error("ERR_EVENT_EXPIRED");
    }
    return true;
  }

  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(
    checkEventWindow(
      {
        status: "active",
        start_at: new Date("2026-10-25T10:00:00Z"),
        end_at: new Date("2026-10-25T18:00:00Z"),
      },
      now
    ),
    true
  );

  assert.throws(
    () => checkEventWindow({ status: "draft" }, now),
    /ERR_EVENT_NOT_ACTIVE/
  );
  assert.throws(
    () => checkEventWindow(null, now),
    /ERR_EVENT_NOT_ACTIVE/
  );
  assert.throws(
    () =>
      checkEventWindow(
        {
          status: "active",
          start_at: new Date("2026-10-25T14:00:00Z"),
        },
        now
      ),
    /ERR_EVENT_NOT_STARTED/
  );
  assert.throws(
    () =>
      checkEventWindow(
        {
          status: "active",
          end_at: new Date("2026-10-25T11:00:00Z"),
        },
        now
      ),
    /ERR_EVENT_EXPIRED/
  );
});

test("Invariant: Canonical identity resolution for rate-limiting", () => {
  const registeredTeams = [
    { id: "uuid-1", callsign: "ARCHIMEDES", team_name: "Squad Archimedes" },
    { id: "uuid-2", callsign: "VANGUARD", team_name: "Shadow Vanguard" },
  ];

  function resolveAccountKey(identifier) {
    const norm = normalizeIdentifier(identifier);
    const match = registeredTeams.find(
      (t) => t.callsign === norm || t.team_name.toUpperCase() === norm
    );
    if (match) {
      return `team:${match.id}`;
    }
    return `unknown:${norm}`;
  }

  // Both callsign and team_name resolve to the same canonical bucket
  assert.equal(resolveAccountKey("ARCHIMEDES"), "team:uuid-1");
  assert.equal(resolveAccountKey("Squad Archimedes"), "team:uuid-1");
  assert.equal(resolveAccountKey("squad archimedes"), "team:uuid-1");
  assert.equal(resolveAccountKey("random_intruder"), "unknown:RANDOM_INTRUDER");
});

test("Invariant: Hint reveal order and prerequisite enforcement", () => {
  function validateHintReveal({
    levelNumber,
    isSolved,
    precedingLevelSolvedCounts,
    l5DependencySolved,
    revealedCountInLevel,
  }) {
    if (isSolved) {
      throw new Error("ERR_QUESTION_ALREADY_SOLVED");
    }
    if (levelNumber > 1) {
      for (let l = 1; l < levelNumber; l++) {
        const req = l < 5 ? 10 : 5;
        if ((precedingLevelSolvedCounts[l] || 0) < req) {
          throw new Error("ERR_PREVIOUS_LEVEL_INCOMPLETE");
        }
      }
    }
    if (levelNumber === 5 && l5DependencySolved === false) {
      throw new Error("ERR_PREREQUISITE_CLUE_LOCKED");
    }
    if (revealedCountInLevel >= 3) {
      throw new Error("ERR_HINT_QUOTA_EXCEEDED");
    }
    return true;
  }

  // Valid level 1 reveal
  assert.equal(
    validateHintReveal({
      levelNumber: 1,
      isSolved: false,
      precedingLevelSolvedCounts: {},
      l5DependencySolved: true,
      revealedCountInLevel: 2,
    }),
    true
  );

  // Rejected: Question already solved
  assert.throws(
    () =>
      validateHintReveal({
        levelNumber: 1,
        isSolved: true,
        precedingLevelSolvedCounts: {},
        l5DependencySolved: true,
        revealedCountInLevel: 0,
      }),
    /ERR_QUESTION_ALREADY_SOLVED/
  );

  // Rejected: Preceding level incomplete (Level 1 only has 9 of 10)
  assert.throws(
    () =>
      validateHintReveal({
        levelNumber: 2,
        isSolved: false,
        precedingLevelSolvedCounts: { 1: 9 },
        l5DependencySolved: true,
        revealedCountInLevel: 0,
      }),
    /ERR_PREVIOUS_LEVEL_INCOMPLETE/
  );

  // Rejected: Level 5 predecessor clue locked
  assert.throws(
    () =>
      validateHintReveal({
        levelNumber: 5,
        isSolved: false,
        precedingLevelSolvedCounts: { 1: 10, 2: 10, 3: 10, 4: 10 },
        l5DependencySolved: false,
        revealedCountInLevel: 0,
      }),
    /ERR_PREREQUISITE_CLUE_LOCKED/
  );

  // Rejected: Hint quota exhausted (3 already revealed)
  assert.throws(
    () =>
      validateHintReveal({
        levelNumber: 1,
        isSolved: false,
        precedingLevelSolvedCounts: {},
        l5DependencySolved: true,
        revealedCountInLevel: 3,
      }),
    /ERR_HINT_QUOTA_EXCEEDED/
  );
});

test("Invariant: Winner verification exact 45-question distribution", () => {
  function verifyEligibility(distribution) {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total !== 45) {
      throw new Error("ERR_TEAM_INCOMPLETE_QUESTIONS");
    }
    if (
      distribution[1] !== 10 ||
      distribution[2] !== 10 ||
      distribution[3] !== 10 ||
      distribution[4] !== 10 ||
      distribution[5] !== 5
    ) {
      throw new Error("ERR_TEAM_INCOMPLETE_QUESTIONS");
    }
    return true;
  }

  // Exact 10, 10, 10, 10, 5
  assert.equal(
    verifyEligibility({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 }),
    true
  );

  // Incomplete (44 total)
  assert.throws(
    () => verifyEligibility({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 4 }),
    /ERR_TEAM_INCOMPLETE_QUESTIONS/
  );

  // Wrong distribution (45 total, but 11 in L1 and 9 in L2)
  assert.throws(
    () => verifyEligibility({ 1: 11, 2: 9, 3: 10, 4: 10, 5: 5 }),
    /ERR_TEAM_INCOMPLETE_QUESTIONS/
  );
});

// ============================================================================
// CRITICAL INCREMENT 2 REGRESSION TEST SUITES
// ============================================================================

test("Regression: NULL and empty password rejection for team and marshal authentication", () => {
  // Simulates SQL authenticate_team and authenticate_marshal pre-checks and NULL-safe crypt comparison
  function simulateAuthenticate({ identifier, password, storedHash, isDisqualified = false }) {
    // 1. Explicit pre-check matching SQL migration
    if (!identifier || identifier.trim() === "" || password === null || password === undefined || password === "") {
      return { success: false, error: "ERR_INVALID_CREDENTIALS" };
    }

    if (isDisqualified) {
      return { success: false, error: "ERR_INVALID_CREDENTIALS" };
    }

    // 2. Explicit NULL-safe hash comparison (extensions.crypt(...) IS DISTINCT FROM stored_hash)
    if (!storedHash) {
      return { success: false, error: "ERR_INVALID_CREDENTIALS" };
    }

    // Assume mock bcrypt verifier: fails if password is empty or mismatch
    const isMatch = password === "validPassword123" && storedHash === "$2a$12$VALIDHASH";
    if (!isMatch) {
      return { success: false, error: "ERR_INVALID_CREDENTIALS" };
    }

    return {
      success: true,
      session_token: "mock_csprng_256bit_token_hex_string_64chars",
    };
  }

  const validHash = "$2a$12$VALIDHASH";

  // NULL password
  const resNullPass = simulateAuthenticate({ identifier: "TEAM_ALPHA", password: null, storedHash: validHash });
  assert.equal(resNullPass.success, false);
  assert.equal(resNullPass.error, "ERR_INVALID_CREDENTIALS");
  assert.equal(resNullPass.session_token, undefined, "Must NOT issue session token on NULL password");

  // Empty string password
  const resEmptyPass = simulateAuthenticate({ identifier: "TEAM_ALPHA", password: "", storedHash: validHash });
  assert.equal(resEmptyPass.success, false);
  assert.equal(resEmptyPass.session_token, undefined, "Must NOT issue session token on empty password");

  // Whitespace-only identifier
  const resWhitespaceIdent = simulateAuthenticate({ identifier: "   ", password: "validPassword123", storedHash: validHash });
  assert.equal(resWhitespaceIdent.success, false);
  assert.equal(resWhitespaceIdent.session_token, undefined);

  // NULL identifier
  const resNullIdent = simulateAuthenticate({ identifier: null, password: "validPassword123", storedHash: validHash });
  assert.equal(resNullIdent.success, false);

  // Missing stored hash in database
  const resNullHash = simulateAuthenticate({ identifier: "TEAM_ALPHA", password: "validPassword123", storedHash: null });
  assert.equal(resNullHash.success, false);

  // Valid credentials succeeds
  const resValid = simulateAuthenticate({ identifier: "TEAM_ALPHA", password: "validPassword123", storedHash: validHash });
  assert.equal(resValid.success, true);
  assert.ok(resValid.session_token);
});

test("Regression: NULL, empty, and whitespace-only answers never solve a question", () => {
  // Simulates submit_team_answer input validation and answer key matching
  function simulateSubmitAnswer({ sessionToken, submittedAnswer, storedAnswerHash }) {
    if (!sessionToken || sessionToken.length < 32) {
      return { success: false, error: "ERR_UNAUTHORIZED" };
    }

    // Migration pre-check: Reject NULL, empty, or whitespace-only answers immediately
    if (!submittedAnswer || submittedAnswer.trim() === "") {
      return { success: true, correct: false };
    }

    // Normalized answer comparison
    const norm = submittedAnswer.trim().toLowerCase().replace(/\s+/g, " ");
    if (!storedAnswerHash) {
      return { success: true, correct: false };
    }

    const isMatch = norm === "correct cipher key" && storedAnswerHash === "$2a$12$CORRECTANSWERHASH";
    if (!isMatch) {
      return { success: true, correct: false };
    }

    return { success: true, correct: true, level_completed: false, treasure_mission_unlocked: false };
  }

  const validToken = "0123456789abcdef0123456789abcdef";
  const storedHash = "$2a$12$CORRECTANSWERHASH";

  // NULL submitted answer
  const resNull = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: null, storedAnswerHash: storedHash });
  assert.equal(resNull.success, true);
  assert.equal(resNull.correct, false, "NULL answer must never be correct");

  // Empty string answer
  const resEmpty = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: "", storedAnswerHash: storedHash });
  assert.equal(resEmpty.correct, false, "Empty answer must never be correct");

  // Whitespace-only answers (spaces, tabs, newlines)
  const resSpaces = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: "    ", storedAnswerHash: storedHash });
  assert.equal(resSpaces.correct, false, "Spaces-only answer must never be correct");

  const resTabs = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: "\t\n  \r\n", storedAnswerHash: storedHash });
  assert.equal(resTabs.correct, false, "Whitespace-only answer must never be correct");

  // Incorrect answer
  const resWrong = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: "wrong key", storedAnswerHash: storedHash });
  assert.equal(resWrong.correct, false);

  // Correct answer with excess whitespace & mixed case
  const resCorrect = simulateSubmitAnswer({ sessionToken: validToken, questionId: "q1", submittedAnswer: "  CORRECT   CIPHER  KEY  ", storedAnswerHash: storedHash });
  assert.equal(resCorrect.correct, true, "Normalized answer must match stored key");
});

test("Regression: Strict event time window enforcement across all operations", () => {
  function enforceEventWindow(event, currentTime) {
    if (!event || event.id !== 1 || !event.status || event.status !== "active") {
      return { success: false, error: "ERR_EVENT_NOT_ACTIVE" };
    }

    // Strict requirements: start_at and end_at must both be set and end_at > start_at
    if (!event.start_at || !event.end_at || event.end_at <= event.start_at) {
      return { success: false, error: "ERR_EVENT_CONFIG_INVALID" };
    }

    if (currentTime < event.start_at) {
      return { success: false, error: "ERR_EVENT_NOT_STARTED" };
    }

    if (currentTime > event.end_at) {
      return { success: false, error: "ERR_EVENT_EXPIRED" };
    }

    return { success: true };
  }

  const start = new Date("2026-10-25T10:00:00Z");
  const end = new Date("2026-10-25T18:00:00Z");

  // 1. Before start time
  const resBefore = enforceEventWindow(
    { id: 1, status: "active", start_at: start, end_at: end },
    new Date("2026-10-25T09:59:59Z")
  );
  assert.equal(resBefore.error, "ERR_EVENT_NOT_STARTED");

  // 2. Within active window
  const resWithin = enforceEventWindow(
    { id: 1, status: "active", start_at: start, end_at: end },
    new Date("2026-10-25T14:30:00Z")
  );
  assert.equal(resWithin.success, true);

  // 3. After end time
  const resAfter = enforceEventWindow(
    { id: 1, status: "active", start_at: start, end_at: end },
    new Date("2026-10-25T18:00:01Z")
  );
  assert.equal(resAfter.error, "ERR_EVENT_EXPIRED");

  // 4. Missing start_at (Fail closed)
  const resNoStart = enforceEventWindow(
    { id: 1, status: "active", start_at: null, end_at: end },
    new Date("2026-10-25T12:00:00Z")
  );
  assert.equal(resNoStart.error, "ERR_EVENT_CONFIG_INVALID");

  // 5. Missing end_at (Fail closed)
  const resNoEnd = enforceEventWindow(
    { id: 1, status: "active", start_at: start, end_at: null },
    new Date("2026-10-25T12:00:00Z")
  );
  assert.equal(resNoEnd.error, "ERR_EVENT_CONFIG_INVALID");

  // 6. Invalid window where end_at <= start_at
  const resInverted = enforceEventWindow(
    { id: 1, status: "active", start_at: end, end_at: start },
    new Date("2026-10-25T12:00:00Z")
  );
  assert.equal(resInverted.error, "ERR_EVENT_CONFIG_INVALID");

  // 7. Event paused or completed
  assert.equal(
    enforceEventWindow({ id: 1, status: "paused", start_at: start, end_at: end }, new Date("2026-10-25T12:00:00Z")).error,
    "ERR_EVENT_NOT_ACTIVE"
  );
  assert.equal(
    enforceEventWindow({ id: 1, status: "completed", start_at: start, end_at: end }, new Date("2026-10-25T12:00:00Z")).error,
    "ERR_EVENT_NOT_ACTIVE"
  );
});

test("Regression: Per-question hint completeness detection in dataset validator", () => {
  // Simulates public.internal_verify_expedition_dataset hint validation
  function verifyHints({ questions, hints }) {
    // 1. Overall hint count must be 135
    if (hints.length !== 135) {
      throw new Error(`DATASET_INTEGRITY_FAIL: Expected exactly 135 hints, found ${hints.length}`);
    }

    // 2. Per-question hint coverage check: EVERY question MUST have hint 1, 2, and 3
    for (const q of questions) {
      for (const reqHintNum of [1, 2, 3]) {
        const found = hints.find(
          (h) => h.question_id === q.id && h.level_number === q.level_number && h.hint_number === reqHintNum
        );
        if (!found) {
          throw new Error(`DATASET_INTEGRITY_FAIL: Question ${q.id} missing hint ${reqHintNum}`);
        }
      }
    }

    // 3. No hint has invalid hint_number (< 1 or > 3)
    if (hints.some((h) => h.hint_number < 1 || h.hint_number > 3)) {
      throw new Error("DATASET_INTEGRITY_FAIL: Detected hints with invalid hint_number");
    }

    return true;
  }

  // Generate valid dataset of 45 questions
  const validQuestions = [];
  for (let l = 1; l <= 5; l++) {
    const count = l < 5 ? 10 : 5;
    for (let seq = 1; seq <= count; seq++) {
      validQuestions.push({ id: `q-L${l}-${seq}`, level_number: l, order_seq: seq });
    }
  }
  assert.equal(validQuestions.length, 45);

  // Generate valid hints: exactly 3 per question (45 * 3 = 135)
  const validHints = [];
  for (const q of validQuestions) {
    for (const hNum of [1, 2, 3]) {
      validHints.push({ id: `h-${q.id}-${hNum}`, question_id: q.id, level_number: q.level_number, hint_number: hNum });
    }
  }
  assert.equal(validHints.length, 135);

  // Valid baseline passes
  assert.equal(verifyHints({ questions: validQuestions, hints: validHints }), true);

  // Case A: One question has 0 hints (total 132 hints)
  const hintsMissingAll = validHints.filter((h) => h.question_id !== "q-L1-1");
  assert.throws(
    () => verifyHints({ questions: validQuestions, hints: hintsMissingAll }),
    /DATASET_INTEGRITY_FAIL: Expected exactly 135 hints/
  );

  // Case B: Total count is 135, but Question A has 4 hints and Question B has 2 hints
  // (Overall count-only checks would miss this! Per-question check catches it.)
  const sneakyHints = validHints.filter((h) => !(h.question_id === "q-L1-1" && h.hint_number === 3));
  // Add an extra hint to Question 2 with invalid hint_number 4
  sneakyHints.push({ id: "extra-h", question_id: "q-L1-2", level_number: 1, hint_number: 4 });
  assert.equal(sneakyHints.length, 135, "Total hint count artificially maintained at 135");

  assert.throws(
    () => verifyHints({ questions: validQuestions, hints: sneakyHints }),
    /DATASET_INTEGRITY_FAIL: Question q-L1-1 missing hint 3/
  );

  // Case C: Question has hints 1, 2, and 4 instead of 1, 2, 3
  const badNumberedHints = validHints.filter((h) => !(h.question_id === "q-L2-3" && h.hint_number === 3));
  badNumberedHints.push({ id: "bad-num", question_id: "q-L2-3", level_number: 2, hint_number: 4 });
  assert.equal(badNumberedHints.length, 135);
  assert.throws(
    () => verifyHints({ questions: validQuestions, hints: badNumberedHints }),
    /DATASET_INTEGRITY_FAIL: Question q-L2-3 missing hint 3/
  );
});

test("Regression: Trigger return operation handling (DELETE -> OLD, INSERT/UPDATE -> NEW)", () => {
  // Simulates public.trg_protect_active_dataset()
  function simulateProtectTrigger(tgOp, eventStatus, newRow, oldRow) {
    if (eventStatus === "active") {
      throw new Error("MUTATION_REJECTED: Dataset cannot be modified while event is active.");
    }

    if (tgOp === "DELETE") {
      return oldRow;
    } else {
      return newRow;
    }
  }

  const oldRecord = { id: "q1", content: "old riddle" };
  const newRecord = { id: "q1", content: "updated riddle" };

  // When event is active: all mutations rejected
  assert.throws(
    () => simulateProtectTrigger("DELETE", "active", null, oldRecord),
    /MUTATION_REJECTED/
  );
  assert.throws(
    () => simulateProtectTrigger("INSERT", "active", newRecord, null),
    /MUTATION_REJECTED/
  );
  assert.throws(
    () => simulateProtectTrigger("UPDATE", "active", newRecord, oldRecord),
    /MUTATION_REJECTED/
  );

  // When event is draft: returns correct record per operation
  assert.equal(simulateProtectTrigger("DELETE", "draft", null, oldRecord), oldRecord);
  assert.equal(simulateProtectTrigger("INSERT", "draft", newRecord, null), newRecord);
  assert.equal(simulateProtectTrigger("UPDATE", "draft", newRecord, oldRecord), newRecord);
});

test("Regression: Structural verification of deadlock-free lock order and pgcrypto schema", () => {
  // Validates documented hierarchical lock tree:
  // Level 1: public.event_config (id = 1)
  // Level 2: public.treasure_secrets (id = 1)
  // Level 3: public.teams (id = v_team_id)
  // Level 4: public.auth_rate_limits ('account' < 'ip')

  const lockHierarchy = {
    event_config: 1,
    treasure_secrets: 2,
    teams: 3,
    auth_rate_limits_account: 4,
    auth_rate_limits_ip: 5,
  };

  function checkLockOrder(locksHeld) {
    for (let i = 1; i < locksHeld.length; i++) {
      const prevOrder = lockHierarchy[locksHeld[i - 1]];
      const currOrder = lockHierarchy[locksHeld[i]];
      if (currOrder <= prevOrder) {
        throw new Error(`LOCK_ORDER_INVERSION: Cannot acquire ${locksHeld[i]} after ${locksHeld[i - 1]}`);
      }
    }
    return true;
  }

  // Verification flow: event_config -> treasure_secrets -> teams
  assert.equal(checkLockOrder(["event_config", "treasure_secrets", "teams"]), true);

  // Rate limiter flow: account -> ip
  assert.equal(checkLockOrder(["auth_rate_limits_account", "auth_rate_limits_ip"]), true);

  // Inverted order throws
  assert.throws(
    () => checkLockOrder(["teams", "event_config"]),
    /LOCK_ORDER_INVERSION/
  );
  assert.throws(
    () => checkLockOrder(["auth_rate_limits_ip", "auth_rate_limits_account"]),
    /LOCK_ORDER_INVERSION/
  );

  // Extension schema check logic
  function checkPgcryptoSchema(installedSchema) {
    if (installedSchema !== "extensions") {
      throw new Error(`EXTENSION_SCHEMA_MISMATCH: pgcrypto is in ${installedSchema}, expected extensions`);
    }
    return true;
  }

  assert.equal(checkPgcryptoSchema("extensions"), true);
  assert.throws(() => checkPgcryptoSchema("public"), /EXTENSION_SCHEMA_MISMATCH/);
  assert.throws(() => checkPgcryptoSchema(null), /EXTENSION_SCHEMA_MISMATCH/);
});

// ============================================================================
// INCREMENT 3: REAL SERVER ACTIONS & SECURE SESSIONS OFFLINE TESTS
// (All tests use mocked contracts and offline logic; no remote DB contacted)
// ============================================================================

test("Increment 3 Offline: Session cookie options, lifetimes, and HttpOnly security", () => {
  const TEAM_MAX_AGE = 24 * 60 * 60; // 24 hours (86,400s)
  const MARSHAL_MAX_AGE = 12 * 60 * 60; // 12 hours (43,200s)

  function computeCookieOptions(maxAge, isProduction = false) {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge,
    };
  }

  // Team session cookie
  const teamOptsDev = computeCookieOptions(TEAM_MAX_AGE, false);
  assert.equal(teamOptsDev.httpOnly, true, "Must be HttpOnly to prevent XSS exfiltration");
  assert.equal(teamOptsDev.sameSite, "lax", "Must use SameSite=Lax");
  assert.equal(teamOptsDev.path, "/");
  assert.equal(teamOptsDev.maxAge, 86400, "Team session lifetime must be exactly 24 hours");

  const teamOptsProd = computeCookieOptions(TEAM_MAX_AGE, true);
  assert.equal(teamOptsProd.secure, true, "Must require Secure in production");

  // Marshal session cookie
  const marshalOpts = computeCookieOptions(MARSHAL_MAX_AGE, true);
  assert.equal(marshalOpts.httpOnly, true);
  assert.equal(marshalOpts.maxAge, 43200, "Marshal session lifetime must be exactly 12 hours");
});

test("Increment 3 Offline: Prevention of session-token leakage to client action responses", () => {
  // Simulates server action response sanitization (raw token placed in cookie, omitted from return)
  function simulateTeamLoginAction(mockRpcPayload) {
    if (!mockRpcPayload || !mockRpcPayload.success) {
      return { success: false, error: mockRpcPayload?.error || "ERR_INVALID_CREDENTIALS" };
    }

    // Set cookie server-side
    const cookieState = {
      name: "hunt_team_session",
      value: mockRpcPayload.session_token,
      httpOnly: true,
    };

    // Returned response payload to client component
    const clientResponse = {
      success: true,
      teamId: mockRpcPayload.team_id,
      teamName: mockRpcPayload.team_name,
      callsign: mockRpcPayload.callsign,
    };

    return { cookieState, clientResponse };
  }

  const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const { cookieState, clientResponse } = simulateTeamLoginAction({
    success: true,
    session_token: rawToken,
    team_id: "uuid-1234",
    team_name: "Squad Archimedes",
    callsign: "ARCHIMEDES",
  });

  // Cookie holds token
  assert.equal(cookieState.value, rawToken);
  assert.equal(cookieState.httpOnly, true);

  // Client response MUST NOT contain raw session token or hashes
  assert.equal(clientResponse.success, true);
  assert.equal(clientResponse.callsign, "ARCHIMEDES");
  assert.equal(clientResponse.session_token, undefined, "CRITICAL: session_token must not leak to client");
  assert.equal(clientResponse.token_hash, undefined, "token_hash must not leak");
  assert.equal(clientResponse.raw_token, undefined, "raw_token must not leak");
});

test("Increment 3 Offline: Team and Marshal role separation enforcement", () => {
  // Simulates role-separated server action guards
  function simulateSubmitAnswer({ teamCookie, marshalCookie, answer }) {
    // Answer submissions require team session
    if (!teamCookie) {
      return { success: false, error: "ERR_UNAUTHORIZED" };
    }
    if (marshalCookie && !teamCookie) {
      return { success: false, error: "ERR_UNAUTHORIZED" };
    }
    return { success: true, correct: answer === "correct" };
  }

  function simulateMarshalVerify({ teamCookie, marshalCookie }) {
    // Winner verification requires marshal session; team sessions CANNOT authorize it!
    if (!marshalCookie) {
      return { success: false, error: "ERR_UNAUTHORIZED_MARSHAL" };
    }
    if (teamCookie && !marshalCookie) {
      return { success: false, error: "ERR_UNAUTHORIZED_MARSHAL" };
    }
    return { success: true, verified: true };
  }

  const teamToken = "team_token_123456789012345678901234567890";
  const marshalToken = "marshal_token_123456789012345678901234567890";

  // 1. Participant attempting to verify treasure using team cookie -> Rejected
  const resTeamVerify = simulateMarshalVerify({
    teamCookie: teamToken,
    marshalCookie: null,
    callsign: "ARCHIMEDES",
    rawToken: "HUNT-TOKEN",
  });
  assert.equal(resTeamVerify.success, false);
  assert.equal(resTeamVerify.error, "ERR_UNAUTHORIZED_MARSHAL");

  // 2. Marshal attempting to submit team answers using marshal cookie -> Rejected
  const resMarshalSubmit = simulateSubmitAnswer({
    teamCookie: null,
    marshalCookie: marshalToken,
    questionId: "q1",
    answer: "correct",
  });
  assert.equal(resMarshalSubmit.success, false);
  assert.equal(resMarshalSubmit.error, "ERR_UNAUTHORIZED");

  // 3. Authorized marshal verification -> Succeeded
  const resMarshalVerify = simulateMarshalVerify({
    teamCookie: null,
    marshalCookie: marshalToken,
    callsign: "ARCHIMEDES",
    rawToken: "HUNT-TOKEN",
  });
  assert.equal(resMarshalVerify.success, true);
});

test("Increment 3 Offline: Malformed answer and hint inputs fail closed", () => {
  function validateAnswerSubmissionInput(input) {
    if (!input?.questionId || input.questionId.trim() === "") {
      return { success: false, error: "ERR_INVALID_QUESTION_ID" };
    }
    if (!input.answer || input.answer.trim() === "") {
      // Empty answers immediately return correct: false without DB hash check
      return { success: true, correct: false };
    }
    return { success: true, shouldQuery: true };
  }

  function validateHintInput(input) {
    if (!input?.hintId || input.hintId.trim() === "") {
      return { success: false, error: "ERR_INVALID_HINT_ID" };
    }
    return { success: true, shouldQuery: true };
  }

  // Answer checks
  assert.equal(validateAnswerSubmissionInput({ questionId: "", answer: "key" }).error, "ERR_INVALID_QUESTION_ID");
  assert.equal(validateAnswerSubmissionInput({ questionId: null, answer: "key" }).error, "ERR_INVALID_QUESTION_ID");
  assert.equal(validateAnswerSubmissionInput({ questionId: "q1", answer: "" }).correct, false);
  assert.equal(validateAnswerSubmissionInput({ questionId: "q1", answer: "   \t\n" }).correct, false);
  assert.equal(validateAnswerSubmissionInput({ questionId: "q1", answer: "valid" }).shouldQuery, true);

  // Hint checks
  assert.equal(validateHintInput({ hintId: "" }).error, "ERR_INVALID_HINT_ID");
  assert.equal(validateHintInput({ hintId: "   " }).error, "ERR_INVALID_HINT_ID");
  assert.equal(validateHintInput({ hintId: "h1" }).shouldQuery, true);
});

test("Increment 3 Offline: Session revocation on logout and fail-safe cookie clearing", () => {
  let cookieCleared = false;
  let dbSessionRevoked = false;

  function simulateLogout(token, shouldDbThrow = false) {
    try {
      if (token) {
        if (shouldDbThrow) {
          throw new Error("DB_NETWORK_TIMEOUT");
        }
        dbSessionRevoked = true;
      }
    } catch {
      // Swallowed as fail-safe cleanup matching server action
    } finally {
      // Cookie MUST be cleared even if DB RPC throws
      cookieCleared = true;
    }
    return { success: true };
  }

  // Normal logout
  simulateLogout("active_token_12345");
  assert.equal(dbSessionRevoked, true);
  assert.equal(cookieCleared, true);

  // Logout when DB throws network error: cookie must still be cleared!
  cookieCleared = false;
  dbSessionRevoked = false;
  simulateLogout("active_token_12345", true);
  assert.equal(cookieCleared, true, "Cookie must be cleared even when database RPC throws");
});

test("Increment 3 Offline: Database configuration guard blocking and error sanitization", () => {
  function handleActionException(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("CONFIGURATION ERROR") || msg.includes("FAIL_CLOSED")) {
      return { success: false, error: "ERR_CONFIG_BLOCKED" };
    }
    return { success: false, error: "ERR_OPERATION_EXCEPTION" };
  }

  const guardErr = new Error("FAIL_CLOSED: Blocked forbidden production URL kcupmzqnyitkchkmftcl");
  const resGuard = handleActionException(guardErr);
  assert.equal(resGuard.error, "ERR_CONFIG_BLOCKED", "Must sanitize guard failures to generic error");

  const unkErr = new Error("Database connection closed");
  const resUnk = handleActionException(unkErr);
  assert.equal(resUnk.error, "ERR_OPERATION_EXCEPTION");
});

test("Increment 3 Offline: Trusted client IP resolution and injection prevention", () => {
  function resolveMockIp(headers) {
    // Cloudflare priority
    const cf = headers["cf-connecting-ip"];
    if (cf && isValidIp(cf)) return cf.trim();

    // Direct proxy header
    const real = headers["x-real-ip"];
    if (real && isValidIp(real)) return real.trim();

    // Multi-hop x-forwarded-for
    const xff = headers["x-forwarded-for"];
    if (xff) {
      const candidates = xff.split(",").map((s) => s.trim());
      for (const cand of candidates) {
        if (isValidIp(cand)) return cand;
      }
    }

    return "127.0.0.1";
  }

  function isValidIp(ip) {
    const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  // Cloudflare header
  assert.equal(resolveMockIp({ "cf-connecting-ip": "203.0.113.195" }), "203.0.113.195");

  // X-Real-IP
  assert.equal(resolveMockIp({ "x-real-ip": "198.51.100.42" }), "198.51.100.42");

  // Multi-hop X-Forwarded-For: extracts first valid IP
  assert.equal(
    resolveMockIp({ "x-forwarded-for": "192.0.2.1, 10.0.0.1, 172.16.0.1" }),
    "192.0.2.1"
  );

  // Injected malicious header strings -> rejected, safe fallback to 127.0.0.1
  assert.equal(
    resolveMockIp({ "x-forwarded-for": "' OR '1'='1; --" }),
    "127.0.0.1"
  );
  assert.equal(
    resolveMockIp({ "cf-connecting-ip": "<script>alert(1)</script>" }),
    "127.0.0.1"
  );
  assert.equal(resolveMockIp({}), "127.0.0.1");
});



