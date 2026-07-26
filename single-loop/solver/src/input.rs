use crate::constants::{MIN_NONLOCAL_SPACING_MM, MIN_WALL_CLEARANCE_MM};
use crate::geometry::{Polygon, Vec2, Winding};
use crate::model::{
    ConnectionInput, ErrorDetail, NormalizedConnectionOutput, SolveSingleLoopInput, SolverError,
    SolverErrorCode, SolverWarning, SolverWarningCode, WarningDetail,
};
use std::collections::BTreeMap;

const CONNECTION_PORT_OFFSET_MM: f64 = 25.0;
const CONNECTION_EDGE_MARGIN_MM: f64 = 58.0;
const MIN_CONNECTION_EDGE_LENGTH_MM: f64 = 116.0;
const MAX_REQUESTED_SPACING_MM: f64 = 250.0;

#[derive(Clone, Debug)]
pub struct NormalizedInput {
    pub raw: SolveSingleLoopInput,
    pub polygon: Polygon,
    pub connection: NormalizedConnection,
}

#[derive(Clone, Debug)]
pub struct NormalizedConnection {
    pub edge_index: u32,
    pub requested_center_offset_mm: f64,
    pub actual_center_offset_mm: f64,
    pub shifted_by_mm: f64,
    pub center: crate::model::Point,
    pub first_port: crate::model::Point,
    pub second_port: crate::model::Point,
    pub start_port: crate::model::Point,
    pub end_port: crate::model::Point,
    pub edge_tangent: Vec2,
    pub inward_normal: Vec2,
    pub first_port_edge_offset_mm: f64,
    pub second_port_edge_offset_mm: f64,
    pub start_port_edge_offset_mm: f64,
    pub end_port_edge_offset_mm: f64,
}

impl From<&NormalizedConnection> for NormalizedConnectionOutput {
    fn from(value: &NormalizedConnection) -> Self {
        Self {
            edge_index: value.edge_index,
            requested_center_offset_mm: value.requested_center_offset_mm,
            actual_center_offset_mm: value.actual_center_offset_mm,
            shifted_by_mm: value.shifted_by_mm,
            center: value.center,
            first_port: value.first_port,
            second_port: value.second_port,
            start_port: value.start_port,
            end_port: value.end_port,
        }
    }
}

pub fn validate_and_normalize(raw: SolveSingleLoopInput) -> Result<NormalizedInput, SolverError> {
    validate_scalars(&raw)?;
    let polygon = Polygon::try_from_original(raw.polygon.clone())?;
    let connection = normalize_connection(&polygon, raw.connection.clone())?;
    Ok(NormalizedInput {
        raw,
        polygon,
        connection,
    })
}

pub fn connection_warning(connection: &NormalizedConnection) -> Option<SolverWarning> {
    (connection.shifted_by_mm != 0.0).then(|| SolverWarning {
        code: SolverWarningCode::ConnectionShifted,
        details: BTreeMap::from([
            (
                "requestedCenterOffsetMm".to_string(),
                WarningDetail::number(connection.requested_center_offset_mm).unwrap(),
            ),
            (
                "actualCenterOffsetMm".to_string(),
                WarningDetail::number(connection.actual_center_offset_mm).unwrap(),
            ),
        ]),
    })
}

pub(crate) fn no_solution_geometry(reason: &str) -> SolverError {
    SolverError {
        code: SolverErrorCode::NoSolutionGeometry,
        message: "No geometry satisfies the requested wall-clearance constraints".to_string(),
        details: BTreeMap::from([("reason".to_string(), ErrorDetail::string(reason))]),
    }
}

pub(crate) fn internal_validation_failure(reason: &str) -> SolverError {
    SolverError {
        code: SolverErrorCode::InternalValidationFailure,
        message: "Internal geometry validation failed".to_string(),
        details: BTreeMap::from([("reason".to_string(), ErrorDetail::string(reason))]),
    }
}

pub(crate) fn invalid_polygon(reason: &str) -> SolverError {
    SolverError {
        code: SolverErrorCode::InvalidPolygon,
        message: "The polygon must be a finite simple straight-edged loop".to_string(),
        details: BTreeMap::from([("reason".to_string(), ErrorDetail::string(reason))]),
    }
}

fn validate_scalars(raw: &SolveSingleLoopInput) -> Result<(), SolverError> {
    if !raw.requested_spacing_mm.is_finite()
        || raw.requested_spacing_mm < MIN_NONLOCAL_SPACING_MM
        || raw.requested_spacing_mm > MAX_REQUESTED_SPACING_MM
    {
        return Err(invalid_requested_spacing(raw.requested_spacing_mm));
    }

    if !raw.wall_clearance_mm.is_finite() || raw.wall_clearance_mm < MIN_WALL_CLEARANCE_MM {
        return Err(invalid_wall_clearance(raw.wall_clearance_mm));
    }

    Ok(())
}

