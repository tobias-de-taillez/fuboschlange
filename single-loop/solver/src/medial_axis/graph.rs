use super::{MedialAxisError, MedialAxisErrorReason};
use crate::constants::TOPOLOGY_QUANTIZATION_MM;
use crate::geometry::{
    AllowedRegion, Intersection, PointClassification, Vec2, primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::f64::consts::TAU;

const ENDPOINT_TOLERANCE_MM: f64 = 1e-6;
const LENGTH_TOLERANCE_MM: f64 = 1e-8;
const COLLINEAR_SINE_TOLERANCE: f64 = 1e-10;
const RECONSTRUCTION_SNAP_MM: f64 = 1e-9;
const MAX_GRAPH_ITEMS: usize = 2_000_000;
const MAX_CROSSING_SEGMENT_PAIRS: usize = 10_000_000;
const MAX_INTERIOR_CLASSIFICATION_TESTS: usize = 50_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct NodeId(pub u32);

impl NodeId {
    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EdgeId(pub u32);

impl EdgeId {
    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MedialNode {
    pub id: NodeId,
    pub point: Point,
    pub clearance_mm: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MedialEdge {
    pub id: EdgeId,
    pub a: NodeId,
    pub b: NodeId,
    pub polyline: Vec<Point>,
    pub length_mm: f64,
    canonical_origin: Point,
    local_polyline: Vec<Point>,
}

impl MedialEdge {
    pub fn new(id: EdgeId, a: NodeId, b: NodeId, polyline: Vec<Point>) -> Self {
        let length_mm = polyline_length(&polyline);
        Self {
            id,
            a,
            b,
            local_polyline: polyline.clone(),
            polyline,
            length_mm,
            canonical_origin: Point::new(0.0, 0.0),
        }
    }

    pub(crate) fn with_local_polyline(
        id: EdgeId,
        a: NodeId,
        b: NodeId,
        polyline: Vec<Point>,
        local_polyline: Vec<Point>,
        canonical_origin: Point,
    ) -> Self {
        let length_mm = polyline_length(&local_polyline);
        Self {
            id,
            a,
            b,
            polyline,
            length_mm,
            canonical_origin,
            local_polyline,
        }
    }

    pub fn point_at_distance(&self, distance_mm: f64) -> Result<Point, MedialAxisError> {
        let measured_length = polyline_length(&self.polyline);
        let provenance_length = polyline_length(&self.local_polyline);
        if !self.length_mm.is_finite()
            || self.length_mm <= 0.0
            || !measured_length.is_finite()
            || measured_length <= 0.0
            || self.local_polyline.len() != self.polyline.len()
            || !provenance_length.is_finite()
            || (provenance_length - self.length_mm).abs()
                > LENGTH_TOLERANCE_MM * provenance_length.max(self.length_mm).max(1.0)
            || self.polyline.iter().any(|point| !finite_point(*point))
            || self
                .local_polyline
                .iter()
                .any(|point| !finite_point(*point))
            || !self
                .polyline
                .iter()
                .zip(&self.local_polyline)
                .all(|(public, local)| *public == restore_point(self.canonical_origin, *local))
            || !distance_mm.is_finite()
            || distance_mm < -LENGTH_TOLERANCE_MM
            || distance_mm > self.length_mm + LENGTH_TOLERANCE_MM
        {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        point_at_polyline_distance(&self.local_polyline, distance_mm)
            .map(|point| restore_point(self.canonical_origin, point))
    }

    pub fn point_at_fraction(&self, fraction: f64) -> Result<Point, MedialAxisError> {
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        self.point_at_distance(self.length_mm * fraction)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GraphPosition {
    Node(NodeId),
    Edge { edge: EdgeId, distance_mm: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GraphCenter {
    pub point: Point,
    pub position: GraphPosition,
    pub radius_mm: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MedialGraph {
    pub nodes: Vec<MedialNode>,
    pub edges: Vec<MedialEdge>,
    pub ccw_edges: Vec<Vec<EdgeId>>,
    pub leaves: Vec<NodeId>,
    canonical_origin: Point,
    node_local_points: Vec<Point>,
    node_coordinate_keys: Vec<[i64; 2]>,
    node_source_ids: Vec<[u32; 2]>,
    edge_source_ids: Vec<[u32; 2]>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct BoundaryLocation {
    pub offset_mm: f64,
    pub point: Point,
    pub distance_mm: f64,
}

impl MedialGraph {
    pub fn from_parts(
        nodes: Vec<MedialNode>,
        edges: Vec<MedialEdge>,
    ) -> Result<Self, MedialAxisError> {
        let graph = Self::assemble(nodes, edges)?;
        Self::validate_assembled_topology(graph)
    }

    pub(crate) fn from_parts_with_source_ids(
        nodes: Vec<MedialNode>,
        edges: Vec<MedialEdge>,
        canonical_origin: Point,
        node_local_points: Vec<Point>,
        node_coordinate_keys: Vec<[i64; 2]>,
        node_source_ids: Vec<[u32; 2]>,
        edge_source_ids: Vec<[u32; 2]>,
    ) -> Result<Self, MedialAxisError> {
        let graph = Self::assemble_with_source_ids(
            nodes,
            edges,
            Some(canonical_origin),
            Some(node_local_points),
            Some(node_coordinate_keys),
            Some(node_source_ids),
            Some(edge_source_ids),
        )?;
        Self::validate_assembled_topology(graph)
    }

    fn validate_assembled_topology(graph: Self) -> Result<Self, MedialAxisError> {
        graph.preflight_public_resources()?;
        if !graph.is_connected() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        if !graph.is_acyclic() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::CyclicGraph,
            ));
        }
        if !graph.has_no_nonincident_crossings()? {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::EdgeCrossing,
            ));
        }
        Ok(graph)
    }

    fn assemble(nodes: Vec<MedialNode>, edges: Vec<MedialEdge>) -> Result<Self, MedialAxisError> {
        let node_local_points = nodes.iter().map(|node| node.point).collect();
        Self::assemble_with_source_ids(
            nodes,
            edges,
            Some(Point::new(0.0, 0.0)),
            Some(node_local_points),
            None,
            None,
            None,
        )
    }

    fn assemble_with_source_ids(
        nodes: Vec<MedialNode>,
        edges: Vec<MedialEdge>,
        canonical_origin: Option<Point>,
        node_local_points: Option<Vec<Point>>,
        node_coordinate_keys: Option<Vec<[i64; 2]>>,
        node_source_ids: Option<Vec<[u32; 2]>>,
        edge_source_ids: Option<Vec<[u32; 2]>>,
    ) -> Result<Self, MedialAxisError> {
        if nodes.is_empty() || edges.is_empty() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyGraph,
            ));
        }
        preflight_parts(&nodes, &edges)?;

        for (index, node) in nodes.iter().enumerate() {
            if node.id.index() != index {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidNodeId,
                ));
            }
            if !finite_point(node.point)
                || !node.clearance_mm.is_finite()
                || node.clearance_mm < 0.0
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
                ));
            }
        }

        for (index, edge) in edges.iter().enumerate() {
            if edge.id.index() != index {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeId,
                ));
            }
            if edge.a == edge.b || edge.a.index() >= nodes.len() || edge.b.index() >= nodes.len() {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeEndpoint,
                ));
            }
            if edge.polyline.len() < 2
                || edge.local_polyline.len() != edge.polyline.len()
                || edge.polyline.iter().any(|point| !finite_point(*point))
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
                ));
            }
            let Some(first) = edge.polyline.first().copied() else {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidPolylineEndpoint,
                ));
            };
            let Some(last) = edge.polyline.last().copied() else {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidPolylineEndpoint,
                ));
            };
            if distance(first, nodes[edge.a.index()].point) > ENDPOINT_TOLERANCE_MM
                || distance(last, nodes[edge.b.index()].point) > ENDPOINT_TOLERANCE_MM
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidPolylineEndpoint,
                ));
            }
            let measured = polyline_length(&edge.polyline);
            if !edge.length_mm.is_finite()
                || edge.length_mm <= 0.0
                || !measured.is_finite()
                || measured <= 0.0
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::ZeroLengthEdge,
                ));
            }
        }

        let canonical_origin = canonical_origin.unwrap_or(Point::new(0.0, 0.0));
        if !finite_point(canonical_origin) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        let node_local_points = node_local_points.unwrap_or_else(|| {
            nodes
                .iter()
                .map(|node| Point::new(node.point.x, node.point.y))
                .collect()
        });
        if edges
            .iter()
            .any(|edge| edge.canonical_origin != canonical_origin)
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
        }
        validate_local_shadow(&nodes, &edges, &node_local_points)?;

        let ccw_edges = compute_embedding(nodes.len(), &edges)?;
        let leaves = ccw_edges
            .iter()
            .enumerate()
            .filter_map(|(index, incident)| (incident.len() == 1).then_some(NodeId(index as u32)))
            .collect();
        let edge_source_ids = edge_source_ids
            .unwrap_or_else(|| edges.iter().map(|edge| [u32::MAX, edge.id.0]).collect());
        if edge_source_ids.len() != edges.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
        }
        let node_source_ids = node_source_ids.unwrap_or_else(|| {
            ccw_edges
                .iter()
                .map(|incident| {
                    incident
                        .iter()
                        .filter_map(|edge| edge_source_ids.get(edge.index()).copied())
                        .min()
                        .unwrap_or([u32::MAX; 2])
                })
                .collect()
        });
        if node_source_ids.len() != nodes.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        let node_coordinate_keys = node_coordinate_keys.unwrap_or_else(|| {
            node_local_points
                .iter()
                .copied()
                .map(local_coordinate_key)
                .collect()
        });
        if node_coordinate_keys.len() != nodes.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        Ok(Self {
            nodes,
            edges,
            ccw_edges,
            leaves,
            canonical_origin,
            node_local_points,
            node_coordinate_keys,
            node_source_ids,
            edge_source_ids,
        })
    }

    fn preflight_public_resources(&self) -> Result<(), MedialAxisError> {
        preflight_parts(&self.nodes, &self.edges)?;
        preflight_edge_local_polylines(&self.edges)?;
        if self.ccw_edges.len() > MAX_GRAPH_ITEMS || self.leaves.len() > MAX_GRAPH_ITEMS {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }
        let embedding_entries = self
            .ccw_edges
            .iter()
            .try_fold(0usize, |total, incident| total.checked_add(incident.len()));
        if embedding_entries.is_none_or(|entries| entries > MAX_GRAPH_ITEMS) {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }
        Ok(())
    }

    fn local_shadow_is_current(&self) -> bool {
        self.node_local_points.len() == self.nodes.len()
            && self.node_coordinate_keys.len() == self.nodes.len()
            && self.node_source_ids.len() == self.nodes.len()
            && self.edge_source_ids.len() == self.edges.len()
            && self
                .nodes
                .iter()
                .zip(&self.node_local_points)
                .all(|(node, local)| node.point == restore_point(self.canonical_origin, *local))
            && self.edges.iter().all(|edge| {
                edge.canonical_origin == self.canonical_origin
                    && edge.polyline.len() == edge.local_polyline.len()
                    && edge
                        .polyline
                        .iter()
                        .zip(&edge.local_polyline)
                        .all(|(public, local)| {
                            *public == restore_point(self.canonical_origin, *local)
                        })
            })
    }

    fn reassemble_for_public_validation(&self) -> Result<Self, MedialAxisError> {
        if self.local_shadow_is_current() {
            Self::assemble_with_source_ids(
                self.nodes.clone(),
                self.edges.clone(),
                Some(self.canonical_origin),
                Some(self.node_local_points.clone()),
                Some(self.node_coordinate_keys.clone()),
                Some(self.node_source_ids.clone()),
                Some(self.edge_source_ids.clone()),
            )
        } else {
            let edges = self
                .edges
                .iter()
                .map(|edge| MedialEdge::new(edge.id, edge.a, edge.b, edge.polyline.clone()))
                .collect();
            Self::assemble(self.nodes.clone(), edges)
        }
    }

    pub const fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub const fn edge_count(&self) -> usize {
        self.edges.len()
    }

    pub fn degree(&self, node: NodeId) -> Option<usize> {
        self.ccw_edges.get(node.index()).map(Vec::len)
    }

    pub fn is_connected(&self) -> bool {
        if self.preflight_public_resources().is_err() || self.nodes.is_empty() {
            return false;
        }
        let mut seen = vec![false; self.nodes.len()];
        let mut stack = vec![NodeId(0)];
        seen[0] = true;
        while let Some(node) = stack.pop() {
            let Some(incident) = self.ccw_edges.get(node.index()) else {
                return false;
            };
            for edge_id in incident {
                let Some(edge) = self.edges.get(edge_id.index()) else {
                    return false;
                };
                let Some(next) = other_endpoint(edge, node) else {
                    return false;
                };
                if next.index() >= seen.len() {
                    return false;
                }
                if !seen[next.index()] {
                    seen[next.index()] = true;
                    stack.push(next);
                }
            }
        }
        seen.into_iter().all(|value| value)
    }

    pub fn is_acyclic(&self) -> bool {
        !self.nodes.is_empty()
            && self.is_connected()
            && self.edges.len() == self.nodes.len().saturating_sub(1)
    }

    pub fn all_samples_inside(&self, allowed: &AllowedRegion) -> bool {
        self.preflight_public_resources().is_ok()
            && ensure_interior_validation_budget(self, allowed).is_ok()
            && self
                .edges
                .iter()
                .all(|edge| polyline_is_inside_allowed(&edge.polyline, allowed))
    }

    pub fn has_no_crossings(&self) -> bool {
        self.preflight_public_resources()
            .and_then(|()| self.reassemble_for_public_validation())
            .and_then(|graph| crossings_are_valid(&graph, false))
            .unwrap_or(false)
    }

    fn has_no_nonincident_crossings(&self) -> Result<bool, MedialAxisError> {
        self.preflight_public_resources()?;
        crossings_are_valid(self, true)
    }

    pub fn embedding_is_ccw(&self) -> bool {
        self.preflight_public_resources().is_ok()
            && self
                .reassemble_for_public_validation()
                .map(|graph| graph.ccw_edges == self.ccw_edges)
                .unwrap_or(false)
    }

    pub fn validate(&self, allowed: &AllowedRegion) -> Result<(), MedialAxisError> {
        self.preflight_public_resources()?;
        let mut independently_derived = self
            .reassemble_for_public_validation()
            .map_err(validation_or_resource_error)?;
        if !independently_derived.is_connected() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        if !independently_derived.is_acyclic() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::CyclicGraph,
            ));
        }
        ensure_interior_validation_budget(&independently_derived, allowed)?;
        if !independently_derived.all_samples_inside(allowed) {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::EdgeOutsideRegion,
            ));
        }
        if !crossings_are_valid(&independently_derived, false)? {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::EdgeCrossing,
            ));
        }
        independently_derived.sort_leaves_on_boundary(allowed)?;
        if independently_derived.leaves != self.leaves {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::LeafNotOnBoundary,
            ));
        }
        for leaf in &independently_derived.leaves {
            let Some(node) = independently_derived.nodes.get(leaf.index()) else {
                return Err(MedialAxisError::validation(
                    MedialAxisErrorReason::InvalidNodeId,
                ));
            };
            if allowed.exact_boundary_distance(node.point) > TOPOLOGY_QUANTIZATION_MM + 1e-9
                || allowed.classify_point(node.point) == PointClassification::Outside
                || independently_derived.degree(*leaf) != Some(1)
            {
                return Err(MedialAxisError::validation(
                    MedialAxisErrorReason::LeafNotOnBoundary,
                ));
            }
        }
        if independently_derived.ccw_edges != self.ccw_edges {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::InvalidCyclicEmbedding,
            ));
        }
        Ok(())
    }

    pub fn boundary_leaf_offsets(
        &self,
        allowed: &AllowedRegion,
    ) -> Result<Vec<f64>, MedialAxisError> {
        self.preflight_public_resources()?;
        ensure_boundary_location_budget(self.leaves.len(), allowed.quantized_segments.len())?;
        let use_local =
            self.local_shadow_is_current() && self.canonical_origin == allowed.quantization_origin;
        let mut offsets = Vec::with_capacity(self.leaves.len());
        for leaf in &self.leaves {
            let node = self
                .nodes
                .get(leaf.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
            if use_local {
                let local = self.node_local_points[leaf.index()];
                let (offset_mm, distance_mm) = nearest_local_boundary_offset(allowed, local)?;
                if distance_mm > TOPOLOGY_QUANTIZATION_MM + 1e-9 {
                    return Err(MedialAxisError::validation(
                        MedialAxisErrorReason::LeafNotOnBoundary,
                    ));
                }
                offsets.push(offset_mm);
            } else {
                let location = nearest_boundary_location(allowed, node.point)?;
                if location.distance_mm > TOPOLOGY_QUANTIZATION_MM + 1e-9 {
                    return Err(MedialAxisError::validation(
                        MedialAxisErrorReason::LeafNotOnBoundary,
                    ));
                }
                offsets.push(location.offset_mm);
            }
        }
        offsets.sort_by(f64::total_cmp);
        Ok(offsets)
    }

    pub fn stable_event_ids(&self) -> Vec<NodeId> {
        if self.preflight_public_resources().is_err() {
            return Vec::new();
        }
        self.nodes.iter().map(|node| node.id).collect()
    }

    pub fn position_on_edge(
        &self,
        edge: EdgeId,
        fraction: f64,
    ) -> Result<GraphPosition, MedialAxisError> {
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        let edge = self
            .edges
            .get(edge.index())
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        Ok(GraphPosition::Edge {
            edge: edge.id,
            distance_mm: edge.length_mm * fraction,
        })
    }

    pub fn point_at(&self, position: GraphPosition) -> Result<Point, MedialAxisError> {
        match position {
            GraphPosition::Node(node) => self
                .nodes
                .get(node.index())
                .map(|node| node.point)
                .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidNodeId)),
            GraphPosition::Edge { edge, distance_mm } => {
                if self.local_shadow_is_current() {
                    self.local_point_at_distance(edge, distance_mm)
                        .map(|point| self.restore_local_point(point))
                } else {
                    self.edges
                        .get(edge.index())
                        .ok_or_else(|| {
                            MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId)
                        })?
                        .point_at_distance(distance_mm)
                }
            }
        }
    }

    pub fn center(&self) -> Result<GraphCenter, MedialAxisError> {
        self.preflight_public_resources()?;
        let graph = self
            .reassemble_for_public_validation()
            .map_err(validation_or_resource_error)?;
        if !graph.is_acyclic() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::CyclicGraph,
            ));
        }
        graph.center_of_valid_tree()
    }

    fn center_of_valid_tree(&self) -> Result<GraphCenter, MedialAxisError> {
        let (first, _, _) = self.farthest_from(NodeId(0))?;
        let (second, diameter, parent) = self.farthest_from(first)?;
        let mut remaining = diameter * 0.5;
        let mut current = second;
        if remaining <= LENGTH_TOLERANCE_MM {
            let point = self.nodes[current.index()].point;
            return Ok(GraphCenter {
                point,
                position: GraphPosition::Node(current),
                radius_mm: diameter * 0.5,
            });
        }

        while current != first {
            let (previous, edge_id) = parent
                .get(current.index())
                .and_then(|entry| *entry)
                .ok_or_else(|| {
                    MedialAxisError::validation(MedialAxisErrorReason::DisconnectedGraph)
                })?;
            let edge = self
                .edges
                .get(edge_id.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
            if remaining < edge.length_mm - LENGTH_TOLERANCE_MM {
                let distance_from_a = if edge.a == current {
                    remaining
                } else {
                    edge.length_mm - remaining
                };
                let position = GraphPosition::Edge {
                    edge: edge_id,
                    distance_mm: distance_from_a,
                };
                return Ok(GraphCenter {
                    point: self.restore_local_point(
                        self.local_point_at_distance(edge_id, distance_from_a)?,
                    ),
                    position,
                    radius_mm: diameter * 0.5,
                });
            }
            if (remaining - edge.length_mm).abs() <= LENGTH_TOLERANCE_MM {
                let point = self.nodes[previous.index()].point;
                return Ok(GraphCenter {
                    point,
                    position: GraphPosition::Node(previous),
                    radius_mm: diameter * 0.5,
                });
            }
            remaining -= edge.length_mm;
            current = previous;
        }

        let point = self.nodes[first.index()].point;
        Ok(GraphCenter {
            point,
            position: GraphPosition::Node(first),
            radius_mm: diameter * 0.5,
        })
    }

    fn farthest_from(
        &self,
        start: NodeId,
    ) -> Result<(NodeId, f64, Vec<Option<(NodeId, EdgeId)>>), MedialAxisError> {
        if start.index() >= self.nodes.len() {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        let mut distances = vec![f64::NEG_INFINITY; self.nodes.len()];
        let mut parent = vec![None; self.nodes.len()];
        let mut stack = vec![start];
        distances[start.index()] = 0.0;
        while let Some(node) = stack.pop() {
            let incident = self
                .ccw_edges
                .get(node.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
            for edge_id in incident.iter().rev() {
                let edge = self.edges.get(edge_id.index()).ok_or_else(|| {
                    MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId)
                })?;
                let next = other_endpoint(edge, node).ok_or_else(|| {
                    MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeEndpoint)
                })?;
                if next == start || parent[next.index()].is_some() {
                    continue;
                }
                parent[next.index()] = Some((node, *edge_id));
                distances[next.index()] = distances[node.index()] + edge.length_mm;
                stack.push(next);
            }
        }
        let mut farthest = start;
        for node in &self.nodes {
            let order = distances[node.id.index()].total_cmp(&distances[farthest.index()]);
            if order == Ordering::Greater || (order == Ordering::Equal && node.id < farthest) {
                farthest = node.id;
            }
        }
        Ok((farthest, distances[farthest.index()], parent))
    }

    pub(crate) fn sort_leaves_on_boundary(
        &mut self,
        allowed: &AllowedRegion,
    ) -> Result<(), MedialAxisError> {
        self.preflight_public_resources()?;
        ensure_boundary_location_budget(self.leaves.len(), allowed.quantized_segments.len())?;
        let mut located = Vec::with_capacity(self.leaves.len());
        for leaf in &self.leaves {
            let offset_mm = if self.canonical_origin == allowed.quantization_origin {
                let point = self
                    .node_local_points
                    .get(leaf.index())
                    .copied()
                    .ok_or_else(|| {
                        MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId)
                    })?;
                nearest_local_boundary_offset(allowed, point)?.0
            } else {
                let point = self
                    .nodes
                    .get(leaf.index())
                    .ok_or_else(|| {
                        MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId)
                    })?
                    .point;
                nearest_boundary_location(allowed, point)?.offset_mm
            };
            located.push((offset_mm, *leaf));
        }
        located.sort_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.cmp(&right.1))
        });
        self.leaves = located.into_iter().map(|(_, leaf)| leaf).collect();
        Ok(())
    }

    pub(crate) fn collapse_collinear_nodes(&mut self) -> Result<usize, MedialAxisError> {
        self.preflight_public_resources()?;
        let collapsible = (0..self.nodes.len())
            .map(|index| self.node_is_collinear_degree_two(NodeId(index as u32)))
            .collect::<Vec<_>>();
        let collapsed = collapsible.iter().filter(|value| **value).count();
        if collapsed == 0 {
            return Ok(0);
        }

        let important = collapsible
            .iter()
            .enumerate()
            .filter_map(|(index, collapse)| (!*collapse).then_some(NodeId(index as u32)))
            .collect::<Vec<_>>();
        let mut visited = vec![false; self.edges.len()];
        let mut geometries = Vec::new();
        let mut geometry_source_ids = Vec::new();
        for start in important.iter().copied() {
            let mut incident = self.ccw_edges[start.index()].clone();
            incident.sort();
            for first_edge in incident {
                if visited[first_edge.index()] {
                    continue;
                }
                visited[first_edge.index()] = true;
                let mut current = start;
                let mut edge_id = first_edge;
                let mut source_ids =
                    *self.edge_source_ids.get(edge_id.index()).ok_or_else(|| {
                        MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeId)
                    })?;
                let mut polyline = self.oriented_local_polyline(edge_id, current)?;
                let mut next =
                    other_endpoint(&self.edges[edge_id.index()], current).ok_or_else(|| {
                        MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
                    })?;
                while collapsible[next.index()] {
                    let continuation = self.ccw_edges[next.index()]
                        .iter()
                        .copied()
                        .find(|candidate| *candidate != edge_id)
                        .ok_or_else(|| {
                            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
                        })?;
                    if visited[continuation.index()] {
                        return Err(MedialAxisError::validation(
                            MedialAxisErrorReason::CyclicGraph,
                        ));
                    }
                    visited[continuation.index()] = true;
                    let continuation_points = self.oriented_local_polyline(continuation, next)?;
                    source_ids = source_ids.min(
                        *self
                            .edge_source_ids
                            .get(continuation.index())
                            .ok_or_else(|| {
                                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeId)
                            })?,
                    );
                    polyline.extend(continuation_points.into_iter().skip(1));
                    current = next;
                    edge_id = continuation;
                    next =
                        other_endpoint(&self.edges[edge_id.index()], current).ok_or_else(|| {
                            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
                        })?;
                }
                geometries.push(polyline);
                geometry_source_ids.push(source_ids);
            }
        }
        if visited.iter().any(|value| !*value) {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        let endpoint_keys = self.endpoint_keys_for_local_polylines(&geometries)?;
        let rebuilt = graph_from_polylines(
            &geometries,
            &geometry_source_ids,
            self.canonical_origin,
            &endpoint_keys,
            |point| {
                self.nodes
                    .iter()
                    .find(|node| node.point == point)
                    .map(|node| node.clearance_mm)
                    .unwrap_or(0.0)
            },
        )?;
        *self = rebuilt;
        Ok(collapsed)
    }

    fn node_is_collinear_degree_two(&self, node: NodeId) -> bool {
        let Some(incident) = self.ccw_edges.get(node.index()) else {
            return false;
        };
        if incident.len() != 2 {
            return false;
        }
        let Some(first) = self.edges.get(incident[0].index()) else {
            return false;
        };
        let Some(second) = self.edges.get(incident[1].index()) else {
            return false;
        };
        let Some(a) = self
            .local_outgoing_direction(first.id, node)
            .and_then(Vec2::normalized)
        else {
            return false;
        };
        let Some(b) = self
            .local_outgoing_direction(second.id, node)
            .and_then(Vec2::normalized)
        else {
            return false;
        };
        cross(a, b).abs() <= COLLINEAR_SINE_TOLERANCE && a.dot(b) < 0.0
    }

    pub(crate) fn replace_with_local_polylines(
        &mut self,
        allowed: &AllowedRegion,
        polylines: &[Vec<Point>],
        source_ids: &[[u32; 2]],
    ) -> Result<(), MedialAxisError> {
        self.preflight_public_resources()?;
        let endpoint_keys = self.endpoint_keys_for_local_polylines(polylines)?;
        *self = graph_from_polylines(
            polylines,
            source_ids,
            allowed.quantization_origin,
            &endpoint_keys,
            |point| allowed.exact_boundary_distance(point),
        )?;
        self.sort_leaves_on_boundary(allowed)
    }

    fn endpoint_keys_for_local_polylines(
        &self,
        polylines: &[Vec<Point>],
    ) -> Result<Vec<[[i64; 2]; 2]>, MedialAxisError> {
        preflight_polylines(polylines)?;
        let known_keys = self
            .node_local_points
            .iter()
            .zip(&self.node_coordinate_keys)
            .map(|(point, key)| (point_bits(*point), *key))
            .collect::<BTreeMap<_, _>>();
        let mut result = Vec::with_capacity(polylines.len());
        for polyline in polylines {
            let start = *polyline.first().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?;
            let end = *polyline.last().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?;
            result.push([
                known_keys
                    .get(&point_bits(start))
                    .copied()
                    .unwrap_or_else(|| local_coordinate_key(start)),
                known_keys
                    .get(&point_bits(end))
                    .copied()
                    .unwrap_or_else(|| local_coordinate_key(end)),
            ]);
        }
        Ok(result)
    }

    pub(crate) fn local_node_point(&self, node: NodeId) -> Option<Point> {
        self.node_local_points.get(node.index()).copied()
    }

    pub(crate) fn local_edge_polyline(&self, edge: EdgeId) -> Option<&[Point]> {
        self.edges
            .get(edge.index())
            .map(|edge| edge.local_polyline.as_slice())
    }

    pub(crate) fn local_edge_length(&self, edge: EdgeId) -> Option<f64> {
        self.local_edge_polyline(edge).map(polyline_length)
    }

    pub(crate) fn restore_local_point(&self, point: Point) -> Point {
        restore_point(self.canonical_origin, point)
    }

    pub(crate) fn local_point_at_distance(
        &self,
        edge: EdgeId,
        distance_mm: f64,
    ) -> Result<Point, MedialAxisError> {
        let polyline = self
            .local_edge_polyline(edge)
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        point_at_polyline_distance(polyline, distance_mm)
    }

    pub(crate) fn local_distance_at_segment_parameter(
        &self,
        edge: EdgeId,
        segment: usize,
        parameter: f64,
    ) -> Option<f64> {
        let polyline = self.local_edge_polyline(edge)?;
        Some(
            polyline
                .windows(2)
                .take(segment)
                .map(|pair| distance(pair[0], pair[1]))
                .sum::<f64>()
                + polyline
                    .get(segment..=segment + 1)
                    .map(|pair| distance(pair[0], pair[1]) * parameter)?,
        )
    }

    pub(crate) fn local_polyline_slice(
        &self,
        edge: EdgeId,
        start_mm: f64,
        end_mm: f64,
    ) -> Result<Vec<Point>, MedialAxisError> {
        let polyline = self
            .local_edge_polyline(edge)
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        polyline_slice_values(polyline, start_mm, end_mm)
    }

    pub(crate) fn local_geometry_copy(&self) -> Result<Self, MedialAxisError> {
        let nodes = self
            .nodes
            .iter()
            .zip(&self.node_local_points)
            .map(|(node, local)| MedialNode {
                id: node.id,
                point: *local,
                clearance_mm: node.clearance_mm,
            })
            .collect::<Vec<_>>();
        let edges = self
            .edges
            .iter()
            .map(|edge| MedialEdge::new(edge.id, edge.a, edge.b, edge.local_polyline.clone()))
            .collect::<Vec<_>>();
        Self::assemble(nodes, edges)
    }

    fn oriented_local_polyline(
        &self,
        edge: EdgeId,
        from: NodeId,
    ) -> Result<Vec<Point>, MedialAxisError> {
        let topology = self
            .edges
            .get(edge.index())
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeId))?;
        let mut result = topology.local_polyline.clone();
        if topology.a == from {
            Ok(result)
        } else if topology.b == from {
            result.reverse();
            Ok(result)
        } else {
            Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeEndpoint,
            ))
        }
    }

    fn local_outgoing_direction(&self, edge: EdgeId, node: NodeId) -> Option<Vec2> {
        let topology = self.edges.get(edge.index())?;
        outgoing_direction_from_polyline(topology, &topology.local_polyline, node)
    }

    pub(crate) fn edge_source_ids(&self, edge: EdgeId) -> Option<[u32; 2]> {
        self.edge_source_ids.get(edge.index()).copied()
    }

    pub(crate) fn polyline_between_edge_positions(
        &self,
        first_edge: EdgeId,
        first_distance_mm: f64,
        second_edge: EdgeId,
        second_distance_mm: f64,
    ) -> Result<Vec<Point>, MedialAxisError> {
        let first = self
            .edges
            .get(first_edge.index())
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        let second = self
            .edges
            .get(second_edge.index())
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        if first_edge == second_edge {
            if first_distance_mm <= second_distance_mm {
                return polyline_slice_allowing_zero(first, first_distance_mm, second_distance_mm);
            }
            let mut path =
                polyline_slice_allowing_zero(first, second_distance_mm, first_distance_mm)?;
            path.reverse();
            return Ok(path);
        }

        let first_choices = [
            (
                first.a,
                first_distance_mm,
                edge_position_to_endpoint(first, first_distance_mm, first.a)?,
            ),
            (
                first.b,
                first.length_mm - first_distance_mm,
                edge_position_to_endpoint(first, first_distance_mm, first.b)?,
            ),
        ];
        let second_choices = [
            (
                second.a,
                second_distance_mm,
                edge_position_to_endpoint(second, second_distance_mm, second.a)?,
            ),
            (
                second.b,
                second.length_mm - second_distance_mm,
                edge_position_to_endpoint(second, second_distance_mm, second.b)?,
            ),
        ];
        let mut best: Option<(f64, NodeId, NodeId, Vec<Point>)> = None;
        for (first_node, first_length, first_path) in &first_choices {
            for (second_node, second_length, second_path_from_position) in &second_choices {
                let (node_length, node_path) = self.node_path(*first_node, *second_node)?;
                let total_length = first_length + node_length + second_length;
                let mut path = first_path.clone();
                append_polyline(&mut path, &node_path);
                let mut second_path = second_path_from_position.clone();
                second_path.reverse();
                append_polyline(&mut path, &second_path);
                let candidate = (total_length, *first_node, *second_node, path);
                if best.as_ref().is_none_or(|current| {
                    candidate.0 < current.0 - LENGTH_TOLERANCE_MM
                        || ((candidate.0 - current.0).abs() <= LENGTH_TOLERANCE_MM
                            && (candidate.1, candidate.2) < (current.1, current.2))
                }) {
                    best = Some(candidate);
                }
            }
        }
        best.map(|(_, _, _, path)| path)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::DisconnectedGraph))
    }

    fn node_path(&self, start: NodeId, end: NodeId) -> Result<(f64, Vec<Point>), MedialAxisError> {
        if start.index() >= self.nodes.len() || end.index() >= self.nodes.len() {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        if start == end {
            return Ok((0.0, vec![self.nodes[start.index()].point]));
        }
        let mut parent = vec![None; self.nodes.len()];
        let mut stack = vec![start];
        parent[start.index()] = Some((start, EdgeId(u32::MAX)));
        while let Some(node) = stack.pop() {
            if node == end {
                break;
            }
            let incident = self
                .ccw_edges
                .get(node.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
            for edge_id in incident.iter().rev() {
                let edge = self.edges.get(edge_id.index()).ok_or_else(|| {
                    MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId)
                })?;
                let next = other_endpoint(edge, node).ok_or_else(|| {
                    MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeEndpoint)
                })?;
                if next.index() >= parent.len() || parent[next.index()].is_some() {
                    continue;
                }
                parent[next.index()] = Some((node, *edge_id));
                stack.push(next);
            }
        }
        if parent[end.index()].is_none() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        let mut steps = Vec::new();
        let mut current = end;
        while current != start {
            let (previous, edge) = parent[current.index()].ok_or_else(|| {
                MedialAxisError::validation(MedialAxisErrorReason::DisconnectedGraph)
            })?;
            steps.push((previous, edge));
            current = previous;
        }
        steps.reverse();
        let mut path = vec![self.nodes[start.index()].point];
        let mut length = 0.0;
        let mut current = start;
        for (_previous, edge_id) in steps {
            let edge = self
                .edges
                .get(edge_id.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
            let edge_path = oriented_polyline(edge, current)?;
            append_polyline(&mut path, &edge_path);
            length += edge.length_mm;
            current = other_endpoint(edge, current).ok_or_else(|| {
                MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeEndpoint)
            })?;
        }
        Ok((length, path))
    }
}

