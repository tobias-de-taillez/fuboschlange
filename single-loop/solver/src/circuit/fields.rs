//! Deterministic decomposition of a room's outline into squat, axis-parallel
//! rectangular fields.
//!
//! A convex outline is always a single field. A rectilinear (every edge
//! axis-parallel within 0.5 mm) but concave outline is cut into rectangles
//! by extending an axis-parallel half-line from each concave ("reflex")
//! vertex to the nearest polygon boundary — a guillotine cut. Every reflex
//! vertex has exactly two candidate cuts (continue its horizontal incident
//! edge past it, or its vertical one); the full cross product of per-vertex
//! choices is enumerated in a fixed, deterministic order and ranked by (1)
//! fewest resulting fields, (2) smallest worst aspect ratio (squat fields —
//! long side / short side ≤ 2 — preferred wherever a variant achieves it),
//! (3) lexicographically smallest cut description (vertex order, horizontal
//! choice ordered before vertical). A non-rectilinear (diagonal-walled)
//! convex outline falls back to its bounding rectangle as a single,
//! necessarily approximate field. A non-rectilinear, concave outline is
//! outside this milestone's scope; see
//! `docs/superpowers/plans/2026-07-31-bekotec-loop-solver-spiral.md`, Task 3.

use crate::circuit::types::{LoopError, LoopErrorCode, RectMm};
use crate::geometry::{Polygon, Vec2};
use crate::model::Point;
use crate::plate::PlateTransform;
use std::collections::HashSet;

/// Edges within this deviation from horizontal/vertical, in plate-local
/// millimeters, are treated as axis-parallel ("within 0.5 mm" per the plan).
const RECTILINEAR_TOLERANCE_MM: f64 = 0.5;

/// Tolerance for treating two plate-local coordinates as the same grid
/// line/vertex. Far tighter than `RECTILINEAR_TOLERANCE_MM`: guillotine cut
/// endpoints always reuse an existing vertex coordinate verbatim (see
/// `nearest_boundary_hit`), so this only needs to absorb floating-point
/// noise from `PlateTransform::to_local` (e.g. two ends of a
/// locally-vertical edge under a rotated transform, which agree
/// mathematically but may differ by a handful of ULPs) — never genuinely
/// distinct geometry.
const COORD_EPSILON_MM: f64 = 1e-6;

/// Cross products at or above this (negative) threshold are treated as
/// collinear/convex rather than reflex. Room-scale cross products (areas in
/// mm^2) are many orders of magnitude larger than this, so it only absorbs
/// floating-point noise without misclassifying a genuine corner.
const REFLEX_CROSS_EPS_MM2: f64 = 1e-6;

/// One rectangular field of a decomposed room, expressed in the plate-local
/// frame.
#[derive(Clone, Debug, PartialEq)]
pub struct Field {
    /// Stable id, `0..n`, assigned by ascending `(min.y, min.x)`.
    pub id: u32,
    /// Axis-parallel rectangle in plate-local millimeters.
    pub rect_local: RectMm,
}

