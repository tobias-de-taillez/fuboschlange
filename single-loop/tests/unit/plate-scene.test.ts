import { describe, expect, it } from "vitest";
import { DEFAULT_PLATE_LAYERS, renderPlateScene } from "../../src/render/plate-scene";
import type { PlateModel } from "../../src/plate/types";

const model: PlateModel = {
  profile: "BEKOTEC_EN_23_FI_30_16",
  profileVersion: "2026.07.28-1",
  polygon: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }],
  wallClearanceMm: 8,
  transform: {
    origin: { x: 0, y: 0 },
    u: { x: 1, y: 0 },
    v: { x: 0, y: 1 },
    phaseUMm: 0,
    phaseVMm: 0,
  },
  nopps: [
    { index: { i: 0, j: 0 }, noppType: "LARGE", center: { x: 75, y: 75 }, renderedRadiusMm: 33, effectiveRadiusMm: 17.5, forbiddenRadiusMm: 26 },
    { index: { i: 1, j: 0 }, noppType: "SMALL", center: { x: 150, y: 75 }, renderedRadiusMm: 10.5, effectiveRadiusMm: 10.5, forbiddenRadiusMm: 19 },
  ],
  graph: {
    nodes: [
      { id: 0, localPose: { point: { x: 20, y: 40 }, heading: "DEG0" }, worldPoint: { x: 20, y: 40 } },
      { id: 1, localPose: { point: { x: 180, y: 120 }, heading: "DEG45" }, worldPoint: { x: 180, y: 120 } },
    ],
    edges: [{
      id: 0,
      start: { id: 0, localPose: { point: { x: 20, y: 40 }, heading: "DEG0" }, worldPoint: { x: 20, y: 40 } },
      end: { id: 1, localPose: { point: { x: 180, y: 120 }, heading: "DEG45" }, worldPoint: { x: 180, y: 120 } },
      templateId: "BROAD_TURN90",
      templateTransform: { quarterTurns: 0, reflected: false, periodI: 0, periodJ: 0 },
      primitives: [
        { kind: "line", start: { x: 20, y: 40 }, end: { x: 100, y: 40 } },
        { kind: "arc", start: { x: 100, y: 40 }, end: { x: 180, y: 120 }, center: { x: 100, y: 120 }, radiusMm: 80, sweepRad: Math.PI / 2 },
      ],
      certificate: { minNoppClearanceMm: 1, minBendRadiusMm: 80 },
    }],
    rejectedEdges: [{
      templateId: "HANDBOOK_REJECTED_TIGHT90",
      templateTransform: { quarterTurns: 0, reflected: false, periodI: 0, periodJ: 0 },
      primitives: [{ kind: "line", start: { x: 10, y: 10 }, end: { x: 70, y: 10 } }],
      code: "BEND_RADIUS_TOO_SMALL",
      witness: { x: 70, y: 10 },
    }],
    candidateCount: 2,
  },
  validation: { independentlyValidated: true, noppCount: 2, nodeCount: 2, acceptedEdgeCount: 1, rejectedEdgeCount: 1 },
};

describe("plate diagnostic SVG", () => {
  it("renders deterministic separated diagnostic layers and exact arcs", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    renderPlateScene(svg, model, DEFAULT_PLATE_LAYERS);

    expect(svg.querySelectorAll("g[data-layer]").length).toBe(10);
    expect(svg.querySelector(".nopp.large")?.getAttribute("r")).toBe("33");
    expect(svg.querySelector(".forbidden.large")?.getAttribute("r")).toBe("26");
    expect(svg.querySelector(".accepted-edge")?.getAttribute("d")).toContain("A 80 80 0 0 1 180 120");
    expect(svg.querySelector(".rejected-edge")?.getAttribute("d")).toBe("M 10 10 L 70 10");
    expect(svg.querySelector(".pipe")).toBeNull();
  });

  it("omits layers disabled by the caller", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    renderPlateScene(svg, model, { ...DEFAULT_PLATE_LAYERS, rejectedEdges: false, forbidden: false });
    expect(svg.querySelector('[data-layer="rejected-edges"]')).toBeNull();
    expect(svg.querySelector('[data-layer="forbidden"]')).toBeNull();
  });
});
