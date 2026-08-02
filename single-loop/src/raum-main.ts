import "./styles.css";
import { showAuswertung } from "./verlegeplan/auswertung";
import { mountPanel } from "./verlegeplan/panel";
import { type Planner, workerPlanner } from "./verlegeplan/planner";
import { render, toLocal, toWorld } from "./verlegeplan/sheet";
import { ringFromSurvey } from "./verlegeplan/survey";
import type { Pt, RoomPlan, Survey } from "./verlegeplan/types";

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found;
}

export interface VerlegetoolDeps {
  planner: Planner;
  loadSurvey: () => Promise<Survey>;
}

/**
 * Die Verdrahtung, und nur die: Panel und Auswertung kennen einander nicht.
 *
 * Lauf-Lebenszyklus (Spec §5): Eingaben markieren das Blatt „veraltet";
 * gerechnet wird nur über den Button oder den Verteiler-Klick. Ein neuer
 * Start bricht den laufenden Lauf ab (Worker-Terminate), und die Statuszeile
 * zählt die Sekunden mit — die Wartezeit wird gezeigt, nicht kaschiert.
 */
export function mountVerlegetool(deps: VerlegetoolDeps): void {
  const banner = element("banner");
  const plot = element("plot");

  let ring: Pt[] = [];
  let manifold: Pt | null = null;
  let lastPlan: RoomPlan | null = null;
  let ticker: number | undefined;

  const panel = mountPanel({
    onChange: () => plot.classList.add("stale"),
    onImport: (file) => {
      void file.text().then((text) => {
        try {
          const survey = JSON.parse(text) as Survey;
          ring = ringFromSurvey(survey);
          manifold = null;
          panel.setSurveyName(survey.name ?? file.name);
          panel.setManifoldFields(null);
          replan();
        } catch (error) {
          banner.textContent = `${error}`;
        }
      });
    },
    onManifoldEntry: (world) => {
      manifold = world;
      plot.classList.add("stale");
      if (lastPlan) {
        plot.innerHTML = render(lastPlan, { manifoldLocal: toLocal(lastPlan.frame, world) });
      }
    },
  });

  function startTicker(): void {
    const startedAt = Date.now();
    stopTicker();
    ticker = window.setInterval(() => {
      banner.textContent = `rechnet … ${Math.round((Date.now() - startedAt) / 1000)} s`;
    }, 1000);
    banner.textContent = "rechnet …";
  }
  function stopTicker(): void {
    if (ticker !== undefined) window.clearInterval(ticker);
    ticker = undefined;
  }

  function replan(): void {
    if (ring.length === 0) {
      ring = panel.rectRing();
    }
    deps.planner.abort();
    startTicker();
    deps.planner
      .plan(panel.readInput(ring, manifold))
      .then((plan) => {
        stopTicker();
        lastPlan = plan;
        plot.classList.remove("stale");
        plot.innerHTML = render(plan);
        showAuswertung(plan);
        banner.textContent = "";
        panel.setManifoldFields(
          plan.manifoldLocal ? toWorld(plan.frame, plan.manifoldLocal) : null,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        stopTicker();
        banner.textContent = `${error}`;
      });
  }

  // Klick aufs Blatt: Verteiler dorthin, sofort neu planen (bewusste Aktion).
  plot.addEventListener("click", (event) => {
    const sheet = plot.querySelector("svg");
    if (!sheet || !lastPlan) return;
    const box = sheet.getBoundingClientRect();
    const viewBox = sheet.getAttribute("viewBox")!.split(" ").map(Number);
    if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) return;
    const [minX, minY, width, height] = viewBox as [number, number, number, number];
    const localX = minX + ((event.clientX - box.left) / box.width) * width;
    const flipped = minY + ((event.clientY - box.top) / box.height) * height;
    const localY = 2 * minY + height - flipped;
    manifold = toWorld(lastPlan.frame, { x: localX, y: localY });
    panel.setManifoldFields(manifold);
    replan();
  });

  element("plan").addEventListener("click", replan);

  void (async () => {
    try {
      const survey = await deps.loadSurvey();
      ring = ringFromSurvey(survey);
      panel.setSurveyName(survey.name ?? "Aufmaß");
    } catch {
      ring = panel.rectRing();
      panel.setSurveyName(null);
    }
    replan();
  })();
}

if (typeof document !== "undefined" && document.getElementById("plot")) {
  mountVerlegetool({
    planner: workerPlanner(
      () => new Worker(new URL("./worker/room.worker.ts", import.meta.url), { type: "module" }),
    ),
    loadSurvey: async () => {
      const response = await fetch("./fixtures/rooms/wintergarten-2026-08-02.json");
      if (!response.ok) throw new Error("kein Standard-Aufmaß");
      return (await response.json()) as Survey;
    },
  });
}
