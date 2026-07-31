use crate::constants::MAX_SPACING_CELLS;
use crate::geometry::{CanonicalPath, ParameterRange, primitive_distance};
use crate::model::{ErrorDetail, LocatedSpacing, PathPrimitive, SolverError, SolverErrorCode};
use crate::validation::provenance::ParentPair;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap};

#[derive(Clone, Debug, PartialEq)]
pub struct SpacingExtrema {
    pub min: LocatedSpacing,
    pub max: LocatedSpacing,
}

#[derive(Clone, Copy, Debug)]
struct SpacingCell {
    first_primitive: usize,
    second_primitive: usize,
    first_range: ParameterRange,
    second_range: ParameterRange,
    source_is_first: bool,
    upper_bound_mm: f64,
    id: usize,
}

impl PartialEq for SpacingCell {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for SpacingCell {}

impl PartialOrd for SpacingCell {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SpacingCell {
    fn cmp(&self, other: &Self) -> Ordering {
        self.upper_bound_mm
            .total_cmp(&other.upper_bound_mm)
            .then_with(|| other.id.cmp(&self.id))
    }
}

pub fn spacing_extrema(
    path: &CanonicalPath,
    parent_pairs: &[ParentPair],
    tolerance_mm: f64,
) -> Result<SpacingExtrema, SolverError> {
    spacing_extrema_with_budget(path, parent_pairs, tolerance_mm, MAX_SPACING_CELLS)
}

fn spacing_extrema_with_budget(
    path: &CanonicalPath,
    parent_pairs: &[ParentPair],
    tolerance_mm: f64,
    max_cells: usize,
) -> Result<SpacingExtrema, SolverError> {
    if !tolerance_mm.is_finite() || tolerance_mm <= 0.0 || path.primitives().is_empty() {
        return Err(internal_spacing_error("INVALID_SPACING_REQUEST"));
    }
    if parent_pairs.is_empty() {
        return Err(internal_spacing_error("NO_PARENT_PAIRS"));
    }

    let mut minimum = None;
    let initial_capacity = parent_pairs
        .len()
        .checked_mul(2)
        .ok_or_else(|| spacing_limit_error("MAX_SPACING_CELLS", max_cells, 0))?;
    let mut heap = BinaryHeap::with_capacity(initial_capacity.min(max_cells));
    let mut next_id = 0;
    let mut used = 0usize;

    for pair in parent_pairs {
        let Some(first) = path.primitives().get(pair.first_primitive) else {
            return Err(internal_spacing_error("INVALID_PARENT_PAIR"));
        };
        let Some(second) = path.primitives().get(pair.second_primitive) else {
            return Err(internal_spacing_error("INVALID_PARENT_PAIR"));
        };
        validate_range(pair.first_range)?;
        validate_range(pair.second_range)?;

        let closest = primitive_distance(first, pair.first_range, second, pair.second_range);
        let candidate = located_spacing(
            path,
            pair.first_primitive,
            pair.second_primitive,
            closest.a_t,
            closest.b_t,
            closest.distance_mm,
        );
        minimum = Some(stable_minimum(minimum, candidate));

        for source_is_first in [true, false] {
            if used >= max_cells {
                return Err(spacing_limit_error("MAX_SPACING_CELLS", max_cells, used));
            }
            heap.push(SpacingCell::new(
                path,
                pair.first_primitive,
                pair.second_primitive,
                pair.first_range,
                pair.second_range,
                source_is_first,
                next_id,
            ));
            next_id += 1;
            used += 1;
        }
    }

    let mut maximum = None;
    while let Some(cell) = heap.peek().copied() {
        let lower_bound_mm = maximum
            .as_ref()
            .map(|spacing: &LocatedSpacing| spacing.distance_mm)
            .unwrap_or(f64::NEG_INFINITY);
        if cell.upper_bound_mm - lower_bound_mm <= tolerance_mm {
            break;
        }

        let cell = heap.pop().unwrap();
        for parameter in sample_parameters(source_range(&cell)) {
            let sample = directed_sample(path, &cell, parameter);
            maximum = Some(stable_maximum(maximum, sample));
        }

        let Some((first, second)) = split_cell(cell) else {
            return Err(spacing_limit_error(
                "SPACING_REFINEMENT_STAGNATED",
                max_cells,
                used,
            ));
        };
        if max_cells.saturating_sub(used) < 2 {
            return Err(spacing_limit_error("MAX_SPACING_CELLS", max_cells, used));
        }
        heap.push(first.with_id(path, next_id));
        next_id += 1;
        used += 1;
        heap.push(second.with_id(path, next_id));
        next_id += 1;
        used += 1;
    }

    let maximum = maximum.ok_or_else(|| internal_spacing_error("EMPTY_SPACING_SEARCH"))?;
    Ok(SpacingExtrema {
        min: minimum.unwrap(),
        max: maximum,
    })
}

impl SpacingCell {
    fn new(
        path: &CanonicalPath,
        first_primitive: usize,
        second_primitive: usize,
        first_range: ParameterRange,
        second_range: ParameterRange,
        source_is_first: bool,
        id: usize,
    ) -> Self {
        let source = if source_is_first {
            first_range
        } else {
            second_range
        };
        let target = if source_is_first {
            (second_primitive, second_range)
        } else {
            (first_primitive, first_range)
        };
        let source_midpoint = midpoint(source);
        let center_distance = directed_distance(
            path,
            first_primitive,
            second_primitive,
            source_is_first,
            source_midpoint,
            target.1,
        )
        .distance_mm;
        let source_length = if source_is_first {
            path.primitives()[first_primitive].length()
        } else {
            path.primitives()[second_primitive].length()
        };
        let upper_bound_mm =
            (center_distance + 0.5 * source_length * (source.end - source.start)).next_up();

        Self {
            first_primitive,
            second_primitive,
            first_range,
            second_range,
            source_is_first,
            upper_bound_mm,
            id,
        }
    }

