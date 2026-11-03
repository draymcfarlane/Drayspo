import { describe, expect, it } from "vitest";
import { sortThoughts, type Thought } from "./thoughts";
const post = (id: string, date: string): Thought => ({
  id,
  date,
  title: id,
  excerpt: "",
  body: "",
});
describe("Thought order", () => {
  it("handles zero posts", () => {
    expect(sortThoughts([])).toEqual({ latest: null, previous: null, all: [] });
  });
  it("handles one post", () => {
    const p = post("one", "2026-01-01");
    expect(sortThoughts([p])).toEqual({ latest: p, previous: null, all: [p] });
  });
  it("returns newest first, latest and previous without mutating three posts", () => {
    const posts = [
      post("old", "2025-01-01"),
      post("new", "2026-11-03"),
      post("middle", "2026-06-01"),
    ];
    const result = sortThoughts(posts);
    expect(result.all.map((p) => p.id)).toEqual(["new", "middle", "old"]);
    expect(result.latest?.id).toBe("new");
    expect(result.previous?.id).toBe("middle");
    expect(posts[0]?.id).toBe("old");
  });
});
