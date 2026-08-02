import { beforeEach, describe, expect, it } from "vitest";
import { mountVerlegetool } from "../../src/raum-main";
import type { RoomPlan } from "../../src/verlegeplan/types";

const MARKUP = `
  <button id="impBtn"></button><input id="impFile" type="file" hidden /><p id="impName"></p>
  <input id="rectW" type="number" value="3000" /><input id="rectH" type="number" value="2400" />
  <select id="spacing"><option value="150" selected>150</option></select>
  <input id="clearance" type="number" value="75" /><input id="band" type="number" value="0" />
  <div id="countSeg"><button data-n="auto" class="on"></button></div>
  <input id="mfx" type="number" /><input id="mfy" type="number" />
  <button id="plan"></button><p id="banner"></p>
  <div id="plot"></div><div id="badge"></div><section id="cards"></section><section id="notes"></section>
`;

const rect: RoomPlan = {
  roomLocal: [
    { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 },
  ],
  measuredLocal: [
    { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 },
  ],
  bandInnerLocal: [],
  manifoldLocal: { x: 1500, y: 100 },
  frame: { origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  circuits: [],
  refused: [],
  noppCount: 1,
  measuredAreaM2: 7.2,
  rectifiedAreaM2: 7.2,
  fillAreaM2: 7.2,
  droppedWalls: 0,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mountVerlegetool", () => {
  beforeEach(() => {
    document.body.innerHTML = MARKUP;
  });

  it("Lauf hebt veraltet auf; Eingabeänderung setzt es wieder", async () => {
    mountVerlegetool({
      planner: { plan: () => Promise.resolve(rect), abort: () => {} },
      loadSurvey: () => Promise.reject(new Error("kein Aufmaß")),
    });
    await flush();
    const plot = document.getElementById("plot")!;
    expect(plot.classList.contains("stale")).toBe(false);
    expect(plot.querySelector("svg")).toBeTruthy();
    document.getElementById("spacing")!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(plot.classList.contains("stale")).toBe(true);
  });

  it("nach dem Lauf stehen die Verteiler-Weltkoordinaten in x/y", async () => {
    mountVerlegetool({
      planner: { plan: () => Promise.resolve(rect), abort: () => {} },
      loadSurvey: () => Promise.reject(new Error("kein Aufmaß")),
    });
    await flush();
    expect((document.getElementById("mfx") as HTMLInputElement).value).toBe("1500");
    expect((document.getElementById("mfy") as HTMLInputElement).value).toBe("100");
  });
});
