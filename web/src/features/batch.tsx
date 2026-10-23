import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '@/lib/db';
import { publishHelper, remoteHelper } from '@/lib/cloud';
import { BlockedError, connectCode, DEFAULT_HELPER_URL, helper, helperUrl, isTrustedHelperUrl, setConnectCode, setHelperUrl } from '@/lib/helper';
import { pullInbox, syncLibrary } from '@/lib/library';
import type { HelperHealth, Job, Provider, Reel } from '@/lib/types';

const JOB_KEY = 'reelmind.jobId';
const PROVIDER_KEY = 'reelmind.provider';

interface BatchState {
  job: Job | null;
  error: string | null;
  starting: boolean;
  health: HelperHealth | null;
  healthError: string | null;
  /** The helper may be running, but the browser won't let this site reach it. */
  browserBlocked: boolean;
  /** The helper is running and this site is allowed to use it. */
  ready: boolean;
  provider: Provider;
  setProvider: (p: Provider) => void;
  start: (reels: Reel[], options?: { force?: boolean; provider?: Provider }) => Promise<void>;
  buildLinks: (reels: Reel[]) => Promise<void>;
  cancel: () => Promise<void>;
  dismiss: () => void;
  refreshHealth: () => Promise<void>;
  lastBatchId: string | null;
  /** A short message for the person, such as reels that just arrived. */
  notice: string | null;
  setNotice: (n: string | null) => void;
}

const Ctx = createContext<BatchState | null>(null);

export function useBatch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBatch must be used inside BatchProvider');
  return ctx;
}

const isRunning = (job: Job | null) => job?.status === 'running';

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: preference just won't persist */
  }
}

/** Copies finished results from the helper into the browser library. Safe to call repeatedly. */
async function syncJob(job: Job, saved: Set<string>) {
  const finished = job.items.filter((i) => (i.step === 'done' || i.step === 'cached') && !saved.has(i.shortcode));
  if (finished.length && job.kind === 'link') {
    const vectors = await helper.embeddings(finished.map((i) => i.shortcode));
    await db.embeddings.bulkPut(Object.entries(vectors).map(([shortcode, values]) => ({ shortcode, values })));
    finished.forEach((i) => saved.add(i.shortcode));
  } else if (finished.length) {
    const results = await helper.analyses(finished.map((i) => i.shortcode));
    await db.transaction('rw', db.reels, db.analyses, db.embeddings, async () => {
      for (const item of finished) {
        const result = results[item.shortcode];
        const reel = await db.reels.get(item.shortcode);
        if (!result || !reel) continue;
        const { embedding, ...analysis } = result;
        await db.analyses.put(analysis);
        if (embedding) await db.embeddings.put({ shortcode: item.shortcode, values: embedding });
        await db.reels.update(item.shortcode, {
          status: 'analyzed',
          failReason: undefined,
          creator: reel.creator || analysis.creator || '',
          // Fresh or reused from the helper's cache, it's new on this board.
          batchId: job.id,
        });
        saved.add(item.shortcode);
      }
    });
  }
  const failed = job.items.filter((i) => i.step === 'failed' && !saved.has(i.shortcode));
  for (const item of failed) {
    if (job.kind === 'analyze' && !job.force) await db.reels.update(item.shortcode, { status: 'failed', failReason: item.error || 'Unknown error' });
    saved.add(item.shortcode);
  }
  if (!isRunning(job) && job.kind === 'analyze') {
    await db.batches.put({
      id: job.id,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      status: job.status,
      total: job.counts.total,
      analyzed: job.counts.done,
      reused: job.counts.cached,
      failed: job.counts.failed,
      pending: job.counts.pending,
      demo: job.demo,
    });
  }
}

