use crate::geometry::{ParameterRange, PointClassification, Polygon, primitive_distance};
use crate::model::{PathPrimitive, Point};
use crate::plate::{Heading8, Nopp, NoppType, PlateProfile, primitive_circle_clearance};
use serde::{Deserialize, Serialize};

const VALIDATION_TOLERANCE_MM: f64 = 1e-6;
const HEADING_TOLERANCE: f64 = 1e-12;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlateValidationFailureCode {
    InvalidPrimitive,
    UnsupportedHeading,
    BendRadiusTooSmall,
    OutsideWallDomain,
    NoppCollision,
    PositionDiscontinuity,
    TangentDiscontinuity,
    InvalidTemplateProvenance,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateValidationFailure {
    pub code: PlateValidationFailureCode,
    pub witness: Option<Point>,
    pub nopp_type: Option<NoppType>,
}

impl PlateValidationFailure {
    pub(crate) fn new(code: PlateValidationFailureCode) -> Self {
        Self {
            code,
            witness: None,
            nopp_type: None,
        }
    }
}

pub fn validate_line_heading(
    primitive: &PathPrimitive,
) -> Result<Heading8, PlateValidationFailure> {
    let PathPrimitive::Line { start, end } = primitive else {
        return Err(PlateValidationFailure::new(
            PlateValidationFailureCode::InvalidPrimitive,
        ));
    };
    let direction = (*end - *start)
        .normalized()
        .ok_or_else(|| PlateValidationFailure::new(PlateValidationFailureCode::InvalidPrimitive))?;
    Heading8::ALL
        .into_iter()
        .find(|heading| (direction - heading.direction()).norm() <= HEADING_TOLERANCE)
        .ok_or_else(|| PlateValidationFailure::new(PlateValidationFailureCode::UnsupportedHeading))
}

pub fn validate_primitive_against_plate(
    primitive: &PathPrimitive,
    polygon: &Polygon,
    wall_clearance_mm: f64,
    nopps: &[Nopp],
    profile: &PlateProfile,
) -> Result<(), PlateValidationFailure> {
    validate_shape(primitive, profile)?;
    validate_wall_domain(primitive, polygon, wall_clearance_mm)?;
    for nopp in nopps {
        if primitive_circle_clearance(primitive, nopp.center, nopp.forbidden_radius_mm)
            <= VALIDATION_TOLERANCE_MM
        {
            return Err(PlateValidationFailure {
                code: PlateValidationFailureCode::NoppCollision,
                witness: Some(nopp.center),
                nopp_type: Some(nopp.nopp_type),
            });
        }
    }
    Ok(())
}

pub(crate) fn validate_template_primitive_shape(
    primitive: &PathPrimitive,
    profile: &PlateProfile,
) -> Result<(), PlateValidationFailure> {
    validate_shape(primitive, profile)
}

fn validate_shape(
    primitive: &PathPrimitive,
    profile: &PlateProfile,
) -> Result<(), PlateValidationFailure> {
    match primitive {
        PathPrimitive::Line { start, end } => {
            if !point_is_finite(*start) || !point_is_finite(*end) {
                return Err(PlateValidationFailure::new(
                    PlateValidationFailureCode::InvalidPrimitive,
                ));
            }
            validate_line_heading(primitive)?;
        }
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            if !point_is_finite(*start)
                || !point_is_finite(*end)
                || !point_is_finite(*center)
                || !radius_mm.is_finite()
                || !sweep_rad.is_finite()
                || *radius_mm <= 0.0
                || *sweep_rad == 0.0
            {
                return Err(PlateValidationFailure::new(
                    PlateValidationFailureCode::InvalidPrimitive,
                ));
            }
            if *radius_mm + VALIDATION_TOLERANCE_MM < profile.min_bend_radius_mm {
                return Err(PlateValidationFailure::new(
                    PlateValidationFailureCode::BendRadiusTooSmall,
                ));
            }
            let start_radius = (*start - *center).norm();
            let end_radius = (*end - *center).norm();
            if (start_radius - *radius_mm).abs() > VALIDATION_TOLERANCE_MM
                || (end_radius - *radius_mm).abs() > VALIDATION_TOLERANCE_MM
                || (*end - primitive.point_at(1.0)).norm() > VALIDATION_TOLERANCE_MM
            {
                return Err(PlateValidationFailure::new(
                    PlateValidationFailureCode::InvalidPrimitive,
                ));
            }
        }
    }
    Ok(())
}

fn validate_wall_domain(
    primitive: &PathPrimitive,
    polygon: &Polygon,
    wall_clearance_mm: f64,
) -> Result<(), PlateValidationFailure> {
    if !wall_clearance_mm.is_finite() || wall_clearance_mm < 0.0 {
        return Err(PlateValidationFailure::new(
            PlateValidationFailureCode::OutsideWallDomain,
        ));
    }
    let start = primitive.point_at(0.0);
    if polygon.classify_point(start) != PointClassification::Inside {
        return Err(PlateValidationFailure {
            code: PlateValidationFailureCode::OutsideWallDomain,
            witness: Some(start),
            nopp_type: None,
        });
    }
    let mut minimum = f64::INFINITY;
    let mut witness = start;
    for edge_index in 0..polygon.original_edge_count() {
        let (edge_start, edge_end) = polygon.original_edge(edge_index);
        let edge = PathPrimitive::Line {
            start: edge_start,
            end: edge_end,
        };
        let pair = primitive_distance(primitive, ParameterRange::FULL, &edge, ParameterRange::FULL);
        if pair.distance_mm < minimum {
            minimum = pair.distance_mm;
            witness = pair.point_on_a;
        }
    }
    if minimum - VALIDATION_TOLERANCE_MM < wall_clearance_mm {
        return Err(PlateValidationFailure {
            code: PlateValidationFailureCode::OutsideWallDomain,
            witness: Some(witness),
            nopp_type: None,
        });
    }
    Ok(())
}

fn point_is_finite(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}
