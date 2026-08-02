use super::turn::Pose;
use crate::geometry::{Vec2, canonicalize_path};
use crate::model::{PathPrimitive, Point};
use std::f64::consts::TAU;

const SYSTEM_EPSILON: f64 = 1e-12;
const SWEEP_EPSILON: f64 = 1e-9;
const TANGENT_TOLERANCE: f64 = 1e-7;

pub fn biarc_candidates(start: Pose, end: Pose, min_radius_mm: f64) -> Vec<[PathPrimitive; 2]> {
    if !start.is_valid() || !end.is_valid() || !min_radius_mm.is_finite() || min_radius_mm <= 0.0 {
        return Vec::new();
    }
    let chord_world = end.point - start.point;
    let scale = chord_world.norm();
    if !scale.is_finite() || scale <= SYSTEM_EPSILON {
        return Vec::new();
    }

    let chord = chord_world / scale;
    let tangent_sum = start.tangent + end.tangent;
    let a = 2.0 * (1.0 - start.tangent.dot(end.tangent));
    let b = 2.0 * chord.dot(tangent_sum);
    let c = -chord.norm_squared();
    let mut distances = solve_scaled_quadratic(a, b, c);
    distances.sort_by(|left, right| left.total_cmp(right));
    distances.dedup_by(|left, right| (*left - *right).abs() <= SYSTEM_EPSILON);

    let mut candidates = Vec::new();
    for distance in distances {
        if !distance.is_finite() || distance.abs() <= SYSTEM_EPSILON {
            continue;
        }
        let join_local = (chord + (start.tangent - end.tangent) * distance) * 0.5;
        let join = start.point + join_local * scale;
        let Some(first) = arc_from_start_pose(start, join) else {
            continue;
        };
        let Some(second) = arc_to_end_pose(join, end) else {
            continue;
        };
        let candidate = [first, second];
        if candidate_is_valid(&candidate, start, end, min_radius_mm, scale)
            && !candidates.iter().any(|existing| existing == &candidate)
        {
            candidates.push(candidate);
        }
    }

    candidates.sort_by(|left, right| {
        let left_angle = left[0].end_tangent().y.atan2(left[0].end_tangent().x);
        let right_angle = right[0].end_tangent().y.atan2(right[0].end_tangent().x);
        left_angle
            .total_cmp(&right_angle)
            .then_with(|| primitive_key(&left[0]).cmp(&primitive_key(&right[0])))
    });
    candidates
}

fn solve_scaled_quadratic(a: f64, b: f64, c: f64) -> Vec<f64> {
    let coefficient_scale = a.abs().max(b.abs()).max(c.abs()).max(1.0);
    if a.abs() <= SYSTEM_EPSILON * coefficient_scale {
        if b.abs() <= SYSTEM_EPSILON * coefficient_scale {
            return Vec::new();
        }
        return vec![-c / b];
    }

    let discriminant = b.mul_add(b, -4.0 * a * c);
    let discriminant_tolerance = SYSTEM_EPSILON * (b * b).abs().max((4.0 * a * c).abs()).max(1.0);
    if discriminant < -discriminant_tolerance || !discriminant.is_finite() {
        return Vec::new();
    }
    let square_root = discriminant.max(0.0).sqrt();
    if square_root <= SYSTEM_EPSILON * coefficient_scale {
        return vec![-b / (2.0 * a)];
    }

    // The q form avoids losing the small root when b and sqrt(discriminant)
    // nearly cancel. The linear branch above is the pseudoinverse limit.
    let q = -0.5 * (b + b.signum() * square_root);
    if q.abs() <= SYSTEM_EPSILON * coefficient_scale {
        return vec![
            (-b + square_root) / (2.0 * a),
            (-b - square_root) / (2.0 * a),
        ];
    }
    vec![q / a, c / q]
}

fn arc_from_start_pose(pose: Pose, end: Point) -> Option<PathPrimitive> {
    let chord = end - pose.point;
    let scale = chord.norm();
    if !scale.is_finite() || scale <= SYSTEM_EPSILON {
        return None;
    }
    let unit_chord = chord / scale;
    let center_local = solve_scaled_2x2(pose.tangent, unit_chord, Vec2::new(0.0, 0.5))?;
    let center = pose.point + center_local * scale;
    let signed_radius = center_local.dot(pose.tangent.perp_ccw()) * scale;
    arc_with_center_and_direction(pose.point, end, center, signed_radius.signum())
}

fn arc_to_end_pose(start: Point, pose: Pose) -> Option<PathPrimitive> {
    let chord = start - pose.point;
    let scale = chord.norm();
    if !scale.is_finite() || scale <= SYSTEM_EPSILON {
        return None;
    }
    let unit_chord = chord / scale;
    let center_local = solve_scaled_2x2(pose.tangent, unit_chord, Vec2::new(0.0, 0.5))?;
    let center = pose.point + center_local * scale;
    let signed_radius = center_local.dot(pose.tangent.perp_ccw()) * scale;
    arc_with_center_and_direction(start, pose.point, center, signed_radius.signum())
}

