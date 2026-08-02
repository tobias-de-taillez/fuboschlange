use super::graph::{
    ExactLocalBoundary, compare_points, compare_polylines, distance, polyline_length,
    publish_point, remove_consecutive_duplicates,
};
use super::{
    BuiltMedialGraph, EdgeId, MedialAxisError, MedialAxisErrorReason, MedialEdge, MedialGraph,
    MedialGraphDiagnostics, MedialNode, NodeId,
};
use crate::constants::TOPOLOGY_QUANTIZATION_MM;
use crate::geometry::{AllowedRegion, QuantizedPoint};
use crate::model::Point;
use boostvoronoi::diagram::{Diagram, SourceCategory};
use boostvoronoi::prelude::Builder;
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

const PARABOLIC_HAUSDORFF_MM: f64 = 0.05;
const MAX_FINAL_ENDPOINT_MOVEMENT_MM: f64 = TOPOLOGY_QUANTIZATION_MM;
const MAX_VORONOI_SEGMENTS: usize = 100_000;
const MAX_VORONOI_HALF_EDGES: usize = 2_000_000;
const MAX_FLATTENED_POINTS: usize = 2_000_000;
const MAX_TOTAL_RETAINED_POINTS: usize = 2_000_000;
const MAX_BOUNDARY_CLASSIFICATION_TESTS: usize = 50_000_000;
const GEOMETRY_EPSILON_MM: f64 = 1e-12;

#[doc(hidden)]
#[derive(Clone, Debug, PartialEq)]
pub struct AdapterEdgeFixture {
    pub polyline_local_mm: Vec<Point>,
    pub source_site_ids: [u32; 2],
}

#[doc(hidden)]
#[derive(Clone, Debug, PartialEq)]
pub struct ParabolicFlatteningObservation {
    pub quantization_origin: Point,
    pub points_world_mm: Vec<Point>,
    pub error_bound_mm: f64,
}

#[derive(Clone, Debug)]
pub(crate) struct RawEdge {
    pub polyline_local_mm: Vec<Point>,
    pub source_site_ids: [u32; 2],
    original_endpoints_local_mm: Option<[Point; 2]>,
    endpoint_coordinate_keys: Option<[[i64; 2]; 2]>,
}

#[derive(Clone, Debug)]
struct WorkEdge {
    polyline: Vec<Point>,
    source_site_ids: [u32; 2],
    original_endpoints: [Point; 2],
    endpoint_coordinate_keys: [[i64; 2]; 2],
}

#[derive(Clone, Copy, Debug)]
struct EndpointReference {
    edge: usize,
    start: bool,
    point: Point,
    coordinate_key: [i64; 2],
    source_site_ids: [u32; 2],
}

#[derive(Clone, Copy, Debug)]
struct Representative {
    point: Point,
    coordinate_key: [i64; 2],
    source_site_ids: [u32; 2],
}

#[doc(hidden)]
pub fn flatten_parabolic_fixture(
    quantization_origin: Point,
    focus: QuantizedPoint,
    directrix: (QuantizedPoint, QuantizedPoint),
    endpoints_quantized: [[f64; 2]; 2],
) -> Result<ParabolicFlatteningObservation, MedialAxisError> {
    let points_world_mm = flatten_parabola(focus, directrix, endpoints_quantized)?
        .into_iter()
        .map(|point| {
            publish_point(quantization_origin, point, local_coordinate_key(point)).ok_or_else(
                || MedialAxisError::degenerate(MedialAxisErrorReason::InvalidGraphPosition),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ParabolicFlatteningObservation {
        quantization_origin,
        points_world_mm,
        error_bound_mm: PARABOLIC_HAUSDORFF_MM,
    })
}

#[doc(hidden)]
pub fn adapt_parabolic_voronoi_fixture(
    allowed: &AllowedRegion,
    focus: QuantizedPoint,
    directrix: (QuantizedPoint, QuantizedPoint),
    endpoints_quantized: [[f64; 2]; 2],
    source_site_ids: [u32; 2],
) -> Result<BuiltMedialGraph, MedialAxisError> {
    let boundary = Arc::new(ExactLocalBoundary::from_allowed(allowed)?);
    let mut diagnostics = MedialGraphDiagnostics::default();
    let mut classification_work = 0usize;
    diagnostics.parabolic_edges_flattened = 1;
    let polyline_local_mm = flatten_parabola(focus, directrix, endpoints_quantized)?;
    let original_endpoints_local_mm = [
        *polyline_local_mm
            .first()
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::ZeroLengthEdge))?,
        *polyline_local_mm
            .last()
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::ZeroLengthEdge))?,
    ];
    let graph = adapt_raw_edges(
        allowed,
        vec![RawEdge {
            polyline_local_mm,
            source_site_ids,
            original_endpoints_local_mm: Some(original_endpoints_local_mm),
            endpoint_coordinate_keys: None,
        }],
        boundary,
        &mut diagnostics,
        &mut classification_work,
        true,
    )?;
    Ok(BuiltMedialGraph { graph, diagnostics })
}

