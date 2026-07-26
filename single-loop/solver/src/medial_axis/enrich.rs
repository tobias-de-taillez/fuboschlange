use super::graph::{
    distance, nearest_boundary_location, polyline_is_inside_allowed, polyline_length,
};
use super::{EdgeId, MedialAxisError, MedialAxisErrorReason, MedialGraph, MedialGraphDiagnostics};
use crate::geometry::{AllowedRegion, QuantizedPoint, Vec2};
use crate::model::{PathPrimitive, Point};
use std::collections::BTreeMap;

const MIN_GUIDE_HIT_ANGLE_DEGREES: f64 = 50.0;
const RAY_PARAMETER_EPSILON_MM: f64 = 1e-8;
const EDGE_PARAMETER_EPSILON: f64 = 1e-10;
const SPLIT_DISTANCE_EPSILON_MM: f64 = 1e-7;
const REFLEX_SINE_TOLERANCE: f64 = 1e-10;
const MAX_GUIDE_CANDIDATES: usize = 1_000_000;
const MAX_GUIDE_RAY_TESTS: usize = 50_000_000;
const MAX_REFLEX_PAIR_TESTS: usize = 10_000_000;

#[derive(Clone, Copy, Debug)]
struct GuideCandidate {
    boundary: LocalBoundaryLocation,
    hit_edge: EdgeId,
    hit_distance_mm: f64,
    hit_point: Point,
}

#[derive(Clone, Copy, Debug)]
struct LocalBoundaryLocation {
    offset_mm: f64,
    point: Point,
    tangent: Vec2,
    segment_index: usize,
    distance_mm: f64,
}

#[derive(Clone, Copy, Debug)]
enum LocalBoundaryPrimitive {
    Line {
        start: Point,
        end: Point,
    },
    Arc {
        start: Point,
        end: Point,
        center: Point,
        radius_mm: f64,
        sweep_rad: f64,
    },
}

#[derive(Clone, Debug)]
struct LocalBoundary {
    primitives: Vec<LocalBoundaryPrimitive>,
    prefix_lengths: Vec<f64>,
    perimeter_mm: f64,
}

impl LocalBoundaryPrimitive {
    fn start(self) -> Point {
        match self {
            Self::Line { start, .. } | Self::Arc { start, .. } => start,
        }
    }

    fn end(self) -> Point {
        match self {
            Self::Line { end, .. } | Self::Arc { end, .. } => end,
        }
    }

    fn length(self) -> f64 {
        match self {
            Self::Line { start, end } => distance(start, end),
            Self::Arc {
                radius_mm,
                sweep_rad,
                ..
            } => radius_mm * sweep_rad.abs(),
        }
    }

    fn point_at(self, parameter: f64) -> Point {
        match self {
            Self::Line { start, end } => Point::new(
                start.x + (end.x - start.x) * parameter,
                start.y + (end.y - start.y) * parameter,
            ),
            Self::Arc {
                start,
                center,
                radius_mm,
                sweep_rad,
                ..
            } => {
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let angle = start_angle + sweep_rad * parameter;
                Point::new(
                    center.x + radius_mm * angle.cos(),
                    center.y + radius_mm * angle.sin(),
                )
            }
        }
    }

    fn tangent_at(self, parameter: f64) -> Option<Vec2> {
        match self {
            Self::Line { start, end } => (end - start).normalized(),
            Self::Arc {
                start,
                center,
                sweep_rad,
                ..
            } => {
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let radial = Vec2::from_angle(start_angle + sweep_rad * parameter);
                Some(if sweep_rad >= 0.0 {
                    radial.perp_ccw()
                } else {
                    -radial.perp_ccw()
                })
            }
        }
    }

    fn nearest(self, point: Point) -> Option<(f64, Point)> {
        match self {
            Self::Line { start, end } => {
                let direction = end - start;
                let length_squared = direction.norm_squared();
                if length_squared <= 0.0 {
                    return None;
                }
                let parameter = ((point - start).dot(direction) / length_squared).clamp(0.0, 1.0);
                Some((parameter, self.point_at(parameter)))
            }
            Self::Arc {
                start,
                end,
                center,
                sweep_rad,
                ..
            } => {
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let target_angle = (point.y - center.y).atan2(point.x - center.x);
                let directed = if sweep_rad >= 0.0 {
                    (target_angle - start_angle).rem_euclid(std::f64::consts::TAU)
                } else {
                    (start_angle - target_angle).rem_euclid(std::f64::consts::TAU)
                };
                let parameter = if directed <= sweep_rad.abs() {
                    directed / sweep_rad.abs()
                } else if distance(point, start) <= distance(point, end) {
                    0.0
                } else {
                    1.0
                };
                Some((parameter, self.point_at(parameter)))
            }
        }
    }
}

fn primitive_public_start(primitive: &PathPrimitive) -> Point {
    match *primitive {
        PathPrimitive::Line { start, .. } | PathPrimitive::Arc { start, .. } => start,
    }
}

fn primitive_public_end(primitive: &PathPrimitive) -> Point {
    match *primitive {
        PathPrimitive::Line { end, .. } | PathPrimitive::Arc { end, .. } => end,
    }
}

fn corrected_local_boundary_anchor(
    allowed: &AllowedRegion,
    quantized_x: i64,
    quantized_y: i64,
    exact_public: Point,
) -> Point {
    let local = Point::new(
        quantized_x as f64 * crate::constants::TOPOLOGY_QUANTIZATION_MM,
        quantized_y as f64 * crate::constants::TOPOLOGY_QUANTIZATION_MM,
    );
    let approximate_public = Point::new(
        allowed.quantization_origin.x + local.x,
        allowed.quantization_origin.y + local.y,
    );
    let correction = exact_public - approximate_public;
    Point::new(local.x + correction.x, local.y + correction.y)
}

