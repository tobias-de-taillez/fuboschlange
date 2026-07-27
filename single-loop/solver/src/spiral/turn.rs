use super::biarc::biarc_candidates;
use crate::geometry::{Vec2, canonicalize_path};
use crate::model::{PathPrimitive, Point};
use std::f64::consts::{PI, TAU};

const POSE_TOLERANCE: f64 = 1e-7;
const RADIUS_TOLERANCE_MM: f64 = 1e-7;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pose {
    pub point: Point,
    pub tangent: Vec2,
}

impl Pose {
    pub fn new(point: Point, tangent: Vec2) -> Option<Self> {
        if !point.x.is_finite() || !point.y.is_finite() {
            return None;
        }
        Some(Self {
            point,
            tangent: tangent.normalized()?,
        })
    }

    pub fn from_heading(point: Point, heading_rad: f64) -> Option<Self> {
        if !heading_rad.is_finite() {
            return None;
        }
        Self::new(point, Vec2::from_angle(heading_rad))
    }

    pub(crate) fn is_valid(self) -> bool {
        self.point.x.is_finite()
            && self.point.y.is_finite()
            && self.tangent.x.is_finite()
            && self.tangent.y.is_finite()
            && (self.tangent.norm() - 1.0).abs() <= POSE_TOLERANCE
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum InnerTurnKind {
    Semicircle,
    LargerArc,
    Biarc,
}

#[derive(Clone, Debug, PartialEq)]
pub struct InnerTurnCandidate {
    pub kind: InnerTurnKind,
    pub primitives: Vec<PathPrimitive>,
}

pub fn semicircle_turn(start: Pose, end: Pose, min_radius_mm: f64) -> Option<PathPrimitive> {
    if !start.is_valid()
        || !end.is_valid()
        || !min_radius_mm.is_finite()
        || min_radius_mm <= 0.0
        || (start.tangent + end.tangent).norm() > POSE_TOLERANCE
    {
        return None;
    }
    let chord = end.point - start.point;
    let diameter = chord.norm();
    if !diameter.is_finite()
        || diameter < 2.0 * min_radius_mm
        || chord.dot(start.tangent).abs() > POSE_TOLERANCE * diameter.max(1.0)
    {
        return None;
    }
    let radius_mm = diameter * 0.5;
    let center = start.point + chord * 0.5;
    let start_radial = start.point - center;
    let ccw_tangent = start_radial.perp_ccw().normalized()?;
    let sweep_rad = if ccw_tangent.dot(start.tangent) >= 0.0 {
        PI
    } else {
        -PI
    };
    let arc = PathPrimitive::Arc {
        start: start.point,
        end: end.point,
        center,
        radius_mm,
        sweep_rad,
    };
    if (arc.start_tangent() - start.tangent).norm() > POSE_TOLERANCE
        || (arc.end_tangent() - end.tangent).norm() > POSE_TOLERANCE
        || canonicalize_path(std::slice::from_ref(&arc)).is_err()
    {
        return None;
    }
    Some(arc)
}

pub fn inner_turn_candidates(
    start: Pose,
    end: Pose,
    min_radius_mm: f64,
    reserved_core_diameter_mm: f64,
) -> Vec<InnerTurnCandidate> {
    if !reserved_core_diameter_mm.is_finite() || reserved_core_diameter_mm < 2.0 * min_radius_mm {
        return Vec::new();
    }
    let mut candidates = Vec::new();
    if let Some(arc) = semicircle_turn(start, end, min_radius_mm) {
        let PathPrimitive::Arc { radius_mm, .. } = arc else {
            return Vec::new();
        };
        if 2.0 * radius_mm <= reserved_core_diameter_mm {
            let kind = if (radius_mm - min_radius_mm).abs() <= RADIUS_TOLERANCE_MM {
                InnerTurnKind::Semicircle
            } else {
                InnerTurnKind::LargerArc
            };
            candidates.push(InnerTurnCandidate {
                kind,
                primitives: vec![arc],
            });
        }
    }

    let core_center = start.point + (end.point - start.point) * 0.5;
    for biarc in biarc_candidates(start, end, min_radius_mm) {
        let fits_reserved_core = biarc.iter().all(|primitive| {
            primitive_max_distance_from(primitive, core_center) <= reserved_core_diameter_mm * 0.5
        });
        if fits_reserved_core {
            candidates.push(InnerTurnCandidate {
                kind: InnerTurnKind::Biarc,
                primitives: biarc.into_iter().collect(),
            });
        }
    }

    candidates.sort_by(|left, right| {
        left.kind.cmp(&right.kind).then_with(|| {
            primitive_sequence_key(&left.primitives).cmp(&primitive_sequence_key(&right.primitives))
        })
    });
    candidates.dedup_by(|left, right| left.primitives == right.primitives);
    candidates
}

fn primitive_max_distance_from(primitive: &PathPrimitive, origin: Point) -> f64 {
    match primitive {
        PathPrimitive::Line { start, end } => (*start - origin).norm().max((*end - origin).norm()),
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            let mut maximum = (*start - origin).norm().max((*end - origin).norm());
            let away = *center - origin;
            if let Some(away_direction) = away.normalized() {
                let target_angle = away_direction.y.atan2(away_direction.x);
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let directed_delta = if *sweep_rad > 0.0 {
                    (target_angle - start_angle).rem_euclid(TAU)
                } else {
                    (start_angle - target_angle).rem_euclid(TAU)
                };
                if directed_delta <= sweep_rad.abs() + POSE_TOLERANCE {
                    maximum = maximum.max(away.norm() + *radius_mm);
                }
            }
            maximum
        }
    }
}

fn primitive_sequence_key(primitives: &[PathPrimitive]) -> Vec<u64> {
    let mut key = Vec::with_capacity(primitives.len() * 7);
    for primitive in primitives {
        match primitive {
            PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => key.extend([
                start.x.to_bits(),
                start.y.to_bits(),
                end.x.to_bits(),
                end.y.to_bits(),
                center.x.to_bits(),
                center.y.to_bits(),
                radius_mm.to_bits() ^ sweep_rad.to_bits(),
            ]),
            PathPrimitive::Line { start, end } => key.extend([
                start.x.to_bits(),
                start.y.to_bits(),
                end.x.to_bits(),
                end.y.to_bits(),
                0,
                0,
                0,
            ]),
        }
    }
    key
}