#[doc(hidden)]
pub fn boundary_scan_work_fixture(
    edge_count: usize,
    helper_segment_count: usize,
) -> Result<(), MedialAxisError> {
    let endpoint_count = edge_count
        .checked_mul(4)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let mut total = 0usize;
    charge_local_boundary_scan_work(&mut total, endpoint_count, helper_segment_count)
}

#[doc(hidden)]
pub fn adapt_voronoi_fixture(
    allowed: &AllowedRegion,
    fixtures: &[AdapterEdgeFixture],
) -> Result<BuiltMedialGraph, MedialAxisError> {
    preflight_fixture_input(fixtures)?;
    let boundary = Arc::new(ExactLocalBoundary::from_allowed(allowed)?);
    let mut diagnostics = MedialGraphDiagnostics::default();
    let mut classification_work = 0usize;
    let raw = fixtures
        .iter()
        .map(|fixture| RawEdge {
            polyline_local_mm: fixture.polyline_local_mm.clone(),
            source_site_ids: fixture.source_site_ids,
            original_endpoints_local_mm: fixture
                .polyline_local_mm
                .first()
                .copied()
                .zip(fixture.polyline_local_mm.last().copied())
                .map(|(start, end)| [start, end]),
            endpoint_coordinate_keys: None,
        })
        .collect();
    let graph = adapt_raw_edges(
        allowed,
        raw,
        boundary,
        &mut diagnostics,
        &mut classification_work,
        true,
    )?;
    Ok(BuiltMedialGraph { graph, diagnostics })
}

