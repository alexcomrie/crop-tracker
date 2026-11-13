/**
 * PWA update watcher.
 *
 * A new deploy is picked up by the service worker, but the already-open page
 * keeps running the old bundle until it is reloaded. On some hosts one reload
 * is not enough (the new SW must install, activate and claim the page before
 * the fresh index.html is served), which is why users were tapping reload
 * three to five times and assuming the app was broken.
 *
 * This module makes that settling automatic: when a new worker is installed
 * while the page is controlled, it runs a short sequence of reloads behind a
 * "Checking for update" overlay. Each pass stays on screen for at least 1.5s
 * (plus a 1s gap), so the update applies quietly in the background.
 *
 * State lives in sessionStorage because `location.reload()` wipes memory. The
 * sequence is capped so a broken deploy can never trap a device in a loop.
 */

const SEQ_KEY = 'cropmanager_update_seq_v1';
const DONE_KEY = 'cropmanager_update_done_v1';
const ATTEMPTS_KEY = 'cropmanager_update_attempts_v1';

/** 4 reloads: matches the 3–5 manual reloads users needed, without looping. */
export const UPDATE_TOTAL_PASSES = 4;
/** Minimum time the overlay stays visible on each pass. */
const VISIBLE_MS = 1500;
/** Extra breathing room between reloads. */
const GAP_MS = 1000;
/** A sequence this old was interrupted (tab closed); start clean instead. */
const STALE_MS = 2 * 60 * 1000;
/** Never run more than two sequences per tab session. */
const MAX_SEQUENCES = 2;
/** Ignore fresh update signals right after finishing, to avoid a reload loop. */
const COOLDOWN_MS = 5 * 60 * 1000;

export interface UpdateState {
  active: boolean;
  pass: number;
  total: number;
}

interface SequenceState {
  pass: number;
  startedAt: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* listener must never break the updater */ }
  });
}

function readRaw(): SequenceState | null {
  try {
    const raw = sessionStorage.getItem(SEQ_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SequenceState>;
    if (!parsed || typeof parsed.pass !== 'number' || typeof parsed.startedAt !== 'number') return null;
    if (Date.now() - parsed.startedAt > STALE_MS) {
      sessionStorage.removeItem(SEQ_KEY);
      return null;
    }
    if (parsed.pass < 1) return null;
    return { pass: parsed.pass, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

let sequence: SequenceState | null = readRaw();
let reloadTimer: number | null = null;

function persist(next: SequenceState | null) {
  sequence = next;
  try {
    if (next) sessionStorage.setItem(SEQ_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SEQ_KEY);
  } catch { /* private mode: memory only */ }
  emit();
}

function attemptsUsed(): number {
  try {
    const n = Number(sessionStorage.getItem(ATTEMPTS_KEY) ?? '0');
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function bumpAttempts(): void {
  try { sessionStorage.setItem(ATTEMPTS_KEY, String(attemptsUsed() + 1)); } catch { /* ignore */ }
}

function recentlyFinished(): boolean {
  try {
    const done = Number(sessionStorage.getItem(DONE_KEY) ?? '0');
    return Number.isFinite(done) && Date.now() - done < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function scheduleReload(pass: number) {
  if (reloadTimer !== null) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    if (pass >= UPDATE_TOTAL_PASSES) {
      // Last visible pass is done. Drop the sequence, remember the finish and
      // reload one final time so this page is replaced by the newest bundle.
      persist(null);
      try { sessionStorage.setItem(DONE_KEY, String(Date.now())); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    // Persist the next pass BEFORE reloading: location.reload() wipes memory,
    // so boot reads this record and resumes the overlay where it left off.
    persist({ pass: pass + 1, startedAt: Date.now() });
    window.location.reload();
  }, VISIBLE_MS + GAP_MS);
}

function startPass(pass: number) {
  persist({ pass, startedAt: Date.now() });
  scheduleReload(pass);
}

/** Begin the automatic update reload sequence (safe to call repeatedly). */
export function startUpdateSequence(): void {
  if (sequence) return;
  if (recentlyFinished()) return;
  if (attemptsUsed() >= MAX_SEQUENCES) {
    console.warn('[pwa] automatic update skipped after repeated attempts; a manual reload will finish it');
    return;
  }
  bumpAttempts();
  startPass(1);
}

/** Resume a sequence that was interrupted by a reload (called on boot). */
export function resumeUpdateSequence(): void {
  if (!sequence) return;
  emit();
  scheduleReload(sequence.pass);
}

export function getUpdateState(): UpdateState {
  return {
    active: sequence !== null,
    pass: sequence?.pass ?? 0,
    total: UPDATE_TOTAL_PASSES,
  };
}

export function subscribeUpdateState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register the service worker ourselves (the plugin's injected registration is
 * disabled) so we can poll for updates and drive the reload sequence.
 */
export function startPwaUpdateWatcher(): void {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const base = (import.meta.env.BASE_URL as string | undefined) || '/';
  const scope = base.endsWith('/') ? base : `${base}/`;

  navigator.serviceWorker
    .register(`${scope}sw.js`, { scope, updateViaCache: 'none' })
    .then(registration => {
      let checking = false;

      const watchWorker = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const onState = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            startUpdateSequence();
          }
        };
        worker.addEventListener('statechange', onState);
        onState();
      };

      const check = async () => {
        if (checking || sequence) return;
        checking = true;
        try {
          await registration.update();
        } catch {
          /* offline or blocked — inspect the current registration below */
        } finally {
          checking = false;
        }
        // A worker already waiting means the previous check downloaded it.
        if (registration.waiting && navigator.serviceWorker.controller) {
          startUpdateSequence();
        }
      };

      registration.addEventListener('updatefound', () => watchWorker(registration.installing));
      watchWorker(registration.installing);
      // A worker can already be waiting when the app opens (deploy happened
      // while the PWA was closed).
      if (registration.waiting && navigator.serviceWorker.controller) {
        startUpdateSequence();
      }

      void check();
      window.setInterval(() => void check(), 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check();
      });
      window.addEventListener('online', () => void check());
    })
    .catch(e => console.warn('[pwa] service worker registration failed', e));
}
