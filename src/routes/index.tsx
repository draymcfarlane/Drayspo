import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConfigProvider, useConfig, defaultConfig } from "@/config/ConfigProvider";
import { visibleSections, type SectionId } from "@/config/schema";
import { SideNav } from "@/components/SideNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiquidBackground } from "@/components/LiquidBackground";
import { About, Contact, DebugPanel, Experience, GitHub, GooeyDefs, Hero, IntroScreen, Projects, Skills } from "@/components/Sections";

const c = defaultConfig.content;
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${c.name} — ${c.title}` },
      { name: "description", content: c.tagline },
      { property: "og:title", content: `${c.name} — ${c.title}` },
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

const MAP: Record<SectionId, () => React.JSX.Element> = { hero: Hero, about: About, experience: Experience, projects: Projects, github: GitHub, skills: Skills, contact: Contact };

function Page() {
  const { config, intensity } = useConfig();
  const smooth = intensity > 0 && config.animation.enableParallax;
  useEffect(() => {
    if (!smooth) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | undefined;
    let raf = 0;
    (async () => {
      const Lenis = (await import("lenis")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      const l = new Lenis({ lerp: 0.1 });
      l.on("scroll", ScrollTrigger.update);
      lenis = l;
      const loop = (t: number) => { l.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    })();
    return () => { cancelAnimationFrame(raf); lenis?.destroy(); };
  }, [smooth]);

  return (
    <>
      <IntroScreen />
      <GooeyDefs />
      <LiquidBackground />
      <a href="#main" className="skip-link">Skip to content</a>
      <main id="main" className="relative z-10 mx-auto max-w-6xl px-5 md:px-10">
        {visibleSections(config).map((s) => { const C = MAP[s]; return <C key={s} />; })}
      </main>
      <ThemeToggle />
      <SideNav />
      <DebugPanel />
    </>
  );
}
