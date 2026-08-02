import type { Pt, RoomPlanInput } from "./types";

export interface PanelDeps {
  /** Jede Eingabeänderung — der Aufrufer markiert das Blatt „veraltet". */
  onChange(): void;
  onImport(file: File): void;
  /** x/y-Felder wurden von Hand gesetzt (Weltkoordinaten des Aufmaßes). */
  onManifoldEntry(world: Pt): void;
}

export interface PanelHandle {
  readInput(ring: Pt[], manifold: Pt | null): RoomPlanInput;
  rectRing(): Pt[];
  setSurveyName(name: string | null): void;
  setManifoldFields(world: Pt | null): void;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function numberOf(id: string): number {
  return Number(element<HTMLInputElement | HTMLSelectElement>(id).value);
}

/**
 * Die Seitenleiste. Sie kennt weder Worker noch Blatt: sie liest Eingaben,
 * meldet Änderungen, und baut aus Breite/Tiefe notfalls den Rechteck-Ring.
 * Was der Solver nicht kann, steht hier gar nicht erst als Eingabe.
 */
export function mountPanel(deps: PanelDeps): PanelHandle {
  let circuitCount: number | null = null;

  const seg = element<HTMLDivElement>("countSeg");
  seg.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    for (const other of seg.querySelectorAll("button")) other.classList.remove("on");
    button.classList.add("on");
    const n = button.dataset.n;
    circuitCount = n === "auto" || n === undefined ? null : Number(n);
    deps.onChange();
  });

  for (const id of ["rectW", "rectH", "spacing", "clearance", "band"]) {
    element(id).addEventListener("change", () => deps.onChange());
  }

  const manifoldEntry = () => {
    const x = numberOf("mfx");
    const y = numberOf("mfy");
    if (Number.isFinite(x) && Number.isFinite(y)) deps.onManifoldEntry({ x, y });
  };
  element("mfx").addEventListener("change", manifoldEntry);
  element("mfy").addEventListener("change", manifoldEntry);

  element("impBtn").addEventListener("click", () => element<HTMLInputElement>("impFile").click());
  element<HTMLInputElement>("impFile").addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) deps.onImport(file);
  });

  return {
    readInput: (ring, manifold) => ({
      ring,
      manifold,
      fillSpacingMm: numberOf("spacing"),
      wallClearanceMm: numberOf("clearance"),
      edgeBandMm: numberOf("band"),
      circuitCount,
    }),
    rectRing: () => {
      const width = numberOf("rectW");
      const height = numberOf("rectH");
      return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ];
    },
    setSurveyName: (name) => {
      element("impName").textContent = name ? `Aufmaß: ${name}` : "";
      element<HTMLInputElement>("rectW").disabled = name !== null;
      element<HTMLInputElement>("rectH").disabled = name !== null;
    },
    setManifoldFields: (world) => {
      element<HTMLInputElement>("mfx").value = world ? String(Math.round(world.x)) : "";
      element<HTMLInputElement>("mfy").value = world ? String(Math.round(world.y)) : "";
    },
  };
}
