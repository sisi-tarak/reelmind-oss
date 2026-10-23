// Optional sync across devices with your own Google account (Firebase Auth + Firestore free tier).
// Hidden unless the site was built with VITE_FIREBASE_* settings. The Firebase SDK is only downloaded
// once you turn sync on. Each person's data lives under users/{uid}, readable only by them (see firestore.rules).
import { useSyncExternalStore } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { db, SAMPLE_COLLECTION } from './db';
import type { Analysis, AssetEdit, Card, Digest, Layout, Reel, TopicBoard } from './types';

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
export const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

const ON_KEY = 'reelmind.cloud';
const BATCH = 400;

// ── Payloads and merging (pure, tested) ────────────────────────────────────

export type Kind = 'items' | 'cards' | 'boards' | 'digests' | 'layouts' | 'edits';
export interface ItemPayload {
  reel: Reel;
  analysis: Analysis | null;
  embedding: number[] | null;
}
export interface CardsPayload {
  cards: Card[];
}

/** Small, fast string hash (cyrb53). Used only to notice changes, not for security. */
export function hash(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** JSON with sorted keys, so the same data always gives the same text (and hash) on every device. */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, v[k]])) : v,
  );
}

/** Samples and demo results stay on this device. */
export function syncable(reel: Reel | undefined, analysis?: Analysis | null) {
  if (!reel) return false;
  if (reel.collections?.includes(SAMPLE_COLLECTION)) return false;
  return !analysis || analysis.provider !== 'demo';
}

const later = (a?: string | null, b?: string | null) => ((a || '') >= (b || '') ? a : b) || undefined;

/** Combines two copies of a reel. Work already paid for (an analysis) is never lost; the newest analysis wins. */
export function mergeItem(local: ItemPayload | null, remote: ItemPayload): ItemPayload {
  if (!local) return remote;
  const la = local.analysis;
  const ra = remote.analysis;
  const analysis = la && ra ? ((ra.analyzedAt || '') > (la.analyzedAt || '') ? ra : la) : la || ra;
  const fromRemote = analysis !== null && analysis === ra && analysis !== la;
  const r = local.reel;
  const o = remote.reel;
  const reel: Reel = {
    ...o,
    ...r,
    creator: r.creator || o.creator,
    savedAt: r.savedAt || o.savedAt,
    importedAt: (r.importedAt || '') < (o.importedAt || '') && r.importedAt ? r.importedAt : o.importedAt || r.importedAt,
    status: analysis ? 'analyzed' : r.status === 'failed' && o.status === 'failed' ? 'failed' : r.status === 'new' || o.status === 'new' ? 'new' : r.status,
    collections: Array.from(new Set([...(r.collections || []), ...(o.collections || [])])),
    practiceDone: Boolean(r.practiceDone || o.practiceDone) || undefined,
    lastReviewedAt: later(r.lastReviewedAt, o.lastReviewedAt),
  };
  if (analysis) delete reel.failReason;
  const embedding = fromRemote ? remote.embedding || local.embedding : local.embedding || remote.embedding;
  return { reel, analysis, embedding };
}

