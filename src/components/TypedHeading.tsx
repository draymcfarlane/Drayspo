import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useConfig } from "@/config/ConfigProvider";
import { useAppReady } from "@/lib/app-ready";

/** Type once on first view after loading, reserving the complete heading's space. */
export function TypedHeading({ id, text, className = "section-title" }: { id?: string; text: string; className?: string }) {
  const { intensity } = useConfig();
  const ready = useAppReady();
  const hydrated = useHydrated();
  const ref = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const [count, setCount] = useState(text.length);
  const motion = hydrated && intensity > 0;
  useLayoutEffect(() => {
    if (motion && !started.current) setCount(0);
  }, [motion, text]);
  useEffect(() => {
    if (!motion || !ready || started.current) return;
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();
      let position = 0;
      timer = setInterval(() => {
        position += 1; setCount(position);
        if (position >= text.length) clearInterval(timer);
      }, 70);
    }, { rootMargin: "0px 0px -15% 0px" });
    observer.observe(el);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [motion, ready, text]);
  return <h2 id={id} ref={ref} className={`${className} typed-heading`} aria-label={text}>
    <span className="typed-heading-size" aria-hidden="true">{text}<span className="notebook-caret">|</span></span>
    <span className="typed-heading-content" aria-hidden="true">{motion ? text.slice(0, count) : text}<span className="notebook-caret">|</span></span>
  </h2>;
}
