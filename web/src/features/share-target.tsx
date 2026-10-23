// Opened from the phone's Share menu (Android: ReelMind appears in Instagram's Share sheet once installed;
// iPhone: through a Shortcut). Adds the reel, then analyzes it on your home computer right away if it's
// reachable, or queues it for when it is.
import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Cloud, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { flushSync, signIn, useCloud } from '@/lib/cloud';
import { commitImport, queueForLater } from '@/lib/db';
import { helper } from '@/lib/helper';
import { parseText } from '@/lib/parse';
import { useBatch } from './batch';

const PREF = 'reelmind.shareAnalyze';

function sharedText() {
  const p = new URLSearchParams(window.location.search);
  return [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
}

export function ShareTarget() {
  const { ready, health } = useBatch();
  const cloud = useCloud();
  const [found] = useState(() => parseText(sharedText()));
  const [analyze, setAnalyze] = useState(() => {
    try {
      return localStorage.getItem(PREF) !== 'off';
    } catch {
      return true;
    }
  });
  const [state, setState] = useState<'adding' | 'waiting' | 'analyzing' | 'queued' | 'saved' | 'error'>('adding');
  const [message, setMessage] = useState('');
  const added = useRef(false);
  const settled = useRef(false);

  // 1. Save on this device first, so nothing is lost even with no connection.
  useEffect(() => {
    if (added.current || !found.length) return;
    added.current = true;
    commitImport(found.map((r) => ({ ...r, savedAt: r.savedAt || new Date().toISOString() }))).then(() => setState('waiting'));
  }, [found]);

  // 2. Hand it to your computer: straight away if its helper is reachable, otherwise queue it.
  useEffect(() => {
    if (state !== 'waiting' || settled.current) return;
    const ids = found.map((r) => r.shortcode);
    if (!analyze) {
      settled.current = true;
      setState('saved');
      flushSync();
      return;
    }
    if (ready && health && !health.needsCode) {
      settled.current = true;
      helper
        .send(found.map((r) => r.url), true)
        .then((r) => {
          setMessage(r.message);
          setState('analyzing');
        })
        .catch(async (e) => {
          await queueForLater(ids);
          flushSync();
          setMessage((e as Error).message);
          setState('queued');
        });
      return;
    }
    // Give the helper check a few seconds before falling back to the queue.
    const t = setTimeout(async () => {
      if (settled.current) return;
      settled.current = true;
      await queueForLater(ids);
      flushSync();
      setState('queued');
    }, 6000);
    return () => clearTimeout(t);
  }, [state, ready, health, analyze, found]);

  const setPref = (v: boolean) => {
    setAnalyze(v);
    try {
      localStorage.setItem(PREF, v ? 'on' : 'off');
    } catch {
      /* preference just won't persist */
    }
  };

  const synced = cloud.user && (cloud.status === 'synced' || cloud.status === 'syncing');
  return (
    <div className="flex min-h-full items-center justify-center bg-[#f4f5f7] p-4" style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1.3px, transparent 1.3px)', backgroundSize: '20px 20px' }}>
      <div className="w-full max-w-[420px] rounded-2xl border bg-background p-6 shadow-[0_24px_60px_-30px_rgb(16_24_40/0.35)]">
        <p className="text-[13px] font-semibold text-muted-foreground">ReelMind</p>
        {!found.length ? (
          <>
            <h1 className="mt-2 flex items-center gap-2 text-[20px] font-semibold">
              <TriangleAlert className="size-5 text-[#d97706]" /> No reel link found
            </h1>
            <p className="mt-2 text-[14.5px] text-muted-foreground">Share a reel or post from Instagram (Share, then ReelMind), or copy its link and paste it in Add reels.</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
              {state === 'adding' || state === 'waiting' ? 'Adding…' : found.length === 1 ? 'Reel added' : `${found.length} reels added`}
            </h1>
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-[14px]">
              {state === 'adding' || state === 'waiting' ? (
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" />
              ) : state === 'analyzing' ? (
                <Sparkles className="mt-0.5 size-5 shrink-0 text-[#a16207]" />
              ) : state === 'queued' ? (
                <Clock className="mt-0.5 size-5 shrink-0" />
              ) : (
                <Check className="mt-0.5 size-5 shrink-0 text-success" />
              )}
              <p>
                {state === 'adding' && 'Saving it on this phone.'}
                {state === 'waiting' && 'Looking for your computer…'}
                {state === 'analyzing' && (message || 'Sent to your computer. Analyzing now; the notes appear on your board in a minute.')}
                {state === 'queued' && "Your computer isn't reachable right now, so it's queued. It's analyzed automatically the next time your computer's helper is running."}
                {state === 'saved' && 'Saved to your library. Analyze it whenever you like.'}
              </p>
            </div>
            {(state === 'queued' || state === 'saved') && cloud.configured && !cloud.user && (
              <div className="mt-3 rounded-xl border border-dashed px-4 py-3 text-[13.5px]">
                <p>Sign in so your computer receives it.</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={signIn}>
                  <Cloud /> Sign in with Google
                </Button>
              </div>
            )}
            {synced && state !== 'adding' && state !== 'waiting' && (
              <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Cloud className="size-3.5" /> {cloud.status === 'syncing' ? 'Syncing to your other devices…' : 'Synced to your other devices.'}
              </p>
            )}
            <label className="mt-4 flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" checked={analyze} onChange={(e) => setPref(e.target.checked)} className="size-4 accent-foreground" />
              Analyze shared reels automatically
            </label>
          </>
        )}
        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={() => window.location.replace('/')}>
            Open ReelMind
          </Button>
          <Button variant="outline" onClick={() => (window.close(), history.length > 1 && history.back())}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
