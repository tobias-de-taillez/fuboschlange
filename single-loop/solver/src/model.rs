use serde::de::Error as _;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;

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

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub struct LiteralBool<const VALUE: bool>;

impl<const VALUE: bool> LiteralBool<VALUE> {
    pub const fn new() -> Self {
        Self
    }
}

impl<const VALUE: bool> Default for LiteralBool<VALUE> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const VALUE: bool> Serialize for LiteralBool<VALUE> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bool(VALUE)
    }
}

impl<'de, const VALUE: bool> Deserialize<'de> for LiteralBool<VALUE> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = bool::deserialize(deserializer)?;
        if value == VALUE {
            Ok(Self)
        } else {
            Err(D::Error::custom(format!("expected {VALUE}")))
        }
    }
}

pub type LiteralTrue = LiteralBool<true>;
pub const TRUE: LiteralTrue = LiteralBool;

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub struct LiteralU32<const VALUE: u32>;

impl<const VALUE: u32> LiteralU32<VALUE> {
    pub const fn new() -> Self {
        Self
    }
}

impl<const VALUE: u32> Default for LiteralU32<VALUE> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const VALUE: u32> Serialize for LiteralU32<VALUE> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u32(VALUE)
    }
}

impl<'de, const VALUE: u32> Deserialize<'de> for LiteralU32<VALUE> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u32::deserialize(deserializer)?;
        if value == VALUE {
            Ok(Self)
        } else {
            Err(D::Error::custom(format!("expected {VALUE}")))
        }
    }
}

pub type LiteralZero = LiteralU32<0>;
pub type LiteralLimit100000 = LiteralU32<100_000>;
pub const ZERO: LiteralZero = LiteralU32;
pub const LIMIT_100000: LiteralLimit100000 = LiteralU32;

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
pub struct ConstraintCoverageMm {
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
    pub limit_mm: LiteralLimit100000,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstraintCertificate {
    pub inside_polygon: LiteralTrue,
    pub g1_continuous: LiteralTrue,
    pub self_intersection_count: LiteralZero,
    pub connection_zone_compliant: LiteralTrue,
    pub bifilar_topology: LiteralTrue,
    pub min_bend_radius_mm: MinBendRadiusMm,
    pub min_wall_clearance_mm: MinWallClearanceMm,
    pub min_nonlocal_spacing_mm: MinNonlocalSpacingMm,
    pub total_length_mm: TotalLengthMm,
    pub coverage_mm: ConstraintCoverageMm,
    pub numeric_tolerance_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FiniteNumber(f64);

impl FiniteNumber {
    fn new(value: f64) -> Option<Self> {
        value.is_finite().then_some(Self(value))
    }

    const fn get(self) -> f64 {
        self.0
    }
}

impl Serialize for FiniteNumber {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_f64(self.0)
    }
}

impl<'de> Deserialize<'de> for FiniteNumber {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = f64::deserialize(deserializer)?;
        Self::new(value).ok_or_else(|| D::Error::custom("warning detail numbers must be finite"))
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WarningDetail {
    Number(FiniteNumber),
    String(String),
}

impl WarningDetail {
    pub fn number(value: f64) -> Option<Self> {
        FiniteNumber::new(value).map(Self::Number)
    }

    pub fn string(value: impl Into<String>) -> Self {
        Self::String(value.into())
    }

    pub fn as_number(&self) -> Option<f64> {
        match self {
            Self::Number(value) => Some(value.get()),
            Self::String(_) => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Number(_) => None,
            Self::String(value) => Some(value.as_str()),
        }
    }
}

pub type WarningDetails = BTreeMap<String, WarningDetail>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ErrorDetail {
    Number(FiniteNumber),
    String(String),
    Boolean(bool),
}

impl ErrorDetail {
    pub fn number(value: f64) -> Option<Self> {
        FiniteNumber::new(value).map(Self::Number)
    }

    pub fn string(value: impl Into<String>) -> Self {
        Self::String(value.into())
    }

    pub fn boolean(value: bool) -> Self {
        Self::Boolean(value)
    }

    pub fn as_number(&self) -> Option<f64> {
        match self {
            Self::Number(value) => Some(value.get()),
            Self::String(_) | Self::Boolean(_) => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Number(_) | Self::Boolean(_) => None,
            Self::String(value) => Some(value.as_str()),
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Boolean(value) => Some(*value),
            Self::Number(_) | Self::String(_) => None,
        }
    }
}

pub type ErrorDetails = BTreeMap<String, ErrorDetail>;

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
    pub details: WarningDetails,
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
    pub details: ErrorDetails,
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
