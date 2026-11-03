import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ConfigProvider, useConfig } from "./ConfigProvider";

function Probe() {
  const { pref, setPref } = useConfig();
  return (
    <div>
      <span data-testid="pref">{pref}</span>
      <button type="button" onClick={() => setPref("light")}>Choose light</button>
    </div>
  );
}

describe("Brightness starts on Auto", () => {
  beforeEach(() => {
    // Left behind by an older visit that remembered the choice.
    localStorage.setItem("theme-pref", "dark");
  });

  it("ignores a stored brightness choice on a fresh load", async () => {
    render(<ConfigProvider><Probe /></ConfigProvider>);

    await expect(screen.findByTestId("pref")).resolves.toHaveTextContent("auto");
  });

  it("still lets a visitor change brightness during the visit", async () => {
    render(<ConfigProvider><Probe /></ConfigProvider>);
    await screen.findByTestId("pref");

    fireEvent.click(screen.getByRole("button", { name: "Choose light" }));

    expect(screen.getByTestId("pref")).toHaveTextContent("light");
  });
});
