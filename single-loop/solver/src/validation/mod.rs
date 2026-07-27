mod certificate;
mod clearance;
mod containment;
mod coverage;
mod intersections;
mod provenance;
mod spacing;
mod topology;

use crate::constants::LOCAL_ARC_LENGTH_MM;
use crate::geometry::{AllowedRegion, Polygon};
use crate::model::Point;

pub use crate::model::LocatedSpacing;
pub use certificate::build_certificate;
pub use clearance::{
    HardValidationReport, MinBendRadius, MinNonlocalSpacing, MinWallClearance, NonlocalDistance,
    minimum_nonlocal_distance,
};
pub use coverage::{CoverageBounds, coverage_bounds};
pub use provenance::{CandidateKey, CandidatePath, ParentPair, PathProvenance, PrimitiveRole};
pub use spacing::{SpacingExtrema, spacing_extrema};

#[derive(Clone, Debug)]
pub struct ValidationContext {
    pub polygon: Polygon,
    pub allowed_region: AllowedRegion,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValidationFailureCode {
    BendRadiusTooSmall,
    G1Discontinuity,
    InvalidActualSpacing,
    InvalidPrimitive,
    InvalidPortEndpoints,
    InvalidTopologyParentPair,
    InvalidTopologyPorts,
    InvalidTopologyRoles,
    InvalidTopologyTransition,
    InvalidTopologyTurnCount,
    InvalidTopologyWindingOrder,
    InvalidPrimitiveRoleOrder,
    InvalidPrimitiveRolePhase,
    NonlocalSpacingTooSmall,
    PathEmpty,
    PathOutsidePolygon,
    PositionDiscontinuity,
    RoleCountMismatch,
    SelfIntersection,
    TopologyInvalid,
    ConnectionZoneReentry,
    WallClearanceTooSmall,
}

impl ValidationFailureCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BendRadiusTooSmall => "BEND_RADIUS_TOO_SMALL",
            Self::ConnectionZoneReentry => "CONNECTION_ZONE_REENTRY",
            Self::G1Discontinuity => "G1_DISCONTINUITY",
            Self::InvalidActualSpacing => "INVALID_ACTUAL_SPACING",
            Self::InvalidPortEndpoints => "INVALID_PORT_ENDPOINTS",
            Self::InvalidPrimitive => "INVALID_PRIMITIVE",
            Self::InvalidPrimitiveRoleOrder => "INVALID_PRIMITIVE_ROLE_ORDER",
            Self::InvalidPrimitiveRolePhase => "INVALID_PRIMITIVE_ROLE_PHASE",
            Self::InvalidTopologyParentPair => "INVALID_TOPOLOGY_PARENT_PAIR",
            Self::InvalidTopologyPorts => "INVALID_TOPOLOGY_PORTS",
            Self::InvalidTopologyRoles => "INVALID_TOPOLOGY_ROLES",
            Self::InvalidTopologyTransition => "INVALID_TOPOLOGY_TRANSITION",
            Self::InvalidTopologyTurnCount => "INVALID_TOPOLOGY_TURN_COUNT",
            Self::InvalidTopologyWindingOrder => "INVALID_TOPOLOGY_WINDING_ORDER",
            Self::NonlocalSpacingTooSmall => "NONLOCAL_SPACING_TOO_SMALL",
            Self::PathEmpty => "PATH_EMPTY",
            Self::PathOutsidePolygon => "PATH_OUTSIDE_POLYGON",
            Self::PositionDiscontinuity => "POSITION_DISCONTINUITY",
            Self::RoleCountMismatch => "ROLE_COUNT_MISMATCH",
            Self::SelfIntersection => "SELF_INTERSECTION",
            Self::TopologyInvalid => "TOPOLOGY_INVALID",
            Self::WallClearanceTooSmall => "WALL_CLEARANCE_TOO_SMALL",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ValidationFailure {
    pub code: ValidationFailureCode,
    pub first_point: Option<Point>,
    pub second_point: Option<Point>,
    pub first_primitive: Option<usize>,
    pub second_primitive: Option<usize>,
}

impl ValidationFailure {
    pub fn new(code: ValidationFailureCode) -> Self {
        Self {
            code,
            first_point: None,
            second_point: None,
            first_primitive: None,
            second_primitive: None,
        }
    }

    pub fn with_point(mut self, point: Point) -> Self {
        self.first_point = Some(point);
        self
    }

    pub fn with_points(mut self, first: Point, second: Point) -> Self {
        self.first_point = Some(first);
        self.second_point = Some(second);
        self
    }

    pub fn with_primitive(mut self, primitive: usize) -> Self {
        self.first_primitive = Some(primitive);
        self
    }

    pub fn with_primitives(mut self, first: usize, second: usize) -> Self {
        self.first_primitive = Some(first);
        self.second_primitive = Some(second);
        self
    }
}

impl core::fmt::Display for ValidationFailure {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.code.as_str())
    }
}

impl std::error::Error for ValidationFailure {}

pub fn validate_hard_constraints(
    candidate: &CandidatePath,
    context: &ValidationContext,
) -> Result<HardValidationReport, ValidationFailure> {
    containment::validate_inside_polygon(candidate, context)?;
    intersections::validate_self_intersections(candidate)?;
    let min_bend_radius = clearance::minimum_bend_radius(candidate)?;
    let min_wall_clearance = clearance::minimum_wall_clearance(candidate, context)?;
    let min_nonlocal_spacing =
        clearance::minimum_nonlocal_spacing_report(candidate, LOCAL_ARC_LENGTH_MM)?;
    topology::validate_bifilar_topology(candidate)?;

    Ok(HardValidationReport {
        min_bend_radius,
        min_wall_clearance,
        min_nonlocal_spacing,
    })
}
