use crate::geometry::{ANGLE_TOLERANCE_RAD, Vec2};
use crate::model::{PathPrimitive, Point};
use std::f64::consts::{FRAC_PI_2, PI, TAU};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: Point,
    pub max: Point,
}

impl Aabb {
    pub fn from_points(a: Point, b: Point) -> Self {
        Self {
            min: Point::new(a.x.min(b.x), a.y.min(b.y)),
            max: Point::new(a.x.max(b.x), a.y.max(b.y)),
        }
    }

    pub fn include_point(&mut self, point: Point) {
        self.min.x = self.min.x.min(point.x);
        self.min.y = self.min.y.min(point.y);
        self.max.x = self.max.x.max(point.x);
        self.max.y = self.max.y.max(point.y);
    }
}

impl PathPrimitive {
    pub(crate) fn start(&self) -> Point {
        match self {
            Self::Line { start, .. } | Self::Arc { start, .. } => *start,
        }
    }

    pub(crate) fn end(&self) -> Point {
        match self {
            Self::Line { end, .. } | Self::Arc { end, .. } => *end,
        }
    }

    pub(crate) fn with_start(self, start: Point) -> Self {
        match self {
            Self::Line { end, .. } => Self::Line { start, end },
            Self::Arc {
                end,
                center,
                radius_mm,
                sweep_rad,
                ..
            } => Self::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            },
        }
    }

    pub fn length(&self) -> f64 {
        match self {
            Self::Line { start, end } => (*end - *start).norm(),
            Self::Arc {
                radius_mm,
                sweep_rad,
                ..
            } => radius_mm * sweep_rad.abs(),
        }
    }

    pub fn point_at(&self, t: f64) -> Point {
        match self {
            Self::Line { start, end } => start.lerp(*end, t),
            Self::Arc {
                start,
                center,
                radius_mm,
                sweep_rad,
                ..
            } => {
                let a0 = angle_of(*start, *center);
                point_from_angle(*center, *radius_mm, a0 + sweep_rad * t)
            }
        }
    }

    pub fn start_tangent(&self) -> Vec2 {
        match self {
            Self::Line { start, end } => (*end - *start).normalized().unwrap_or(Vec2::ZERO),
            Self::Arc {
                start,
                center,
                sweep_rad,
                ..
            } => tangent_at_point(*start, *center, *sweep_rad),
        }
    }

    pub fn end_tangent(&self) -> Vec2 {
        match self {
            Self::Line { start, end } => (*end - *start).normalized().unwrap_or(Vec2::ZERO),
            Self::Arc {
                end,
                center,
                sweep_rad,
                ..
            } => tangent_at_point(*end, *center, *sweep_rad),
        }
    }

    pub fn bounds(&self) -> Aabb {
        match self {
            Self::Line { start, end } => Aabb::from_points(*start, *end),
            Self::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => {
                let start_angle = angle_of(*start, *center);
                let mut bounds = Aabb::from_points(*start, *end);

                for angle in [0.0, FRAC_PI_2, PI, PI + FRAC_PI_2] {
                    if sweep_contains_angle(start_angle, *sweep_rad, angle) {
                        bounds.include_point(point_from_angle(*center, *radius_mm, angle));
                    }
                }

                bounds
            }
        }
    }
}

pub(crate) fn angle_of(point: Point, center: Point) -> f64 {
    (point.y - center.y).atan2(point.x - center.x)
}

pub(crate) fn point_from_angle(center: Point, radius_mm: f64, angle: f64) -> Point {
    center + Vec2::from_angle(angle) * radius_mm
}

fn tangent_at_point(point: Point, center: Point, sweep_rad: f64) -> Vec2 {
    let radial = (point - center).normalized().unwrap_or(Vec2::ZERO);
    let tangent = radial.perp_ccw();
    if sweep_rad >= 0.0 { tangent } else { -tangent }
}

fn sweep_contains_angle(start_angle: f64, sweep_rad: f64, candidate_angle: f64) -> bool {
    if sweep_rad > 0.0 {
        positive_angle_delta(start_angle, candidate_angle) <= sweep_rad + ANGLE_TOLERANCE_RAD
    } else {
        positive_angle_delta(candidate_angle, start_angle) <= -sweep_rad + ANGLE_TOLERANCE_RAD
    }
}

fn positive_angle_delta(from: f64, to: f64) -> f64 {
    normalize_angle(to - from)
}

fn normalize_angle(angle: f64) -> f64 {
    let normalized = angle.rem_euclid(TAU);
    if normalized.abs() < ANGLE_TOLERANCE_RAD || (TAU - normalized).abs() < ANGLE_TOLERANCE_RAD {
        0.0
    } else {
        normalized
    }
}
