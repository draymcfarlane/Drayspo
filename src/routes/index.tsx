import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { ConfigProvider, useConfig, defaultConfig } from "@/config/ConfigProvider";
import { visibleSections, type SectionId } from "@/config/schema";
import { SideNav } from "@/components/SideNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiquidBackground } from "@/components/LiquidBackground";
import { About, Contact, DebugPanel, Experience, GitHub, GooeyDefs, Hero, Projects, Skills } from "@/components/Sections";
import { IntroScreen } from "@/components/IntroScreen";
import { markAppReady, useAppReady } from "@/lib/app-ready";
import { initPerfMode, measurePerf, pauseOffscreen } from "@/lib/perf";
import { resetToHome } from "@/lib/home-start";
import { Music } from "@/components/MusicSection";
import { Thoughts } from "@/components/ThoughtsSection";

// Default copy used for route metadata.
const c = defaultConfig.content;
// Keep this switch for a loader-free presentation.
const INTRO_ENABLED = true;
// Portfolio home route and its page metadata.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Drayspo" },
      { name: "description", content: c.tagline },
      { property: "og:title", content: "Drayspo" },
      { property: "og:description", content: c.tagline },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ConfigProvider>
      <Page />
    </ConfigProvider>
  ),
});

// Maps each configurable section id to its component.
const MAP: Record<SectionId, () => React.JSX.Element> = { hero: Hero, about: About, experience: Experience, projects: Projects, github: GitHub, music: Music, thoughts: Thoughts, skills: Skills, contact: Contact };

// Renders the configured sections and owns the smooth-scroll controller.
function Page() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  // A page load always opens on Home: no restored scroll position, no stale section hash.
  useLayoutEffect(() => { resetToHome(); }, []);
  useEffect(() => { if (ready) resetToHome(); }, [ready]);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => document.documentElement.classList.toggle("lq-motion", intensity > 0 && !mq.matches);
    sync(); mq.addEventListener("change", sync);
    return () => { mq.removeEventListener("change", sync); document.documentElement.classList.remove("lq-motion"); };
  }, [intensity]);
  useEffect(() => { if (!INTRO_ENABLED) markAppReady(); }, []);
  // Keep every browser smooth: remembered lite mode first, then pause off-screen loops
  // and measure real frame times once the entrance has played.
  useLayoutEffect(() => { initPerfMode(); }, []);
  useEffect(() => {
    if (!ready) return;
    const stop = pauseOffscreen();
    measurePerf();
    return stop;
  }, [ready]);
  const smooth = intensity > 0 && config.animation.enableParallax;
  useEffect(() => {
    if (!smooth) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | undefined;
    let raf = 0;
    (async () => {
      const Lenis = (await import("lenis")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      const l = new Lenis({ lerp: 0.1 });
      const scrollToSection = (event: Event) => {
        if (!(event instanceof CustomEvent) || !(event.detail instanceof HTMLElement)) return;
        // Line measurement and loaded images can grow the page after setup.
        l.resize();
        l.scrollTo(event.detail, { duration: 1.6 });
      };
      window.addEventListener("app:scroll-to-section", scrollToSection);
      const destroy = l.destroy.bind(l);
      l.destroy = () => { window.removeEventListener("app:scroll-to-section", scrollToSection); destroy(); };
      l.on("scroll", ScrollTrigger.update);
      lenis = l;
      const loop = (t: number) => { l.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    })();
    return () => { cancelAnimationFrame(raf); lenis?.destroy(); };
  }, [smooth]);

  return (
    <>
      {INTRO_ENABLED && <IntroScreen />}
      <GooeyDefs />
      <LiquidBackground />
      <a href="#main" className="skip-link">Skip to content</a>
      <main id="main" className="relative z-10 mx-auto max-w-6xl px-5 md:px-10 overflow-x-clip">
        {visibleSections(config).map((s) => { const C = MAP[s]; return <C key={s} />; })}
      </main>
      <ThemeToggle />
      <SideNav />
      <DebugPanel />
    </>
  );
}