fn local_arc_center(
    start: Point,
    end: Point,
    radius_mm: f64,
    sweep_rad: f64,
) -> Result<Point, MedialAxisError> {
    let chord = end - start;
    let chord_length = chord.norm();
    let half_chord = chord_length * 0.5;
    if !radius_mm.is_finite()
        || radius_mm <= 0.0
        || !sweep_rad.is_finite()
        || sweep_rad == 0.0
        || half_chord > radius_mm + crate::constants::TOPOLOGY_QUANTIZATION_MM
    {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EnrichmentFailure,
        ));
    }
    let unit = chord
        .normalized()
        .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EnrichmentFailure))?;
    let height = (radius_mm * radius_mm - half_chord.min(radius_mm).powi(2)).sqrt();
    let short_sweep_side = if sweep_rad >= 0.0 { 1.0 } else { -1.0 };
    let side = if sweep_rad.abs() <= std::f64::consts::PI {
        short_sweep_side
    } else {
        -short_sweep_side
    };
    let midpoint = Point::new((start.x + end.x) * 0.5, (start.y + end.y) * 0.5);
    Ok(midpoint + unit.perp_ccw() * (height * side))
}

impl LocalBoundary {
    fn from_allowed(allowed: &AllowedRegion) -> Result<Self, MedialAxisError> {
        let first_helper = allowed
            .quantized_segments
            .first()
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EmptyBoundary))?;
        let mut helper_cursor = 0usize;
        let mut helper_anchor = first_helper.0;
        let mut primitives = Vec::with_capacity(allowed.boundary.len());
        for public_primitive in &allowed.boundary {
            let helper_start = helper_anchor;
            let expected_end = expected_quantized_boundary_anchor(
                allowed,
                helper_start,
                primitive_public_end(public_primitive),
            )?;
            if expected_end != helper_start {
                loop {
                    let helper =
                        allowed
                            .quantized_segments
                            .get(helper_cursor)
                            .ok_or_else(|| {
                                MedialAxisError::degenerate(
                                    MedialAxisErrorReason::EnrichmentFailure,
                                )
                            })?;
                    if helper.0 != helper_anchor {
                        return Err(MedialAxisError::degenerate(
                            MedialAxisErrorReason::EnrichmentFailure,
                        ));
                    }
                    helper_cursor += 1;
                    helper_anchor = helper.1;
                    if helper_anchor == expected_end {
                        break;
                    }
                }
            }
            let local_start = corrected_local_boundary_anchor(
                allowed,
                helper_start.x,
                helper_start.y,
                primitive_public_start(public_primitive),
            );
            let local_end = corrected_local_boundary_anchor(
                allowed,
                expected_end.x,
                expected_end.y,
                primitive_public_end(public_primitive),
            );
            let primitive = match *public_primitive {
                PathPrimitive::Line { .. } => LocalBoundaryPrimitive::Line {
                    start: local_start,
                    end: local_end,
                },
                PathPrimitive::Arc {
                    radius_mm,
                    sweep_rad,
                    ..
                } => LocalBoundaryPrimitive::Arc {
                    start: local_start,
                    end: local_end,
                    center: local_arc_center(local_start, local_end, radius_mm, sweep_rad)?,
                    radius_mm,
                    sweep_rad,
                },
            };
            primitives.push(primitive);
        }
        if helper_cursor != allowed.quantized_segments.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EnrichmentFailure,
            ));
        }
        Self::from_primitives(primitives)
    }

    fn from_vertices(vertices: &[Point]) -> Result<Self, MedialAxisError> {
        if vertices.len() < 3 {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyBoundary,
            ));
        }
        let segments = (0..vertices.len())
            .map(|index| [vertices[index], vertices[(index + 1) % vertices.len()]])
            .collect::<Vec<_>>();
        let primitives = segments
            .into_iter()
            .map(|[start, end]| LocalBoundaryPrimitive::Line { start, end })
            .collect();
        Self::from_primitives(primitives)
    }

    fn from_primitives(primitives: Vec<LocalBoundaryPrimitive>) -> Result<Self, MedialAxisError> {
        let mut prefix_lengths = Vec::with_capacity(primitives.len());
        let mut perimeter_mm = 0.0;
        for primitive in &primitives {
            let length = primitive.length();
            if !length.is_finite() || length <= 0.0 {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::EmptyBoundary,
                ));
            }
            prefix_lengths.push(perimeter_mm);
            perimeter_mm += length;
        }
        if primitives.is_empty() || !perimeter_mm.is_finite() || perimeter_mm <= 0.0 {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyBoundary,
            ));
        }
        Ok(Self {
            primitives,
            prefix_lengths,
            perimeter_mm,
        })
    }

    fn location_at_offset(&self, offset_mm: f64) -> Result<LocalBoundaryLocation, MedialAxisError> {
        let offset = offset_mm.rem_euclid(self.perimeter_mm);
        for (index, primitive) in self.primitives.iter().copied().enumerate() {
            let start = self.prefix_lengths[index];
            let length = primitive.length();
            if offset <= start + length || index + 1 == self.primitives.len() {
                let parameter = ((offset - start) / length).clamp(0.0, 1.0);
                let tangent = primitive.tangent_at(parameter).ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::BoundaryProjectionFailed)
                })?;
                return Ok(LocalBoundaryLocation {
                    offset_mm: start + length * parameter,
                    point: primitive.point_at(parameter),
                    tangent,
                    segment_index: index,
                    distance_mm: 0.0,
                });
            }
        }
        Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::BoundaryProjectionFailed,
        ))
    }

    fn backward_run_is_linear(
        &self,
        allowed: &AllowedRegion,
        start_offset_mm: f64,
        end_offset_mm: f64,
    ) -> bool {
        let start = end_offset_mm.rem_euclid(self.perimeter_mm);
        let mut end = start_offset_mm.rem_euclid(self.perimeter_mm);
        if end < start {
            end += self.perimeter_mm;
        }
        for lap in 0..=1 {
            let lap_offset = lap as f64 * self.perimeter_mm;
            for (index, primitive) in self.primitives.iter().copied().enumerate() {
                let segment_start = self.prefix_lengths[index] + lap_offset;
                let segment_end = segment_start + primitive.length();
                if segment_end > start + SPLIT_DISTANCE_EPSILON_MM
                    && segment_start < end - SPLIT_DISTANCE_EPSILON_MM
                    && (!matches!(primitive, LocalBoundaryPrimitive::Line { .. })
                        || !matches!(allowed.boundary[index], PathPrimitive::Line { .. }))
                {
                    return false;
                }
            }
        }
        true
    }

    fn backward_run(
        &self,
        start_offset_mm: f64,
        end_offset_mm: f64,
    ) -> Result<Vec<Point>, MedialAxisError> {
        let mut forward = self.forward_run(end_offset_mm, start_offset_mm)?;
        forward.reverse();
        Ok(forward)
    }

    fn forward_run(
        &self,
        start_offset_mm: f64,
        end_offset_mm: f64,
    ) -> Result<Vec<Point>, MedialAxisError> {
        let start = start_offset_mm.rem_euclid(self.perimeter_mm);
        let mut end = end_offset_mm.rem_euclid(self.perimeter_mm);
        if end < start {
            end += self.perimeter_mm;
        }
        let mut result = vec![self.location_at_offset(start)?.point];
        for lap in 0..=1 {
            let lap_offset = lap as f64 * self.perimeter_mm;
            for (index, primitive) in self.primitives.iter().copied().enumerate() {
                let vertex_offset = self.prefix_lengths[index] + primitive.length() + lap_offset;
                if vertex_offset > start + SPLIT_DISTANCE_EPSILON_MM
                    && vertex_offset < end - SPLIT_DISTANCE_EPSILON_MM
                {
                    result.push(primitive.end());
                }
            }
        }
        result.push(self.location_at_offset(end)?.point);
        remove_adjacent_face_duplicates(&mut result);
        Ok(result)
    }

    fn nearest_location(&self, point: Point) -> Result<LocalBoundaryLocation, MedialAxisError> {
        let mut best: Option<LocalBoundaryLocation> = None;
        for (index, primitive) in self.primitives.iter().copied().enumerate() {
            let Some((parameter, candidate)) = primitive.nearest(point) else {
                continue;
            };
            let candidate_distance = distance(point, candidate);
            let location = LocalBoundaryLocation {
                offset_mm: self.prefix_lengths[index] + primitive.length() * parameter,
                point: candidate,
                tangent: primitive.tangent_at(parameter).ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::BoundaryProjectionFailed)
                })?,
                segment_index: index,
                distance_mm: candidate_distance,
            };
            if best.as_ref().is_none_or(|current| {
                candidate_distance < current.distance_mm
                    || (candidate_distance == current.distance_mm
                        && location.offset_mm < current.offset_mm)
            }) {
                best = Some(location);
            }
        }
        best.ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EmptyBoundary))
    }
}

