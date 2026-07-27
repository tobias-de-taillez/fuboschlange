use crate::geometry::Vec2;
use crate::geometry::canonicalize_path;
use crate::model::PathPrimitive;
use crate::spiral::{Pose, biarc_candidates, semicircle_turn};
use std::f64::consts::TAU;

const TANGENT_TOLERANCE: f64 = 1e-7;

#[derive(Clone, Debug, PartialEq)]
pub struct RouteTransition {
    pub primitives: Vec<PathPrimitive>,
    pub length_mm: f64,
    pub bend_count: u16,
    pub clearance_reserve_mm: f64,
}

pub fn pose_transitions(start: Pose, end: Pose, min_radius_mm: f64) -> Vec<RouteTransition> {
    let mut transitions = direct_pose_transitions(start, end, min_radius_mm);
    let chord_length = (end.point - start.point).norm();
    for distance_mm in [50.0, 100.0, 150.0, 200.0] {
        if distance_mm >= chord_length || !chord_length.is_finite() {
            continue;
        }
        let prefix_end = start.point + start.tangent * distance_mm;
        if let Some(prefix_pose) = Pose::new(prefix_end, start.tangent) {
            for tail in direct_pose_transitions(prefix_pose, end, min_radius_mm) {
                let mut primitives = vec![PathPrimitive::Line {
                    start: start.point,
                    end: prefix_end,
                }];
                primitives.extend(tail.primitives);
                push_transition(&mut transitions, primitives, tail.bend_count, min_radius_mm);
            }
        }
        let suffix_start = end.point - end.tangent * distance_mm;
        if let Some(suffix_pose) = Pose::new(suffix_start, end.tangent) {
            for head in direct_pose_transitions(start, suffix_pose, min_radius_mm) {
                let mut primitives = head.primitives;
                primitives.push(PathPrimitive::Line {
                    start: suffix_start,
                    end: end.point,
                });
                push_transition(&mut transitions, primitives, head.bend_count, min_radius_mm);
            }
        }
    }
    sort_and_deduplicate(&mut transitions);
    transitions
}

fn direct_pose_transitions(start: Pose, end: Pose, min_radius_mm: f64) -> Vec<RouteTransition> {
    if !min_radius_mm.is_finite() || min_radius_mm <= 0.0 {
        return Vec::new();
    }
    let mut transitions = Vec::new();
    let displacement = end.point - start.point;
    if let Some(direction) = displacement.normalized()
        && (direction - start.tangent).norm() <= TANGENT_TOLERANCE
        && (direction - end.tangent).norm() <= TANGENT_TOLERANCE
    {
        push_transition(
            &mut transitions,
            vec![PathPrimitive::Line {
                start: start.point,
                end: end.point,
            }],
            0,
            min_radius_mm,
        );
    }
    if let Some(arc) = single_tangent_arc(start, end, min_radius_mm) {
        push_transition(&mut transitions, vec![arc], 1, min_radius_mm);
    }
    if let Some(arc) = semicircle_turn(start, end, min_radius_mm) {
        push_transition(&mut transitions, vec![arc], 1, min_radius_mm);
    }
    for biarc in biarc_candidates(start, end, min_radius_mm) {
        push_transition(
            &mut transitions,
            biarc.into_iter().collect(),
            2,
            min_radius_mm,
        );
    }
    sort_and_deduplicate(&mut transitions);
    transitions
}

fn sort_and_deduplicate(transitions: &mut Vec<RouteTransition>) {
    transitions.sort_by(|left, right| {
        left.length_mm
            .total_cmp(&right.length_mm)
            .then_with(|| left.bend_count.cmp(&right.bend_count))
            .then_with(|| {
                right
                    .clearance_reserve_mm
                    .total_cmp(&left.clearance_reserve_mm)
            })
            .then_with(|| transition_key(&left.primitives).cmp(&transition_key(&right.primitives)))
    });
    transitions.dedup_by(|left, right| left.primitives == right.primitives);
}

fn single_tangent_arc(start: Pose, end: Pose, min_radius_mm: f64) -> Option<PathPrimitive> {
    let first_normal = start.tangent.perp_ccw();
    let second_normal = end.tangent.perp_ccw();
    let negated_second = -second_normal;
    let displacement = end.point - start.point;
    let determinant = cross(first_normal, negated_second);
    if determinant.abs() <= 1e-12 {
        return None;
    }
    let first_signed_radius = cross(displacement, negated_second) / determinant;
    let second_signed_radius = cross(first_normal, displacement) / determinant;
    let radius_mm = first_signed_radius.abs();
    if !radius_mm.is_finite()
        || radius_mm < min_radius_mm
        || first_signed_radius.signum() != second_signed_radius.signum()
        || (radius_mm - second_signed_radius.abs()).abs() > 1e-7 * radius_mm.max(1.0)
    {
        return None;
    }
    let center = start.point + first_normal * first_signed_radius;
    let start_angle = (start.point.y - center.y).atan2(start.point.x - center.x);
    let end_angle = (end.point.y - center.y).atan2(end.point.x - center.x);
    let sweep_rad = if first_signed_radius > 0.0 {
        (end_angle - start_angle).rem_euclid(TAU)
    } else {
        -(start_angle - end_angle).rem_euclid(TAU)
    };
    if sweep_rad.abs() <= 1e-9 || sweep_rad.abs() >= TAU - 1e-9 {
        return None;
    }
    let arc = PathPrimitive::Arc {
        start: start.point,
        end: end.point,
        center,
        radius_mm,
        sweep_rad,
    };
    ((arc.start_tangent() - start.tangent).norm() <= TANGENT_TOLERANCE
        && (arc.end_tangent() - end.tangent).norm() <= TANGENT_TOLERANCE
        && canonicalize_path(std::slice::from_ref(&arc)).is_ok())
    .then_some(arc)
}

fn cross(left: Vec2, right: Vec2) -> f64 {
    left.x * right.y - left.y * right.x
}

fn push_transition(
    transitions: &mut Vec<RouteTransition>,
    primitives: Vec<PathPrimitive>,
    bend_count: u16,
    min_radius_mm: f64,
) {
    let Ok(path) = canonicalize_path(&primitives) else {
        return;
    };
    if path.primitives().len() != primitives.len() {
        return;
    }
    let clearance_reserve_mm = primitives
        .iter()
        .filter_map(|primitive| match primitive {
            PathPrimitive::Arc { radius_mm, .. } => Some(*radius_mm - min_radius_mm),
            PathPrimitive::Line { .. } => None,
        })
        .fold(f64::INFINITY, f64::min);
    let clearance_reserve_mm = if clearance_reserve_mm.is_finite() {
        clearance_reserve_mm
    } else {
        f64::MAX
    };
    transitions.push(RouteTransition {
        length_mm: primitives.iter().map(PathPrimitive::length).sum(),
        primitives,
        bend_count,
        clearance_reserve_mm,
    });
}

fn transition_key(primitives: &[PathPrimitive]) -> Vec<u64> {
    let mut key = Vec::with_capacity(primitives.len() * 7);
    for primitive in primitives {
        match primitive {
            PathPrimitive::Line { start, end } => key.extend([
                0,
                start.x.to_bits(),
                start.y.to_bits(),
                end.x.to_bits(),
                end.y.to_bits(),
                0,
                0,
            ]),
            PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => key.extend([
                1,
                start.x.to_bits(),
                start.y.to_bits(),
                end.x.to_bits(),
                end.y.to_bits(),
                center.x.to_bits() ^ center.y.to_bits(),
                radius_mm.to_bits() ^ sweep_rad.to_bits(),
            ]),
        }
    }
    key
}
