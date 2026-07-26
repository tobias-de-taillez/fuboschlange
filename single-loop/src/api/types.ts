export interface Point {
  x: number;
  y: number;
}

export interface LinePrimitive {
  kind: "line";
  start: Point;
  end: Point;
}

export interface ArcPrimitive {
  kind: "arc";
  start: Point;
  end: Point;
  center: Point;
  radiusMm: number;
  sweepRad: number;
}

export type PathPrimitive = LinePrimitive | ArcPrimitive;

export interface ConnectionInput {
  edgeIndex: number;
  centerOffsetMm: number;
}

export interface SolveSingleLoopInput {
  polygon: Point[];
  connection: ConnectionInput;
  requestedSpacingMm: number;
  wallClearanceMm: number;
}

export interface LocatedSpacing {
  distanceMm: number;
  firstPoint: Point;
  secondPoint: Point;
  firstPathOffsetMm: number;
  secondPathOffsetMm: number;
}

export interface CoverageOutput {
  maxDistanceMm: number;
  lowerBoundMm: number;
  upperBoundMm: number;
  errorBoundMm: number;
  worstPoint: Point;
}

export interface NormalizedConnectionOutput {
  edgeIndex: number;
  requestedCenterOffsetMm: number;
  actualCenterOffsetMm: number;
  shiftedByMm: number;
  center: Point;
  firstPort: Point;
  secondPort: Point;
  startPort: Point;
  endPort: Point;
}

export interface SpacingDeviations {
  min: LocatedSpacing;
  max: LocatedSpacing;
}

export interface MinBendRadiusMm {
  lowerBoundMm: number;
  primitiveIndex: number;
  point: Point;
}

export interface MinWallClearanceMm {
  lowerBoundMm: number;
  pointOnPipe: Point;
  pointOnWall: Point;
}

export interface MinNonlocalSpacingMm {
  lowerBoundMm: number;
  firstPoint: Point;
  secondPoint: Point;
}

export interface TotalLengthMm {
  upperBoundMm: number;
  limitMm: 100000;
}

export interface ConstraintCertificate {
  insidePolygon: true;
  g1Continuous: true;
  selfIntersectionCount: 0;
  connectionZoneCompliant: true;
  bifilarTopology: true;
  minBendRadiusMm: MinBendRadiusMm;
  minWallClearanceMm: MinWallClearanceMm;
  minNonlocalSpacingMm: MinNonlocalSpacingMm;
  totalLengthMm: TotalLengthMm;
  coverageMm: CoverageOutput;
  numericToleranceMm: number;
}

export type SolverWarningCode =
  | "CONNECTION_SHIFTED"
  | "SPACING_INCREASED"
  | "SPACING_EXCEEDS_250_MM";

export interface SolverWarning {
  code: SolverWarningCode;
  details: Record<string, number | string>;
}

export type SolverErrorCode =
  | "INVALID_POLYGON"
  | "INVALID_REQUESTED_SPACING"
  | "INVALID_WALL_CLEARANCE"
  | "INVALID_CONNECTION_EDGE"
  | "NO_VALID_CONNECTION_ON_EDGE"
  | "NO_SOLUTION_GEOMETRY"
  | "NO_SOLUTION_LENGTH"
  | "SOLVER_LIMIT_EXCEEDED"
  | "INTERNAL_VALIDATION_FAILURE";

export interface SolverError {
  code: SolverErrorCode;
  message: string;
  details: Record<string, number | string | boolean>;
}

export interface SingleLoopPlan {
  solverVersion: string;
  requestHash: string;
  path: PathPrimitive[];
  normalizedConnection: NormalizedConnectionOutput;
  requestedSpacingMm: number;
  actualSpacingMm: number;
  totalLengthMm: number;
  coverage: CoverageOutput;
  spacingDeviations: SpacingDeviations;
  warnings: SolverWarning[];
  constraintCertificate: ConstraintCertificate;
}

export interface SolveSuccess {
  ok: true;
  plan: SingleLoopPlan;
}

export interface SolveFailure {
  ok: false;
  error: SolverError;
}

export type SolveResult = SolveSuccess | SolveFailure;