fn solve_scaled_2x2(row_zero: Vec2, row_one: Vec2, rhs: Vec2) -> Option<Vec2> {
    let determinant = row_zero.x.mul_add(row_one.y, -row_zero.y * row_one.x);
    let solution = if determinant.abs() > SYSTEM_EPSILON {
        Vec2::new(
            rhs.x.mul_add(row_one.y, -row_zero.y * rhs.y) / determinant,
            row_zero.x.mul_add(rhs.y, -rhs.x * row_one.x) / determinant,
        )
    } else {
        // Rank-one Moore-Penrose limit. The tangent and chord rows are
        // normalized, so the sole nonzero eigenvalue of A^T A is its trace.
        // Geometric residual checks below reject an inconsistent least-square
        // centre instead of emitting a nearly singular unchecked arc.
        let trace = row_zero.norm_squared().mul_add(1.0, row_one.norm_squared());
        if !trace.is_finite() || trace <= f64::MIN_POSITIVE {
            return None;
        }
        Vec2::new(
            row_zero.x.mul_add(rhs.x, row_one.x * rhs.y) / trace,
            row_zero.y.mul_add(rhs.x, row_one.y * rhs.y) / trace,
        )
    };
    (solution.x.is_finite() && solution.y.is_finite()).then_some(solution)
}

fn arc_with_center_and_direction(
    start: Point,
    end: Point,
    center: Point,
    direction: f64,
) -> Option<PathPrimitive> {
    let start_radius = (start - center).norm();
    let end_radius = (end - center).norm();
    if !start_radius.is_finite()
        || !end_radius.is_finite()
        || start_radius <= 0.0
        || (start_radius - end_radius).abs() > TANGENT_TOLERANCE * start_radius.max(1.0)
    {
        return None;
    }
    let start_angle = (start.y - center.y).atan2(start.x - center.x);
    let end_angle = (end.y - center.y).atan2(end.x - center.x);
    let sweep_rad = directed_sweep(start_angle, end_angle, direction);
    if !sweep_rad.is_finite()
        || sweep_rad.abs() <= SWEEP_EPSILON
        || sweep_rad.abs() >= TAU - SWEEP_EPSILON
    {
        return None;
    }
    Some(PathPrimitive::Arc {
        start,
        end,
        center,
        radius_mm: start_radius,
        sweep_rad,
    })
}

fn directed_sweep(start_angle: f64, end_angle: f64, direction: f64) -> f64 {
    if direction > 0.0 {
        (end_angle - start_angle).rem_euclid(TAU)
    } else {
        -(start_angle - end_angle).rem_euclid(TAU)
    }
}

fn candidate_is_valid(
    candidate: &[PathPrimitive; 2],
    start: Pose,
    end: Pose,
    min_radius_mm: f64,
    scale: f64,
) -> bool {
    let coordinate_tolerance = TANGENT_TOLERANCE * scale.max(1.0);
    let endpoint_residuals_valid = (candidate[0].point_at(0.0) - start.point).norm()
        <= coordinate_tolerance
        && (candidate[1].point_at(1.0) - end.point).norm() <= coordinate_tolerance
        && (candidate[0].point_at(1.0) - candidate[1].point_at(0.0)).norm() <= coordinate_tolerance;
    let tangents_valid = (candidate[0].start_tangent() - start.tangent).norm() <= TANGENT_TOLERANCE
        && (candidate[1].end_tangent() - end.tangent).norm() <= TANGENT_TOLERANCE
        && (candidate[0].end_tangent() - candidate[1].start_tangent()).norm() <= TANGENT_TOLERANCE;
    let primitives_valid = candidate.iter().all(|primitive| match primitive {
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            point_is_finite(*start)
                && point_is_finite(*end)
                && point_is_finite(*center)
                && radius_mm.is_finite()
                && *radius_mm >= min_radius_mm
                && sweep_rad.is_finite()
                && sweep_rad.abs() > SWEEP_EPSILON
                && sweep_rad.abs() < TAU - SWEEP_EPSILON
        }
        PathPrimitive::Line { .. } => false,
    });
    endpoint_residuals_valid
        && tangents_valid
        && primitives_valid
        && canonicalize_path(candidate).is_ok()
}

fn primitive_key(primitive: &PathPrimitive) -> [u64; 6] {
    match primitive {
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            ..
        } => [
            start.x.to_bits(),
            start.y.to_bits(),
            end.x.to_bits(),
            end.y.to_bits(),
            center.x.to_bits(),
            radius_mm.to_bits(),
        ],
        PathPrimitive::Line { start, end } => [
            start.x.to_bits(),
            start.y.to_bits(),
            end.x.to_bits(),
            end.y.to_bits(),
            0,
            0,
        ],
    }
}

fn point_is_finite(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}
