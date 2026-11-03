import { useSyncExternalStore } from "react";

let ready = false;
// Pending preload work and readiness subscribers.
const tasks: Promise<unknown>[] = [];
const listeners = new Set<() => void>();

/** Register synchronously; failed resources settle rather than trapping the intro. */
export function registerPreload<T>(promise: Promise<T>): Promise<T | undefined> {
  const settled = promise.catch(() => undefined);
  if (!ready) tasks.push(settled);
  return settled;
}
// Snapshot of registered preload tasks.
export function preloadTasks() { return [...tasks]; }
// Flags the app as ready and notifies subscribers once.
export function markAppReady() {
  if (ready || typeof document === "undefined") return;
  ready = true;
  document.documentElement.classList.add("lq-ready");
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event("app:intro-done"));
}
// Store subscription used by the readiness hook.
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
// Returns true once the intro has finished and entrances may start.
export function useAppReady() {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}