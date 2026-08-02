import { beforeEach, describe, expect, it } from "vitest";
import { showAuswertung } from "../../src/verlegeplan/auswertung";
import type { RoomPlan } from "../../src/verlegeplan/types";

const plan: RoomPlan = {
  roomLocal: [],
  measuredLocal: [],
  bandInnerLocal: [{ x: 0, y: 0 }],
  manifoldLocal: { x: 1, y: 2 },
  frame: { origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  circuits: [
    {
      rectLocal: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
      pathD: "M0 0",
      pipeSpacingMm: 150,
      lanes: 7,
      totalLengthMm: 43500,
      minBendRadiusMm: 80,
      minCenterDistanceMm: 66,
      penaltySumMm: 0,
    },
  ],
  refused: ["field at (1, 2): zu lang"],
  noppCount: 6552,
  measuredAreaM2: 29.45,
  rectifiedAreaM2: 28.08,
  fillAreaM2: 21.17,
  droppedWalls: 4,
};

describe("showAuswertung", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="badge"></div><section id="cards"></section><section id="notes"></section>`;
  });

  it("Badge nennt Kreise und Gesamtlänge", () => {
    showAuswertung(plan);
    expect(document.getElementById("badge")!.textContent).toContain("1 Heizkreis");
    expect(document.getElementById("badge")!.textContent).toContain("43.5 m");
  });

  it("Kreis-Karte trägt die Zertifikatswerte", () => {
    showAuswertung(plan);
    const cards = document.getElementById("cards")!.textContent!;
    expect(cards).toContain("43.5 m");
    expect(cards).toContain("80");
    expect(cards).toContain("zertifiziert");
    expect(cards).toContain("6552");
  });

  it("Notes zeigen jede Ablehnung und den Randzonen-Hinweis", () => {
    showAuswertung(plan);
    const notes = document.getElementById("notes")!.textContent!;
    expect(notes).toContain("zu lang");
    expect(notes).toContain("Randzone");
  });

  it("keine Häkchen-Selbstprüfungen", () => {
    showAuswertung(plan);
    expect(document.body.textContent).not.toContain("✓");
  });
});
