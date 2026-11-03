import { copyText } from "@/lib/copy-text";
import { LiquidBlock, LiquidDrop, LiquidGroup, LiquidLine, LiquidText } from "./Liquid";
import { useAppReady } from "@/lib/app-ready";
import { Button } from "@/components/ui/button";
import { TypedHeading } from "./TypedHeading";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, Copy, Diamond } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConfig } from "@/config/ConfigProvider";
import { findResumeLink } from "@/config/schema";
import { ResumeButton } from "@/components/ResumeButton";
import { HoloCard } from "@/components/HoloCard";
import { GitHubActivity } from "@/components/GitHubActivity";

// SVG filter definitions shared by the gooey highlights.
export function GooeyDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <filter id="goo-nav" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
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

// Standard section wrapper with an optional typed heading.
function Section({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-h` : undefined} className="section">
      {title && (
        <TypedHeading id={`${id}-h`} text={title} />
      )}
      {children}
    </section>
  );
}

// Opening section with name, role, photo card and primary actions.
export function Hero() {
  const { config, intensity } = useConfig();
  const c = config.content;
  const brand = c.brand ?? { strong: "Dray’s Po", tail: "rtfolio" };
  const resume = findResumeLink(config);
  const ready = useAppReady();
  return (
    <LiquidGroup as="section" id="hero" className="section hero-layout" aria-label="Introduction">
      <div className="hero-copy">
      <LiquidLine as="p" className="hero-brand">
        <span className="sr-only">{brand.strong + brand.tail}</span>
        <span aria-hidden="true" className="hero-brand-strong">{brand.strong}</span>
        <span aria-hidden="true" className="hero-brand-tail">{brand.tail}</span>
      </LiquidLine>
      <LiquidText className="eyebrow" text={c.location} delay={60} />
      <h1 className="hero-name" data-name-ready={ready}>
        {c.name.split(/\s+/).map((word, i, words) => <span data-name-word key={i}>{word}{i < words.length - 1 ? " " : ""}</span>)}
        <span className="sr-only"> — {c.title}</span>
      </h1>
      <LiquidText className="hero-title" text={c.title} delay={160} />
      <LiquidText className="hero-tagline" text={c.tagline} delay={280} />
      <LiquidGroup delay={440} className="mt-10 action-row">
        <LiquidDrop className="action-slot"><Button asChild variant="liquid" size="portfolio"><a href="#contact" onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const contact = document.getElementById("contact");
          if (!contact) return;
          event.preventDefault();
          // Let the page's smooth-scroll controller handle anchors when active;
          // starting a native scroll alongside it can cancel the animation.
          if (document.documentElement.classList.contains("lenis")) {
            window.dispatchEvent(new CustomEvent("app:scroll-to-section", { detail: contact }));
          } else {
            contact.scrollIntoView({ behavior: intensity > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto", block: "start" });
          }
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#contact`);
        }}><span>Get in touch</span><ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" /></a></Button></LiquidDrop>
        {resume && <LiquidDrop index={1} className="action-slot"><ResumeButton url={resume.url} name={c.name} /></LiquidDrop>}
      </LiquidGroup>
      </div>
      <HoloCard />
    </LiquidGroup>
  );
}

// Short biography section.
export function About() {
  const { config } = useConfig();
  return (
    <Section id="about" title="About">
      <LiquidText className="about-text" text={config.content.about} stagger={110} />
    </Section>
  );
}

// Timeline of roles and responsibilities.
export function Experience() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const line = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!ready || !line.current || !wrap.current) return;
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
  }, [ready, intensity, config.content.experience.length]);
  return (
    <Section id="experience" title="Experience">
      <ol ref={wrap} className="relative pl-8 md:pl-12">
        <div className="timeline-track" aria-hidden="true"><div ref={line} className="timeline-line" /></div>
        {config.content.experience.map((e, i) => (
          <LiquidGroup as="li" key={i} className="relative pb-12 last:pb-0">
            <LiquidDrop className="timeline-dot" aria-hidden="true" />
            <LiquidLine as="p" className="eyebrow">{e.start} — {e.end}</LiquidLine>
            <LiquidLine as="h3" index={1} className="text-xl md:text-2xl font-heading font-bold">{e.role}</LiquidLine>
            <LiquidLine as="p" index={2} className="text-muted-foreground mb-3">{e.company}</LiquidLine>
            <ul className="space-y-1.5 text-foreground/85">
              {e.highlights.filter(Boolean).map((h, j) => <LiquidLine as="li" index={j + 3} key={j} innerClassName="flex gap-2"><Diamond size={9} className="text-accent shrink-0 mt-[6px]" fill="currentColor" aria-hidden="true" />{h}</LiquidLine>)}
            </ul>
          </LiquidGroup>
        ))}
      </ol>
    </Section>
  );
}

