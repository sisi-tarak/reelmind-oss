import type { Analysis, Assets, Digest, HelperHealth, Job, Provider, TopicBoard } from './types';

const URL_KEY = 'reelmind.helperUrl';
const CODE_KEY = 'reelmind.connectCode';
export const DEFAULT_HELPER_URL = 'http://localhost:5317';

function servedByHelper() {
  // `npm start` serves the built app from the helper itself, on this computer.
  return import.meta.env.PROD && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

export function helperUrl(): string {
  const fallback = servedByHelper() ? '' : DEFAULT_HELPER_URL;
  try {
    return localStorage.getItem(URL_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function setHelperUrl(url: string) {
  try {
    if (!url || url === DEFAULT_HELPER_URL) localStorage.removeItem(URL_KEY);
    else localStorage.setItem(URL_KEY, url.replace(/\/$/, ''));
  } catch {
    /* storage blocked: the default is used */
  }
}

export function connectCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) || '';
  } catch {
    return '';
  }
}

export function setConnectCode(code: string) {
  try {
    if (code.trim()) localStorage.setItem(CODE_KEY, code.trim());
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* storage blocked: the code must be entered each visit */
  }
}

/** Addresses the app will switch to on its own: this computer, or a phone tunnel to it. Anything else is set by hand in Settings. */
export function isTrustedHelperUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:') return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    return u.protocol === 'https:' && /(\.trycloudflare\.com|\.ts\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The helper prints a link like https://site/#connect=CODE (and, for phones, &helper=https://….trycloudflare.com).
 * Saves them and cleans the address bar.
 */
export function captureConnectCodeFromUrl() {
  const match = window.location.hash.match(/connect=([A-Za-z0-9_-]{20,})/);
  if (!match) return false;
  setConnectCode(match[1]);
  const remote = window.location.hash.match(/helper=([^&]+)/);
  if (remote) {
    const url = decodeURIComponent(remote[1]);
    if (isTrustedHelperUrl(url)) setHelperUrl(url);
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

/** Chrome's local-network permission only applies to this computer, not to a phone tunnel. */
function loopbackInit(base: string): RequestInit {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base) || base === '' ? ({ targetAddressSpace: 'loopback' } as RequestInit) : {};
}

/** The browser itself refused to let this site reach the helper (Chrome's local network permission). */
export class BlockedError extends Error {
  constructor() {
    super('Your browser is blocking this site from reaching the helper. Click the icon left of the address bar, open Site settings, set Local network access to Allow, then reload.');
    this.name = 'BlockedError';
  }
}

// Chrome names this permission differently across versions.
async function localAccessDenied() {
  if (!navigator.permissions) return false;
  for (const name of ['local-network-access', 'loopback-network', 'local-network']) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      if (status.state === 'denied') return true;
    } catch {
      /* this browser doesn't know that permission name */
    }
  }
  return false;
}

const fromHostedSite = () => !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${helperUrl()}${path}`, {
      ...init,
      // Tells Chrome this request is meant for this computer, so it asks for permission instead of failing.
      ...loopbackInit(helperUrl()),
      headers: { 'Content-Type': 'application/json', 'X-ReelMind-Code': connectCode(), ...(init?.headers || {}) },
    });
  } catch {
    if (fromHostedSite() && (await localAccessDenied())) throw new BlockedError();
    throw new Error(fromHostedSite() && !/localhost|127\.0\.0\.1/.test(helperUrl()) ? 'Your computer\'s helper is not reachable right now. Check that it is on and running with phone access.' : 'The ReelMind helper is not running on this computer. Start it with "npm run helper", then try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Helper error ${res.status}`);
  return body as T;
}

// Only what a board or recap needs; transcripts stay in the browser.
function compact(a: Analysis) {
  const { shortcode, title, summary, keyPoints, topics, primaryTopic, contentType, difficulty, tools, practiceTask, infographic } = a;
  return { shortcode, title, summary, keyPoints, topics, primaryTopic, contentType, difficulty, tools: tools.map((t) => ({ name: t.name })), practiceTask: { title: practiceTask.title }, infographic };
}

type StartOptions = { provider?: Provider; force?: boolean; kind?: 'analyze' | 'link' };

export const helper = {
  health: () => call<HelperHealth>('/api/health'),
  startJob: (reels: { shortcode: string; creator: string; savedAt?: string | null; collections?: string[] }[], options: StartOptions = {}) => call<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ reels, ...options }) }),
  job: (id: string) => call<Job>(`/api/jobs/${id}`),
  currentJob: () => call<Job | null>('/api/jobs/current'),
  cancel: (id: string) => call<Job>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  analyses: (ids: string[]) => call<Record<string, Analysis & { embedding?: number[] | null }>>('/api/analyses', { method: 'POST', body: JSON.stringify({ ids }) }),
  embeddings: (ids: string[]) => call<Record<string, number[]>>('/api/embeddings', { method: 'POST', body: JSON.stringify({ ids }) }),
  // Boards and recaps send the notes the browser already has; the helper makes one text-only AI call.
  topicBoard: (topic: string, reels: Analysis[], provider?: Provider) =>
    call<{ board: TopicBoard; cached: boolean }>('/api/topic-board', { method: 'POST', body: JSON.stringify({ topic, reels: reels.map(compact), provider }) }),
  digest: (weekStart: string, reels: Analysis[], review: Analysis[], provider?: Provider) =>
    call<{ digest: Digest; cached: boolean }>('/api/digest', { method: 'POST', body: JSON.stringify({ weekStart, reels: reels.map(compact), review: review.map(compact), provider }) }),
  library: () => call<{ shortcode: string; updatedAt: string }[]>('/api/library'),
  /** Hands reel links straight to the helper, and optionally starts analyzing them. */
  send: (urls: string[], analyze: boolean) => call<{ added: string[]; analyzing: boolean; message: string }>('/api/inbox', { method: 'POST', body: JSON.stringify({ urls, analyze }) }),
  inbox: () => call<{ shortcode: string; creator: string; addedAt: string }[]>('/api/inbox'),
  ackInbox: (ids: string[]) => call<{ ok: boolean }>('/api/inbox/ack', { method: 'POST', body: JSON.stringify({ ids }) }),
  flashcards: (reels: Analysis[], provider?: Provider) => call<Record<string, { q: string; a: string }[]>>('/api/flashcards', { method: 'POST', body: JSON.stringify({ reels: reels.map(compact), provider }) }),
  /** Finds skills, prompts, code and workflows in reels analyzed before that was part of the analysis. */
  extract: (reels: Analysis[], provider?: Provider) =>
    call<Record<string, Assets>>('/api/extract', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        reels: reels.map(({ shortcode, title, summary, keyPoints, topics, tools, practiceTask, infographic, caption, transcript, onScreenText }) => ({ shortcode, title, summary, keyPoints, topics, tools, practiceTask, infographic, caption, transcript, onScreenText })),
      }),
    }),
  rewrite: (kind: string, content: string, instruction: string, provider?: Provider) =>
    call<{ content: string; model: string }>('/api/rewrite', { method: 'POST', body: JSON.stringify({ kind, content, instruction, provider }) }),
  /** The reel's cover image, or null when the helper doesn't have one. */
  thumb: async (shortcode: string): Promise<Blob | null> => {
    try {
      const res = await fetch(`${helperUrl()}/api/thumbs/${shortcode}`, { headers: { 'X-ReelMind-Code': connectCode() }, ...loopbackInit(helperUrl()) });
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  },
};
