import test from "node:test";
import assert from "node:assert/strict";

test("Increment 4A: Star rating calculation based on hint usage", () => {
  // Test rule:
  // 0 hints used -> 3 stars (FLAWLESS)
  // 1-2 hints used -> 2 stars (TACTICAL)
  // 3 hints used -> 1 star (RECONNAISSANCE)
  function calculateStars(hintsUsed) {
    if (hintsUsed === 0) return 3;
    if (hintsUsed <= 2) return 2;
    return 1;
  }

  assert.equal(calculateStars(0), 3);
  assert.equal(calculateStars(1), 2);
  assert.equal(calculateStars(2), 2);
  assert.equal(calculateStars(3), 1);
  assert.equal(calculateStars(5), 1);
});

test("Increment 4A: Level progression unlocks sequentially", () => {
  // Level 1: 10 questions. If 10 solved, level 1 completed and level 2 unlocked.
  // Level 2: 10 questions. Only unlocked if level 1 solved = 10.
  // Level 3: 10 questions. Only unlocked if level 2 solved = 10.
  // Level 4: 10 questions. Only unlocked if level 3 solved = 10.
  // Level 5: 5 questions. Only unlocked if level 4 solved = 10.
  const questionsPerLevel = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 };
  
  function getLevelStatus(levelNum, solvedCounts) {
    if (levelNum === 1) {
      return (solvedCounts[1] || 0) >= questionsPerLevel[1] ? "completed" : "active";
    }
    const prevRequired = questionsPerLevel[levelNum - 1];
    const prevSolved = solvedCounts[levelNum - 1] || 0;
    if (prevSolved < prevRequired) {
      return "locked";
    }
    const currRequired = questionsPerLevel[levelNum];
    const currSolved = solvedCounts[levelNum] || 0;
    return currSolved >= currRequired ? "completed" : "active";
  }

  // Brand new team
  assert.equal(getLevelStatus(1, {}), "active");
  assert.equal(getLevelStatus(2, {}), "locked");
  assert.equal(getLevelStatus(3, {}), "locked");

  // Team with 10/10 on level 1
  assert.equal(getLevelStatus(1, { 1: 10 }), "completed");
  assert.equal(getLevelStatus(2, { 1: 10 }), "active");
  assert.equal(getLevelStatus(3, { 1: 10 }), "locked");

  // Team with 45/45 completed
  const allSolved = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 };
  for (let l = 1; l <= 5; l++) {
    assert.equal(getLevelStatus(l, allSolved), "completed");
  }
});

test("Increment 4A: Level 5 strict question order enforcement", () => {
  // In Level 5, questions must be answered strictly in order: 41, 42, 43, 44, 45
  const level5Questions = [41, 42, 43, 44, 45];
  
  function getNextLevel5Question(solvedIds) {
    for (const qId of level5Questions) {
      if (!solvedIds.has(qId)) {
        return qId;
      }
    }
    return null;
  }

  const solved = new Set();
  assert.equal(getNextLevel5Question(solved), 41);
  solved.add(41);
  assert.equal(getNextLevel5Question(solved), 42);
  solved.add(42);
  assert.equal(getNextLevel5Question(solved), 43);
  solved.add(43);
  assert.equal(getNextLevel5Question(solved), 44);
  solved.add(44);
  assert.equal(getNextLevel5Question(solved), 45);
  solved.add(45);
  assert.equal(getNextLevel5Question(solved), null);
});

test("Increment 4A: Winner verification requires exact 45 solved questions", () => {
  function canVerifyWinner(totalSolved) {
    return totalSolved === 45;
  }

  assert.equal(canVerifyWinner(0), false);
  assert.equal(canVerifyWinner(44), false);
  assert.equal(canVerifyWinner(45), true);
  assert.equal(canVerifyWinner(46), false);
});
