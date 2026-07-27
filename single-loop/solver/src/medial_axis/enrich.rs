use super::graph::{BoundaryLocation, ExactLocalBoundary, distance, polyline_length};
use super::{EdgeId, MedialAxisError, MedialAxisErrorReason, MedialGraph, MedialGraphDiagnostics};
use crate::geometry::{AllowedRegion, Intersection, Vec2, primitive_intersections};
use crate::model::{PathPrimitive, Point};
use std::collections::BTreeMap;

const MIN_GUIDE_HIT_ANGLE_DEGREES: f64 = 50.0;
const EDGE_PARAMETER_EPSILON: f64 = 1e-10;
const SPLIT_DISTANCE_EPSILON_MM: f64 = 1e-7;
const REFLEX_SINE_TOLERANCE: f64 = 1e-10;
const MAX_GUIDE_CANDIDATES: usize = 1_000_000;
const MAX_GUIDE_RAY_TESTS: usize = 50_000_000;
const MAX_REFLEX_PAIR_TESTS: usize = 10_000_000;

#[derive(Clone, Copy, Debug)]
struct GuideCandidate {
    boundary: BoundaryLocation,
    hit_edge: EdgeId,
    hit_distance_mm: f64,
    hit_point: Point,
}

#[derive(Clone, Copy, Debug)]
struct RayHit {
    edge: EdgeId,
    edge_distance_mm: f64,
    point: Point,
    point_key: [i64; 2],
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
    let hit = first_graph_hit(graph, origin, direction)?;
    Some(GuideHitObservation {
        edge: hit.edge,
        point: graph.publish_local_point(hit.point, hit.point_key).ok()?,
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
    let boundary = ExactLocalBoundary::from_vertices(boundary_vertices_local_mm)?;
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
    let mut local_certification_work = 0usize;
    let evaluations = replace_reflex_double_guides_on_boundary(
        graph,
        &boundary,
        &mut candidates,
        &mut diagnostics,
        &mut local_certification_work,
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
    let local_boundary = graph.exact_local_boundary(allowed)?;
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

    let graph_segment_count = local_graph_segment_count(graph)?;
    let boundary_work_per_candidate = local_boundary
        .primitive_count()
        .checked_mul(5)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let work_per_candidate = graph_segment_count
        .checked_add(boundary_work_per_candidate)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let mut candidates = Vec::new();
    let mut local_certification_work = 0usize;
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
            let boundary = local_boundary.location_at_offset(offset)?;
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
            let branch = [boundary.point, hit.point];
            if !local_boundary
                .certify_local_polyline(&branch, &mut local_certification_work)?
                .contained
            {
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
        &local_boundary,
        &mut candidates,
        diagnostics,
        &mut local_certification_work,
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
    let mut exact_boundary_endpoint_keys = Vec::with_capacity(candidates.len());
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
            exact_boundary_endpoint_keys.push((polylines.len(), candidate.boundary.coordinate_key));
            polylines.push(vec![candidate.boundary.point, hit_point]);
            source_ids.push(guide_source_ids(candidate.boundary));
        }
    }
    let mut endpoint_keys = graph.endpoint_keys_for_local_polylines(&polylines)?;
    for (polyline, coordinate_key) in exact_boundary_endpoint_keys {
        endpoint_keys[polyline][0] = coordinate_key;
    }
    graph.replace_with_local_polylines(allowed, &polylines, &source_ids, &endpoint_keys)?;
    graph.validate_with_local_certification_work(allowed, &mut local_certification_work)?;
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
    let direction = direction.normalized()?;
    let mut best: Option<RayHit> = None;
    for (edge_index, edge) in graph.edges.iter().enumerate() {
        edge.validate_authoritative_identity().ok()?;
        if edge.id.index() != edge_index {
            return None;
        }
        let edge_id = EdgeId(edge_index as u32);
        let polyline = graph.local_edge_polyline(edge_id)?;
        for (segment_index, pair) in polyline.windows(2).enumerate() {
            let segment = pair[1] - pair[0];
            let denominator = cross(direction, segment);
            if denominator.abs() <= f64::EPSILON * 64.0 {
                continue;
            }
            let delta = pair[0] - origin;
            let ray_distance = cross(delta, segment) / denominator;
            let segment_parameter = cross(delta, direction) / denominator;
            if ray_distance <= 0.0
                || !(-EDGE_PARAMETER_EPSILON..=1.0 + EDGE_PARAMETER_EPSILON)
                    .contains(&segment_parameter)
            {
                continue;
            }
            let segment_parameter = segment_parameter.clamp(0.0, 1.0);
            let segment_parameter = if segment_parameter <= EDGE_PARAMETER_EPSILON {
                0.0
            } else if segment_parameter >= 1.0 - EDGE_PARAMETER_EPSILON {
                1.0
            } else {
                segment_parameter
            };
            let point = if segment_parameter == 0.0 {
                pair[0]
            } else if segment_parameter == 1.0 {
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
                edge: edge_id,
                edge_distance_mm: graph.local_distance_at_segment_parameter(
                    edge_id,
                    segment_index,
                    segment_parameter,
                )?,
                point,
                point_key: graph.local_coordinate_key_at_segment_parameter(
                    edge_id,
                    segment_index,
                    segment_parameter,
                    point,
                )?,
                angle_degrees,
                ray_distance_mm: ray_distance,
            };
            if best.is_none_or(|current| {
                hit.ray_distance_mm
                    .total_cmp(&current.ray_distance_mm)
                    .then_with(|| hit.edge.cmp(&current.edge))
                    .then_with(|| hit.edge_distance_mm.total_cmp(&current.edge_distance_mm))
                    == std::cmp::Ordering::Less
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
    boundary: &ExactLocalBoundary,
    candidates: &mut Vec<GuideCandidate>,
    diagnostics: &mut MedialGraphDiagnostics,
    local_certification_work: &mut usize,
) -> Result<Vec<ReflexEvaluation>, MedialAxisError> {
    replace_reflex_double_guides_on_boundary(
        graph,
        boundary,
        candidates,
        diagnostics,
        local_certification_work,
    )
}

fn replace_reflex_double_guides_on_boundary(
    graph: &MedialGraph,
    boundary: &ExactLocalBoundary,
    candidates: &mut Vec<GuideCandidate>,
    diagnostics: &mut MedialGraphDiagnostics,
    local_certification_work: &mut usize,
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
    let mut face_pair_work = 0usize;

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
        if !boundary.primitives[previous_index].is_line()
            || !boundary.primitives[next_index].is_line()
        {
            continue;
        }
        let corner_offset = boundary.prefix_lengths[next_index];
        let corner_location = boundary.location_at_offset(corner_offset)?;
        let corner = corner_location.point;
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
            is_convex_face(&selected_faces[0], &mut face_pair_work)?,
            is_convex_face(&selected_faces[1], &mut face_pair_work)?,
        ];
        let retained_neighbors = retained_face_neighbors(
            boundary,
            corner_offset,
            RetainedFaceAnchors {
                leaves: &leaf_anchors,
                candidates,
                removed: &removed,
                replacements: &replacements,
            },
            [previous_candidate_index, next_candidate_index],
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
        if !boundary.backward_run_is_linear(corner_offset, previous_neighbor.boundary.offset_mm)
            || !boundary.backward_run_is_linear(next_neighbor.boundary.offset_mm, corner_offset)
        {
            diagnostics.nonconvex_reflex_replacements_rejected += 1;
            evaluations.push(ReflexEvaluation {
                selected_branch_faces_convex,
                complete_faces_convex: [false, false],
                accepted: false,
            });
            continue;
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
            is_convex_face(&complete_faces[0], &mut face_pair_work)?,
            is_convex_face(&complete_faces[1], &mut face_pair_work)?,
        ];
        let mut accepted = complete_faces_convex == [true, true];
        if accepted {
            accepted = boundary
                .certify_local_polyline(&[corner, hit.point], local_certification_work)?
                .contained;
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
            boundary: corner_location,
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
            RetainedFaceAnchors {
                leaves: &leaf_anchors,
                candidates,
                removed: &removed,
                replacements: &replacements,
            },
            [accepted.previous_candidate, accepted.next_candidate],
            Some(accepted.replacement_index),
        );
        let Some((previous_neighbor, next_neighbor)) = neighbors else {
            final_faces_certified = false;
            break;
        };
        if !boundary
            .backward_run_is_linear(accepted.corner_offset, previous_neighbor.boundary.offset_mm)
            || !boundary
                .backward_run_is_linear(next_neighbor.boundary.offset_mm, accepted.corner_offset)
        {
            final_faces_certified = false;
            break;
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
        let convexity = [
            is_convex_face(&faces[0], &mut face_pair_work)?,
            is_convex_face(&faces[1], &mut face_pair_work)?,
        ];
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
    boundary: &ExactLocalBoundary,
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

struct RetainedFaceAnchors<'a> {
    leaves: &'a [GuideCandidate],
    candidates: &'a [GuideCandidate],
    removed: &'a [bool],
    replacements: &'a [GuideCandidate],
}

fn retained_face_neighbors(
    boundary: &ExactLocalBoundary,
    corner_offset: f64,
    anchors: RetainedFaceAnchors<'_>,
    excluded_candidates: [usize; 2],
    excluded_replacement: Option<usize>,
) -> Option<(GuideCandidate, GuideCandidate)> {
    let anchors =
        anchors
            .leaves
            .iter()
            .copied()
            .chain(anchors.candidates.iter().copied().enumerate().filter_map(
                |(index, candidate)| {
                    (!anchors.removed[index] && !excluded_candidates.contains(&index))
                        .then_some(candidate)
                },
            ))
            .chain(anchors.replacements.iter().copied().enumerate().filter_map(
                |(index, replacement)| (Some(index) != excluded_replacement).then_some(replacement),
            ))
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

fn boundary_backward_distance(boundary: &ExactLocalBoundary, from: f64, to: f64) -> f64 {
    (from - to).rem_euclid(boundary.perimeter_mm)
}

fn boundary_forward_distance(boundary: &ExactLocalBoundary, from: f64, to: f64) -> f64 {
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
    boundary: &ExactLocalBoundary,
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
    let mut aggregate_pair_work = 0usize;
    matches!(
        is_convex_face(first_face, &mut aggregate_pair_work),
        Ok(true)
    ) && matches!(
        is_convex_face(second_face, &mut aggregate_pair_work),
        Ok(true)
    )
}

fn is_convex_face(
    points: &[Point],
    aggregate_pair_work: &mut usize,
) -> Result<bool, MedialAxisError> {
    if points.len() < 3 || !face_is_simple(points, aggregate_pair_work)? {
        return Ok(false);
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
            return Ok(false);
        }
    }
    Ok(sign != 0.0)
}

fn face_is_simple(
    points: &[Point],
    aggregate_pair_work: &mut usize,
) -> Result<bool, MedialAxisError> {
    let pair_work = points
        .len()
        .checked_mul(points.len().saturating_sub(1))
        .map(|work| work / 2)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    *aggregate_pair_work = aggregate_pair_work
        .checked_add(pair_work)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if *aggregate_pair_work > MAX_REFLEX_PAIR_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }

    for first in 0..points.len() {
        let first_segment = PathPrimitive::Line {
            start: points[first],
            end: points[(first + 1) % points.len()],
        };
        for second in (first + 1)..points.len() {
            let adjacent = second == first + 1 || (first == 0 && second + 1 == points.len());
            let second_segment = PathPrimitive::Line {
                start: points[second],
                end: points[(second + 1) % points.len()],
            };
            let intersection = primitive_intersections(&first_segment, &second_segment);
            if adjacent {
                let shared = if second == first + 1 {
                    points[second]
                } else {
                    points[0]
                };
                if !matches!(
                    intersection,
                    Intersection::Points(ref intersections)
                        if intersections.len() == 1
                            && distance(intersections[0].point, shared)
                                <= SPLIT_DISTANCE_EPSILON_MM
                ) {
                    return Ok(false);
                }
            } else if !matches!(intersection, Intersection::None) {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

fn coord(point: Point) -> robust::Coord<f64> {
    robust::Coord {
        x: point.x,
        y: point.y,
    }
}

fn guide_source_ids(boundary: BoundaryLocation) -> [u32; 2] {
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