fn align_local_boundary_location_to_exact(
    graph: &MedialGraph,
    allowed: &AllowedRegion,
    mut location: LocalBoundaryLocation,
) -> Result<LocalBoundaryLocation, MedialAxisError> {
    let approximate_public = graph.restore_local_point(location.point);
    let exact = nearest_boundary_location(allowed, approximate_public)?;
    let correction = exact.point - approximate_public;
    location.point = Point::new(
        location.point.x + correction.x,
        location.point.y + correction.y,
    );
    Ok(location)
}

fn expected_quantized_boundary_anchor(
    allowed: &AllowedRegion,
    reference: QuantizedPoint,
    exact_public: Point,
) -> Result<QuantizedPoint, MedialAxisError> {
    let scale = crate::constants::TOPOLOGY_QUANTIZATION_MM;
    let reference_local = Point::new(reference.x as f64 * scale, reference.y as f64 * scale);
    let reference_public = Point::new(
        allowed.quantization_origin.x + reference_local.x,
        allowed.quantization_origin.y + reference_local.y,
    );
    let delta = exact_public - reference_public;
    let quantized_delta = |value: f64| -> Result<i64, MedialAxisError> {
        let value = (value / scale).round();
        if !value.is_finite() || value < i64::MIN as f64 || value >= i64::MAX as f64 {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }
        Ok(value as i64)
    };
    Ok(QuantizedPoint {
        x: reference
            .x
            .checked_add(quantized_delta(delta.x)?)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
        y: reference
            .y
            .checked_add(quantized_delta(delta.y)?)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
    })
}

#[derive(Clone, Copy, Debug)]
struct RayHit {
    edge: EdgeId,
    edge_distance_mm: f64,
    point: Point,
    angle_degrees: f64,
    ray_distance_mm: f64,
}

#[doc(hidden)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GuideHitObservation {
    pub edge: EdgeId,
    pub point: Point,
    pub angle_degrees: f64,
    pub ray_distance_mm: f64,
}

#[doc(hidden)]
pub fn guide_interval_count_fixture(
    run_length_mm: f64,
    guide_spacing_mm: f64,
) -> Result<usize, MedialAxisError> {
    guide_interval_count(run_length_mm, guide_spacing_mm)
}

#[doc(hidden)]
pub fn first_guide_hit_fixture(
    graph: &MedialGraph,
    origin: Point,
    direction: Vec2,
) -> Option<GuideHitObservation> {
    first_graph_hit(graph, origin, direction).map(|hit| GuideHitObservation {
        edge: hit.edge,
        point: hit.point,
        angle_degrees: hit.angle_degrees,
        ray_distance_mm: hit.ray_distance_mm,
    })
}

#[doc(hidden)]
pub fn guide_hit_angle_is_accepted_fixture(angle_degrees: f64) -> bool {
    guide_hit_angle_is_accepted(angle_degrees)
}

#[doc(hidden)]
pub fn reflex_faces_allow_replacement_fixture(first_face: &[Point], second_face: &[Point]) -> bool {
    reflex_faces_allow_replacement(first_face, second_face)
}

#[doc(hidden)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReflexReplacementObservation {
    pub selected_branch_faces_convex: [bool; 2],
    pub complete_faces_convex: [bool; 2],
    pub accepted: bool,
    pub candidate_count_after: usize,
    pub rejected_replacements: usize,
}