pub(crate) fn graph_from_polylines<F>(
    polylines: &[Vec<Point>],
    source_ids: &[[u32; 2]],
    canonical_origin: Point,
    endpoint_keys: &[[[i64; 2]; 2]],
    clearance: F,
) -> Result<MedialGraph, MedialAxisError>
where
    F: Fn(Point) -> f64,
{
    if polylines.is_empty() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EmptyGraph,
        ));
    }
    preflight_polylines(polylines)?;
    if source_ids.len() != polylines.len() || endpoint_keys.len() != polylines.len() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::InvalidEdgeId,
        ));
    }
    let mut raw_endpoints = polylines
        .iter()
        .zip(source_ids)
        .zip(endpoint_keys)
        .filter_map(|((polyline, source_ids), keys)| {
            Some((
                (normalize_zero(*polyline.first()?), keys[0], *source_ids),
                (normalize_zero(*polyline.last()?), keys[1], *source_ids),
            ))
        })
        .flat_map(|(start, end)| [start, end])
        .collect::<Vec<_>>();
    raw_endpoints.sort_by(|left, right| {
        left.1
            .cmp(&right.1)
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| compare_points(&left.0, &right.0))
    });
    let reconstruction_origin = raw_endpoints
        .first()
        .map(|endpoint| endpoint.0)
        .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EmptyGraph))?;
    let mut endpoints: Vec<(Point, [i64; 2], [u32; 2])> = Vec::new();
    let mut grid: BTreeMap<(i64, i64), Vec<usize>> = BTreeMap::new();
    let mut canonical = BTreeMap::new();
    for (point, coordinate_key, source_ids) in raw_endpoints {
        let cell = reconstruction_grid_cell(point, reconstruction_origin)?;
        let mut representative: Option<usize> = None;
        for dx in -1_i64..=1 {
            for dy in -1_i64..=1 {
                let Some(x) = cell.0.checked_add(dx) else {
                    continue;
                };
                let Some(y) = cell.1.checked_add(dy) else {
                    continue;
                };
                for candidate in grid.get(&(x, y)).into_iter().flatten().copied() {
                    if distance(point, endpoints[candidate].0) <= RECONSTRUCTION_SNAP_MM
                        && representative.is_none_or(|current| {
                            compare_canonical_endpoint(&endpoints[candidate], &endpoints[current])
                                == Ordering::Less
                        })
                    {
                        representative = Some(candidate);
                    }
                }
            }
        }
        let representative = representative.unwrap_or_else(|| {
            let index = endpoints.len();
            endpoints.push((point, coordinate_key, source_ids));
            grid.entry(cell).or_default().push(index);
            index
        });
        endpoints[representative].1 = endpoints[representative].1.min(coordinate_key);
        endpoints[representative].2 = endpoints[representative].2.min(source_ids);
        canonical.insert(point_bits(point), endpoints[representative].0);
    }
    endpoints.sort_by(compare_canonical_endpoint);
    if endpoints.len() > u32::MAX as usize {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let node_for_point = endpoints
        .iter()
        .enumerate()
        .map(|(index, (point, _, _))| (point_bits(*point), index))
        .collect::<BTreeMap<_, _>>();
    let nodes = endpoints
        .iter()
        .copied()
        .enumerate()
        .map(|(index, (local, _coordinate_key, _source_ids))| {
            let point = restore_point(canonical_origin, local);
            MedialNode {
                id: NodeId(index as u32),
                point,
                clearance_mm: clearance(point),
            }
        })
        .collect::<Vec<_>>();
    let node_local_points = endpoints.iter().map(|(point, _, _)| *point).collect();
    let node_coordinate_keys = endpoints.iter().map(|(_, key, _)| *key).collect();
    let node_source_ids = endpoints
        .iter()
        .map(|(_, _, source_ids)| *source_ids)
        .collect();

    let mut edge_data = Vec::with_capacity(polylines.len());
    for (polyline, source_ids) in polylines.iter().zip(source_ids) {
        if polyline.len() < 2 {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::ZeroLengthEdge,
            ));
        }
        let mut polyline = polyline
            .iter()
            .copied()
            .map(normalize_zero)
            .collect::<Vec<_>>();
        let first_index = 0;
        let last_index = polyline.len() - 1;
        polyline[first_index] = *canonical
            .get(&point_bits(polyline[first_index]))
            .ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
            })?;
        polyline[last_index] = *canonical
            .get(&point_bits(polyline[last_index]))
            .ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
            })?;
        remove_consecutive_duplicates(&mut polyline);
        if polyline.len() < 2 || polyline_length(&polyline) <= 0.0 {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::ZeroLengthEdge,
            ));
        }
        let start = *polyline.first().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        let end = *polyline.last().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        let mut a = *node_for_point.get(&point_bits(start)).ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
        })?;
        let mut b = *node_for_point.get(&point_bits(end)).ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidEdgeEndpoint)
        })?;
        if a == b {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::ZeroLengthEdge,
            ));
        }
        if a > b {
            std::mem::swap(&mut a, &mut b);
            polyline.reverse();
        }
        edge_data.push((a, b, *source_ids, polyline));
    }
    edge_data.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.cmp(&right.1))
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| compare_polylines(&left.3, &right.3))
    });
    edge_data.dedup_by(|left, right| {
        left.0 == right.0 && left.1 == right.1 && left.2 == right.2 && left.3 == right.3
    });
    let edge_source_ids = edge_data
        .iter()
        .map(|(_, _, source_ids, _)| *source_ids)
        .collect();
    let edges = edge_data
        .into_iter()
        .enumerate()
        .map(|(index, (a, b, _source_ids, local_polyline))| {
            let polyline = local_polyline
                .iter()
                .copied()
                .map(|point| restore_point(canonical_origin, point))
                .collect::<Vec<_>>();
            MedialEdge::with_local_polyline(
                EdgeId(index as u32),
                NodeId(a as u32),
                NodeId(b as u32),
                polyline,
                local_polyline,
                canonical_origin,
            )
        })
        .collect();
    MedialGraph::from_parts_with_source_ids(
        nodes,
        edges,
        canonical_origin,
        node_local_points,
        node_coordinate_keys,
        node_source_ids,
        edge_source_ids,
    )
}

