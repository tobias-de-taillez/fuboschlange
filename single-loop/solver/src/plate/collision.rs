use crate::model::{PathPrimitive, Point};
use std::f64::consts::TAU;

pub fn primitive_circle_clearance(
    primitive: &PathPrimitive,
    circle_center: Point,
    circle_radius_mm: f64,
) -> f64 {
    if !circle_center.x.is_finite()
        || !circle_center.y.is_finite()
        || !circle_radius_mm.is_finite()
        || circle_radius_mm < 0.0
    {
        return f64::NEG_INFINITY;
    }
    let distance_to_center = match primitive {
        PathPrimitive::Line { start, end } => {
            let segment = *end - *start;
            let length_squared = segment.norm_squared();
            if !length_squared.is_finite() || length_squared <= 0.0 {
                return f64::NEG_INFINITY;
            }
            let parameter =
                ((circle_center - *start).dot(segment) / length_squared).clamp(0.0, 1.0);
            let closest = *start + segment * parameter;
            (circle_center - closest).norm()
        }
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            if !radius_mm.is_finite()
                || *radius_mm <= 0.0
                || !sweep_rad.is_finite()
                || *sweep_rad == 0.0
            {
                return f64::NEG_INFINITY;
            }
            let offset = circle_center - *center;
            let center_distance = offset.norm();
            let start_angle = (*start - *center).y.atan2((*start - *center).x);
            let target_angle = offset.y.atan2(offset.x);
            if center_distance == 0.0 || sweep_contains_angle(start_angle, *sweep_rad, target_angle)
            {
                (center_distance - *radius_mm).abs()
            } else {
                (circle_center - *start)
                    .norm()
                    .min((circle_center - *end).norm())
            }
        }
    };
    distance_to_center - circle_radius_mm
}

fn sweep_contains_angle(start_angle: f64, sweep_rad: f64, target_angle: f64) -> bool {
    if sweep_rad > 0.0 {
        (target_angle - start_angle).rem_euclid(TAU) <= sweep_rad + 1e-12
    } else {
        (start_angle - target_angle).rem_euclid(TAU) <= -sweep_rad + 1e-12
    }
}