/// Decomposes `polygon`'s outline, expressed in `transform`'s plate-local
/// frame, into squat rectangular fields.
///
/// A convex outline (rectilinear or not) is returned as a single field —
/// rectilinear convex outlines are already an exact rectangle; non
/// rectilinear ones fall back to their bounding rectangle, a deliberate
/// approximation. A rectilinear, concave outline is decomposed via
/// guillotine cuts anchored at its reflex vertices (see the module
/// documentation); `max_variants` bounds the number of cut-set combinations
/// considered before giving up with `SolverLimitExceeded`. A
/// non-rectilinear, concave outline is not supported in this milestone and
/// returns `NoSolutionGeometry` with message `NON_RECTILINEAR_CONCAVE_ROOM`.
pub fn decompose_fields(
    polygon: &Polygon,
    transform: &PlateTransform,
    max_variants: usize,
) -> Result<Vec<Field>, LoopError> {
    // Reflex-ness (interior angle > 180°) is invariant under the rigid
    // `to_local` transform, whether or not it happens to reverse
    // orientation — so it is computed once here, on `internal_ccw_vertices`
    // (guaranteed CCW in the original/world frame, so the standard
    // "cross < 0" reflex convention is unambiguous), and carried over by
    // index. Nothing below the rest of this function needs to know local
    // winding.
    let world_vertices = polygon.internal_ccw_vertices();
    let reflex_indices = reflex_vertex_indices(world_vertices);
    let local_vertices: Vec<Point> = world_vertices
        .iter()
        .map(|&point| transform.to_local(point))
        .collect();

    if !is_rectilinear(&local_vertices) {
        return if reflex_indices.is_empty() {
            Ok(vec![bounding_field(&local_vertices)])
        } else {
            Err(non_rectilinear_concave_error())
        };
    }

    if reflex_indices.is_empty() {
        // Rectilinear + convex + simple ⟹ the outline is already an exact
        // rectangle (all n corners turn the same way, each contributing a
        // 90° exterior angle to the mandatory 360° total, forcing n = 4), so
        // the bounding box equals the polygon.
        return Ok(vec![bounding_field(&local_vertices)]);
    }

    decompose_rectilinear(&local_vertices, &reflex_indices, max_variants)
}

fn reflex_vertex_indices(vertices: &[Point]) -> Vec<usize> {
    let n = vertices.len();
    (0..n)
        .filter(|&index| {
            let prev = vertices[(index + n - 1) % n];
            let current = vertices[index];
            let next = vertices[(index + 1) % n];
            cross(current - prev, next - current) < -REFLEX_CROSS_EPS_MM2
        })
        .collect()
}

