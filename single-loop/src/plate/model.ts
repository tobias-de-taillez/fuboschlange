import init, { buildPlateModel as buildPlateModelWasm } from "../wasm/pkg/single_loop_solver.js";
import type { PlateModelInput, PlateModelResult } from "./types";

let ready: Promise<void> | undefined;
let initialized = false;

export function initializePlateModel(): Promise<void> {
  return ready ??= init().then(() => { initialized = true; });
}

export function buildPlateModel(input: PlateModelInput): PlateModelResult {
  if (!initialized) throw new Error("initializePlateModel() must resolve before buildPlateModel()");
  return parsePlateModelResult(buildPlateModelWasm(input));
}

export function parsePlateModelResult(value: unknown): PlateModelResult {
  if (!isRecord(value)) throw new Error("invalid plate model result");
  if (value.ok === true) {
    if (!isRecord(value.model)) throw new Error("invalid plate model");
    if (value.model.profile !== "BEKOTEC_EN_23_FI_30_16") throw new Error("invalid plate profile");
    if (!isRecord(value.model.validation) || value.model.validation.independentlyValidated !== true) {
      throw new Error("plate model is not independently validated");
    }
    if (!Array.isArray(value.model.polygon)
      || !Array.isArray(value.model.nopps)
      || !isRecord(value.model.graph)
      || !Array.isArray(value.model.graph.nodes)
      || !Array.isArray(value.model.graph.edges)
      || !Array.isArray(value.model.graph.rejectedEdges)) {
      throw new Error("invalid plate model geometry");
    }
    return value as unknown as PlateModelResult;
  }
  if (value.ok === false) {
    if (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
      throw new Error("invalid plate error");
    }
    return value as unknown as PlateModelResult;
  }
  throw new Error("invalid plate model result discriminator");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
