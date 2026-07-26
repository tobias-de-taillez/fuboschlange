use crate::geometry::ANGLE_TOLERANCE_RAD;
use crate::geometry::intersection::{Intersection, primitive_intersections};
use crate::geometry::predicates::{
    PARAMETER_TOLERANCE, ParameterRange, arc_parameter_for_angle, arc_properties,
    arc_range_intervals_strict, point_on_arc_parameter_in_range, point_on_line_parameter,
};
use crate::model::{PathPrimitive, Point};
use std::cmp::Ordering;
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClosestPair {
    pub point_on_a: Point,
    pub point_on_b: Point,
    pub a_t: f64,
    pub b_t: f64,
    pub distance_mm: f64,
}

pub fn primitive_distance(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> ClosestPair {
    let intersections = primitive_intersections(a, b);
    let mut candidates = endpoint_projection_candidates(a, a_range, b, b_range);
    candidates.extend(zero_distance_candidates(
        a,
        a_range,
        b,
        b_range,
        &intersections,
    ));
    candidates.extend(interior_stationary_candidates(a, a_range, b, b_range));
    choose_lexicographically_stable_minimum(candidates)
}

fn endpoint_projection_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    let mut candidates = Vec::new();

    for a_t in endpoint_parameters(a_range) {
        let point = a.point_at(a_t);
        candidates.push(point_to_primitive_candidate(a, a_t, point, b, b_range));
    }

    for b_t in endpoint_parameters(b_range) {
        let point = b.point_at(b_t);
        let candidate = point_to_primitive_candidate(b, b_t, point, a, a_range);
        candidates.push(ClosestPair {
            point_on_a: candidate.point_on_b,
            point_on_b: candidate.point_on_a,
            a_t: candidate.b_t,
            b_t: candidate.a_t,
            distance_mm: candidate.distance_mm,
        });
    }

    candidates
}

fn zero_distance_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
    intersections: &Intersection,
) -> Vec<ClosestPair> {
    match intersections {
        Intersection::None => Vec::new(),
        Intersection::Points(points) => points
            .iter()
            .filter(|point| a_range.contains(point.a_t) && b_range.contains(point.b_t))
            .map(|point| ClosestPair {
                point_on_a: point.point,
                point_on_b: point.point,
                a_t: a_range.clamp(point.a_t),
                b_t: b_range.clamp(point.b_t),
                distance_mm: 0.0,
            })
            .collect(),
        Intersection::Overlap => overlap_candidates(a, a_range, b, b_range),
    }
}

fn overlap_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    match (a, b) {
        (PathPrimitive::Line { .. }, PathPrimitive::Line { .. }) => {
            line_line_overlap_candidates(a, a_range, b, b_range)
        }
        (PathPrimitive::Arc { .. }, PathPrimitive::Arc { .. }) => {
            arc_arc_overlap_candidates(a, a_range, b, b_range)
        }
        _ => Vec::new(),
    }
}

fn line_line_overlap_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    let b_start_on_a = point_on_line_parameter(a, b.point_at(b_range.start));
    let b_end_on_a = point_on_line_parameter(a, b.point_at(b_range.end));
    let overlap_start = a_range.start.max(b_start_on_a.min(b_end_on_a));
    let overlap_end = a_range.end.min(b_start_on_a.max(b_end_on_a));
    if overlap_end + PARAMETER_TOLERANCE < overlap_start {
        return Vec::new();
    }

    let start_point = a.point_at(a_range.clamp(overlap_start));
    let end_point = a.point_at(a_range.clamp(overlap_end));
    let point = lexicographically_smaller_point(start_point, end_point);
    vec![zero_candidate_from_shared_point(
        a, a_range, b, b_range, point,
    )]
}

fn arc_arc_overlap_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    let (a_center, a_radius_mm, _a_start_angle, _a_sweep_rad) = arc_properties(a);
    let (b_center, b_radius_mm, _b_start_angle, _b_sweep_rad) = arc_properties(b);
    if a_center != b_center || a_radius_mm != b_radius_mm {
        return Vec::new();
    }

    let a_intervals = arc_range_intervals_strict(a, a_range);
    let b_intervals = arc_range_intervals_strict(b, b_range);
    let mut candidates = Vec::new();

    for (a_start, a_end) in &a_intervals {
        for (b_start, b_end) in &b_intervals {
            let overlap_start = a_start.max(*b_start);
            let overlap_end = a_end.min(*b_end);
            if overlap_end <= overlap_start {
                continue;
            }

            let point = lexicographically_smallest_point_on_circle_interval(
                a_center,
                a_radius_mm,
                overlap_start,
                overlap_end,
            );
            candidates.push(zero_candidate_from_shared_point(
                a, a_range, b, b_range, point,
            ));
        }
    }

    candidates
}