#[doc(hidden)]
pub fn reflex_work_budget_fixture(
    candidate_count: usize,
    graph_segment_count: usize,
    boundary_count: usize,
) -> Result<(), MedialAxisError> {
    let work = candidate_count
        .checked_mul(graph_segment_count)
        .and_then(|work| work.checked_mul(boundary_count))
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if work > MAX_REFLEX_PAIR_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn local_graph_segment_count(graph: &MedialGraph) -> Result<usize, MedialAxisError> {
    graph
        .edges
        .iter()
        .try_fold(0usize, |total, edge| {
            graph
                .local_edge_polyline(edge.id)
                .and_then(|polyline| total.checked_add(polyline.len().saturating_sub(1)))
        })
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))
}

#[doc(hidden)]
pub fn reflex_replacement_decision_fixture(
    graph: &MedialGraph,
    boundary_vertices_local_mm: &[Point],
    candidate_offsets_mm: &[f64],
) -> Result<ReflexReplacementObservation, MedialAxisError> {
    let boundary = LocalBoundary::from_vertices(boundary_vertices_local_mm)?;
    reflex_work_budget_fixture(
        candidate_offsets_mm.len(),
        local_graph_segment_count(graph)?,
        1,
    )?;
    let mut candidates = Vec::with_capacity(candidate_offsets_mm.len());
    for offset in candidate_offsets_mm {
        let location = boundary.location_at_offset(*offset)?;
        let inward =
            location.tangent.perp_ccw().normalized().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::EnrichmentFailure)
            })?;
        let hit = first_graph_hit(graph, location.point, inward)
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EnrichmentFailure))?;
        if !guide_hit_angle_is_accepted(hit.angle_degrees) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EnrichmentFailure,
            ));
        }
        candidates.push(GuideCandidate {
            boundary: location,
            hit_edge: hit.edge,
            hit_distance_mm: hit.edge_distance_mm,
            hit_point: hit.point,
        });
    }
    let mut diagnostics = MedialGraphDiagnostics::default();
    let evaluations = replace_reflex_double_guides_on_boundary(
        graph,
        None,
        &boundary,
        &mut candidates,
        &mut diagnostics,
    )?;
    let evaluation = evaluations
        .first()
        .copied()
        .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EnrichmentFailure))?;
    Ok(ReflexReplacementObservation {
        selected_branch_faces_convex: evaluation.selected_branch_faces_convex,
        complete_faces_convex: evaluation.complete_faces_convex,
        accepted: evaluation.accepted,
        candidate_count_after: candidates.len(),
        rejected_replacements: diagnostics.nonconvex_reflex_replacements_rejected,
    })
}

pub(crate) fn enrich_medial_graph(
    graph: &mut MedialGraph,
    allowed: &AllowedRegion,
    guide_spacing_mm: f64,
    diagnostics: &mut MedialGraphDiagnostics,
) -> Result<(), MedialAxisError> {
    graph.sort_leaves_on_boundary(allowed)?;
    let local_boundary = LocalBoundary::from_allowed(allowed)?;
    let perimeter = local_boundary.perimeter_mm;
    let leaf_location_work = graph
        .leaves
        .len()
        .checked_mul(local_boundary.primitives.len())
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if leaf_location_work > MAX_GUIDE_RAY_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let mut leaf_locations = Vec::with_capacity(graph.leaves.len());
    for leaf in &graph.leaves {
        let point = graph
            .local_node_point(*leaf)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
        leaf_locations.push(local_boundary.nearest_location(point)?);
    }
    leaf_locations.sort_by(|left, right| left.offset_mm.total_cmp(&right.offset_mm));
    if leaf_locations.len() < 2 {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EmptyGraph,
        ));
    }

    let graph_segment_count = graph
        .edges
        .iter()
        .try_fold(0usize, |total, edge| {
            total.checked_add(edge.polyline.len().saturating_sub(1))
        })
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let boundary_work_per_candidate = allowed
        .boundary
        .len()
        .checked_mul(5)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let work_per_candidate = graph_segment_count
        .checked_add(boundary_work_per_candidate)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let mut candidates = Vec::new();
    for index in 0..leaf_locations.len() {
        let start = leaf_locations[index].offset_mm;
        let end = if index + 1 < leaf_locations.len() {
            leaf_locations[index + 1].offset_mm
        } else {
            leaf_locations[0].offset_mm + perimeter
        };
        let run_length = end - start;
        if run_length <= guide_spacing_mm {
            continue;
        }
        let intervals = guide_interval_count(run_length, guide_spacing_mm)?;
        if candidates
            .len()
            .checked_add(intervals.saturating_sub(1))
            .is_none_or(|total| total > MAX_GUIDE_CANDIDATES)
        {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }
        for interval in 1..intervals {
            diagnostics.guide_candidates += 1;
            let ray_tests = diagnostics
                .guide_candidates
                .checked_mul(work_per_candidate)
                .ok_or_else(|| {
                    MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit)
                })?;
            if ray_tests > MAX_GUIDE_RAY_TESTS {
                return Err(MedialAxisError::resource(
                    MedialAxisErrorReason::GraphResourceLimit,
                ));
            }
            let offset = start + run_length * interval as f64 / intervals as f64;
            let boundary = align_local_boundary_location_to_exact(
                graph,
                allowed,
                local_boundary.location_at_offset(offset)?,
            )?;
            let inward = boundary.tangent.perp_ccw().normalized().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::EnrichmentFailure)
            })?;
            let Some(hit) = first_graph_hit(graph, boundary.point, inward) else {
                continue;
            };
            if !guide_hit_angle_is_accepted(hit.angle_degrees) {
                diagnostics.low_angle_guides_rejected += 1;
                continue;
            }
            let branch = [
                graph.restore_local_point(boundary.point),
                graph.restore_local_point(hit.point),
            ];
            if !polyline_is_inside_allowed(&branch, allowed) {
                continue;
            }
            candidates.push(GuideCandidate {
                boundary,
                hit_edge: hit.edge,
                hit_distance_mm: hit.edge_distance_mm,
                hit_point: hit.point,
            });
        }
    }

    replace_reflex_double_guides(
        graph,
        allowed,
        &local_boundary,
        &mut candidates,
        diagnostics,
    )?;
    if candidates.is_empty() {
        return Ok(());
    }
    candidates.sort_by(|left, right| {
        left.boundary
            .offset_mm
            .total_cmp(&right.boundary.offset_mm)
            .then_with(|| left.hit_edge.cmp(&right.hit_edge))
            .then_with(|| left.hit_distance_mm.total_cmp(&right.hit_distance_mm))
    });
    candidates.dedup_by(|left, right| {
        distance(left.boundary.point, right.boundary.point) <= SPLIT_DISTANCE_EPSILON_MM
            && distance(left.hit_point, right.hit_point) <= SPLIT_DISTANCE_EPSILON_MM
    });

    let mut splits: BTreeMap<EdgeId, Vec<f64>> = BTreeMap::new();
    for candidate in &candidates {
        let edge_length = graph
            .local_edge_length(candidate.hit_edge)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
        if candidate.hit_distance_mm > SPLIT_DISTANCE_EPSILON_MM
            && candidate.hit_distance_mm < edge_length - SPLIT_DISTANCE_EPSILON_MM
        {
            splits
                .entry(candidate.hit_edge)
                .or_default()
                .push(candidate.hit_distance_mm);
        }
    }
    for distances in splits.values_mut() {
        distances.sort_by(f64::total_cmp);
        distances.dedup_by(|left, right| (*left - *right).abs() <= SPLIT_DISTANCE_EPSILON_MM);
    }

    let additional_capacity = candidates
        .len()
        .checked_mul(2)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let capacity = graph
        .edges
        .len()
        .checked_add(additional_capacity)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let mut polylines = Vec::with_capacity(capacity);
    let mut source_ids = Vec::with_capacity(capacity);
    for edge in &graph.edges {
        let edge_source_ids = graph
            .edge_source_ids(edge.id)
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeId))?;
        let mut cuts = Vec::new();
        cuts.push(0.0);
        if let Some(edge_splits) = splits.get(&edge.id) {
            cuts.extend(edge_splits.iter().copied());
        }
        let edge_length = graph
            .local_edge_length(edge.id)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
        cuts.push(edge_length);
        for pair in cuts.windows(2) {
            if pair[1] - pair[0] > SPLIT_DISTANCE_EPSILON_MM {
                polylines.push(graph.local_polyline_slice(edge.id, pair[0], pair[1])?);
                source_ids.push(edge_source_ids);
            }
        }
    }
    for candidate in &candidates {
        let edge = graph
            .local_edge_polyline(candidate.hit_edge)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
        let edge_length = polyline_length(edge);
        let hit_point = if candidate.hit_distance_mm <= SPLIT_DISTANCE_EPSILON_MM {
            *edge.first().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?
        } else if candidate.hit_distance_mm >= edge_length - SPLIT_DISTANCE_EPSILON_MM {
            *edge.last().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?
        } else {
            graph.local_point_at_distance(candidate.hit_edge, candidate.hit_distance_mm)?
        };
        if distance(candidate.boundary.point, hit_point) > SPLIT_DISTANCE_EPSILON_MM {
            polylines.push(vec![candidate.boundary.point, hit_point]);
            source_ids.push(guide_source_ids(candidate.boundary));
        }
    }
    graph.replace_with_local_polylines(allowed, &polylines, &source_ids)?;
    graph.validate(allowed)?;
    diagnostics.guide_branches_added += candidates.len();
    Ok(())
}

