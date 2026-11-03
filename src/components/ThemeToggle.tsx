import { useRef } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { useConfig, type ThemePref } from "@/config/ConfigProvider";
import { GooIndicator } from "@/components/GooIndicator";

const OPTS: { v: ThemePref; label: string; Icon: typeof Sun }[] = [
  { v: "light", label: "Light", Icon: Sun },
  { v: "dark", label: "Dark", Icon: Moon },
  { v: "auto", label: "Auto (follows sunrise and sunset)", Icon: Contrast },
];

export function ThemeToggle() {
  const { pref, setPref, intensity } = useConfig();
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} className="theme-toggle" role="radiogroup" aria-label="Color theme" data-motion={intensity > 0}>
      <GooIndicator container={box} activeKey={pref} motion={intensity > 0} />
      {OPTS.map((o) => (
        <button key={o.v} data-goo-key={o.v} type="button" role="radio" aria-checked={pref === o.v} aria-label={o.label} title={o.label}
          data-active={pref === o.v} onClick={() => setPref(o.v)}>
          <o.Icon aria-hidden="true" />
          <span className="hidden sm:inline">{o.v === "auto" ? "Auto" : o.label}</span>
        </button>
      ))}
    </div>
  );
}