fn zero_candidate_from_shared_point(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
    point: Point,
) -> ClosestPair {
    ClosestPair {
        point_on_a: point,
        point_on_b: point,
        a_t: parameter_for_shared_point(a, a_range, point),
        b_t: parameter_for_shared_point(b, b_range, point),
        distance_mm: 0.0,
    }
}

fn parameter_for_shared_point(
    primitive: &PathPrimitive,
    range: ParameterRange,
    point: Point,
) -> f64 {
    match primitive {
        PathPrimitive::Line { .. } => range.clamp(point_on_line_parameter(primitive, point)),
        PathPrimitive::Arc { .. } => point_on_arc_parameter_in_range(primitive, point, range)
            .unwrap_or_else(|| point_to_arc_parameter(point, primitive, range)),
    }
}

fn lexicographically_smaller_point(a: Point, b: Point) -> Point {
    match compare_point_coordinates(&a, &b) {
        Ordering::Greater => b,
        Ordering::Less | Ordering::Equal => a,
    }
}

fn lexicographically_smallest_point_on_circle_interval(
    center: Point,
    radius_mm: f64,
    start_angle: f64,
    end_angle: f64,
) -> Point {
    let mut candidates = vec![
        point_on_circle(center, radius_mm, start_angle),
        point_on_circle(center, radius_mm, end_angle),
    ];
    if start_angle <= PI + ANGLE_TOLERANCE_RAD && end_angle + ANGLE_TOLERANCE_RAD >= PI {
        candidates.push(point_on_circle(center, radius_mm, PI));
    }

    candidates
        .into_iter()
        .min_by(|left, right| compare_point_coordinates(left, right))
        .expect("shared arc interval must yield at least one point")
}

fn point_on_circle(center: Point, radius_mm: f64, angle: f64) -> Point {
    Point::new(
        center.x + radius_mm * angle.cos(),
        center.y + radius_mm * angle.sin(),
    )
}

fn compare_point_coordinates(left: &Point, right: &Point) -> Ordering {
    left.x
        .total_cmp(&right.x)
        .then_with(|| left.y.total_cmp(&right.y))
}

fn interior_stationary_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    match (a, b) {
        (PathPrimitive::Line { .. }, PathPrimitive::Line { .. }) => {
            line_line_stationary_candidates(a, a_range, b, b_range)
        }
        (PathPrimitive::Line { .. }, PathPrimitive::Arc { .. }) => {
            line_arc_stationary_candidates(a, a_range, b, b_range)
        }
        (PathPrimitive::Arc { .. }, PathPrimitive::Line { .. }) => {
            line_arc_stationary_candidates(b, b_range, a, a_range)
                .into_iter()
                .map(|candidate| ClosestPair {
                    point_on_a: candidate.point_on_b,
                    point_on_b: candidate.point_on_a,
                    a_t: candidate.b_t,
                    b_t: candidate.a_t,
                    distance_mm: candidate.distance_mm,
                })
                .collect()
        }
        (PathPrimitive::Arc { .. }, PathPrimitive::Arc { .. }) => {
            arc_arc_stationary_candidates(a, a_range, b, b_range)
        }
    }
}

fn line_line_stationary_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    let PathPrimitive::Line {
        start: a_start,
        end: a_end,
    } = a
    else {
        unreachable!();
    };
    let PathPrimitive::Line {
        start: b_start,
        end: b_end,
    } = b
    else {
        unreachable!();
    };

    let a_dir = *a_end - *a_start;
    let b_dir = *b_end - *b_start;
    let delta = *a_start - *b_start;
    let aa = a_dir.dot(a_dir);
    let ab = a_dir.dot(b_dir);
    let bb = b_dir.dot(b_dir);
    let ad = a_dir.dot(delta);
    let bd = b_dir.dot(delta);
    let denominator = aa * bb - ab * ab;
    if denominator.abs() <= f64::EPSILON {
        return Vec::new();
    }

    let a_t = (ab * bd - bb * ad) / denominator;
    let b_t = (aa * bd - ab * ad) / denominator;
    if !a_range.contains(a_t) || !b_range.contains(b_t) {
        return Vec::new();
    }

    vec![make_candidate(a, a_range.clamp(a_t), b, b_range.clamp(b_t))]
}