fn guide_interval_count(
    run_length_mm: f64,
    guide_spacing_mm: f64,
) -> Result<usize, MedialAxisError> {
    if !run_length_mm.is_finite() || !guide_spacing_mm.is_finite() || guide_spacing_mm <= 0.0 {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::NonPositiveGuideSpacing,
        ));
    }
    let intervals = (run_length_mm / guide_spacing_mm).ceil();
    if !intervals.is_finite()
        || intervals < 0.0
        || intervals > MAX_GUIDE_CANDIDATES.saturating_add(1) as f64
    {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(intervals as usize)
}

fn guide_hit_angle_is_accepted(angle_degrees: f64) -> bool {
    angle_degrees.is_finite() && angle_degrees > MIN_GUIDE_HIT_ANGLE_DEGREES
}

fn first_graph_hit(graph: &MedialGraph, origin: Point, direction: Vec2) -> Option<RayHit> {
    let mut best: Option<RayHit> = None;
    for edge in &graph.edges {
        let polyline = graph.local_edge_polyline(edge.id)?;
        for (segment_index, pair) in polyline.windows(2).enumerate() {
            let segment = pair[1] - pair[0];
            let denominator = cross(direction, segment);
            if denominator.abs() <= f64::EPSILON * 64.0 {
                continue;
            }
            let delta = pair[0] - origin;
            let ray_distance = cross(delta, segment) / denominator;
            let segment_parameter = cross(delta, direction) / denominator;
            if ray_distance <= RAY_PARAMETER_EPSILON_MM
                || !(-EDGE_PARAMETER_EPSILON..=1.0 + EDGE_PARAMETER_EPSILON)
                    .contains(&segment_parameter)
            {
                continue;
            }
            let segment_parameter = segment_parameter.clamp(0.0, 1.0);
            let point = if segment_parameter <= EDGE_PARAMETER_EPSILON {
                pair[0]
            } else if segment_parameter >= 1.0 - EDGE_PARAMETER_EPSILON {
                pair[1]
            } else {
                Point::new(
                    pair[0].x + segment.x * segment_parameter,
                    pair[0].y + segment.y * segment_parameter,
                )
            };
            let Some(segment_direction) = segment.normalized() else {
                continue;
            };
            let angle_degrees = direction
                .dot(segment_direction)
                .abs()
                .clamp(0.0, 1.0)
                .acos()
                .to_degrees();
            let hit = RayHit {
                edge: edge.id,
                edge_distance_mm: graph.local_distance_at_segment_parameter(
                    edge.id,
                    segment_index,
                    segment_parameter,
                )?,
                point,
                angle_degrees,
                ray_distance_mm: ray_distance,
            };
            if best.is_none_or(|current| {
                hit.ray_distance_mm < current.ray_distance_mm - SPLIT_DISTANCE_EPSILON_MM
                    || ((hit.ray_distance_mm - current.ray_distance_mm).abs()
                        <= SPLIT_DISTANCE_EPSILON_MM
                        && (
                            hit.edge,
                            hit.edge_distance_mm.total_cmp(&current.edge_distance_mm),
                        ) < (current.edge, std::cmp::Ordering::Equal))
            }) {
                best = Some(hit);
            }
        }
    }
    best
}

