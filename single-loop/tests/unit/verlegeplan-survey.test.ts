import { describe, expect, it } from "vitest";
import { ringFromSurvey } from "../../src/verlegeplan/survey";

const square = {
  pts: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 1000, y: 0 },
    { id: "C", x: 1000, y: 1000 },
    { id: "D", x: 0, y: 1000 },
  ],
  walls: [
    ["A", "B"],
    ["B", "C"],
    ["C", "D"],
    ["D", "A"],
  ] as [string, string][],
};

describe("ringFromSurvey", () => {
  it("walks a closed ring in wall order", () => {
    const ring = ringFromSurvey(square);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual({ x: 0, y: 0 });
  });

  it("rejects an open ring loudly", () => {
    const open = { ...square, walls: square.walls.slice(0, 3) };
    expect(() => ringFromSurvey(open)).toThrowError(/Ring ist offen/);
  });
});
