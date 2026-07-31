import "./styles.css";
import { DEFAULT_PLATE_LAYERS, renderPlateScene, type PlateLayerVisibility } from "./render/plate-scene";
import { buildPlateModel, initializePlateModel } from "./plate/model";
import type { PlateModel, PlateModelInput, PlateModelResult } from "./plate/types";
import type { Point } from "./api/types";

export type PlateShapeId = "rectangle" | "l" | "u" | "c";
export const PLATE_SHAPES: Record<PlateShapeId, Point[]> = {
  rectangle: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 }],
  l: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1200 }, { x: 1500, y: 1200 }, { x: 1500, y: 2400 }, { x: 0, y: 2400 }],
  u: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 2000, y: 2400 }, { x: 2000, y: 900 }, { x: 1000, y: 900 }, { x: 1000, y: 2400 }, { x: 0, y: 2400 }],
  c: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 900 }, { x: 1000, y: 900 }, { x: 1000, y: 1500 }, { x: 3000, y: 1500 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 }],
};

export interface PlatePageDeps {
  initialize: () => Promise<void>;
  build: (input: PlateModelInput) => PlateModelResult;
}

export function setupPlatePage(deps: PlatePageDeps): { runBuild: () => Promise<void> } {
  const query = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`missing plate page element: ${selector}`);
    return element;
  };
  const svg = query<SVGSVGElement>("#plate");
  const status = query<HTMLElement>("#plate-status");
  const profile = query<HTMLElement>("#plate-profile");
  const counts = query<HTMLElement>("#plate-counts");
  const numberValue = (selector: string): number => Number(query<HTMLInputElement>(selector).value);

  let model: PlateModel | null = null;
  let initialized: Promise<void> | null = null;

  const layerState = (): PlateLayerVisibility => {
    const layers = { ...DEFAULT_PLATE_LAYERS };
    for (const box of document.querySelectorAll<HTMLInputElement>("input.layer[data-layer]")) {
      const key = box.dataset.layer as keyof PlateLayerVisibility;
      if (key in layers) layers[key] = box.checked;
    }
    return layers;
  };

  const render = (): void => {
    if (model) renderPlateScene(svg, model, layerState());
    else svg.innerHTML = "";
  };

  const runBuild = async (): Promise<void> => {
    initialized ??= deps.initialize();
    await initialized;
    const shape = query<HTMLSelectElement>("#shape").value as PlateShapeId;
    const input: PlateModelInput = {
      polygon: PLATE_SHAPES[shape] ?? PLATE_SHAPES.rectangle,
      connectionEdgeIndex: numberValue("#edge"),
      wallClearanceMm: numberValue("#plate-clearance"),
      phaseUMm: numberValue("#phase-u"),
      phaseVMm: numberValue("#phase-v"),
      profile: "BEKOTEC_EN_23_FI_30_16",
    };
    let result: PlateModelResult;
    try {
      result = deps.build(input);
    } catch (error) {
      model = null;
      render();
      profile.textContent = "";
      counts.textContent = "";
      status.textContent = error instanceof Error ? error.message : String(error);
      return;
    }
    if (result.ok) {
      model = result.model;
      profile.textContent = `${result.model.profile} · ${result.model.profileVersion}`;
      const summary = result.model.validation;
      counts.textContent = `${summary.noppCount} Noppen · ${summary.nodeCount} Posen · ${summary.acceptedEdgeCount} Kanten · ${summary.rejectedEdgeCount} verworfen`;
      status.textContent = "unabhängig validiert";
    } else {
      model = null;
      profile.textContent = "";
      counts.textContent = "";
      status.textContent = `${result.error.code}: ${result.error.message}`;
    }
    render();
  };

  query<HTMLButtonElement>("#build").addEventListener("click", () => { void runBuild(); });
  for (const box of document.querySelectorAll<HTMLInputElement>("input.layer[data-layer]")) {
    box.addEventListener("change", render);
  }
  return { runBuild };
}

if (document.querySelector("#plate") && document.querySelector("#build")) {
  setupPlatePage({ initialize: initializePlateModel, build: buildPlateModel });
}