#[derive(Clone, Copy, Debug)]
struct ReflexEvaluation {
    selected_branch_faces_convex: [bool; 2],
    complete_faces_convex: [bool; 2],
    accepted: bool,
}

#[derive(Clone, Copy, Debug)]
struct AcceptedReflex {
    previous_candidate: usize,
    next_candidate: usize,
    replacement_index: usize,
    evaluation_index: usize,
    corner_offset: f64,
    corner: Point,
    hit: RayHit,
}

fn replace_reflex_double_guides(
    graph: &MedialGraph,
    allowed: &AllowedRegion,
    boundary: &LocalBoundary,
    candidates: &mut Vec<GuideCandidate>,
    diagnostics: &mut MedialGraphDiagnostics,
) -> Result<Vec<ReflexEvaluation>, MedialAxisError> {
    replace_reflex_double_guides_on_boundary(
        graph,
        Some(allowed),
        boundary,
        candidates,
        diagnostics,
    )
}

fn replace_reflex_double_guides_on_boundary(
    graph: &MedialGraph,
    allowed: Option<&AllowedRegion>,
    boundary: &LocalBoundary,
    candidates: &mut Vec<GuideCandidate>,
    diagnostics: &mut MedialGraphDiagnostics,
) -> Result<Vec<ReflexEvaluation>, MedialAxisError> {
    if candidates.len() < 2 || boundary.primitives.len() < 2 {
        return Ok(Vec::new());
    }
    let graph_segment_count = local_graph_segment_count(graph)?;
    let graph_path_work = graph
        .nodes
        .len()
        .checked_add(graph.edges.len())
        .and_then(|work| work.checked_add(graph_segment_count))
        .and_then(|work| work.checked_mul(16))
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let work_per_boundary = candidates
        .len()
        .checked_mul(2)
        .and_then(|work| work.checked_add(graph_segment_count))
        .and_then(|work| work.checked_add(graph_path_work))
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let pair_tests = work_per_boundary
        .checked_mul(boundary.primitives.len())
        .and_then(|work| {
            graph
                .leaves
                .len()
                .checked_mul(boundary.primitives.len())
                .and_then(|leaf_work| work.checked_add(leaf_work))
        })
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if pair_tests > MAX_REFLEX_PAIR_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }

    let local_graph = graph.local_geometry_copy()?;
    let leaf_anchors = graph_leaf_anchors(graph, boundary)?;
    let mut replacements = Vec::new();
    let mut accepted_reflexes = Vec::new();
    let mut removed = vec![false; candidates.len()];
    let mut evaluations = Vec::new();

    for next_index in 0..boundary.primitives.len() {
        let previous_index =
            (next_index + boundary.primitives.len() - 1) % boundary.primitives.len();
        let previous_tangent = boundary.primitives[previous_index].tangent_at(1.0);
        let next_tangent = boundary.primitives[next_index].tangent_at(0.0);
        let (Some(previous_tangent), Some(next_tangent)) = (previous_tangent, next_tangent) else {
            continue;
        };
        if cross(previous_tangent, next_tangent) >= -REFLEX_SINE_TOLERANCE {
            continue;
        }
        if let Some(allowed) = allowed {
            if !matches!(allowed.boundary[previous_index], PathPrimitive::Line { .. })
                || !matches!(allowed.boundary[next_index], PathPrimitive::Line { .. })
            {
                continue;
            }
        }
        let corner = boundary.primitives[next_index].start();
        let corner_offset = boundary.prefix_lengths[next_index];
        let previous_candidate = candidates
            .iter()
            .copied()
            .enumerate()
            .filter(|(index, candidate)| {
                !removed[*index] && candidate.boundary.segment_index == previous_index
            })
            .min_by(|(_, left), (_, right)| {
                boundary_backward_distance(boundary, corner_offset, left.boundary.offset_mm)
                    .total_cmp(&boundary_backward_distance(
                        boundary,
                        corner_offset,
                        right.boundary.offset_mm,
                    ))
            });
        let next_candidate = candidates
            .iter()
            .copied()
            .enumerate()
            .filter(|(index, candidate)| {
                !removed[*index] && candidate.boundary.segment_index == next_index
            })
            .min_by(|(_, left), (_, right)| {
                boundary_forward_distance(boundary, corner_offset, left.boundary.offset_mm)
                    .total_cmp(&boundary_forward_distance(
                        boundary,
                        corner_offset,
                        right.boundary.offset_mm,
                    ))
            });
        let (
            Some((previous_candidate_index, previous_candidate)),
            Some((next_candidate_index, next_candidate)),
        ) = (previous_candidate, next_candidate)
        else {
            continue;
        };
        diagnostics.reflex_double_branch_candidates += 1;

        let Some(bisector) = (previous_tangent.perp_ccw() + next_tangent.perp_ccw()).normalized()
        else {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            continue;
        };
        let Some(hit) = first_graph_hit(graph, corner, bisector) else {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            continue;
        };
        if !guide_hit_angle_is_accepted(hit.angle_degrees) {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            continue;
        }

        let selected_faces = assemble_selected_branch_faces(
            &local_graph,
            corner,
            previous_candidate,
            next_candidate,
            hit,
        )?;
        let selected_branch_faces_convex = [
            is_convex_face(&selected_faces[0]),
            is_convex_face(&selected_faces[1]),
        ];
        let retained_neighbors = retained_face_neighbors(
            boundary,
            corner_offset,
            &leaf_anchors,
            candidates,
            &removed,
            previous_candidate_index,
            next_candidate_index,
            &replacements,
            None,
        );
        let Some((previous_neighbor, next_neighbor)) = retained_neighbors else {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            evaluations.push(ReflexEvaluation {
                selected_branch_faces_convex,
                complete_faces_convex: [false, false],
                accepted: false,
            });
            continue;
        };
        if let Some(allowed) = allowed {
            if !boundary.backward_run_is_linear(
                allowed,
                corner_offset,
                previous_neighbor.boundary.offset_mm,
            ) || !boundary.backward_run_is_linear(
                allowed,
                next_neighbor.boundary.offset_mm,
                corner_offset,
            ) {
                diagnostics.nonconvex_reflex_replacements_rejected += 1;
                evaluations.push(ReflexEvaluation {
                    selected_branch_faces_convex,
                    complete_faces_convex: [false, false],
                    accepted: false,
                });
                continue;
            }
        }
        let complete_faces = match assemble_complete_faces(
            &local_graph,
            boundary,
            corner_offset,
            corner,
            previous_neighbor,
            next_neighbor,
            hit,
        ) {
            Ok(faces) => faces,
            Err(error @ MedialAxisError::ResourceLimit { .. }) => return Err(error),
            Err(_) => {
                diagnostics.nonconvex_reflex_replacements_rejected += 1;
                evaluations.push(ReflexEvaluation {
                    selected_branch_faces_convex,
                    complete_faces_convex: [false, false],
                    accepted: false,
                });
                continue;
            }
        };
        let complete_faces_convex = [
            is_convex_face(&complete_faces[0]),
            is_convex_face(&complete_faces[1]),
        ];
        let mut accepted = complete_faces_convex == [true, true];
        if accepted {
            if let Some(allowed) = allowed {
                let branch = [
                    graph.restore_local_point(corner),
                    graph.restore_local_point(hit.point),
                ];
                accepted = polyline_is_inside_allowed(&branch, allowed);
            }
        }
        let evaluation_index = evaluations.len();
        evaluations.push(ReflexEvaluation {
            selected_branch_faces_convex,
            complete_faces_convex,
            accepted,
        });
        if !accepted {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            continue;
        }

        removed[previous_candidate_index] = true;
        removed[next_candidate_index] = true;
        let replacement_index = replacements.len();
        replacements.push(GuideCandidate {
            boundary: LocalBoundaryLocation {
                offset_mm: corner_offset,
                point: corner,
                tangent: previous_tangent,
                segment_index: next_index,
                distance_mm: 0.0,
            },
            hit_edge: hit.edge,
            hit_distance_mm: hit.edge_distance_mm,
            hit_point: hit.point,
        });
        accepted_reflexes.push(AcceptedReflex {
            previous_candidate: previous_candidate_index,
            next_candidate: next_candidate_index,
            replacement_index,
            evaluation_index,
            corner_offset,
            corner,
            hit,
        });
    }

    let mut final_faces_certified = true;
    for accepted in &accepted_reflexes {
        let neighbors = retained_face_neighbors(
            boundary,
            accepted.corner_offset,
            &leaf_anchors,
            candidates,
            &removed,
            accepted.previous_candidate,
            accepted.next_candidate,
            &replacements,
            Some(accepted.replacement_index),
        );
        let Some((previous_neighbor, next_neighbor)) = neighbors else {
            final_faces_certified = false;
            break;
        };
        if let Some(allowed) = allowed {
            if !boundary.backward_run_is_linear(
                allowed,
                accepted.corner_offset,
                previous_neighbor.boundary.offset_mm,
            ) || !boundary.backward_run_is_linear(
                allowed,
                next_neighbor.boundary.offset_mm,
                accepted.corner_offset,
            ) {
                final_faces_certified = false;
                break;
            }
        }
        let faces = match assemble_complete_faces(
            &local_graph,
            boundary,
            accepted.corner_offset,
            accepted.corner,
            previous_neighbor,
            next_neighbor,
            accepted.hit,
        ) {
            Ok(faces) => faces,
            Err(error @ MedialAxisError::ResourceLimit { .. }) => return Err(error),
            Err(_) => {
                final_faces_certified = false;
                break;
            }
        };
        let convexity = [is_convex_face(&faces[0]), is_convex_face(&faces[1])];
        evaluations[accepted.evaluation_index].complete_faces_convex = convexity;
        if convexity != [true, true] {
            final_faces_certified = false;
            break;
        }
    }
    if final_faces_certified {
        diagnostics.reflex_double_branches_replaced += accepted_reflexes.len();
    } else {
        diagnostics.nonconvex_reflex_replacements_rejected += accepted_reflexes.len();
        for accepted in &accepted_reflexes {
            evaluations[accepted.evaluation_index].accepted = false;
        }
        removed.fill(false);
        replacements.clear();
    }

    let mut retained = candidates
        .iter()
        .copied()
        .enumerate()
        .filter_map(|(index, candidate)| (!removed[index]).then_some(candidate))
        .collect::<Vec<_>>();
    retained.extend(replacements);
    *candidates = retained;
    Ok(evaluations)
}

