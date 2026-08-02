use super::front::{
    CoreCycleVertex, RadiusCapableCore, SkeletonSide, WavefrontFamily, WavefrontFamilyKind,
};
use super::schedule::{
    EventSpec, FamilyGeometry, RootedTree, ScheduledLeafPath, TimedSegment, build_scheduled_family,
    root_graph_at_center, upper_hull_child_time,
};
use super::{WavefrontError, WavefrontErrorReason, checked_guide_spacing};
use crate::constants::{GENERATION_MARGIN_MM, MIN_RADIUS_MM};
use crate::geometry::AllowedRegion;
use crate::medial_axis::{EdgeId, GraphPosition, MedialGraph, NodeId};
use std::collections::{BTreeMap, BTreeSet};

const SKELETON_BRANCH_DIAMETER_FACTOR: f64 = 1.5;
const SKELETON_BOUNDARY_SPAN_FACTOR: f64 = 2.0;
const MIN_SKELETON_PERIMETER_FRACTION: f64 = 0.05;
const SKELETON_EPSILON_MM: f64 = 1e-9;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct BranchKey {
    edge: EdgeId,
    toward_distance_bits: u64,
}

#[derive(Clone, Debug)]
struct RootBranch {
    key: BranchKey,
    height_mm: f64,
    leaf_indices: Vec<usize>,
    representative_boundary_offset_mm: f64,
}

#[derive(Clone, Copy, Debug)]
struct EdgeInterval {
    start_mm: f64,
    end_mm: f64,
}

