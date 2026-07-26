use crate::constants::MIN_RADIUS_MM;
use crate::geometry::{
    ClosestPair, Intersection, ParameterRange, PointClassification, Vec2, primitive_distance,
    primitive_distance_candidates, primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use crate::validation::{
    CandidatePath, ValidationContext, ValidationFailure, ValidationFailureCode,
};

const NONLOCAL_BOUNDARY_CERTIFICATION_MM: f64 = 1e-10;
const CONSERVATIVE_DISTANCE_ERROR_MM: f64 = 2.0 * crate::geometry::POSITION_TOLERANCE_MM;
const ARCLENGTH_TOLERANCE_MM: f64 = 1e-12;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MinBendRadius {
    pub lower_bound_mm: f64,
    pub primitive_index: usize,
    pub point: Point,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MinWallClearance {
    pub lower_bound_mm: f64,
    pub point_on_pipe: Point,
    pub point_on_wall: Point,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MinNonlocalSpacing {
    pub lower_bound_mm: f64,
    pub first_point: Point,
    pub second_point: Point,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HardValidationReport {
    pub min_bend_radius: MinBendRadius,
    pub min_wall_clearance: MinWallClearance,
    pub min_nonlocal_spacing: MinNonlocalSpacing,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NonlocalDistance {
    pub distance_mm: f64,
    pub first_point: Point,
    pub second_point: Point,
    pub first_path_offset_mm: f64,
    pub second_path_offset_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ZonePhase {
    NearWall,
    Inside,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ClassifiedInterval {
    primitive_index: usize,
    range: ParameterRange,
    phase: ZonePhase,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct DomainPoint {
    a_t: f64,
    b_t: f64,
}

#[derive(Clone, Debug)]
struct FeasibleDomain {
    vertices: Vec<DomainPoint>,
    a_length_mm: f64,
    b_length_mm: f64,
    required_offset_mm: f64,
}

#[derive(Clone, Copy, Debug)]
struct BoundaryInterval {
    start: f64,
    end: f64,
}

pub(crate) fn minimum_bend_radius(
    candidate: &CandidatePath,
) -> Result<MinBendRadius, ValidationFailure> {
    let mut best = MinBendRadius {
        lower_bound_mm: f64::INFINITY,
        primitive_index: 0,
        point: candidate.path.primitives()[0].start(),
    };

    for (primitive_index, primitive) in candidate.path.primitives().iter().enumerate() {
        if let PathPrimitive::Arc { radius_mm, .. } = primitive {
            let point = primitive.point_at(0.5);
            if *radius_mm < MIN_RADIUS_MM {
                return Err(
                    ValidationFailure::new(ValidationFailureCode::BendRadiusTooSmall)
                        .with_point(point)
                        .with_primitive(primitive_index),
                );
            }
            if *radius_mm < best.lower_bound_mm {
                best = MinBendRadius {
                    lower_bound_mm: *radius_mm,
                    primitive_index,
                    point,
                };
            }
        }
    }

    Ok(best)
}

pub(crate) fn minimum_wall_clearance(
    candidate: &CandidatePath,
    context: &ValidationContext,
) -> Result<MinWallClearance, ValidationFailure> {
    let intervals = classify_allowed_intervals(candidate, context);
    let (start_exceptions, end_exceptions) = zone_exceptions(candidate, &intervals)?;

    let boundary = polygon_edges(&context.polygon);
    let mut best: Option<(f64, MinWallClearance)> = None;

    for interval in &intervals {
        if interval.phase == ZonePhase::NearWall
            && (start_exceptions.contains(interval) || end_exceptions.contains(interval))
        {
            continue;
        }
        if interval.phase == ZonePhase::NearWall {
            return Err(
                ValidationFailure::new(ValidationFailureCode::ConnectionZoneReentry)
                    .with_primitive(interval.primitive_index),
            );
        }

        let primitive = &candidate.path.primitives()[interval.primitive_index];
        for edge in &boundary {
            let pair = primitive_distance(primitive, interval.range, edge, ParameterRange::FULL);
            let lower_bound_mm = (pair.distance_mm - CONSERVATIVE_DISTANCE_ERROR_MM).max(0.0);
            let witness = MinWallClearance {
                lower_bound_mm,
                point_on_pipe: pair.point_on_a,
                point_on_wall: pair.point_on_b,
            };
            if best
                .as_ref()
                .map(|(_, current)| compare_wall_clearance(&witness, current).is_lt())
                .unwrap_or(true)
            {
                best = Some((pair.distance_mm, witness));
            }
        }
    }

    let Some((best_raw_distance_mm, best)) = best else {
        return Err(ValidationFailure::new(
            ValidationFailureCode::WallClearanceTooSmall,
        ));
    };

    if best_raw_distance_mm + crate::geometry::POSITION_TOLERANCE_MM
        < context.allowed_region.wall_clearance_mm
    {
        return Err(
            ValidationFailure::new(ValidationFailureCode::WallClearanceTooSmall)
                .with_points(best.point_on_pipe, best.point_on_wall),
        );
    }

    Ok(best)
}

pub(crate) fn minimum_nonlocal_spacing_report(
    candidate: &CandidatePath,
    local_arc_length_mm: f64,
) -> Result<MinNonlocalSpacing, ValidationFailure> {
    let raw = minimum_nonlocal_distance(candidate, local_arc_length_mm)?;
    let lower_bound_mm = if is_exact_port_identity(candidate, local_arc_length_mm, &raw) {
        50.0
    } else {
        (raw.distance_mm - CONSERVATIVE_DISTANCE_ERROR_MM).max(0.0)
    };

    if lower_bound_mm < 50.0 {
        return Err(
            ValidationFailure::new(ValidationFailureCode::NonlocalSpacingTooSmall)
                .with_points(raw.first_point, raw.second_point),
        );
    }

    Ok(MinNonlocalSpacing {
        lower_bound_mm,
        first_point: raw.first_point,
        second_point: raw.second_point,
    })
}

pub fn minimum_nonlocal_distance(
    candidate: &CandidatePath,
    local_arc_length_mm: f64,
) -> Result<NonlocalDistance, ValidationFailure> {
    let primitives = candidate.path.primitives();
    let prefix = candidate.path.prefix_lengths();
    let mut best = exact_port_distance(candidate, local_arc_length_mm);

    for a_index in 0..primitives.len() {
        for b_index in a_index..primitives.len() {
            minimize_primitive_pair(
                a_index,
                b_index,
                prefix,
                &primitives[a_index],
                &primitives[b_index],
                local_arc_length_mm,
                &mut best,
            );
        }
    }

    best.ok_or_else(|| ValidationFailure::new(ValidationFailureCode::NonlocalSpacingTooSmall))
}

fn minimize_primitive_pair(
    a_index: usize,
    b_index: usize,
    prefix: &[f64],
    a: &PathPrimitive,
    b: &PathPrimitive,
    local_arc_length_mm: f64,
    best: &mut Option<NonlocalDistance>,
) {
    let Some(domain) = feasible_domain(
        prefix[a_index],
        a.length(),
        prefix[b_index],
        b.length(),
        local_arc_length_mm,
    ) else {
        return;
    };

    for pair in primitive_distance_candidates(a, ParameterRange::FULL, b, ParameterRange::FULL) {
        if domain.contains(pair.a_t, pair.b_t) {
            consider_closest_pair(a_index, b_index, prefix, a, b, pair, best);
        }
    }

    for vertex in &domain.vertices {
        consider_closest_pair(
            a_index,
            b_index,
            prefix,
            a,
            b,
            pair_at_domain_point(a, b, *vertex),
            best,
        );
    }

    for edge_index in 0..domain.vertices.len() {
        let start = domain.vertices[edge_index];
        let end = domain.vertices[(edge_index + 1) % domain.vertices.len()];
        if start.a_t == end.a_t {
            let a_t = ((start.a_t + end.a_t) * 0.5).clamp(0.0, 1.0);
            let b_range = ParameterRange::new(start.b_t.min(end.b_t), start.b_t.max(end.b_t));
            consider_closest_pair(
                a_index,
                b_index,
                prefix,
                a,
                b,
                primitive_distance(a, ParameterRange::new(a_t, a_t), b, b_range),
                best,
            );
        } else if start.b_t == end.b_t {
            let b_t = ((start.b_t + end.b_t) * 0.5).clamp(0.0, 1.0);
            let a_range = ParameterRange::new(start.a_t.min(end.a_t), start.a_t.max(end.a_t));
            consider_closest_pair(
                a_index,
                b_index,
                prefix,
                a,
                b,
                primitive_distance(a, a_range, b, ParameterRange::new(b_t, b_t)),
                best,
            );
        } else {
            consider_closest_pair(
                a_index,
                b_index,
                prefix,
                a,
                b,
                fixed_lag_boundary_minimum(a, b, start, end),
                best,
            );
        }
    }
}

impl FeasibleDomain {
    fn contains(&self, a_t: f64, b_t: f64) -> bool {
        self.b_length_mm * b_t - self.a_length_mm * a_t >= self.required_offset_mm
    }
}

fn feasible_domain(
    a_prefix_mm: f64,
    a_length_mm: f64,
    b_prefix_mm: f64,
    b_length_mm: f64,
    local_arc_length_mm: f64,
) -> Option<FeasibleDomain> {
    let required_offset_mm = local_arc_length_mm - (b_prefix_mm - a_prefix_mm);
    let rectangle = [
        DomainPoint { a_t: 0.0, b_t: 0.0 },
        DomainPoint { a_t: 1.0, b_t: 0.0 },
        DomainPoint { a_t: 1.0, b_t: 1.0 },
        DomainPoint { a_t: 0.0, b_t: 1.0 },
    ];
    let mut vertices = Vec::new();

    for index in 0..rectangle.len() {
        let previous = rectangle[(index + rectangle.len() - 1) % rectangle.len()];
        let current = rectangle[index];
        let previous_value = domain_value(previous, a_length_mm, b_length_mm, required_offset_mm);
        let current_value = domain_value(current, a_length_mm, b_length_mm, required_offset_mm);
        let previous_inside = previous_value >= 0.0;
        let current_inside = current_value >= 0.0;

        if previous_inside != current_inside {
            let fraction = previous_value / (previous_value - current_value);
            push_domain_vertex(
                &mut vertices,
                DomainPoint {
                    a_t: (previous.a_t + (current.a_t - previous.a_t) * fraction).clamp(0.0, 1.0),
                    b_t: (previous.b_t + (current.b_t - previous.b_t) * fraction).clamp(0.0, 1.0),
                },
            );
        }
        if current_inside {
            push_domain_vertex(&mut vertices, current);
        }
    }

    if vertices.len() > 1
        && same_parameter(vertices[0].a_t, vertices.last().unwrap().a_t)
        && same_parameter(vertices[0].b_t, vertices.last().unwrap().b_t)
    {
        vertices.pop();
    }

    (!vertices.is_empty()).then_some(FeasibleDomain {
        vertices,
        a_length_mm,
        b_length_mm,
        required_offset_mm,
    })
}

fn domain_value(
    point: DomainPoint,
    a_length_mm: f64,
    b_length_mm: f64,
    required_offset_mm: f64,
) -> f64 {
    b_length_mm * point.b_t - a_length_mm * point.a_t - required_offset_mm
}

fn push_domain_vertex(vertices: &mut Vec<DomainPoint>, point: DomainPoint) {
    if vertices.last().is_some_and(|last| {
        same_parameter(last.a_t, point.a_t) && same_parameter(last.b_t, point.b_t)
    }) {
        return;
    }
    vertices.push(point);
}

fn same_parameter(left: f64, right: f64) -> bool {
    (left - right).abs() <= 64.0 * f64::EPSILON
}

fn pair_at_domain_point(a: &PathPrimitive, b: &PathPrimitive, point: DomainPoint) -> ClosestPair {
    let point_on_a = a.point_at(point.a_t);
    let point_on_b = b.point_at(point.b_t);
    ClosestPair {
        point_on_a,
        point_on_b,
        a_t: point.a_t,
        b_t: point.b_t,
        distance_mm: point_on_a.distance_to(point_on_b),
    }
}

fn fixed_lag_boundary_minimum(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
) -> ClosestPair {
    if matches!(a, PathPrimitive::Line { .. }) && matches!(b, PathPrimitive::Line { .. }) {
        return line_line_boundary_minimum(a, b, start, end);
    }
    if let Some(pair) = equal_curvature_arc_boundary_minimum(a, b, start, end) {
        return pair;
    }
    certified_boundary_minimum(a, b, start, end)
}

fn line_line_boundary_minimum(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
) -> ClosestPair {
    let at_start = pair_at_boundary_parameter(a, b, start, end, 0.0);
    let at_end = pair_at_boundary_parameter(a, b, start, end, 1.0);
    let relative_start = at_start.point_on_a - at_start.point_on_b;
    let relative_delta = (at_end.point_on_a - at_end.point_on_b) - relative_start;
    let denominator = relative_delta.norm_squared();
    let q = if denominator == 0.0 {
        0.0
    } else {
        (-relative_start.dot(relative_delta) / denominator).clamp(0.0, 1.0)
    };
    pair_at_boundary_parameter(a, b, start, end, q)
}

fn equal_curvature_arc_boundary_minimum(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
) -> Option<ClosestPair> {
    let (
        PathPrimitive::Arc {
            center: a_center,
            radius_mm: a_radius,
            sweep_rad: a_sweep,
            ..
        },
        PathPrimitive::Arc {
            center: b_center,
            radius_mm: b_radius,
            sweep_rad: b_sweep,
            ..
        },
    ) = (a, b)
    else {
        return None;
    };
    if a_radius != b_radius || a_sweep.signum() != b_sweep.signum() {
        return None;
    }

    let a_angle_span = a_sweep * (end.a_t - start.a_t);
    let b_angle_span = b_sweep * (end.b_t - start.b_t);
    let angle_scale = a_angle_span.abs().max(b_angle_span.abs()).max(1.0);
    if (a_angle_span - b_angle_span).abs() > 64.0 * f64::EPSILON * angle_scale {
        return None;
    }

    let at_start = pair_at_boundary_parameter(a, b, start, end, 0.0);
    let mut best = at_start;
    consider_closest_candidate(pair_at_boundary_parameter(a, b, start, end, 1.0), &mut best);

    let center_delta = *a_center - *b_center;
    let radial_delta = (at_start.point_on_a - *a_center) - (at_start.point_on_b - *b_center);
    if center_delta.norm_squared() == 0.0
        || radial_delta.norm_squared() == 0.0
        || a_angle_span.abs() <= f64::EPSILON
    {
        return Some(best);
    }

    let target_angle = (-center_delta.y).atan2(-center_delta.x);
    let radial_angle = radial_delta.y.atan2(radial_delta.x);
    for turns in -2..=2 {
        let q =
            (target_angle + f64::from(turns) * std::f64::consts::TAU - radial_angle) / a_angle_span;
        if (0.0..=1.0).contains(&q) {
            consider_closest_candidate(pair_at_boundary_parameter(a, b, start, end, q), &mut best);
        }
    }

    Some(best)
}

fn certified_boundary_minimum(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
) -> ClosestPair {
    let mut best = pair_at_boundary_parameter(a, b, start, end, 0.0);
    for q in [0.5, 1.0] {
        consider_closest_candidate(pair_at_boundary_parameter(a, b, start, end, q), &mut best);
    }

    let mut pending = vec![BoundaryInterval {
        start: 0.0,
        end: 1.0,
    }];
    while let Some(interval) = pending.pop() {
        let (lower_bound_mm, q_candidate) =
            boundary_interval_lower_bound(a, b, start, end, interval);
        consider_closest_candidate(
            pair_at_boundary_parameter(a, b, start, end, q_candidate),
            &mut best,
        );
        if lower_bound_mm + NONLOCAL_BOUNDARY_CERTIFICATION_MM >= best.distance_mm {
            continue;
        }

        let midpoint = (interval.start + interval.end) * 0.5;
        if midpoint == interval.start || midpoint == interval.end {
            continue;
        }
        pending.push(BoundaryInterval {
            start: midpoint,
            end: interval.end,
        });
        pending.push(BoundaryInterval {
            start: interval.start,
            end: midpoint,
        });
    }

    best
}

fn boundary_interval_lower_bound(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
    interval: BoundaryInterval,
) -> (f64, f64) {
    let midpoint = (interval.start + interval.end) * 0.5;
    let half_span = (interval.end - interval.start) * 0.5;
    let a_t = interpolate(start.a_t, end.a_t, midpoint);
    let b_t = interpolate(start.b_t, end.b_t, midpoint);
    let (a_point, a_derivative, a_second_bound) = boundary_derivatives(a, a_t, end.a_t - start.a_t);
    let (b_point, b_derivative, b_second_bound) = boundary_derivatives(b, b_t, end.b_t - start.b_t);
    let relative = a_point - b_point;
    let derivative = a_derivative - b_derivative;
    let derivative_norm_squared = derivative.norm_squared();
    let offset = if derivative_norm_squared == 0.0 {
        0.0
    } else {
        (-relative.dot(derivative) / derivative_norm_squared).clamp(-half_span, half_span)
    };
    let linear_minimum = (relative + derivative * offset).norm();
    let taylor_error = 0.5 * (a_second_bound + b_second_bound) * half_span * half_span;
    let roundoff = 64.0
        * f64::EPSILON
        * (linear_minimum + derivative.norm() * half_span + taylor_error).max(1.0);
    (
        (linear_minimum - taylor_error - roundoff).max(0.0),
        midpoint + offset,
    )
}

fn boundary_derivatives(
    primitive: &PathPrimitive,
    t: f64,
    parameter_span: f64,
) -> (Point, Vec2, f64) {
    let point = primitive.point_at(t);
    match primitive {
        PathPrimitive::Line { start, end } => (point, (*end - *start) * parameter_span, 0.0),
        PathPrimitive::Arc {
            center,
            radius_mm,
            sweep_rad,
            ..
        } => {
            let radial = (point - *center) / *radius_mm;
            let tangent = if *sweep_rad > 0.0 {
                radial.perp_ccw()
            } else {
                -radial.perp_ccw()
            };
            let derivative = tangent * primitive.length() * parameter_span;
            let second_bound = radius_mm * (sweep_rad * parameter_span).powi(2);
            (point, derivative, second_bound)
        }
    }
}

fn pair_at_boundary_parameter(
    a: &PathPrimitive,
    b: &PathPrimitive,
    start: DomainPoint,
    end: DomainPoint,
    q: f64,
) -> ClosestPair {
    pair_at_domain_point(
        a,
        b,
        DomainPoint {
            a_t: interpolate(start.a_t, end.a_t, q),
            b_t: interpolate(start.b_t, end.b_t, q),
        },
    )
}

fn interpolate(start: f64, end: f64, t: f64) -> f64 {
    start + (end - start) * t
}

fn consider_closest_candidate(candidate: ClosestPair, best: &mut ClosestPair) {
    let replace = candidate
        .distance_mm
        .total_cmp(&best.distance_mm)
        .then_with(|| candidate.point_on_a.x.total_cmp(&best.point_on_a.x))
        .then_with(|| candidate.point_on_a.y.total_cmp(&best.point_on_a.y))
        .then_with(|| candidate.point_on_b.x.total_cmp(&best.point_on_b.x))
        .then_with(|| candidate.point_on_b.y.total_cmp(&best.point_on_b.y))
        .then_with(|| candidate.a_t.total_cmp(&best.a_t))
        .then_with(|| candidate.b_t.total_cmp(&best.b_t))
        .is_lt();
    if replace {
        *best = candidate;
    }
}

fn consider_closest_pair(
    a_index: usize,
    b_index: usize,
    prefix: &[f64],
    a: &PathPrimitive,
    b: &PathPrimitive,
    pair: ClosestPair,
    best: &mut Option<NonlocalDistance>,
) {
    consider_distance(
        NonlocalDistance {
            distance_mm: pair.distance_mm,
            first_point: pair.point_on_a,
            second_point: pair.point_on_b,
            first_path_offset_mm: prefix[a_index] + a.length() * pair.a_t,
            second_path_offset_mm: prefix[b_index] + b.length() * pair.b_t,
        },
        best,
    );
}

fn consider_distance(candidate: NonlocalDistance, best: &mut Option<NonlocalDistance>) {
    let replace = match best {
        None => true,
        Some(current) => compare_nonlocal_distance(&candidate, current).is_lt(),
    };
    if replace {
        *best = Some(candidate);
    }
}

fn compare_nonlocal_distance(
    left: &NonlocalDistance,
    right: &NonlocalDistance,
) -> core::cmp::Ordering {
    left.distance_mm
        .total_cmp(&right.distance_mm)
        .then_with(|| {
            left.first_path_offset_mm
                .total_cmp(&right.first_path_offset_mm)
        })
        .then_with(|| {
            left.second_path_offset_mm
                .total_cmp(&right.second_path_offset_mm)
        })
        .then_with(|| left.first_point.x.total_cmp(&right.first_point.x))
        .then_with(|| left.first_point.y.total_cmp(&right.first_point.y))
        .then_with(|| left.second_point.x.total_cmp(&right.second_point.x))
        .then_with(|| left.second_point.y.total_cmp(&right.second_point.y))
}

fn exact_port_distance(
    candidate: &CandidatePath,
    local_arc_length_mm: f64,
) -> Option<NonlocalDistance> {
    if !has_exact_port_identity(candidate, local_arc_length_mm) {
        return None;
    }

    Some(NonlocalDistance {
        distance_mm: candidate
            .connection
            .start_port
            .distance_to(candidate.connection.end_port),
        first_point: candidate.connection.start_port,
        second_point: candidate.connection.end_port,
        first_path_offset_mm: 0.0,
        second_path_offset_mm: candidate.path.total_length(),
    })
}

fn classify_allowed_intervals(
    candidate: &CandidatePath,
    context: &ValidationContext,
) -> Vec<ClassifiedInterval> {
    let mut intervals = Vec::new();
    for (primitive_index, primitive) in candidate.path.primitives().iter().enumerate() {
        let mut parameters = vec![0.0, 1.0];
        for boundary_primitive in &context.allowed_region.boundary {
            if let Intersection::Points(points) =
                primitive_intersections(primitive, boundary_primitive)
            {
                for point in points {
                    parameters.push(point.a_t);
                }
            }
        }
        parameters.sort_by(|left, right| left.total_cmp(right));
        parameters.dedup_by(|left, right| (*left - *right).abs() <= 1e-12);

        for pair in parameters.windows(2) {
            if pair[1] - pair[0] <= 1e-12 {
                continue;
            }
            let range = ParameterRange::new(pair[0], pair[1]);
            let midpoint = primitive.point_at((pair[0] + pair[1]) * 0.5);
            let phase = match context.allowed_region.classify_point(midpoint) {
                PointClassification::Outside => ZonePhase::NearWall,
                PointClassification::Boundary | PointClassification::Inside => ZonePhase::Inside,
            };
            intervals.push(ClassifiedInterval {
                primitive_index,
                range,
                phase,
            });
        }
    }
    intervals
}

fn zone_exceptions(
    candidate: &CandidatePath,
    intervals: &[ClassifiedInterval],
) -> Result<(Vec<ClassifiedInterval>, Vec<ClassifiedInterval>), ValidationFailure> {
    let mut start = Vec::new();
    let mut start_inside = false;
    for interval in intervals {
        if !matches!(
            candidate.provenance.roles.get(interval.primitive_index),
            Some(crate::validation::PrimitiveRole::StartLead)
        ) {
            break;
        }
        match interval.phase {
            ZonePhase::NearWall if !start_inside => start.push(*interval),
            ZonePhase::NearWall => {
                return Err(
                    ValidationFailure::new(ValidationFailureCode::ConnectionZoneReentry)
                        .with_primitive(interval.primitive_index),
                );
            }
            ZonePhase::Inside => start_inside = true,
        }
    }

    let mut end = Vec::new();
    let mut end_inside = false;
    for interval in intervals.iter().rev() {
        if !matches!(
            candidate.provenance.roles.get(interval.primitive_index),
            Some(crate::validation::PrimitiveRole::EndLead)
        ) {
            break;
        }
        match interval.phase {
            ZonePhase::NearWall if !end_inside => end.push(*interval),
            ZonePhase::NearWall => {
                return Err(
                    ValidationFailure::new(ValidationFailureCode::ConnectionZoneReentry)
                        .with_primitive(interval.primitive_index),
                );
            }
            ZonePhase::Inside => end_inside = true,
        }
    }
    end.reverse();

    for interval in intervals {
        if interval.phase == ZonePhase::NearWall
            && !start.contains(interval)
            && !end.contains(interval)
        {
            return Err(
                ValidationFailure::new(ValidationFailureCode::ConnectionZoneReentry)
                    .with_primitive(interval.primitive_index),
            );
        }
    }

    Ok((start, end))
}

fn polygon_edges(polygon: &crate::geometry::Polygon) -> Vec<PathPrimitive> {
    (0..polygon.original_edge_count())
        .map(|index| {
            let (start, end) = polygon.original_edge(index);
            PathPrimitive::Line { start, end }
        })
        .collect()
}

fn compare_wall_clearance(
    left: &MinWallClearance,
    right: &MinWallClearance,
) -> core::cmp::Ordering {
    left.lower_bound_mm
        .total_cmp(&right.lower_bound_mm)
        .then_with(|| left.point_on_pipe.x.total_cmp(&right.point_on_pipe.x))
        .then_with(|| left.point_on_pipe.y.total_cmp(&right.point_on_pipe.y))
        .then_with(|| left.point_on_wall.x.total_cmp(&right.point_on_wall.x))
        .then_with(|| left.point_on_wall.y.total_cmp(&right.point_on_wall.y))
}

fn is_exact_port_identity(
    candidate: &CandidatePath,
    local_arc_length_mm: f64,
    distance: &NonlocalDistance,
) -> bool {
    has_exact_port_identity(candidate, local_arc_length_mm)
        && distance
            .first_point
            .distance_to(candidate.connection.start_port)
            <= crate::geometry::POSITION_TOLERANCE_MM
        && distance
            .second_point
            .distance_to(candidate.connection.end_port)
            <= crate::geometry::POSITION_TOLERANCE_MM
}

fn has_exact_port_identity(candidate: &CandidatePath, local_arc_length_mm: f64) -> bool {
    if candidate.path.total_length() + ARCLENGTH_TOLERANCE_MM < local_arc_length_mm {
        return false;
    }
    let edge_delta = (candidate.provenance.end_port_edge_offset_mm
        - candidate.provenance.start_port_edge_offset_mm)
        .abs();
    if edge_delta != 50.0 {
        return false;
    }

    let start = candidate
        .path
        .primitives()
        .first()
        .map(|primitive| primitive.start());
    let end = candidate
        .path
        .primitives()
        .last()
        .map(|primitive| primitive.end());
    start.is_some_and(|point| {
        point.distance_to(candidate.connection.start_port) <= crate::geometry::POSITION_TOLERANCE_MM
    }) && end.is_some_and(|point| {
        point.distance_to(candidate.connection.end_port) <= crate::geometry::POSITION_TOLERANCE_MM
    })
}
