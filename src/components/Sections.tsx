import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConfig } from "@/config/ConfigProvider";
import { findResumeLink } from "@/config/schema";
import { ResumeButton } from "@/components/ResumeButton";
const photo = { url: "/dray-profile.png" };
import { GitHubActivity } from "@/components/GitHubActivity";

export function GooeyDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <filter id="wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3">
            <animate attributeName="baseFrequency" dur="6s" values="0.012;0.02;0.012" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
      </defs>
    </svg>
  );
}

function Section({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  const { intensity } = useConfig();
  return (
    <section id={id} aria-labelledby={title ? `${id}-h` : undefined} className="section">
      {title && (
        <motion.h2
          id={`${id}-h`}
          className="section-title"
          initial={intensity ? { opacity: 0, y: 24 * intensity } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6 }}
        >
          {title}
        </motion.h2>
      )}
      {children}
    </section>
  );
}

export function Hero() {
  const { config, intensity } = useConfig();
  const c = config.content;
  const resume = findResumeLink(config);
  return (
    <section id="hero" className="section min-h-[92svh] justify-center" aria-label="Introduction">
      <motion.div className="hero-photo mb-6" initial={intensity ? { opacity: 0, scale: 0.8 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }}>
        <img src={photo.url} alt={`Portrait of ${c.name}`} width={176} height={176} decoding="async" fetchPriority="high" />
      </motion.div>
      <p className="eyebrow">{c.location}</p>
      <h1 className="hero-name">{c.name}</h1>
      <motion.p className="hero-title" initial={intensity ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }}>
        {c.title}
      </motion.p>
      <p className="hero-tagline">{c.tagline}</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <a href="#contact" className="liquid-btn"><span>Get in touch</span></a>
        {resume && <ResumeButton url={resume.url} name={c.name} />}
      </div>
    </section>
  );
}

export function About() {
  const { config, intensity } = useConfig();
  const words = config.content.about.split(" ");
  return (
    <Section id="about" title="About">
      <p className="about-text">
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="inline-block mr-[0.28em]"
            initial={intensity ? { opacity: 0.15, filter: `blur(${6 * intensity}px)` } : false}
            whileInView={{ opacity: 1, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.5, delay: Math.min(i * 0.012, 1) }}
          >
            {w}
          </motion.span>
        ))}
      </p>
    </Section>
  );
}

export function Experience() {
  const { config, intensity } = useConfig();
  const line = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!line.current || !wrap.current) return;
    if (!intensity) { line.current.style.transform = "scaleY(1)"; return; }
    let ctx: { revert: () => void } | undefined;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.fromTo(line.current, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: wrap.current, start: "top 75%", end: "bottom 60%", scrub: true } });
      });
    })();
    return () => ctx?.revert();
  }, [intensity, config.content.experience.length]);
  return (
    <Section id="experience" title="Experience">
      <ol ref={wrap} className="relative pl-8 md:pl-12">
        <div className="timeline-track" aria-hidden="true"><div ref={line} className="timeline-line" /></div>
        {config.content.experience.map((e, i) => (
          <motion.li
            key={i}
            className="relative pb-12 last:pb-0"
            initial={intensity ? { opacity: 0, x: 30 * intensity } : false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6 }}
          >
            <span className="timeline-dot" aria-hidden="true" />
            <p className="eyebrow">{e.start} — {e.end}</p>
            <h3 className="text-xl md:text-2xl font-heading font-bold">{e.role}</h3>
            <p className="text-muted-foreground mb-3">{e.company}</p>
            <ul className="space-y-1.5 text-foreground/85">
              {e.highlights.filter(Boolean).map((h, j) => <li key={j} className="flex gap-2"><span className="text-accent">◆</span>{h}</li>)}
            </ul>
          </motion.li>
        ))}
      </ol>
    </Section>
  );
}

function ProjectCard({ p, i }: { p: { name: string; description: string; tech: string[]; url: string; repo: string }; i: number }) {
  const { config, intensity } = useConfig();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 150, damping: 15 });
  const sy = useSpring(my, { stiffness: 150, damping: 15 });
  const rotX = useTransform(sy, (v) => -v * 12 * intensity);
  const rotY = useTransform(sx, (v) => v * 12 * intensity);
  const tx = useTransform(sx, (v) => v * 8 * intensity);
  const ty = useTransform(sy, (v) => v * 8 * intensity);
  const on = config.animation.enableCursorEffects && intensity > 0;
  return (
    <motion.article
      className="project-card group"
      style={on ? { rotateX: rotX, rotateY: rotY, x: tx, y: ty, transformPerspective: 900 } : {}}
      onPointerMove={(e) => {
        if (!on) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      initial={intensity ? { opacity: 0, y: 40 * intensity } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, delay: i * 0.08 }}
    >
      <div className="card-goo" aria-hidden="true"><span /><span /><span /></div>
      <div className="relative flex flex-1 flex-col">
        <h3 className="text-2xl font-heading font-bold mb-2">{p.name}</h3>
        <p className="text-foreground/80 mb-5">{p.description}</p>
        <div className="mt-auto">
        <ul className="flex flex-wrap gap-2 mb-6" aria-label="Technologies">
          {p.tech.filter(Boolean).map((t) => <li key={t} className="tag">{t}</li>)}
        </ul>
        <div className="flex gap-4 text-sm font-medium">
          {p.url && <a className="link" href={p.url} target="_blank" rel="noopener noreferrer">Live site ↗</a>}
          {p.repo && <a className="link" href={p.repo} target="_blank" rel="noopener noreferrer">Source ↗</a>}
        </div>
        </div>
      </div>
    </motion.article>
  );
}

