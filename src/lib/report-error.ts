// Client-side error reporter. Swap in a monitoring service here if you add one.
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[app error]", error, context);
}
