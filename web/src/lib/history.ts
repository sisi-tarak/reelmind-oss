// Every AI result (topic boards, recaps, rewrites, flashcards, skill finds) is kept as a
// compressed entry in this browser, so you can look back at earlier versions and restore them.
// Storage stays small: entries are gzip-compressed, repeats are skipped, and old versions are pruned.
import { db } from './db';
import type { Generation, GenerationKind } from './types';

const PER_ITEM = 20;
const TOTAL = 600;

async function gzip(text: string): Promise<{ blob: Blob; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { blob: new Blob([text], { type: 'application/json' }), gz: false };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { blob: await new Response(stream).blob(), gz: true };
}

async function gunzip(blob: Blob, gz: boolean): Promise<string> {
  if (!gz) return blob.text();
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

function digest(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + text.length.toString(36);
}

export interface RecordInput {
  kind: GenerationKind;
  /** What it belongs to: a topic, a week, an asset id. Versions are grouped by kind + key. */
  key: string;
  title: string;
  /** What you asked for, shown as your message in the timeline. */
  request: string;
  preview: string;
  model?: string;
  data: unknown;
}

/** Saves one result. Returns false when it is identical to the latest saved version. */
export async function recordGeneration(input: RecordInput): Promise<boolean> {
  try {
    const text = JSON.stringify(input.data);
    const hash = digest(text);
    const latest = await db.generations.where('[kind+key]').equals([input.kind, input.key]).reverse().sortBy('createdAt');
    if (latest[0]?.hash === hash) return false;
    const { blob, gz } = await gzip(text);
    await db.generations.put({
      id: crypto.randomUUID(),
      kind: input.kind,
      key: input.key,
      title: input.title.slice(0, 200),
      request: input.request.slice(0, 500),
      preview: input.preview.replace(/\s+/g, ' ').trim().slice(0, 220),
      model: input.model || '',
      createdAt: new Date().toISOString(),
      hash,
      gz,
      bytes: blob.size,
      packed: blob,
    });
    // Keep the newest versions of each item, and a sensible total.
    if (latest.length + 1 > PER_ITEM) await db.generations.bulkDelete(latest.slice(PER_ITEM - 1).map((g) => g.id));
    const count = await db.generations.count();
    if (count > TOTAL) await db.generations.orderBy('createdAt').limit(count - TOTAL).delete();
    return true;
  } catch {
    // History is a convenience; never let it break the feature that produced the result.
    return false;
  }
}

export async function readGeneration<T = unknown>(g: Generation): Promise<T> {
  return JSON.parse(await gunzip(g.packed, g.gz)) as T;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Any panel can open the History view, filtered to what it shows.
export const HISTORY_EVENT = 'reelmind:history';
export function openHistory(filter?: { kind?: GenerationKind; key?: string }) {
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: filter || {} }));
}