fn preflight_fixture_input(fixtures: &[AdapterEdgeFixture]) -> Result<(), MedialAxisError> {
    if fixtures.len() > MAX_VORONOI_HALF_EDGES {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let point_count = fixtures.iter().try_fold(0usize, |total, fixture| {
        total.checked_add(fixture.polyline_local_mm.len())
    });
    if point_count.is_none_or(|points| points > MAX_TOTAL_RETAINED_POINTS) {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

pub(crate) fn build_from_allowed_region(
    allowed: &AllowedRegion,
    diagnostics: &mut MedialGraphDiagnostics,
) -> Result<MedialGraph, MedialAxisError> {
    if allowed.quantized_segments.len() > MAX_VORONOI_SEGMENTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let boundary = Arc::new(ExactLocalBoundary::from_allowed(allowed)?);
    let segments = allowed
        .quantized_segments
        .iter()
        .map(|(start, end)| [start.x, start.y, end.x, end.y])
        .collect::<Vec<_>>();
    let built = catch_unwind(AssertUnwindSafe(|| {
        Builder::<i64>::default()
            .with_segments(segments.iter())
            .and_then(Builder::build)
    }))
    .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiLibraryPanic))?;
    let diagram = built
        .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
    if diagram.num_edges() > MAX_VORONOI_HALF_EDGES {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let mut classification_work = 0usize;
    let raw = extract_finite_inside_edges(
        &boundary,
        &segments,
        &diagram,
        diagnostics,
        &mut classification_work,
    )?;
    adapt_raw_edges(
        allowed,
        raw,
        boundary,
        diagnostics,
        &mut classification_work,
        false,
    )
}

fn extract_finite_inside_edges(
    boundary: &ExactLocalBoundary,
    segments: &[[i64; 4]],
    diagram: &Diagram,
    diagnostics: &mut MedialGraphDiagnostics,
    classification_work: &mut usize,
) -> Result<Vec<RawEdge>, MedialAxisError> {
    let mut result = Vec::new();
    let mut retained_point_count = 0usize;
    for edge in diagram.edges() {
        let twin = edge
            .twin()
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        if edge.id().u32() > twin.u32() {
            continue;
        }
        if !edge.is_primary() {
            diagnostics.secondary_edges_removed += 1;
            continue;
        }
        let (Some(vertex0_id), Some(vertex1_id)) = (
            edge.vertex0(),
            diagram.edge_get_vertex1(edge.id()).map_err(|_| {
                MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure)
            })?,
        ) else {
            diagnostics.infinite_edges_removed += 1;
            continue;
        };
        let vertex0 = diagram
            .vertex(vertex0_id)
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        let vertex1 = diagram
            .vertex(vertex1_id)
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        let endpoints = [[vertex0.x(), vertex0.y()], [vertex1.x(), vertex1.y()]];
        if endpoints
            .iter()
            .flatten()
            .any(|coordinate| !coordinate.is_finite())
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }

        let cell0 = diagram
            .cell(edge.cell().map_err(|_| {
                MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure)
            })?)
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        let twin_edge = diagram
            .edge(twin)
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        let cell1 = diagram
            .cell(twin_edge.cell().map_err(|_| {
                MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure)
            })?)
            .map_err(|_| MedialAxisError::voronoi(MedialAxisErrorReason::VoronoiBuilderFailure))?;
        let source0 = cell0.source_index().usize();
        let source1 = cell1.source_index().usize();
        let mut source_site_ids = [
            u32::try_from(source0).map_err(|_| {
                MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit)
            })?,
            u32::try_from(source1).map_err(|_| {
                MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit)
            })?,
        ];
        source_site_ids.sort_unstable();

        let mut polyline_local_mm = if edge.is_curved() {
            let (focus, directrix) = parabola_sites(cell0, cell1, segments, source0, source1)?;
            diagnostics.parabolic_edges_flattened += 1;
            flatten_parabola(focus, directrix, endpoints)?
        } else {
            endpoints
                .into_iter()
                .map(|point| {
                    Point::new(
                        point[0] * TOPOLOGY_QUANTIZATION_MM,
                        point[1] * TOPOLOGY_QUANTIZATION_MM,
                    )
                })
                .collect()
        };
        let original_endpoints_local_mm = [
            *polyline_local_mm.first().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::ZeroLengthEdge)
            })?,
            *polyline_local_mm.last().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::ZeroLengthEdge)
            })?,
        ];
        charge_local_boundary_scan_work(classification_work, 4, boundary.primitive_count())?;
        let endpoint_coordinate_keys =
            snap_endpoints_to_exact_boundary(boundary, &mut polyline_local_mm)?;
        let certification =
            boundary.certify_local_polyline(&polyline_local_mm, classification_work)?;
        if !certification.contained || !certification.has_interior_sample {
            diagnostics.outside_edges_removed += 1;
            continue;
        }
        retained_point_count = retained_point_count
            .checked_add(polyline_local_mm.len())
            .ok_or_else(|| {
                MedialAxisError::resource(MedialAxisErrorReason::FlatteningResourceLimit)
            })?;
        if retained_point_count > MAX_TOTAL_RETAINED_POINTS {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::FlatteningResourceLimit,
            ));
        }
        result.push(RawEdge {
            polyline_local_mm,
            source_site_ids,
            original_endpoints_local_mm: Some(original_endpoints_local_mm),
            endpoint_coordinate_keys: Some(endpoint_coordinate_keys),
        });
    }
    Ok(result)
}

fn parabola_sites(
    cell0: &boostvoronoi::diagram::Cell,
    cell1: &boostvoronoi::diagram::Cell,
    segments: &[[i64; 4]],
    source0: usize,
    source1: usize,
) -> Result<(QuantizedPoint, (QuantizedPoint, QuantizedPoint)), MedialAxisError> {
    let (point_cell, point_source, segment_source) =
        if cell0.contains_point() && cell1.contains_segment() {
            (cell0, source0, source1)
        } else if cell1.contains_point() && cell0.contains_segment() {
            (cell1, source1, source0)
        } else {
            return Err(MedialAxisError::voronoi(
                MedialAxisErrorReason::InvalidParabolicEdge,
            ));
        };
    let point_segment = segments
        .get(point_source)
        .ok_or_else(|| MedialAxisError::voronoi(MedialAxisErrorReason::MissingSourceSite))?;
    let focus = match point_cell.source_category() {
        SourceCategory::SegmentStart => QuantizedPoint {
            x: point_segment[0],
            y: point_segment[1],
        },
        SourceCategory::SegmentEnd => QuantizedPoint {
            x: point_segment[2],
            y: point_segment[3],
        },
        SourceCategory::SinglePoint => QuantizedPoint {
            x: point_segment[0],
            y: point_segment[1],
        },
        SourceCategory::Segment => {
            return Err(MedialAxisError::voronoi(
                MedialAxisErrorReason::InvalidParabolicEdge,
            ));
        }
    };
    let directrix_segment = segments
        .get(segment_source)
        .ok_or_else(|| MedialAxisError::voronoi(MedialAxisErrorReason::MissingSourceSite))?;
    Ok((
        focus,
        (
            QuantizedPoint {
                x: directrix_segment[0],
                y: directrix_segment[1],
            },
            QuantizedPoint {
                x: directrix_segment[2],
                y: directrix_segment[3],
            },
        ),
    ))
}