fn graph_leaf_anchors(
    graph: &MedialGraph,
    boundary: &LocalBoundary,
) -> Result<Vec<GuideCandidate>, MedialAxisError> {
    let mut anchors = Vec::with_capacity(graph.leaves.len());
    for leaf in &graph.leaves {
        let incident = graph
            .ccw_edges
            .get(leaf.index())
            .and_then(|edges| (edges.len() == 1).then_some(edges[0]))
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::LeafNotOnBoundary))?;
        let edge = graph
            .edges
            .get(incident.index())
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
        let hit_point = graph
            .local_node_point(*leaf)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
        let edge_length = graph
            .local_edge_length(incident)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
        anchors.push(GuideCandidate {
            boundary: boundary.nearest_location(hit_point)?,
            hit_edge: incident,
            hit_distance_mm: if edge.a == *leaf { 0.0 } else { edge_length },
            hit_point,
        });
    }
    Ok(anchors)
}

fn retained_face_neighbors(
    boundary: &LocalBoundary,
    corner_offset: f64,
    leaves: &[GuideCandidate],
    candidates: &[GuideCandidate],
    removed: &[bool],
    previous_candidate: usize,
    next_candidate: usize,
    replacements: &[GuideCandidate],
    excluded_replacement: Option<usize>,
) -> Option<(GuideCandidate, GuideCandidate)> {
    let anchors = leaves
        .iter()
        .copied()
        .chain(
            candidates
                .iter()
                .copied()
                .enumerate()
                .filter_map(|(index, candidate)| {
                    (!removed[index] && index != previous_candidate && index != next_candidate)
                        .then_some(candidate)
                }),
        )
        .chain(
            replacements
                .iter()
                .copied()
                .enumerate()
                .filter_map(|(index, replacement)| {
                    (Some(index) != excluded_replacement).then_some(replacement)
                }),
        )
        .collect::<Vec<_>>();
    let previous = anchors.iter().copied().min_by(|left, right| {
        boundary_backward_distance(boundary, corner_offset, left.boundary.offset_mm).total_cmp(
            &boundary_backward_distance(boundary, corner_offset, right.boundary.offset_mm),
        )
    })?;
    let next = anchors.iter().copied().min_by(|left, right| {
        boundary_forward_distance(boundary, corner_offset, left.boundary.offset_mm).total_cmp(
            &boundary_forward_distance(boundary, corner_offset, right.boundary.offset_mm),
        )
    })?;
    if distance(previous.boundary.point, next.boundary.point) <= SPLIT_DISTANCE_EPSILON_MM {
        None
    } else {
        Some((previous, next))
    }
}

