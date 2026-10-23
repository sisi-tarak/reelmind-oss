// Reel cover images. The helper keeps the thumbnail yt-dlp downloaded; the browser caches a copy in IndexedDB
// so hover cards keep working when the helper is closed.
import { useEffect, useState } from 'react';
import { db } from './db';
import { helper } from './helper';

const missing = new Set<string>();
const inflight = new Map<string, Promise<Blob | null>>();

async function loadThumb(shortcode: string, canAsk: boolean): Promise<Blob | null> {
  const cached = await db.thumbs.get(shortcode);
  if (cached) return cached.blob;
  if (!canAsk || missing.has(shortcode)) return null;
  let pending = inflight.get(shortcode);
  if (!pending) {
    pending = helper.thumb(shortcode).then(async (blob) => {
      inflight.delete(shortcode);
      if (blob && blob.type.startsWith('image/')) {
        await db.thumbs.put({ shortcode, blob }).catch(() => undefined);
        return blob;
      }
      missing.add(shortcode);
      return null;
    });
    inflight.set(shortcode, pending);
  }
  return pending;
}

/**
 * An object URL for the reel's cover, or null. `enabled` lets callers wait until a card is actually shown.
 * `canAsk` is whether the helper is connected and has a thumbnail for this reel.
 */
export function useThumb(shortcode: string, enabled: boolean, canAsk: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let objectUrl: string | null = null;
    setLoading(true);
    loadThumb(shortcode, canAsk)
      .then((blob) => {
        if (!live || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [shortcode, enabled, canAsk]);
  return { url, loading };
}
