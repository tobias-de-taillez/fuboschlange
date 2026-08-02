import "./styles.css";
import type { RoomWorkerRequest, RoomWorkerResponse } from "./worker/room-protocol";

/** A point in whatever frame the surrounding type says. Millimetres. */
export interface Pt {
  x: number;
  y: number;
}

/** The wire shape of `circuit::RoomPlanInput`. */
export interface RoomPlanInput {
  ring: Pt[];
  manifold: Pt | null;
  fillSpacingMm: number;
  wallClearanceMm: number;
  edgeBandMm: number;
}

export interface RoomCircuit {
  rectLocal: { min: Pt; max: Pt };
  pathD: string;
  pipeSpacingMm: number;
  lanes: number;
  totalLengthMm: number;
  minBendRadiusMm: number;
  minCenterDistanceMm: number;
  penaltySumMm: number;
}

/** The wire shape of `circuit::RoomPlan`. */
export interface RoomPlan {
  roomLocal: Pt[];
  measuredLocal: Pt[];
  bandInnerLocal: Pt[];
  manifoldLocal: Pt | null;
  frame: { origin: Pt; u: Pt; v: Pt };
  circuits: RoomCircuit[];
  refused: string[];
  noppCount: number;
  measuredAreaM2: number;
  rectifiedAreaM2: number;
  fillAreaM2: number;
  droppedWalls: number;
}

/** A raumaufmass export, as much of it as the plan needs. */
export interface Survey {
  pts: { id: string; x: number; y: number }[];
  walls: [string, string][];
  name?: string;
}

/** The nub raster: nubs on a 75 mm grid, pipes in the channels between them. */
const NOPP_PITCH_MM = 75;
const LARGE_NOPP_RADIUS_MM = 17.5;
const SMALL_NOPP_RADIUS_MM = 10.5;

const INK = ["#c2410c", "#1d4ed8", "#15803d", "#7e22ce", "#b91c1c", "#0f766e"];

/**
 * The measured outline, walked from the survey's points and walls.
 *
 * A closed ring gives every point exactly two walls, so following the unused
 * neighbour from any start walks the outline once. Fails loudly rather than
 * silently planning half a room.
 */
export function ringFromSurvey(survey: Survey): Pt[] {
  const byId = new Map(survey.pts.map((point) => [point.id, { x: point.x, y: point.y }]));
  const neighbours = new Map<string, string[]>();
  for (const [from, to] of survey.walls) {
    if (!neighbours.has(from)) neighbours.set(from, []);
    if (!neighbours.has(to)) neighbours.set(to, []);
    neighbours.get(from)!.push(to);
    neighbours.get(to)!.push(from);
  }
  for (const [id, list] of neighbours) {
    if (list.length !== 2) {
      throw new Error(`Punkt ${id} hat ${list.length} Wände statt zwei — der Ring ist offen`);
    }
  }

  const start = survey.walls[0]?.[0];
  if (!start) throw new Error("Das Aufmaß hat keine Wände");
  const ring = [start];
  let previous: string | null = null;
  let current = start;
  for (;;) {
    const next = neighbours.get(current)!.find((candidate) => candidate !== previous);
    if (!next) throw new Error(`Der Wandzug endet bei ${current}`);
    if (next === start) break;
    ring.push(next);
    previous = current;
    current = next;
  }
  if (ring.length !== neighbours.size) {
    throw new Error(
      `Die Wände bilden ${ring.length} von ${neighbours.size} Punkten — mehr als einen Ring`,
    );
  }
  return ring.map((id) => byId.get(id)!);
}

/** `world = origin + u·local.x + v·local.y`, inverted. */
export function toWorld(frame: RoomPlan["frame"], local: Pt): Pt {
  return {
    x: frame.origin.x + frame.u.x * local.x + frame.v.x * local.y,
    y: frame.origin.y + frame.u.y * local.x + frame.v.y * local.y,
  };
}