export function Projects() {
  const { config } = useConfig();
  return (
    <Section id="projects" title="Projects">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {config.content.projects.map((p, i) => <ProjectCard key={p.name + i} p={p} i={i} />)}
      </div>
    </Section>
  );
}

export function GitHub() {
  const { config } = useConfig();
  const gh = config.content.links.find((l) => /github\.com/i.test(l.url));
  const user = gh?.url.match(/github\.com\/([^/?#]+)/i)?.[1];
  if (!user) return <></>;
  return (
    <Section id="github" title="On GitHub">
      <GitHubActivity username={user} />
    </Section>
  );
}

export function Skills() {
  const { config, intensity } = useConfig();
  return (
    <Section id="skills" title="Skills">
      <div className="grid gap-10 md:grid-cols-3">
        {config.content.skills.map((s, i) => (
          <div key={s.category + i}>
            <h3 className="eyebrow mb-4">{s.category}</h3>
            <ul className="flex flex-wrap gap-2.5">
              {s.items.filter(Boolean).map((it, j) => (
                <motion.li
                  key={it}
                  className="pill"
                  initial={intensity ? { opacity: 0, x: (j % 2 ? 1 : -1) * 60 * intensity, y: (j % 3 - 1) * 50 * intensity, scale: 0.6 } : false}
                  whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-10%" }}
                  transition={{ type: "spring", stiffness: 90, damping: 12, delay: j * 0.05 }}
                  style={(intensity ? { animation: `float ${4 + (j % 3)}s ease-in-out ${j * 0.3}s infinite`, "--float": `${4 * intensity}px` } : {}) as React.CSSProperties as never}
                >
                  {it}
                </motion.li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Contact() {
  const { config } = useConfig();
  const c = config.content;
  const [copied, setCopied] = useState(false);
  const resume = findResumeLink(config);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <Section id="contact" title="Let's talk">
      <p className="text-lg text-foreground/80 max-w-xl mb-8">Open to new opportunities, collaborations and interesting projects. The fastest way to reach me is email.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <a href={`mailto:${c.email}`} className="liquid-btn"><span>Email me</span></a>
        <button type="button" onClick={copy} className="ghost-btn" aria-live="polite">
          {copied ? "Copied ✓" : `Copy ${c.email}`}
        </button>
        {resume && <ResumeButton url={resume.url} name={c.name} />}
      </div>
      <ul className="mt-10 flex flex-wrap gap-6">
        {c.links.filter((l) => l.url && l !== resume).map((l) => (
          <li key={l.label}><a className="link" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a></li>
        ))}
      </ul>
      <footer className="mt-24 text-sm text-muted-foreground">© {c.name}</footer>
    </Section>
  );
}

export function DebugPanel() {
  const { config, source, lastError, intensity } = useConfig();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(new URLSearchParams(window.location.search).get("debug") === "1"); }, []);
  if (!show) return null;
  return (
    <aside className="debug-panel" aria-label="Config debug">
      <div><b>version</b> {config.version}</div>
      <div><b>source</b> {source === "api" ? "API" : "default"}</div>
      <div><b>intensity</b> {intensity}</div>
      <div><b>poll</b> {config.polling.intervalSeconds}s</div>
      {lastError && <div className="text-destructive"><b>note</b> {lastError}</div>}
    </aside>
  );
}

export function IntroScreen() {
  const { config } = useConfig();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const start = performance.now();
    const finish = () => {
      const wait = Math.max(0, 1200 - (performance.now() - start));
      setTimeout(() => setDone(true), wait);
    };
    const img = new Image();
    img.src = photo.url;
    const ready = Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      img.decode().catch(() => undefined),
      new Promise((r) => (document.readyState === "complete" ? r(null) : window.addEventListener("load", () => r(null), { once: true }))),
    ]);
    const cap = setTimeout(() => setDone(true), 4000);
    ready.then(finish);
    return () => clearTimeout(cap);
  }, []);
  return (
    <div className="intro-screen" data-done={done} aria-hidden={done} role="status" aria-label="Loading">
      <div className="text-center">
        <p className="intro-mark">{config.content.name}</p>
        <div className="intro-bar"><span /></div>
      </div>
    </div>
  );
}
