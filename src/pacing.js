// Frame pacing.
//
// requestAnimationFrame timestamps are rounded: Firefox rounds timers to whole
// milliseconds, so at a perfectly steady 60 Hz the measured frame times read
// 17, 17, 16, 17... and motion interpolated from them jitters. The pacer
// estimates the display interval from recent frames, snaps a frame time that
// is close to a whole number of intervals onto it, and pays the rounding error
// back gently (10 % per frame), so game time never drifts from the clock.
// The estimate adapts to any refresh rate, and snapping switches itself off
// when frame times genuinely vary (variable refresh, a struggling machine).

export function createPacer() {
  const hist = new Float64Array(64);
  let n = 0, k = 0, iv = 0, debt = 0;
  const estimate = () => {
    const a = Array.from(hist.subarray(0, n)).sort((x, y) => x - y);
    const med = a[a.length >> 1];
    let s = 0, c = 0, lo = Infinity, hi = 0;
    for (const v of a) if (v > med * 0.75 && v < med * 1.25) { s += v; c++; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const mean = c ? s / c : 0;
    // timer rounding spreads frame times by a millisecond or two; more means they really vary
    const steady = c >= 12 && hi - lo < 0.0032 + 0.05 * mean;
    iv = steady && mean > 1 / 400 && mean < 1 / 20 ? mean : 0;
  };
  return {
    /** Estimated display interval in seconds (0 while unknown or irregular). */
    get interval() { return iv; },
    /** Real seconds since the last frame in, seconds to advance the game by out. */
    step(raw) {
      if (!(raw >= 0) || raw > 0.25) { debt = 0; return raw > 0 ? Math.min(raw, 0.25) : 0; }
      if (raw > 0) {
        hist[k] = raw; k = (k + 1) & 63;
        if (n < 64) n++;
        if ((k & 7) === 0 && n >= 16) estimate();
      }
      const total = debt + raw;
      if (iv > 0) {
        const m = Math.max(1, Math.round(total / iv)), r = total - m * iv;
        if (Math.abs(r) < iv * 0.3) {
          const fed = m * iv + 0.1 * r;
          debt = total - fed;
          return fed;
        }
      }
      debt = 0;
      return Math.max(0, total);
    },
  };
}
