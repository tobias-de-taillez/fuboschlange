use crate::constants::MIN_RADIUS_MM;
use crate::geometry::{
    ClosestPair, Intersection, ParameterRange, PointClassification, primitive_distance,
    primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use crate::validation::{
    CandidatePath, ValidationContext, ValidationFailure, ValidationFailureCode,
};

const NONLOCAL_CELL_TOLERANCE_MM: f64 = 1e-6;
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DomainStatus {
    Outside,
    Mixed,
    Inside,
}

#[derive(Clone, Copy, Debug)]
struct ParameterCell {
    a_range: ParameterRange,
    b_range: ParameterRange,
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
    let (start_exceptions, end_exceptions) = zone_exceptions(&intervals)?;

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
    let full_cell = ParameterCell {
        a_range: ParameterRange::FULL,
        b_range: ParameterRange::FULL,
    };
    let mut best = exact_port_distance(candidate, local_arc_length_mm);

    for i in 0..primitives.len() {
        for j in i..primitives.len() {
            seed_pair(
                i,
                j,
                prefix,
                &primitives[i],
                &primitives[j],
                &full_cell,
                local_arc_length_mm,
                &mut best,
            );
        }
    }

    for i in 0..primitives.len() {
        for j in (i + 1)..primitives.len() {
            search_pair(candidate, i, j, local_arc_length_mm, prefix, &mut best);
        }
    }

    for (index, primitive) in primitives.iter().enumerate() {
        if let Some(current_best) = best {
            if let Some(lower_bound) =
                same_primitive_nonlocal_lower_bound(primitive, local_arc_length_mm)
            {
                if lower_bound >= current_best.distance_mm {
                    continue;
                }
            }
        }
        search_pair(
            candidate,
            index,
            index,
            local_arc_length_mm,
            prefix,
            &mut best,
        );
    }

    best.ok_or_else(|| ValidationFailure::new(ValidationFailureCode::NonlocalSpacingTooSmall))
}

fn seed_pair(
    a_index: usize,
    b_index: usize,
    prefix: &[f64],
    a: &PathPrimitive,
    b: &PathPrimitive,
    cell: &ParameterCell,
    local_arc_length_mm: f64,
    best: &mut Option<NonlocalDistance>,
) {
    match ordered_domain_status(
        prefix[a_index],
        a.length(),
        prefix[b_index],
        b.length(),
        cell,
        local_arc_length_mm,
    ) {
        DomainStatus::Outside => {}
        DomainStatus::Inside => {
            consider_closest_pair(
                a_index,
                b_index,
                prefix,
                a,
                b,
                primitive_distance(a, cell.a_range, b, cell.b_range),
                best,
            );
        }
        DomainStatus::Mixed => {
            if let Some(sample) =
                best_valid_sample(a_index, b_index, prefix, a, b, cell, local_arc_length_mm)
            {
                consider_distance(sample, best);
            }
        }
    }
}

fn search_pair(
    candidate: &CandidatePath,
    a_index: usize,
    b_index: usize,
    local_arc_length_mm: f64,
    prefix: &[f64],
    best: &mut Option<NonlocalDistance>,
) {
    recurse_pair(
        candidate,
        a_index,
        b_index,
        local_arc_length_mm,
        prefix,
        &ParameterCell {
            a_range: ParameterRange::FULL,
            b_range: ParameterRange::FULL,
        },
        best,
    );
}

fn recurse_pair(
    candidate: &CandidatePath,
    a_index: usize,
    b_index: usize,
    local_arc_length_mm: f64,
    prefix: &[f64],
    cell: &ParameterCell,
    best: &mut Option<NonlocalDistance>,
) {
    let primitives = candidate.path.primitives();
    let a = &primitives[a_index];
    let b = &primitives[b_index];
    let a_length = a.length();
    let b_length = b.length();

    match ordered_domain_status(
        prefix[a_index],
        a_length,
        prefix[b_index],
        b_length,
        cell,
        local_arc_length_mm,
    ) {
        DomainStatus::Outside => return,
        DomainStatus::Inside => {
            consider_closest_pair(
                a_index,
                b_index,
                prefix,
                a,
                b,
                primitive_distance(a, cell.a_range, b, cell.b_range),
                best,
            );
            return;
        }
        DomainStatus::Mixed => {}
    }

    if let Some(sample) =
        best_valid_sample(a_index, b_index, prefix, a, b, cell, local_arc_length_mm)
    {
        consider_distance(sample, best);
    }

    let span_mm = a_length * (cell.a_range.end - cell.a_range.start)
        + b_length * (cell.b_range.end - cell.b_range.start);
    if span_mm <= NONLOCAL_CELL_TOLERANCE_MM {
        return;
    }

    let lower = primitive_distance(a, cell.a_range, b, cell.b_range);
    if let Some(current) = best {
        if lower.distance_mm > current.distance_mm {
            return;
        }
    }

    let a_span = a_length * (cell.a_range.end - cell.a_range.start);
    let b_span = b_length * (cell.b_range.end - cell.b_range.start);
    if a_span >= b_span {
        let midpoint = (cell.a_range.start + cell.a_range.end) * 0.5;
        recurse_pair(
            candidate,
            a_index,
            b_index,
            local_arc_length_mm,
            prefix,
            &ParameterCell {
                a_range: ParameterRange::new(cell.a_range.start, midpoint),
                b_range: cell.b_range,
            },
            best,
        );
        recurse_pair(
            candidate,
            a_index,
            b_index,
            local_arc_length_mm,
            prefix,
            &ParameterCell {
                a_range: ParameterRange::new(midpoint, cell.a_range.end),
                b_range: cell.b_range,
            },
            best,
        );
    } else {
        let midpoint = (cell.b_range.start + cell.b_range.end) * 0.5;
        recurse_pair(
            candidate,
            a_index,
            b_index,
            local_arc_length_mm,
            prefix,
            &ParameterCell {
                a_range: cell.a_range,
                b_range: ParameterRange::new(cell.b_range.start, midpoint),
            },
            best,
        );
        recurse_pair(
            candidate,
            a_index,
            b_index,
            local_arc_length_mm,
            prefix,
            &ParameterCell {
                a_range: cell.a_range,
                b_range: ParameterRange::new(midpoint, cell.b_range.end),
            },
            best,
        );
    }
}

fn ordered_domain_status(
    a_prefix: f64,
    a_length: f64,
    b_prefix: f64,
    b_length: f64,
    cell: &ParameterCell,
    local_arc_length_mm: f64,
) -> DomainStatus {
    let min_gap =
        (b_prefix + b_length * cell.b_range.start) - (a_prefix + a_length * cell.a_range.end);
    let max_gap =
        (b_prefix + b_length * cell.b_range.end) - (a_prefix + a_length * cell.a_range.start);

    if max_gap < local_arc_length_mm - ARCLENGTH_TOLERANCE_MM {
        DomainStatus::Outside
    } else if min_gap >= local_arc_length_mm - ARCLENGTH_TOLERANCE_MM {
        DomainStatus::Inside
    } else {
        DomainStatus::Mixed
    }
}

fn best_valid_sample(
    a_index: usize,
    b_index: usize,
    prefix: &[f64],
    a: &PathPrimitive,
    b: &PathPrimitive,
    cell: &ParameterCell,
    local_arc_length_mm: f64,
) -> Option<NonlocalDistance> {
    let mut best = None;
    let mut samples = vec![
        (cell.a_range.start, cell.b_range.start),
        (cell.a_range.start, cell.b_range.end),
        (cell.a_range.end, cell.b_range.start),
        (cell.a_range.end, cell.b_range.end),
        (
            (cell.a_range.start + cell.a_range.end) * 0.5,
            (cell.b_range.start + cell.b_range.end) * 0.5,
        ),
    ];
    samples.sort_by(|left, right| {
        left.0
            .total_cmp(&right.0)
            .then_with(|| left.1.total_cmp(&right.1))
    });
    samples.dedup_by(|left, right| {
        (left.0 - right.0).abs() <= 1e-12 && (left.1 - right.1).abs() <= 1e-12
    });

    for (a_t, b_t) in samples {
        let first_path_offset_mm = prefix[a_index] + a.length() * a_t;
        let second_path_offset_mm = prefix[b_index] + b.length() * b_t;
        if second_path_offset_mm - first_path_offset_mm
            < local_arc_length_mm - ARCLENGTH_TOLERANCE_MM
        {
            continue;
        }
        consider_distance(
            NonlocalDistance {
                distance_mm: a.point_at(a_t).distance_to(b.point_at(b_t)),
                first_point: a.point_at(a_t),
                second_point: b.point_at(b_t),
                first_path_offset_mm,
                second_path_offset_mm,
            },
            &mut best,
        );
    }

    best
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

fn same_primitive_nonlocal_lower_bound(
    primitive: &PathPrimitive,
    local_arc_length_mm: f64,
) -> Option<f64> {
    if primitive.length() + ARCLENGTH_TOLERANCE_MM < local_arc_length_mm {
        return None;
    }

    match primitive {
        PathPrimitive::Line { .. } => Some(local_arc_length_mm),
        PathPrimitive::Arc { radius_mm, .. } => {
            let angle = local_arc_length_mm / *radius_mm;
            Some(2.0 * *radius_mm * (angle * 0.5).sin())
        }
    }
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
    intervals: &[ClassifiedInterval],
) -> Result<(Vec<ClassifiedInterval>, Vec<ClassifiedInterval>), ValidationFailure> {
    let mut start = Vec::new();
    for interval in intervals {
        if interval.phase == ZonePhase::NearWall {
            start.push(*interval);
        } else {
            break;
        }
    }

    let mut end = Vec::new();
    for interval in intervals.iter().rev() {
        if interval.phase == ZonePhase::NearWall {
            end.push(*interval);
        } else {
            break;
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
