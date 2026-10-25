import { LevelInfo, QuestionClue, TeamProfile } from "./types";

/**
 * MOCK PREVIEW DATA ONLY
 * Clearly segregated for frontend state previewing during Phase 1.
 * Real gameplay logic, answer checking, and winner verification will be server-backed.
 */

export const MOCK_LEVELS: LevelInfo[] = [
  {
    levelNumber: 1,
    title: "The Warm-Up",
    codename: "PERIMETER ECHO",
    description: "Orientation ciphers distributed across the central quadrangle and campus observatory.",
    totalQuestions: 10,
    solvedQuestions: 10,
    status: "completed",
    hintsAllocated: 3,
    hintsRemaining: 1,
    coordinates: "42°21'36\" N · 71°05'24\" W",
  },
  {
    levelNumber: 2,
    title: "Mind Games",
    codename: "SYNAPSE MATRIX",
    description: "Multi-layered logic grids, acoustic anagrams, and architectural riddles.",
    totalQuestions: 10,
    solvedQuestions: 10,
    status: "completed",
    hintsAllocated: 3,
    hintsRemaining: 2,
    coordinates: "42°21'44\" N · 71°05'12\" W",
  },
  {
    levelNumber: 3,
    title: "Code Breakers",
    codename: "CIPHER VORTEX",
    description: "Cryptographic signals, polyalphabetic substitutions, and radio frequency transpositions.",
    totalQuestions: 10,
    solvedQuestions: 4,
    status: "active",
    hintsAllocated: 3,
    hintsRemaining: 3,
    coordinates: "42°21'58\" N · 71°05'30\" W",
  },
  {
    levelNumber: 4,
    title: "Master Puzzles",
    codename: "LABYRINTH PROTOCOL",
    description: "Advanced geospatial coordinates and historic archive blueprints.",
    totalQuestions: 10,
    solvedQuestions: 0,
    status: "locked",
    hintsAllocated: 3,
    hintsRemaining: 3,
    coordinates: "42°22'10\" N · 71°05'45\" W",
  },
  {
    levelNumber: 5,
    title: "The Final Hunt",
    codename: "APEX OMEGA",
    description: "Five sequentially connected clues leading directly to physical treasure eligibility.",
    totalQuestions: 5,
    solvedQuestions: 0,
    status: "locked",
    hintsAllocated: 3,
    hintsRemaining: 3,
    coordinates: "42°22'25\" N · 71°05'58\" W",
  },
];

export const MOCK_ACTIVE_QUESTION: QuestionClue = {
  id: "q-3-05",
  levelNumber: 3,
  questionIndex: 5,
  totalInLevel: 10,
  title: "ROT-3 Transmission Intercept",
  cipherType: "CAESAR CIPHER / ROT-3",
  cipherPayload: "WKH FOXH LV KLGGHQ XQGHU WKH ROG FORFN WRZHU DUFKZDGB",
  storyPrompt:
    "An encrypted radio signal was intercepted from the campus bell tower frequency at midnight. Shift the characters backward through the ancient Roman standard to decode where the next waypoint marker is etched.",
  intelCoordinates: "42° 21' 36\" N · 71° 05' 24\" W",
  availableHints: [
    {
      id: 1,
      title: "Directional Compass",
      description: "Look at the standard Latin alphabet shifted 3 positions back: 'D' becomes 'A', 'E' becomes 'B', 'W' becomes 'T'.",
      isRevealed: false,
    },
    {
      id: 2,
      title: "Architectural Focus",
      description: "The first word decrypts to 'THE'. The target location lies within the south brick passageway of the Founder's Clock Tower.",
      isRevealed: false,
    },
    {
      id: 3,
      title: "Exact Cipher Key",
      description: "Direct decryption begins: 'THE CLUE IS HIDDEN UNDER...'. Inspect the stone carving under the keystone arch.",
      isRevealed: false,
    },
  ],
};

export const MOCK_ACTIVE_TEAM: TeamProfile = {
  teamId: "EXP-7702",
  teamName: "Squad Archimedes",
  callsign: "SQUAD // ARCHIMEDES",
  activeLevel: 3,
  totalSolved: 24,
  totalTarget: 45,
  hintsLeftInCurrentLevel: 3,
  completedAllLevels: false,
  isVerifiedWinner: false,
};

export const MOCK_QUALIFIED_TEAM: TeamProfile = {
  teamId: "EXP-7702",
  teamName: "Squad Archimedes",
  callsign: "SQUAD // ARCHIMEDES",
  activeLevel: 5,
  totalSolved: 45,
  totalTarget: 45,
  hintsLeftInCurrentLevel: 1,
  completedAllLevels: true,
  isVerifiedWinner: false,
};

export const MOCK_WINNER_RECORD: TeamProfile = {
  teamId: "EXP-7702",
  teamName: "Squad Archimedes",
  callsign: "SQUAD // ARCHIMEDES",
  activeLevel: 5,
  totalSolved: 45,
  totalTarget: 45,
  hintsLeftInCurrentLevel: 1,
  completedAllLevels: true,
  isVerifiedWinner: true,
  verifiedAt: "11:42:09 PM EDT",
  completionTime: "3h 14m 28s",
};
