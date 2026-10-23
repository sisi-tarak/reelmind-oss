// "Try with sample reels": fills the board with 16 demo reels so anyone can explore
// ReelMind on the hosted site before installing anything. Nothing is downloaded or analyzed.
import { db, SAMPLE_COLLECTION } from './db';
import sample from './sample-data.json';
import type { Analysis, Reel } from './types';

export async function loadSample() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const reels: Reel[] = sample.reels.map((r) => ({
    shortcode: r.shortcode,
    url: r.url,
    creator: r.creator,
    savedAt: new Date(now - r.savedOffsetMs).toISOString(),
    importedAt: iso,
    status: 'analyzed',
    collections: [SAMPLE_COLLECTION],
  }));
  const analyses = sample.analyses.map((a) => ({ ...a, analyzedAt: iso }) as unknown as Analysis);
  await db.transaction('rw', db.reels, db.analyses, db.embeddings, async () => {
    const existing = new Set((await db.reels.bulkGet(reels.map((r) => r.shortcode))).filter(Boolean).map((r) => r!.shortcode));
    await db.reels.bulkPut(reels.filter((r) => !existing.has(r.shortcode)));
    await db.analyses.bulkPut(analyses.filter((a) => !existing.has(a.shortcode)));
    await db.embeddings.bulkPut(sample.embeddings.filter((e) => !existing.has(e.shortcode)));
  });
}
