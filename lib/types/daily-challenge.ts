import { GradeGroup } from '@/lib/utils/grade-group';

export type QuestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type QuestionCategory =
  | 'IQ_LOGIC'
  | 'SCIENCE'
  | 'GENERAL_KNOWLEDGE'
  | 'TECH_AI'
  | 'MATHEMATICS';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  IQ_LOGIC: 'IQ & Logic',
  SCIENCE: 'Science',
  GENERAL_KNOWLEDGE: 'General Knowledge',
  TECH_AI: 'Technology and AI',
  MATHEMATICS: 'MATHEMATICS',
};

/** Fixed order every daily quiz follows: one question per category. */
export const CATEGORY_ORDER: QuestionCategory[] = [
  'IQ_LOGIC',
  'SCIENCE',
  'GENERAL_KNOWLEDGE',
  'TECH_AI',
  'MATHEMATICS',
];

/** How many days a question "rests" after being used before it's eligible again. */
export const REUSE_COOLDOWN_DAYS = 7;

export interface Question {
  id: string;
  source: string;
  externalId: string | null;
  category: QuestionCategory;
  gradeGroup: GradeGroup;
  difficulty: QuestionDifficulty;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string | null;
  status: QuestionStatus;
  timesUsed: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape of one row when importing a batch of AI/manually-drafted questions. */
export interface QuestionImportRow {
  category: QuestionCategory;
  gradeGroup: GradeGroup;
  difficulty?: QuestionDifficulty;
  questionText: string;
  correctAnswer: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  explanation?: string;
}

export interface DailyQuiz {
  id: string;
  date: string;
  gradeGroup: GradeGroup;
  isPublished: boolean;
}

/** A quiz question as shown to a student — correctAnswer/explanation withheld until after submit. */
export interface StudentQuizQuestion {
  id: string;
  category: QuestionCategory;
  questionText: string;
  options: string[];
}

export interface QuizAttemptAnswer {
  questionId: string;
  selectedAnswer: string;
  correct: boolean;
}

export interface QuizAttemptResult {
  id: string;
  score: number;
  totalQuestions: number;
  answers: QuizAttemptAnswer[];
  completedAt: string;
}
