/**
 * Hashes that carry their own destination. A shared thought opens that thought;
 * every other hash is a leftover from a previous visit and is dropped on load.
 */
const DEEP_LINK = /^#thoughts(\/|$)/;

/**
 * A page load always opens on Home: the browser's own scroll restore is turned
 * off, a stale section hash is dropped from the address bar, and the viewport is
 * parked at the top. A deliberate thought deep link keeps its destination.
 */
export function resetToHome() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // Older engines without the property: the explicit scroll below still applies.
  }
  const hash = window.location.hash;
  if (hash && !DEEP_LINK.test(hash)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  if (DEEP_LINK.test(hash)) return;
  window.scrollTo(0, 0);
}
