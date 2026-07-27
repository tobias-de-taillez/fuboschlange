use crate::geometry::{Vec2, canonicalize_path};
use crate::model::{PathPrimitive, Point};
use std::f64::consts::PI;

const GEOMETRY_EPSILON: f64 = 1e-9;
const ANGLE_EPSILON: f64 = 1e-12;
const MAX_MULTICORNER_PAIR_CHECKS: usize = 100_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoundingError {
    TooFewPoints,
    InvalidPoint { index: usize },
    InvalidRadius,
    Reversal { index: usize },
    InsufficientSegment { index: usize },
    NonFiniteConstruction,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum RoundingVariantKind {
    PerCorner,
    AcrossAllCorners,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RoundingVariant {
    pub kind: RoundingVariantKind,
    pub start_segment_index: usize,
    pub end_segment_index: usize,
    pub primitives: Vec<PathPrimitive>,
}

#[derive(Clone, Copy, Debug)]
struct Corner {
    incoming: Vec2,
    outgoing: Vec2,
    tangent_mm: f64,
    sweep_rad: f64,
}

pub fn global_dps_feasibility(points: &[Point], radius_mm: f64) -> Result<(), RoundingError> {
    let points = normalized_polyline(points)?;
    let corners = corner_data(&points, radius_mm)?;
    check_segment_consumption(&points, &corners)
}

pub fn round_polyline(
    points: &[Point],
    radius_mm: f64,
) -> Result<Vec<PathPrimitive>, RoundingError> {
    let points = normalized_polyline(points)?;
    let corners = corner_data(&points, radius_mm)?;
    check_segment_consumption(&points, &corners)?;

    let mut result = Vec::with_capacity(points.len().saturating_mul(2));
    let mut cursor = points[0];
    for (index, corner) in corners.iter().enumerate().skip(1).take(points.len() - 2) {
        let Some(corner) = corner else {
            continue;
        };
        let vertex = points[index];
        let arc_start = vertex - corner.incoming * corner.tangent_mm;
        let arc_end = vertex + corner.outgoing * corner.tangent_mm;
        push_line(&mut result, cursor, arc_start);

        let side = corner.sweep_rad.signum();
        let center = arc_start + corner.incoming.perp_ccw() * (side * radius_mm);
        if !point_is_finite(center) || !point_is_finite(arc_start) || !point_is_finite(arc_end) {
            return Err(RoundingError::NonFiniteConstruction);
        }
        result.push(PathPrimitive::Arc {
            start: arc_start,
            end: arc_end,
            center,
            radius_mm,
            sweep_rad: corner.sweep_rad,
        });
        cursor = arc_end;
    }
    push_line(
        &mut result,
        cursor,
        *points.last().ok_or(RoundingError::TooFewPoints)?,
    );

    if result.is_empty() {
        return Err(RoundingError::TooFewPoints);
    }
    if !rounded_path_is_g1_and_finite(&result, radius_mm) || canonicalize_path(&result).is_err() {
        return Err(RoundingError::NonFiniteConstruction);
    }
    Ok(result)
}

pub fn round_across_multiple_corners(points: &[Point], min_radius_mm: f64) -> Vec<RoundingVariant> {
    let mut variants = Vec::new();
    if let Ok(primitives) = round_polyline(points, min_radius_mm) {
        variants.push(RoundingVariant {
            kind: RoundingVariantKind::PerCorner,
            start_segment_index: 0,
            end_segment_index: points.len().saturating_sub(2),
            primitives,
        });
    }

    if points.len() >= 4 {
        let last_segment = points.len() - 2;
        let mut pair_checks = 0_usize;
        'starts: for start_segment in 0..last_segment {
            for end_segment in (start_segment + 2..=last_segment).rev() {
                if pair_checks >= MAX_MULTICORNER_PAIR_CHECKS {
                    break 'starts;
                }
                pair_checks += 1;
                let Some(primitives) =
                    across_segment_pair(points, start_segment, end_segment, min_radius_mm)
                else {
                    continue;
                };
                variants.push(RoundingVariant {
                    kind: RoundingVariantKind::AcrossAllCorners,
                    start_segment_index: start_segment,
                    end_segment_index: end_segment,
                    primitives,
                });
                break;
            }
        }
    }
    variants.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.start_segment_index.cmp(&right.start_segment_index))
            .then_with(|| right.end_segment_index.cmp(&left.end_segment_index))
    });
    variants
}

