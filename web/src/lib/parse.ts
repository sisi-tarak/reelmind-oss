// Reads Instagram's "Download your information" export (JSON, HTML or the whole ZIP) and pasted links.
// Nothing here talks to the network; it only finds reel links and their save dates.
import JSZip from 'jszip';

export interface ImportedReel {
  shortcode: string;
  url: string;
  creator: string;
  savedAt: string | null;
  collections: string[];
}

export interface ParseResult {
  reels: ImportedReel[];
  /** Links found more than once in this upload, collapsed into one. */
  duplicatesInUpload: number;
  sources: string[];
}

const URL_RE = /(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:[A-Za-z0-9_.]{1,30}\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,64})/gi;

/** Returns the reel's id (shortcode), ignoring www, query strings, trailing slashes and /reel/ vs /p/. */
export function extractShortcode(url: string): string | null {
  URL_RE.lastIndex = 0;
  const match = URL_RE.exec(url);
  URL_RE.lastIndex = 0;
  return match ? match[1] : null;
}

export function canonicalUrl(shortcode: string) {
  return `https://www.instagram.com/reel/${shortcode}/`;
}

function toIso(ts: unknown): string | null {
  const n = typeof ts === 'string' ? Number(ts) : ts;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function linksIn(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) out.push(m[1]);
  return out;
}

export function parseText(text: string): ImportedReel[] {
  return linksIn(text).map((shortcode) => ({ shortcode, url: canonicalUrl(shortcode), creator: '', savedAt: null, collections: [] }));
}

type Ctx = { ts: string | null; creator: string; collection: string | null };

function findTimestamp(obj: Record<string, unknown>): string | null {
  for (const key of ['timestamp', 'timestamp_value', 'creation_timestamp']) {
    const iso = toIso(obj[key]);
    if (iso) return iso;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const iso = toIso(v.timestamp) || toIso(v.timestamp_value);
      if (iso) return iso;
    }
  }
  return null;
}

// saved_collections.json marks the start of each collection with an entry titled "Collection".
function collectionHeader(obj: Record<string, unknown>): string | null {
  if (obj.title !== 'Collection') return null;
  const smd = obj.string_map_data as Record<string, { value?: string; href?: string }> | undefined;
  const name = smd?.Name;
  return name && !name.href && typeof name.value === 'string' ? name.value : null;
}

function walk(node: unknown, ctx: Ctx, out: ImportedReel[]) {
  if (Array.isArray(node)) {
    let collection = ctx.collection;
    for (const el of node) {
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const header = collectionHeader(el as Record<string, unknown>);
        if (header) {
          collection = header;
          continue;
        }
      }
      walk(el, { ...ctx, collection }, out);
    }
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const ts = findTimestamp(obj) || ctx.ts;
  let creator = typeof obj.title === 'string' && obj.title !== 'Collection' ? obj.title : ctx.creator;
  if (typeof obj.href === 'string' && typeof obj.value === 'string' && !extractShortcode(obj.value)) creator = obj.value;
  if (typeof obj.label === 'string' && /user|owner|author/i.test(obj.label) && typeof obj.value === 'string') creator = obj.value;

  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      for (const shortcode of linksIn(value)) {
        out.push({ shortcode, url: canonicalUrl(shortcode), creator, savedAt: ts, collections: ctx.collection ? [ctx.collection] : [] });
      }
    } else {
      walk(value, { ts, creator, collection: ctx.collection }, out);
    }
  }
}

export function parseJson(data: unknown): ImportedReel[] {
  const out: ImportedReel[] = [];
  walk(data, { ts: null, creator: '', collection: null }, out);
  return out;
}

function parseFileText(name: string, text: string): ImportedReel[] {
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) {
    try {
      return parseJson(JSON.parse(text));
    } catch {
      /* not JSON after all; fall through to plain link scan */
    }
  }
  return parseText(text);
}

/** Merges duplicates: earliest save date wins, creators and collections are combined. */
export function dedupe(items: ImportedReel[]): { reels: ImportedReel[]; duplicates: number } {
  const map = new Map<string, ImportedReel>();
  for (const item of items) {
    const prev = map.get(item.shortcode);
    if (!prev) {
      map.set(item.shortcode, { ...item, collections: [...item.collections] });
      continue;
    }
    prev.creator ||= item.creator;
    if (item.savedAt && (!prev.savedAt || item.savedAt < prev.savedAt)) prev.savedAt = item.savedAt;
    prev.collections = Array.from(new Set([...prev.collections, ...item.collections]));
  }
  return { reels: [...map.values()], duplicates: items.length - map.size };
}

export async function parseFiles(files: File[]): Promise<{ items: ImportedReel[]; sources: string[] }> {
  const items: ImportedReel[] = [];
  const sources: string[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && /saved/i.test(f.name) && /\.(json|html?)$/i.test(f.name));
      for (const entry of entries) {
        const found = parseFileText(entry.name, await entry.async('string'));
        if (found.length) sources.push(entry.name.split('/').pop() || entry.name);
        items.push(...found);
      }
      if (!entries.length) {
        throw new Error(
          `No saved posts in ${file.name}. When you request your Instagram data, include "Saved" and choose JSON or HTML.`,
        );
      }
    } else {
      const found = parseFileText(file.name, await file.text());
      sources.push(file.name);
      items.push(...found);
    }
  }
  return { items, sources };
}

export async function parseImport(files: File[], pasted: string): Promise<ParseResult> {
  const fromFiles = files.length ? await parseFiles(files) : { items: [], sources: [] };
  const fromText = pasted.trim() ? parseText(pasted) : [];
  const { reels, duplicates } = dedupe([...fromFiles.items, ...fromText]);
  reels.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  return { reels, duplicatesInUpload: duplicates, sources: [...fromFiles.sources, ...(fromText.length ? ['pasted links'] : [])] };
}
