// Public share links with no server: the notes are compressed into the part of the link after "#",
// which browsers never send to any server. Anyone with the link can read them; nothing is uploaded.
import type { SummaryItem } from './summary';
import type { TopicBoard } from './types';

export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://reelmind-tau.vercel.app';
const MAX_REELS = 40;
const MAX_LINK = 60000;

export interface SharedReel {
  i: string; // shortcode
  t: string; // title
  s: string; // summary
  k?: string[]; // key points
  c: string; // content type
  p: string; // topic
  d: string; // difficulty
  r?: string; // creator
  o?: { n: string; u?: string }[]; // tools
  x?: string; // practice task
}

export interface SharedPayload {
  v: 1;
  title: string;
  note?: string;
  reels: SharedReel[];
  board?: Pick<TopicBoard, 'topic' | 'overview' | 'learningPath' | 'agreements' | 'contradictions' | 'project'>;
}

function toBase64Url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function toPayload(title: string, items: SummaryItem[], board?: TopicBoard, detail: 'full' | 'lean' = 'full'): SharedPayload {
  return {
    v: 1,
    title,
    reels: items.slice(0, MAX_REELS).map(({ reel, analysis: a }) => ({
      i: reel.shortcode,
      t: a.title,
      s: detail === 'full' ? a.summary : a.summary.split('. ')[0],
      ...(detail === 'full' && a.keyPoints.length ? { k: a.keyPoints.slice(0, 5) } : {}),
      c: a.contentType,
      p: a.primaryTopic,
      d: a.difficulty,
      ...(reel.creator ? { r: reel.creator } : {}),
      ...(a.tools.length ? { o: a.tools.slice(0, 5).map((t) => (t.url ? { n: t.name, u: t.url } : { n: t.name })) } : {}),
      ...(detail === 'full' && a.practiceTask.title ? { x: a.practiceTask.title } : {}),
    })),
    ...(board
      ? { board: { topic: board.topic, overview: board.overview, learningPath: board.learningPath, agreements: board.agreements, contradictions: board.contradictions, project: board.project } }
      : {}),
  };
}

export async function makeShareLink(title: string, items: SummaryItem[], board?: TopicBoard) {
  let payload = toPayload(title, items, board, 'full');
  let encoded = toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw')));
  if (encoded.length > MAX_LINK) {
    payload = toPayload(title, items, board, 'lean');
    encoded = toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw')));
  }
  return { url: `${PUBLIC_APP_URL}/s#${encoded}`, reels: payload.reels.length, trimmed: items.length > MAX_REELS };
}

export async function readShareLink(hash: string): Promise<SharedPayload> {
  const data = hash.replace(/^#/, '');
  if (!data) throw new Error('This share link is empty.');
  const json = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
  const payload = JSON.parse(json) as SharedPayload;
  if (payload?.v !== 1 || !Array.isArray(payload.reels)) throw new Error('This share link is not a ReelMind link.');
  return payload;
}

export function isShareRoute() {
  return window.location.pathname === '/s' || window.location.pathname === '/s/';
}

export const instagramUrl = (shortcode: string) => `https://www.instagram.com/reel/${shortcode}/`;