fn flatten_parabola(
    focus: QuantizedPoint,
    directrix: (QuantizedPoint, QuantizedPoint),
    endpoints_quantized: [[f64; 2]; 2],
) -> Result<Vec<Point>, MedialAxisError> {
    let scale = TOPOLOGY_QUANTIZATION_MM;
    let directrix_start = Point::new(directrix.0.x as f64 * scale, directrix.0.y as f64 * scale);
    let directrix_end = Point::new(directrix.1.x as f64 * scale, directrix.1.y as f64 * scale);
    let focus = Point::new(focus.x as f64 * scale, focus.y as f64 * scale);
    let endpoint0 = Point::new(
        endpoints_quantized[0][0] * scale,
        endpoints_quantized[0][1] * scale,
    );
    let endpoint1 = Point::new(
        endpoints_quantized[1][0] * scale,
        endpoints_quantized[1][1] * scale,
    );
    if [directrix_start, directrix_end, focus, endpoint0, endpoint1]
        .iter()
        .any(|point| !point.x.is_finite() || !point.y.is_finite())
    {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::NonFiniteGeometry,
        ));
    }
    let dx = directrix_end.x - directrix_start.x;
    let dy = directrix_end.y - directrix_start.y;
    let directrix_length = dx.hypot(dy);
    if directrix_length <= GEOMETRY_EPSILON_MM {
        return Err(MedialAxisError::voronoi(
            MedialAxisErrorReason::InvalidParabolicEdge,
        ));
    }
    let ux = dx / directrix_length;
    let uy = dy / directrix_length;
    let nx = -uy;
    let ny = ux;
    let focus_dx = focus.x - directrix_start.x;
    let focus_dy = focus.y - directrix_start.y;
    let focus_x = focus_dx * ux + focus_dy * uy;
    let focus_y = focus_dx * nx + focus_dy * ny;
    if !focus_y.is_finite() || focus_y.abs() <= GEOMETRY_EPSILON_MM {
        return Err(MedialAxisError::voronoi(
            MedialAxisErrorReason::InvalidParabolicEdge,
        ));
    }
    let project_x =
        |point: Point| (point.x - directrix_start.x) * ux + (point.y - directrix_start.y) * uy;
    let project_y =
        |point: Point| (point.x - directrix_start.x) * nx + (point.y - directrix_start.y) * ny;
    let parabola_y = |x: f64| ((x - focus_x) * (x - focus_x) + focus_y * focus_y) / (2.0 * focus_y);
    let to_world = |x: f64, y: f64| {
        Point::new(
            directrix_start.x + ux * x + nx * y,
            directrix_start.y + uy * x + ny * y,
        )
    };
    let x0 = project_x(endpoint0);
    let x1 = project_x(endpoint1);
    if !x0.is_finite() || !x1.is_finite() || (x1 - x0).abs() <= GEOMETRY_EPSILON_MM {
        return Err(MedialAxisError::voronoi(
            MedialAxisErrorReason::InvalidParabolicEdge,
        ));
    }
    let endpoint_residual = (project_y(endpoint0) - parabola_y(x0))
        .abs()
        .max((project_y(endpoint1) - parabola_y(x1)).abs());
    // Every final endpoint is checked against its original Voronoi endpoint after exact-boundary
    // projection and endpoint clustering. Reserving that full cumulative movement here gives, by
    // the triangle inequality, subdivision + endpoint residual + final movement <= 0.05 mm.
    let fixed_endpoint_error_mm = endpoint_residual + MAX_FINAL_ENDPOINT_MOVEMENT_MM;
    if !fixed_endpoint_error_mm.is_finite() || fixed_endpoint_error_mm >= PARABOLIC_HAUSDORFF_MM {
        return Err(MedialAxisError::voronoi(
            MedialAxisErrorReason::InvalidParabolicEdge,
        ));
    }
    let subdivision_error_mm = PARABOLIC_HAUSDORFF_MM - fixed_endpoint_error_mm;

    let mut result = Vec::new();
    result.push(endpoint0);
    let mut stack = vec![x1];
    let mut current_x = x0;
    let mut current_y = parabola_y(current_x);
    while let Some(&next_x) = stack.last() {
        if result
            .len()
            .checked_add(stack.len())
            .is_none_or(|points| points > MAX_FLATTENED_POINTS)
        {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::FlatteningResourceLimit,
            ));
        }
        let next_y = parabola_y(next_x);
        let chord_dx = next_x - current_x;
        let chord_dy = next_y - current_y;
        let chord_length = chord_dx.hypot(chord_dy);
        if !next_y.is_finite()
            || !chord_length.is_finite()
            || chord_length <= GEOMETRY_EPSILON_MM
            || chord_dx.abs() <= GEOMETRY_EPSILON_MM
        {
            return Err(MedialAxisError::voronoi(
                MedialAxisErrorReason::InvalidParabolicEdge,
            ));
        }
        let mut split_x = chord_dy / chord_dx * focus_y + focus_x;
        let lower = current_x.min(next_x);
        let upper = current_x.max(next_x);
        if !split_x.is_finite() || split_x <= lower || split_x >= upper {
            split_x = (current_x + next_x) * 0.5;
        }
        let split_y = parabola_y(split_x);
        // Comparing at the same directrix coordinate places the comparison point on the finite
        // chord (split_x is between its endpoints). For a quadratic parabola this stationary
        // point is the exact maximum chord/parabola deviation, unlike distance to the supporting
        // line, whose perpendicular foot can lie outside a steep short chord.
        let error = ((chord_dy * (split_x - current_x) - chord_dx * (split_y - current_y))
            / chord_dx)
            .abs();
        if !error.is_finite() {
            return Err(MedialAxisError::voronoi(
                MedialAxisErrorReason::InvalidParabolicEdge,
            ));
        }
        if error <= subdivision_error_mm {
            let accepted_x = stack.pop().ok_or_else(|| {
                MedialAxisError::voronoi(MedialAxisErrorReason::InvalidParabolicEdge)
            })?;
            let point = if stack.is_empty() {
                endpoint1
            } else {
                to_world(accepted_x, parabola_y(accepted_x))
            };
            result.push(point);
            current_x = accepted_x;
            current_y = parabola_y(current_x);
        } else {
            stack.push(split_x);
        }
    }
    remove_consecutive_duplicates(&mut result);
    if result.len() < 2 {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::ZeroLengthEdge,
        ));
    }
    Ok(result)
}