// Project card with tags and links pinned to the bottom.
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
    <LiquidBlock index={i} className="h-full">
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
    >
      <div className="card-goo" aria-hidden="true"><span /><span /><span /></div>
      <div className="relative flex flex-1 flex-col">
        <LiquidText as="h3" className="text-2xl font-heading font-bold mb-2" text={p.name} />
        <LiquidText className="text-foreground/80 mb-5" text={p.description} delay={150} />
        <div className="mt-auto">
        <ul className="flex flex-wrap gap-2 mb-6" aria-label="Technologies">
          {p.tech.filter(Boolean).map((t) => <li key={t} className="tag">{t}</li>)}
        </ul>
        <div className="flex gap-4 text-sm font-medium">
          {p.url && <a className="link inline-flex items-center gap-1" href={p.url} target="_blank" rel="noopener noreferrer">Live site <ArrowUpRight size={14} aria-hidden="true" /></a>}
          {p.repo && <a className="link inline-flex items-center gap-1" href={p.repo} target="_blank" rel="noopener noreferrer">Source <ArrowUpRight size={14} aria-hidden="true" /></a>}
        </div>
        </div>
      </div>
    </motion.article>
    </LiquidBlock>
  );
}

// Grid of featured projects.
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

// Section wrapper for the live GitHub activity widget.
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

// Grouped skill pills.
export function Skills() {
  const { config, intensity } = useConfig();
  return (
    <Section id="skills" title="Skills">
      <div className="grid gap-10 md:grid-cols-3">
        {config.content.skills.map((s, i) => (
          <LiquidGroup key={s.category + i} delay={i * 160}>
            <LiquidLine as="h3" className="eyebrow mb-4">{s.category}</LiquidLine>
            <ul className="flex flex-wrap gap-2.5">
              {s.items.filter(Boolean).map((it, j) => (
                <LiquidDrop as="li" index={j + 2}
                  key={it}
                  className="pill"
                  style={(intensity ? { animation: `float ${4 + (j % 3)}s ease-in-out ${j * 0.3}s infinite`, "--float": `${4 * intensity}px` } : {}) as React.CSSProperties as never}
                >
                  {it}
                </LiquidDrop>
              ))}
            </ul>
          </LiquidGroup>
        ))}
      </div>
    </Section>
  );
}

// Contact details with a cross-device copy-to-clipboard email action.
export function Contact() {
  const { config, intensity } = useConfig();
  const c = config.content;
  const [copied, setCopied] = useState(false);
  const resetCopy = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetCopy.current), []);
  const resume = findResumeLink(config);
  const copy = async () => {
    if (await copyText(c.email)) {
      setCopied(true);
      clearTimeout(resetCopy.current);
      resetCopy.current = setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt("Copy this email address:", c.email);
    }
  };
  return (
    <Section id="contact" title="Let's talk">
      <LiquidText className="text-lg text-foreground/80 max-w-xl mb-8" text="Open to new opportunities, collaborations and interesting projects. The fastest way to reach me is email." />
      <LiquidGroup delay={250} className="action-row">
        <LiquidDrop className="action-slot"><Button asChild variant="liquid" size="portfolio"><a href={`mailto:${c.email}`}><span>Email me</span></a></Button></LiquidDrop>
        <LiquidDrop index={1} className="action-slot"><Button type="button" variant="quiet" size="portfolio" onClick={copy} className="copy-action" data-copied={copied} data-motion={intensity > 0} aria-label={copied ? "Copied" : `Copy ${c.email}`}>
          <span className="copy-state-stack" aria-hidden="true">
            <span className="copy-state" data-visible={!copied}><Copy size={16} /><span>Copy {c.email}</span></span>
            <span className="copy-state" data-visible={copied}><Check size={16} /><span>Copied</span></span>
          </span>
        </Button></LiquidDrop>
        {resume && <LiquidDrop index={2} className="action-slot"><ResumeButton url={resume.url} name={c.name} /></LiquidDrop>}
      </LiquidGroup>
      <span className="sr-only" role="status">{copied ? "Email address copied" : ""}</span>
      <ul className="mt-10 flex flex-wrap gap-6">
        {c.links.filter((l) => l.url && l !== resume).map((l) => (
          <li key={l.label}><a className="link inline-flex items-center gap-1" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} <ArrowUpRight size={14} aria-hidden="true" /></a></li>
        ))}
      </ul>
      <footer className="mt-24 text-sm text-muted-foreground">© {c.name}</footer>
    </Section>
  );
}

// Developer-only readout of config source and motion state.
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

