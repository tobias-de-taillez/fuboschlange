use super::intersection::primitive_intersections;
use super::predicates::same_point;
use super::{Intersection, POSITION_TOLERANCE_MM, Vec2};
use crate::input::invalid_polygon;
use crate::model::{PathPrimitive, Point, SolverError};
use cavalier_contours::core::math::Vector2 as CcVector2;
use cavalier_contours::polyline::{PlineSource, PlineSourceMut, Polyline};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Winding {
    Clockwise,
    CounterClockwise,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointClassification {
    Outside,
    Boundary,
    Inside,
}

#[derive(Clone, Debug)]
pub struct Polygon {
    original: Vec<Point>,
    internal_ccw: Vec<Point>,
    original_edge_for_internal: Vec<usize>,
    winding: Winding,
    internal_edge_for_original: Vec<usize>,
    original_polyline: Polyline<f64>,
    internal_ccw_polyline: Polyline<f64>,
}

impl Polygon {
    pub fn try_from_original(original: Vec<Point>) -> Result<Self, SolverError> {
        validate_original_vertices(&original)?;
        validate_simple_polygon(&original)?;

        let signed_area = signed_area(&original);
        if signed_area.abs() <= POSITION_TOLERANCE_MM {
            return Err(invalid_polygon("ZERO_AREA"));
        }

        let winding = if signed_area < 0.0 {
            Winding::Clockwise
        } else {
            Winding::CounterClockwise
        };
        let (ccw_vertices, ccw_original_edge) = ccw_vertices_and_edge_map(&original, winding);
        let (internal_ccw, original_edge_for_internal, internal_edge_for_original) =
            simplify_ccw_vertices(&ccw_vertices, &ccw_original_edge)?;

        Ok(Self {
            original_polyline: closed_polyline_from_points(&original),
            internal_ccw_polyline: closed_polyline_from_points(&internal_ccw),
            original,
            internal_ccw,
            original_edge_for_internal,
            winding,
            internal_edge_for_original,
        })
    }

    pub fn winding(&self) -> Winding {
        self.winding
    }

    pub fn original_vertices(&self) -> &[Point] {
        &self.original
    }

    pub fn internal_ccw_vertices(&self) -> &[Point] {
        &self.internal_ccw
    }

    pub fn original_edge_count(&self) -> usize {
        self.original.len()
    }

    pub fn original_edge(&self, edge_index: usize) -> (Point, Point) {
        let start = self.original[edge_index];
        let end = self.original[(edge_index + 1) % self.original.len()];
        (start, end)
    }

    pub fn original_edge_length(&self, edge_index: usize) -> f64 {
        let (start, end) = self.original_edge(edge_index);
        (end - start).norm()
    }

    pub fn edge_tangent_for_original(&self, edge_index: usize) -> Vec2 {
        let (start, end) = self.original_edge(edge_index);
        (end - start).normalized().unwrap_or(Vec2::ZERO)
    }

    pub fn inward_normal_for_original(&self, edge_index: usize) -> Vec2 {
        let tangent = self.edge_tangent_for_original(edge_index);
        match self.winding {
            Winding::CounterClockwise => tangent.perp_ccw(),
            Winding::Clockwise => -tangent.perp_ccw(),
        }
    }

    pub fn original_edge_index_for_internal(&self, internal_edge_index: usize) -> usize {
        self.original_edge_for_internal[internal_edge_index]
    }

    pub fn internal_edge_index_for_original(&self, original_edge_index: usize) -> usize {
        self.internal_edge_for_original[original_edge_index]
    }

    pub fn classify_point(&self, point: Point) -> PointClassification {
        classify_closed_polyline_point(&self.original_polyline, point)
    }

    pub fn exact_boundary_distance(&self, point: Point) -> f64 {
        closed_polyline_boundary_distance(&self.original_polyline, point)
    }

    pub(crate) fn internal_ccw_polyline(&self) -> &Polyline<f64> {
        &self.internal_ccw_polyline
    }
}

pub(crate) fn classify_closed_polyline_point(
    polyline: &Polyline<f64>,
    point: Point,
) -> PointClassification {
    let point = CcVector2::new(point.x, point.y);
    if polyline
        .closest_point(point, POSITION_TOLERANCE_MM)
        .is_some_and(|closest| closest.distance <= POSITION_TOLERANCE_MM)
    {
        return PointClassification::Boundary;
    }

    if polyline.winding_number(point) == 0 {
        PointClassification::Outside
    } else {
        PointClassification::Inside
    }
}

pub(crate) fn closed_polyline_boundary_distance(polyline: &Polyline<f64>, point: Point) -> f64 {
    polyline
        .closest_point(CcVector2::new(point.x, point.y), POSITION_TOLERANCE_MM)
        .map(|closest| closest.distance)
        .unwrap_or(f64::INFINITY)
}

fn validate_original_vertices(original: &[Point]) -> Result<(), SolverError> {
    if original.len() < 3 {
        return Err(invalid_polygon("TOO_FEW_VERTICES"));
    }

    for point in original {
        if !point.is_finite() {
            return Err(invalid_polygon("NON_FINITE_COORDINATE"));
        }
    }

    for edge_index in 0..original.len() {
        let start = original[edge_index];
        let end = original[(edge_index + 1) % original.len()];
        if same_point(start, end) {
            return Err(invalid_polygon("ZERO_EDGE"));
        }
    }

    Ok(())
}

fn validate_simple_polygon(original: &[Point]) -> Result<(), SolverError> {
    let edges = original
        .iter()
        .copied()
        .enumerate()
        .map(|(i, start)| PathPrimitive::Line {
            start,
            end: original[(i + 1) % original.len()],
        })
        .collect::<Vec<_>>();

    for i in 0..edges.len() {
        for j in (i + 1)..edges.len() {
            let adjacent = j == i + 1 || (i == 0 && j + 1 == edges.len());
            let hit = primitive_intersections(&edges[i], &edges[j]);
            if adjacent {
                let shared = if j == i + 1 {
                    original[(i + 1) % original.len()]
                } else {
                    original[0]
                };
                let ok = match hit {
                    Intersection::Points(ref points)
                        if points.len() == 1 && same_point(points[0].point, shared) =>
                    {
                        true
                    }
                    _ => false,
                };
                if !ok {
                    return Err(invalid_polygon("ADJACENT_INTERSECTION"));
                }
            } else if !matches!(hit, Intersection::None) {
                return Err(invalid_polygon("SELF_INTERSECTION"));
            }
        }
    }

    Ok(())
}

fn ccw_vertices_and_edge_map(original: &[Point], winding: Winding) -> (Vec<Point>, Vec<usize>) {
    match winding {
        Winding::CounterClockwise => (original.to_vec(), (0..original.len()).collect()),
        Winding::Clockwise => {
            let n = original.len();
            (
                original.iter().copied().rev().collect(),
                (0..n).map(|index| (2 * n - 2 - index) % n).collect(),
            )
        }
    }
}

fn simplify_ccw_vertices(
    ccw_vertices: &[Point],
    ccw_original_edge: &[usize],
) -> Result<(Vec<Point>, Vec<usize>, Vec<usize>), SolverError> {
    let n = ccw_vertices.len();
    let mut kept_indices = Vec::with_capacity(n);

    for index in 0..n {
        let prev = ccw_vertices[(index + n - 1) % n];
        let current = ccw_vertices[index];
        let next = ccw_vertices[(index + 1) % n];
        if is_redundant_collinear_vertex(prev, current, next) {
            continue;
        }
        kept_indices.push(index);
    }

    if kept_indices.len() < 3 {
        return Err(invalid_polygon("TOO_FEW_EFFECTIVE_VERTICES"));
    }

    let internal_ccw = kept_indices
        .iter()
        .map(|&index| ccw_vertices[index])
        .collect::<Vec<_>>();
    let mut original_edge_for_internal = Vec::with_capacity(kept_indices.len());
    let mut internal_edge_for_original = vec![0usize; n];

    for (internal_index, &start_ccw_index) in kept_indices.iter().enumerate() {
        let end_ccw_index = kept_indices[(internal_index + 1) % kept_indices.len()];
        original_edge_for_internal.push(ccw_original_edge[start_ccw_index]);

        let mut edge_index = start_ccw_index;
        loop {
            let original_edge_index = ccw_original_edge[edge_index];
            internal_edge_for_original[original_edge_index] = internal_index;
            edge_index = (edge_index + 1) % n;
            if edge_index == end_ccw_index {
                break;
            }
        }
    }

    Ok((
        internal_ccw,
        original_edge_for_internal,
        internal_edge_for_original,
    ))
}

fn is_redundant_collinear_vertex(prev: Point, current: Point, next: Point) -> bool {
    orient(prev, current, next) == 0.0 && (current - prev).dot(next - current) > 0.0
}

fn signed_area(points: &[Point]) -> f64 {
    let mut area = 0.0;
    for (index, point) in points.iter().copied().enumerate() {
        let next = points[(index + 1) % points.len()];
        area += point.x * next.y - point.y * next.x;
    }
    area * 0.5
}

fn closed_polyline_from_points(points: &[Point]) -> Polyline<f64> {
    let mut polyline = Polyline::new_closed();
    for point in points {
        polyline.add(point.x, point.y, 0.0);
    }
    polyline
}

fn orient(a: Point, b: Point, c: Point) -> f64 {
    robust::orient2d(coord(a), coord(b), coord(c))
}

fn coord(point: Point) -> robust::Coord<f64> {
    robust::Coord {
        x: point.x,
        y: point.y,
    }
}