interface View {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** The drawing frame: everything the plan puts on paper, plus a margin. */
export function viewOf(plan: RoomPlan, marginMm: number): View {
  const points = [...plan.measuredLocal, ...plan.roomLocal];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - marginMm;
  const minY = Math.min(...ys) - marginMm;
  return {
    minX,
    minY,
    width: Math.max(...xs) + marginMm - minX,
    height: Math.max(...ys) + marginMm - minY,
  };
}

function polygon(points: Pt[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

/**
 * The nub field, drawn as it lies: one lattice for the whole room, large and
 * small nubs alternating, clipped to the room outline.
 *
 * Drawn from the same rule the solver's motif uses rather than from a list of
 * positions, so the picture cannot drift from the model by a stale payload.
 */
function noppen(plan: RoomPlan, view: View): string {
  const first = Math.ceil(view.minX / NOPP_PITCH_MM);
  const last = Math.floor((view.minX + view.width) / NOPP_PITCH_MM);
  const bottom = Math.ceil(view.minY / NOPP_PITCH_MM);
  const top = Math.floor((view.minY + view.height) / NOPP_PITCH_MM);
  const parts: string[] = [];
  for (let i = first; i <= last; i += 1) {
    for (let j = bottom; j <= top; j += 1) {
      const large = (Math.abs(i % 2) + Math.abs(j % 2)) % 2 === 0;
      const radius = large ? LARGE_NOPP_RADIUS_MM : SMALL_NOPP_RADIUS_MM;
      parts.push(
        `<circle cx="${i * NOPP_PITCH_MM}" cy="${j * NOPP_PITCH_MM}" r="${radius}" />`,
      );
    }
  }
  return `<g clip-path="url(#room)" fill="#d9d4cc">${parts.join("")}</g>`;
}

/** The whole plan as one SVG, in the shared plate-local frame. */
export function render(plan: RoomPlan): string {
  const view = viewOf(plan, 400);
  // The local frame has y up, the screen has y down; one flip on the group
  // keeps every coordinate below in the frame the solver reports.
  const flip = `translate(0 ${(2 * view.minY + view.height).toFixed(1)}) scale(1 -1)`;
  const circuits = plan.circuits
    .map((circuit, index) => {
      const ink = INK[index % INK.length];
      return (
        `<path d="${circuit.pathD}" fill="none" stroke="${ink}" stroke-width="16" ` +
        `stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />`
      );
    })
    .join("");
  const manifold = plan.manifoldLocal
    ? `<g><circle cx="${plan.manifoldLocal.x}" cy="${plan.manifoldLocal.y}" r="90" ` +
      `fill="#111" opacity="0.85" /><circle cx="${plan.manifoldLocal.x}" ` +
      `cy="${plan.manifoldLocal.y}" r="150" fill="none" stroke="#111" stroke-width="14" ` +
      `stroke-dasharray="40 30" /></g>`
    : "";
  const band =
    plan.bandInnerLocal.length > 0
      ? `<polygon points="${polygon(plan.bandInnerLocal)}" fill="none" stroke="#a16207" ` +
        `stroke-width="10" stroke-dasharray="60 40" />`
      : "";

  return `<svg viewBox="${view.minX.toFixed(1)} ${view.minY.toFixed(1)} ${view.width.toFixed(
    1,
  )} ${view.height.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" id="sheet">
  <defs><clipPath id="room"><polygon points="${polygon(plan.roomLocal)}" /></clipPath></defs>
  <g transform="${flip}">
    ${noppen(plan, view)}
    <polygon points="${polygon(plan.measuredLocal)}" fill="none" stroke="#9ca3af"
      stroke-width="8" stroke-dasharray="50 40" />
    <polygon points="${polygon(plan.roomLocal)}" fill="none" stroke="#111" stroke-width="14" />
    ${band}
    ${circuits}
    ${manifold}
  </g>
</svg>`;
}

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

/**
 * One plan at a time, off the page's thread.
 *
 * A room takes tens of seconds to plan, so a click that lands while one is
 * running would otherwise queue behind it and the user would watch a stale
 * drawing. Each request carries an id and only the newest one is drawn; the
 * older ones finish and are dropped.
 */
export function workerPlanner(worker: Worker): (input: RoomPlanInput) => Promise<RoomPlan> {
  let next = 0;
  const pending = new Map<number, { resolve: (plan: RoomPlan) => void; reject: (why: Error) => void }>();
  // A worker that dies — a bad import, a wasm that will not load — otherwise
  // just goes quiet and the page says "rechnet …" for ever. Fail the waiting
  // requests instead, with what the browser said.
  const fail = (why: string) => {
    for (const [id, waiting] of pending) {
      pending.delete(id);
      waiting.reject(new Error(why));
    }
  };
  worker.onerror = (event) => fail(event.message || "Der Rechen-Worker ist abgestürzt");
  worker.onmessageerror = () => fail("Der Rechen-Worker hat eine unlesbare Antwort geschickt");
  worker.onmessage = (event: MessageEvent<RoomWorkerResponse>) => {
    const message = event.data;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.ok) waiting.resolve(message.plan as RoomPlan);
    else waiting.reject(new Error(message.message));
  };
  return (input) =>
    new Promise<RoomPlan>((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, input } satisfies RoomWorkerRequest);
    });
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
  let frame: RoomPlan["frame"] | null = null;

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
  mountRoomPage({
    plan: workerPlanner(
      new Worker(new URL("./worker/room.worker.ts", import.meta.url), { type: "module" }),
    ),
    loadSurvey: async () => {
      const response = await fetch("./fixtures/rooms/wintergarten-2026-08-02.json");
      if (!response.ok) throw new Error("Kein Aufmaß geladen — bitte eine Datei wählen");
      return (await response.json()) as Survey;
    },
  });
}
