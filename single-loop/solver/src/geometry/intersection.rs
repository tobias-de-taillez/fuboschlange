use crate::geometry::POSITION_TOLERANCE_MM;
use crate::geometry::predicates::{
    arc_parameter_for_point_with_radial_tolerance_strict, arc_properties, arc_set_intervals_strict,
    line_endpoints, point_on_line_parameter, same_point, solve_line_parameters,
};
use crate::model::{PathPrimitive, Point};
use robust::Coord;
use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IntersectionPoint {
    pub point: Point,
    pub a_t: f64,
    pub b_t: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Intersection {
    None,
    Points(Vec<IntersectionPoint>),
    Overlap,
}

impl Intersection {
    pub fn points(&self) -> &[IntersectionPoint] {
        match self {
            Self::Points(points) => points,
            Self::None | Self::Overlap => &[],
        }
    }
}

pub fn primitive_intersections(a: &PathPrimitive, b: &PathPrimitive) -> Intersection {
    match (a, b) {
        (PathPrimitive::Line { .. }, PathPrimitive::Line { .. }) => line_line_intersections(a, b),
        (PathPrimitive::Line { .. }, PathPrimitive::Arc { .. }) => line_arc_intersections(a, b),
        (PathPrimitive::Arc { .. }, PathPrimitive::Line { .. }) => {
            swap_intersection(line_arc_intersections(b, a))
        }
        (PathPrimitive::Arc { .. }, PathPrimitive::Arc { .. }) => arc_arc_intersections(a, b),
    }
}

fn line_line_intersections(a: &PathPrimitive, b: &PathPrimitive) -> Intersection {
    let (p, p2) = line_endpoints(a);
    let (q, q2) = line_endpoints(b);
    let o1 = orient(p, p2, q);
    let o2 = orient(p, p2, q2);
    let o3 = orient(q, q2, p);
    let o4 = orient(q, q2, p2);

    if o1 == 0.0 && o2 == 0.0 && o3 == 0.0 && o4 == 0.0 {
        return collinear_line_intersection(a, b);
    }

    if !orientations_overlap(o1, o2) || !orientations_overlap(o3, o4) {
        return Intersection::None;
    }

    let Some((t, u)) = solve_line_parameters(p, p2, q, q2) else {
        return Intersection::None;
    };
    let t = clamp_unit(t);
    let u = clamp_unit(u);
    let point = p + (p2 - p) * t;

    finalize_points(vec![IntersectionPoint {
        point,
        a_t: t,
        b_t: u,
    }])
}

fn collinear_line_intersection(a: &PathPrimitive, b: &PathPrimitive) -> Intersection {
    let (a0, a1) = line_endpoints(a);
    let (b0, b1) = line_endpoints(b);
    let direction = a1 - a0;
    let length_squared = direction.norm_squared();
    if length_squared == 0.0 {
        return Intersection::None;
    }

    let b_t0 = (b0 - a0).dot(direction) / length_squared;
    let b_t1 = (b1 - a0).dot(direction) / length_squared;
    let overlap_start = 0.0_f64.max(b_t0.min(b_t1));
    let overlap_end = 1.0_f64.min(b_t0.max(b_t1));
    if overlap_end < overlap_start {
        return Intersection::None;
    }

    if overlap_end > overlap_start {
        return Intersection::Overlap;
    }

    let point = a.point_at(overlap_start);
    finalize_points(vec![IntersectionPoint {
        point,
        a_t: overlap_start,
        b_t: point_on_line_parameter(b, point),
    }])
}

fn line_arc_intersections(line: &PathPrimitive, arc: &PathPrimitive) -> Intersection {
    let (start, end) = line_endpoints(line);
    let direction = end - start;
    let (center, radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    let from_center = start - center;

    let quadratic_a = direction.dot(direction);
    let quadratic_b = 2.0 * from_center.dot(direction);
    let quadratic_c = from_center.dot(from_center) - radius_mm * radius_mm;
    let discriminant = quadratic_b * quadratic_b - 4.0 * quadratic_a * quadratic_c;
    let discriminant_tolerance =
        discriminant_roundoff_tolerance(quadratic_a, quadratic_b, quadratic_c);
    if discriminant < -discriminant_tolerance {
        return Intersection::None;
    }

    let mut points = Vec::new();
    if discriminant.abs() <= discriminant_tolerance {
        let t = clamp_unit(-quadratic_b / (2.0 * quadratic_a));
        push_line_arc_point(&mut points, line, arc, t);
    } else {
        let sqrt_discriminant = discriminant.max(0.0).sqrt();
        let t0 = clamp_unit((-quadratic_b - sqrt_discriminant) / (2.0 * quadratic_a));
        let t1 = clamp_unit((-quadratic_b + sqrt_discriminant) / (2.0 * quadratic_a));
        push_line_arc_point(&mut points, line, arc, t0);
        push_line_arc_point(&mut points, line, arc, t1);
    }

    finalize_points(points)
}

fn push_line_arc_point(
    points: &mut Vec<IntersectionPoint>,
    line: &PathPrimitive,
    arc: &PathPrimitive,
    line_t: f64,
) {
    if !(-f64::EPSILON..=1.0 + f64::EPSILON).contains(&line_t) {
        return;
    }

    let point = line.point_at(line_t);
    let Some(arc_t) = intersection_arc_parameter_for_point(arc, point) else {
        return;
    };

    insert_point(
        points,
        IntersectionPoint {
            point,
            a_t: line_t,
            b_t: arc_t,
        },
    );
}

fn arc_arc_intersections(a: &PathPrimitive, b: &PathPrimitive) -> Intersection {
    let (a_center, a_radius, a_start_angle, a_sweep) = arc_properties(a);
    let (b_center, b_radius, b_start_angle, b_sweep) = arc_properties(b);

    if a_center == b_center && a_radius == b_radius {
        let a_intervals = arc_set_intervals_strict(a_start_angle, a_sweep);
        let b_intervals = arc_set_intervals_strict(b_start_angle, b_sweep);
        for (a_start, a_end) in &a_intervals {
            for (b_start, b_end) in &b_intervals {
                if a_end.min(*b_end) > a_start.max(*b_start) {
                    return Intersection::Overlap;
                }
            }
        }

        let mut points = Vec::new();
        for &angle in &[
            a_start_angle,
            a_start_angle + a_sweep,
            b_start_angle,
            b_start_angle + b_sweep,
        ] {
            let point = Point::new(
                a_center.x + a_radius * angle.cos(),
                a_center.y + a_radius * angle.sin(),
            );
            let Some(a_t) = intersection_arc_parameter_for_point(a, point) else {
                continue;
            };
            let Some(b_t) = intersection_arc_parameter_for_point(b, point) else {
                continue;
            };
            insert_point(&mut points, IntersectionPoint { point, a_t, b_t });
        }

        return finalize_points(points);
    }

    let center_delta = b_center - a_center;
    let center_distance = center_delta.norm();
    if center_distance == 0.0 {
        return Intersection::None;
    }

    if center_distance > a_radius + b_radius + POSITION_TOLERANCE_MM
        || center_distance < (a_radius - b_radius).abs() - POSITION_TOLERANCE_MM
    {
        return Intersection::None;
    }

    let along = center_delta / center_distance;
    let midpoint_distance = (a_radius * a_radius - b_radius * b_radius
        + center_distance * center_distance)
        / (2.0 * center_distance);
    let height_squared = a_radius * a_radius - midpoint_distance * midpoint_distance;
    let height_tolerance = height_squared_roundoff_tolerance(a_radius, midpoint_distance);
    if height_squared < -height_tolerance {
        return Intersection::None;
    }

    let base = a_center + along * midpoint_distance;
    let offset = along.perp_ccw() * height_squared.max(0.0).sqrt();
    let candidates = if offset.norm() <= POSITION_TOLERANCE_MM {
        vec![base]
    } else {
        vec![base - offset, base + offset]
    };

    let mut points = Vec::new();
    for point in candidates {
        let Some(a_t) = intersection_arc_parameter_for_point(a, point) else {
            continue;
        };
        let Some(b_t) = intersection_arc_parameter_for_point(b, point) else {
            continue;
        };
        insert_point(&mut points, IntersectionPoint { point, a_t, b_t });
    }

    finalize_points(points)
}

fn swap_intersection(intersection: Intersection) -> Intersection {
    match intersection {
        Intersection::None => Intersection::None,
        Intersection::Overlap => Intersection::Overlap,
        Intersection::Points(points) => finalize_points(
            points
                .into_iter()
                .map(|point| IntersectionPoint {
                    point: point.point,
                    a_t: point.b_t,
                    b_t: point.a_t,
                })
                .collect(),
        ),
    }
}

fn finalize_points(mut points: Vec<IntersectionPoint>) -> Intersection {
    if points.is_empty() {
        return Intersection::None;
    }

    points.sort_by(compare_points);
    Intersection::Points(points)
}

fn insert_point(points: &mut Vec<IntersectionPoint>, candidate: IntersectionPoint) {
    if let Some(existing) = points
        .iter_mut()
        .find(|point| same_point(point.point, candidate.point))
    {
        if compare_points(&candidate, existing) == Ordering::Less {
            *existing = candidate;
        }
        return;
    }

    points.push(candidate);
}

fn compare_points(left: &IntersectionPoint, right: &IntersectionPoint) -> Ordering {
    left.point
        .x
        .total_cmp(&right.point.x)
        .then_with(|| left.point.y.total_cmp(&right.point.y))
        .then_with(|| left.a_t.total_cmp(&right.a_t))
        .then_with(|| left.b_t.total_cmp(&right.b_t))
}

fn orientations_overlap(a: f64, b: f64) -> bool {
    a == 0.0 || b == 0.0 || a.signum() != b.signum()
}

fn orient(a: Point, b: Point, c: Point) -> f64 {
    robust::orient2d(coord(a), coord(b), coord(c))
}

fn coord(point: Point) -> Coord<f64> {
    Coord {
        x: point.x,
        y: point.y,
    }
}

fn discriminant_roundoff_tolerance(quadratic_a: f64, quadratic_b: f64, quadratic_c: f64) -> f64 {
    let scale = quadratic_b * quadratic_b + (4.0 * quadratic_a * quadratic_c).abs();
    32.0 * f64::EPSILON * scale.max(1.0)
}

fn height_squared_roundoff_tolerance(radius_mm: f64, midpoint_distance: f64) -> f64 {
    let scale = radius_mm * radius_mm + midpoint_distance * midpoint_distance;
    32.0 * f64::EPSILON * scale.max(1.0)
}

fn intersection_arc_parameter_for_point(arc: &PathPrimitive, point: Point) -> Option<f64> {
    let (center, radius_mm, _start_angle, _sweep_rad) = arc_properties(arc);
    let radial_scale = radius_mm.max(point.distance_to(center)).max(1.0);
    let radial_tolerance_mm = 32.0 * f64::EPSILON * radial_scale;
    arc_parameter_for_point_with_radial_tolerance_strict(arc, point, radial_tolerance_mm)
}

fn clamp_unit(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}
