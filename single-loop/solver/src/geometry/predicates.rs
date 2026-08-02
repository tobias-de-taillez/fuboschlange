use crate::geometry::primitive::angle_of;
use crate::geometry::{ANGLE_TOLERANCE_RAD, POSITION_TOLERANCE_MM};
use crate::model::{PathPrimitive, Point};
use std::f64::consts::TAU;

pub(crate) const PARAMETER_TOLERANCE: f64 = 1e-12;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParameterRange {
    pub start: f64,
    pub end: f64,
}

impl ParameterRange {
    pub const FULL: Self = Self {
        start: 0.0,
        end: 1.0,
    };

    pub fn new(start: f64, end: f64) -> Self {
        assert!(start.is_finite());
        assert!(end.is_finite());
        assert!(start >= 0.0 - PARAMETER_TOLERANCE);
        assert!(end <= 1.0 + PARAMETER_TOLERANCE);
        assert!(start <= end + PARAMETER_TOLERANCE);

        Self {
            start: clamp_unit(start),
            end: clamp_unit(end),
        }
    }

    pub(crate) fn contains(self, value: f64) -> bool {
        value >= self.start - PARAMETER_TOLERANCE && value <= self.end + PARAMETER_TOLERANCE
    }

    pub(crate) fn clamp(self, value: f64) -> f64 {
        clamp_to_interval(value, self.start, self.end)
    }
}

pub(crate) fn clamp_unit(value: f64) -> f64 {
    clamp_to_interval(value, 0.0, 1.0)
}

pub(crate) fn clamp_to_interval(value: f64, min: f64, max: f64) -> f64 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

pub(crate) fn same_point(a: Point, b: Point) -> bool {
    a.distance_to(b) <= POSITION_TOLERANCE_MM
}

pub(crate) fn line_endpoints(line: &PathPrimitive) -> (Point, Point) {
    match line {
        PathPrimitive::Line { start, end } => (*start, *end),
        PathPrimitive::Arc { .. } => panic!("expected line primitive"),
    }
}

pub(crate) fn arc_properties(arc: &PathPrimitive) -> (Point, f64, f64, f64) {
    match arc {
        PathPrimitive::Arc {
            start,
            center,
            radius_mm,
            sweep_rad,
            ..
        } => (*center, *radius_mm, angle_of(*start, *center), *sweep_rad),
        PathPrimitive::Line { .. } => panic!("expected arc primitive"),
    }
}

pub(crate) fn point_on_line_parameter(line: &PathPrimitive, point: Point) -> f64 {
    let (start, end) = line_endpoints(line);
    let direction = end - start;
    let length_squared = direction.norm_squared();
    if length_squared == 0.0 {
        0.0
    } else {
        (point - start).dot(direction) / length_squared
    }
}

pub(crate) fn solve_line_parameters(
    a_start: Point,
    a_end: Point,
    b_start: Point,
    b_end: Point,
) -> Option<(f64, f64)> {
    let a_direction = a_end - a_start;
    let b_direction = b_end - b_start;
    let a_scale = a_direction.x.abs().max(a_direction.y.abs());
    let b_scale = b_direction.x.abs().max(b_direction.y.abs());
    if a_scale == 0.0 || b_scale == 0.0 {
        return None;
    }

    let scaled_a = a_direction / a_scale;
    let scaled_b = b_direction / b_scale;
    let denominator = scaled_a.x * scaled_b.y - scaled_a.y * scaled_b.x;
    if denominator == 0.0 {
        return None;
    }

    let delta = b_start - a_start;
    let delta_for_a = delta / a_scale;
    let delta_for_b = delta / b_scale;
    let a_t = (delta_for_a.x * scaled_b.y - delta_for_a.y * scaled_b.x) / denominator;
    let b_t = (delta_for_b.x * scaled_a.y - delta_for_b.y * scaled_a.x) / denominator;
    Some((a_t, b_t))
}

pub(crate) fn arc_parameter_for_angle(arc: &PathPrimitive, angle: f64) -> Option<f64> {
    let (_center, _radius_mm, start_angle, sweep_rad) = arc_properties(arc);
    let signed_delta = signed_angle_delta(start_angle, angle, sweep_rad);
    let t = if sweep_rad == 0.0 {
        0.0
    } else {
        signed_delta / sweep_rad
    };

    ((-PARAMETER_TOLERANCE..=1.0 + PARAMETER_TOLERANCE).contains(&t)).then_some(clamp_unit(t))
}

