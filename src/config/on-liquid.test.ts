import { describe, expect, it } from "vitest";
import { onLiquid } from "./ConfigProvider";

// The palettes the site actually ships with: the dark one bundled in default.json
// and the light one applied by the Bright / Auto theme switch.
const DARK = { primary: "#7C3AED", secondary: "#06B6D4", accent: "#F472B6" };
const LIGHT = { primary: "#6D28D9", secondary: "#0891B2", accent: "#DB2777" };

describe("onLiquid", () => {
  it("picks dark ink for the bright dark-mode gradient", () => {
    expect(onLiquid(DARK)).toBe("#0B0B14");
  });

  it("picks pale ink for the deeper light-mode gradient", () => {
    expect(onLiquid(LIGHT)).toBe("#F7F5FB");
  });
});