fn normalize_connection(
    polygon: &Polygon,
    connection: ConnectionInput,
) -> Result<NormalizedConnection, SolverError> {
    let edge_index = connection.edge_index as usize;
    if edge_index >= polygon.original_edge_count() || !connection.center_offset_mm.is_finite() {
        return Err(invalid_connection_edge(
            connection.edge_index,
            connection.center_offset_mm,
        ));
    }

    let edge_length = polygon.original_edge_length(edge_index);
    if edge_length < MIN_CONNECTION_EDGE_LENGTH_MM {
        return Err(no_valid_connection_on_edge(
            connection.edge_index,
            edge_length,
        ));
    }

    let Some(edge_tangent) = polygon.edge_tangent_for_original(edge_index) else {
        return Err(unrepresentable_connection_geometry(connection.edge_index));
    };
    let inward_normal = inward_normal_for_connection(polygon.winding(), edge_tangent);
    let (edge_start, _) = polygon.original_edge(edge_index);

    let actual_center_offset_mm = connection.center_offset_mm.clamp(
        CONNECTION_EDGE_MARGIN_MM,
        edge_length - CONNECTION_EDGE_MARGIN_MM,
    );
    let shifted_by_mm = actual_center_offset_mm - connection.center_offset_mm;
    let center = edge_start + edge_tangent * actual_center_offset_mm;

    let first_port_edge_offset_mm = actual_center_offset_mm - CONNECTION_PORT_OFFSET_MM;
    let second_port_edge_offset_mm = actual_center_offset_mm + CONNECTION_PORT_OFFSET_MM;
    let first_port = edge_start + edge_tangent * first_port_edge_offset_mm;
    let second_port = edge_start + edge_tangent * second_port_edge_offset_mm;
    if !center.is_finite()
        || !first_port.is_finite()
        || !second_port.is_finite()
        || (second_port_edge_offset_mm - first_port_edge_offset_mm - MIN_NONLOCAL_SPACING_MM).abs()
            > 1e-9
        || (first_port.distance_to(second_port) - MIN_NONLOCAL_SPACING_MM).abs() > 1e-6
    {
        return Err(unrepresentable_connection_geometry(connection.edge_index));
    }

    Ok(NormalizedConnection {
        edge_index: connection.edge_index,
        requested_center_offset_mm: connection.center_offset_mm,
        actual_center_offset_mm,
        shifted_by_mm,
        center,
        first_port,
        second_port,
        start_port: first_port,
        end_port: second_port,
        edge_tangent,
        inward_normal,
        first_port_edge_offset_mm,
        second_port_edge_offset_mm,
        start_port_edge_offset_mm: first_port_edge_offset_mm,
        end_port_edge_offset_mm: second_port_edge_offset_mm,
    })
}

fn inward_normal_for_connection(winding: Winding, edge_tangent: Vec2) -> Vec2 {
    match winding {
        Winding::CounterClockwise => edge_tangent.perp_ccw(),
        Winding::Clockwise => -edge_tangent.perp_ccw(),
    }
}

fn invalid_requested_spacing(value: f64) -> SolverError {
    let mut details = BTreeMap::from([(
        "reason".to_string(),
        ErrorDetail::string("OUT_OF_RANGE_OR_NON_FINITE"),
    )]);
    if let Some(number) = ErrorDetail::number(value) {
        details.insert("requestedSpacingMm".to_string(), number);
    }
    SolverError {
        code: SolverErrorCode::InvalidRequestedSpacing,
        message: "requestedSpacingMm must be finite and within 50..=250 mm".to_string(),
        details,
    }
}

fn invalid_wall_clearance(value: f64) -> SolverError {
    let mut details = BTreeMap::from([(
        "reason".to_string(),
        ErrorDetail::string("OUT_OF_RANGE_OR_NON_FINITE"),
    )]);
    if let Some(number) = ErrorDetail::number(value) {
        details.insert("wallClearanceMm".to_string(), number);
    }
    SolverError {
        code: SolverErrorCode::InvalidWallClearance,
        message: "wallClearanceMm must be finite and at least 8 mm".to_string(),
        details,
    }
}

fn invalid_connection_edge(edge_index: u32, center_offset_mm: f64) -> SolverError {
    let mut details = BTreeMap::from([(
        "edgeIndex".to_string(),
        ErrorDetail::number(edge_index as f64).unwrap(),
    )]);
    if let Some(number) = ErrorDetail::number(center_offset_mm) {
        details.insert("centerOffsetMm".to_string(), number);
    } else {
        details.insert(
            "reason".to_string(),
            ErrorDetail::string("NON_FINITE_CENTER_OFFSET"),
        );
    }
    SolverError {
        code: SolverErrorCode::InvalidConnectionEdge,
        message: "connection.edgeIndex or connection.centerOffsetMm is invalid".to_string(),
        details,
    }
}

fn unrepresentable_connection_geometry(edge_index: u32) -> SolverError {
    SolverError {
        code: SolverErrorCode::InvalidConnectionEdge,
        message: "The selected edge cannot represent distinct 50 mm ports".to_string(),
        details: BTreeMap::from([
            (
                "edgeIndex".to_string(),
                ErrorDetail::number(edge_index as f64).unwrap(),
            ),
            (
                "reason".to_string(),
                ErrorDetail::string("PORT_GEOMETRY_UNREPRESENTABLE"),
            ),
        ]),
    }
}

fn no_valid_connection_on_edge(edge_index: u32, edge_length_mm: f64) -> SolverError {
    SolverError {
        code: SolverErrorCode::NoValidConnectionOnEdge,
        message: "The selected edge is too short for a valid 50 mm connection pair".to_string(),
        details: BTreeMap::from([
            (
                "edgeIndex".to_string(),
                ErrorDetail::number(edge_index as f64).unwrap(),
            ),
            (
                "edgeLengthMm".to_string(),
                ErrorDetail::number(edge_length_mm).unwrap(),
            ),
        ]),
    }
}
