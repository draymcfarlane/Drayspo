import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useConfig } from "@/config/ConfigProvider";
import { markAppReady, preloadTasks, useAppReady } from "@/lib/app-ready";
import { INTRO_MAX_MS, INTRO_MIN_MS, preloadProgress } from "@/lib/liquid";

// Resolves once an image is fully decoded, never rejecting.
function decodeImage(url: string) {
  if (!url) return Promise.resolve();
  const image = new Image(); image.src = url;
  return image.decode().catch(() => undefined);
}
// Loading overlay that reports real preload progress and hands the name off to the hero.
export function IntroScreen() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const hydrated = useHydrated();
  const initial = useRef({ config, intensity });
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [hidden, setHidden] = useState(ready);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let frame = 0;
    let cap: ReturnType<typeof setTimeout> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const animations: Animation[] = [];
    let removeLoad = () => {};
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms); timers.add(timer);
    });
    const start = performance.now();
    const run = async () => {
      const { config: cfg, intensity: amount } = initial.current;
      const fonts = Object.values(cfg.theme.fonts).flatMap((font) => [400, 500, 700].map((weight) =>
        document.fonts?.load(`${weight} 16px "${font}"`) ?? Promise.resolve()));
      const images = [...document.images].map((image) => image.currentSrc || image.src);
      images.push(cfg.content.holo.photoUrl);
      if (cfg.content.music.nowPlaying?.isPlaying && cfg.content.music.nowPlaying.artworkUrl)
        images.push(cfg.content.music.nowPlaying.artworkUrl);
      const loaded = new Promise<void>((resolve) => {
        if (document.readyState === "complete") resolve();
        else {
          window.addEventListener("load", resolveLoad, { once: true });
          removeLoad = () => window.removeEventListener("load", resolveLoad);
          function resolveLoad() { resolve(); }
        }
      });
      const tasks = [...fonts, document.fonts?.ready ?? Promise.resolve(),
        ...[...new Set(images)].map(decodeImage), loaded, ...preloadTasks()];
      let settled = 0;
      const all = Promise.all(tasks.map((task) => Promise.resolve(task).catch(() => undefined).then(() => {
        settled += 1;
        if (!cancelled) setProgress(preloadProgress(settled, tasks.length));
      })));
      await Promise.race([all, new Promise<void>((resolve) => { cap = setTimeout(resolve, INTRO_MAX_MS - (performance.now() - start)); })]);
      clearTimeout(cap);
      await wait(Math.max(0, INTRO_MIN_MS - (performance.now() - start)));
      if (cancelled) return;
      setLeaving(true);
      const source = [...(root.current?.querySelectorAll<HTMLElement>("[data-intro-word]") ?? [])];
      const heading = document.querySelector<HTMLElement>(".hero-name");
      const target = [...(heading?.querySelectorAll<HTMLElement>("[data-name-word]") ?? [])];
      const rect = heading?.getBoundingClientRect();
      const glide = amount > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        rect && rect.top < window.innerHeight && rect.bottom > 0 && source.length > 0 && source.length === target.length;
      if (glide) {
        await Promise.all(source.map(async (word, i) => {
          const destination = target[i];
          if (!destination) return;
          const s = word.getBoundingClientRect(), t = destination.getBoundingClientRect();
          const scale = parseFloat(getComputedStyle(destination).fontSize) / parseFloat(getComputedStyle(word).fontSize);
          const animation = word.animate([
            { transform: "translate(0,0) scale(1)" },
            { transform: `translate(${t.left - s.left}px,${t.top - s.top}px) scale(${scale})` },
          ], { duration: 1050, easing: "cubic-bezier(.7,0,.18,1)", delay: 120 + i * 70, fill: "forwards" });
          animations.push(animation);
          await animation.finished.catch(() => undefined);
        }));
      } else {
        root.current?.setAttribute("data-skip", "true");
        await wait(amount > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 450 : 0);
      }
      if (cancelled) return;
      markAppReady();
      // Notify React before removing the landed words, so the real heading replaces them without a gap.
      frame = requestAnimationFrame(() => { if (!cancelled) setHidden(true); });
    };
    frame = requestAnimationFrame(() => { void run(); });
    return () => {
      cancelled = true; cancelAnimationFrame(frame); clearTimeout(cap); removeLoad();
      timers.forEach(clearTimeout); animations.forEach((animation) => animation.cancel());
    };
  }, []);
  if (hidden || !hydrated) return null;
  return <div ref={root} className="intro-screen" data-leaving={leaving} role="status" aria-label={`Loading ${Math.round(progress * 100)}%`}>
    <div className="intro-backdrop" />
    <div className="intro-content">
      <p className="intro-mark">{config.content.name.split(/\s+/).map((word, i, words) =>
        <span data-intro-word key={i}>{word}{i < words.length - 1 ? " " : ""}</span>)}</p>
      <div className="intro-progress"><div className="intro-bar"><span style={{ transform: `scaleX(${progress})` }} /></div>
        <p className="intro-percent">{Math.round(progress * 100)}%</p></div>
    </div>
  </div>;
}