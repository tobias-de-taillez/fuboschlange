use super::{WavefrontError, WavefrontErrorReason};
use crate::geometry::{Intersection, POSITION_TOLERANCE_MM, primitive_intersections};
use crate::medial_axis::{GraphPosition, MedialGraph, NodeId};
use crate::model::{PathPrimitive, Point};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct WavefrontVertexId(pub u32);

impl WavefrontVertexId {
    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WavefrontFamilyKind {
    Point,
    Skeleton,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkeletonSide {
    Forward,
    Reverse,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CoreCycleVertex {
    pub graph_position: GraphPosition,
    pub side: SkeletonSide,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RadiusCapableCore {
    pub center: GraphPosition,
    pub cycle: Vec<CoreCycleVertex>,
    pub skeleton_positions: Vec<GraphPosition>,
    pub skeleton_length_mm: f64,
    pub perimeter_proxy_mm: f64,
    pub reserved_turn_diameter_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WavefrontVertex {
    pub id: WavefrontVertexId,
    pub point: Point,
    pub graph_position: GraphPosition,
    pub parent: Option<WavefrontVertexId>,
    pub boundary_order: usize,
    pub graph_time: f64,
    pub root_distance_mm: f64,
    pub parent_distance_mm: f64,
}

impl WavefrontVertex {
    pub const fn parent_count(&self) -> usize {
        if self.parent.is_some() { 1 } else { 0 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Wavefront {
    pub phase: usize,
    pub graph_time: f64,
    pub vertices: Vec<WavefrontVertexId>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EventSeamAnchor {
    pub event_id: u32,
    pub graph_node: Option<NodeId>,
    pub point: Point,
    pub graph_position: GraphPosition,
    pub graph_time: f64,
    pub boundary_order: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WavefrontStableSignature {
    pub kind: WavefrontFamilyKind,
    pub guide_spacing_bits: u64,
    pub fronts: Vec<(usize, u64, Vec<u32>)>,
    pub vertices: Vec<(u32, PositionSignature, Option<u32>, usize, u64, u64)>,
    pub events: Vec<(u32, Option<u32>, PositionSignature, u64, usize)>,
    pub core_center: PositionSignature,
    pub core_cycle: Vec<(PositionSignature, SkeletonSide)>,
    pub core_positions: Vec<PositionSignature>,
    pub core_measure_bits: [u64; 3],
    pub polygon_perimeter_bits: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum PositionSignature {
    Node(u32),
    Edge { edge: u32, distance_bits: u64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct WavefrontFamily {
    pub kind: WavefrontFamilyKind,
    pub guide_spacing_mm: f64,
    pub fronts: Vec<Wavefront>,
    pub vertices: Vec<WavefrontVertex>,
    pub event_seam_anchors: Vec<EventSeamAnchor>,
    pub core: RadiusCapableCore,
    pub polygon_perimeter_mm: Option<f64>,
    pub(crate) leaf_count: usize,
    pub(crate) front_leaf_vertices: Vec<Vec<WavefrontVertexId>>,
}

impl WavefrontFamily {
    pub fn max_parent_distance_mm(&self) -> f64 {
        self.vertices
            .iter()
            .map(|vertex| vertex.parent_distance_mm)
            .fold(0.0, f64::max)
    }

    pub fn crosses_each_root_leaf_path_once(&self) -> bool {
        self.leaf_count > 0
            && self.front_leaf_vertices.len() == self.fronts.len()
            && self
                .front_leaf_vertices
                .iter()
                .all(|crossings| crossings.len() == self.leaf_count)
            && self
                .front_leaf_vertices
                .iter()
                .zip(&self.fronts)
                .all(|(crossings, front)| {
                    crossings
                        .iter()
                        .all(|crossing| front.vertices.contains(crossing))
                })
    }

    pub fn stable_signature(&self) -> WavefrontStableSignature {
        WavefrontStableSignature {
            kind: self.kind,
            guide_spacing_bits: self.guide_spacing_mm.to_bits(),
            fronts: self
                .fronts
                .iter()
                .map(|front| {
                    (
                        front.phase,
                        front.graph_time.to_bits(),
                        front.vertices.iter().map(|vertex| vertex.0).collect(),
                    )
                })
                .collect(),
            vertices: self
                .vertices
                .iter()
                .map(|vertex| {
                    (
                        vertex.id.0,
                        position_signature(vertex.graph_position),
                        vertex.parent.map(|parent| parent.0),
                        vertex.boundary_order,
                        vertex.graph_time.to_bits(),
                        vertex.root_distance_mm.to_bits(),
                    )
                })
                .collect(),
            events: self
                .event_seam_anchors
                .iter()
                .map(|event| {
                    (
                        event.event_id,
                        event.graph_node.map(|node| node.0),
                        position_signature(event.graph_position),
                        event.graph_time.to_bits(),
                        event.boundary_order,
                    )
                })
                .collect(),
            core_center: position_signature(self.core.center),
            core_cycle: self
                .core
                .cycle
                .iter()
                .map(|vertex| (position_signature(vertex.graph_position), vertex.side))
                .collect(),
            core_positions: self
                .core
                .skeleton_positions
                .iter()
                .copied()
                .map(position_signature)
                .collect(),
            core_measure_bits: [
                self.core.skeleton_length_mm.to_bits(),
                self.core.perimeter_proxy_mm.to_bits(),
                self.core.reserved_turn_diameter_mm.to_bits(),
            ],
            polygon_perimeter_bits: self.polygon_perimeter_mm.map(f64::to_bits),
        }
    }

    pub fn validate(&self, graph: &MedialGraph) -> Result<(), WavefrontError> {
        if !self.guide_spacing_mm.is_finite() || self.guide_spacing_mm <= 0.0 {
            return Err(WavefrontError::invalid(
                WavefrontErrorReason::InvalidGuideSpacing,
            ));
        }
        if self.fronts.is_empty()
            || self.vertices.is_empty()
            || self.front_leaf_vertices.len() != self.fronts.len()
        {
            return Err(WavefrontError::validation(
                WavefrontErrorReason::EmptyFamily,
            ));
        }
        validate_core(self, graph)?;

        let mut seen_vertices = vec![false; self.vertices.len()];
        for (phase, front) in self.fronts.iter().enumerate() {
            if front.phase != phase
                || !front.graph_time.is_finite()
                || front.graph_time < 0.0
                || front.graph_time > 1.0
                || front.vertices.is_empty()
            {
                return Err(WavefrontError::validation(
                    WavefrontErrorReason::InvalidFrontOrder,
                ));
            }
            if phase > 0 && front.graph_time <= self.fronts[phase - 1].graph_time {
                return Err(WavefrontError::validation(
                    WavefrontErrorReason::NonMonotoneGraphTime,
                ));
            }
            if !(front_is_simple(self, front)
                || (self.kind == WavefrontFamilyKind::Skeleton && phase == 0))
            {
                return Err(WavefrontError::validation(
                    WavefrontErrorReason::NonSimpleFront,
                ));
            }
            for (boundary_order, id) in front.vertices.iter().copied().enumerate() {
                let Some(vertex) = self.vertices.get(id.index()) else {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::InvalidVertexId,
                    ));
                };
                if vertex.id != id
                    || vertex.boundary_order != boundary_order
                    || vertex.graph_time != front.graph_time
                    || seen_vertices[id.index()]
                {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::InvalidFrontOrder,
                    ));
                }
                seen_vertices[id.index()] = true;
                let graph_point = graph.point_at(vertex.graph_position).map_err(|_| {
                    WavefrontError::validation(WavefrontErrorReason::InvalidGraphPosition)
                })?;
                if distance(graph_point, vertex.point) > POSITION_TOLERANCE_MM {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::InvalidGraphPosition,
                    ));
                }
                if !vertex.parent_distance_mm.is_finite()
                    || vertex.parent_distance_mm < 0.0
                    || vertex.parent_distance_mm > self.guide_spacing_mm + 1e-9
                {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::ParentDistanceExceeded,
                    ));
                }
                if let Some(parent_id) = vertex.parent {
                    let Some(parent) = self.vertices.get(parent_id.index()) else {
                        return Err(WavefrontError::validation(
                            WavefrontErrorReason::InvalidParent,
                        ));
                    };
                    if phase == 0
                        || !self.fronts[phase - 1].vertices.contains(&parent_id)
                        || parent.graph_time >= vertex.graph_time
                        || parent.root_distance_mm > vertex.root_distance_mm + 1e-9
                    {
                        return Err(WavefrontError::validation(
                            WavefrontErrorReason::InvalidParent,
                        ));
                    }
                } else if phase != 0 {
                    return Err(WavefrontError::validation(
                        WavefrontErrorReason::InvalidParent,
                    ));
                }
            }
            if phase > 0 && !non_intersecting_nested(self, &self.fronts[phase - 1], front) {
                return Err(WavefrontError::validation(
                    WavefrontErrorReason::NonNestedFronts,
                ));
            }
        }
        if seen_vertices.into_iter().any(|seen| !seen) || !self.crosses_each_root_leaf_path_once() {
            return Err(WavefrontError::validation(
                WavefrontErrorReason::InvalidLeafCrossings,
            ));
        }
        if self.event_seam_anchors.windows(2).any(|events| {
            events[0].event_id >= events[1].event_id || events[0].graph_time > events[1].graph_time
        }) {
            return Err(WavefrontError::validation(
                WavefrontErrorReason::InvalidEventOrder,
            ));
        }
        for event in &self.event_seam_anchors {
            let point = graph.point_at(event.graph_position).map_err(|_| {
                WavefrontError::validation(WavefrontErrorReason::InvalidGraphPosition)
            })?;
            if distance(point, event.point) > POSITION_TOLERANCE_MM
                || !event.graph_time.is_finite()
                || !(0.0..=1.0).contains(&event.graph_time)
            {
                return Err(WavefrontError::validation(
                    WavefrontErrorReason::InvalidEventOrder,
                ));
            }
        }
        Ok(())
    }
}

pub fn non_intersecting_nested(
    family: &WavefrontFamily,
    inner: &Wavefront,
    outer: &Wavefront,
) -> bool {
    if outer.phase != inner.phase + 1 || outer.graph_time <= inner.graph_time {
        return false;
    }
    let parents_are_nested = outer.vertices.iter().all(|id| {
        family
            .vertices
            .get(id.index())
            .and_then(|vertex| vertex.parent)
            .is_some_and(|parent| inner.vertices.contains(&parent))
    });
    parents_are_nested && fronts_do_not_cross(family, inner, outer)
}

fn validate_core(family: &WavefrontFamily, graph: &MedialGraph) -> Result<(), WavefrontError> {
    if !family.core.skeleton_length_mm.is_finite()
        || !family.core.perimeter_proxy_mm.is_finite()
        || !family.core.reserved_turn_diameter_mm.is_finite()
        || family.core.skeleton_length_mm < 0.0
        || family.core.perimeter_proxy_mm < 0.0
        || family.core.reserved_turn_diameter_mm < 160.0
        || family.core.cycle.is_empty()
        || family.core.skeleton_positions.is_empty()
        || family
            .polygon_perimeter_mm
            .is_some_and(|perimeter| !perimeter.is_finite() || perimeter <= 0.0)
    {
        return Err(WavefrontError::validation(
            WavefrontErrorReason::InvalidCore,
        ));
    }
    if (family.kind == WavefrontFamilyKind::Point && family.core.skeleton_length_mm != 0.0)
        || (family.kind == WavefrontFamilyKind::Skeleton && family.core.skeleton_length_mm <= 0.0)
    {
        return Err(WavefrontError::validation(
            WavefrontErrorReason::InvalidCore,
        ));
    }
    for position in std::iter::once(family.core.center)
        .chain(family.core.skeleton_positions.iter().copied())
        .chain(family.core.cycle.iter().map(|vertex| vertex.graph_position))
    {
        graph
            .point_at(position)
            .map_err(|_| WavefrontError::validation(WavefrontErrorReason::InvalidCore))?;
    }
    Ok(())
}

fn front_is_simple(family: &WavefrontFamily, front: &Wavefront) -> bool {
    if front.vertices.len() < 3 {
        return true;
    }
    if front
        .vertices
        .iter()
        .copied()
        .enumerate()
        .any(|(index, id)| {
            let next = front.vertices[(index + 1) % front.vertices.len()];
            distance(
                family.vertices[id.index()].point,
                family.vertices[next.index()].point,
            ) <= POSITION_TOLERANCE_MM
        })
    {
        return false;
    }
    let segments = front_segments(family, front);
    for first in 0..segments.len() {
        for second in (first + 1)..segments.len() {
            let adjacent = second == first + 1 || (first == 0 && second + 1 == segments.len());
            match primitive_intersections(&segments[first], &segments[second]) {
                Intersection::None if !adjacent => {}
                Intersection::Points(points) if adjacent => {
                    let shared = if second == first + 1 {
                        segments[first].end()
                    } else {
                        segments[first].start()
                    };
                    if points.len() != 1
                        || distance(points[0].point, shared) > POSITION_TOLERANCE_MM
                    {
                        return false;
                    }
                }
                _ => return false,
            }
        }
    }
    true
}

fn fronts_do_not_cross(family: &WavefrontFamily, first: &Wavefront, second: &Wavefront) -> bool {
    if first.vertices.len() < 3 || second.vertices.len() < 3 {
        return true;
    }
    let first_segments = front_segments(family, first);
    let second_segments = front_segments(family, second);
    first_segments.iter().all(|first_segment| {
        second_segments.iter().all(|second_segment| {
            matches!(
                primitive_intersections(first_segment, second_segment),
                Intersection::None
            )
        })
    })
}

fn front_segments(family: &WavefrontFamily, front: &Wavefront) -> Vec<PathPrimitive> {
    front
        .vertices
        .iter()
        .copied()
        .enumerate()
        .map(|(index, vertex)| PathPrimitive::Line {
            start: family.vertices[vertex.index()].point,
            end: family.vertices[front.vertices[(index + 1) % front.vertices.len()].index()].point,
        })
        .collect()
}

pub(crate) fn position_signature(position: GraphPosition) -> PositionSignature {
    match position {
        GraphPosition::Node(node) => PositionSignature::Node(node.0),
        GraphPosition::Edge { edge, distance_mm } => PositionSignature::Edge {
            edge: edge.0,
            distance_bits: distance_mm.to_bits(),
        },
    }
}

fn distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).hypot(a.y - b.y)
}
