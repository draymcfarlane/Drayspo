/** Only official Apple Music HTTPS links can become embedded players. */
export function musicEmbedUrl(input: string): string {
  if (!input.trim()) return "";
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !["music.apple.com", "embed.music.apple.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return "";
    url.hostname = "embed.music.apple.com";
    return url.toString();
  } catch {
    return "";
  }
}

// Returns the link only if it is a trusted https music URL.
export function safeMusicLink(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

import { useEffect, useState } from "react";
import { z } from "zod";

// Shape of a now-playing payload, shared by config and the remote feed.
export const nowPlayingSchema = z.object({
  isPlaying: z.boolean(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  artworkUrl: z.string().optional(),
  url: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
export const NOW_PLAYING_MAX_AGE_MS = 15 * 60 * 1000;
export const NOW_PLAYING_POLL_MS = 60 * 1000;

/** Adds a unique time parameter so neither the browser nor a CDN can serve a cached feed. */
export function nowPlayingFeedUrl(url: string, now = Date.now()): string {
  try {
    const target = new URL(url);
    target.searchParams.set("t", String(now));
    return target.toString();
  } catch {
    return url;
  }
}

/** Remote data counts as playing only when flagged so and updated within the last 15 minutes. */
export function liveNowPlaying(data: unknown, now = Date.now()): NowPlaying | null {
  const parsed = nowPlayingSchema.safeParse(data);
  if (!parsed.success || !parsed.data.isPlaying || !parsed.data.updatedAt) return null;
  const at = Date.parse(parsed.data.updatedAt);
  if (Number.isNaN(at) || now - at > NOW_PLAYING_MAX_AGE_MS) return null;
  return parsed.data;
}

/** Polls the feed every minute while the tab is visible; falls back to config when no feed is set. */
export function useNowPlaying(url: string, fallback: NowPlaying | null): NowPlaying | null {
  const [remote, setRemote] = useState<NowPlaying | null>(null);
  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort(); controller = new AbortController();
      try {
        const res = await fetch(nowPlayingFeedUrl(url), { cache: "no-store", signal: controller.signal });
        setRemote(res.ok ? liveNowPlaying(await res.json()) : null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setRemote(null);
      }
    };
    const start = () => { if (timer) return; void load(); timer = setInterval(load, NOW_PLAYING_POLL_MS); };
    const stop = () => { clearInterval(timer); timer = undefined; controller?.abort(); };
    const sync = () => (document.hidden ? stop() : start());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { document.removeEventListener("visibilitychange", sync); stop(); };
  }, [url]);
  return url ? remote : fallback;
}