fn snap_endpoints_to_exact_boundary(
    boundary: &ExactLocalBoundary,
    polyline_local_mm: &mut [Point],
) -> Result<[[i64; 2]; 2], MedialAxisError> {
    if polyline_local_mm.len() < 2 {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::ZeroLengthEdge,
        ));
    }
    let indices = [0, polyline_local_mm.len() - 1];
    let mut coordinate_keys = [
        local_coordinate_key(polyline_local_mm[indices[0]]),
        local_coordinate_key(polyline_local_mm[indices[1]]),
    ];
    for (endpoint, index) in indices.into_iter().enumerate() {
        let original = polyline_local_mm[index];
        let location = boundary.nearest_location(original)?;
        if location.distance_mm <= TOPOLOGY_QUANTIZATION_MM
            && distance(original, location.point) <= TOPOLOGY_QUANTIZATION_MM
        {
            polyline_local_mm[index] = location.point;
            coordinate_keys[endpoint] = location.coordinate_key;
        }
    }
    Ok(coordinate_keys)
}

fn adapt_raw_edges(
    allowed: &AllowedRegion,
    raw: Vec<RawEdge>,
    boundary: Arc<ExactLocalBoundary>,
    diagnostics: &mut MedialGraphDiagnostics,
    classification_work: &mut usize,
    fixture: bool,
) -> Result<MedialGraph, MedialAxisError> {
    if raw.is_empty() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EmptyGraph,
        ));
    }
    if raw.len() > MAX_VORONOI_HALF_EDGES {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let mut edges = Vec::with_capacity(raw.len());
    for raw_edge in raw {
        let original_endpoints = raw_edge.original_endpoints_local_mm;
        let mut polyline = raw_edge.polyline_local_mm;
        if polyline
            .iter()
            .any(|point| !point.x.is_finite() || !point.y.is_finite())
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        let mut original_endpoints = original_endpoints.unwrap_or_else(|| {
            let fallback = polyline.first().copied().unwrap_or(Point::new(0.0, 0.0));
            [fallback, polyline.last().copied().unwrap_or(fallback)]
        });
        let mut endpoint_coordinate_keys = raw_edge.endpoint_coordinate_keys.unwrap_or_else(|| {
            [
                local_coordinate_key(original_endpoints[0]),
                local_coordinate_key(original_endpoints[1]),
            ]
        });
        remove_consecutive_duplicates(&mut polyline);
        if polyline.len() < 2 || polyline_length(&polyline) <= GEOMETRY_EPSILON_MM {
            diagnostics.zero_length_edges_removed += 1;
            continue;
        }
        let mut source_site_ids = raw_edge.source_site_ids;
        source_site_ids.sort_unstable();
        if fixture {
            charge_local_boundary_scan_work(classification_work, 4, boundary.primitive_count())?;
            endpoint_coordinate_keys = snap_endpoints_to_exact_boundary(&boundary, &mut polyline)?;
        }
        let endpoint_order =
            local_coordinate_key(*polyline.last().unwrap_or(&Point::new(0.0, 0.0)))
                .cmp(&local_coordinate_key(
                    *polyline.first().unwrap_or(&Point::new(0.0, 0.0)),
                ))
                .then_with(|| {
                    compare_points(
                        polyline.last().unwrap_or(&Point::new(0.0, 0.0)),
                        polyline.first().unwrap_or(&Point::new(0.0, 0.0)),
                    )
                });
        if endpoint_order == Ordering::Less {
            polyline.reverse();
            original_endpoints.reverse();
            endpoint_coordinate_keys.reverse();
        }
        if fixture
            && !boundary
                .certify_local_polyline(&polyline, classification_work)?
                .contained
        {
            diagnostics.outside_edges_removed += 1;
            continue;
        }
        edges.push(WorkEdge {
            polyline,
            source_site_ids,
            original_endpoints,
            endpoint_coordinate_keys,
        });
    }
    if edges.is_empty() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EmptyGraph,
        ));
    }
    edges.sort_by(compare_work_edges);
    let before_dedup = edges.len();
    edges.dedup_by(|left, right| left.polyline == right.polyline);
    diagnostics.duplicate_edges_removed += before_dedup - edges.len();

    let (representatives, assignments) = snap_endpoints(&edges)?;
    let mut representative_order = (0..representatives.len()).collect::<Vec<_>>();
    representative_order.sort_by(|left, right| {
        local_coordinate_key(representatives[*left].point)
            .cmp(&local_coordinate_key(representatives[*right].point))
            .then_with(|| {
                representatives[*left]
                    .source_site_ids
                    .cmp(&representatives[*right].source_site_ids)
            })
            .then_with(|| {
                compare_points(
                    &representatives[*left].point,
                    &representatives[*right].point,
                )
            })
    });
    let mut node_for_representative = vec![0usize; representatives.len()];
    for (node, representative) in representative_order.iter().copied().enumerate() {
        node_for_representative[representative] = node;
    }
    let nodes = representative_order
        .iter()
        .copied()
        .enumerate()
        .map(|(index, representative)| {
            let local = representatives[representative].point;
            Ok(MedialNode {
                id: NodeId(index as u32),
                point: publish_point(
                    allowed.quantization_origin,
                    local,
                    representatives[representative].coordinate_key,
                )
                .ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::InvalidGraphPosition)
                })?,
                clearance_mm: boundary.nearest_location(local)?.distance_mm,
            })
        })
        .collect::<Result<Vec<_>, MedialAxisError>>()?;
    let node_source_ids = representative_order
        .iter()
        .map(|representative| representatives[*representative].source_site_ids)
        .collect::<Vec<_>>();
    let node_coordinate_keys = representative_order
        .iter()
        .map(|representative| representatives[*representative].coordinate_key)
        .collect::<Vec<_>>();

    let mut edge_data = Vec::with_capacity(edges.len());
    for (index, mut edge) in edges.into_iter().enumerate() {
        let start_representative = assignments[index * 2];
        let end_representative = assignments[index * 2 + 1];
        for (original, representative) in [
            (edge.original_endpoints[0], start_representative),
            (edge.original_endpoints[1], end_representative),
        ] {
            let movement = distance(original, representatives[representative].point);
            if movement > TOPOLOGY_QUANTIZATION_MM {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::TopologySnapBudgetExceeded,
                ));
            }
            if movement > 0.0 {
                diagnostics.topology_snaps += 1;
                diagnostics.max_topology_snap_mm = diagnostics.max_topology_snap_mm.max(movement);
            }
        }
        let mut a = node_for_representative[start_representative];
        let mut b = node_for_representative[end_representative];
        edge.polyline[0] = representatives[start_representative].point;
        let end_index = edge.polyline.len() - 1;
        edge.polyline[end_index] = representatives[end_representative].point;
        remove_consecutive_duplicates(&mut edge.polyline);
        if a == b
            || edge.polyline.len() < 2
            || polyline_length(&edge.polyline) <= GEOMETRY_EPSILON_MM
        {
            diagnostics.zero_length_edges_removed += 1;
            continue;
        }
        let post_snap_certification =
            boundary.certify_local_polyline(&edge.polyline, classification_work)?;
        if !post_snap_certification.contained
            || (!fixture && !post_snap_certification.has_interior_sample)
        {
            diagnostics.outside_edges_removed += 1;
            continue;
        }
        if a > b {
            std::mem::swap(&mut a, &mut b);
            edge.polyline.reverse();
        }
        let mut coordinate_keys = edge
            .polyline
            .iter()
            .copied()
            .map(local_coordinate_key)
            .collect::<Vec<_>>();
        coordinate_keys[0] = representatives[representative_order[a]].coordinate_key;
        let last_key = coordinate_keys.len() - 1;
        coordinate_keys[last_key] = representatives[representative_order[b]].coordinate_key;
        edge_data.push((a, b, edge.source_site_ids, edge.polyline, coordinate_keys));
    }
    edge_data.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.cmp(&right.1))
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| compare_polylines(&left.3, &right.3))
    });
    let before_final_dedup = edge_data.len();
    edge_data.dedup_by(|left, right| left.0 == right.0 && left.1 == right.1 && left.3 == right.3);
    diagnostics.duplicate_edges_removed += before_final_dedup - edge_data.len();
    let edge_source_ids = edge_data
        .iter()
        .map(|(_, _, source_ids, _, _)| *source_ids)
        .collect::<Vec<_>>();
    let medial_edges = edge_data
        .into_iter()
        .enumerate()
        .map(
            |(index, (a, b, _sources, local_polyline, local_coordinate_keys))| {
                let polyline = local_polyline
                    .iter()
                    .copied()
                    .zip(&local_coordinate_keys)
                    .map(|(point, key)| {
                        publish_point(allowed.quantization_origin, point, *key).ok_or_else(|| {
                            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidGraphPosition)
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(MedialEdge::with_local_polyline(
                    EdgeId(index as u32),
                    NodeId(a as u32),
                    NodeId(b as u32),
                    polyline,
                    local_polyline,
                    local_coordinate_keys,
                    allowed.quantization_origin,
                ))
            },
        )
        .collect::<Result<Vec<_>, MedialAxisError>>()?;
    let node_local_points = representative_order
        .iter()
        .map(|representative| representatives[*representative].point)
        .collect::<Vec<_>>();
    let mut graph = MedialGraph::from_parts_with_source_ids(
        nodes,
        medial_edges,
        allowed.quantization_origin,
        node_local_points,
        node_coordinate_keys,
        node_source_ids,
        edge_source_ids,
    )?;
    graph.attach_exact_local_boundary(boundary)?;
    diagnostics.collinear_nodes_collapsed += graph.collapse_collinear_nodes()?;
    graph.sort_leaves_on_boundary(allowed)?;
    graph.validate_with_local_certification_work(allowed, classification_work)?;
    Ok(graph)
}

fn snap_endpoints(
    edges: &[WorkEdge],
) -> Result<(Vec<Representative>, Vec<usize>), MedialAxisError> {
    let mut endpoints = Vec::with_capacity(edges.len() * 2);
    for (edge, item) in edges.iter().enumerate() {
        let start = *item.polyline.first().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        let end = *item.polyline.last().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        endpoints.push(EndpointReference {
            edge,
            start: true,
            point: start,
            coordinate_key: item.endpoint_coordinate_keys[0],
            source_site_ids: item.source_site_ids,
        });
        endpoints.push(EndpointReference {
            edge,
            start: false,
            point: end,
            coordinate_key: item.endpoint_coordinate_keys[1],
            source_site_ids: item.source_site_ids,
        });
    }
    endpoints.sort_by(|left, right| {
        local_coordinate_key(left.point)
            .cmp(&local_coordinate_key(right.point))
            .then_with(|| left.source_site_ids.cmp(&right.source_site_ids))
            .then_with(|| compare_points(&left.point, &right.point))
            .then_with(|| left.edge.cmp(&right.edge))
            .then_with(|| right.start.cmp(&left.start))
    });
    let mut representatives: Vec<Representative> = Vec::new();
    let mut grid: BTreeMap<(i64, i64), Vec<usize>> = BTreeMap::new();
    let mut assignments = vec![usize::MAX; edges.len() * 2];
    for endpoint in endpoints {
        let cell = grid_cell(endpoint.point)?;
        let mut best: Option<usize> = None;
        for dx in -1_i64..=1 {
            for dy in -1_i64..=1 {
                let Some(x) = cell.0.checked_add(dx) else {
                    continue;
                };
                let Some(y) = cell.1.checked_add(dy) else {
                    continue;
                };
                for candidate in grid.get(&(x, y)).into_iter().flatten().copied() {
                    if distance(endpoint.point, representatives[candidate].point)
                        <= TOPOLOGY_QUANTIZATION_MM
                        && best.is_none_or(|current| {
                            local_coordinate_key(representatives[candidate].point)
                                .cmp(&local_coordinate_key(representatives[current].point))
                                .then_with(|| {
                                    representatives[candidate]
                                        .source_site_ids
                                        .cmp(&representatives[current].source_site_ids)
                                })
                                .then_with(|| {
                                    compare_points(
                                        &representatives[candidate].point,
                                        &representatives[current].point,
                                    )
                                })
                                == Ordering::Less
                        })
                    {
                        best = Some(candidate);
                    }
                }
            }
        }
        let representative = if let Some(representative) = best {
            if endpoint.source_site_ids < representatives[representative].source_site_ids {
                representatives[representative].source_site_ids = endpoint.source_site_ids;
            }
            representative
        } else {
            let representative = representatives.len();
            representatives.push(Representative {
                point: endpoint.point,
                coordinate_key: endpoint.coordinate_key,
                source_site_ids: endpoint.source_site_ids,
            });
            grid.entry(cell).or_default().push(representative);
            representative
        };
        assignments[endpoint.edge * 2 + usize::from(!endpoint.start)] = representative;
    }
    if assignments.contains(&usize::MAX) {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::InvalidEdgeEndpoint,
        ));
    }
    Ok((representatives, assignments))
}

