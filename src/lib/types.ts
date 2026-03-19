export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
}

export interface ReviewQueueItem {
  conceptId: string;
  conceptTitle: string;
  sectionName: string;
  curriculumName: string;
  curriculumSlug: string;
  currentMastery: number;
  previousScore: number;
  decayRate: number;
  daysSinceReview: number;
}

export interface SubMasteryData {
  name: string;
  score: number;
  decayRate: number;
}

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
