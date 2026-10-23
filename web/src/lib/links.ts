// Finds which reels are related, so they can be wired together on the board.
// With fingerprints (embeddings) it links by meaning: "RAG" and "vector databases" connect
// even if they share no words. Without them it falls back to shared topic tags and tools.
import type { Analysis, Link } from './types';
import { topicLabel } from './topics';

export type LinkLevel = 'strict' | 'normal' | 'loose';

const THRESHOLD: Record<LinkLevel, number> = { strict: 0.82, normal: 0.74, loose: 0.66 };
const TAG_THRESHOLD: Record<LinkLevel, number> = { strict: 0.6, normal: 0.35, loose: 0.3 };
const PER_REEL = 3;

export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function reasonFor(a: Analysis, b: Analysis) {
  const toolsB = new Set(b.tools.map((t) => t.name.toLowerCase()));
  const tool = a.tools.find((t) => toolsB.has(t.name.toLowerCase()));
  if (tool) return `Same tool: ${tool.name}`;
  const tagsB = new Set(b.topics);
  const tag = a.topics.find((t) => tagsB.has(t));
  if (tag) return topicLabel(tag);
  return 'Similar idea';
}

function tagScore(a: Analysis, b: Analysis) {
  const tagsB = new Set(b.topics);
  const toolsB = new Set(b.tools.map((t) => t.name.toLowerCase()));
  const tags = a.topics.filter((t) => tagsB.has(t)).length;
  const tools = a.tools.filter((t) => toolsB.has(t.name.toLowerCase())).length;
  return Math.min(1, tags * 0.35 + tools * 0.35);
}

export function computeLinks(analyses: Analysis[], embeddings: Map<string, number[]>, level: LinkLevel = 'normal'): Link[] {
  const candidates: Link[] = [];
  for (let i = 0; i < analyses.length; i++) {
    for (let j = i + 1; j < analyses.length; j++) {
      const A = analyses[i];
      const B = analyses[j];
      const ea = embeddings.get(A.shortcode);
      const eb = embeddings.get(B.shortcode);
      // Close in meaning, or sharing a tool or topic tag outright: either is a real connection.
      const meaning = ea && eb && ea.length === eb.length ? cosine(ea, eb) : 0;
      const tags = tagScore(A, B);
      if (meaning >= THRESHOLD[level] || tags >= TAG_THRESHOLD[level]) {
        candidates.push({ a: A.shortcode, b: B.shortcode, score: Math.max(meaning, tags), reason: reasonFor(A, B) });
      }
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const degree = new Map<string, number>();
  const kept: Link[] = [];
  for (const c of candidates) {
    if ((degree.get(c.a) || 0) >= PER_REEL || (degree.get(c.b) || 0) >= PER_REEL) continue;
    degree.set(c.a, (degree.get(c.a) || 0) + 1);
    degree.set(c.b, (degree.get(c.b) || 0) + 1);
    kept.push(c);
  }
  return kept;
}

export function linksOf(id: string, links: Link[]) {
  return links.filter((l) => l.a === id || l.b === id).map((l) => ({ other: l.a === id ? l.b : l.a, reason: l.reason, score: l.score }));
}
