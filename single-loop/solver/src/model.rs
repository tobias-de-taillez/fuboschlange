use serde::de::Error as _;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConnectionInput {
    pub edge_index: u32,
    pub center_offset_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum PathPrimitive {
    Line {
        start: Point,
        end: Point,
    },
    Arc {
        start: Point,
        end: Point,
        center: Point,
        radius_mm: f64,
        sweep_rad: f64,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolveSingleLoopInput {
    pub polygon: Vec<Point>,
    pub connection: ConnectionInput,
    pub requested_spacing_mm: f64,
    pub wall_clearance_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NormalizedConnectionOutput {
    pub edge_index: u32,
    pub requested_center_offset_mm: f64,
    pub actual_center_offset_mm: f64,
    pub shifted_by_mm: f64,
    pub center: Point,
    pub first_port: Point,
    pub second_port: Point,
    pub start_port: Point,
    pub end_port: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocatedSpacing {
    pub distance_mm: f64,
    pub first_point: Point,
    pub second_point: Point,
    pub first_path_offset_mm: f64,
    pub second_path_offset_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoverageOutput {
    pub max_distance_mm: f64,
    pub lower_bound_mm: f64,
    pub upper_bound_mm: f64,
    pub error_bound_mm: f64,
    pub worst_point: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpacingDeviations {
    pub min: LocatedSpacing,
    pub max: LocatedSpacing,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MinBendRadiusMm {
    pub lower_bound_mm: f64,
    pub primitive_index: u32,
    pub point: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MinWallClearanceMm {
    pub lower_bound_mm: f64,
    pub point_on_pipe: Point,
    pub point_on_wall: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MinNonlocalSpacingMm {
    pub lower_bound_mm: f64,
    pub first_point: Point,
    pub second_point: Point,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TotalLengthMm {
    pub upper_bound_mm: f64,
    pub limit_mm: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstraintCertificate {
    pub inside_polygon: bool,
    pub g1_continuous: bool,
    pub self_intersection_count: u32,
    pub connection_zone_compliant: bool,
    pub bifilar_topology: bool,
    pub min_bend_radius_mm: MinBendRadiusMm,
    pub min_wall_clearance_mm: MinWallClearanceMm,
    pub min_nonlocal_spacing_mm: MinNonlocalSpacingMm,
    pub total_length_mm: TotalLengthMm,
    pub coverage_mm: CoverageOutput,
    pub numeric_tolerance_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolverWarningCode {
    #[serde(rename = "CONNECTION_SHIFTED")]
    ConnectionShifted,
    #[serde(rename = "SPACING_INCREASED")]
    SpacingIncreased,
    #[serde(rename = "SPACING_EXCEEDS_250_MM")]
    SpacingExceeds250Mm,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolverWarning {
    pub code: SolverWarningCode,
    pub details: Map<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolverErrorCode {
    #[serde(rename = "INVALID_POLYGON")]
    InvalidPolygon,
    #[serde(rename = "INVALID_REQUESTED_SPACING")]
    InvalidRequestedSpacing,
    #[serde(rename = "INVALID_WALL_CLEARANCE")]
    InvalidWallClearance,
    #[serde(rename = "INVALID_CONNECTION_EDGE")]
    InvalidConnectionEdge,
    #[serde(rename = "NO_VALID_CONNECTION_ON_EDGE")]
    NoValidConnectionOnEdge,
    #[serde(rename = "NO_SOLUTION_GEOMETRY")]
    NoSolutionGeometry,
    #[serde(rename = "NO_SOLUTION_LENGTH")]
    NoSolutionLength,
    #[serde(rename = "SOLVER_LIMIT_EXCEEDED")]
    SolverLimitExceeded,
    #[serde(rename = "INTERNAL_VALIDATION_FAILURE")]
    InternalValidationFailure,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolverError {
    pub code: SolverErrorCode,
    pub message: String,
    pub details: Map<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleLoopPlan {
    pub solver_version: String,
    pub request_hash: String,
    pub path: Vec<PathPrimitive>,
    pub normalized_connection: NormalizedConnectionOutput,
    pub requested_spacing_mm: f64,
    pub actual_spacing_mm: f64,
    pub total_length_mm: f64,
    pub coverage: CoverageOutput,
    pub spacing_deviations: SpacingDeviations,
    pub warnings: Vec<SolverWarning>,
    pub constraint_certificate: ConstraintCertificate,
}

#[derive(Clone, Debug, PartialEq)]
pub enum SolveResult {
    Success { plan: SingleLoopPlan },
    Error { error: SolverError },
}

impl Serialize for SolveResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            SolveResult::Success { plan } => {
                let mut state = serializer.serialize_struct("SolveResult", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("plan", plan)?;
                state.end()
            }
            SolveResult::Error { error } => {
                let mut state = serializer.serialize_struct("SolveResult", 2)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("error", error)?;
                state.end()
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireSolveResultSuccess {
    ok: bool,
    plan: SingleLoopPlan,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireSolveResultError {
    ok: bool,
    error: SolverError,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum WireSolveResult {
    Success(WireSolveResultSuccess),
    Error(WireSolveResultError),
}

impl<'de> Deserialize<'de> for SolveResult {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        match WireSolveResult::deserialize(deserializer)? {
            WireSolveResult::Success(WireSolveResultSuccess { ok, plan }) if ok => {
                Ok(SolveResult::Success { plan })
            }
            WireSolveResult::Success(_) => {
                Err(D::Error::custom("expected ok = true for SolveResult::Success"))
            }
            WireSolveResult::Error(WireSolveResultError { ok, error }) if !ok => {
                Ok(SolveResult::Error { error })
            }
            WireSolveResult::Error(_) => {
                Err(D::Error::custom("expected ok = false for SolveResult::Error"))
            }
        }
    }
}
