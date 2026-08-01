import "./styles.css";
import init, { planSchnecke } from "./wasm/pkg/single_loop_solver.js";

/** Millimetres throughout — the wire shape of `circuit::SchneckeInput`. */
export interface SchneckeInput {
  widthMm: number;
  heightMm: number;
  pipeSpacingMm: number;
  wallClearanceMm: number;
  connectionOffsetMm: number;
  zoneWidthMm: number;
}

/** The wire shape of `circuit::SchneckePlan`. */
export interface SchneckePlan {
  svg: string;
  lanes: number;
  totalLengthMm: number;
  coverageWorstMm: number;
  minBendRadiusMm: number;
  minCenterDistanceMm: number;
  penaltySumMm: number;
  noppCount: number;
  zoneDepthMm: number;
}

export interface SchneckePageDeps {
  initialize: () => Promise<void>;
  plan: (input: SchneckeInput) => SchneckePlan;
}

const MAX_LOOP_LENGTH_MM = 100_000;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function number(id: string): number {
  return Number(element<HTMLInputElement | HTMLSelectElement>(id).value);
}

function metres(millimetres: number): string {
  return `${(millimetres / 1000).toFixed(2)} m`;
}

/**
 * Where the manifold connects, in millimetres along the bottom wall, kept
 * inside the room.
 *
 * Shrinking the room can leave the offset outside it, and the solver then
 * rejects the whole plan over a number the user never touched. Recentring is
 * *written back into the field* rather than applied silently, so what is
 * planned is what is shown.
 */
export function clampOffset(offsetMm: number, widthMm: number, zoneWidthMm: number): number {
  const margin = zoneWidthMm / 2 + 50;
  if (widthMm <= 2 * margin) return widthMm / 2;
  return Math.min(Math.max(offsetMm, margin), widthMm - margin);
}

/** Reads the controls into the solver's input. */
export function readInput(): SchneckeInput {
  const widthMm = number("width");
  const zoneWidthMm = number("zone");
  const offset = element<HTMLInputElement>("offset");
  const offsetMm = clampOffset(Number(offset.value), widthMm, zoneWidthMm);
  if (offsetMm !== Number(offset.value)) offset.value = String(Math.round(offsetMm));
  return {
    widthMm,
    heightMm: number("height"),
    pipeSpacingMm: number("spacing"),
    wallClearanceMm: number("clearance"),
    connectionOffsetMm: offsetMm,
    zoneWidthMm,
  };
}

/**
 * The report beside the drawing. Every line is a number the validator
 * measured, not one this page derived — except the length verdict, which is
 * the spec's 100 m ceiling applied to the measured length.
 */
export function describe(plan: SchneckePlan): { term: string; value: string; ok?: boolean }[] {
  return [
    { term: "Bahnen", value: String(plan.lanes) },
    {
      term: "Rohrlänge",
      value: metres(plan.totalLengthMm),
      ok: plan.totalLengthMm <= MAX_LOOP_LENGTH_MM,
    },
    {
      term: "Mindestbiegeradius",
      value: `${plan.minBendRadiusMm.toFixed(1)} mm`,
      ok: plan.minBendRadiusMm >= 80,
    },
    {
      // Two floors, deliberately different. This one is the hard one: no two
      // pipes may come closer than a pipe diameter anywhere. The 50 mm
      // nominal below is the soft one, and it is measured only between pipes
      // that are far apart *along the loop* — inside a single turn the two
      // legs are meant to be close.
      term: "Engster Rohrabstand",
      value: `${plan.minCenterDistanceMm.toFixed(1)} mm (≥ 16 mm gefordert)`,
      ok: plan.minCenterDistanceMm >= 16,
    },
    {
      term: "Abstandsstrafe unter 50 mm",
      value: `${plan.penaltySumMm.toFixed(1)} mm`,
      ok: plan.penaltySumMm === 0,
    },
    {
      term: "Schlechteste Deckung",
      value: `${plan.coverageWorstMm.toFixed(0)} mm zur nächsten Rohrachse`,
    },
    { term: "Noppen im Modell", value: String(plan.noppCount) },
    { term: "Zonentiefe (erzwungen)", value: `${plan.zoneDepthMm.toFixed(0)} mm` },
  ];
}

export function setupSchneckePage(deps: SchneckePageDeps): { runPlan: () => Promise<void> } {
  const plot = element("plot");
  const status = element("status");
  const numbers = element<HTMLDListElement>("numbers");

  async function runPlan(): Promise<void> {
    status.textContent = "Plane …";
    status.className = "";
    numbers.replaceChildren();
    try {
      await deps.initialize();
      const plan = deps.plan(readInput());
      plot.innerHTML = plan.svg;
      status.textContent = "Zertifiziert. Verlegbar.";
      status.className = "ok";
      for (const row of describe(plan)) {
        const term = document.createElement("dt");
        term.textContent = row.term;
        const value = document.createElement("dd");
        value.textContent = row.value;
        if (row.ok === false) value.className = "warn";
        numbers.append(term, value);
      }
    } catch (error) {
      // A rejection is the honest answer, not an empty page: the solver
      // refuses to draw anything the validator would not certify.
      plot.replaceChildren();
      status.textContent = error instanceof Error ? error.message : String(error);
      status.className = "warn";
    }
  }

  element("plan").addEventListener("click", () => void runPlan());
  for (const id of ["width", "height", "spacing", "clearance", "offset", "zone"]) {
    element(id).addEventListener("change", () => void runPlan());
  }
  return { runPlan };
}

let ready: Promise<void> | undefined;

if (typeof document !== "undefined" && document.getElementById("plot")) {
  const page = setupSchneckePage({
    initialize: () => (ready ??= init().then(() => undefined)),
    plan: (input) => planSchnecke(input) as SchneckePlan,
  });
  void page.runPlan();
}
