import { useEffect, useRef, useState } from "react";
import { useConfig } from "@/config/ConfigProvider";
import { visibleSections } from "@/config/schema";
import { GooIndicator } from "@/components/GooIndicator";

const LABELS: Record<string, string> = { hero: "Home", about: "About", experience: "Experience", projects: "Projects", github: "GitHub", skills: "Skills", contact: "Contact" };

export function SideNav({ introEnabled = true }: { introEnabled?: boolean }) {
  const { config, intensity } = useConfig();
  const ids = visibleSections(config);
  const [active, setActive] = useState("hero");
  const [pill, setPill] = useState({ top: 0, h: 0, o: 0 });
  const drag = useRef<{ y: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [heroBubbleReady, setHeroBubbleReady] = useState(!introEnabled);

  // After the intro finishes, fly a clone of the hero name over to the "Home" bubble.
  useEffect(() => {
    if (!introEnabled || !intensity || window.innerWidth < 768 || !ids.includes("hero")) { setHeroBubbleReady(true); return; }
    let clone: HTMLElement | null = null;
    let delay: ReturnType<typeof setTimeout> | undefined;
    const fly = () => {
      const hero = document.querySelector<HTMLElement>(".hero-name");
      const target = document.querySelector<HTMLElement>('[data-flight-target="hero"]');
      if (!hero || !target) { setHeroBubbleReady(true); return; }
      const h = hero.getBoundingClientRect(), t = target.getBoundingClientRect();
      clone = document.createElement("div");
      clone.className = "hero-name hero-name-flight";
      clone.textContent = config.content.name;
      clone.style.left = `${h.left}px`;
      clone.style.top = `${h.top}px`;
      clone.style.width = `${h.width}px`;
      clone.style.fontSize = getComputedStyle(hero).fontSize;
      document.body.appendChild(clone);
      const scale = Math.max(0.1, t.height / h.height);
      const dx = t.left + t.width / 2 - (h.left + h.width / 2);
      const dy = t.top + t.height / 2 - (h.top + h.height / 2);
      const anim = clone.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(0.22)`, opacity: 0.85, offset: 0.42 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.5, offset: 1 },
        ],
        { duration: 900, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" },
      );
      anim.onfinish = () => { clone?.remove(); clone = null; setHeroBubbleReady(true); };
    };
    const onIntro = () => { delay = setTimeout(fly, 450); };
    window.addEventListener("app:intro-done", onIntro, { once: true });
    const cap = setTimeout(onIntro, 5000);
    return () => { window.removeEventListener("app:intro-done", onIntro); clearTimeout(cap); if (delay) clearTimeout(delay); clone?.remove(); };
  }, [introEnabled, intensity, config.content.name, ids.join()]);

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
      if (window.scrollY + vh >= total - 8 && ids.length) setActive(ids[ids.length - 1]!);
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

  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: intensity === 0 ? "auto" : "smooth" }); };

  return (
    <>
      <nav ref={navRef} className="side-nav hidden md:flex" aria-label="Quick links" data-motion={intensity > 0}>
        <GooIndicator container={navRef} activeKey={active} motion={intensity > 0} hidden={active === "hero" && !heroBubbleReady} />
        {ids.map((id) => (
          <a
            key={id} data-goo-key={id} href={`#${id}`} onClick={go(id)} className="nav-bubble" data-active={active === id}
            aria-current={active === id ? "location" : undefined}
            data-flight-target={id === "hero" ? "hero" : undefined}
            style={{ visibility: id === "hero" && !heroBubbleReady ? "hidden" : undefined }}
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
