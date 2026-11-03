import { describe, expect, it } from "vitest";
import { musicEmbedUrl } from "./music";
describe("Apple Music embeds", () => {
  it("converts the official host and preserves path and query", () => {
    expect(musicEmbedUrl("https://music.apple.com/ky/playlist/rotation/pl.123?l=en")).toBe(
      "https://embed.music.apple.com/ky/playlist/rotation/pl.123?l=en",
    );
  });
  it("returns empty for empty input", () => {
    expect(musicEmbedUrl("")).toBe("");
  });
  it("rejects non-Apple and insecure URLs", () => {
    expect(musicEmbedUrl("https://example.com/playlist")).toBe("");
    expect(musicEmbedUrl("http://music.apple.com/playlist")).toBe("");
  });
});

import { liveNowPlaying } from "./music";
describe("now playing staleness", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const track = { isPlaying: true, title: "Song", artist: "Artist" };
  it("keeps a track updated 15 minutes ago", () => {
    expect(liveNowPlaying({ ...track, updatedAt: "2026-11-03T11:45:00Z" }, now)?.title).toBe("Song");
  });
  it("drops a track updated more than 15 minutes ago", () => {
    expect(liveNowPlaying({ ...track, updatedAt: "2026-11-03T11:44:59Z" }, now)).toBeNull();
  });
  it("drops paused, undated or malformed data", () => {
    expect(liveNowPlaying({ ...track, isPlaying: false, updatedAt: "2026-11-03T11:59:00Z" }, now)).toBeNull();
    expect(liveNowPlaying(track, now)).toBeNull();
    expect(liveNowPlaying({ nope: 1 }, now)).toBeNull();
  });
});

import { nowPlayingFeedUrl } from "./music";
describe("now playing feed requests", () => {
  it("adds a time parameter that changes on every call", () => {
    const first = nowPlayingFeedUrl("https://example.com/now.json", 1);
    expect(new URL(first).searchParams.get("t")).toBe("1");
    expect(first).not.toBe(nowPlayingFeedUrl("https://example.com/now.json", 2));
  });
  it("keeps existing query parameters and replaces a stale time parameter", () => {
    const url = nowPlayingFeedUrl("https://example.com/now.json?t=1&user=dray", 500);
    const params = new URL(url).searchParams;
    expect(params.get("t")).toBe("500");
    expect(params.get("user")).toBe("dray");
    expect(new URL(url).searchParams.getAll("t")).toEqual(["500"]);
  });
  it("leaves an unusable feed address untouched", () => {
    expect(nowPlayingFeedUrl("not a url")).toBe("not a url");
  });
});
