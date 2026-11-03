import { useEffect, useRef, useState } from "react";
import { useConfig } from "@/config/ConfigProvider";
import { visibleSections } from "@/config/schema";

const LABELS: Record<string, string> = { hero: "Home", about: "About", experience: "Experience", projects: "Projects", github: "GitHub", skills: "Skills", contact: "Contact" };

export function SideNav() {
  const { config } = useConfig();
  const ids = visibleSections(config);
  const [active, setActive] = useState("hero");
  const [pill, setPill] = useState({ top: 0, h: 0 });
  const drag = useRef<{ y: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const update = () => {
      const d = document.documentElement;
      const vh = window.innerHeight, total = d.scrollHeight;
      const h = Math.max(40, (vh / total) * vh);
      const max = total - vh;
      setPill({ h, top: max > 0 ? (window.scrollY / max) * (vh - h) : 0 });
      let cur = ids[0] ?? "hero";
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < vh * 0.4) cur = id; }
      if (window.scrollY + vh >= total - 8 && ids.length) cur = ids[ids.length - 1]!;
      setActive((a) => (a === cur ? a : cur));
    };
    let queued = 0;
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; update(); }); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(queued); window.removeEventListener("resize", update); };
  }, [ids.join()]);

  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <>
      <nav className="side-nav hidden md:flex" aria-label="Quick links">
        {ids.map((id, i) => (
          <a key={id} href={`#${id}`} onClick={go(id)} className="nav-bubble" data-active={active === id} style={{ animationDelay: `${i * 0.35}s` }}>
            {LABELS[id] ?? id}
          </a>
        ))}
      </nav>
      <div
        className="scroll-pill" aria-hidden="true" data-drag={dragging}
        style={{ height: pill.h, transform: `translateY(${pill.top}px)` }}
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
