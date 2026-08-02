/** A point in whatever frame the surrounding type says. Millimetres. */
export interface Pt {
  x: number;
  y: number;
}

/** An orthonormal local frame: `world = origin + u·local.x + v·local.y`. */
export interface Frame {
  origin: Pt;
  u: Pt;
  v: Pt;
}

/** The wire shape of `circuit::RoomPlanInput`. */
export interface RoomPlanInput {
  ring: Pt[];
  manifold: Pt | null;
  fillSpacingMm: number;
  wallClearanceMm: number;
  edgeBandMm: number;
  /** null = auto: die Flächenarithmetik entscheidet. Wire-Name des Solvers. */
  circuitCount: number | null;
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
  frame: Frame;
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
