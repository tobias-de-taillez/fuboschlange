import { INK } from "./sheet";
import type { RoomPlan } from "./types";

function metres(millimetres: number): string {
  return `${(millimetres / 1000).toFixed(1)} m`;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found;
}

/**
 * Badge, Karten und Notes — ausschließlich aus dem RoomPlan. Hier wird nichts
 * nachgerechnet und nichts selbst geprüft: eine Zahl erscheint, weil das
 * Zertifikat des Solvers sie liefert, oder gar nicht.
 */
export function showAuswertung(plan: RoomPlan): void {
  const total = plan.circuits.reduce((sum, circuit) => sum + circuit.totalLengthMm, 0);
  element("badge").textContent =
    `${plan.circuits.length} Heizkreis${plan.circuits.length === 1 ? "" : "e"} · ${metres(total)}`;

  const circuitCards = plan.circuits.map((circuit, index) => {
    const ink = INK[index % INK.length];
    return `<div class="card" style="border-left:4px solid ${ink}">
      <span class="big">${metres(circuit.totalLengthMm)}</span>
      Kreis ${index + 1} · ${circuit.pipeSpacingMm.toFixed(0)} mm · ${circuit.lanes} Bahnen<br />
      Biegeradius ${circuit.minBendRadiusMm.toFixed(0)} mm ·
      Mindestabstand ${circuit.minCenterDistanceMm.toFixed(0)} mm<br />
      Strafe ${circuit.penaltySumMm.toFixed(0)} mm · <strong>zertifiziert</strong>
    </div>`;
  });
  const roomCards = [
    `<div class="card"><span class="big">${plan.rectifiedAreaM2.toFixed(2)} m²</span>
      begradigt (gemessen ${plan.measuredAreaM2.toFixed(2)} m²)</div>`,
    `<div class="card"><span class="big">${plan.fillAreaM2.toFixed(2)} m²</span>
      Füllfläche nach Randzone</div>`,
    `<div class="card"><span class="big">${plan.noppCount}</span>
      Noppen, ein Feld für alle Kreise</div>`,
  ];
  element("cards").innerHTML = [...circuitCards, ...roomCards].join("");

  const notes: string[] = [];
  for (const refusal of plan.refused) notes.push(`Nicht belegt: ${refusal}`);
  if (plan.bandInnerLocal.length > 0) {
    notes.push("Randzone reserviert — der Streifen ist freigehalten, das Band selbst noch nicht verlegt.");
  }
  if (plan.droppedWalls > 0) {
    notes.push(`${plan.droppedWalls} kurze Wände als Aufmaß-Artefakte verworfen.`);
  }
  element("notes").innerHTML = notes.length
    ? `<ul>${notes.map((note) => `<li>${note}</li>`).join("")}</ul>`
    : "";
}
