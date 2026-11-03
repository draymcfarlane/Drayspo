import { useEffect, useRef, useState } from "react";
import { useConfig } from "@/config/ConfigProvider";
import { visibleSections } from "@/config/schema";
import { GooIndicator } from "@/components/GooIndicator";
import { useAppReady } from "@/lib/app-ready";
import { ChevronDown, Menu, X } from "lucide-react";

// Display labels for each section id.
const LABELS: Record<string, string> = { hero: "Home", about: "About", experience: "Experience", projects: "Projects", github: "GitHub", music: "Music", thoughts: "Thoughts", skills: "Skills", contact: "Contact" };

// The burger only exists on mobile (< 48rem); tablet and above always show the nav.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 47.999rem)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isMobile;
}

// Section navigation with scroll spy, a wave idle motion and a mobile-only menu.
export function SideNav() {
  const ready = useAppReady();
  const { config, intensity } = useConfig();
  const ids = visibleSections(config);
  const [active, setActive] = useState("hero");
  const [pill, setPill] = useState({ top: 0, h: 0, o: 0 });
  const drag = useRef<{ y: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const update = () => {
      const d = document.documentElement;
      const vh = window.innerHeight, total = d.scrollHeight;
      const h = Math.max(40, (vh / total) * vh);
      const max = total - vh;
      // Fade the pill out as it nears either end of its travel, so it never
      // quite reaches the top or bottom of the screen.
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const edge = Math.min(ratio, 1 - ratio);
      const o = Math.min(1, edge / 0.2);
      setPill({ h, top: max > 0 ? (window.scrollY / max) * (vh - h) : 0, o });
      // At the very bottom, the last section wins even if it's too short to reach the spy line.
      const last = ids.at(-1);
      if (window.scrollY + vh >= total - 8 && last) setActive(last);
    };
    let queued = 0;
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; update(); }); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(queued); window.removeEventListener("resize", update); };
  }, [ids.join()]);

  // Scroll spy: the section crossing a line ~40% down the viewport is active.
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: "-40% 0px -59% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids.join()]);

  const navRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    const on = () => setAtTop(window.scrollY < 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); if (isMobile) setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: intensity === 0 ? "auto" : "smooth" }); };

  return (
    <>
      <button
        type="button" className="nav-burger" aria-expanded={open} aria-controls="quick-links"
        aria-label={open ? "Close section menu" : "Open section menu"} onClick={() => setOpen((o) => !o)}
      >
        <span className="nav-burger-icon" data-shown={!open}><Menu aria-hidden="true" /></span>
        <span className="nav-burger-icon" data-shown={open}><X aria-hidden="true" /></span>
      </button>
      {ids.length > 1 && (
        <div className="scroll-cue md:hidden" data-hidden={!atTop} aria-hidden="true">
          <ChevronDown aria-hidden="true" />
        </div>
      )}
      <nav id="quick-links" ref={navRef} className="side-nav" aria-label="Quick links" data-motion={ready && intensity > 0} data-open={open} inert={isMobile && !open}>
        <GooIndicator container={navRef} activeKey={active} motion={ready && intensity > 0} bobDelay={`${-Math.max(0, (ids as string[]).indexOf(active)) * 0.35}s`} />
        {ids.map((id, i) => (
          <a
            key={id} data-goo-key={id} href={`#${id}`} onClick={go(id)} className="nav-bubble" data-active={active === id}
            aria-current={active === id ? "location" : undefined}
            style={{ ["--bob-delay" as string]: `${-i * 0.35}s` }}
          >
            {LABELS[id] ?? id}
          </a>
        ))}
      </nav>
      <div
        className="scroll-pill" aria-hidden="true" data-drag={dragging} data-hidden={dragging ? "false" : pill.o <= 0.01}
        style={{ height: pill.h, transform: `translateY(${pill.top}px)`, opacity: pill.o }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, s: window.scrollY }; setDragging(true); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const d = document.documentElement, vh = window.innerHeight;
          const ratio = (d.scrollHeight - vh) / Math.max(1, vh - pill.h);
          window.scrollTo(0, drag.current.s + (e.clientY - drag.current.y) * ratio);
        }}
        onPointerUp={() => { drag.current = null; setDragging(false); }}
      />
    </>
  );
}
