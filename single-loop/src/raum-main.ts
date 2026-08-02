import "./styles.css";
import type { Frame, Pt, RoomPlan, RoomPlanInput, Survey } from "./verlegeplan/types";
import { ringFromSurvey } from "./verlegeplan/survey";
import { INK, render, toWorld } from "./verlegeplan/sheet";
import { workerPlanner } from "./verlegeplan/planner";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function metres(millimetres: number): string {
  return `${(millimetres / 1000).toFixed(1)} m`;
}

export interface RoomPageDeps {
  /** Resolves with the plan, or rejects with why the room admits none. */
  plan: (input: RoomPlanInput) => Promise<RoomPlan>;
  loadSurvey: () => Promise<Survey>;
}

export function mountRoomPage(deps: RoomPageDeps): void {
  const banner = element("banner");
  const plot = element("plot");
  const circuitList = element<HTMLUListElement>("circuits");
  const refusedList = element<HTMLUListElement>("refused");
  const facts = element<HTMLDListElement>("facts");

  let survey: Survey | null = null;
  let ring: Pt[] = [];
  let manifold: Pt | null = null;
  let frame: Frame | null = null;

  function describe(plan: RoomPlan): void {
    const total = plan.circuits.reduce((sum, circuit) => sum + circuit.totalLengthMm, 0);
    banner.textContent =
      `${plan.circuits.length} Kreise, ${metres(total)} Rohr, ` +
      `ein Noppenfeld mit ${plan.noppCount} Noppen` +
      (manifold ? "" : " · Verteiler noch nicht gesetzt");

    circuitList.innerHTML = plan.circuits
      .map((circuit, index) => {
        const ink = INK[index % INK.length];
        return (
          `<li><span class="swatch" style="background:${ink}"></span>` +
          `Kreis ${index + 1}: <strong>${metres(circuit.totalLengthMm)}</strong> ` +
          `bei ${circuit.pipeSpacingMm.toFixed(0)} mm, ${circuit.lanes} Bahnen, ` +
          `Biegeradius ${circuit.minBendRadiusMm.toFixed(0)} mm, ` +
          `Strafe ${circuit.penaltySumMm.toFixed(0)} mm</li>`
        );
      })
      .join("");

    facts.innerHTML =
      `<dt>gemessen</dt><dd>${plan.measuredAreaM2.toFixed(2)} m²</dd>` +
      `<dt>begradigt</dt><dd>${plan.rectifiedAreaM2.toFixed(2)} m²</dd>` +
      `<dt>Füllfläche</dt><dd>${plan.fillAreaM2.toFixed(2)} m²</dd>` +
      `<dt>kurze Wände verworfen</dt><dd>${plan.droppedWalls}</dd>`;

    refusedList.innerHTML =
      plan.refused.length > 0
        ? plan.refused.map((reason) => `<li>${reason}</li>`).join("")
        : "<li>nichts — jedes Feld hat seinen Kreis</li>";
  }

  // Only the newest request is drawn. A room takes tens of seconds, so a second
  // click while one is running must not repaint the page with the first one's
  // answer once it finally arrives.
  let latest = 0;

  function replan(): void {
    if (ring.length === 0) return;
    const mine = ++latest;
    banner.textContent = "rechnet …";
    void deps
      .plan({
        ring,
        manifold,
        fillSpacingMm: Number(element<HTMLSelectElement>("spacing").value),
        wallClearanceMm: Number(element<HTMLInputElement>("clearance").value),
        edgeBandMm: Number(element<HTMLInputElement>("band").value),
        circuitCount: null,
      })
      .then((plan) => {
        if (mine !== latest) return;
        frame = plan.frame;
        plot.innerHTML = render(plan);
        describe(plan);
      })
      .catch((error: unknown) => {
        if (mine !== latest) return;
        banner.textContent = `${error}`;
      });
  }

  // Clicking the sheet puts the manifold there. The click arrives in the
  // drawing's own frame, which is the solver's local one flipped; undoing the
  // flip and mapping back through `frame` is what turns it into a position in
  // the survey's coordinates, which is what `plan_room` takes.
  plot.addEventListener("click", (event) => {
    const sheet = plot.querySelector("svg");
    if (!sheet || !frame) return;
    const box = sheet.getBoundingClientRect();
    const viewBox = sheet.getAttribute("viewBox")!.split(" ").map(Number);
    if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) return;
    const [minX, minY, width, height] = viewBox as [number, number, number, number];
    const localX = minX + ((event.clientX - box.left) / box.width) * width;
    const flipped = minY + ((event.clientY - box.top) / box.height) * height;
    const localY = 2 * minY + height - flipped;
    manifold = toWorld(frame, { x: localX, y: localY });
    replan();
  });

  element("plan").addEventListener("click", replan);
  for (const id of ["spacing", "clearance", "band"]) {
    element(id).addEventListener("change", replan);
  }

  element<HTMLInputElement>("file").addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      survey = JSON.parse(await file.text()) as Survey;
      ring = ringFromSurvey(survey);
      manifold = null;
      replan();
    } catch (error) {
      banner.textContent = `${error}`;
    }
  });

  void (async () => {
    try {
      survey = await deps.loadSurvey();
      ring = ringFromSurvey(survey);
      replan();
    } catch (error) {
      banner.textContent = `${error}`;
    }
  })();
}

if (typeof document !== "undefined" && document.getElementById("plot")) {
  const planner = workerPlanner(
    () => new Worker(new URL("./worker/room.worker.ts", import.meta.url), { type: "module" }),
  );
  mountRoomPage({
    plan: (input) => planner.plan(input),
    loadSurvey: async () => {
      const response = await fetch("./fixtures/rooms/wintergarten-2026-08-02.json");
      if (!response.ok) throw new Error("Kein Aufmaß geladen — bitte eine Datei wählen");
      return (await response.json()) as Survey;
    },
  });
}