export function BatchProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [health, setHealth] = useState<HelperHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [browserBlocked, setBrowserBlocked] = useState(false);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [provider, setProviderState] = useState<Provider>(() => {
    try {
      return localStorage.getItem(PROVIDER_KEY) === 'claude' ? 'claude' : 'gemini';
    } catch {
      return 'gemini';
    }
  });
  const saved = useRef(new Set<string>());
  const ready = Boolean(health && !health.needsCode);
  const [notice, setNotice] = useState<string | null>(null);

  // Show what the helper already knows, and pick up reels from the browser extension. Free: no AI calls.
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const library = async () => {
      try {
        const n = await syncLibrary();
        if (n && !stopped) setNotice(`${n} analyzed ${n === 1 ? 'reel' : 'reels'} loaded from your helper.`);
      } catch {
        /* helper went away; try again next time */
      }
    };
    const inbox = async () => {
      try {
        const n = await pullInbox();
        if (n && !stopped) setNotice(`${n} ${n === 1 ? 'reel' : 'reels'} arrived from the browser extension.`);
        if (n) await library();
      } catch {
        /* helper went away; try again next time */
      }
    };
    library();
    inbox();
    const a = setInterval(library, 60000);
    const b = setInterval(inbox, 15000);
    const onFocus = () => {
      library();
      inbox();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(a);
      clearInterval(b);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready]);

  const setProvider = useCallback((p: Provider) => {
    setProviderState(p);
    store(PROVIDER_KEY, p);
  }, []);

  const refreshHealth = useCallback(async () => {
    const ok = (h: HelperHealth) => {
      setHealth(h);
      setHealthError(null);
      setBrowserBlocked(false);
      // On the computer: tell your signed-in phone where to find this helper.
      const code = h.remote?.link?.match(/connect=([A-Za-z0-9_-]+)/)?.[1];
      if (h.remote?.url && code && !h.needsCode) publishHelper(h.remote.url, code).catch(() => undefined);
    };
    try {
      ok(await helper.health());
    } catch (e) {
      // Not reachable where we looked. Try this computer, then your home computer's phone address (from sync).
      const current = helperUrl();
      const saved = remoteHelper();
      const candidates = [
        ...(current !== DEFAULT_HELPER_URL && isTrustedHelperUrl(current) ? [{ url: DEFAULT_HELPER_URL, code: connectCode() }] : []),
        ...(saved && saved.url !== current && (current === '' || isTrustedHelperUrl(current)) ? [saved] : []),
      ];
      for (const c of candidates) {
        const before = { url: current, code: connectCode() };
        setHelperUrl(c.url);
        setConnectCode(c.code);
        try {
          const h = await helper.health();
          if (h.needsCode) throw new Error('not connected');
          return ok(h);
        } catch {
          setHelperUrl(before.url);
          setConnectCode(before.code);
        }
      }
      setHealth(null);
      setHealthError((e as Error).message);
      setBrowserBlocked(e instanceof BlockedError);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const t = setInterval(refreshHealth, 8000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  // The most recent batch decides which cards get the "New" mark.
  useEffect(() => {
    db.batches
      .orderBy('startedAt')
      .last()
      .then((b) => setLastBatchId(b?.id ?? null));
  }, [job?.status]);

  // Pick up a batch that was running before a page reload.
  useEffect(() => {
    if (!ready) return;
    let id: string | null = null;
    try {
      id = localStorage.getItem(JOB_KEY);
    } catch {
      id = null;
    }
    (async () => {
      try {
        // Only a batch this browser started, or one still running, is picked up again.
        const found = id ? await helper.job(id) : await helper.currentJob();
        if (!found || (!id && found.status !== 'running')) return;
        await syncJob(found, saved.current);
        if (found.status === 'running') setJob(found);
        else store(JOB_KEY, null);
      } catch {
        /* helper offline or restarted: unfinished reels simply stay "new" */
      }
    })();
  }, [ready]);

  const jobId = job?.id ?? null;
  const running = isRunning(job);
  useEffect(() => {
    if (!jobId || !running) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await helper.job(jobId);
        if (stopped) return;
        await syncJob(next, saved.current);
        setJob(next);
        if (!isRunning(next)) {
          if (next.kind === 'analyze') setLastBatchId(next.id);
          if (next.status !== 'done' && next.message) setError(next.message);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    const t = setInterval(tick, 1200);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [jobId, running]);

  const launch = useCallback(async (reels: Reel[], options: { force?: boolean; provider?: Provider; kind?: 'analyze' | 'link' }) => {
    if (!reels.length) return;
    setStarting(true);
    setError(null);
    try {
      saved.current = new Set();
      const created = await helper.startJob(
        reels.map((r) => ({ shortcode: r.shortcode, creator: r.creator, savedAt: r.savedAt, collections: r.collections })),
        options,
      );
      store(JOB_KEY, created.id);
      setJob(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }, []);

  const start = useCallback(
    async (reels: Reel[], options: { force?: boolean; provider?: Provider } = {}) => {
      // Never send a reel that already has an analysis in this browser, unless it's an explicit re-analyze.
      const todo = options.force ? reels : reels.filter((r) => r.status !== 'analyzed');
      await launch(todo, { kind: 'analyze', provider: options.provider || provider, force: Boolean(options.force) });
    },
    [launch, provider],
  );

  // Reels you asked to analyze "when my computer is online" (for example from your phone) start here,
  // on a device whose helper is running. Paused for an hour after a limit is hit, so it never loops.
  const pausedUntil = useRef(0);
  const autoBusy = useRef(false);
  useEffect(() => {
    if (job?.status === 'rate_limited') pausedUntil.current = Date.now() + 3600_000;
  }, [job?.status]);
  useEffect(() => {
    if (!ready || running || !health || health.busy) return;
    const keyOk = health.demo || (provider === 'claude' ? health.claude.configured : health.gemini.configured);
    if (!keyOk || (!health.demo && !health.tools.ytdlp.found)) return;
    let stopped = false;
    const check = async () => {
      if (stopped || autoBusy.current || Date.now() < pausedUntil.current) return;
      autoBusy.current = true;
      try {
        const waiting = await db.reels.filter((r) => Boolean(r.queued) && r.status === 'new').toArray();
        if (!waiting.length || stopped) return;
        setNotice(`Analyzing ${waiting.length === 1 ? '1 reel' : `${waiting.length} reels`} you queued from another device.`);
        await start(waiting);
      } finally {
        // Give the new batch time to show up before looking again.
        setTimeout(() => (autoBusy.current = false), 10000);
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [ready, running, health, provider, start]);

  const buildLinks = useCallback((reels: Reel[]) => launch(reels, { kind: 'link' }), [launch]);

  const cancel = useCallback(async () => {
    if (!job) return;
    try {
      setJob(await helper.cancel(job.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [job]);

  const dismiss = useCallback(() => {
    if (isRunning(job)) return;
    setJob(null);
    setError(null);
    store(JOB_KEY, null);
  }, [job]);

  return (
    <Ctx.Provider value={{ job, error, starting, health, healthError, browserBlocked, ready, provider, setProvider, start, buildLinks, cancel, dismiss, refreshHealth, lastBatchId, notice, setNotice }}>
      {children}
    </Ctx.Provider>
  );
}
