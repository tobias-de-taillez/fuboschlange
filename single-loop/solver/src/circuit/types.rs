use crate::model::{PathPrimitive, Point};
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};

const MIN_WALL_CLEARANCE_MM: f64 = 8.0;
const ALLOWED_SPACINGS_MM: [u32; 4] = [75, 150, 225, 300];
const SUPPORTED_PROFILE: &str = "BEKOTEC_EN_23_FI_30_16";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LoopPattern {
    Spiral,
    Meander,
    Free,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectionInput {
    pub edge_index: u32,
    pub center_offset_mm: f64,
    pub zone_width_mm: f64,
    pub zone_depth_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolveLoopInput {
    pub polygon: Vec<Point>,
    pub connection: ConnectionInput,
    pub requested_spacing_mm: u32,
    pub wall_clearance_mm: f64,
    pub phase_u_mm: f64,
    pub phase_v_mm: f64,
    pub pattern: LoopPattern,
    pub profile: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LoopErrorCode {
    InvalidPolygon,
    InvalidWallClearance,
    InvalidPlatePhase,
    UnknownPlateProfile,
    InvalidConnection,
    InvalidRequestedSpacing,
    PatternNotImplemented,
    NoSolutionGeometry,
    NoSolutionLength,
    SolverLimitExceeded,
    InternalValidationFailure,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LoopWarningCode {
    SpacingIncreased,
    // Automatic SCREAMING_SNAKE_CASE conversion would yield
    // "SPACING_EXCEEDS250_MM" (no separator before a digit run); the design
    // spec (2026-07-31-bekotec-loop-solver-design.md, section 8) fixes the
    // wire value to "SPACING_EXCEEDS_250_MM".
    #[serde(rename = "SPACING_EXCEEDS_250_MM")]
    SpacingExceeds250Mm,
    SpacingPenaltyApplied,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub decision: String,
    pub rejected_by: Option<String>,
    pub witness: Option<Point>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopError {
    pub code: LoopErrorCode,
    pub message: String,
    pub journal_tail: Vec<JournalEntry>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopWarning {
    pub code: LoopWarningCode,
    pub details_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RectMm {
    pub min: Point,
    pub max: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatedSpacing {
    pub distance_mm: f64,
    pub first_point: Point,
    pub second_point: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionOutput {
    pub start_port: Point,
    pub end_port: Point,
    pub zone: RectMm,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageOutput {
    pub lower_bound_mm: f64,
    pub upper_bound_mm: f64,
    pub error_bound_mm: f64,
    pub worst_point: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacingPenalty {
    pub sum_mm: f64,
    pub worst: Option<LocatedSpacing>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDiagnostics {
    pub field_id: u32,
    pub rect_local: RectMm,
    pub lane_count: u32,
    pub inward_edge_ids: Vec<u32>,
    pub turn_edge_ids: Vec<u32>,
    pub return_edge_ids: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopConstraintCertificate {
    pub min_center_distance_mm: f64,
    pub min_bend_radius_mm: f64,
    pub penalty_sum_mm: f64,
    pub edge_provenance_ok: bool,
    pub zone_automaton_ok: bool,
    pub pattern_provenance_ok: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopPlan {
    pub solver_version: String,
    pub request_hash: String,
    pub pattern: LoopPattern,
    pub path: Vec<PathPrimitive>,
    pub actual_spacing_mm: u32,
    pub total_length_mm: f64,
    pub connection: ConnectionOutput,
    pub coverage: CoverageOutput,
    pub spacing_penalty: SpacingPenalty,
    pub fields: Vec<FieldDiagnostics>,
    pub search_journal_tail: Vec<JournalEntry>,
    pub warnings: Vec<LoopWarning>,
    pub constraint_certificate: LoopConstraintCertificate,
}

#[derive(Clone, Debug, PartialEq)]
// Ergebnis-Enums sind kurzlebige Rückgabewerte; Boxing des Plans würde die
// öffentliche API und alle Aufrufer verkomplizieren, ohne messbaren Gewinn.
#[allow(clippy::large_enum_variant)]
pub enum SolveLoopResult {
    Success { plan: LoopPlan },
    Error { error: LoopError },
}

impl Serialize for SolveLoopResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Success { plan } => {
                let mut state = serializer.serialize_struct("SolveLoopSuccess", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("plan", plan)?;
                state.end()
            }
            Self::Error { error } => {
                let mut state = serializer.serialize_struct("SolveLoopErrorResult", 2)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("error", error)?;
                state.end()
            }
        }
    }
}

fn error(code: LoopErrorCode, message: &str) -> LoopError {
    LoopError {
        code,
        message: message.to_owned(),
        journal_tail: Vec::new(),
    }
}

/// Validates a `SolveLoopInput` against the shallow, input-only rules: shape
/// and range checks that do not require constructing the plate graph or
/// polygon. Geometry-dependent checks (connection edge bounds, zone
/// containment, …) belong to later, geometry-aware stages.
pub fn validate_input(input: &SolveLoopInput) -> Result<(), LoopError> {
    if input
        .polygon
        .iter()
        .any(|point| !point.x.is_finite() || !point.y.is_finite())
    {
        return Err(error(
            LoopErrorCode::InvalidPolygon,
            "Polygon vertices must be finite",
        ));
    }
    let connection = &input.connection;
    if !connection.center_offset_mm.is_finite()
        || !connection.zone_width_mm.is_finite()
        || !connection.zone_depth_mm.is_finite()
    {
        return Err(error(
            LoopErrorCode::InvalidConnection,
            "Connection values must be finite",
        ));
    }
    if connection.zone_width_mm <= 0.0 || connection.zone_depth_mm <= 0.0 {
        return Err(error(
            LoopErrorCode::InvalidConnection,
            "Connection zone dimensions must be positive",
        ));
    }
    if !ALLOWED_SPACINGS_MM.contains(&input.requested_spacing_mm) {
        return Err(error(
            LoopErrorCode::InvalidRequestedSpacing,
            "Requested spacing must be one of 75, 150, 225, or 300 mm",
        ));
    }
    if !input.wall_clearance_mm.is_finite() || input.wall_clearance_mm < MIN_WALL_CLEARANCE_MM {
        return Err(error(
            LoopErrorCode::InvalidWallClearance,
            "Wall clearance must be finite and at least 8 mm",
        ));
    }
    if !input.phase_u_mm.is_finite() || !input.phase_v_mm.is_finite() {
        return Err(error(
            LoopErrorCode::InvalidPlatePhase,
            "Plate phase must be finite",
        ));
    }
    if input.pattern != LoopPattern::Spiral {
        return Err(error(
            LoopErrorCode::PatternNotImplemented,
            "Only the spiral pattern is implemented in this milestone",
        ));
    }
    if input.profile != SUPPORTED_PROFILE {
        return Err(error(
            LoopErrorCode::UnknownPlateProfile,
            "Unknown plate profile",
        ));
    }
    Ok(())
}