fn cross(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Axis {
    Horizontal,
    Vertical,
}

/// Classifies edge `a`->`b` as `Horizontal` (near-constant y), `Vertical`
/// (near-constant x), or neither (diagonal), within `tolerance_mm`.
fn edge_axis(a: Point, b: Point, tolerance_mm: f64) -> Option<Axis> {
    let dx = (b.x - a.x).abs();
    let dy = (b.y - a.y).abs();
    if dy <= tolerance_mm {
        Some(Axis::Horizontal)
    } else if dx <= tolerance_mm {
        Some(Axis::Vertical)
    } else {
        None
    }
}

fn is_rectilinear(vertices: &[Point]) -> bool {
    let n = vertices.len();
    (0..n)
        .all(|i| edge_axis(vertices[i], vertices[(i + 1) % n], RECTILINEAR_TOLERANCE_MM).is_some())
}

fn bounding_field(vertices: &[Point]) -> Field {
    let mut min = vertices[0];
    let mut max = vertices[0];
    for &point in &vertices[1..] {
        min.x = min.x.min(point.x);
        min.y = min.y.min(point.y);
        max.x = max.x.max(point.x);
        max.y = max.y.max(point.y);
    }
    Field {
        id: 0,
        rect_local: RectMm { min, max },
    }
}

/// A guillotine cut: `Horizontal` means a fixed y (`fixed`) spanning x in
/// `[lo, hi]`; `Vertical` means a fixed x spanning y in `[lo, hi]`.
#[derive(Clone, Copy, Debug)]
struct Cut {
    axis: Axis,
    fixed: f64,
    lo: f64,
    hi: f64,
}

/// The two candidate cuts at one reflex vertex: continuing its horizontal
/// incident edge past the vertex, or its vertical one.
#[derive(Clone, Copy, Debug)]
struct ReflexCandidates {
    horizontal: Cut,
    vertical: Cut,
}

fn decompose_rectilinear(
    vertices: &[Point],
    reflex_indices: &[usize],
    max_variants: usize,
) -> Result<Vec<Field>, LoopError> {
    let reflex_count = reflex_indices.len();
    // `checked_shl` (not `<<`/`unwrap_or(usize::MAX)`) so an astronomical
    // reflex count that overflows `usize` (e.g. >=32 on wasm32's 32-bit
    // usize) unconditionally exceeds the budget, rather than only doing so
    // when `usize::MAX > max_variants` happens to be false.
    let variant_count = match 1usize.checked_shl(reflex_count as u32) {
        Some(count) if count <= max_variants => count,
        Some(count) => return Err(solver_limit_exceeded(count, max_variants)),
        None => return Err(solver_limit_exceeded(usize::MAX, max_variants)),
    };

    let candidates = reflex_indices
        .iter()
        .map(|&index| reflex_candidates(vertices, index))
        .collect::<Result<Vec<_>, _>>()?;

    let xs = unique_sorted_coordinates(vertices.iter().map(|point| point.x));
    let ys = unique_sorted_coordinates(vertices.iter().map(|point| point.y));
    let inside = classify_grid(vertices, &xs, &ys);

    let mut best: Option<(usize, f64, Vec<RectMm>)> = None;
    for variant in 0..variant_count {
        // True lexicographic order over (choice_0, choice_1, ..., choice_k-1)
        // with Horizontal < Vertical: choice_0 (the first reflex vertex) is
        // the most significant "digit", so it must vary slowest — hence
        // indexing the bit from the top, not the bottom.
        let cuts: Vec<Cut> = (0..reflex_count)
            .map(|i| {
                let bit = (variant >> (reflex_count - 1 - i)) & 1;
                if bit == 0 {
                    candidates[i].horizontal
                } else {
                    candidates[i].vertical
                }
            })
            .collect();

        let Some(rects) = tile_with_cuts(&xs, &ys, &inside, &cuts)? else {
            continue;
        };

        let worst = worst_aspect_ratio(&rects);
        let is_better = match &best {
            None => true,
            Some((best_count, best_worst, _)) => {
                rects.len() < *best_count || (rects.len() == *best_count && worst < *best_worst)
            }
        };
        if is_better {
            best = Some((rects.len(), worst, rects));
        }
    }

    let (_, _, rects) = best.ok_or_else(guillotine_decomposition_failed)?;
    debug_assert!(
        (total_rect_area(&rects) - polygon_area(vertices)).abs() < 1e-6,
        "field decomposition must exactly tile the polygon"
    );
    Ok(finalize_fields(rects))
}

/// Builds both candidate cuts for the reflex vertex at `index`.
fn reflex_candidates(vertices: &[Point], index: usize) -> Result<ReflexCandidates, LoopError> {
    let n = vertices.len();
    let vertex = vertices[index];
    let prev = vertices[(index + n - 1) % n];
    let next = vertices[(index + 1) % n];

    let prev_axis = edge_axis(prev, vertex, RECTILINEAR_TOLERANCE_MM);
    let next_axis = edge_axis(vertex, next, RECTILINEAR_TOLERANCE_MM);

    // A rectilinear corner alternates axis between its two incident edges;
    // whichever neighbor supplies the Horizontal edge anchors the
    // horizontal candidate (and vice versa for Vertical).
    let (horizontal_neighbor, vertical_neighbor) = match (prev_axis, next_axis) {
        (Some(Axis::Horizontal), Some(Axis::Vertical)) => (prev, next),
        (Some(Axis::Vertical), Some(Axis::Horizontal)) => (next, prev),
        _ => {
            return Err(internal_validation_failure(
                "reflex vertex does not have one horizontal and one vertical incident edge",
            ));
        }
    };

    Ok(ReflexCandidates {
        horizontal: ray_cut(
            vertices,
            index,
            vertex,
            horizontal_neighbor,
            Axis::Horizontal,
        )?,
        vertical: ray_cut(vertices, index, vertex, vertical_neighbor, Axis::Vertical)?,
    })
}

/// Extends the line through `neighbor` and `from`, past `from` and away from
/// `neighbor`, to the nearest polygon boundary, and packages the result as a
/// `Cut`.
fn ray_cut(
    vertices: &[Point],
    vertex_index: usize,
    from: Point,
    neighbor: Point,
    axis: Axis,
) -> Result<Cut, LoopError> {
    let sign = match axis {
        Axis::Horizontal => (from.x - neighbor.x).signum(),
        Axis::Vertical => (from.y - neighbor.y).signum(),
    };
    let hit = nearest_boundary_hit(vertices, vertex_index, from, axis, sign).ok_or_else(|| {
        internal_validation_failure("guillotine ray did not reach the polygon boundary")
    })?;
    Ok(match axis {
        Axis::Horizontal => Cut {
            axis,
            fixed: from.y,
            lo: from.x.min(hit.x),
            hi: from.x.max(hit.x),
        },
        Axis::Vertical => Cut {
            axis,
            fixed: from.x,
            lo: from.y.min(hit.y),
            hi: from.y.max(hit.y),
        },
    })
}

/// Finds the closest point where a ray from `from`, moving along `axis` in
/// the direction `sign`, first meets a polygon edge perpendicular to it.
/// `exclude_vertex_index`'s two incident edges are skipped (they touch
/// `from` at distance 0, not a real obstruction).
fn nearest_boundary_hit(
    vertices: &[Point],
    exclude_vertex_index: usize,
    from: Point,
    axis: Axis,
    sign: f64,
) -> Option<Point> {
    let n = vertices.len();
    let exclude_incoming = (exclude_vertex_index + n - 1) % n;
    let exclude_outgoing = exclude_vertex_index;
    let blocking_axis = match axis {
        Axis::Horizontal => Axis::Vertical,
        Axis::Vertical => Axis::Horizontal,
    };

    let mut nearest: Option<(f64, Point)> = None;
    for i in 0..n {
        if i == exclude_incoming || i == exclude_outgoing {
            continue;
        }
        let a = vertices[i];
        let b = vertices[(i + 1) % n];
        if edge_axis(a, b, RECTILINEAR_TOLERANCE_MM) != Some(blocking_axis) {
            continue;
        }

        // Reuse `a`'s coordinate verbatim (not e.g. the midpoint of a, b) so
        // the hit point is bit-identical to a value already in the
        // xs/ys grid built from `vertices`.
        let hit = match axis {
            Axis::Horizontal => {
                let (lo, hi) = (a.y.min(b.y), a.y.max(b.y));
                if from.y < lo - COORD_EPSILON_MM || from.y > hi + COORD_EPSILON_MM {
                    continue;
                }
                Point::new(a.x, from.y)
            }
            Axis::Vertical => {
                let (lo, hi) = (a.x.min(b.x), a.x.max(b.x));
                if from.x < lo - COORD_EPSILON_MM || from.x > hi + COORD_EPSILON_MM {
                    continue;
                }
                Point::new(from.x, a.y)
            }
        };

        let moving_delta = match axis {
            Axis::Horizontal => hit.x - from.x,
            Axis::Vertical => hit.y - from.y,
        };
        if moving_delta * sign <= COORD_EPSILON_MM {
            continue;
        }

        let distance = moving_delta.abs();
        let is_nearer = match nearest {
            Some((best_distance, _)) => distance < best_distance,
            None => true,
        };
        if is_nearer {
            nearest = Some((distance, hit));
        }
    }
    nearest.map(|(_, point)| point)
}

fn unique_sorted_coordinates(values: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut values: Vec<f64> = values.collect();
    values.sort_by(f64::total_cmp);
    values.dedup_by(|a, b| (*a - *b).abs() <= COORD_EPSILON_MM);
    values
}

/// Classifies every grid cell (bounded by consecutive `xs`/`ys`) as inside
/// or outside the polygon, by testing its center point. Since `xs`/`ys`
/// contain exactly the polygon's own vertex coordinates, a cell's interior
/// never touches a polygon edge, so this is never ambiguous (boundary).
fn classify_grid(vertices: &[Point], xs: &[f64], ys: &[f64]) -> Vec<Vec<bool>> {
    (0..xs.len() - 1)
        .map(|col| {
            let center_x = (xs[col] + xs[col + 1]) * 0.5;
            (0..ys.len() - 1)
                .map(|row| {
                    let center_y = (ys[row] + ys[row + 1]) * 0.5;
                    point_in_polygon(Point::new(center_x, center_y), vertices)
                })
                .collect()
        })
        .collect()
}

/// Standard crossing-number point-in-simple-polygon test.
fn point_in_polygon(point: Point, vertices: &[Point]) -> bool {
    let n = vertices.len();
    let mut inside = false;
    for i in 0..n {
        let a = vertices[i];
        let b = vertices[(i + 1) % n];
        if (a.y > point.y) != (b.y > point.y) {
            let x_intersect = a.x + (point.y - a.y) / (b.y - a.y) * (b.x - a.x);
            if point.x < x_intersect {
                inside = !inside;
            }
        }
    }
    inside
}

/// Applies `cuts` to the `xs`x`ys` grid of `inside` cells and merges
/// unblocked-adjacent inside cells into maximal rectangles. Returns
/// `Ok(None)` when some resulting region is not a solid rectangle (this
/// cut-set variant does not decompose the polygon), or `Err` if a cut
/// coordinate is not found in the grid (an internal invariant violation,
/// not a legitimate non-rectangular tiling).
fn tile_with_cuts(
    xs: &[f64],
    ys: &[f64],
    inside: &[Vec<bool>],
    cuts: &[Cut],
) -> Result<Option<Vec<RectMm>>, LoopError> {
    let cols = xs.len() - 1;
    let rows = ys.len() - 1;
    let mut blocked = BlockedGaps::default();

    for cut in cuts {
        match cut.axis {
            Axis::Vertical => {
                let gap = grid_lookup(xs, cut.fixed)?;
                let row_lo = grid_lookup(ys, cut.lo)?;
                let row_hi = grid_lookup(ys, cut.hi)?;
                for row in row_lo..row_hi {
                    blocked.col.insert((gap, row));
                }
            }
            Axis::Horizontal => {
                let gap = grid_lookup(ys, cut.fixed)?;
                let col_lo = grid_lookup(xs, cut.lo)?;
                let col_hi = grid_lookup(xs, cut.hi)?;
                for col in col_lo..col_hi {
                    blocked.row.insert((col, gap));
                }
            }
        }
    }

    let mut visited = vec![vec![false; rows]; cols];
    let mut rects = Vec::new();
    for start_col in 0..cols {
        for start_row in 0..rows {
            if visited[start_col][start_row] || !inside[start_col][start_row] {
                continue;
            }
            let component =
                flood_fill_component(inside, &mut visited, &blocked, start_col, start_row);
            let Some(rect) = component_bounds_if_rectangular(&component, xs, ys) else {
                return Ok(None);
            };
            rects.push(rect);
        }
    }

    if rects.is_empty() {
        return Ok(None);
    }
    Ok(Some(rects))
}

fn grid_lookup(values: &[f64], target: f64) -> Result<usize, LoopError> {
    values
        .iter()
        .position(|&value| (value - target).abs() <= COORD_EPSILON_MM)
        .ok_or_else(|| {
            internal_validation_failure(
                "guillotine cut coordinate is missing from the polygon's coordinate grid",
            )
        })
}

/// Blocked cell-adjacencies from a cut set. `col.contains((gap, row))`
/// blocks the column adjacency at grid-line index `gap` (between column
/// `gap - 1` and `gap`) for that row; `row` is the symmetric case for row
/// adjacencies.
#[derive(Default)]
struct BlockedGaps {
    col: HashSet<(usize, usize)>,
    row: HashSet<(usize, usize)>,
}

/// Flood-fills the connected component of inside cells reachable from
/// `(start_col, start_row)`, without crossing a blocked gap. Grid extent is
/// taken from `inside` itself (`cols = inside.len()`,
/// `rows = inside[0].len()`), which is always non-empty: a polygon has
/// positive area, so its coordinate grid always has at least one row and
/// column.
fn flood_fill_component(
    inside: &[Vec<bool>],
    visited: &mut [Vec<bool>],
    blocked: &BlockedGaps,
    start_col: usize,
    start_row: usize,
) -> Vec<(usize, usize)> {
    let cols = inside.len();
    let rows = inside[0].len();
    let mut stack = vec![(start_col, start_row)];
    visited[start_col][start_row] = true;
    let mut cells = Vec::new();

    while let Some((col, row)) = stack.pop() {
        cells.push((col, row));

        if col > 0
            && !blocked.col.contains(&(col, row))
            && inside[col - 1][row]
            && !visited[col - 1][row]
        {
            visited[col - 1][row] = true;
            stack.push((col - 1, row));
        }
        if col + 1 < cols
            && !blocked.col.contains(&(col + 1, row))
            && inside[col + 1][row]
            && !visited[col + 1][row]
        {
            visited[col + 1][row] = true;
            stack.push((col + 1, row));
        }
        if row > 0
            && !blocked.row.contains(&(col, row))
            && inside[col][row - 1]
            && !visited[col][row - 1]
        {
            visited[col][row - 1] = true;
            stack.push((col, row - 1));
        }
        if row + 1 < rows
            && !blocked.row.contains(&(col, row + 1))
            && inside[col][row + 1]
            && !visited[col][row + 1]
        {
            visited[col][row + 1] = true;
            stack.push((col, row + 1));
        }
    }

    cells
}

/// `Some(rect)` when `cells` exactly fills its own bounding box (a solid
/// rectangle, no notch/hole); `None` otherwise.
fn component_bounds_if_rectangular(
    cells: &[(usize, usize)],
    xs: &[f64],
    ys: &[f64],
) -> Option<RectMm> {
    let min_col = cells.iter().map(|&(col, _)| col).min()?;
    let max_col = cells.iter().map(|&(col, _)| col).max()?;
    let min_row = cells.iter().map(|&(_, row)| row).min()?;
    let max_row = cells.iter().map(|&(_, row)| row).max()?;

    let expected = (max_col - min_col + 1) * (max_row - min_row + 1);
    if cells.len() != expected {
        return None;
    }
    Some(RectMm {
        min: Point::new(xs[min_col], ys[min_row]),
        max: Point::new(xs[max_col + 1], ys[max_row + 1]),
    })
}

fn worst_aspect_ratio(rects: &[RectMm]) -> f64 {
    rects
        .iter()
        .map(|rect| {
            let width = rect.max.x - rect.min.x;
            let height = rect.max.y - rect.min.y;
            (width / height).max(height / width)
        })
        .fold(f64::NEG_INFINITY, f64::max)
}

fn polygon_area(vertices: &[Point]) -> f64 {
    let n = vertices.len();
    let mut sum = 0.0;
    for i in 0..n {
        let a = vertices[i];
        let b = vertices[(i + 1) % n];
        sum += a.x * b.y - a.y * b.x;
    }
    (sum * 0.5).abs()
}

fn total_rect_area(rects: &[RectMm]) -> f64 {
    rects
        .iter()
        .map(|rect| (rect.max.x - rect.min.x) * (rect.max.y - rect.min.y))
        .sum()
}

fn finalize_fields(mut rects: Vec<RectMm>) -> Vec<Field> {
    rects.sort_by(|a, b| {
        a.min
            .y
            .total_cmp(&b.min.y)
            .then_with(|| a.min.x.total_cmp(&b.min.x))
    });
    rects
        .into_iter()
        .enumerate()
        .map(|(index, rect_local)| Field {
            id: index as u32,
            rect_local,
        })
        .collect()
}

fn non_rectilinear_concave_error() -> LoopError {
    LoopError {
        code: LoopErrorCode::NoSolutionGeometry,
        message: "NON_RECTILINEAR_CONCAVE_ROOM".to_owned(),
        journal_tail: Vec::new(),
    }
}

fn solver_limit_exceeded(variant_count: usize, max_variants: usize) -> LoopError {
    LoopError {
        code: LoopErrorCode::SolverLimitExceeded,
        message: format!(
            "field decomposition requires {variant_count} guillotine cut-set variants, exceeding max_variants {max_variants}"
        ),
        journal_tail: Vec::new(),
    }
}

fn internal_validation_failure(message: &str) -> LoopError {
    LoopError {
        code: LoopErrorCode::InternalValidationFailure,
        message: message.to_owned(),
        journal_tail: Vec::new(),
    }
}

fn guillotine_decomposition_failed() -> LoopError {
    LoopError {
        code: LoopErrorCode::NoSolutionGeometry,
        message: "no guillotine cut-set variant decomposed this room into rectangles".to_owned(),
        journal_tail: Vec::new(),
    }
}