fn line_arc_stationary_candidates(
    line: &PathPrimitive,
    line_range: ParameterRange,
    arc: &PathPrimitive,
    arc_range: ParameterRange,
) -> Vec<ClosestPair> {
    let PathPrimitive::Line { start, end } = line else {
        unreachable!();
    };
    let line_dir = *end - *start;
    let Some(unit_dir) = line_dir.normalized() else {
        return Vec::new();
    };

    let (center, radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    let mut candidates = Vec::new();
    for normal in [unit_dir.perp_ccw(), -unit_dir.perp_ccw()] {
        let arc_point = center + normal * radius_mm;
        let Some(arc_t) = point_on_arc_parameter_in_range(arc, arc_point, arc_range) else {
            continue;
        };
        let line_t = point_to_line_parameter(arc_point, line, line_range);
        candidates.push(make_candidate(line, line_t, arc, arc_t));
    }

    candidates
}

fn arc_arc_stationary_candidates(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> Vec<ClosestPair> {
    let (a_center, _a_radius, _a_start_angle, _a_sweep) = arc_properties(a);
    let (b_center, _b_radius, _b_start_angle, _b_sweep) = arc_properties(b);
    let center_delta = b_center - a_center;
    if center_delta.norm() <= f64::EPSILON {
        return Vec::new();
    }

    let centerline_angle = center_delta.y.atan2(center_delta.x);
    let mut candidates = Vec::new();
    for a_angle in [centerline_angle, centerline_angle + PI] {
        let Some(a_t) = arc_parameter_for_angle(a, a_angle) else {
            continue;
        };
        if !a_range.contains(a_t) {
            continue;
        }

        for b_angle in [centerline_angle, centerline_angle + PI] {
            let Some(b_t) = arc_parameter_for_angle(b, b_angle) else {
                continue;
            };
            if !b_range.contains(b_t) {
                continue;
            }

            candidates.push(make_candidate(a, a_range.clamp(a_t), b, b_range.clamp(b_t)));
        }
    }

    candidates
}

fn point_to_primitive_candidate(
    a: &PathPrimitive,
    a_t: f64,
    point: Point,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> ClosestPair {
    match b {
        PathPrimitive::Line { .. } => {
            let b_t = point_to_line_parameter(point, b, b_range);
            make_candidate(a, a_t, b, b_t)
        }
        PathPrimitive::Arc { .. } => {
            let b_t = point_to_arc_parameter(point, b, b_range);
            make_candidate(a, a_t, b, b_t)
        }
    }
}

fn point_to_line_parameter(point: Point, line: &PathPrimitive, range: ParameterRange) -> f64 {
    let PathPrimitive::Line { start, end } = line else {
        unreachable!();
    };
    let direction = *end - *start;
    let length_squared = direction.norm_squared();
    if length_squared == 0.0 {
        return range.start;
    }

    let t = (point - *start).dot(direction) / length_squared;
    range.clamp(t)
}

fn point_to_arc_parameter(point: Point, arc: &PathPrimitive, range: ParameterRange) -> f64 {
    let mut candidates = endpoint_parameters(range).into_iter().collect::<Vec<_>>();
    let (center, _radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    if point.distance_to(center) > PARAMETER_TOLERANCE {
        let point_angle = (point.y - center.y).atan2(point.x - center.x);
        if let Some(t) = arc_parameter_for_angle(arc, point_angle) {
            if range.contains(t) {
                candidates.push(range.clamp(t));
            }
        }
    }

    candidates
        .into_iter()
        .map(|t| range.clamp(t))
        .min_by(|left, right| {
            let left_distance = point.distance_to(arc.point_at(*left));
            let right_distance = point.distance_to(arc.point_at(*right));
            left_distance
                .total_cmp(&right_distance)
                .then_with(|| left.total_cmp(right))
        })
        .unwrap_or(range.start)
}

fn endpoint_parameters(range: ParameterRange) -> [f64; 2] {
    [range.start, range.end]
}

fn choose_lexicographically_stable_minimum(candidates: Vec<ClosestPair>) -> ClosestPair {
    candidates
        .into_iter()
        .min_by(compare_candidates)
        .expect("distance candidates must not be empty")
}

fn compare_candidates(left: &ClosestPair, right: &ClosestPair) -> Ordering {
    left.distance_mm
        .total_cmp(&right.distance_mm)
        .then_with(|| left.point_on_a.x.total_cmp(&right.point_on_a.x))
        .then_with(|| left.point_on_a.y.total_cmp(&right.point_on_a.y))
        .then_with(|| left.point_on_b.x.total_cmp(&right.point_on_b.x))
        .then_with(|| left.point_on_b.y.total_cmp(&right.point_on_b.y))
        .then_with(|| left.a_t.total_cmp(&right.a_t))
        .then_with(|| left.b_t.total_cmp(&right.b_t))
}

fn make_candidate(a: &PathPrimitive, a_t: f64, b: &PathPrimitive, b_t: f64) -> ClosestPair {
    let point_on_a = a.point_at(a_t);
    let point_on_b = b.point_at(b_t);
    ClosestPair {
        point_on_a,
        point_on_b,
        a_t,
        b_t,
        distance_mm: point_on_a.distance_to(point_on_b),
    }
}
