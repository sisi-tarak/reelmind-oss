export type ReelStatus = 'new' | 'analyzed' | 'failed';

export interface Reel {
  shortcode: string;
  url: string;
  creator: string;
  savedAt: string | null;
  importedAt: string;
  status: ReelStatus;
  failReason?: string;
  collections?: string[];
  batchId?: string;
  practiceDone?: boolean;
  /** Asked to be analyzed when a computer with the helper is online (for example, added on a phone). */
  queued?: boolean;
  /** Last time a quiz question about this reel was answered; drives review picks. */
  lastReviewedAt?: string;
}

export type Provider = 'gemini' | 'claude';

export interface Embedding {
  shortcode: string;
  values: number[];
}

export interface Link {
  a: string;
  b: string;
  score: number;
  reason: string;
}

export interface TopicBoard {
  topic: string;
  reelIds: string[];
  overview: string;
  learningPath: { title: string; detail: string; reelIds: string[] }[];
  comparison: { columns: string[]; rows: { aspect: string; values: string[] }[] };
  agreements: string[];
  contradictions: string[];
  project: { title: string; goal: string; steps: string[]; reelIds: string[] };
  model: string;
  provider: string;
  createdAt: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  reelId: string;
}

export interface Digest {
  weekStart: string;
  reelIds: string[];
  reviewIds: string[];
  headline: string;
  highlights: { topic: string; summary: string; reelIds: string[] }[];
  quiz: QuizQuestion[];
  model: string;
  provider: string;
  createdAt: string;
  /** Picked option per question; -1 = unanswered. */
  answers?: number[];
}

export type InfographicLayout = 'steps' | 'comparison' | 'concept' | 'checklist';

export interface Infographic {
  layout: InfographicLayout;
  headline: string;
  center: string;
  items: { label: string; detail: string }[];
  columns: string[];
  rows: { aspect: string; values: string[] }[];
}

export interface Assets {
  skills: { name: string; description: string; instructions: string }[];
  prompts: { title: string; prompt: string; useFor: string }[];
  snippets: { title: string; language: string; code: string }[];
  workflows: { title: string; goal: string; steps: string[]; tools: string[] }[];
}

export interface Analysis {
  shortcode: string;
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  primaryTopic: string;
  contentType: string;
  difficulty: string;
  practiceTask: { title: string; steps: string[]; code: string; language: string };
  tools: { name: string; kind: string; url: string; note: string }[];
  infographic: Infographic;
  transcript: string;
  onScreenText: string;
  language: string;
  creator: string;
  caption: string;
  durationSec: number | null;
  captionOnly: boolean;
  hasThumb: boolean;
  model: string;
  provider: string;
  analyzedAt: string;
  promptVersion: number;
  /** Review cards written by the AI (analyses from version 2 on). */
  flashcards?: { q: string; a: string }[];
  /** Skills, prompts, code and workflows to reuse (analyses from version 3 on, or found later). */
  assets?: Assets;
  /** Save date as the helper remembers it, for browsers that never saw the import. */
  savedAt?: string | null;
  collections?: string[];
}

export interface Card {
  id: string;
  shortcode: string;
  front: string;
  back: string;
  source: 'ai' | 'auto';
  /** When it's next due, ISO time. */
  due: string;
  /** Days until the next review after the last answer. */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewed?: string;
}

export interface ReviewLog {
  id?: number;
  cardId: string;
  at: string;
  grade: number;
  /** First time this card was answered; counts toward the daily new-card limit. */
  isNew?: boolean;
}

export interface Layout {
  id: string;
  /** How far each node was moved from where the automatic layout puts it. */
  deltas: Record<string, { dx: number; dy: number }>;
  updatedAt: string;
}

/** Your own version of a skill, prompt or snippet, kept beside the original. */
export interface AssetEdit {
  id: string;
  content: string;
  updatedAt: string;
}

export type GenerationKind = 'board' | 'recap' | 'rewrite' | 'cards' | 'assets';

/** One saved AI result, compressed. */
export interface Generation {
  id: string;
  kind: GenerationKind;
  key: string;
  title: string;
  request: string;
  preview: string;
  model: string;
  createdAt: string;
  hash: string;
  gz: boolean;
  bytes: number;
  packed: Blob;
}

export interface Thumb {
  shortcode: string;
  blob: Blob;
}

export interface Batch {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  total: number;
  analyzed: number;
  reused: number;
  failed: number;
  pending: number;
  demo: boolean;
}

export type JobStep = 'queued' | 'fetching' | 'analyzing' | 'done' | 'cached' | 'failed' | 'pending';

export interface Job {
  id: string;
  kind: 'analyze' | 'link';
  provider: Provider;
  force: boolean;
  status: 'running' | 'done' | 'cancelled' | 'rate_limited' | 'error';
  message: string | null;
  demo: boolean;
  startedAt: string;
  finishedAt: string | null;
  items: { shortcode: string; url: string; creator: string; step: JobStep; error: string | null }[];
  counts: { total: number; done: number; cached: number; failed: number; pending: number; active: number };
}

export interface HelperHealth {
  ok: boolean;
  version: string;
  /** True when this site isn't allowed yet: the user must enter the connect code. */
  needsCode: boolean;
  demo: boolean;
  tools: { ytdlp: { found: boolean; version: string | null }; ffmpeg: { found: boolean } };
  gemini: { configured: boolean; model: string; rpm: number; keys?: number; keysAvailable?: number };
  claude: { configured: boolean; model: string };
  defaultProvider: Provider;
  embeddings: boolean;
  /** Phone access: a secure tunnel to this helper, and the link that connects a phone to it. */
  remote?: { url: string | null; status: 'off' | 'starting' | 'on' | 'fixed' | 'error'; error: string | null; link: string | null };
  cookies: boolean;
  busy: boolean;
  currentJobId: string | null;
}