fn normalized_polyline(points: &[Point]) -> Result<Vec<Point>, RoundingError> {
    if points.len() < 2 {
        return Err(RoundingError::TooFewPoints);
    }
    for (index, point) in points.iter().copied().enumerate() {
        if !point_is_finite(point) {
            return Err(RoundingError::InvalidPoint { index });
        }
    }

    let mut normalized: Vec<Point> = Vec::with_capacity(points.len());
    for point in points.iter().copied() {
        if normalized
            .last()
            .is_some_and(|previous| (point - *previous).norm() <= GEOMETRY_EPSILON)
        {
            continue;
        }
        normalized.push(point);
        while normalized.len() >= 3 {
            let length = normalized.len();
            let a = normalized[length - 2] - normalized[length - 3];
            let b = normalized[length - 1] - normalized[length - 2];
            let cross = cross(a, b);
            let scale = a.norm() * b.norm();
            if cross.abs() <= ANGLE_EPSILON * scale && a.dot(b) > 0.0 {
                normalized.remove(length - 2);
            } else {
                break;
            }
        }
    }
    if normalized.len() < 2 {
        return Err(RoundingError::TooFewPoints);
    }
    Ok(normalized)
}

fn corner_data(points: &[Point], radius_mm: f64) -> Result<Vec<Option<Corner>>, RoundingError> {
    if !radius_mm.is_finite() || radius_mm <= 0.0 {
        return Err(RoundingError::InvalidRadius);
    }
    let mut corners = vec![None; points.len()];
    for index in 1..points.len() - 1 {
        let incoming = (points[index] - points[index - 1])
            .normalized()
            .ok_or(RoundingError::InvalidPoint { index })?;
        let outgoing = (points[index + 1] - points[index])
            .normalized()
            .ok_or(RoundingError::InvalidPoint { index })?;
        let dot = incoming.dot(outgoing).clamp(-1.0, 1.0);
        let signed_cross = cross(incoming, outgoing);
        if signed_cross.abs() <= ANGLE_EPSILON {
            if dot < 0.0 {
                return Err(RoundingError::Reversal { index });
            }
            continue;
        }

        let deflection = dot.acos();
        let interior_angle = PI - deflection;
        let tangent_mm = radius_mm / (interior_angle * 0.5).tan();
        if !tangent_mm.is_finite() || tangent_mm <= 0.0 {
            return Err(RoundingError::NonFiniteConstruction);
        }
        corners[index] = Some(Corner {
            incoming,
            outgoing,
            tangent_mm,
            sweep_rad: signed_cross.signum() * deflection,
        });
    }
    Ok(corners)
}

fn check_segment_consumption(
    points: &[Point],
    corners: &[Option<Corner>],
) -> Result<(), RoundingError> {
    for segment_index in 0..points.len() - 1 {
        let segment_length = (points[segment_index + 1] - points[segment_index]).norm();
        let at_start = corners[segment_index]
            .map(|corner| corner.tangent_mm)
            .unwrap_or(0.0);
        let at_end = corners[segment_index + 1]
            .map(|corner| corner.tangent_mm)
            .unwrap_or(0.0);
        let tolerance = GEOMETRY_EPSILON * segment_length.max(1.0);
        if at_start + at_end > segment_length + tolerance {
            return Err(RoundingError::InsufficientSegment {
                index: segment_index,
            });
        }
    }
    Ok(())
}

fn across_segment_pair(
    points: &[Point],
    start_segment: usize,
    end_segment: usize,
    radius_mm: f64,
) -> Option<Vec<PathPrimitive>> {
    if end_segment <= start_segment + 1 || end_segment + 1 >= points.len() {
        return None;
    }
    across_all_corners(
        &[
            points[start_segment],
            points[start_segment + 1],
            points[end_segment],
            points[end_segment + 1],
        ],
        radius_mm,
    )
}