fn validate_local_shadow(
    nodes: &[MedialNode],
    edges: &[MedialEdge],
    node_local_points: &[Point],
) -> Result<(), MedialAxisError> {
    if node_local_points.len() != nodes.len() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::InvalidEdgeId,
        ));
    }
    if node_local_points.iter().any(|point| !finite_point(*point)) {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::NonFiniteGeometry,
        ));
    }
    for edge in edges {
        let polyline = &edge.local_polyline;
        if polyline.len() < 2 || polyline.iter().any(|point| !finite_point(*point)) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        let start = polyline.first().copied().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        let end = polyline.last().copied().ok_or_else(|| {
            MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
        })?;
        if distance(start, node_local_points[edge.a.index()]) > ENDPOINT_TOLERANCE_MM
            || distance(end, node_local_points[edge.b.index()]) > ENDPOINT_TOLERANCE_MM
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidPolylineEndpoint,
            ));
        }
        let local_length = polyline_length(polyline);
        if !local_length.is_finite()
            || local_length <= 0.0
            || (local_length - edge.length_mm).abs()
                > LENGTH_TOLERANCE_MM * local_length.max(edge.length_mm).max(1.0)
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::ZeroLengthEdge,
            ));
        }
    }
    Ok(())
}

fn preflight_parts(nodes: &[MedialNode], edges: &[MedialEdge]) -> Result<(), MedialAxisError> {
    let embedding_entries = edges.len().checked_mul(2);
    if nodes.len() > MAX_GRAPH_ITEMS
        || edges.len() > MAX_GRAPH_ITEMS
        || nodes.len() > u32::MAX as usize
        || edges.len() > u32::MAX as usize
        || embedding_entries.is_none_or(|entries| entries > MAX_GRAPH_ITEMS)
    {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let polyline_points = edges
        .iter()
        .try_fold(0usize, |total, edge| total.checked_add(edge.polyline.len()));
    if polyline_points.is_none_or(|points| points > MAX_GRAPH_ITEMS) {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn preflight_edge_local_polylines(edges: &[MedialEdge]) -> Result<(), MedialAxisError> {
    let point_count = edges.iter().try_fold(0usize, |total, edge| {
        total.checked_add(edge.local_polyline.len())
    });
    if point_count.is_none_or(|points| points > MAX_GRAPH_ITEMS) {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn preflight_polylines(polylines: &[Vec<Point>]) -> Result<(), MedialAxisError> {
    if polylines.len() > MAX_GRAPH_ITEMS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    let point_count = polylines
        .iter()
        .try_fold(0usize, |total, polyline| total.checked_add(polyline.len()));
    if point_count.is_none_or(|points| points > MAX_GRAPH_ITEMS) {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn validation_or_resource_error(error: MedialAxisError) -> MedialAxisError {
    match error {
        MedialAxisError::ResourceLimit { .. } => error,
        _ => MedialAxisError::validation(error.reason()),
    }
}

fn compare_canonical_endpoint(
    left: &(Point, [i64; 2], [u32; 2]),
    right: &(Point, [i64; 2], [u32; 2]),
) -> Ordering {
    left.1
        .cmp(&right.1)
        .then_with(|| left.2.cmp(&right.2))
        .then_with(|| compare_points(&left.0, &right.0))
}

fn ensure_boundary_location_budget(
    item_count: usize,
    boundary_count: usize,
) -> Result<(), MedialAxisError> {
    let work = item_count
        .checked_mul(boundary_count)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if work > MAX_INTERIOR_CLASSIFICATION_TESTS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

#[doc(hidden)]
pub fn inside_work_budget_fixture(
    segment_count: usize,
    boundary_count: usize,
) -> Result<(), MedialAxisError> {
    ensure_pair_work_budget(
        segment_count,
        boundary_count,
        MAX_INTERIOR_CLASSIFICATION_TESTS,
    )
}

fn ensure_pair_work_budget(
    item_count: usize,
    boundary_count: usize,
    limit: usize,
) -> Result<(), MedialAxisError> {
    let work = item_count
        .checked_mul(boundary_count)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if work > limit {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(())
}

fn ensure_interior_validation_budget(
    graph: &MedialGraph,
    allowed: &AllowedRegion,
) -> Result<(), MedialAxisError> {
    let segment_count = graph
        .edges
        .iter()
        .try_fold(0usize, |total, edge| {
            total.checked_add(edge.polyline.len().saturating_sub(1))
        })
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    ensure_pair_work_budget(
        segment_count,
        allowed.boundary.len(),
        MAX_INTERIOR_CLASSIFICATION_TESTS,
    )
}

pub(crate) fn polyline_is_inside_allowed(polyline: &[Point], allowed: &AllowedRegion) -> bool {
    if polyline.len() < 2 {
        return false;
    }
    for point in polyline {
        if allowed.classify_point(*point) == PointClassification::Outside {
            return false;
        }
    }
    for pair in polyline.windows(2) {
        for fraction in [0.25, 0.5, 0.75] {
            if allowed.classify_point(lerp(pair[0], pair[1], fraction))
                == PointClassification::Outside
            {
                return false;
            }
        }
        let segment = PathPrimitive::Line {
            start: pair[0],
            end: pair[1],
        };
        for boundary in &allowed.boundary {
            match primitive_intersections(&segment, boundary) {
                Intersection::None => {}
                Intersection::Overlap => return false,
                Intersection::Points(points) => {
                    if points
                        .iter()
                        .any(|hit| hit.a_t > 1e-8 && hit.a_t < 1.0 - 1e-8)
                    {
                        return false;
                    }
                }
            }
        }
    }
    true
}

fn nearest_local_boundary_offset(
    allowed: &AllowedRegion,
    point: Point,
) -> Result<(f64, f64), MedialAxisError> {
    let mut best: Option<(f64, f64)> = None;
    let mut prefix = 0.0;
    for (start, end) in &allowed.quantized_segments {
        let start = Point::new(
            start.x as f64 * TOPOLOGY_QUANTIZATION_MM,
            start.y as f64 * TOPOLOGY_QUANTIZATION_MM,
        );
        let end = Point::new(
            end.x as f64 * TOPOLOGY_QUANTIZATION_MM,
            end.y as f64 * TOPOLOGY_QUANTIZATION_MM,
        );
        let direction = end - start;
        let length = direction.norm();
        if length <= 0.0 {
            continue;
        }
        let parameter = ((point - start).dot(direction) / (length * length)).clamp(0.0, 1.0);
        let candidate = Point::new(
            start.x + direction.x * parameter,
            start.y + direction.y * parameter,
        );
        let candidate_distance = distance(point, candidate);
        let offset = prefix + length * parameter;
        if best
            .as_ref()
            .is_none_or(|(current_offset, current_distance)| {
                candidate_distance < *current_distance
                    || (candidate_distance == *current_distance && offset < *current_offset)
            })
        {
            best = Some((offset, candidate_distance));
        }
        prefix += length;
    }
    best.ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EmptyBoundary))
}

pub(crate) fn nearest_boundary_location(
    allowed: &AllowedRegion,
    point: Point,
) -> Result<BoundaryLocation, MedialAxisError> {
    let mut best: Option<BoundaryLocation> = None;
    let mut offset = 0.0;
    for primitive in &allowed.boundary {
        let (t, candidate) = closest_point_on_primitive(primitive, point);
        let candidate_distance = distance(point, candidate);
        let location = BoundaryLocation {
            offset_mm: offset + primitive.length() * t,
            point: candidate,
            distance_mm: candidate_distance,
        };
        if best.as_ref().is_none_or(|current| {
            candidate_distance < current.distance_mm
                || (candidate_distance == current.distance_mm
                    && location.offset_mm < current.offset_mm)
        }) {
            best = Some(location);
        }
        offset += primitive.length();
    }
    best.ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::EmptyBoundary))
}

fn polyline_slice_allowing_zero(
    edge: &MedialEdge,
    start_mm: f64,
    end_mm: f64,
) -> Result<Vec<Point>, MedialAxisError> {
    if (end_mm - start_mm).abs() <= LENGTH_TOLERANCE_MM {
        return Ok(vec![edge.point_at_distance(start_mm)?]);
    }
    polyline_slice(edge, start_mm, end_mm)
}

fn edge_position_to_endpoint(
    edge: &MedialEdge,
    distance_mm: f64,
    endpoint: NodeId,
) -> Result<Vec<Point>, MedialAxisError> {
    if endpoint == edge.a {
        let mut path = polyline_slice_allowing_zero(edge, 0.0, distance_mm)?;
        path.reverse();
        Ok(path)
    } else if endpoint == edge.b {
        polyline_slice_allowing_zero(edge, distance_mm, edge.length_mm)
    } else {
        Err(MedialAxisError::invalid(
            MedialAxisErrorReason::InvalidEdgeEndpoint,
        ))
    }
}

fn append_polyline(destination: &mut Vec<Point>, source: &[Point]) {
    let skip = usize::from(
        destination
            .last()
            .zip(source.first())
            .is_some_and(|(left, right)| distance(*left, *right) <= RECONSTRUCTION_SNAP_MM),
    );
    destination.extend(source.iter().copied().skip(skip));
}

pub(crate) fn polyline_slice(
    edge: &MedialEdge,
    start_mm: f64,
    end_mm: f64,
) -> Result<Vec<Point>, MedialAxisError> {
    if (polyline_length(&edge.polyline) - edge.length_mm).abs()
        > LENGTH_TOLERANCE_MM * edge.length_mm.max(1.0)
    {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::InvalidGraphPosition,
        ));
    }
    polyline_slice_values(&edge.polyline, start_mm, end_mm)
}

fn polyline_slice_values(
    polyline: &[Point],
    start_mm: f64,
    end_mm: f64,
) -> Result<Vec<Point>, MedialAxisError> {
    let length_mm = polyline_length(polyline);
    if start_mm < -LENGTH_TOLERANCE_MM
        || end_mm > length_mm + LENGTH_TOLERANCE_MM
        || end_mm <= start_mm
    {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::InvalidGraphPosition,
        ));
    }
    let start_mm = start_mm.clamp(0.0, length_mm);
    let end_mm = end_mm.clamp(0.0, length_mm);
    let mut result = vec![point_at_polyline_distance(polyline, start_mm)?];
    let mut offset = 0.0;
    for pair in polyline.windows(2) {
        offset += distance(pair[0], pair[1]);
        if offset > start_mm + LENGTH_TOLERANCE_MM && offset < end_mm - LENGTH_TOLERANCE_MM {
            result.push(pair[1]);
        }
    }
    result.push(point_at_polyline_distance(polyline, end_mm)?);
    remove_consecutive_duplicates(&mut result);
    Ok(result)
}

fn point_at_polyline_distance(
    polyline: &[Point],
    distance_mm: f64,
) -> Result<Point, MedialAxisError> {
    let length_mm = polyline_length(polyline);
    if !length_mm.is_finite()
        || length_mm <= 0.0
        || !distance_mm.is_finite()
        || distance_mm < -LENGTH_TOLERANCE_MM
        || distance_mm > length_mm + LENGTH_TOLERANCE_MM
    {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::InvalidGraphPosition,
        ));
    }
    let mut remaining = distance_mm.clamp(0.0, length_mm);
    for pair in polyline.windows(2) {
        let segment_length = distance(pair[0], pair[1]);
        if segment_length == 0.0 {
            continue;
        }
        if remaining <= segment_length {
            return Ok(lerp(pair[0], pair[1], remaining / segment_length));
        }
        remaining -= segment_length;
    }
    polyline
        .last()
        .copied()
        .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint))
}

