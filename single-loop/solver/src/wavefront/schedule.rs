use super::front::{
    CoreCycleVertex, EventSeamAnchor, RadiusCapableCore, Wavefront, WavefrontFamily,
    WavefrontFamilyKind, WavefrontVertex, WavefrontVertexId, position_signature,
};
use super::{WavefrontError, WavefrontErrorReason, checked_guide_spacing};
use crate::constants::{GENERATION_MARGIN_MM, MIN_RADIUS_MM};
use crate::medial_axis::{EdgeId, GraphPosition, MedialGraph, NodeId};
use std::collections::BTreeMap;

const EVENT_EPSILON: f64 = 1e-12;
const MAX_WAVEFRONT_PHASES: usize = 100_000;
const MAX_WAVEFRONT_VERTICES: usize = 2_000_000;

#[derive(Clone, Copy, Debug)]
pub(crate) struct DirectedArc {
    pub(crate) to: usize,
    pub(crate) edge: EdgeId,
    pub(crate) from_edge_distance_mm: f64,
    pub(crate) to_edge_distance_mm: f64,
    pub(crate) length_mm: f64,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ParentArc {
    pub(crate) parent: usize,
    pub(crate) arc: DirectedArc,
}

#[derive(Clone, Debug)]
pub(crate) struct TimedSegment {
    pub(crate) edge: EdgeId,
    pub(crate) start: GraphPosition,
    pub(crate) end: GraphPosition,
    pub(crate) start_edge_distance_mm: f64,
    pub(crate) end_edge_distance_mm: f64,
    pub(crate) start_time: f64,
    pub(crate) end_time: f64,
    pub(crate) start_root_distance_mm: f64,
    pub(crate) end_root_distance_mm: f64,
}

#[derive(Clone, Debug)]
pub(crate) struct ScheduledLeafPath {
    pub(crate) leaf: NodeId,
    pub(crate) segments: Vec<TimedSegment>,
    pub(crate) start: GraphPosition,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct EventSpec {
    pub(crate) node: Option<NodeId>,
    pub(crate) position: GraphPosition,
    pub(crate) time: f64,
    pub(crate) boundary_order: usize,
}

pub(crate) struct FamilyGeometry {
    pub(crate) leaf_paths: Vec<ScheduledLeafPath>,
    pub(crate) event_specs: Vec<EventSpec>,
    pub(crate) core: RadiusCapableCore,
    pub(crate) polygon_perimeter_mm: Option<f64>,
}

#[derive(Clone, Debug)]
pub(crate) struct RootedTree {
    pub(crate) root: usize,
    pub(crate) root_position: GraphPosition,
    pub(crate) node_count: usize,
    pub(crate) height_to_leaf_mm: Vec<f64>,
    pub(crate) node_time: Vec<f64>,
    pub(crate) leaf_paths: Vec<ScheduledLeafPath>,
    pub(crate) max_height_mm: f64,
}

pub fn point_family(
    graph: &MedialGraph,
    nominal_spacing_mm: f64,
    guide_factor: f64,
) -> Result<WavefrontFamily, WavefrontError> {
    let guide_spacing_mm = checked_guide_spacing(nominal_spacing_mm, guide_factor)?;
    let rooted = root_graph_at_center(graph)?;
    let core = RadiusCapableCore {
        center: rooted.root_position,
        cycle: vec![CoreCycleVertex {
            graph_position: rooted.root_position,
            side: super::front::SkeletonSide::Forward,
        }],
        skeleton_positions: vec![rooted.root_position],
        skeleton_length_mm: 0.0,
        perimeter_proxy_mm: 0.0,
        reserved_turn_diameter_mm: 2.0 * MIN_RADIUS_MM + 2.0 * GENERATION_MARGIN_MM,
    };
    let events = point_event_specs(graph, &rooted)?;
    build_scheduled_family(
        graph,
        WavefrontFamilyKind::Point,
        guide_spacing_mm,
        rooted.max_height_mm,
        FamilyGeometry {
            leaf_paths: rooted.leaf_paths.clone(),
            event_specs: events,
            core,
            polygon_perimeter_mm: None,
        },
    )
}

pub(crate) fn root_graph_at_center(graph: &MedialGraph) -> Result<RootedTree, WavefrontError> {
    if !graph.is_connected() || !graph.is_acyclic() || !graph.embedding_is_ccw() {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }
    if graph.nodes.len() > MAX_WAVEFRONT_VERTICES || graph.edges.len() > MAX_WAVEFRONT_VERTICES {
        return Err(WavefrontError::resource(
            WavefrontErrorReason::WavefrontResourceLimit,
        ));
    }
    for (index, edge) in graph.edges.iter().enumerate() {
        if edge.id.index() != index
            || edge.a.index() >= graph.nodes.len()
            || edge.b.index() >= graph.nodes.len()
            || !edge.length_mm.is_finite()
            || edge.length_mm <= 0.0
            || edge.point_at_distance(edge.length_mm).is_err()
        {
            return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
        }
    }

    let center = graph
        .center()
        .map_err(|_| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
    let mut root_position = center.position;
    let node_count = graph.nodes.len();
    let mut split_edge = None;
    let root = match center.position {
        GraphPosition::Node(node) => node.index(),
        GraphPosition::Edge { edge, distance_mm } => {
            let source = graph
                .edges
                .get(edge.index())
                .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
            if distance_mm <= EVENT_EPSILON {
                root_position = GraphPosition::Node(source.a);
                source.a.index()
            } else if distance_mm >= source.length_mm - EVENT_EPSILON {
                root_position = GraphPosition::Node(source.b);
                source.b.index()
            } else {
                split_edge = Some((edge, distance_mm));
                node_count
            }
        }
    };
    let total_nodes = node_count + usize::from(split_edge.is_some());
    let mut adjacency = vec![Vec::new(); total_nodes];
    for edge in &graph.edges {
        if split_edge.is_some_and(|(split, _)| split == edge.id) {
            continue;
        }
        add_arc_pair(
            &mut adjacency,
            edge.a.index(),
            edge.b.index(),
            edge.id,
            0.0,
            edge.length_mm,
        );
    }
    if let Some((edge_id, distance_mm)) = split_edge {
        let edge = &graph.edges[edge_id.index()];
        add_arc_pair(
            &mut adjacency,
            root,
            edge.a.index(),
            edge_id,
            distance_mm,
            0.0,
        );
        add_arc_pair(
            &mut adjacency,
            root,
            edge.b.index(),
            edge_id,
            distance_mm,
            edge.length_mm,
        );
    }
    for incident in &mut adjacency {
        incident.sort_by(|left, right| {
            left.edge
                .cmp(&right.edge)
                .then_with(|| left.to.cmp(&right.to))
                .then_with(|| {
                    left.to_edge_distance_mm
                        .total_cmp(&right.to_edge_distance_mm)
                })
        });
    }

    let mut parent = vec![None; total_nodes];
    let mut children = vec![Vec::new(); total_nodes];
    let mut order = Vec::with_capacity(total_nodes);
    let mut stack = vec![root];
    let mut seen = vec![false; total_nodes];
    seen[root] = true;
    while let Some(node) = stack.pop() {
        order.push(node);
        for arc in adjacency[node].iter().rev().copied() {
            if seen[arc.to] {
                continue;
            }
            seen[arc.to] = true;
            parent[arc.to] = Some(ParentArc { parent: node, arc });
            children[node].push(arc);
            stack.push(arc.to);
        }
    }
    if seen.into_iter().any(|value| !value) {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }
    for child_list in &mut children {
        child_list.sort_by(|left, right| {
            left.edge
                .cmp(&right.edge)
                .then_with(|| left.to.cmp(&right.to))
        });
    }

    let mut height_to_leaf_mm = vec![0.0; total_nodes];
    for node in order.iter().rev().copied() {
        height_to_leaf_mm[node] = children[node]
            .iter()
            .map(|arc| arc.length_mm + height_to_leaf_mm[arc.to])
            .fold(0.0, f64::max);
    }
    let max_height_mm = height_to_leaf_mm[root];
    if !max_height_mm.is_finite() || max_height_mm <= 0.0 {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }

    let mut root_distance_mm = vec![0.0; total_nodes];
    for node in order.iter().copied() {
        for arc in &children[node] {
            root_distance_mm[arc.to] = root_distance_mm[node] + arc.length_mm;
        }
    }
    let mut node_time: Vec<f64> = vec![0.0; total_nodes];
    for node in order.iter().copied() {
        for arc in &children[node] {
            node_time[arc.to] =
                upper_hull_child_time(node_time[node], arc.length_mm, height_to_leaf_mm[arc.to])?;
        }
    }

    let leaf_paths = graph
        .leaves
        .iter()
        .copied()
        .map(|leaf| {
            point_leaf_path(
                leaf,
                root,
                node_count,
                root_position,
                &parent,
                &node_time,
                &root_distance_mm,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    if leaf_paths.is_empty() {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }

    Ok(RootedTree {
        root,
        root_position,
        node_count,
        height_to_leaf_mm,
        node_time,
        leaf_paths,
        max_height_mm,
    })
}

/// Advances one edge on the upper convex envelope of `(remaining subtree length, time)`.
/// The resulting edge speed equals the branch's required average speed. Child branches can
/// only keep or reduce that speed, while every leaf still lands exactly at `t = 1`.
pub(crate) fn upper_hull_child_time(
    parent_time: f64,
    edge_length_mm: f64,
    child_height_mm: f64,
) -> Result<f64, WavefrontError> {
    let remaining_time = 1.0 - parent_time;
    let branch_height = edge_length_mm + child_height_mm;
    if !parent_time.is_finite()
        || !edge_length_mm.is_finite()
        || !child_height_mm.is_finite()
        || !branch_height.is_finite()
        || edge_length_mm <= 0.0
        || child_height_mm < 0.0
        || branch_height <= 0.0
        || remaining_time <= 0.0
    {
        return Err(WavefrontError::graph(WavefrontErrorReason::InvalidGraph));
    }
    Ok(if child_height_mm == 0.0 {
        1.0
    } else {
        (parent_time + edge_length_mm * remaining_time / branch_height).clamp(parent_time, 1.0)
    })
}

fn add_arc_pair(
    adjacency: &mut [Vec<DirectedArc>],
    a: usize,
    b: usize,
    edge: EdgeId,
    a_distance_mm: f64,
    b_distance_mm: f64,
) {
    let length_mm = (b_distance_mm - a_distance_mm).abs();
    adjacency[a].push(DirectedArc {
        to: b,
        edge,
        from_edge_distance_mm: a_distance_mm,
        to_edge_distance_mm: b_distance_mm,
        length_mm,
    });
    adjacency[b].push(DirectedArc {
        to: a,
        edge,
        from_edge_distance_mm: b_distance_mm,
        to_edge_distance_mm: a_distance_mm,
        length_mm,
    });
}

fn point_leaf_path(
    leaf: NodeId,
    root: usize,
    node_count: usize,
    root_position: GraphPosition,
    parent: &[Option<ParentArc>],
    node_time: &[f64],
    root_distance_mm: &[f64],
) -> Result<ScheduledLeafPath, WavefrontError> {
    let mut reversed = Vec::new();
    let mut current = leaf.index();
    while current != root {
        let relation = parent
            .get(current)
            .and_then(|value| *value)
            .ok_or_else(|| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
        reversed.push((relation.parent, current, relation.arc));
        current = relation.parent;
    }
    reversed.reverse();
    let segments = reversed
        .into_iter()
        .map(|(parent_index, child_index, arc)| TimedSegment {
            edge: arc.edge,
            start: if parent_index < node_count {
                GraphPosition::Node(NodeId(parent_index as u32))
            } else {
                root_position
            },
            end: GraphPosition::Node(NodeId(child_index as u32)),
            start_edge_distance_mm: arc.from_edge_distance_mm,
            end_edge_distance_mm: arc.to_edge_distance_mm,
            start_time: node_time[parent_index],
            end_time: node_time[child_index],
            start_root_distance_mm: root_distance_mm[parent_index],
            end_root_distance_mm: root_distance_mm[child_index],
        })
        .collect();
    Ok(ScheduledLeafPath {
        leaf,
        segments,
        start: root_position,
    })
}

pub(crate) fn build_scheduled_family(
    graph: &MedialGraph,
    kind: WavefrontFamilyKind,
    guide_spacing_mm: f64,
    max_height_mm: f64,
    geometry: FamilyGeometry,
) -> Result<WavefrontFamily, WavefrontError> {
    let FamilyGeometry {
        leaf_paths,
        mut event_specs,
        core,
        polygon_perimeter_mm,
    } = geometry;
    if leaf_paths.is_empty() || !max_height_mm.is_finite() || max_height_mm <= 0.0 {
        return Err(WavefrontError::validation(
            WavefrontErrorReason::EmptyFamily,
        ));
    }
    let phase_count = (max_height_mm / guide_spacing_mm).ceil().max(1.0);
    if !phase_count.is_finite() || phase_count > MAX_WAVEFRONT_PHASES as f64 {
        return Err(WavefrontError::resource(
            WavefrontErrorReason::WavefrontResourceLimit,
        ));
    }
    let phase_count = phase_count as usize;
    let required_vertices = (phase_count + 1)
        .checked_mul(leaf_paths.len())
        .ok_or_else(|| WavefrontError::resource(WavefrontErrorReason::WavefrontResourceLimit))?;
    if required_vertices > MAX_WAVEFRONT_VERTICES {
        return Err(WavefrontError::resource(
            WavefrontErrorReason::WavefrontResourceLimit,
        ));
    }

    let mut vertices: Vec<WavefrontVertex> = Vec::with_capacity(required_vertices);
    let mut fronts = Vec::with_capacity(phase_count + 1);
    let mut front_leaf_vertices = Vec::with_capacity(phase_count + 1);
    let mut previous_leaf_vertices: Option<Vec<WavefrontVertexId>> = None;
    for phase in 0..=phase_count {
        let graph_time = phase as f64 / phase_count as f64;
        let mut key_to_vertex: BTreeMap<PositionKey, WavefrontVertexId> = BTreeMap::new();
        let mut front_vertices = Vec::new();
        let mut leaf_vertices = Vec::with_capacity(leaf_paths.len());
        for (leaf_index, path) in leaf_paths.iter().enumerate() {
            let crossing = crossing_at_time(path, graph_time)?;
            let key = PositionKey::from(crossing.position);
            let parent = previous_leaf_vertices
                .as_ref()
                .map(|previous| previous[leaf_index]);
            let id = if let Some(id) = key_to_vertex.get(&key).copied() {
                let existing = &vertices[id.index()];
                if existing.parent != parent
                    || (existing.root_distance_mm - crossing.root_distance_mm).abs() > 1e-9
                {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::InvalidParent,
                    ));
                }
                id
            } else {
                let id = WavefrontVertexId(vertices.len() as u32);
                let point = graph.point_at(crossing.position).map_err(|_| {
                    WavefrontError::graph(WavefrontErrorReason::InvalidGraphPosition)
                })?;
                let parent_distance_mm = if let Some(parent) = parent {
                    crossing.root_distance_mm - vertices[parent.index()].root_distance_mm
                } else {
                    0.0
                };
                if parent_distance_mm < -1e-9 || parent_distance_mm > guide_spacing_mm + 1e-9 {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::ParentDistanceExceeded,
                    ));
                }
                vertices.push(WavefrontVertex {
                    id,
                    point,
                    graph_position: crossing.position,
                    parent,
                    boundary_order: front_vertices.len(),
                    graph_time,
                    root_distance_mm: crossing.root_distance_mm,
                    parent_distance_mm: parent_distance_mm.max(0.0),
                });
                key_to_vertex.insert(key, id);
                front_vertices.push(id);
                id
            };
            leaf_vertices.push(id);
        }
        fronts.push(Wavefront {
            phase,
            graph_time,
            vertices: front_vertices,
        });
        previous_leaf_vertices = Some(leaf_vertices.clone());
        front_leaf_vertices.push(leaf_vertices);
    }

    event_specs.sort_by(|left, right| {
        left.time
            .total_cmp(&right.time)
            .then_with(|| left.node.cmp(&right.node))
            .then_with(|| {
                position_signature(left.position).cmp(&position_signature(right.position))
            })
    });
    event_specs.dedup_by(|left, right| {
        left.node == right.node
            && PositionKey::from(left.position) == PositionKey::from(right.position)
    });
    let event_seam_anchors = event_specs
        .into_iter()
        .enumerate()
        .map(|(event_id, event)| {
            Ok(EventSeamAnchor {
                event_id: u32::try_from(event_id).map_err(|_| {
                    WavefrontError::resource(WavefrontErrorReason::WavefrontResourceLimit)
                })?,
                graph_node: event.node,
                point: graph.point_at(event.position).map_err(|_| {
                    WavefrontError::graph(WavefrontErrorReason::InvalidGraphPosition)
                })?,
                graph_position: event.position,
                graph_time: event.time,
                boundary_order: event.boundary_order,
            })
        })
        .collect::<Result<Vec<_>, WavefrontError>>()?;

    let family = WavefrontFamily {
        kind,
        guide_spacing_mm,
        fronts,
        vertices,
        event_seam_anchors,
        core,
        polygon_perimeter_mm,
        leaf_count: leaf_paths.len(),
        front_leaf_vertices,
    };
    family.validate(graph)?;
    Ok(family)
}

#[derive(Clone, Copy, Debug)]
struct Crossing {
    position: GraphPosition,
    root_distance_mm: f64,
}

fn crossing_at_time(path: &ScheduledLeafPath, graph_time: f64) -> Result<Crossing, WavefrontError> {
    if graph_time <= 0.0 {
        return Ok(Crossing {
            position: path.start,
            root_distance_mm: 0.0,
        });
    }
    let segment = path
        .segments
        .iter()
        .find(|segment| graph_time <= segment.end_time + EVENT_EPSILON)
        .or_else(|| path.segments.last())
        .ok_or_else(|| WavefrontError::validation(WavefrontErrorReason::InvalidLeafCrossings))?;
    if graph_time >= segment.end_time - EVENT_EPSILON {
        return Ok(Crossing {
            position: segment.end,
            root_distance_mm: segment.end_root_distance_mm,
        });
    }
    if graph_time <= segment.start_time + EVENT_EPSILON {
        return Ok(Crossing {
            position: segment.start,
            root_distance_mm: segment.start_root_distance_mm,
        });
    }
    let duration = segment.end_time - segment.start_time;
    if !duration.is_finite() || duration <= 0.0 {
        return Err(WavefrontError::validation(
            WavefrontErrorReason::NonMonotoneGraphTime,
        ));
    }
    let fraction = ((graph_time - segment.start_time) / duration).clamp(0.0, 1.0);
    let distance_mm = segment.start_edge_distance_mm
        + (segment.end_edge_distance_mm - segment.start_edge_distance_mm) * fraction;
    Ok(Crossing {
        position: GraphPosition::Edge {
            edge: segment.edge,
            distance_mm,
        },
        root_distance_mm: segment.start_root_distance_mm
            + (segment.end_root_distance_mm - segment.start_root_distance_mm) * fraction,
    })
}

fn point_event_specs(
    graph: &MedialGraph,
    rooted: &RootedTree,
) -> Result<Vec<EventSpec>, WavefrontError> {
    let mut boundary_order = vec![usize::MAX; rooted.node_count];
    for (leaf_order, path) in rooted.leaf_paths.iter().enumerate() {
        boundary_order[path.leaf.index()] = boundary_order[path.leaf.index()].min(leaf_order);
        for segment in &path.segments {
            if let GraphPosition::Node(node) = segment.start {
                boundary_order[node.index()] = boundary_order[node.index()].min(leaf_order);
            }
            if let GraphPosition::Node(node) = segment.end {
                boundary_order[node.index()] = boundary_order[node.index()].min(leaf_order);
            }
        }
    }
    let mut events = graph
        .nodes
        .iter()
        .map(|node| EventSpec {
            node: Some(node.id),
            position: GraphPosition::Node(node.id),
            time: rooted.node_time[node.id.index()],
            boundary_order: boundary_order[node.id.index()].min(graph.leaves.len()),
        })
        .collect::<Vec<_>>();
    if rooted.root >= rooted.node_count {
        events.push(EventSpec {
            node: None,
            position: rooted.root_position,
            time: 0.0,
            boundary_order: 0,
        });
    }
    Ok(events)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum PositionKey {
    Node(u32),
    Edge(u32, u64),
}

impl From<GraphPosition> for PositionKey {
    fn from(value: GraphPosition) -> Self {
        match value {
            GraphPosition::Node(node) => Self::Node(node.0),
            GraphPosition::Edge { edge, distance_mm } => Self::Edge(edge.0, distance_mm.to_bits()),
        }
    }
}