    fn with_id(self, path: &CanonicalPath, id: usize) -> Self {
        Self::new(
            path,
            self.first_primitive,
            self.second_primitive,
            self.first_range,
            self.second_range,
            self.source_is_first,
            id,
        )
    }
}

fn source_range(cell: &SpacingCell) -> ParameterRange {
    if cell.source_is_first {
        cell.first_range
    } else {
        cell.second_range
    }
}

fn target_range(cell: &SpacingCell) -> ParameterRange {
    if cell.source_is_first {
        cell.second_range
    } else {
        cell.first_range
    }
}

fn sample_parameters(range: ParameterRange) -> [f64; 3] {
    [range.start, midpoint(range), range.end]
}

fn split_cell(cell: SpacingCell) -> Option<(SpacingCell, SpacingCell)> {
    let range = source_range(&cell);
    let midpoint = midpoint(range);
    if midpoint <= range.start || midpoint >= range.end {
        return None;
    }
    Some(if cell.source_is_first {
        (
            SpacingCell {
                first_range: ParameterRange::new(range.start, midpoint),
                ..cell
            },
            SpacingCell {
                first_range: ParameterRange::new(midpoint, range.end),
                ..cell
            },
        )
    } else {
        (
            SpacingCell {
                second_range: ParameterRange::new(range.start, midpoint),
                ..cell
            },
            SpacingCell {
                second_range: ParameterRange::new(midpoint, range.end),
                ..cell
            },
        )
    })
}

fn midpoint(range: ParameterRange) -> f64 {
    (range.start + range.end) * 0.5
}

fn directed_sample(path: &CanonicalPath, cell: &SpacingCell, source_t: f64) -> LocatedSpacing {
    let sample = directed_distance(
        path,
        cell.first_primitive,
        cell.second_primitive,
        cell.source_is_first,
        source_t,
        target_range(cell),
    );
    if cell.source_is_first {
        located_spacing(
            path,
            cell.first_primitive,
            cell.second_primitive,
            source_t,
            sample.target_t,
            sample.distance_mm,
        )
    } else {
        located_spacing(
            path,
            cell.first_primitive,
            cell.second_primitive,
            sample.target_t,
            source_t,
            sample.distance_mm,
        )
    }
}

#[derive(Clone, Copy, Debug)]
struct DirectedDistance {
    distance_mm: f64,
    target_t: f64,
}

fn directed_distance(
    path: &CanonicalPath,
    first_primitive: usize,
    second_primitive: usize,
    source_is_first: bool,
    source_t: f64,
    target_range: ParameterRange,
) -> DirectedDistance {
    let (source, target) = if source_is_first {
        (
            &path.primitives()[first_primitive],
            &path.primitives()[second_primitive],
        )
    } else {
        (
            &path.primitives()[second_primitive],
            &path.primitives()[first_primitive],
        )
    };
    let source_point = source.point_at(source_t);
    let point_primitive = PathPrimitive::Line {
        start: source_point,
        end: source_point,
    };
    let closest = primitive_distance(&point_primitive, ParameterRange::FULL, target, target_range);
    DirectedDistance {
        distance_mm: closest.distance_mm,
        target_t: closest.b_t,
    }
}

fn located_spacing(
    path: &CanonicalPath,
    first_primitive: usize,
    second_primitive: usize,
    first_t: f64,
    second_t: f64,
    distance_mm: f64,
) -> LocatedSpacing {
    let first = &path.primitives()[first_primitive];
    let second = &path.primitives()[second_primitive];
    LocatedSpacing {
        distance_mm,
        first_point: first.point_at(first_t),
        second_point: second.point_at(second_t),
        first_path_offset_mm: path.prefix_lengths()[first_primitive] + first.length() * first_t,
        second_path_offset_mm: path.prefix_lengths()[second_primitive] + second.length() * second_t,
    }
}

fn stable_minimum(current: Option<LocatedSpacing>, candidate: LocatedSpacing) -> LocatedSpacing {
    match current {
        None => candidate,
        Some(current) => match compare_spacing(&candidate, &current) {
            Ordering::Less => candidate,
            Ordering::Greater | Ordering::Equal => current,
        },
    }
}

fn stable_maximum(current: Option<LocatedSpacing>, candidate: LocatedSpacing) -> LocatedSpacing {
    match current {
        None => candidate,
        Some(current) => {
            if candidate
                .distance_mm
                .total_cmp(&current.distance_mm)
                .is_gt()
                || (candidate
                    .distance_mm
                    .total_cmp(&current.distance_mm)
                    .is_eq()
                    && compare_tie_breaker(&candidate, &current).is_lt())
            {
                candidate
            } else {
                current
            }
        }
    }
}

fn compare_spacing(left: &LocatedSpacing, right: &LocatedSpacing) -> Ordering {
    left.distance_mm
        .total_cmp(&right.distance_mm)
        .then_with(|| compare_tie_breaker(left, right))
}

fn compare_tie_breaker(left: &LocatedSpacing, right: &LocatedSpacing) -> Ordering {
    left.first_path_offset_mm
        .total_cmp(&right.first_path_offset_mm)
        .then_with(|| {
            left.second_path_offset_mm
                .total_cmp(&right.second_path_offset_mm)
        })
        .then_with(|| left.first_point.x.total_cmp(&right.first_point.x))
        .then_with(|| left.first_point.y.total_cmp(&right.first_point.y))
        .then_with(|| left.second_point.x.total_cmp(&right.second_point.x))
        .then_with(|| left.second_point.y.total_cmp(&right.second_point.y))
}

fn validate_range(range: ParameterRange) -> Result<(), SolverError> {
    if range.start.is_finite()
        && range.end.is_finite()
        && range.start >= 0.0
        && range.end <= 1.0
        && range.start < range.end
    {
        Ok(())
    } else {
        Err(internal_spacing_error("INVALID_PARENT_PAIR"))
    }
}

fn spacing_limit_error(reason: &'static str, limit: usize, used: usize) -> SolverError {
    SolverError {
        code: SolverErrorCode::SolverLimitExceeded,
        message: "Spacing diagnostics exceeded their deterministic refinement budget".to_string(),
        details: BTreeMap::from([
            ("reason".to_string(), ErrorDetail::string(reason)),
            (
                "limit".to_string(),
                ErrorDetail::number(limit as f64).unwrap(),
            ),
            (
                "used".to_string(),
                ErrorDetail::number(used as f64).unwrap(),
            ),
        ]),
    }
}

fn internal_spacing_error(reason: &'static str) -> SolverError {
    SolverError {
        code: SolverErrorCode::InternalValidationFailure,
        message: "Spacing diagnostics could not be evaluated".to_string(),
        details: BTreeMap::from([("reason".to_string(), ErrorDetail::string(reason))]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::canonicalize_path;
    use crate::model::Point;
    use std::f64::consts::PI;

    fn line(start: (f64, f64), end: (f64, f64)) -> PathPrimitive {
        PathPrimitive::Line {
            start: Point::new(start.0, start.1),
            end: Point::new(end.0, end.1),
        }
    }

    fn diagnostic_path() -> CanonicalPath {
        canonicalize_path(&[
            line((0.0, 0.0), (100.0, 0.0)),
            PathPrimitive::Arc {
                start: Point::new(100.0, 0.0),
                end: Point::new(100.0, 80.0),
                center: Point::new(100.0, 40.0),
                radius_mm: 40.0,
                sweep_rad: PI,
            },
            line((100.0, 80.0), (0.0, 80.0)),
        ])
        .unwrap()
    }

    #[test]
    fn midpoint_stagnation_returns_explicit_resource_error() {
        let path = diagnostic_path();
        let pairs = vec![ParentPair {
            first_primitive: 0,
            first_range: ParameterRange::new(1.0 - f64::EPSILON, 1.0),
            second_primitive: 2,
            second_range: ParameterRange::new(1.0 - f64::EPSILON, 1.0),
            first_winding: 0,
            second_winding: 1,
        }];

        let error = spacing_extrema_with_budget(&path, &pairs, f64::MIN_POSITIVE, 100)
            .expect_err("unsplittable parameter intervals must not be requeued");
        assert_eq!(error.code, SolverErrorCode::SolverLimitExceeded);
        assert_eq!(
            error.details.get("reason").and_then(ErrorDetail::as_str),
            Some("SPACING_REFINEMENT_STAGNATED")
        );
    }

    #[test]
    fn tiny_tolerance_stops_at_exact_spacing_cell_budget() {
        let path = diagnostic_path();
        let pairs = vec![ParentPair {
            first_primitive: 0,
            first_range: ParameterRange::FULL,
            second_primitive: 2,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        }];

        let error = spacing_extrema_with_budget(&path, &pairs, f64::MIN_POSITIVE, 2)
            .expect_err("refinement must stop at its deterministic cell budget");
        assert_eq!(error.code, SolverErrorCode::SolverLimitExceeded);
        assert_eq!(
            error.details.get("reason").and_then(ErrorDetail::as_str),
            Some("MAX_SPACING_CELLS")
        );
        assert_eq!(
            error.details.get("limit").and_then(ErrorDetail::as_number),
            Some(2.0)
        );
        assert_eq!(
            error.details.get("used").and_then(ErrorDetail::as_number),
            Some(2.0)
        );
    }
}
