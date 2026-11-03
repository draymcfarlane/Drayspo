import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import defaultJson from "./default.json";
import { configSchema, type SiteConfig } from "./schema";
import { isDaytime } from "@/lib/sun";

export type ThemePref = "light" | "dark" | "auto";
const LIGHT = { background: "#F4F1FA", text: "#16131F", primary: "#6D28D9", secondary: "#0891B2", accent: "#DB2777" };
const INK = { dark: "#0B0B14", light: "#F7F5FB" };

/** Relative luminance of a #rrggbb colour, as defined by WCAG. */
function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
}

/**
 * Ink for text sitting on the liquid gradient. The gradient's own colours change
 * with the palette, so the readable ink is chosen by contrast rather than by
 * theme name: dark ink on the bright dark-mode stops, pale ink on the deeper
 * light-mode ones.
 */
export function onLiquid(colors: { primary: string; secondary: string; accent: string }) {
  const avg = (luminance(colors.primary) + luminance(colors.secondary) + luminance(colors.accent)) / 3;
  const contrast = (ink: string) => {
    const l = luminance(ink);
    return (Math.max(avg, l) + 0.05) / (Math.min(avg, l) + 0.05);
  };
  return contrast(INK.dark) >= contrast(INK.light) ? INK.dark : INK.light;
}

export const defaultConfig = configSchema.parse(defaultJson);
type Source = "api" | "default";
type Ctx = { config: SiteConfig; source: Source; intensity: number; lastError: string | null; pref: ThemePref; setPref: (p: ThemePref) => void };

const ConfigContext = createContext<Ctx>({ config: defaultConfig, source: "default", intensity: defaultConfig.animation.intensity, lastError: null, pref: "auto", setPref: () => {} });
export const useConfig = () => useContext(ConfigContext);

export async function loadConfig(baseUrl: string | undefined): Promise<{ config: SiteConfig; source: Source; error: string | null }> {
  if (!baseUrl) return { config: defaultConfig, source: "default", error: "VITE_CONFIG_API_URL not set" };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/config`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = configSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("Config failed validation");
    return { config: parsed.data, source: "api", error: null };
  } catch (e) {
    return { config: defaultConfig, source: "default", error: e instanceof Error ? e.message : "Fetch failed" };
  }
}

function applyTheme(c: SiteConfig) {
  const r = document.documentElement;
  const { colors, fonts, mode } = c.theme;
  r.style.setProperty("--c-primary", colors.primary);
  r.style.setProperty("--c-secondary", colors.secondary);
  r.style.setProperty("--c-accent", colors.accent);
  r.style.setProperty("--c-bg", colors.background);
  r.style.setProperty("--c-text", colors.text);
  r.style.setProperty("--on-liquid", onLiquid(colors));
  r.style.setProperty("--font-heading-family", `"${fonts.heading}"`);
  r.style.setProperty("--font-body-family", `"${fonts.body}"`);
  r.classList.toggle("dark", mode === "dark");
  r.style.colorScheme = mode;
  const id = "cfg-fonts";
  const href = `https://fonts.googleapis.com/css2?family=${[fonts.heading, fonts.body].map((f) => encodeURIComponent(f) + ":wght@400;500;700").join("&family=")}&display=swap`;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ config: SiteConfig; source: Source; lastError: string | null }>({ config: defaultConfig, source: "default", lastError: null });
  const [reduced, setReduced] = useState(false);
  const lastJson = useRef("");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = () => setReduced(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const [pref, setPrefState] = useState<ThemePref>("auto");
  const [day, setDay] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme-pref");
    if (saved === "light" || saved === "dark" || saved === "auto") setPrefState(saved);
    const check = () => setDay(isDaytime(new Date()));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);
  const setPref = (p: ThemePref) => { setPrefState(p); localStorage.setItem("theme-pref", p); };
  const mode = pref === "auto" ? (day ? "light" : "dark") : pref;
  const config: SiteConfig = mode === "light"
    ? { ...state.config, theme: { ...state.config.theme, mode: "light", colors: { ...state.config.theme.colors, ...LIGHT } } }
    : { ...state.config, theme: { ...state.config.theme, mode: "dark" } };
  const cfgKey = JSON.stringify(config.theme);
  useEffect(() => applyTheme(config), [cfgKey]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      const r = await loadConfig(import.meta.env['VITE_CONFIG_API_URL'] as string | undefined);
      if (cancelled) return;
      const json = JSON.stringify(r.config);
      if (json !== lastJson.current) {
        lastJson.current = json;
        setState({ config: r.config, source: r.source, lastError: r.error });
      } else setState((s) => (s.source === r.source && s.lastError === r.error ? s : { ...s, source: r.source, lastError: r.error }));
      timer = setTimeout(tick, r.config.polling.intervalSeconds * 1000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const intensity = reduced ? 0 : state.config.animation.intensity;
  return <ConfigContext.Provider value={{ ...state, config, intensity, pref, setPref }}>{children}</ConfigContext.Provider>;
}