pub(crate) fn arc_parameter_for_angle_strict(arc: &PathPrimitive, angle: f64) -> Option<f64> {
    let (_center, _radius_mm, start_angle, sweep_rad) = arc_properties(arc);
    let signed_delta = signed_angle_delta_strict(start_angle, angle, sweep_rad);
    let t = if sweep_rad == 0.0 {
        0.0
    } else {
        signed_delta / sweep_rad
    };

    ((-PARAMETER_TOLERANCE..=1.0 + PARAMETER_TOLERANCE).contains(&t)).then_some(clamp_unit(t))
}

pub(crate) fn arc_parameter_for_point_with_radial_tolerance(
    arc: &PathPrimitive,
    point: Point,
    radial_tolerance_mm: f64,
) -> Option<f64> {
    let (center, radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    if (point.distance_to(center) - radius_mm).abs() > radial_tolerance_mm {
        return None;
    }

    arc_parameter_for_angle(arc, angle_of(point, center))
}

pub(crate) fn arc_parameter_for_point_with_radial_tolerance_strict(
    arc: &PathPrimitive,
    point: Point,
    radial_tolerance_mm: f64,
) -> Option<f64> {
    let (center, radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    if (point.distance_to(center) - radius_mm).abs() > radial_tolerance_mm {
        return None;
    }

    arc_parameter_for_angle_strict(arc, angle_of(point, center))
}

pub(crate) fn arc_parameter_for_point(arc: &PathPrimitive, point: Point) -> Option<f64> {
    arc_parameter_for_point_with_radial_tolerance(arc, point, POSITION_TOLERANCE_MM)
}

pub(crate) fn point_on_arc_parameter_in_range(
    arc: &PathPrimitive,
    point: Point,
    range: ParameterRange,
) -> Option<f64> {
    let t = arc_parameter_for_point(arc, point)?;
    range.contains(t).then_some(range.clamp(t))
}

pub(crate) fn arc_range_intervals_strict(
    arc: &PathPrimitive,
    range: ParameterRange,
) -> Vec<(f64, f64)> {
    let (_center, _radius_mm, start_angle, sweep_rad) = arc_properties(arc);
    let range_start_angle = start_angle + sweep_rad * range.start;
    let range_sweep = sweep_rad * (range.end - range.start);
    arc_set_intervals_strict(range_start_angle, range_sweep)
}

pub(crate) fn normalize_angle(angle: f64) -> f64 {
    let normalized = angle.rem_euclid(TAU);
    if normalized.abs() < ANGLE_TOLERANCE_RAD || (TAU - normalized).abs() < ANGLE_TOLERANCE_RAD {
        0.0
    } else {
        normalized
    }
}

pub(crate) fn normalize_angle_strict(angle: f64) -> f64 {
    angle.rem_euclid(TAU)
}

pub(crate) fn positive_angle_delta(from: f64, to: f64) -> f64 {
    normalize_angle(to - from)
}

pub(crate) fn positive_angle_delta_strict(from: f64, to: f64) -> f64 {
    normalize_angle_strict(to - from)
}

pub(crate) fn signed_angle_delta(start_angle: f64, candidate_angle: f64, sweep_rad: f64) -> f64 {
    if sweep_rad >= 0.0 {
        positive_angle_delta(start_angle, candidate_angle)
    } else {
        -positive_angle_delta(candidate_angle, start_angle)
    }
}

pub(crate) fn signed_angle_delta_strict(
    start_angle: f64,
    candidate_angle: f64,
    sweep_rad: f64,
) -> f64 {
    if sweep_rad >= 0.0 {
        positive_angle_delta_strict(start_angle, candidate_angle)
    } else {
        -positive_angle_delta_strict(candidate_angle, start_angle)
    }
}

pub(crate) fn arc_set_intervals_strict(start_angle: f64, sweep_rad: f64) -> Vec<(f64, f64)> {
    let begin = if sweep_rad >= 0.0 {
        normalize_angle_strict(start_angle)
    } else {
        normalize_angle_strict(start_angle + sweep_rad)
    };
    let length = sweep_rad.abs();
    let end = begin + length;

    if end <= TAU {
        vec![(begin, end)]
    } else {
        vec![(begin, TAU), (0.0, end - TAU)]
    }
    .into_iter()
    .filter(|(start, end)| end > start)
    .collect()
}
