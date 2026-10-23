import Dexie, { type EntityTable } from 'dexie';
import type { Analysis, AssetEdit, Batch, Card, Digest, Embedding, Generation, Layout, Reel, ReviewLog, Thumb, TopicBoard } from './types';
import type { ImportedReel } from './parse';

// Everything lives in this browser (IndexedDB). No account, no server.
export const db = new Dexie('reelmind') as Dexie & {
  reels: EntityTable<Reel, 'shortcode'>;
  analyses: EntityTable<Analysis, 'shortcode'>;
  batches: EntityTable<Batch, 'id'>;
  embeddings: EntityTable<Embedding, 'shortcode'>;
  topicBoards: EntityTable<TopicBoard, 'topic'>;
  digests: EntityTable<Digest, 'weekStart'>;
  thumbs: EntityTable<Thumb, 'shortcode'>;
  cards: EntityTable<Card, 'id'>;
  reviews: EntityTable<ReviewLog, 'id'>;
  syncHashes: EntityTable<{ key: string; hash: string }, 'key'>;
  layouts: EntityTable<Layout, 'id'>;
  assetEdits: EntityTable<AssetEdit, 'id'>;
  generations: EntityTable<Generation, 'id'>;
};

db.version(1).stores({
  reels: 'shortcode, status, savedAt, importedAt, batchId',
  analyses: 'shortcode, primaryTopic, analyzedAt',
  batches: 'id, startedAt',
});

db.version(2).stores({
  embeddings: 'shortcode',
  topicBoards: 'topic',
  digests: 'weekStart',
});

db.version(3).stores({
  thumbs: 'shortcode',
  cards: 'id, shortcode, due',
  reviews: '++id, at, cardId',
  drafts: 'id, createdAt',
  syncHashes: 'key',
});

db.version(4).stores({
  layouts: 'id',
  assetEdits: 'id',
});

db.version(5).stores({
  generations: 'id, kind, createdAt, [kind+key]',
});

// v6 retires a table older builds had.
db.version(6).stores({ drafts: null });

export interface ImportSummary {
  added: number;
  alreadyAnalyzed: number;
  alreadyQueued: number;
  previouslyFailed: number;
}

/** Splits an import into what's new and what the library already has. Writes nothing. */
export async function previewImport(items: ImportedReel[]): Promise<ImportSummary> {
  const existing = await db.reels.bulkGet(items.map((i) => i.shortcode));
  const summary: ImportSummary = { added: 0, alreadyAnalyzed: 0, alreadyQueued: 0, previouslyFailed: 0 };
  existing.forEach((reel) => {
    if (!reel) summary.added += 1;
    else if (reel.status === 'analyzed') summary.alreadyAnalyzed += 1;
    else if (reel.status === 'failed') summary.previouslyFailed += 1;
    else summary.alreadyQueued += 1;
  });
  return summary;
}

/** Adds new reels as "new". Existing reels keep their status and analysis; only missing details are filled in. */
export async function commitImport(items: ImportedReel[]): Promise<ImportSummary> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.reels, async () => {
    const summary = await previewImport(items);
    const existing = await db.reels.bulkGet(items.map((i) => i.shortcode));
    const writes: Reel[] = items.map((item, i) => {
      const prev = existing[i];
      if (!prev) {
        return {
          shortcode: item.shortcode,
          url: item.url,
          creator: item.creator,
          savedAt: item.savedAt,
          importedAt: now,
          status: 'new',
          collections: item.collections,
        };
      }
      return {
        ...prev,
        creator: prev.creator || item.creator,
        savedAt: prev.savedAt || item.savedAt,
        collections: Array.from(new Set([...(prev.collections || []), ...item.collections])),
      };
    });
    await db.reels.bulkPut(writes);
    return summary;
  });
}

