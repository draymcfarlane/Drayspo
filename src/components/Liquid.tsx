import { createContext, createElement, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useConfig } from "@/config/ConfigProvider";
import { useAppReady } from "@/lib/app-ready";
import { pourFrames } from "@/lib/liquid";

// Carries reveal state and stagger offset down to nested liquid elements.
const Sequence = createContext({ shown: true, base: 0 });
// Shared props for the polymorphic liquid primitives.
type Props = HTMLAttributes<HTMLElement> & { as?: ElementType; index?: number; delay?: number; children?: ReactNode };
// Reports whether liquid motion should run for the current settings.
export function useLiquidMotion() {
  const { intensity } = useConfig();
  return useHydrated() && intensity > 0;
}
// Reveals an element once when it first enters the viewport after the app is ready.
function useReveal() {
  const ref = useRef<HTMLElement>(null);
  const ready = useAppReady();
  const motion = useLiquidMotion();
  const parent = useContext(Sequence);
  const [entered, setEntered] = useState(false);
  const played = useRef(false);
  const shown = ready && (!motion || played.current || (parent.shown && entered));
  useEffect(() => {
    const el = ref.current;
    if (!el || entered) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setEntered(true); observer.disconnect(); }
    }, { rootMargin: "0px 0px -12% 0px" });
    // A fully clipped pouring block has no intersection area yet. Its layout
    // rectangle remains stable, so also check it without the animated clipping.
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * .88 && rect.bottom > 0) {
        setEntered(true); observer.disconnect();
      }
    };
    check();
    observer.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { observer.disconnect(); window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [entered]);
  useEffect(() => { if (ready && shown) played.current = true; }, [ready, shown]);
  return { ref, shown, motion, base: parent.base };
}
// Groups children so their reveals share one trigger and stagger.
export function LiquidGroup({ as = "div", delay = 0, children, ...rest }: Props) {
  const { ref, shown, base } = useReveal();
  return createElement(as, { ...rest, ref },
    <Sequence.Provider value={{ shown, base: base + delay }}>{children}</Sequence.Provider>);
}
// Single measured line of liquid text.
function TextLine({ children, delay }: { children: ReactNode; delay: number }) {
  const { ref, shown } = useReveal();
  return <span ref={ref} className="lq-line" data-shown={shown} style={{ transitionDelay: `${delay}ms` }}>
    <span className="lq-line-in" style={{ transitionDelay: `${delay}ms` }}>{children}</span>
  </span>;
}
// Splits text into measured lines and reveals them in sequence without resetting on reflow.
export function LiquidText({ as = "p", text, className, id, delay = 0, stagger = 90, children }: {
  as?: ElementType; text: string; className?: string; id?: string | undefined; delay?: number; stagger?: number; children?: ReactNode;
}) {
  const motion = useLiquidMotion();
  const { base } = useContext(Sequence);
  const root = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const words = text.match(/\S+\s*/g) ?? [text];
  useLayoutEffect(() => {
    if (!motion) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      if (!alive || !measureRef.current) return;
      const result: string[] = [];
      let top: number | undefined;
      measureRef.current.querySelectorAll<HTMLElement>("[data-w]").forEach((word) => {
        if (top === undefined || word.offsetTop !== top) { result.push(""); top = word.offsetTop; }
        const last = result.length - 1;
        result[last] = (result[last] ?? "") + word.textContent;
      });
      setLines((old) => JSON.stringify(old) === JSON.stringify(result) ? old : result);
    };
    measure();
    document.fonts?.ready.then(measure);
    let width = root.current?.getBoundingClientRect().width;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      clearTimeout(timer); timer = setTimeout(measure, 150);
    });
    if (root.current) ro.observe(root.current);
    return () => { alive = false; clearTimeout(timer); ro.disconnect(); };
  }, [text, motion]);
  if (!motion) return createElement(as, { id, className }, text, children);
  return createElement(as, { id, className: `${className ?? ""} lq-text`, ref: root, "aria-label": text },
    <span className="lq-measure" ref={measureRef} aria-hidden="true">{words.map((word, i) => <span data-w key={i}>{word}</span>)}</span>,
    <span aria-hidden="true">{(lines ?? [text]).map((line, i) =>
      <TextLine key={i} delay={base + delay + i * stagger}>{line.trimEnd()}{i === (lines?.length ?? 1) - 1 && children}</TextLine>)}</span>);
}
// Reveals one line of content with a staggered delay.
export function LiquidLine({ as = "div", index = 0, className, innerClassName, children, ...rest }: Props & { innerClassName?: string }) {
  const { ref, shown, base } = useReveal();
  return createElement(as, { ...rest, ref, className: `${className ?? ""} lq-line`, "data-shown": shown },
    <span className={`lq-line-in ${innerClassName ?? ""}`} style={{ transitionDelay: `${base + index * 90}ms` }}>{children}</span>);
}
// Pours a block into view and drops its clipping once the animation finishes.
export function LiquidBlock({ as = "div", index = 0, delay = 0, children, ...rest }: Props) {
  const { ref, shown, motion, base } = useReveal();
  const { intensity } = useConfig();
  const [poured, setPoured] = useState(false);
  const start = base + delay + index * 130;
  useEffect(() => {
    const el = ref.current;
    if (!motion || poured || !shown || !el) return;
    const animation = el.animate(pourFrames(intensity), {
      duration: 1150, easing: "cubic-bezier(.3,.6,.2,1)", delay: start, fill: "both",
    });
    animation.onfinish = () => { el.dataset['poured'] = "true"; setPoured(true); animation.cancel(); };
    return () => animation.cancel();
  }, [shown, motion, poured, start, intensity]);
  return createElement(as, { ...rest, ref, "data-lq-block": "", "data-poured": !motion || poured ? "true" : undefined },
    <Sequence.Provider value={{ shown, base: start + 260 }}>{children}</Sequence.Provider>);
}
// Small inline element that drops into place as part of a sequence.
export function LiquidDrop({ as = "span", index = 0, className, style, children, ...rest }: Props) {
  const { ref, shown, base } = useReveal();
  return createElement(as, { ...rest, ref, className: `${className ?? ""} lq-drop`, "data-shown": shown,
    style: { ...style, transitionDelay: `${base + index * 55}ms` } as CSSProperties }, children);
}