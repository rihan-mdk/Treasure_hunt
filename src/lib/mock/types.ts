export type LevelStatus = "completed" | "active" | "locked";

export interface LevelInfo {
  levelNumber: number;
  title: string;
  codename: string;
  description: string;
  totalQuestions: number;
  solvedQuestions: number;
  status: LevelStatus;
  hintsAllocated: number;
  hintsRemaining: number;
  coordinates: string;
}

export interface QuestionClue {
  id: string;
  levelNumber: number;
  questionIndex: number;
  totalInLevel: number;
  title: string;
  cipherType: string;
  cipherPayload: string;
  storyPrompt: string;
  intelCoordinates: string;
  availableHints: {
    id: number;
    title: string;
    description: string;
    isRevealed: boolean;
  }[];
}

export interface TeamProfile {
  teamId: string;
  teamName: string;
  callsign: string;
  activeLevel: number;
  totalSolved: number;
  totalTarget: number;
  hintsLeftInCurrentLevel: number;
  completedAllLevels: boolean;
  isVerifiedWinner: boolean;
  verifiedAt?: string;
  completionTime?: string;
}