fn across_all_corners(points: &[Point], radius_mm: f64) -> Option<Vec<PathPrimitive>> {
    let points = normalized_polyline(points).ok()?;
    if points.len() < 4 || !radius_mm.is_finite() || radius_mm <= 0.0 {
        return None;
    }
    let start_direction = (points[1] - points[0]).normalized()?;
    let end_direction = (*points.last()? - points[points.len() - 2]).normalized()?;
    let denominator = cross(start_direction, end_direction);
    if denominator.abs() <= ANGLE_EPSILON {
        return None;
    }
    let from_start_to_end_line = points[points.len() - 2] - points[0];
    let intersection_distance = cross(from_start_to_end_line, end_direction) / denominator;
    let intersection = points[0] + start_direction * intersection_distance;
    let dot = start_direction.dot(end_direction).clamp(-1.0, 1.0);
    let deflection = dot.acos();
    if deflection <= ANGLE_EPSILON || PI - deflection <= ANGLE_EPSILON {
        return None;
    }
    let tangent_mm = radius_mm * (deflection * 0.5).tan();
    let arc_start = intersection - start_direction * tangent_mm;
    let arc_end = intersection + end_direction * tangent_mm;
    if !point_on_segment(arc_start, points[0], points[1])
        || !point_on_segment(arc_end, points[points.len() - 2], *points.last()?)
    {
        return None;
    }
    let side = denominator.signum();
    let center = arc_start + start_direction.perp_ccw() * (side * radius_mm);
    let sweep_rad = side * deflection;
    let mut primitives = Vec::with_capacity(3);
    push_line(&mut primitives, points[0], arc_start);
    primitives.push(PathPrimitive::Arc {
        start: arc_start,
        end: arc_end,
        center,
        radius_mm,
        sweep_rad,
    });
    push_line(&mut primitives, arc_end, *points.last()?);
    (primitives.len() >= 2
        && rounded_path_is_g1_and_finite(&primitives, radius_mm)
        && canonicalize_path(&primitives).is_ok())
    .then_some(primitives)
}

fn rounded_path_is_g1_and_finite(primitives: &[PathPrimitive], min_radius_mm: f64) -> bool {
    let primitives_valid = primitives.iter().all(|primitive| match primitive {
        PathPrimitive::Line { start, end } => {
            point_is_finite(*start)
                && point_is_finite(*end)
                && (*end - *start).norm().is_finite()
                && (*end - *start).norm() > GEOMETRY_EPSILON
        }
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            let tolerance = GEOMETRY_EPSILON * radius_mm.max(1.0);
            point_is_finite(*start)
                && point_is_finite(*end)
                && point_is_finite(*center)
                && radius_mm.is_finite()
                && *radius_mm >= min_radius_mm
                && sweep_rad.is_finite()
                && sweep_rad.abs() > ANGLE_EPSILON
                && ((*start - *center).norm() - *radius_mm).abs() <= tolerance
                && ((*end - *center).norm() - *radius_mm).abs() <= tolerance
        }
    });
    primitives_valid
        && primitives.windows(2).all(|pair| {
            let endpoint_gap = (primitive_end(&pair[0]) - primitive_start(&pair[1])).norm();
            endpoint_gap <= GEOMETRY_EPSILON
                && (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-8
        })
}

fn primitive_start(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { start, .. } | PathPrimitive::Arc { start, .. } => *start,
    }
}

fn primitive_end(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { end, .. } | PathPrimitive::Arc { end, .. } => *end,
    }
}

fn point_on_segment(point: Point, start: Point, end: Point) -> bool {
    let segment = end - start;
    let length_squared = segment.norm_squared();
    if length_squared <= GEOMETRY_EPSILON * GEOMETRY_EPSILON {
        return false;
    }
    let parameter = (point - start).dot(segment) / length_squared;
    let tolerance = GEOMETRY_EPSILON / length_squared.sqrt().max(1.0);
    parameter >= -tolerance && parameter <= 1.0 + tolerance
}

fn push_line(result: &mut Vec<PathPrimitive>, start: Point, end: Point) {
    if (end - start).norm() > GEOMETRY_EPSILON {
        result.push(PathPrimitive::Line { start, end });
    }
}

fn cross(left: Vec2, right: Vec2) -> f64 {
    left.x * right.y - left.y * right.x
}

fn point_is_finite(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}
