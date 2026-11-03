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
