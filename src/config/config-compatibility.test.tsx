import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { defaultConfig, useConfig } from "./ConfigProvider";

const { legacyContext } = vi.hoisted(() => ({ legacyContext: { current: null as unknown } }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useContext: (...args: Parameters<typeof actual.useContext>) => legacyContext.current ?? actual.useContext(...args) };
});

it("normalizes retained pre-update context for every new section", () => {
  const { holo, music, thoughts, ...content } = defaultConfig.content;
  legacyContext.current = { config: { ...defaultConfig, content }, intensity: 0 };
  let normalized: ReturnType<typeof useConfig>["config"] | undefined;
  function Consumer() { normalized = useConfig().config; return <div data-testid="rendered" />; }
  try {
    render(<Consumer />);
    expect(screen.getByTestId("rendered")).toBeDefined();
    expect(normalized?.content.holo.label).toBe("Drayspo · ID");
    expect(normalized?.content.music.nowPlaying).toBe(null);
    expect(normalized?.content.thoughts).toEqual([]);
  } finally { legacyContext.current = null; }
});