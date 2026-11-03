import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type Box = { x: number; y: number; w: number; h: number };

/** Liquid droplet that flows behind the active `[data-goo-key]` item of `container`. */
export function GooIndicator({ container, activeKey, motion, hidden = false }: {
  container: RefObject<HTMLElement | null>; activeKey: string; motion: boolean; hidden?: boolean;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [instant, setInstant] = useState(true);
  const keyRef = useRef(activeKey);
  keyRef.current = activeKey;
  const frames = useRef<number[]>([]);

  const measure = (): Box | null => {
    const el = container.current?.querySelector<HTMLElement>(`[data-goo-key="${keyRef.current}"]`);
    return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
  };
  const snap = () => {
    frames.current.forEach(cancelAnimationFrame);
    setInstant(true);
    setBox(measure());
    const a = requestAnimationFrame(() => { frames.current = [requestAnimationFrame(() => setInstant(false))]; });
    frames.current = [a];
  };

  // Animate on key change (first placement snaps).
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!placed.current) { placed.current = true; snap(); return; }
    setBox(measure());
  }, [activeKey]);

  useLayoutEffect(() => {
    const c = container.current;
    if (!c) return;
    let first = true;
    const ro = new ResizeObserver(() => { if (first) { first = false; return; } snap(); });
    ro.observe(c);
    c.querySelectorAll("[data-goo-key]").forEach((n) => ro.observe(n));
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) snap(); });
    return () => { alive = false; ro.disconnect(); frames.current.forEach(cancelAnimationFrame); };
  }, [container]);

  const style = box ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` } : { opacity: 0 };
  return (
    <span className="goo-indicator" aria-hidden="true" data-motion={motion} data-instant={instant} data-hidden={hidden || !box}>
      <span className="goo-tail" style={style} />
      <span className="goo-head" style={style} />
    </span>
  );
}
