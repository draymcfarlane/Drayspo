// Minimum and maximum intro durations.
export const INTRO_MIN_MS = 1200;
export const INTRO_MAX_MS = 8000;
// Converts settled preload count into a 0 to 1 progress value.
export function preloadProgress(settled: number, total: number) {
  return total > 0 ? Math.min(1, Math.max(0, settled / total)) : 1;
}
// Keyframes for the liquid pour reveal, scaled by motion intensity.
export function pourFrames(intensity = 1): Keyframe[] {
  return Array.from({ length: 15 }, (_, frame) => {
    const t = frame / 14;
    const level = 104 - t * 116;
    const amp = 9 * Math.sin(Math.PI * t);
    const phase = t * Math.PI * 2.5;
    const points = Array.from({ length: 17 }, (_, i) =>
      `${i / 16 * 100}% ${level + amp * Math.sin(i / 16 * Math.PI * 3 + phase)}%`);
    return {
      clipPath: `polygon(${points.join(",")},100% 100%,0% 100%)`,
      translate: `0 ${(1 - t) ** 2 * 46 * intensity}px`,
      offset: t,
    };
  });
}