fn charge_local_boundary_scan_work(
    total: &mut usize,
    endpoint_count: usize,
    boundary_count: usize,
) -> Result<(), MedialAxisError> {
    let work = endpoint_count
        .checked_mul(boundary_count)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    *total = total
        .checked_add(work)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if *total > MAX_BOUNDARY_CLASSIFICATION_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn grid_cell(point: Point) -> Result<(i64, i64), MedialAxisError> {
    let coordinate = |value: f64| {
        let scaled = (value / TOPOLOGY_QUANTIZATION_MM).floor();
        if !scaled.is_finite() || scaled < i64::MIN as f64 || scaled >= i64::MAX as f64 {
            None
        } else {
            Some(scaled as i64)
        }
    };
    Ok((
        coordinate(point.x)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
        coordinate(point.y)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
    ))
}

fn compare_work_edges(left: &WorkEdge, right: &WorkEdge) -> Ordering {
    local_coordinate_key(left.polyline[0])
        .cmp(&local_coordinate_key(right.polyline[0]))
        .then_with(|| {
            local_coordinate_key(*left.polyline.last().unwrap_or(&left.polyline[0])).cmp(
                &local_coordinate_key(*right.polyline.last().unwrap_or(&right.polyline[0])),
            )
        })
        .then_with(|| left.source_site_ids.cmp(&right.source_site_ids))
        .then_with(|| compare_polylines(&left.polyline, &right.polyline))
}

fn local_coordinate_key(point: Point) -> [i64; 2] {
    [
        quantized_local_coordinate(point.x),
        quantized_local_coordinate(point.y),
    ]
}

fn quantized_local_coordinate(value: f64) -> i64 {
    let scaled = (value / TOPOLOGY_QUANTIZATION_MM).round();
    if scaled <= i64::MIN as f64 {
        i64::MIN
    } else if scaled >= i64::MAX as f64 {
        i64::MAX
    } else {
        scaled as i64
    }
}
