import { useConfig, type ThemePref } from "@/config/ConfigProvider";

const OPTS: { v: ThemePref; label: string; icon: string }[] = [
  { v: "light", label: "Bright", icon: "☀" },
  { v: "dark", label: "Dark", icon: "☾" },
  { v: "auto", label: "Auto (follows sunrise and sunset)", icon: "◐" },
];

export function ThemeToggle() {
  const { pref, setPref } = useConfig();
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {OPTS.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} aria-label={o.label} title={o.label}
          data-active={pref === o.v} onClick={() => setPref(o.v)}>
          <span aria-hidden="true">{o.icon}</span>
          <span className="hidden sm:inline">{o.v === "auto" ? "Auto" : o.label}</span>
        </button>
      ))}
    </div>
  );
}
