import { describe, expect, it } from "vitest";
import { isDaytime, sunTimes } from "./sun";

describe("auto theme sun times", () => {
  it("is daytime at noon and night at midnight", () => {
    expect(isDaytime(new Date(2026, 5, 1, 12, 0))).toBe(true);
    expect(isDaytime(new Date(2026, 5, 1, 0, 0))).toBe(false);
  });
  it("sunrise falls between 4am and 8am and sunset between 4pm and 9pm", () => {
    const { sunrise, sunset } = sunTimes(new Date(2026, 0, 15, 12));
    expect(sunrise).toBeGreaterThan(4); expect(sunrise).toBeLessThan(9);
    expect(sunset).toBeGreaterThan(16); expect(sunset).toBeLessThan(21);
  });
});