/** Per card, the copy answered most recently wins. */
export function mergeCards(local: Card[], remote: Card[]): Card[] {
  const out = new Map(local.map((c) => [c.id, c]));
  for (const c of remote) {
    const mine = out.get(c.id);
    if (!mine || (c.lastReviewed || '') > (mine.lastReviewed || '')) out.set(c.id, c);
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeNewest<T extends { createdAt: string }>(local: T | undefined, remote: T): T {
  if (!local) return remote;
  if (remote.createdAt > local.createdAt) return remote;
  if (remote.createdAt === local.createdAt && 'answers' in remote && !('answers' in local && (local as { answers?: unknown[] }).answers?.length)) return remote;
  return local;
}

const slug = (s: string) => encodeURIComponent(s).replace(/\./g, '%2E').slice(0, 700) || '_';

// ── Reading and writing the local copy ─────────────────────────────────────

async function localItem(shortcode: string): Promise<ItemPayload | null> {
  const [reel, analysis, embedding] = await Promise.all([db.reels.get(shortcode), db.analyses.get(shortcode), db.embeddings.get(shortcode)]);
  if (!reel) return null;
  return { reel, analysis: analysis || null, embedding: embedding?.values || null };
}

async function localPayload(kind: Kind, id: string): Promise<unknown | null> {
  if (kind === 'items') {
    const item = await localItem(id);
    return item && syncable(item.reel, item.analysis) ? item : null;
  }
  if (kind === 'cards') {
    const reel = await db.reels.get(id);
    if (!syncable(reel)) return null;
    const cards = await db.cards.where('shortcode').equals(id).sortBy('id');
    return cards.length ? ({ cards } satisfies CardsPayload) : null;
  }
  if (kind === 'boards') {
    const board = (await db.topicBoards.toArray()).find((b) => slug(b.topic) === id);
    return board && board.provider !== 'demo' ? board : null;
  }
  if (kind === 'layouts') return (await db.layouts.get(id)) || null;
  if (kind === 'edits') return (await db.assetEdits.get(id)) || null;
  const digest = await db.digests.get(id);
  return digest && digest.provider !== 'demo' ? digest : null;
}

const newer = <T extends { updatedAt: string }>(local: T | undefined, remote: T) => (!local || remote.updatedAt > local.updatedAt ? remote : local);

async function applyRemote(kind: Kind, payload: unknown) {
  if (kind === 'items') {
    const remote = payload as ItemPayload;
    const id = remote.reel.shortcode;
    const merged = mergeItem(await localItem(id), remote);
    await db.transaction('rw', db.reels, db.analyses, db.embeddings, async () => {
      await db.reels.put(merged.reel);
      if (merged.analysis) await db.analyses.put(merged.analysis);
      if (merged.embedding) await db.embeddings.put({ shortcode: id, values: merged.embedding });
    });
    return merged;
  }
  if (kind === 'cards') {
    const remote = (payload as CardsPayload).cards;
    if (!remote.length) return payload;
    const local = await db.cards.where('shortcode').equals(remote[0].shortcode).toArray();
    const merged = mergeCards(local, remote);
    await db.cards.bulkPut(merged);
    return { cards: merged };
  }
  if (kind === 'boards') {
    const remote = payload as TopicBoard;
    const merged = mergeNewest(await db.topicBoards.get(remote.topic), remote);
    await db.topicBoards.put(merged);
    return merged;
  }
  if (kind === 'layouts') {
    const remote = payload as Layout;
    const merged = newer(await db.layouts.get(remote.id), remote);
    await db.layouts.put(merged);
    return merged;
  }
  if (kind === 'edits') {
    const remote = payload as AssetEdit;
    const merged = newer(await db.assetEdits.get(remote.id), remote);
    await db.assetEdits.put(merged);
    return merged;
  }
  const remote = payload as Digest;
  const merged = mergeNewest(await db.digests.get(remote.weekStart), remote);
  await db.digests.put(merged);
  return merged;
}

// ── State shared with React ────────────────────────────────────────────────

export interface CloudState {
  configured: boolean;
  user: { uid: string; name: string; email: string; photo: string | null } | null;
  status: 'off' | 'loading' | 'signed-out' | 'syncing' | 'synced' | 'error';
  lastSync: string | null;
  error: string | null;
}

let state: CloudState = { configured: cloudConfigured, user: null, status: 'off', lastSync: null, error: null };
const listeners = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useCloud() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ── Firebase ───────────────────────────────────────────────────────────────

type Fb = {
  auth: import('firebase/auth').Auth;
  authMod: typeof import('firebase/auth');
  fs: import('firebase/firestore').Firestore;
  fsMod: typeof import('firebase/firestore');
};
let fb: Promise<Fb> | null = null;

function loadFirebase(): Promise<Fb> {
  if (!fb) {
    fb = (async () => {
      const [{ initializeApp }, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = initializeApp(firebaseConfig as Record<string, string>);
      const auth = authMod.getAuth(app);
      let fs: import('firebase/firestore').Firestore;
      try {
        // A local cache means reopening the app only downloads what changed.
        fs = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
      } catch {
        fs = fsMod.getFirestore(app);
      }
      return { auth, authMod, fs, fsMod };
    })();
  }
  return fb;
}

const dirty: Record<Kind, Set<string>> = { items: new Set(), cards: new Set(), boards: new Set(), digests: new Set(), layouts: new Set(), edits: new Set() };
let hooked = false;
let unsubs: Unsubscribe[] = [];
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let uid: string | null = null;

function mark(kind: Kind, id: string) {
  dirty[kind].add(id);
  if (uid && !pushTimer) pushTimer = setTimeout(push, 4000);
}

/** Notices local changes cheaply, so only what changed is checked and sent. */
function hookTables() {
  if (hooked) return;
  hooked = true;
  // Dexie uses a hook's return value, so these must return nothing.
  const onItem = (key: unknown) => {
    if (typeof key === 'string') mark('items', key);
  };
  db.reels.hook('creating', (key, obj) => {
    onItem(key ?? obj.shortcode);
  });
  db.reels.hook('updating', (_mods, key) => {
    onItem(key);
  });
  db.analyses.hook('creating', (key, obj) => {
    onItem(key ?? obj.shortcode);
  });
  db.analyses.hook('updating', (_mods, key) => {
    onItem(key);
  });
  db.embeddings.hook('creating', (key, obj) => {
    onItem(key ?? obj.shortcode);
  });
  db.embeddings.hook('updating', (_mods, key) => {
    onItem(key);
  });
  db.cards.hook('creating', (_key, obj) => {
    mark('cards', obj.shortcode);
  });
  db.cards.hook('updating', (_mods, _key, obj) => {
    mark('cards', obj.shortcode);
  });
  db.topicBoards.hook('creating', (_key, obj) => {
    mark('boards', slug(obj.topic));
  });
  db.topicBoards.hook('updating', (_mods, _key, obj) => {
    mark('boards', slug(obj.topic));
  });
  db.digests.hook('creating', (_key, obj) => {
    mark('digests', obj.weekStart);
  });
  db.digests.hook('updating', (_mods, _key, obj) => {
    mark('digests', obj.weekStart);
  });
  db.layouts.hook('creating', (_key, obj) => {
    mark('layouts', obj.id);
  });
  db.layouts.hook('updating', (_mods, key) => {
    mark('layouts', key as string);
  });
  db.assetEdits.hook('creating', (_key, obj) => {
    mark('edits', obj.id);
  });
  db.assetEdits.hook('updating', (_mods, key) => {
    mark('edits', key as string);
  });
}

async function knownHash(kind: Kind, id: string) {
  return (await db.syncHashes.get(`${kind}/${id}`))?.hash;
}

async function push() {
  pushTimer = null;
  if (!uid || pushing) return;
  pushing = true;
  const { fs, fsMod } = await loadFirebase();
  try {
    let writes: { kind: Kind; id: string; data: string; h: string }[] = [];
    for (const kind of Object.keys(dirty) as Kind[]) {
      const ids = [...dirty[kind]];
      dirty[kind].clear();
      for (const id of ids) {
        const payload = await localPayload(kind, id);
        if (!payload) continue;
        let data = stable(payload);
        // Firestore documents max out near 1 MB; a very long transcript stays on this device.
        if (data.length > 880_000 && kind === 'items') {
          const item = payload as ItemPayload;
          data = stable({ ...item, analysis: item.analysis && { ...item.analysis, transcript: '', onScreenText: '' } });
        }
        if (data.length > 880_000) continue;
        const h = hash(data);
        if ((await knownHash(kind, id)) !== h) writes.push({ kind, id, data, h });
      }
    }
    if (writes.length) set({ status: 'syncing' });
    while (writes.length) {
      const chunk = writes.slice(0, BATCH);
      writes = writes.slice(BATCH);
      const batch = fsMod.writeBatch(fs);
      for (const w of chunk) batch.set(fsMod.doc(fs, 'users', uid, w.kind, w.id), { data: w.data, hash: w.h, updatedAt: fsMod.serverTimestamp(), v: 1 });
      await batch.commit();
      await db.syncHashes.bulkPut(chunk.map((w) => ({ key: `${w.kind}/${w.id}`, hash: w.h })));
    }
    set({ status: 'synced', lastSync: new Date().toISOString(), error: null });
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  } finally {
    pushing = false;
    if (Object.values(dirty).some((s) => s.size) && !pushTimer) pushTimer = setTimeout(push, 4000);
  }
}

function friendly(e: unknown) {
  const code = (e as { code?: string })?.code || '';
  if (code.includes('permission-denied')) return 'Firestore refused the write. Check that firestore.rules from the repo is published.';
  if (code.includes('resource-exhausted')) return 'The free Firestore quota for today is used up. Sync resumes tomorrow.';
  if (code.includes('unavailable')) return 'You seem to be offline. Changes will sync when you are back.';
  if (code.includes('unauthorized-domain')) return 'This site is not an authorized domain in Firebase Authentication settings.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'Sign-in was cancelled.';
  return (e as Error)?.message || 'Sync failed.';
}

async function queueEverything() {
  const [reels, cards, boards, digests] = await Promise.all([db.reels.toCollection().primaryKeys(), db.cards.toArray(), db.topicBoards.toArray(), db.digests.toCollection().primaryKeys()]);
  reels.forEach((id) => dirty.items.add(id as string));
  new Set(cards.map((c) => c.shortcode)).forEach((id) => dirty.cards.add(id));
  boards.forEach((b) => dirty.boards.add(slug(b.topic)));
  digests.forEach((id) => dirty.digests.add(id as string));
  (await db.layouts.toCollection().primaryKeys()).forEach((id) => dirty.layouts.add(id as string));
  (await db.assetEdits.toCollection().primaryKeys()).forEach((id) => dirty.edits.add(id as string));
}

async function startSync(userId: string) {
  uid = userId;
  hookTables();
  const { fs, fsMod } = await loadFirebase();
  set({ status: 'syncing' });
  unsubs.forEach((u) => u());
  // Items first, so cards and boards always have their reels.
  unsubs = (['items', 'cards', 'boards', 'digests', 'layouts', 'edits'] as Kind[]).map((kind) =>
    fsMod.onSnapshot(
      fsMod.collection(fs, 'users', userId, kind),
      async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.doc.metadata.hasPendingWrites) continue;
          if (change.type === 'removed') {
            // Removed on another device: drop it here too, unless this device has an analysis for it.
            if (kind === 'items' && !snap.metadata.fromCache) {
              const reel = await db.reels.get(change.doc.id);
              if (reel && reel.status !== 'analyzed') await db.reels.delete(change.doc.id);
              await db.syncHashes.delete(`items/${change.doc.id}`);
            }
            continue;
          }
          const { data, hash: remoteHash } = change.doc.data() as { data: string; hash: string };
          if (!data || (await knownHash(kind, change.doc.id)) === remoteHash) continue;
          try {
            const merged = await applyRemote(kind, JSON.parse(data));
            const mergedHash = hash(stable(merged));
            // If this device had more (for example a newer analysis), the merged copy goes back up.
            await db.syncHashes.put({ key: `${kind}/${change.doc.id}`, hash: remoteHash });
            if (mergedHash !== remoteHash) mark(kind, change.doc.id);
          } catch {
            /* one bad document shouldn't stop the rest */
          }
        }
        if (!snap.metadata.fromCache) set({ status: pushing ? 'syncing' : 'synced', lastSync: new Date().toISOString() });
      },
      (e) => set({ status: 'error', error: friendly(e) }),
    ),
  );
  unsubs.push(watchHelper(userId, fs, fsMod));
  await queueEverything();
  push();
}

function stopSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  uid = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
}

let watching = false;
async function watchAuth() {
  if (watching) return;
  watching = true;
  set({ status: 'loading' });
  const { auth, authMod } = await loadFirebase();
  authMod.onAuthStateChanged(auth, (user) => {
    if (user) {
      set({ user: { uid: user.uid, name: user.displayName || 'Signed in', email: user.email || '', photo: user.photoURL }, error: null });
      startSync(user.uid).catch((e) => set({ status: 'error', error: friendly(e) }));
    } else {
      stopSync();
      set({ user: null, status: 'signed-out' });
    }
  });
}

/** Called once at startup: resumes sync if it was on in this browser. */
export function initCloud() {
  if (!cloudConfigured) return;
  try {
    if (localStorage.getItem(ON_KEY) === 'on') watchAuth().catch((e) => set({ status: 'error', error: friendly(e) }));
  } catch {
    /* storage blocked: sync stays off */
  }
}

export async function signIn() {
  if (!cloudConfigured) return;
  try {
    localStorage.setItem(ON_KEY, 'on');
  } catch {
    /* fine: sync works for this visit */
  }
  set({ status: 'loading', error: null });
  try {
    await watchAuth();
    const { auth, authMod } = await loadFirebase();
    const provider = new authMod.GoogleAuthProvider();
    try {
      await authMod.signInWithPopup(auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await authMod.signInWithRedirect(auth, provider);
      else throw e;
    }
  } catch (e) {
    set({ status: state.user ? state.status : 'signed-out', error: friendly(e) });
  }
}

/** Stops syncing on this device. Your data stays here and in your cloud copy. */
export async function signOut() {
  try {
    localStorage.removeItem(ON_KEY);
  } catch {
    /* nothing to clear */
  }
  stopSync();
  if (fb) {
    const { auth, authMod } = await loadFirebase();
    await authMod.signOut(auth);
  }
  await db.syncHashes.clear();
  set({ user: null, status: 'off', lastSync: null });
}

/** Deletes cloud copies, so the removal reaches your other devices. */
export async function forgetRemote(kind: Kind, ids: string[]) {
  ids.forEach((id) => dirty[kind].delete(id));
  await db.syncHashes.bulkDelete(ids.map((id) => `${kind}/${id}`));
  if (!uid || !ids.length) return;
  const { fs, fsMod } = await loadFirebase();
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = fsMod.writeBatch(fs);
    for (const id of ids.slice(i, i + BATCH)) batch.delete(fsMod.doc(fs, 'users', uid, kind, id));
    await batch.commit().catch(() => undefined);
  }
}

