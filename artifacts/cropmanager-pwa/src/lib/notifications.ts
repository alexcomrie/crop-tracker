export async function setAppBadge(count: number) {
  const anyNav = navigator as any;
  try {
    if (typeof anyNav.setAppBadge === 'function') {
      await anyNav.setAppBadge(count);
    }
  } catch {}
}

export async function clearAppBadge() {
  const anyNav = navigator as any;
  try {
    if (typeof anyNav.clearAppBadge === 'function') {
      await anyNav.clearAppBadge();
    }
  } catch {}
}

export async function playAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.stop(now + 0.35);
    setTimeout(() => ctx.close(), 500);
  } catch {}
}
