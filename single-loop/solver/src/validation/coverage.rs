use crate::geometry::{CanonicalPath, ParameterRange, Polygon, primitive_distance};
use crate::input::internal_validation_failure;
use crate::model::{ErrorDetail, PathPrimitive, Point, SolverError, SolverErrorCode};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CoverageBounds {
    pub lower_bound_mm: f64,
    pub upper_bound_mm: f64,
    pub error_bound_mm: f64,
    pub worst_point: Point,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct DistanceSample {
    distance_mm: f64,
    point: Point,
}

#[derive(Clone, Copy, Debug)]
struct CoverageCell {
    vertices: [Point; 3],
    sample: DistanceSample,
    upper_bound_mm: f64,
    id: usize,
}

impl PartialEq for CoverageCell {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for CoverageCell {}

impl PartialOrd for CoverageCell {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for CoverageCell {
    fn cmp(&self, other: &Self) -> Ordering {
        self.upper_bound_mm
            .total_cmp(&other.upper_bound_mm)
            .then_with(|| other.id.cmp(&self.id))
    }
}

pub fn coverage_bounds(
    polygon: &Polygon,
    path: &CanonicalPath,
    tolerance_mm: f64,
    max_cells: usize,
) -> Result<CoverageBounds, SolverError> {
    if !tolerance_mm.is_finite() || tolerance_mm <= 0.0 || path.primitives().is_empty() {
        return Err(internal_validation_failure("INVALID_COVERAGE_REQUEST"));
    }

    let mut cells = seed_cells(polygon, path)?;
    if cells.is_empty() {
        return Err(internal_validation_failure("EMPTY_COVERAGE_TRIANGULATION"));
    }

    let mut heap = BinaryHeap::with_capacity(cells.len());
    let mut best = None;
    let mut next_id = 0;
    let mut used = 0;
    for triangle in cells.drain(..) {
        if used >= max_cells {
            return Err(coverage_limit_error(max_cells, used));
        }
        let cell = make_cell(triangle, path, next_id);
        next_id += 1;
        used += 1;
        best = Some(stable_max(best, cell.sample));
        heap.push(cell);
    }

    loop {
        let upper_bound_mm = heap
            .peek()
            .map(|cell| cell.upper_bound_mm)
            .unwrap_or(best.unwrap().distance_mm);
        let lower_bound_mm = best.unwrap().distance_mm;
        if upper_bound_mm - lower_bound_mm <= tolerance_mm {
            let best = best.unwrap();
            return Ok(CoverageBounds {
                lower_bound_mm,
                upper_bound_mm,
                error_bound_mm: upper_bound_mm - lower_bound_mm,
                worst_point: best.point,
            });
        }

        if used >= max_cells {
            return Err(coverage_limit_error(max_cells, used));
        }

        let cell = heap
            .pop()
            .expect("a non-converged coverage search has a cell");
        let (left, right) = bisect_longest_edge(cell.vertices);
        for triangle in [left, right] {
            if used >= max_cells {
                return Err(coverage_limit_error(max_cells, used));
            }
            let child = make_cell(triangle, path, next_id);
            next_id += 1;
            used += 1;
            best = Some(stable_max(best, child.sample));
            heap.push(child);
        }
    }
}

fn seed_cells(polygon: &Polygon, path: &CanonicalPath) -> Result<Vec<[Point; 3]>, SolverError> {
    let vertices = polygon.original_vertices();
    let mut flat = Vec::with_capacity(vertices.len() * 2);
    for point in vertices {
        flat.extend([point.x, point.y]);
    }

    let indices = earcutr::earcut(&flat, &[], 2)
        .map_err(|_| internal_validation_failure("COVERAGE_TRIANGULATION_FAILED"))?;
    let mut triangles = Vec::with_capacity(indices.len() / 3);
    for indices in indices.chunks_exact(3) {
        let triangle = [
            vertices[indices[0]],
            vertices[indices[1]],
            vertices[indices[2]],
        ];
        if triangle_area(triangle) > 0.0 {
            triangles.push(triangle);
        }
    }

    if triangles.is_empty() && !path.primitives().is_empty() {
        return Err(internal_validation_failure("EMPTY_COVERAGE_TRIANGULATION"));
    }
    Ok(triangles)
}

fn make_cell(vertices: [Point; 3], path: &CanonicalPath, id: usize) -> CoverageCell {
    let centroid = Point::new(
        (vertices[0].x + vertices[1].x + vertices[2].x) / 3.0,
        (vertices[0].y + vertices[1].y + vertices[2].y) / 3.0,
    );
    let mut sample = distance_sample(vertices[0], path);
    for point in [vertices[1], vertices[2], centroid] {
        sample = stable_max(Some(sample), distance_sample(point, path));
    }

    let radius_mm = vertices
        .into_iter()
        .map(|point| centroid.distance_to(point))
        .fold(0.0, f64::max);
    let upper_bound_mm = (distance_sample(centroid, path).distance_mm + radius_mm)
        .max(sample.distance_mm)
        .next_up();

    CoverageCell {
        vertices,
        sample,
        upper_bound_mm,
        id,
    }
}

fn distance_sample(point: Point, path: &CanonicalPath) -> DistanceSample {
    let point_primitive = PathPrimitive::Line {
        start: point,
        end: point,
    };
    let pair = path
        .primitives()
        .iter()
        .map(|primitive| {
            primitive_distance(
                &point_primitive,
                ParameterRange::FULL,
                primitive,
                ParameterRange::FULL,
            )
        })
        .min_by(|left, right| {
            left.distance_mm
                .total_cmp(&right.distance_mm)
                .then_with(|| compare_points(left.point_on_b, right.point_on_b))
        })
        .expect("coverage distance requires a non-empty path");
    DistanceSample {
        distance_mm: pair.distance_mm,
        point,
    }
}

fn stable_max(current: Option<DistanceSample>, candidate: DistanceSample) -> DistanceSample {
    match current {
        None => candidate,
        Some(current) => match candidate.distance_mm.total_cmp(&current.distance_mm) {
            Ordering::Greater => candidate,
            Ordering::Less => current,
            Ordering::Equal => compare_points(candidate.point, current.point)
                .is_lt()
                .then_some(candidate)
                .unwrap_or(current),
        },
    }
}

fn compare_points(left: Point, right: Point) -> Ordering {
    left.x
        .total_cmp(&right.x)
        .then_with(|| left.y.total_cmp(&right.y))
}

fn triangle_area(vertices: [Point; 3]) -> f64 {
    ((vertices[1] - vertices[0]).x * (vertices[2] - vertices[0]).y
        - (vertices[1] - vertices[0]).y * (vertices[2] - vertices[0]).x)
        .abs()
        * 0.5
}

fn bisect_longest_edge(vertices: [Point; 3]) -> ([Point; 3], [Point; 3]) {
    let edges = [
        (0usize, 1usize, vertices[0].distance_to(vertices[1])),
        (1usize, 2usize, vertices[1].distance_to(vertices[2])),
        (2usize, 0usize, vertices[2].distance_to(vertices[0])),
    ];
    let mut longest = edges[0];
    for edge in edges.into_iter().skip(1) {
        if edge.2.total_cmp(&longest.2).is_gt() {
            longest = edge;
        }
    }
    let (first, second, _) = longest;
    let third = 3 - first - second;
    let midpoint = Point::new(
        (vertices[first].x + vertices[second].x) * 0.5,
        (vertices[first].y + vertices[second].y) * 0.5,
    );
    (
        [vertices[first], midpoint, vertices[third]],
        [midpoint, vertices[second], vertices[third]],
    )
}

fn coverage_limit_error(limit: usize, used: usize) -> SolverError {
    SolverError {
        code: SolverErrorCode::SolverLimitExceeded,
        message: "Coverage certification exceeded its cell budget".to_string(),
        details: BTreeMap::from([
            (
                "reason".to_string(),
                ErrorDetail::string("MAX_COVERAGE_CELLS"),
            ),
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
