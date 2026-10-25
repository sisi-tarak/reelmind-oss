// Reel cover images. The helper keeps the thumbnail yt-dlp downloaded; the browser caches a copy in IndexedDB
// so hover cards keep working when the helper is closed.
import { useEffect, useState } from 'react';
import { db } from './db';
import { helper } from './helper';

// Covers the helper said it doesn't have, and when. Asked again after a while: the helper can rebuild a
// cover from the saved video, and a failed request (helper restarting, slow network) is never final.
const missing = new Map<string, number>();
const RETRY_MS = 2 * 60 * 1000;
const inflight = new Map<string, Promise<Blob | null>>();

async function loadThumb(shortcode: string, canAsk: boolean): Promise<Blob | null> {
  const cached = await db.thumbs.get(shortcode);
  if (cached) return cached.blob;
  const missedAt = missing.get(shortcode);
  if (!canAsk || (missedAt && Date.now() - missedAt < RETRY_MS)) return null;
  let pending = inflight.get(shortcode);
  if (!pending) {
    pending = helper.thumb(shortcode).then(async (result) => {
      inflight.delete(shortcode);
      if (result instanceof Blob && result.type.startsWith('image/')) {
        missing.delete(shortcode);
        await db.thumbs.put({ shortcode, blob: result }).catch(() => undefined);
        return result;
      }
      if (result === 'missing') missing.set(shortcode, Date.now());
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
  const [attempt, setAttempt] = useState(0);
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
  }, [shortcode, enabled, canAsk, attempt]);
  /** Asks the helper again right away, for example after it was restarted. */
  const retry = () => {
    missing.delete(shortcode);
    setAttempt((n) => n + 1);
  };
  return { url, loading, retry };
}
