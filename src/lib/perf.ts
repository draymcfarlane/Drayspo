/**
 * Keeps the page smooth on every browser.
 *
 * 1. Off-screen sections pause their looping animations (nothing is drawn for
 *    things you can't see).
 * 2. Lite mode: a few seconds after the page opens, frame times are sampled. If the
 *    browser is struggling (often Brave with strict protections, older laptops, or
 *    battery saver), <html data-perf="lite"> switches off the costliest effects:
 *    the WebGL background animation, SVG goo filters, backdrop blur and decorative
 *    loops. The choice is remembered for the visit.
 *    Force it with ?perf=lite or ?perf=full.
 */

const KEY = "drayspo-perf";
type Mode = "full" | "lite";

function store(mode: Mode) {
  try {
    sessionStorage.setItem(KEY, mode);
  } catch {
    /* storage can be blocked; the mode still applies for this page view */
  }
}

function remembered(): Mode | null {
  try {
    const forced = new URLSearchParams(location.search).get("perf");
    if (forced === "lite" || forced === "full") {
      sessionStorage.setItem(KEY, forced);
      return forced;
    }
    const v = sessionStorage.getItem(KEY);
    return v === "lite" || v === "full" ? v : null;
  } catch {
    return null;
  }
}

export function perfMode(): Mode {
  return document.documentElement.dataset["perf"] === "lite" ? "lite" : "full";
}

function apply(mode: Mode) {
  document.documentElement.dataset["perf"] = mode;
  window.dispatchEvent(new CustomEvent("perf-mode", { detail: mode }));
}

/** Apply a remembered choice immediately (before animations start). */
export function initPerfMode() {
  const m = remembered();
  if (m) apply(m);
}

/** Sample frame times once the page is idle; switch to lite if they're too slow. */
export function measurePerf() {
  if (remembered()) return;
  const times: number[] = [];
  let last = 0;
  let start = 0;
  const step = (t: number) => {
    if (document.hidden) return; // background tabs are throttled; don't judge them
    if (!start) start = t;
    if (last) times.push(t - last);
    last = t;
    if (t - start < 2500) {
      requestAnimationFrame(step);
      return;
    }
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 16;
    const slow = times.filter((x) => x > 50).length / Math.max(1, times.length);
    // Below ~36 fps typical, or a quarter of frames janky: go lite.
    const mode: Mode = median > 28 || slow > 0.25 ? "lite" : "full";
    store(mode);
    if (mode === "lite") apply("lite");
  };
  // Give the entrance animations a moment to finish so they don't skew the sample.
  setTimeout(() => requestAnimationFrame(step), 2600);
}

/** Pause looping animations inside sections that are off screen. */
export function pauseOffscreen(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("main > section, .side-nav"));
  if (!("IntersectionObserver" in window)) return () => {};
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) delete (e.target as HTMLElement).dataset["offscreen"];
        else (e.target as HTMLElement).dataset["offscreen"] = "true";
      }
    },
    { rootMargin: "200px 0px" },
  );
  els.filter((el) => !el.classList.contains("side-nav")).forEach((el) => io.observe(el));
  return () => io.disconnect();
}
