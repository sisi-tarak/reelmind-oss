// Keeps this browser in step with the helper:
//   - reels the helper already analyzed (on this site, the local app, or another browser) appear on the board
//     automatically, with no import and no AI cost;
//   - reels sent from the browser extension land in the library.
import { canonicalUrl } from './parse';
import { commitImport, db } from './db';
import { helper } from './helper';
import type { Reel } from './types';

const CHUNK = 200;

/** Pulls notes the helper has but this browser doesn't. Returns how many reels were added or updated. */
export async function syncLibrary(): Promise<number> {
  const list = await helper.library();
  if (!list.length) return 0;
  const ids = list.map((r) => r.shortcode);
  const [localReels, localAnalyses] = await Promise.all([db.reels.bulkGet(ids), db.analyses.bulkGet(ids)]);
  const wanted = list
    .filter((r, i) => {
      const reel = localReels[i];
      const analysis = localAnalyses[i];
      if (!reel || reel.status !== 'analyzed' || !analysis) return true;
      // Re-analyzed somewhere else since this browser last saw it.
      return analysis.provider !== 'demo' && r.updatedAt > analysis.analyzedAt && Date.parse(r.updatedAt) - Date.parse(analysis.analyzedAt) > 5000;
    })
    .map((r) => r.shortcode);
  if (!wanted.length) return 0;

  let changed = 0;
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const results = await helper.analyses(wanted.slice(i, i + CHUNK));
    const now = new Date().toISOString();
    await db.transaction('rw', db.reels, db.analyses, db.embeddings, async () => {
      for (const [shortcode, result] of Object.entries(results)) {
        const { embedding, ...analysis } = result;
        await db.analyses.put(analysis);
        if (embedding) await db.embeddings.put({ shortcode, values: embedding });
        const existing = await db.reels.get(shortcode);
        const reel: Reel = existing
          ? {
              ...existing,
              status: 'analyzed',
              failReason: undefined,
              // Older versions saved a numeric account id; prefer the @handle when the notes have one.
              creator: (/^\d+$/.test(existing.creator || '') && analysis.creator && !/^\d+$/.test(analysis.creator) ? analysis.creator : existing.creator) || analysis.creator || '',
              savedAt: existing.savedAt || analysis.savedAt || null,
              collections: Array.from(new Set([...(existing.collections || []), ...(analysis.collections || [])])),
            }
          : {
              shortcode,
              url: canonicalUrl(shortcode),
              creator: analysis.creator || '',
              savedAt: analysis.savedAt || analysis.analyzedAt,
              importedAt: now,
              status: 'analyzed',
              collections: analysis.collections || [],
            };
        await db.reels.put(reel);
        changed += 1;
      }
    });
  }
  return changed;
}

/** Moves reels sent from the browser extension into the library. Returns how many were new. */
export async function pullInbox(): Promise<number> {
  const items = await helper.inbox();
  if (!items.length) return 0;
  const summary = await commitImport(
    items.map((i) => ({ shortcode: i.shortcode, url: canonicalUrl(i.shortcode), creator: i.creator || '', savedAt: i.addedAt, collections: [] })),
  );
  await helper.ackInbox(items.map((i) => i.shortcode));
  return summary.added;
}