fn compute_embedding(
    node_count: usize,
    edges: &[MedialEdge],
) -> Result<Vec<Vec<EdgeId>>, MedialAxisError> {
    let mut embedding = vec![Vec::new(); node_count];
    for edge in edges {
        let Some(a) = embedding.get_mut(edge.a.index()) else {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeEndpoint,
            ));
        };
        a.push(edge.id);
        let Some(b) = embedding.get_mut(edge.b.index()) else {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeEndpoint,
            ));
        };
        b.push(edge.id);
    }
    for (index, incident) in embedding.iter_mut().enumerate() {
        let node = NodeId(index as u32);
        incident.sort_by(|left, right| {
            let left_angle = edges
                .get(left.index())
                .and_then(|edge| outgoing_direction_from_polyline(edge, &edge.local_polyline, node))
                .map(|direction| direction.y.atan2(direction.x).rem_euclid(TAU));
            let right_angle = edges
                .get(right.index())
                .and_then(|edge| outgoing_direction_from_polyline(edge, &edge.local_polyline, node))
                .map(|direction| direction.y.atan2(direction.x).rem_euclid(TAU));
            match (left_angle, right_angle) {
                (Some(left_angle), Some(right_angle)) => left_angle
                    .total_cmp(&right_angle)
                    .then_with(|| left.cmp(right)),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => left.cmp(right),
            }
        });
        if incident.iter().any(|edge| {
            edges
                .get(edge.index())
                .and_then(|edge| outgoing_direction_from_polyline(edge, &edge.local_polyline, node))
                .is_none()
        }) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::ZeroLengthEdge,
            ));
        }
    }
    Ok(embedding)
}

