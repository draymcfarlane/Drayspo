import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNowPlaying } from "./music";

// Minimal stand-in for a feed response, so the hook never needs the network.
type FeedResponse = { ok: boolean; json: () => Promise<unknown> };

// Builds a fetch stub that answers every request with the same payload.
function feedReturning(payload: unknown) {
  return vi.fn(
    async (_input: string, _init?: RequestInit): Promise<FeedResponse> => ({
      ok: true,
      json: async () => payload,
    }),
  );
}

// Renders the hook's answer so assertions can read it.
function Probe({ url }: { url: string }) {
  const np = useNowPlaying(url, null);
  return <span data-testid="np">{np ? np.title : "silent"}</span>;
}

/** Returns a feed payload updated moments ago. */
function freshTrack() {
  return {
    isPlaying: true,
    title: "Song",
    artist: "Artist",
    updatedAt: new Date().toISOString(),
  };
}

// Points the document's hidden flag at a chosen value.
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

describe("now playing feed polling", () => {
  beforeEach(() => {
    setHidden(false);
  });

  afterEach(() => {
    setHidden(false);
    vi.unstubAllGlobals();
  });

  it("requests the feed with a fresh time parameter and no caching", async () => {
    const fetchMock = feedReturning(freshTrack());
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe url="https://feed.example/now.json" />);

    await waitFor(() => expect(screen.getByTestId("np")).toHaveTextContent("Song"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const href = String(fetchMock.mock.calls[0]?.[0] ?? "");
    const init = fetchMock.mock.calls[0]?.[1] ?? {};
    const target = new URL(href);
    expect(target.pathname).toBe("/now.json");
    expect(target.searchParams.get("t")).toMatch(/^\d+$/);
    expect(init).toMatchObject({ cache: "no-store" });
  });

  it("waits while the tab is hidden and refetches as soon as it is visible", async () => {
    const fetchMock = feedReturning(freshTrack());
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe url="https://feed.example/now.json" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows nothing when the feed reports a stale track or fails", async () => {
    const stale = {
      isPlaying: true,
      title: "Old Song",
      artist: "Artist",
      updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    };
    const fetchMock = feedReturning(stale);
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe url="https://feed.example/now.json" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("np")).toHaveTextContent("silent"));

    fetchMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("np")).toHaveTextContent("silent");
  });
});