// ── Your helper's phone address, shared with your own devices ──────────────
let remote: { url: string; code: string } | null = null;
let published = '';
export const remoteHelper = () => remote;

/** Called on the computer running the helper: lets your signed-in phone find it without a new link. */
export async function publishHelper(url: string, code: string) {
  const data = JSON.stringify({ url, code });
  if (!uid || data === published) return;
  published = data;
  const { fs, fsMod } = await loadFirebase();
  await fsMod.setDoc(fsMod.doc(fs, 'users', uid, 'devices', 'helper'), { data, hash: hash(data), updatedAt: fsMod.serverTimestamp(), v: 1 }).catch(() => {
    published = '';
  });
}

function watchHelper(userId: string, fs: import('firebase/firestore').Firestore, fsMod: typeof import('firebase/firestore')) {
  return fsMod.onSnapshot(
    fsMod.doc(fs, 'users', userId, 'devices', 'helper'),
    (snap) => {
      try {
        const v = snap.exists() ? JSON.parse((snap.data() as { data: string }).data) : null;
        remote = v?.url && v?.code ? v : null;
      } catch {
        remote = null;
      }
    },
    () => undefined,
  );
}

/** Sends pending changes right away instead of within a few seconds. */
export function flushSync() {
  if (!uid) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  push();
}

export function syncNow() {
  if (!uid) return;
  queueEverything().then(push);
}
