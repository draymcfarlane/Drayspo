import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetToHome } from "./home-start";

const scrollTo = vi.fn();
Object.defineProperty(window, "scrollTo", { writable: true, value: scrollTo });

function visit(hash: string) {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
}

describe("A page load starts on Home", () => {
  beforeEach(() => {
    scrollTo.mockClear();
    visit("");
  });

  it("drops the stale section hash and parks the viewport at the top", () => {
    visit("#contact");

    resetToHome();

    expect(window.location.hash).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("keeps a shared thought deep link and leaves its scroll alone", () => {
    visit("#thoughts/deep-work");

    resetToHome();

    expect(window.location.hash).toBe("#thoughts/deep-work");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("turns off the browser's own scroll restore", () => {
    resetToHome();

    expect(window.history.scrollRestoration).toBe("manual");
  });
});