fn boundary_backward_distance(boundary: &LocalBoundary, from: f64, to: f64) -> f64 {
    (from - to).rem_euclid(boundary.perimeter_mm)
}

fn boundary_forward_distance(boundary: &LocalBoundary, from: f64, to: f64) -> f64 {
    (to - from).rem_euclid(boundary.perimeter_mm)
}

fn assemble_selected_branch_faces(
    graph: &MedialGraph,
    corner: Point,
    previous: GuideCandidate,
    next: GuideCandidate,
    hit: RayHit,
) -> Result<[Vec<Point>; 2], MedialAxisError> {
    let previous_to_bisector = graph.polyline_between_edge_positions(
        previous.hit_edge,
        previous.hit_distance_mm,
        hit.edge,
        hit.edge_distance_mm,
    )?;
    let bisector_to_next = graph.polyline_between_edge_positions(
        hit.edge,
        hit.edge_distance_mm,
        next.hit_edge,
        next.hit_distance_mm,
    )?;
    let mut first = vec![previous.boundary.point, previous.hit_point];
    append_face_path(&mut first, &previous_to_bisector);
    first.push(corner);
    finish_face(&mut first);
    let mut second = vec![corner, hit.point];
    append_face_path(&mut second, &bisector_to_next);
    second.push(next.boundary.point);
    finish_face(&mut second);
    Ok([first, second])
}

fn assemble_complete_faces(
    graph: &MedialGraph,
    boundary: &LocalBoundary,
    corner_offset: f64,
    corner: Point,
    previous: GuideCandidate,
    next: GuideCandidate,
    hit: RayHit,
) -> Result<[Vec<Point>; 2], MedialAxisError> {
    let previous_to_bisector = graph.polyline_between_edge_positions(
        previous.hit_edge,
        previous.hit_distance_mm,
        hit.edge,
        hit.edge_distance_mm,
    )?;
    let bisector_to_next = graph.polyline_between_edge_positions(
        hit.edge,
        hit.edge_distance_mm,
        next.hit_edge,
        next.hit_distance_mm,
    )?;
    let mut first = vec![previous.boundary.point, previous.hit_point];
    append_face_path(&mut first, &previous_to_bisector);
    first.push(corner);
    append_face_path(
        &mut first,
        &boundary.backward_run(corner_offset, previous.boundary.offset_mm)?,
    );
    finish_face(&mut first);
    let mut second = vec![corner, hit.point];
    append_face_path(&mut second, &bisector_to_next);
    second.push(next.boundary.point);
    append_face_path(
        &mut second,
        &boundary.backward_run(next.boundary.offset_mm, corner_offset)?,
    );
    finish_face(&mut second);
    Ok([first, second])
}

fn remove_adjacent_face_duplicates(face: &mut Vec<Point>) {
    face.dedup_by(|left, right| distance(*left, *right) <= SPLIT_DISTANCE_EPSILON_MM);
}

fn finish_face(face: &mut Vec<Point>) {
    remove_adjacent_face_duplicates(face);
    if face.len() > 1
        && face
            .first()
            .zip(face.last())
            .is_some_and(|(first, last)| distance(*first, *last) <= SPLIT_DISTANCE_EPSILON_MM)
    {
        face.pop();
    }
}

fn append_face_path(face: &mut Vec<Point>, path: &[Point]) {
    let skip = usize::from(
        face.last()
            .zip(path.first())
            .is_some_and(|(left, right)| distance(*left, *right) <= SPLIT_DISTANCE_EPSILON_MM),
    );
    face.extend(path.iter().copied().skip(skip));
}

fn reflex_faces_allow_replacement(first_face: &[Point], second_face: &[Point]) -> bool {
    is_convex_face(first_face) && is_convex_face(second_face)
}

fn is_convex_face(points: &[Point]) -> bool {
    if points.len() < 3 {
        return false;
    }
    let mut sign = 0.0_f64;
    for index in 0..points.len() {
        let orientation = robust::orient2d(
            coord(points[index]),
            coord(points[(index + 1) % points.len()]),
            coord(points[(index + 2) % points.len()]),
        );
        if orientation == 0.0 {
            continue;
        }
        if sign == 0.0 {
            sign = orientation.signum();
        } else if orientation.signum() != sign {
            return false;
        }
    }
    sign != 0.0
}

fn coord(point: Point) -> robust::Coord<f64> {
    robust::Coord {
        x: point.x,
        y: point.y,
    }
}

fn guide_source_ids(boundary: LocalBoundaryLocation) -> [u32; 2] {
    let quantized_offset = (boundary.offset_mm / crate::constants::TOPOLOGY_QUANTIZATION_MM)
        .round()
        .max(0.0) as u64;
    [
        u32::MAX,
        (quantized_offset as u32) ^ ((quantized_offset >> 32) as u32),
    ]
}

fn cross(left: Vec2, right: Vec2) -> f64 {
    left.x * right.y - left.y * right.x
}