export async function exportWorkspace() {
  const [reels, analyses, batches] = await Promise.all([db.reels.toArray(), db.analyses.toArray(), db.batches.toArray()]);
  const [layouts, assetEdits, gens] = await Promise.all([db.layouts.toArray(), db.assetEdits.toArray(), db.generations.toArray()]);
  // History entries are compressed blobs; a backup carries them as base64 text.
  const generations = await Promise.all(
    gens.map(async ({ packed, ...g }) => {
      const bytes = new Uint8Array(await packed.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { ...g, packed64: btoa(bin) };
    }),
  );
  const [embeddings, topicBoards, digests, cards, reviews] = await Promise.all([
    db.embeddings.toArray(),
    db.topicBoards.toArray(),
    db.digests.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ]);
  return { app: 'reelmind', format: 4, exportedAt: new Date().toISOString(), reels, analyses, batches, embeddings, topicBoards, digests, cards, reviews, layouts, assetEdits, generations };
}

export async function importWorkspace(data: unknown) {
  const d = data as {
    app?: string;
    reels?: Reel[];
    analyses?: Analysis[];
    batches?: Batch[];
    embeddings?: Embedding[];
    topicBoards?: TopicBoard[];
    digests?: Digest[];
    cards?: Card[];
    reviews?: ReviewLog[];
    layouts?: Layout[];
    assetEdits?: AssetEdit[];
    generations?: (Omit<Generation, 'packed'> & { packed64: string })[];
  };
  if (d?.app !== 'reelmind' || !Array.isArray(d.reels)) throw new Error('This file is not a ReelMind backup.');
  await db.transaction('rw', [db.reels, db.analyses, db.batches, db.embeddings, db.topicBoards, db.digests, db.cards, db.reviews, db.layouts, db.assetEdits, db.generations], async () => {
    // Keep whichever copy is analyzed, so a restore never loses work already paid for.
    const current = await db.reels.bulkGet(d.reels!.map((r) => r.shortcode));
    await db.reels.bulkPut(d.reels!.filter((r, i) => !(current[i]?.status === 'analyzed' && r.status !== 'analyzed')));
    if (Array.isArray(d.analyses)) await db.analyses.bulkPut(d.analyses);
    if (Array.isArray(d.batches)) await db.batches.bulkPut(d.batches);
    if (Array.isArray(d.embeddings)) await db.embeddings.bulkPut(d.embeddings);
    if (Array.isArray(d.topicBoards)) await db.topicBoards.bulkPut(d.topicBoards);
    if (Array.isArray(d.digests)) await db.digests.bulkPut(d.digests);
    if (Array.isArray(d.cards)) await db.cards.bulkPut(d.cards);
    if (Array.isArray(d.reviews)) await db.reviews.bulkPut(d.reviews.map(({ id: _id, ...r }) => r));
    if (Array.isArray(d.layouts)) await db.layouts.bulkPut(d.layouts);
    if (Array.isArray(d.assetEdits)) await db.assetEdits.bulkPut(d.assetEdits);
    if (Array.isArray(d.generations))
      await db.generations.bulkPut(
        d.generations.map(({ packed64, ...g }) => ({ ...g, packed: new Blob([Uint8Array.from(atob(packed64), (c) => c.charCodeAt(0))], { type: g.gz ? 'application/gzip' : 'application/json' }) })),
      );
  });
}

/** Removes reels that are not analyzed (pasted or imported links you no longer want). Analyzed notes are kept. */
export async function removeQueued(ids: string[]) {
  const rows = await db.reels.bulkGet(ids);
  const gone = rows.filter((r) => r && r.status !== 'analyzed').map((r) => r!.shortcode);
  await db.reels.bulkDelete(gone);
  if (gone.length) {
    const { forgetRemote } = await import('./cloud');
    await forgetRemote('items', gone);
  }
  return gone.length;
}

/** Marks reels to be analyzed as soon as a computer with the helper is online. */
export async function queueForLater(ids: string[]) {
  await db.reels.where('shortcode').anyOf(ids).modify({ queued: true });
}

export const SAMPLE_COLLECTION = 'ReelMind sample';

/** Removes demo and sample results. Your own reels go back to the queue; sample reels are removed. */
export async function removeDemoData() {
  await db.transaction('rw', [db.reels, db.analyses, db.embeddings, db.topicBoards, db.digests, db.cards], async () => {
    const demo = await db.analyses.filter((a) => a.provider === 'demo').toArray();
    const ids = demo.map((a) => a.shortcode);
    await db.analyses.bulkDelete(ids);
    await db.embeddings.bulkDelete(ids);
    await db.cards.where('shortcode').anyOf(ids).delete();
    const reels = await db.reels.bulkGet(ids);
    const samples = reels.filter((r) => r?.collections?.includes(SAMPLE_COLLECTION)).map((r) => r!.shortcode);
    await db.reels.bulkDelete(samples);
    await db.reels
      .where('shortcode')
      .anyOf(ids.filter((id) => !samples.includes(id)))
      .modify({ status: 'new', batchId: undefined });
    await db.topicBoards.filter((b) => b.provider === 'demo').delete();
    await db.digests.filter((g) => g.provider === 'demo').delete();
  });
}
