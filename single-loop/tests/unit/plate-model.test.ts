import { describe, expect, it } from "vitest";
import { parsePlateModelResult } from "../../src/plate/model";
import type { PlateModelResult } from "../../src/plate/types";

const success: PlateModelResult = {
  ok: true,
  model: {
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
    nopps: [],
    graph: { nodes: [], edges: [], rejectedEdges: [], candidateCount: 0 },
    validation: {
      independentlyValidated: true,
      noppCount: 0,
      nodeCount: 0,
      acceptedEdgeCount: 0,
      rejectedEdgeCount: 0,
    },
  },
};

describe("plate result contract", () => {
  it("accepts the closed independently-validated model result", () => {
    expect(parsePlateModelResult(success)).toBe(success);
  });

  it("rejects contradictory and incomplete values", () => {
    expect(() => parsePlateModelResult({ ok: true, model: null })).toThrow("plate model");
    expect(() => parsePlateModelResult({ ok: false, model: success.model })).toThrow("plate error");
    expect(() => parsePlateModelResult({ ok: true, model: { ...success.model, profile: "OTHER" } })).toThrow("profile");
  });
});