pub fn skeleton_family(
    graph: &MedialGraph,
    allowed: &AllowedRegion,
    nominal_spacing_mm: f64,
    guide_factor: f64,
) -> Result<Option<WavefrontFamily>, WavefrontError> {
    let guide_spacing_mm = checked_guide_spacing(nominal_spacing_mm, guide_factor)?;
    let polygon_perimeter_mm = allowed
        .boundary
        .iter()
        .map(|primitive| primitive.length())
        .sum::<f64>();
    if !polygon_perimeter_mm.is_finite() || polygon_perimeter_mm <= 0.0 {
        return Err(WavefrontError::invalid(
            WavefrontErrorReason::InvalidAllowedRegion,
        ));
    }
    let leaf_boundary_offsets = graph
        .boundary_leaf_offsets(allowed)
        .map_err(|_| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
    let rooted = root_graph_at_center(graph)?;
    let branches = root_branches(&rooted, &leaf_boundary_offsets)?;
    let selected = select_skeleton_branches(&branches, guide_spacing_mm, polygon_perimeter_mm);
    if selected.len() < 2 {
        return Ok(None);
    }

    let mut coverage = skeleton_coverage(&rooted, &selected, guide_spacing_mm)?;
    merge_coverage(&mut coverage);
    let skeleton_length_mm = coverage
        .values()
        .flatten()
        .map(|interval| interval.end_mm - interval.start_mm)
        .sum::<f64>();
    let perimeter_proxy_mm = 2.0 * skeleton_length_mm;
    if !skeleton_length_mm.is_finite()
        || skeleton_length_mm <= SKELETON_EPSILON_MM
        || perimeter_proxy_mm < MIN_SKELETON_PERIMETER_FRACTION * polygon_perimeter_mm
    {
        return Ok(None);
    }

    let (leaf_paths, max_height_mm, events) = skeleton_leaf_paths(&rooted, &coverage)?;
    let (skeleton_positions, cycle) = skeleton_cycle(graph, rooted.root_position, &coverage)?;
    let core = RadiusCapableCore {
        center: rooted.root_position,
        cycle,
        skeleton_positions,
        skeleton_length_mm,
        perimeter_proxy_mm,
        reserved_turn_diameter_mm: 2.0 * MIN_RADIUS_MM + 2.0 * GENERATION_MARGIN_MM,
    };
    build_scheduled_family(
        graph,
        WavefrontFamilyKind::Skeleton,
        guide_spacing_mm,
        max_height_mm,
        FamilyGeometry {
            leaf_paths,
            event_specs: events,
            core,
            polygon_perimeter_mm: Some(polygon_perimeter_mm),
        },
    )
    .map(Some)
}

fn root_branches(
    rooted: &RootedTree,
    leaf_boundary_offsets: &[f64],
) -> Result<Vec<RootBranch>, WavefrontError> {
    if leaf_boundary_offsets.len() != rooted.leaf_paths.len() {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }
    let mut branches: BTreeMap<BranchKey, RootBranch> = BTreeMap::new();
    for (leaf_index, path) in rooted.leaf_paths.iter().enumerate() {
        let first = path
            .segments
            .first()
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
        let key = BranchKey {
            edge: first.edge,
            toward_distance_bits: first.end_edge_distance_mm.to_bits(),
        };
        let path_length = path
            .segments
            .last()
            .map(|segment| segment.end_root_distance_mm)
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
        let boundary_offset = leaf_boundary_offsets[leaf_index];
        let branch = branches.entry(key).or_insert_with(|| RootBranch {
            key,
            height_mm: 0.0,
            leaf_indices: Vec::new(),
            representative_boundary_offset_mm: boundary_offset,
        });
        branch.height_mm = branch.height_mm.max(path_length);
        branch.leaf_indices.push(leaf_index);
        branch.representative_boundary_offset_mm = branch
            .representative_boundary_offset_mm
            .min(boundary_offset);
    }
    let mut branches = branches.into_values().collect::<Vec<_>>();
    branches.sort_by(|left, right| {
        right
            .height_mm
            .total_cmp(&left.height_mm)
            .then_with(|| left.key.cmp(&right.key))
    });
    Ok(branches)
}

fn select_skeleton_branches(
    branches: &[RootBranch],
    diameter_mm: f64,
    perimeter_mm: f64,
) -> BTreeSet<BranchKey> {
    let mut selected = BTreeSet::new();
    let Some(longest) = branches.first() else {
        return selected;
    };
    if longest.height_mm <= diameter_mm {
        return selected;
    }
    selected.insert(longest.key);
    let mut selected_offsets = vec![longest.representative_boundary_offset_mm];
    for branch in branches.iter().skip(1) {
        if branch.height_mm < SKELETON_BRANCH_DIAMETER_FACTOR * diameter_mm {
            continue;
        }
        let spans_boundary = selected_offsets.iter().any(|offset| {
            circular_distance(
                *offset,
                branch.representative_boundary_offset_mm,
                perimeter_mm,
            ) > SKELETON_BOUNDARY_SPAN_FACTOR * diameter_mm
        });
        if spans_boundary {
            selected.insert(branch.key);
            selected_offsets.push(branch.representative_boundary_offset_mm);
        }
    }
    selected
}

fn skeleton_coverage(
    rooted: &RootedTree,
    selected: &BTreeSet<BranchKey>,
    wall_stop_distance_mm: f64,
) -> Result<BTreeMap<EdgeId, Vec<EdgeInterval>>, WavefrontError> {
    let mut coverage: BTreeMap<EdgeId, Vec<EdgeInterval>> = BTreeMap::new();
    for path in &rooted.leaf_paths {
        let first = path
            .segments
            .first()
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
        let key = BranchKey {
            edge: first.edge,
            toward_distance_bits: first.end_edge_distance_mm.to_bits(),
        };
        if !selected.contains(&key) {
            continue;
        }
        let path_length = path
            .segments
            .last()
            .map(|segment| segment.end_root_distance_mm)
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
        let cutoff = (path_length - wall_stop_distance_mm).max(0.0);
        for segment in &path.segments {
            if cutoff <= segment.start_root_distance_mm + SKELETON_EPSILON_MM {
                break;
            }
            let covered = (cutoff - segment.start_root_distance_mm)
                .min(segment.end_root_distance_mm - segment.start_root_distance_mm)
                .max(0.0);
            if covered <= SKELETON_EPSILON_MM {
                continue;
            }
            let fraction =
                covered / (segment.end_root_distance_mm - segment.start_root_distance_mm);
            let covered_end = segment.start_edge_distance_mm
                + (segment.end_edge_distance_mm - segment.start_edge_distance_mm) * fraction;
            coverage
                .entry(segment.edge)
                .or_default()
                .push(EdgeInterval {
                    start_mm: segment.start_edge_distance_mm.min(covered_end),
                    end_mm: segment.start_edge_distance_mm.max(covered_end),
                });
        }
    }
    Ok(coverage)
}

fn merge_coverage(coverage: &mut BTreeMap<EdgeId, Vec<EdgeInterval>>) {
    for intervals in coverage.values_mut() {
        intervals.sort_by(|left, right| {
            left.start_mm
                .total_cmp(&right.start_mm)
                .then_with(|| left.end_mm.total_cmp(&right.end_mm))
        });
        let mut merged: Vec<EdgeInterval> = Vec::with_capacity(intervals.len());
        for interval in intervals.iter().copied() {
            if let Some(previous) = merged.last_mut()
                && interval.start_mm <= previous.end_mm + SKELETON_EPSILON_MM
            {
                previous.end_mm = previous.end_mm.max(interval.end_mm);
                continue;
            }
            merged.push(interval);
        }
        *intervals = merged;
    }
}

fn skeleton_leaf_paths(
    rooted: &RootedTree,
    coverage: &BTreeMap<EdgeId, Vec<EdgeInterval>>,
) -> Result<(Vec<ScheduledLeafPath>, f64, Vec<EventSpec>), WavefrontError> {
    let mut outside = Vec::with_capacity(rooted.leaf_paths.len());
    let mut max_height_mm = 0.0_f64;
    for path in &rooted.leaf_paths {
        let (attachment, first_segment_index, covered_on_first) =
            attachment_for_path(path, coverage)?;
        let mut segments = Vec::new();
        let mut distance_from_core = 0.0;
        for (index, source) in path.segments.iter().enumerate().skip(first_segment_index) {
            let start_edge_distance_mm = if index == first_segment_index {
                source.start_edge_distance_mm
                    + (source.end_edge_distance_mm - source.start_edge_distance_mm)
                        * (covered_on_first
                            / (source.end_root_distance_mm - source.start_root_distance_mm))
            } else {
                source.start_edge_distance_mm
            };
            let length_mm = (source.end_edge_distance_mm - start_edge_distance_mm).abs();
            if length_mm <= SKELETON_EPSILON_MM {
                continue;
            }
            let start = if segments.is_empty() {
                attachment
            } else {
                source.start
            };
            segments.push(TimedSegment {
                edge: source.edge,
                start,
                end: source.end,
                start_edge_distance_mm,
                end_edge_distance_mm: source.end_edge_distance_mm,
                start_time: 0.0,
                end_time: 0.0,
                start_root_distance_mm: distance_from_core,
                end_root_distance_mm: distance_from_core + length_mm,
            });
            distance_from_core += length_mm;
        }
        if segments.is_empty() {
            return Err(WavefrontError::validation(
                WavefrontErrorReason::DegenerateSkeleton,
            ));
        }
        max_height_mm = max_height_mm.max(distance_from_core);
        outside.push(ScheduledLeafPath {
            leaf: path.leaf,
            segments,
            start: attachment,
        });
    }
    if !max_height_mm.is_finite() || max_height_mm <= 0.0 {
        return Err(WavefrontError::validation(
            WavefrontErrorReason::DegenerateSkeleton,
        ));
    }

    let mut node_events = BTreeMap::<NodeId, (usize, f64)>::new();
    let mut events = Vec::new();
    for (leaf_order, path) in outside.iter_mut().enumerate() {
        let mut start_time = 0.0;
        for segment in &mut path.segments {
            let end_node = match segment.end {
                GraphPosition::Node(node) => node,
                GraphPosition::Edge { .. } => {
                    return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
                }
            };
            let edge_length = segment.end_root_distance_mm - segment.start_root_distance_mm;
            let child_height = rooted.height_to_leaf_mm[end_node.index()];
            segment.start_time = start_time;
            segment.end_time = upper_hull_child_time(start_time, edge_length, child_height)
                .map_err(|_| {
                    WavefrontError::validation(WavefrontErrorReason::NonMonotoneGraphTime)
                })?;
            start_time = segment.end_time;
            node_events
                .entry(end_node)
                .and_modify(|(order, time)| {
                    *order = (*order).min(leaf_order);
                    *time = time.min(segment.end_time);
                })
                .or_insert((leaf_order, segment.end_time));
        }
        events.push(EventSpec {
            node: None,
            position: path.start,
            time: 0.0,
            boundary_order: leaf_order,
        });
    }
    for (node, (order, time)) in node_events {
        events.push(EventSpec {
            node: Some(node),
            position: GraphPosition::Node(node),
            time,
            boundary_order: order,
        });
    }
    Ok((outside, max_height_mm, events))
}

fn attachment_for_path(
    path: &ScheduledLeafPath,
    coverage: &BTreeMap<EdgeId, Vec<EdgeInterval>>,
) -> Result<(GraphPosition, usize, f64), WavefrontError> {
    for (index, segment) in path.segments.iter().enumerate() {
        let segment_length = segment.end_root_distance_mm - segment.start_root_distance_mm;
        let covered = covered_from_start(segment, coverage.get(&segment.edge).map(Vec::as_slice));
        if covered < segment_length - SKELETON_EPSILON_MM {
            let fraction = (covered / segment_length).clamp(0.0, 1.0);
            let edge_distance = segment.start_edge_distance_mm
                + (segment.end_edge_distance_mm - segment.start_edge_distance_mm) * fraction;
            let position = if covered <= SKELETON_EPSILON_MM {
                segment.start
            } else {
                GraphPosition::Edge {
                    edge: segment.edge,
                    distance_mm: edge_distance,
                }
            };
            return Ok((position, index, covered));
        }
    }
    Err(WavefrontError::validation(
        WavefrontErrorReason::DegenerateSkeleton,
    ))
}

fn covered_from_start(segment: &TimedSegment, intervals: Option<&[EdgeInterval]>) -> f64 {
    let Some(intervals) = intervals else {
        return 0.0;
    };
    let start = segment.start_edge_distance_mm;
    let end = segment.end_edge_distance_mm;
    intervals
        .iter()
        .find_map(|interval| {
            if start <= end
                && start >= interval.start_mm - SKELETON_EPSILON_MM
                && start <= interval.end_mm + SKELETON_EPSILON_MM
            {
                Some((interval.end_mm.min(end) - start).max(0.0))
            } else if start > end
                && start <= interval.end_mm + SKELETON_EPSILON_MM
                && start >= interval.start_mm - SKELETON_EPSILON_MM
            {
                Some((start - interval.start_mm.max(end)).max(0.0))
            } else {
                None
            }
        })
        .unwrap_or(0.0)
}

fn skeleton_cycle(
    graph: &MedialGraph,
    root_position: GraphPosition,
    coverage: &BTreeMap<EdgeId, Vec<EdgeInterval>>,
) -> Result<(Vec<GraphPosition>, Vec<CoreCycleVertex>), WavefrontError> {
    let mut positions = vec![root_position];
    for (edge, intervals) in coverage {
        let edge_length = graph
            .edges
            .get(edge.index())
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?
            .length_mm;
        for interval in intervals {
            positions.push(normalize_edge_position(
                *edge,
                interval.start_mm,
                edge_length,
                graph,
            ));
            positions.push(normalize_edge_position(
                *edge,
                interval.end_mm,
                edge_length,
                graph,
            ));
        }
    }
    positions.sort_by(position_order);
    positions.dedup();
    let mut cycle = positions
        .iter()
        .copied()
        .map(|graph_position| CoreCycleVertex {
            graph_position,
            side: SkeletonSide::Forward,
        })
        .collect::<Vec<_>>();
    cycle.extend(
        positions
            .iter()
            .rev()
            .copied()
            .map(|graph_position| CoreCycleVertex {
                graph_position,
                side: SkeletonSide::Reverse,
            }),
    );
    Ok((positions, cycle))
}

fn normalize_edge_position(
    edge: EdgeId,
    distance_mm: f64,
    edge_length_mm: f64,
    graph: &MedialGraph,
) -> GraphPosition {
    let source = &graph.edges[edge.index()];
    if distance_mm <= SKELETON_EPSILON_MM {
        GraphPosition::Node(source.a)
    } else if distance_mm >= edge_length_mm - SKELETON_EPSILON_MM {
        GraphPosition::Node(source.b)
    } else {
        GraphPosition::Edge { edge, distance_mm }
    }
}

fn position_order(left: &GraphPosition, right: &GraphPosition) -> std::cmp::Ordering {
    position_key(*left).cmp(&position_key(*right))
}

fn position_key(position: GraphPosition) -> (u8, u32, u64) {
    match position {
        GraphPosition::Node(node) => (0, node.0, 0),
        GraphPosition::Edge { edge, distance_mm } => (1, edge.0, distance_mm.to_bits()),
    }
}

fn circular_distance(first: f64, second: f64, perimeter: f64) -> f64 {
    let direct = (first - second).abs();
    direct.min(perimeter - direct)
}
