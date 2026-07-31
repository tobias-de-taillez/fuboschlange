import { beforeEach, describe, expect, it, vi } from "vitest";
import plateMainSource from "../../src/plate-main?raw";
import { PLATE_SHAPES, setupPlatePage } from "../../src/plate-main";
import type { PlateModel, PlateModelResult } from "../../src/plate/types";

const model: PlateModel = {
  profile: "BEKOTEC_EN_23_FI_30_16",
  profileVersion: "2026.07.31-1",
  polygon: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }],
  wallClearanceMm: 12,
  transform: { origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, phaseUMm: 30, phaseVMm: 45 },
  nopps: [
    { index: { i: 0, j: 0 }, noppType: "LARGE", center: { x: 75, y: 75 }, renderedRadiusMm: 33, effectiveRadiusMm: 17.5, forbiddenRadiusMm: 26 },
  ],
  graph: {
    nodes: [{ id: 0, localPose: { point: { x: 20, y: 40 }, heading: "DEG0" }, worldPoint: { x: 20, y: 40 } }],
    edges: [],
    rejectedEdges: [{
      templateId: "HANDBOOK_REJECTED_TIGHT90",
      templateTransform: { quarterTurns: 0, reflected: false, periodI: 0, periodJ: 0 },
      primitives: [{ kind: "line", start: { x: 10, y: 10 }, end: { x: 70, y: 10 } }],
      code: "BEND_RADIUS_TOO_SMALL",
      witness: { x: 70, y: 10 },
    }],
    candidateCount: 1,
  },
  validation: { independentlyValidated: true, noppCount: 1, nodeCount: 1, acceptedEdgeCount: 0, rejectedEdgeCount: 1 },
};

const success: PlateModelResult = { ok: true, model };
const failure: PlateModelResult = {
  ok: false,
  error: { code: "NO_USABLE_PLATE_CELL", message: "<img src=x onerror=alert(1)> keine Zelle", used: null, limit: null },
};

function mountDom(): void {
  document.body.innerHTML = `
    <p id="plate-banner">Nur Noppenmodell – kein Heizkreis</p>
    <select id="shape">
      <option value="rectangle" selected>Rechteck</option>
      <option value="l">L-Form</option>
      <option value="u">U-Form</option>
      <option value="c">C-Form</option>
    </select>
    <input id="edge" type="number" value="0"/>
    <input id="phase-u" type="number" min="0" max="74.999" value="30"/>
    <input id="phase-v" type="number" min="0" max="74.999" value="45"/>
    <input id="plate-clearance" type="number" min="8" value="12"/>
    <button id="build">Noppenmodell aufbauen</button>
    <p id="plate-status"></p>
    <p id="plate-profile"></p>
    <p id="plate-counts"></p>
    <label><input class="layer" type="checkbox" data-layer="room" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="wallDomain" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="raster" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="cells" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="nopps" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="forbidden" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="anchors" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="acceptedEdges" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="rejectedEdges" checked/></label>
    <label><input class="layer" type="checkbox" data-layer="witnesses" checked/></label>
    <svg id="plate" xmlns="http://www.w3.org/2000/svg"></svg>
  `;
}

describe("plate debug page", () => {
  beforeEach(() => { mountDom(); });

  it("never references the heating-loop solver", () => {
    expect(plateMainSource).not.toContain("solveSingleLoop");
    expect(plateMainSource).not.toContain("worker/client");
  });

  it("builds only via buildPlateModel with the exact form values", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);
    const build = vi.fn().mockReturnValue(success);
    const page = setupPlatePage({ initialize, build });

    await page.runBuild();

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith({
      polygon: PLATE_SHAPES.rectangle,
      connectionEdgeIndex: 0,
      wallClearanceMm: 12,
      phaseUMm: 30,
      phaseVMm: 45,
      profile: "BEKOTEC_EN_23_FI_30_16",
    });
  });

  it("passes edited shape, edge, phase, and clearance inputs", async () => {
    const build = vi.fn().mockReturnValue(success);
    const page = setupPlatePage({ initialize: () => Promise.resolve(), build });

    (document.querySelector("#shape") as HTMLSelectElement).value = "l";
    (document.querySelector("#edge") as HTMLInputElement).value = "3";
    (document.querySelector("#phase-u") as HTMLInputElement).value = "7.5";
    (document.querySelector("#phase-v") as HTMLInputElement).value = "0";
    (document.querySelector("#plate-clearance") as HTMLInputElement).value = "20";
    await page.runBuild();

    expect(build).toHaveBeenCalledWith({
      polygon: PLATE_SHAPES.l,
      connectionEdgeIndex: 3,
      wallClearanceMm: 20,
      phaseUMm: 7.5,
      phaseVMm: 0,
      profile: "BEKOTEC_EN_23_FI_30_16",
    });
  });

  it("renders the diagnostic scene, profile readout, and counts on success", async () => {
    const page = setupPlatePage({ initialize: () => Promise.resolve(), build: () => success });

    await page.runBuild();

    const svg = document.querySelector("#plate")!;
    expect(svg.querySelectorAll("g[data-layer]").length).toBe(10);
    expect(document.querySelector("#plate-profile")!.textContent).toContain("BEKOTEC_EN_23_FI_30_16");
    expect(document.querySelector("#plate-profile")!.textContent).toContain("2026.07.31-1");
    const counts = document.querySelector("#plate-counts")!.textContent!;
    expect(counts).toContain("1 Noppen");
    expect(counts).toContain("1 Posen");
    expect(counts).toContain("0 Kanten");
    expect(counts).toContain("1 verworfen");
    expect(document.querySelector("#plate-status")!.textContent).toContain("unabhängig validiert");
  });

  it("re-renders on layer toggle without rebuilding the model", async () => {
    const build = vi.fn().mockReturnValue(success);
    const page = setupPlatePage({ initialize: () => Promise.resolve(), build });
    await page.runBuild();

    const toggle = document.querySelector('input[data-layer="rejectedEdges"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    const svg = document.querySelector("#plate")!;
    expect(svg.querySelector('g[data-layer="rejected-edges"]')).toBeNull();
    expect(svg.querySelector('g[data-layer="room"]')).not.toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("shows typed errors as text and never injects markup", async () => {
    const page = setupPlatePage({ initialize: () => Promise.resolve(), build: () => failure });

    await page.runBuild();

    const status = document.querySelector("#plate-status")!;
    expect(status.textContent).toContain("NO_USABLE_PLATE_CELL");
    expect(status.textContent).toContain("keine Zelle");
    expect(status.querySelector("img")).toBeNull();
    expect(document.querySelector("#plate")!.querySelector("g[data-layer]")).toBeNull();
  });

  it("wires the build button to the same handler", async () => {
    const build = vi.fn().mockReturnValue(success);
    setupPlatePage({ initialize: () => Promise.resolve(), build });

    (document.querySelector("#build") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
  });

  it("constrains phase inputs to [0,75)", () => {
    const phaseU = document.querySelector("#phase-u") as HTMLInputElement;
    const phaseV = document.querySelector("#phase-v") as HTMLInputElement;
    expect(Number(phaseU.min)).toBe(0);
    expect(Number(phaseU.max)).toBeLessThan(75);
    expect(Number(phaseV.min)).toBe(0);
    expect(Number(phaseV.max)).toBeLessThan(75);
  });
});
