import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountPanel } from "../../src/verlegeplan/panel";

const MARKUP = `
  <button id="impBtn"></button><input id="impFile" type="file" hidden /><p id="impName"></p>
  <input id="rectW" type="number" value="3000" /><input id="rectH" type="number" value="2400" />
  <select id="spacing"><option value="75">75</option><option value="150" selected>150</option></select>
  <input id="clearance" type="number" value="75" />
  <input id="band" type="number" value="300" />
  <div id="countSeg"><button data-n="auto" class="on"></button><button data-n="2"></button></div>
  <input id="mfx" type="number" /><input id="mfy" type="number" />
`;

describe("mountPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = MARKUP;
  });

  it("maps the sidebar to RoomPlanInput", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    const input = panel.readInput([{ x: 0, y: 0 }], { x: 1, y: 2 });
    expect(input).toMatchObject({
      fillSpacingMm: 150,
      wallClearanceMm: 75,
      edgeBandMm: 300,
      circuitCount: null,
      manifold: { x: 1, y: 2 },
    });
  });

  it("count segment: klick auf 2 liefert circuitCount 2, Auto wieder null", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    document.querySelector<HTMLButtonElement>('[data-n="2"]')!.click();
    expect(panel.readInput([], null).circuitCount).toBe(2);
    document.querySelector<HTMLButtonElement>('[data-n="auto"]')!.click();
    expect(panel.readInput([], null).circuitCount).toBeNull();
  });

  it("meldet jede Eingabeänderung als onChange (veraltet)", () => {
    const onChange = vi.fn();
    mountPanel({ onChange, onImport: vi.fn(), onManifoldEntry: vi.fn() });
    const spacing = document.getElementById("spacing")!;
    spacing.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-n="2"]')!.click();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("rectRing baut das Rechteck aus Breite/Tiefe", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    expect(panel.rectRing()).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2400 },
      { x: 0, y: 2400 },
    ]);
  });

  it("Survey-Name sperrt Breite/Tiefe, Entfernen entsperrt", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    panel.setSurveyName("Wintergarten");
    expect(document.getElementById("rectW")).toHaveProperty("disabled", true);
    panel.setSurveyName(null);
    expect(document.getElementById("rectW")).toHaveProperty("disabled", false);
  });

  it("x/y-Eingabe meldet onManifoldEntry mit Weltkoordinaten", () => {
    const onManifoldEntry = vi.fn();
    mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry });
    const mfx = document.getElementById("mfx") as HTMLInputElement;
    const mfy = document.getElementById("mfy") as HTMLInputElement;
    mfx.value = "7420";
    mfy.value = "-1850";
    mfy.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onManifoldEntry).toHaveBeenCalledWith({ x: 7420, y: -1850 });
  });
});
