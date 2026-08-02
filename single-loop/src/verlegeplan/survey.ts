import type { Pt, Survey } from "./types";

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
