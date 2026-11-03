import type { SiteConfig } from "@/config/schema";
// A single post from the config.
export type Thought = SiteConfig["content"]["thoughts"][number];

// Orders posts newest first without mutating the source.
export function sortThoughts(posts: readonly Thought[]) {
  const time = (date: string) => {
    const value = Date.parse(date);
    return Number.isFinite(value) ? value : 0;
  };
  const all = [...posts].sort((a, b) => time(b.date) - time(a.date));
  return { latest: all[0] ?? null, previous: all[1] ?? null, all };
}

// Estimates reading time from word count.
export function thoughtReadMinutes(post: Thought) {
  return (
    post.readMinutes ??
    Math.max(1, Math.ceil(post.body.trim().split(/\s+/).filter(Boolean).length / 200))
  );
}

// Formats a post date for display.
export function thoughtDate(date: string) {
  const value = new Date(date);
  return Number.isFinite(value.getTime())
    ? value.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Undated";
}
