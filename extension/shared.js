// Settings, the reel list, and the one call the extension makes: POST /api/inbox on your own helper.
export const DEFAULTS = { helperUrl: 'http://localhost:5317', code: '', appUrl: 'https://reelmind-oss.vercel.app' };
export const REEL_URL = /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,20})/;
export const canonical = (url) => {
  const m = String(url || '').match(REEL_URL);
  return m ? `https://www.instagram.com/reel/${m[1]}/` : null;
};

export async function settings() {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...saved };
}

async function call(path, init = {}) {
  const { helperUrl, code } = await settings();
  let res;
  try {
    res = await fetch(`${helperUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-ReelMind-Code': code, ...(init.headers || {}) },
    });
  } catch {
    throw new Error('The ReelMind helper is not running. Start it with "npm run helper".');
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new Error('Paste the connect code from the helper into this extension first.');
  if (!res.ok) throw new Error(body?.error || `Helper error ${res.status}`);
  return body;
}

export const health = () => call('/api/health');

/** Sends one reel or many in one request. */
export function send(urls, { analyze = false, creator = '' } = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).map(canonical).filter(Boolean);
  return call('/api/inbox', { method: 'POST', body: JSON.stringify({ urls: list, analyze, creator }) });
}

// ── The list: reels collected for sending together ─────────────────────────
export async function getList() {
  return (await chrome.storage.local.get('list')).list || [];
}

/** Adds reels ({url, creator?}) to the list, skipping ones already on it. Returns how many were new. */
export async function addToList(items) {
  const list = await getList();
  const have = new Set(list.map((i) => i.url));
  let added = 0;
  for (const it of items) {
    const url = canonical(it.url);
    if (!url || have.has(url)) continue;
    have.add(url);
    list.push({ url, creator: it.creator || '', addedAt: Date.now() });
    added += 1;
  }
  await chrome.storage.local.set({ list: list.slice(-2000) });
  return added;
}

export async function setList(list) {
  await chrome.storage.local.set({ list });
}
