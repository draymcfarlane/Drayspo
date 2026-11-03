import { describe, expect, it, vi } from "vitest";
import { INTRO_MAX_MS, INTRO_MIN_MS, pourFrames, preloadProgress } from "./liquid";

describe("preload timing and progress", () => {
  it("keeps the loader minimum at 1.2 seconds", () => { expect(INTRO_MIN_MS).toBe(1200); });
  it("caps resource waiting at 8 seconds", () => { expect(INTRO_MAX_MS).toBe(8000); });
  it("uses settled resources rather than a looping estimate", () => {
    expect(preloadProgress(3, 12)).toBe(.25);
    expect(preloadProgress(12, 12)).toBe(1);
  });
});
describe("liquid wave", () => {
  it("generates 15 frames and ends beyond the top with no displacement", () => {
    const frames = pourFrames();
    expect(frames).toHaveLength(15);
    expect(frames.at(-1)?.['translate']).toBe("0 0px");
    expect(frames[0]?.['translate']).toBe("0 46px");
  });
});
describe("shared readiness", () => {
  it("settles rejected preloads and publishes readiness only once", async () => {
    vi.resetModules();
    const { registerPreload, preloadTasks, markAppReady } = await import("./app-ready");
    registerPreload(Promise.reject(new Error("unavailable")));
    expect(preloadTasks()).toHaveLength(1);
    await expect(Promise.all(preloadTasks())).resolves.toEqual([undefined]);
    const notified = vi.fn();
    window.addEventListener("app:intro-done", notified);
    markAppReady(); markAppReady();
    expect(notified).toHaveBeenCalledTimes(1);
    window.removeEventListener("app:intro-done", notified);
  });
});