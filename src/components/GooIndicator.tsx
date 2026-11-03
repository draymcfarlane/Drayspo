import type React from "react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

// Position and size of the highlight relative to its container.
type Box = { x: number; y: number; w: number; h: number };

/** Liquid droplet that flows behind the active `[data-goo-key]` item of `container`. */
export function GooIndicator({ container, activeKey, motion, hidden = false, inset = 2, bobDelay }: {
  container: RefObject<HTMLElement | null>; activeKey: string; motion: boolean; hidden?: boolean; inset?: number; bobDelay?: string;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [instant, setInstant] = useState(true);
  const keyRef = useRef(activeKey);
  keyRef.current = activeKey;
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const frames = useRef<number[]>([]);
  const waits = useRef<number[]>([]);

  // The droplet sits inside the container's padding box, so measure both rects
  // (fractional) instead of integer offset* values, and shrink it by `inset` on
  // every side so it reads as a pill that sits inside its track, not on top of it.
  const measure = (): Box | null => {
    const c = container.current;
    const el = c?.querySelector<HTMLElement>(`[data-goo-key="${keyRef.current}"]`);
    if (!c || !el) return null;
    const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const i = insetRef.current;
    // Strip the item's own idle-bob transform so the droplet's matching bob isn't doubled.
    const t = getComputedStyle(el).transform;
    const bob = t && t !== "none" ? new DOMMatrixReadOnly(t).f : 0;
    const x = er.left - cr.left - (parseFloat(cs.borderLeftWidth) || 0) + i;
    const y = er.top - cr.top - (parseFloat(cs.borderTopWidth) || 0) + i - bob;
    return { x, y, w: Math.max(0, er.width - i * 2), h: Math.max(0, er.height - i * 2) };
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

  // This child's first layout effect can run before the parent's ref is attached,
  // so retry on the next frame until the container is there, then keep it aligned.
  useLayoutEffect(() => {
    let alive = true;
    let tries = 0;
    let ro: ResizeObserver | undefined;
    const setup = () => {
      if (!alive) return;
      const c = container.current;
      if (!c) {
        if (tries++ < 30) { const id = requestAnimationFrame(setup); waits.current.push(id); }
        return;
      }
      let first = true;
      ro = new ResizeObserver(() => { if (first) { first = false; return; } snap(); });
      ro.observe(c);
      c.querySelectorAll("[data-goo-key]").forEach((n) => ro?.observe(n));
      document.fonts?.ready.then(() => { if (alive) snap(); });
      snap();
    };
    setup();
    return () => {
      alive = false; ro?.disconnect();
      waits.current.forEach(cancelAnimationFrame); waits.current = [];
      frames.current.forEach(cancelAnimationFrame);
    };
  }, [container]);

  const style = box ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` } : { opacity: 0 };
  return (
    <span className="goo-indicator" aria-hidden="true" data-motion={motion} style={bobDelay ? ({ "--bob-delay": bobDelay } as React.CSSProperties) : undefined} data-instant={instant} data-hidden={hidden || !box}>
      <span className="goo-tail" style={style} />
      <span className="goo-head" style={style} />
    </span>
  );
}
