import { expect, it } from "vitest";
import json from "./default.json";
import { configSchema } from "./schema";

it("keeps older configs valid with empty music and thoughts defaults", () => {
  const { music, thoughts, holo, ...olderContent } = json.content;
  const result = configSchema.parse({ ...json, content: olderContent });
  expect(result.content.music).toEqual({ playlistUrl: "", playlistName: "", nowPlayingUrl: "", nowPlaying: null });
  expect(result.content.thoughts).toEqual([]);
  expect(result.content.holo).toEqual({ photoUrl: "/dray-profile.png", cutout: false, label: "Drayspo · ID", stamp: "KY · 2025", credential: "BSc CS · CAPM" });
});
