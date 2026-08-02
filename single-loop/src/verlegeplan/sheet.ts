import type { Frame, Pt, RoomPlan } from "./types";

/** The nub raster: nubs on a 75 mm grid, pipes in the channels between them. */
export const NOPP_PITCH_MM = 75;
const LARGE_NOPP_RADIUS_MM = 17.5;
const SMALL_NOPP_RADIUS_MM = 10.5;

export const INK = ["#c2410c", "#1d4ed8", "#15803d", "#7e22ce", "#b91c1c", "#0f766e"];

/** `world = origin + u·local.x + v·local.y`, inverted. */
export function toWorld(frame: Frame, local: Pt): Pt {
  return {
    x: frame.origin.x + frame.u.x * local.x + frame.v.x * local.y,
    y: frame.origin.y + frame.u.y * local.x + frame.v.y * local.y,
  };
}

/** world → local, exact inverse of toWorld: u and v are orthonormal. */
export function toLocal(frame: Frame, world: Pt): Pt {
  const dx = world.x - frame.origin.x;
  const dy = world.y - frame.origin.y;
  return { x: dx * frame.u.x + dy * frame.u.y, y: dx * frame.v.x + dy * frame.v.y };
}

export interface View {
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

/**
 * The whole plan as one SVG, in the shared plate-local frame.
 *
 * The override lets the page move the manifold marker without a fresh run —
 * the drawing stays the certified one, only the marker moves (Spec §4).
 */
export function render(
  plan: RoomPlan,
  override: { manifoldLocal?: Pt | null } = {},
): string {
  const manifoldLocal =
    override.manifoldLocal !== undefined ? override.manifoldLocal : plan.manifoldLocal;
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
  const manifold = manifoldLocal
    ? `<g><circle cx="${manifoldLocal.x}" cy="${manifoldLocal.y}" r="90" ` +
      `fill="#111" opacity="0.85" /><circle cx="${manifoldLocal.x}" ` +
      `cy="${manifoldLocal.y}" r="150" fill="none" stroke="#111" stroke-width="14" ` +
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