fn crossings_are_valid(
    graph: &MedialGraph,
    ignore_incident_edge_pairs: bool,
) -> Result<bool, MedialAxisError> {
    graph.preflight_public_resources()?;
    let use_local = graph.local_shadow_is_current();
    let segment_count = (0..graph.edges.len())
        .try_fold(0usize, |total, edge| {
            total.checked_add(
                geometry_polyline(graph, edge, use_local)
                    .len()
                    .saturating_sub(1),
            )
        })
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    let segment_pairs = segment_count
        .checked_mul(segment_count.saturating_sub(1))
        .map(|pairs| pairs / 2)
        .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
    if segment_pairs > MAX_CROSSING_SEGMENT_PAIRS {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    for first_edge_index in 0..graph.edges.len() {
        let first_edge = &graph.edges[first_edge_index];
        let first_polyline = geometry_polyline(graph, first_edge_index, use_local);
        for first_segment in 0..first_polyline.len().saturating_sub(1) {
            for second_edge_index in first_edge_index..graph.edges.len() {
                let second_edge = &graph.edges[second_edge_index];
                if ignore_incident_edge_pairs
                    && first_edge_index != second_edge_index
                    && edges_share_node(first_edge, second_edge)
                {
                    continue;
                }
                let second_polyline = geometry_polyline(graph, second_edge_index, use_local);
                let segment_start = if first_edge_index == second_edge_index {
                    first_segment + 1
                } else {
                    0
                };
                for second_segment in segment_start..second_polyline.len().saturating_sub(1) {
                    let first = PathPrimitive::Line {
                        start: first_polyline[first_segment],
                        end: first_polyline[first_segment + 1],
                    };
                    let second = PathPrimitive::Line {
                        start: second_polyline[second_segment],
                        end: second_polyline[second_segment + 1],
                    };
                    match primitive_intersections(&first, &second) {
                        Intersection::None => {}
                        Intersection::Overlap => return Ok(false),
                        Intersection::Points(points) => {
                            if points.iter().any(|hit| {
                                !allowed_graph_touch(
                                    graph,
                                    first_edge,
                                    first_polyline,
                                    first_segment,
                                    second_edge,
                                    second_polyline,
                                    second_segment,
                                    hit.point,
                                    use_local,
                                )
                            }) {
                                return Ok(false);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(true)
}

fn geometry_polyline(graph: &MedialGraph, edge: usize, use_local: bool) -> &[Point] {
    if use_local {
        &graph.edges[edge].local_polyline
    } else {
        &graph.edges[edge].polyline
    }
}

fn allowed_graph_touch(
    graph: &MedialGraph,
    first: &MedialEdge,
    first_polyline: &[Point],
    first_segment: usize,
    second: &MedialEdge,
    second_polyline: &[Point],
    second_segment: usize,
    point: Point,
    use_local: bool,
) -> bool {
    if first.id == second.id {
        if second_segment != first_segment + 1 {
            return false;
        }
        return first_polyline.get(second_segment).is_some_and(|shared| {
            distance(point, *shared) <= ENDPOINT_TOLERANCE_MM
                && segment_has_endpoint(first_polyline, first_segment, *shared)
                && segment_has_endpoint(second_polyline, second_segment, *shared)
        });
    }
    [first.a, first.b]
        .into_iter()
        .filter(|node| *node == second.a || *node == second.b)
        .any(|node| {
            let node_point = if use_local {
                graph.node_local_points[node.index()]
            } else {
                graph.nodes[node.index()].point
            };
            distance(point, node_point) <= ENDPOINT_TOLERANCE_MM
                && segment_has_endpoint(first_polyline, first_segment, node_point)
                && segment_has_endpoint(second_polyline, second_segment, node_point)
        })
}

fn segment_has_endpoint(polyline: &[Point], segment: usize, point: Point) -> bool {
    polyline.get(segment..=segment + 1).is_some_and(|pair| {
        distance(pair[0], point) <= ENDPOINT_TOLERANCE_MM
            || distance(pair[1], point) <= ENDPOINT_TOLERANCE_MM
    })
}

fn edges_share_node(first: &MedialEdge, second: &MedialEdge) -> bool {
    first.a == second.a || first.a == second.b || first.b == second.a || first.b == second.b
}

fn closest_point_on_primitive(primitive: &PathPrimitive, point: Point) -> (f64, Point) {
    match *primitive {
        PathPrimitive::Line { start, end } => {
            let direction = end - start;
            let length_squared = direction.norm_squared();
            let t = if length_squared > 0.0 {
                ((point - start).dot(direction) / length_squared).clamp(0.0, 1.0)
            } else {
                0.0
            };
            (t, lerp(start, end, t))
        }
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            let start_angle = (start.y - center.y).atan2(start.x - center.x);
            let target_angle = (point.y - center.y).atan2(point.x - center.x);
            let directed = if sweep_rad >= 0.0 {
                positive_angle_delta(start_angle, target_angle)
            } else {
                positive_angle_delta(target_angle, start_angle)
            };
            let t = if directed <= sweep_rad.abs() {
                if sweep_rad == 0.0 {
                    0.0
                } else {
                    directed / sweep_rad.abs()
                }
            } else if distance(point, start) <= distance(point, end) {
                0.0
            } else {
                1.0
            };
            let angle = start_angle + sweep_rad * t;
            (
                t,
                Point::new(
                    center.x + radius_mm * angle.cos(),
                    center.y + radius_mm * angle.sin(),
                ),
            )
        }
    }
}

fn positive_angle_delta(from: f64, to: f64) -> f64 {
    (to - from).rem_euclid(TAU)
}

fn oriented_polyline(edge: &MedialEdge, from: NodeId) -> Result<Vec<Point>, MedialAxisError> {
    if edge.a == from {
        Ok(edge.polyline.clone())
    } else if edge.b == from {
        let mut result = edge.polyline.clone();
        result.reverse();
        Ok(result)
    } else {
        Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::InvalidEdgeEndpoint,
        ))
    }
}

fn outgoing_direction_from_polyline(
    edge: &MedialEdge,
    polyline: &[Point],
    node: NodeId,
) -> Option<Vec2> {
    if edge.a == node {
        let start = *polyline.first()?;
        polyline
            .iter()
            .copied()
            .skip(1)
            .map(|point| point - start)
            .find(|direction| direction.norm_squared() > 0.0)
    } else if edge.b == node {
        let start = *polyline.last()?;
        polyline
            .iter()
            .copied()
            .rev()
            .skip(1)
            .map(|point| point - start)
            .find(|direction| direction.norm_squared() > 0.0)
    } else {
        None
    }
}

fn other_endpoint(edge: &MedialEdge, node: NodeId) -> Option<NodeId> {
    if edge.a == node {
        Some(edge.b)
    } else if edge.b == node {
        Some(edge.a)
    } else {
        None
    }
}

fn segment_lengths(polyline: &[Point]) -> Vec<f64> {
    polyline
        .windows(2)
        .map(|pair| distance(pair[0], pair[1]))
        .collect()
}

pub(crate) fn polyline_length(polyline: &[Point]) -> f64 {
    segment_lengths(polyline).into_iter().sum()
}

pub(crate) fn remove_consecutive_duplicates(polyline: &mut Vec<Point>) {
    polyline.dedup_by(|left, right| *left == *right);
}

pub(crate) fn distance(a: Point, b: Point) -> f64 {
    (b.x - a.x).hypot(b.y - a.y)
}

pub(crate) fn lerp(a: Point, b: Point, t: f64) -> Point {
    Point::new(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
}

pub(crate) fn compare_points(left: &Point, right: &Point) -> Ordering {
    quantized_coordinate(left.x)
        .cmp(&quantized_coordinate(right.x))
        .then_with(|| quantized_coordinate(left.y).cmp(&quantized_coordinate(right.y)))
        .then_with(|| left.x.total_cmp(&right.x))
        .then_with(|| left.y.total_cmp(&right.y))
}

pub(crate) fn compare_polylines(left: &[Point], right: &[Point]) -> Ordering {
    left.len().cmp(&right.len()).then_with(|| {
        left.iter()
            .zip(right)
            .map(|(left, right)| compare_points(left, right))
            .find(|order| *order != Ordering::Equal)
            .unwrap_or(Ordering::Equal)
    })
}

fn local_coordinate_key(point: Point) -> [i64; 2] {
    [quantized_coordinate(point.x), quantized_coordinate(point.y)]
}

fn reconstruction_grid_cell(point: Point, origin: Point) -> Result<(i64, i64), MedialAxisError> {
    let coordinate = |value: f64, origin: f64| {
        let scaled = ((value - origin) / RECONSTRUCTION_SNAP_MM).floor();
        if !scaled.is_finite() || scaled < i64::MIN as f64 || scaled >= i64::MAX as f64 {
            None
        } else {
            Some(scaled as i64)
        }
    };
    Ok((
        coordinate(point.x, origin.x)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
        coordinate(point.y, origin.y)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
    ))
}

fn restore_point(origin: Point, local: Point) -> Point {
    Point::new(origin.x + local.x, origin.y + local.y)
}

fn point_bits(point: Point) -> (u64, u64) {
    (point.x.to_bits(), point.y.to_bits())
}

fn quantized_coordinate(value: f64) -> i64 {
    let scaled = (value / TOPOLOGY_QUANTIZATION_MM).round();
    if scaled <= i64::MIN as f64 {
        i64::MIN
    } else if scaled >= i64::MAX as f64 {
        i64::MAX
    } else {
        scaled as i64
    }
}

fn normalize_zero(point: Point) -> Point {
    Point::new(
        if point.x == 0.0 { 0.0 } else { point.x },
        if point.y == 0.0 { 0.0 } else { point.y },
    )
}

fn finite_point(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}

fn cross(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}
