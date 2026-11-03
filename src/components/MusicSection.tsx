import { LiquidBlock, LiquidText } from "./Liquid";
import { useAppReady } from "@/lib/app-ready";
import { TypedHeading } from "./TypedHeading";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Music2 } from "lucide-react";
import { useConfig } from "@/config/ConfigProvider";
import { Button } from "@/components/ui/button";
import { musicEmbedUrl, safeMusicLink, useNowPlaying } from "@/lib/music";

// Vinyl-styled playlist section with a safe embed and outbound link.
export function Music() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const music = config.content.music;
  const np = useNowPlaying(music.nowPlayingUrl, music.nowPlaying),
    playing = Boolean(np?.isPlaying);
  const
    embed = musicEmbedUrl(music.playlistUrl);
  const artwork = playing ? safeMusicLink(np?.artworkUrl) : undefined;
  const trackUrl = safeMusicLink(np?.url);
  return (
    <section
      id="music"
      className="section personal-section"
      aria-labelledby="music-h"
      data-motion={ready && intensity > 0}
    >
      <LiquidText className="eyebrow mb-3" text="Music" />
      <TypedHeading id="music-h" text="On rotation" />
      <div className="music-layout">
        <LiquidBlock className="vinyl-player" data-playing={playing}>
          <div className="turntable">
            <div className="vinyl-record">
              <div className="record-label">
                <AnimatePresence>
                  {artwork && (
                    <motion.img
                      key={artwork}
                      src={artwork}
                      alt={np?.album ? `${np.album} artwork` : "Album artwork"}
                      initial={false}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: intensity ? 0.5 : 0 }}
                    />
                  )}
                </AnimatePresence>
                <span className="spindle" />
              </div>
            </div>
            <motion.svg
              className="tonearm"
              viewBox="0 0 160 220"
              aria-hidden="true"
              animate={{ rotate: ready && playing ? 23 : -19 }}
              transition={
                ready && intensity ? { type: "spring", stiffness: 75, damping: 15 } : { duration: 0 }
              }
            >
              <circle cx="125" cy="25" r="16" />
              <path d="M125 25 L125 120 L65 182" />
              <rect x="49" y="176" width="30" height="18" rx="4" transform="rotate(-42 64 185)" />
            </motion.svg>
          </div>
          <div className="player-status">
            <div className="equalizer" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <p className="eyebrow">{playing ? "Currently listening" : "Not listening right now"}</p>
          </div>
          {playing && np ? (
            <>
              <h3 className="font-heading text-2xl font-bold">
                {trackUrl ? (
                  <a className="link" href={trackUrl} target="_blank" rel="noopener noreferrer">
                    {np.title}
                  </a>
                ) : (
                  np.title
                )}
              </h3>
              <p className="text-muted-foreground mt-2">{np.artist} · Apple Music</p>
            </>
          ) : (
            <p className="text-muted-foreground">Check back later to see what’s playing.</p>
          )}
        </LiquidBlock>
        <LiquidBlock index={1} className="playlist-panel">
          <div className="playlist-header">
            <div className="playlist-cover">
              <Music2 aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">My playlist</p>
              <h3 className="font-heading text-xl font-bold mt-1">
                {embed ? music.playlistName || "On rotation" : "Playlist coming soon"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">Curated by Dray · Apple Music</p>
            </div>
          </div>
          {embed ? (
            <>
              <Button asChild className="liquid-btn playlist-link">
                <a href={music.playlistUrl} target="_blank" rel="noopener noreferrer">
                  Listen on Apple Music
                  <ArrowUpRight />
                </a>
              </Button>
              <iframe
                className="music-embed"
                src={embed}
                title="Dray's Apple Music playlist"
                loading="lazy"
                allow="autoplay *; encrypted-media *; clipboard-write"
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
              />
            </>
          ) : (
            <div className="playlist-skeleton" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton-row" key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <i className="skeleton-art shimmer" />
                  <div>
                    <i className="shimmer" />
                    <i className="shimmer" />
                  </div>
                  <i className="skeleton-duration shimmer" />
                </div>
              ))}
            </div>
          )}
        </LiquidBlock>
      </div>
    </section>
  );
}
