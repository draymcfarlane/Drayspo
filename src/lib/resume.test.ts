import { describe, expect, it } from "vitest";
import { isPdfBytes, resumeFileName } from "./resume";

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

describe("isPdfBytes", () => {
  it("accepts real PDF bytes", () => {
    expect(isPdfBytes(bytes("%PDF-1.7\n1 0 obj"))).toBe(true);
  });

  it("rejects the plain-text access-gate response", () => {
    expect(isPdfBytes(bytes("Unauthorized"))).toBe(false);
  });

  it("rejects an HTML page served in place of the file", () => {
    expect(isPdfBytes(bytes("<!DOCTYPE html><html>"))).toBe(false);
  });

  it("rejects an empty response", () => {
    expect(isPdfBytes(new ArrayBuffer(0))).toBe(false);
  });
});

describe("resumeFileName", () => {
  it("builds a clean PDF name from the display name", () => {
    expect(resumeFileName("Dray McFarlane")).toBe("Dray-McFarlane-Resume.pdf");
  });

  it("drops punctuation that browsers dislike in file names", () => {
    expect(resumeFileName("Deonaundray O'Brien")).toBe("Deonaundray-OBrien-Resume.pdf");
  });

  it("falls back when there is no usable name", () => {
    expect(resumeFileName("!!!")).toBe("Resume-Resume.pdf");
  });
});
