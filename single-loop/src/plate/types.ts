import type { PathPrimitive, Point } from "../api/types";

export type PlateProfileId = "BEKOTEC_EN_23_FI_30_16";
export type NoppType = "LARGE" | "SMALL";
export type Heading8 = "DEG0" | "DEG45" | "DEG90" | "DEG135" | "DEG180" | "DEG225" | "DEG270" | "DEG315";
export type TemplateId =
  | "STRAIGHT0"
  | "STRAIGHT45"
  | "BROAD_TURN45"
  | "BROAD_TURN90"
  | "BROAD_TURN135"
  | "BROAD_REVERSE180"
  | "TEARDROP_REVERSE"
  | "HANDBOOK_REJECTED_TIGHT90"
  | "HANDBOOK_REJECTED_TIGHT_U";

export interface PlateModelInput {
  polygon: Point[];
  connectionEdgeIndex: number;
  wallClearanceMm: number;
  phaseUMm: number;
  phaseVMm: number;
  profile: PlateProfileId;
}

export interface PlateTransformOutput {
  origin: Point;
  u: Point;
  v: Point;
  phaseUMm: number;
  phaseVMm: number;
}

export interface NoppIndex { i: number; j: number }

export interface Nopp {
  index: NoppIndex;
  noppType: NoppType;
  center: Point;
  renderedRadiusMm: number;
  effectiveRadiusMm: number;
  forbiddenRadiusMm: number;
}

export interface LocalPose { point: Point; heading: Heading8 }

export interface PoseNode {
  id: number;
  localPose: LocalPose;
  worldPoint: Point;
}

export interface TemplateTransform {
  quarterTurns: number;
  reflected: boolean;
  reversed: boolean;
  periodI: number;
  periodJ: number;
}

export interface PlateEdgeCertificate {
  minNoppClearanceMm: number;
  minBendRadiusMm: number;
}

export interface PoseEdge {
  id: number;
  start: PoseNode;
  end: PoseNode;
  templateId: TemplateId;
  templateTransform: TemplateTransform;
  primitives: PathPrimitive[];
  certificate: PlateEdgeCertificate | null;
}

export type PlateValidationFailureCode =
  | "INVALID_PRIMITIVE"
  | "UNSUPPORTED_HEADING"
  | "BEND_RADIUS_TOO_SMALL"
  | "OUTSIDE_WALL_DOMAIN"
  | "NOPP_COLLISION"
  | "POSITION_DISCONTINUITY"
  | "TANGENT_DISCONTINUITY"
  | "INVALID_TEMPLATE_PROVENANCE";

export interface RejectedEdge {
  templateId: TemplateId;
  templateTransform: TemplateTransform;
  primitives: PathPrimitive[];
  code: PlateValidationFailureCode;
  witness: Point | null;
}

export interface EmbeddedPoseGraph {
  nodes: PoseNode[];
  edges: PoseEdge[];
  rejectedEdges: RejectedEdge[];
  candidateCount: number;
}

export interface PlateValidationSummary {
  independentlyValidated: boolean;
  noppCount: number;
  nodeCount: number;
  acceptedEdgeCount: number;
  rejectedEdgeCount: number;
}

export interface PlateModel {
  profile: PlateProfileId;
  profileVersion: string;
  polygon: Point[];
  wallClearanceMm: number;
  transform: PlateTransformOutput;
  nopps: Nopp[];
  graph: EmbeddedPoseGraph;
  validation: PlateValidationSummary;
}

export type PlateModelErrorCode =
  | "INVALID_POLYGON"
  | "INVALID_WALL_CLEARANCE"
  | "INVALID_PLATE_PHASE"
  | "UNKNOWN_PLATE_PROFILE"
  | "NO_USABLE_PLATE_CELL"
  | "PROFILE_CERTIFICATION_FAILED"
  | "TEMPLATE_CERTIFICATION_FAILED"
  | "SOLVER_LIMIT_EXCEEDED";

export interface PlateModelError {
  code: PlateModelErrorCode;
  message: string;
  used: number | null;
  limit: number | null;
}

export type PlateModelResult =
  | { ok: true; model: PlateModel }
  | { ok: false; error: PlateModelError };
