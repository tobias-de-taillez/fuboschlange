use super::{MedialAxisError, MedialAxisErrorReason};
use crate::constants::TOPOLOGY_QUANTIZATION_MM;
use crate::geometry::{
    AllowedRegion, Intersection, POSITION_TOLERANCE_MM, PointClassification, QuantizedPoint, Vec2,
    primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::f64::consts::TAU;
use std::sync::Arc;

const ENDPOINT_TOLERANCE_MM: f64 = 1e-6;
const LENGTH_TOLERANCE_MM: f64 = 1e-8;
const COLLINEAR_SINE_TOLERANCE: f64 = 1e-10;
const RECONSTRUCTION_SNAP_MM: f64 = 1e-9;
const MAX_GRAPH_ITEMS: usize = 2_000_000;
const MAX_CROSSING_SEGMENT_PAIRS: usize = 10_000_000;
const MAX_INTERIOR_CLASSIFICATION_TESTS: usize = 50_000_000;
const MAX_PUBLICATION_ADJACENT_STEPS: usize = 64;
const HELPER_VORONOI_HAUSDORFF_MM: f64 = 0.05;
const HELPER_QUANTIZATION_ENDPOINT_ERROR_MM: f64 =
    TOPOLOGY_QUANTIZATION_MM * std::f64::consts::SQRT_2 * 0.5;
const HELPER_TESSELLATION_HAUSDORFF_MM: f64 =
    HELPER_VORONOI_HAUSDORFF_MM - HELPER_QUANTIZATION_ENDPOINT_ERROR_MM;

type TraversalParents = Vec<Option<(NodeId, EdgeId)>>;
type FarthestResult = (NodeId, f64, TraversalParents);

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
    authoritative_id: EdgeId,
    authoritative_a: NodeId,
    authoritative_b: NodeId,
    local_polyline: Vec<Point>,
    local_coordinate_keys: Vec<[i64; 2]>,
}

impl MedialEdge {
    pub fn new(id: EdgeId, a: NodeId, b: NodeId, polyline: Vec<Point>) -> Self {
        let length_mm = polyline_length(&polyline);
        let local_coordinate_keys = polyline.iter().copied().map(local_coordinate_key).collect();
        Self {
            id,
            a,
            b,
            local_polyline: polyline.clone(),
            local_coordinate_keys,
            polyline,
            length_mm,
            canonical_origin: Point::new(0.0, 0.0),
            authoritative_id: id,
            authoritative_a: a,
            authoritative_b: b,
        }
    }

    pub(crate) fn with_local_polyline(
        id: EdgeId,
        a: NodeId,
        b: NodeId,
        polyline: Vec<Point>,
        local_polyline: Vec<Point>,
        local_coordinate_keys: Vec<[i64; 2]>,
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
            authoritative_id: id,
            authoritative_a: a,
            authoritative_b: b,
            local_polyline,
            local_coordinate_keys,
        }
    }

    pub(crate) fn validate_authoritative_identity(&self) -> Result<(), MedialAxisError> {
        if self.id != self.authoritative_id {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
        }
        if self.a != self.authoritative_a || self.b != self.authoritative_b || self.a == self.b {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidEdgeEndpoint,
            ));
        }
        Ok(())
    }

    pub fn point_at_distance(&self, distance_mm: f64) -> Result<Point, MedialAxisError> {
        self.validate_authoritative_identity()?;
        let provenance_length = polyline_length(&self.local_polyline);
        if !self.length_mm.is_finite()
            || self.length_mm <= 0.0
            || self.local_polyline.len() != self.polyline.len()
            || self.local_coordinate_keys.len() != self.local_polyline.len()
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
                .zip(&self.local_coordinate_keys)
                .all(|((public, local), key)| {
                    publish_point(self.canonical_origin, *local, *key) == Some(*public)
                })
            || !distance_mm.is_finite()
            || distance_mm < -LENGTH_TOLERANCE_MM
            || distance_mm > provenance_length + LENGTH_TOLERANCE_MM
        {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        let distance_mm = distance_mm.clamp(0.0, provenance_length);
        let point = point_at_polyline_distance(&self.local_polyline, distance_mm)?;
        let coordinate_key = if distance_mm == 0.0 {
            self.local_coordinate_keys[0]
        } else if distance_mm == provenance_length {
            *self.local_coordinate_keys.last().ok_or_else(|| {
                MedialAxisError::invalid(MedialAxisErrorReason::InvalidGraphPosition)
            })?
        } else {
            local_coordinate_key(point)
        };
        publish_point(self.canonical_origin, point, coordinate_key)
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidGraphPosition))
    }

    pub fn point_at_fraction(&self, fraction: f64) -> Result<Point, MedialAxisError> {
        self.validate_authoritative_identity()?;
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        self.point_at_distance(polyline_length(&self.local_polyline) * fraction)
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
    authoritative_leaves: Vec<NodeId>,
    exact_local_boundary: Option<Arc<ExactLocalBoundary>>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct BoundaryLocation {
    pub offset_mm: f64,
    pub point: Point,
    pub tangent: Vec2,
    pub segment_index: usize,
    pub parameter: f64,
    pub distance_mm: f64,
    pub coordinate_key: [i64; 2],
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum ExactLocalPrimitiveGeometry {
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

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ExactLocalBoundaryPrimitive {
    geometry: ExactLocalPrimitiveGeometry,
    start_key: [i64; 2],
    end_key: [i64; 2],
    helper_segment_start: usize,
    helper_segment_end: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ExactLocalBoundary {
    canonical_origin: Point,
    pub(crate) primitives: Vec<ExactLocalBoundaryPrimitive>,
    pub(crate) prefix_lengths: Vec<f64>,
    pub(crate) perimeter_mm: f64,
    helper_segment_count: usize,
    source_boundary: Option<Vec<PathPrimitive>>,
    source_quantized_segments: Option<Vec<(QuantizedPoint, QuantizedPoint)>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct LocalPolylineCertification {
    pub(crate) contained: bool,
    pub(crate) has_interior_sample: bool,
}

impl ExactLocalBoundaryPrimitive {
    pub(crate) fn start(self) -> Point {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, .. }
            | ExactLocalPrimitiveGeometry::Arc { start, .. } => start,
        }
    }

    pub(crate) fn end(self) -> Point {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { end, .. }
            | ExactLocalPrimitiveGeometry::Arc { end, .. } => end,
        }
    }

    pub(crate) fn length(self) -> f64 {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, end } => distance(start, end),
            ExactLocalPrimitiveGeometry::Arc {
                radius_mm,
                sweep_rad,
                ..
            } => radius_mm * sweep_rad.abs(),
        }
    }

    pub(crate) const fn is_line(self) -> bool {
        matches!(self.geometry, ExactLocalPrimitiveGeometry::Line { .. })
    }

    fn as_path_primitive(self) -> PathPrimitive {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, end } => PathPrimitive::Line { start, end },
            ExactLocalPrimitiveGeometry::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            },
        }
    }

    pub(crate) fn point_at(self, parameter: f64) -> Point {
        let parameter = parameter.clamp(0.0, 1.0);
        if parameter <= 0.0 {
            return self.start();
        }
        if parameter >= 1.0 {
            return self.end();
        }
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, end } => lerp(start, end, parameter),
            ExactLocalPrimitiveGeometry::Arc {
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

    pub(crate) fn tangent_at(self, parameter: f64) -> Option<Vec2> {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, end } => (end - start).normalized(),
            ExactLocalPrimitiveGeometry::Arc {
                start,
                center,
                sweep_rad,
                ..
            } => {
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let radial = Vec2::from_angle(start_angle + sweep_rad * parameter.clamp(0.0, 1.0));
                Some(if sweep_rad >= 0.0 {
                    radial.perp_ccw()
                } else {
                    -radial.perp_ccw()
                })
            }
        }
    }

    fn coordinate_key_at(self, parameter: f64, point: Point) -> [i64; 2] {
        if parameter <= 0.0 {
            self.start_key
        } else if parameter >= 1.0 {
            self.end_key
        } else {
            local_coordinate_key(point)
        }
    }

    fn nearest(self, point: Point) -> Option<(f64, Point)> {
        match self.geometry {
            ExactLocalPrimitiveGeometry::Line { start, end } => {
                let direction = end - start;
                let length_squared = direction.norm_squared();
                if length_squared <= 0.0 {
                    return None;
                }
                let parameter = ((point - start).dot(direction) / length_squared).clamp(0.0, 1.0);
                Some((parameter, self.point_at(parameter)))
            }
            ExactLocalPrimitiveGeometry::Arc {
                start,
                end,
                center,
                sweep_rad,
                ..
            } => {
                let start_angle = (start.y - center.y).atan2(start.x - center.x);
                let target_angle = (point.y - center.y).atan2(point.x - center.x);
                let directed = if sweep_rad >= 0.0 {
                    positive_angle_delta(start_angle, target_angle)
                } else {
                    positive_angle_delta(target_angle, start_angle)
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

impl ExactLocalBoundary {
    pub(crate) fn from_allowed(allowed: &AllowedRegion) -> Result<Self, MedialAxisError> {
        if allowed.boundary.is_empty() || allowed.quantized_segments.is_empty() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyBoundary,
            ));
        }
        if !finite_point(allowed.quantization_origin) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        if allowed.boundary.len() > MAX_GRAPH_ITEMS
            || allowed.quantized_segments.len() > MAX_GRAPH_ITEMS
        {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }

        let exact_local_boundary = allowed.exact_local_boundary();
        if exact_local_boundary.len() != allowed.boundary.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EnrichmentFailure,
            ));
        }
        let mut aggregate_subdivision_count = 0usize;
        for source in exact_local_boundary {
            aggregate_subdivision_count = aggregate_subdivision_count
                .checked_add(helper_subdivision_count(source)?)
                .ok_or_else(|| {
                    MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit)
                })?;
            if aggregate_subdivision_count > MAX_GRAPH_ITEMS {
                return Err(MedialAxisError::resource(
                    MedialAxisErrorReason::GraphResourceLimit,
                ));
            }
        }

        let first_helper = allowed.quantized_segments[0];
        let mut helper_cursor = 0usize;
        let mut helper_anchor = first_helper.0;
        let mut primitives = Vec::with_capacity(exact_local_boundary.len());
        for source in exact_local_boundary {
            let (geometry, local_start, local_end) = match *source {
                PathPrimitive::Line { start, end } => {
                    (ExactLocalPrimitiveGeometry::Line { start, end }, start, end)
                }
                PathPrimitive::Arc {
                    start,
                    end,
                    center,
                    radius_mm,
                    sweep_rad,
                } => (
                    ExactLocalPrimitiveGeometry::Arc {
                        start,
                        end,
                        center,
                        radius_mm,
                        sweep_rad,
                    },
                    start,
                    end,
                ),
            };
            let geometric_start_key = checked_local_coordinate_key(local_start)?;
            let geometric_end_key = checked_local_coordinate_key(local_end)?;
            let start_key = quantized_key(helper_anchor);
            if start_key != geometric_start_key {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::EnrichmentFailure,
                ));
            }
            let helper_segment_start = helper_cursor;
            let subdivision_count = helper_subdivision_count(source)?;
            let mut expected_anchor = geometric_start_key;
            for subdivision in 1..=subdivision_count {
                let expected_end = checked_local_coordinate_key(
                    source.point_at(subdivision as f64 / subdivision_count as f64),
                )?;
                if expected_anchor != expected_end {
                    let helper =
                        allowed
                            .quantized_segments
                            .get(helper_cursor)
                            .ok_or_else(|| {
                                MedialAxisError::degenerate(
                                    MedialAxisErrorReason::EnrichmentFailure,
                                )
                            })?;
                    if helper.0 != helper_anchor
                        || quantized_key(helper.0) != expected_anchor
                        || quantized_key(helper.1) != expected_end
                    {
                        return Err(MedialAxisError::degenerate(
                            MedialAxisErrorReason::EnrichmentFailure,
                        ));
                    }
                    helper_cursor += 1;
                    helper_anchor = helper.1;
                }
                expected_anchor = expected_end;
            }
            let end_key = quantized_key(helper_anchor);
            if end_key != geometric_end_key {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::EnrichmentFailure,
                ));
            }
            primitives.push(ExactLocalBoundaryPrimitive {
                geometry,
                start_key,
                end_key,
                helper_segment_start,
                helper_segment_end: helper_cursor,
            });
        }
        if helper_cursor != allowed.quantized_segments.len() || helper_anchor != first_helper.0 {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EnrichmentFailure,
            ));
        }
        Self::from_primitives(
            allowed.quantization_origin,
            primitives,
            allowed.quantized_segments.len(),
            Some(allowed.boundary.clone()),
            Some(allowed.quantized_segments.clone()),
        )
    }

    pub(crate) fn from_vertices(vertices: &[Point]) -> Result<Self, MedialAxisError> {
        if vertices.len() < 3 || vertices.len() > MAX_GRAPH_ITEMS {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyBoundary,
            ));
        }
        let mut primitives = Vec::with_capacity(vertices.len());
        for index in 0..vertices.len() {
            let start = vertices[index];
            let end = vertices[(index + 1) % vertices.len()];
            if !finite_point(start) || !finite_point(end) {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
                ));
            }
            primitives.push(ExactLocalBoundaryPrimitive {
                geometry: ExactLocalPrimitiveGeometry::Line { start, end },
                start_key: checked_local_coordinate_key(start)?,
                end_key: checked_local_coordinate_key(end)?,
                helper_segment_start: index,
                helper_segment_end: index + 1,
            });
        }
        Self::from_primitives(Point::new(0.0, 0.0), primitives, vertices.len(), None, None)
    }

    fn from_primitives(
        canonical_origin: Point,
        primitives: Vec<ExactLocalBoundaryPrimitive>,
        helper_segment_count: usize,
        source_boundary: Option<Vec<PathPrimitive>>,
        source_quantized_segments: Option<Vec<(QuantizedPoint, QuantizedPoint)>>,
    ) -> Result<Self, MedialAxisError> {
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
            canonical_origin,
            primitives,
            prefix_lengths,
            perimeter_mm,
            helper_segment_count,
            source_boundary,
            source_quantized_segments,
        })
    }

    pub(crate) fn primitive_count(&self) -> usize {
        self.primitives.len()
    }

    pub(crate) fn canonical_origin(&self) -> Point {
        self.canonical_origin
    }

    fn matches_allowed(&self, allowed: &AllowedRegion) -> bool {
        self.canonical_origin == allowed.quantization_origin
            && self.source_boundary.as_deref() == Some(allowed.boundary.as_slice())
            && self.source_quantized_segments.as_deref()
                == Some(allowed.quantized_segments.as_slice())
    }

    pub(crate) fn classify_local_point(&self, point: Point) -> PointClassification {
        if !finite_point(point) {
            return PointClassification::Outside;
        }
        let boundary_distance = self
            .primitives
            .iter()
            .copied()
            .filter_map(|primitive| primitive.nearest(point))
            .map(|(_, nearest)| distance(point, nearest))
            .fold(f64::INFINITY, f64::min);
        if boundary_distance <= POSITION_TOLERANCE_MM {
            return PointClassification::Boundary;
        }

        let mut winding = 0_i64;
        for primitive in self.primitives.iter().copied() {
            winding += primitive_horizontal_winding(primitive, point);
        }
        if winding == 0 {
            PointClassification::Outside
        } else {
            PointClassification::Inside
        }
    }

    pub(crate) fn certify_local_polyline(
        &self,
        polyline: &[Point],
        aggregate_work: &mut usize,
    ) -> Result<LocalPolylineCertification, MedialAxisError> {
        if polyline.len() < 2 || polyline.iter().any(|point| !finite_point(*point)) {
            return Ok(LocalPolylineCertification {
                contained: false,
                has_interior_sample: false,
            });
        }
        let segment_count = polyline.len() - 1;
        let sample_and_intersection_count = segment_count
            .checked_mul(2)
            .and_then(|count| count.checked_add(polyline.len()))
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
        let work = sample_and_intersection_count
            .checked_mul(self.primitives.len())
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
        *aggregate_work = aggregate_work
            .checked_add(work)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?;
        if *aggregate_work > MAX_INTERIOR_CLASSIFICATION_TESTS {
            return Err(MedialAxisError::resource(
                MedialAxisErrorReason::GraphResourceLimit,
            ));
        }

        let mut has_interior_sample = false;
        for sample in polyline
            .iter()
            .copied()
            .chain(polyline.windows(2).map(|pair| lerp(pair[0], pair[1], 0.5)))
        {
            match self.classify_local_point(sample) {
                PointClassification::Outside => {
                    return Ok(LocalPolylineCertification {
                        contained: false,
                        has_interior_sample,
                    });
                }
                PointClassification::Inside => has_interior_sample = true,
                PointClassification::Boundary => {}
            }
        }

        for pair in polyline.windows(2) {
            let segment = PathPrimitive::Line {
                start: pair[0],
                end: pair[1],
            };
            for boundary in self.primitives.iter().copied() {
                match primitive_intersections(&segment, &boundary.as_path_primitive()) {
                    Intersection::None => {}
                    Intersection::Overlap => {
                        return Ok(LocalPolylineCertification {
                            contained: false,
                            has_interior_sample,
                        });
                    }
                    Intersection::Points(points)
                        if points.iter().any(|intersection| {
                            intersection.a_t > 0.0
                                && intersection.a_t < 1.0
                                && distance(intersection.point, pair[0])
                                    > intersection_endpoint_roundoff_mm(
                                        pair[0],
                                        pair[1],
                                        intersection.point,
                                    )
                                && distance(intersection.point, pair[1])
                                    > intersection_endpoint_roundoff_mm(
                                        pair[0],
                                        pair[1],
                                        intersection.point,
                                    )
                        }) =>
                    {
                        return Ok(LocalPolylineCertification {
                            contained: false,
                            has_interior_sample,
                        });
                    }
                    Intersection::Points(_) => {}
                }
            }
        }

        Ok(LocalPolylineCertification {
            contained: true,
            has_interior_sample,
        })
    }

    pub(crate) fn location_at_offset(
        &self,
        offset_mm: f64,
    ) -> Result<BoundaryLocation, MedialAxisError> {
        if !offset_mm.is_finite() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::BoundaryProjectionFailed,
            ));
        }
        let offset = offset_mm.rem_euclid(self.perimeter_mm);
        for (index, primitive) in self.primitives.iter().copied().enumerate() {
            let start = self.prefix_lengths[index];
            let length = primitive.length();
            if offset <= start + length || index + 1 == self.primitives.len() {
                let parameter = ((offset - start) / length).clamp(0.0, 1.0);
                let point = primitive.point_at(parameter);
                let tangent = primitive.tangent_at(parameter).ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::BoundaryProjectionFailed)
                })?;
                return Ok(BoundaryLocation {
                    offset_mm: start + length * parameter,
                    point,
                    tangent,
                    segment_index: index,
                    parameter,
                    distance_mm: 0.0,
                    coordinate_key: primitive.coordinate_key_at(parameter, point),
                });
            }
        }
        Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::BoundaryProjectionFailed,
        ))
    }

    pub(crate) fn nearest_location(
        &self,
        point: Point,
    ) -> Result<BoundaryLocation, MedialAxisError> {
        let mut best: Option<BoundaryLocation> = None;
        for (index, primitive) in self.primitives.iter().copied().enumerate() {
            let Some((parameter, candidate)) = primitive.nearest(point) else {
                continue;
            };
            let candidate_distance = distance(point, candidate);
            let location = BoundaryLocation {
                offset_mm: self.prefix_lengths[index] + primitive.length() * parameter,
                point: candidate,
                tangent: primitive.tangent_at(parameter).ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::BoundaryProjectionFailed)
                })?,
                segment_index: index,
                parameter,
                distance_mm: candidate_distance,
                coordinate_key: primitive.coordinate_key_at(parameter, candidate),
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

    pub(crate) fn backward_run_is_linear(&self, start_offset_mm: f64, end_offset_mm: f64) -> bool {
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
                if segment_end > start + RECONSTRUCTION_SNAP_MM
                    && segment_start < end - RECONSTRUCTION_SNAP_MM
                    && !primitive.is_line()
                {
                    return false;
                }
            }
        }
        true
    }

    pub(crate) fn backward_run(
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
                if vertex_offset > start + RECONSTRUCTION_SNAP_MM
                    && vertex_offset < end - RECONSTRUCTION_SNAP_MM
                {
                    result.push(primitive.end());
                }
            }
        }
        result.push(self.location_at_offset(end)?.point);
        result.dedup_by(|left, right| distance(*left, *right) <= RECONSTRUCTION_SNAP_MM);
        Ok(result)
    }
}

fn primitive_horizontal_winding(primitive: ExactLocalBoundaryPrimitive, point: Point) -> i64 {
    match primitive.geometry {
        ExactLocalPrimitiveGeometry::Line { start, end } => {
            if start.y <= point.y && end.y > point.y {
                i64::from(
                    robust::orient2d(robust_coord(start), robust_coord(end), robust_coord(point))
                        > 0.0,
                )
            } else if end.y <= point.y && start.y > point.y {
                -i64::from(
                    robust::orient2d(robust_coord(start), robust_coord(end), robust_coord(point))
                        < 0.0,
                )
            } else {
                0
            }
        }
        ExactLocalPrimitiveGeometry::Arc {
            start,
            center,
            radius_mm,
            sweep_rad,
            ..
        } => arc_horizontal_winding(start, center, radius_mm, sweep_rad, point),
    }
}

fn arc_horizontal_winding(
    start: Point,
    center: Point,
    radius_mm: f64,
    sweep_rad: f64,
    point: Point,
) -> i64 {
    let start_angle = (start.y - center.y).atan2(start.x - center.x);
    let mut split_parameters = vec![0.0, 1.0];
    for extremum in [
        std::f64::consts::FRAC_PI_2,
        3.0 * std::f64::consts::FRAC_PI_2,
    ] {
        for turn in -2..=2 {
            let angle = extremum + turn as f64 * TAU;
            let parameter = (angle - start_angle) / sweep_rad;
            if parameter > 0.0 && parameter < 1.0 {
                split_parameters.push(parameter);
            }
        }
    }
    split_parameters.sort_by(f64::total_cmp);
    split_parameters.dedup_by(|left, right| *left == *right);

    let mut winding = 0_i64;
    for interval in split_parameters.windows(2) {
        let start_parameter = interval[0];
        let end_parameter = interval[1];
        let start_y = center.y + radius_mm * (start_angle + sweep_rad * start_parameter).sin();
        let end_y = center.y + radius_mm * (start_angle + sweep_rad * end_parameter).sin();
        let direction = if start_y <= point.y && end_y > point.y {
            1_i64
        } else if end_y <= point.y && start_y > point.y {
            -1_i64
        } else {
            continue;
        };
        let Some(parameter) = arc_horizontal_crossing_parameter(
            start_angle,
            sweep_rad,
            center,
            radius_mm,
            point.y,
            start_parameter,
            end_parameter,
        ) else {
            continue;
        };
        let x = center.x + radius_mm * (start_angle + sweep_rad * parameter).cos();
        if x > point.x {
            winding += direction;
        }
    }
    winding
}

fn arc_horizontal_crossing_parameter(
    start_angle: f64,
    sweep_rad: f64,
    center: Point,
    radius_mm: f64,
    y: f64,
    interval_start: f64,
    interval_end: f64,
) -> Option<f64> {
    let sine = ((y - center.y) / radius_mm).clamp(-1.0, 1.0);
    let first = sine.asin();
    let targets = [first, std::f64::consts::PI - first];
    let midpoint = (interval_start + interval_end) * 0.5;
    let parameter_tolerance = 64.0 * f64::EPSILON;
    let mut best: Option<f64> = None;
    for target in targets {
        for turn in -2..=2 {
            let angle = target + turn as f64 * TAU;
            let parameter = (angle - start_angle) / sweep_rad;
            if parameter >= interval_start - parameter_tolerance
                && parameter <= interval_end + parameter_tolerance
                && best.is_none_or(|current| {
                    (parameter - midpoint)
                        .abs()
                        .total_cmp(&(current - midpoint).abs())
                        == Ordering::Less
                })
            {
                best = Some(parameter.clamp(interval_start, interval_end));
            }
        }
    }
    best
}

fn robust_coord(point: Point) -> robust::Coord<f64> {
    robust::Coord {
        x: point.x,
        y: point.y,
    }
}

fn helper_subdivision_count(source: &PathPrimitive) -> Result<usize, MedialAxisError> {
    let required = match source {
        PathPrimitive::Line { .. } => 1.0,
        PathPrimitive::Arc {
            radius_mm,
            sweep_rad,
            ..
        } => {
            if *radius_mm <= HELPER_TESSELLATION_HAUSDORFF_MM {
                1.0
            } else {
                let ratio = HELPER_TESSELLATION_HAUSDORFF_MM / *radius_mm;
                let max_segment_angle = 4.0 * (0.5 * ratio).sqrt().asin();
                (sweep_rad.abs() / max_segment_angle).ceil().max(1.0)
            }
        }
    };
    if !required.is_finite() || required > MAX_GRAPH_ITEMS as f64 {
        return Err(MedialAxisError::resource(
            MedialAxisErrorReason::GraphResourceLimit,
        ));
    }
    Ok(required as usize)
}

fn intersection_endpoint_roundoff_mm(start: Point, end: Point, hit: Point) -> f64 {
    let scale = [start.x, start.y, end.x, end.y, hit.x, hit.y]
        .into_iter()
        .map(f64::abs)
        .fold(1.0_f64, f64::max);
    (256.0 * f64::EPSILON * scale).min(RECONSTRUCTION_SNAP_MM)
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
        if !graph.is_connected_assembled() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        if !graph.is_acyclic_assembled() {
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
            if edge.id.index() != index || edge.id != edge.authoritative_id {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeId,
                ));
            }
            if edge.a != edge.authoritative_a
                || edge.b != edge.authoritative_b
                || edge.a == edge.b
                || edge.a.index() >= nodes.len()
                || edge.b.index() >= nodes.len()
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeEndpoint,
                ));
            }
            if edge.polyline.len() < 2
                || edge.local_polyline.len() != edge.polyline.len()
                || edge.local_coordinate_keys.len() != edge.local_polyline.len()
                || edge.polyline.iter().any(|point| !finite_point(*point))
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
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
        let node_coordinate_keys = node_coordinate_keys.unwrap_or_else(|| {
            node_local_points
                .iter()
                .copied()
                .map(local_coordinate_key)
                .collect()
        });
        if node_coordinate_keys.len() != nodes.len()
            || edges
                .iter()
                .any(|edge| edge.canonical_origin != canonical_origin)
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        if nodes
            .iter()
            .zip(&node_local_points)
            .zip(&node_coordinate_keys)
            .any(|((node, local), key)| {
                publish_point(canonical_origin, *local, *key) != Some(node.point)
            })
            || edges.iter().any(|edge| {
                !edge
                    .polyline
                    .iter()
                    .zip(&edge.local_polyline)
                    .zip(&edge.local_coordinate_keys)
                    .all(|((public, local), key)| {
                        publish_point(canonical_origin, *local, *key) == Some(*public)
                    })
            })
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        validate_local_shadow(&nodes, &edges, &node_local_points)?;

        let ccw_edges = compute_embedding(nodes.len(), &edges)?;
        let leaves: Vec<NodeId> = ccw_edges
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
        Ok(Self {
            nodes,
            edges,
            ccw_edges,
            authoritative_leaves: leaves.clone(),
            leaves,
            canonical_origin,
            node_local_points,
            node_coordinate_keys,
            node_source_ids,
            edge_source_ids,
            exact_local_boundary: None,
        })
    }

    fn preflight_public_resources(&self) -> Result<(), MedialAxisError> {
        preflight_parts(&self.nodes, &self.edges)?;
        preflight_edge_local_polylines(&self.edges)?;
        if self.ccw_edges.len() > MAX_GRAPH_ITEMS
            || self.leaves.len() > MAX_GRAPH_ITEMS
            || self.node_local_points.len() > MAX_GRAPH_ITEMS
            || self.node_coordinate_keys.len() > MAX_GRAPH_ITEMS
            || self.node_source_ids.len() > MAX_GRAPH_ITEMS
            || self.edge_source_ids.len() > MAX_GRAPH_ITEMS
            || self.authoritative_leaves.len() > MAX_GRAPH_ITEMS
            || self.exact_local_boundary.as_ref().is_some_and(|boundary| {
                boundary.primitives.len() > MAX_GRAPH_ITEMS
                    || boundary.helper_segment_count > MAX_GRAPH_ITEMS
                    || boundary
                        .source_boundary
                        .as_ref()
                        .is_some_and(|source| source.len() > MAX_GRAPH_ITEMS)
                    || boundary
                        .source_quantized_segments
                        .as_ref()
                        .is_some_and(|source| source.len() > MAX_GRAPH_ITEMS)
            })
        {
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

    pub(crate) fn attach_exact_local_boundary(
        &mut self,
        boundary: Arc<ExactLocalBoundary>,
    ) -> Result<(), MedialAxisError> {
        if boundary.canonical_origin() != self.canonical_origin {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        self.exact_local_boundary = Some(boundary);
        Ok(())
    }

    pub(crate) fn exact_local_boundary(
        &self,
        allowed: &AllowedRegion,
    ) -> Result<Arc<ExactLocalBoundary>, MedialAxisError> {
        if let Some(boundary) = &self.exact_local_boundary {
            if !boundary.matches_allowed(allowed) {
                return Err(MedialAxisError::validation(
                    MedialAxisErrorReason::InvalidGraphPosition,
                ));
            }
            return Ok(Arc::clone(boundary));
        }
        Ok(Arc::new(ExactLocalBoundary::from_allowed(allowed)?))
    }

    fn point_in_boundary_frame(
        &self,
        boundary: &ExactLocalBoundary,
        node: NodeId,
    ) -> Result<Point, MedialAxisError> {
        let point = self
            .node_local_points
            .get(node.index())
            .copied()
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
        translate_local_frame(point, self.canonical_origin, boundary.canonical_origin())
    }

    fn derive_authoritative_copy(&self) -> Result<Self, MedialAxisError> {
        self.preflight_public_resources()?;
        let (ccw_edges, leaves) = self.validate_authoritative_provenance()?;
        let mut graph = self.clone();
        graph.ccw_edges = ccw_edges;
        graph.leaves = leaves;
        Ok(graph)
    }

    fn authoritative_copy(&self) -> Result<Self, MedialAxisError> {
        let mut graph = self.derive_authoritative_copy()?;
        self.validate_public_derived_state(&graph.ccw_edges, &graph.leaves)?;
        graph.leaves = self.authoritative_leaves.clone();
        graph.authoritative_leaves = self.authoritative_leaves.clone();
        Ok(graph)
    }

    fn validate_authoritative_provenance(
        &self,
    ) -> Result<(Vec<Vec<EdgeId>>, Vec<NodeId>), MedialAxisError> {
        if self.nodes.is_empty() || self.edges.is_empty() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::EmptyGraph,
            ));
        }
        if !finite_point(self.canonical_origin) {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        if self.node_local_points.len() != self.nodes.len()
            || self.node_coordinate_keys.len() != self.nodes.len()
            || self.node_source_ids.len() != self.nodes.len()
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        for (index, ((node, local), key)) in self
            .nodes
            .iter()
            .zip(&self.node_local_points)
            .zip(&self.node_coordinate_keys)
            .enumerate()
        {
            if node.id.index() != index {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidNodeId,
                ));
            }
            if !finite_point(node.point)
                || !finite_point(*local)
                || !node.clearance_mm.is_finite()
                || node.clearance_mm < 0.0
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
                ));
            }
            if publish_point(self.canonical_origin, *local, *key) != Some(node.point) {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidGraphPosition,
                ));
            }
        }

        for (index, edge) in self.edges.iter().enumerate() {
            if edge.id.index() != index || edge.id != edge.authoritative_id {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeId,
                ));
            }
            if edge.a != edge.authoritative_a
                || edge.b != edge.authoritative_b
                || edge.a == edge.b
                || edge.a.index() >= self.nodes.len()
                || edge.b.index() >= self.nodes.len()
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidEdgeEndpoint,
                ));
            }
            if edge.canonical_origin != self.canonical_origin {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidGraphPosition,
                ));
            }
            if edge.polyline.len() < 2
                || edge.local_polyline.len() != edge.polyline.len()
                || edge.local_coordinate_keys.len() != edge.local_polyline.len()
                || edge.polyline.iter().any(|point| !finite_point(*point))
                || edge
                    .local_polyline
                    .iter()
                    .any(|point| !finite_point(*point))
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::NonFiniteGeometry,
                ));
            }
            if !edge
                .polyline
                .iter()
                .zip(&edge.local_polyline)
                .zip(&edge.local_coordinate_keys)
                .all(|((public, local), key)| {
                    publish_point(self.canonical_origin, *local, *key) == Some(*public)
                })
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidGraphPosition,
                ));
            }
            let local_start = edge.local_polyline.first().copied().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?;
            let local_end = edge.local_polyline.last().copied().ok_or_else(|| {
                MedialAxisError::degenerate(MedialAxisErrorReason::InvalidPolylineEndpoint)
            })?;
            if distance(local_start, self.node_local_points[edge.a.index()]) > ENDPOINT_TOLERANCE_MM
                || distance(local_end, self.node_local_points[edge.b.index()])
                    > ENDPOINT_TOLERANCE_MM
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::InvalidPolylineEndpoint,
                ));
            }
            let local_length = polyline_length(&edge.local_polyline);
            if !edge.length_mm.is_finite()
                || edge.length_mm <= 0.0
                || !local_length.is_finite()
                || local_length <= 0.0
                || (local_length - edge.length_mm).abs()
                    > LENGTH_TOLERANCE_MM * local_length.max(edge.length_mm).max(1.0)
            {
                return Err(MedialAxisError::degenerate(
                    MedialAxisErrorReason::ZeroLengthEdge,
                ));
            }
        }

        let ccw_edges = compute_embedding(self.nodes.len(), &self.edges)?;
        let leaves = ccw_edges
            .iter()
            .enumerate()
            .filter_map(|(index, incident)| (incident.len() == 1).then_some(NodeId(index as u32)))
            .collect();
        Ok((ccw_edges, leaves))
    }

    fn validate_public_derived_state(
        &self,
        derived_ccw_edges: &[Vec<EdgeId>],
        derived_leaves: &[NodeId],
    ) -> Result<(), MedialAxisError> {
        if self.edge_source_ids.len() != self.edges.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
        }
        if self.ccw_edges.len() != self.nodes.len() {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        if self
            .ccw_edges
            .iter()
            .flatten()
            .any(|edge| edge.index() >= self.edges.len())
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
        }
        if self.ccw_edges != derived_ccw_edges {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidCyclicEmbedding,
            ));
        }
        if self
            .authoritative_leaves
            .iter()
            .chain(&self.leaves)
            .any(|leaf| leaf.index() >= self.nodes.len())
        {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        let mut authoritative_leaves = self.authoritative_leaves.clone();
        authoritative_leaves.sort();
        let mut derived_leaves = derived_leaves.to_vec();
        derived_leaves.sort();
        if authoritative_leaves != derived_leaves || self.leaves != self.authoritative_leaves {
            return Err(MedialAxisError::degenerate(
                MedialAxisErrorReason::LeafNotOnBoundary,
            ));
        }
        Ok(())
    }

    pub const fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub const fn edge_count(&self) -> usize {
        self.edges.len()
    }

    pub fn degree(&self, node: NodeId) -> Option<usize> {
        self.authoritative_copy()
            .ok()
            .and_then(|graph| graph.degree_assembled(node))
    }

    fn degree_assembled(&self, node: NodeId) -> Option<usize> {
        self.ccw_edges.get(node.index()).map(Vec::len)
    }

    pub fn is_connected(&self) -> bool {
        self.authoritative_copy()
            .map(|graph| graph.is_connected_assembled())
            .unwrap_or(false)
    }

    fn is_connected_assembled(&self) -> bool {
        if self.nodes.is_empty() {
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
        self.authoritative_copy()
            .map(|graph| graph.is_acyclic_assembled())
            .unwrap_or(false)
    }

    fn is_acyclic_assembled(&self) -> bool {
        !self.nodes.is_empty()
            && self.is_connected_assembled()
            && self.edges.len() == self.nodes.len().saturating_sub(1)
    }

    pub fn all_samples_inside(&self, allowed: &AllowedRegion) -> bool {
        self.preflight_public_resources().is_ok()
            && self
                .authoritative_copy()
                .and_then(|graph| {
                    let boundary = graph.exact_local_boundary(allowed)?;
                    let mut aggregate_work = 0usize;
                    graph.all_samples_inside_exact(&boundary, &mut aggregate_work)
                })
                .unwrap_or(false)
    }

    fn all_samples_inside_exact(
        &self,
        boundary: &ExactLocalBoundary,
        aggregate_work: &mut usize,
    ) -> Result<bool, MedialAxisError> {
        for edge in &self.edges {
            let certification = if self.canonical_origin == boundary.canonical_origin() {
                boundary.certify_local_polyline(&edge.local_polyline, aggregate_work)?
            } else {
                let local = edge
                    .local_polyline
                    .iter()
                    .copied()
                    .map(|point| {
                        translate_local_frame(
                            point,
                            self.canonical_origin,
                            boundary.canonical_origin(),
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                boundary.certify_local_polyline(&local, aggregate_work)?
            };
            if !certification.contained {
                return Ok(false);
            }
        }
        Ok(true)
    }

    pub fn has_no_crossings(&self) -> bool {
        self.preflight_public_resources()
            .and_then(|()| ensure_crossing_validation_budget(self))
            .and_then(|()| self.authoritative_copy())
            .and_then(|graph| crossings_are_valid(&graph, false))
            .unwrap_or(false)
    }

    fn has_no_nonincident_crossings(&self) -> Result<bool, MedialAxisError> {
        self.preflight_public_resources()?;
        crossings_are_valid(self, true)
    }

    pub fn embedding_is_ccw(&self) -> bool {
        self.authoritative_copy().is_ok()
    }

    pub fn validate(&self, allowed: &AllowedRegion) -> Result<(), MedialAxisError> {
        let mut aggregate_work = 0usize;
        self.validate_with_local_certification_work(allowed, &mut aggregate_work)
    }

    pub(crate) fn validate_with_local_certification_work(
        &self,
        allowed: &AllowedRegion,
        aggregate_work: &mut usize,
    ) -> Result<(), MedialAxisError> {
        self.preflight_public_resources()?;
        let mut independently_derived = self
            .derive_authoritative_copy()
            .map_err(validation_or_resource_error)?;
        if !independently_derived.is_connected_assembled() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::DisconnectedGraph,
            ));
        }
        if !independently_derived.is_acyclic_assembled() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::CyclicGraph,
            ));
        }
        let boundary = independently_derived
            .exact_local_boundary(allowed)
            .map_err(validation_or_resource_error)?;
        if !independently_derived.all_samples_inside_exact(&boundary, aggregate_work)? {
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
        if self
            .leaves
            .iter()
            .any(|leaf| leaf.index() >= self.nodes.len())
        {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        if self
            .authoritative_leaves
            .iter()
            .any(|leaf| leaf.index() >= self.nodes.len())
        {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::InvalidNodeId,
            ));
        }
        if independently_derived.leaves != self.authoritative_leaves
            || self.leaves != self.authoritative_leaves
        {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::LeafNotOnBoundary,
            ));
        }
        for leaf in &independently_derived.leaves {
            let point = independently_derived.point_in_boundary_frame(&boundary, *leaf)?;
            if boundary.nearest_location(point)?.distance_mm > TOPOLOGY_QUANTIZATION_MM + 1e-9
                || boundary.classify_local_point(point) == PointClassification::Outside
                || independently_derived.degree_assembled(*leaf) != Some(1)
            {
                return Err(MedialAxisError::validation(
                    MedialAxisErrorReason::LeafNotOnBoundary,
                ));
            }
        }
        if self
            .ccw_edges
            .iter()
            .flatten()
            .any(|edge| edge.index() >= self.edges.len())
        {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::InvalidEdgeId,
            ));
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
        let graph = self
            .authoritative_copy()
            .map_err(validation_or_resource_error)?;
        let boundary = graph
            .exact_local_boundary(allowed)
            .map_err(validation_or_resource_error)?;
        ensure_boundary_location_budget(graph.leaves.len(), boundary.primitive_count())?;
        let mut offsets = Vec::with_capacity(graph.leaves.len());
        for leaf in &graph.leaves {
            let point = graph.point_in_boundary_frame(&boundary, *leaf)?;
            let location = boundary.nearest_location(point)?;
            if location.distance_mm > TOPOLOGY_QUANTIZATION_MM + 1e-9 {
                return Err(MedialAxisError::validation(
                    MedialAxisErrorReason::LeafNotOnBoundary,
                ));
            }
            offsets.push(location.offset_mm);
        }
        offsets.sort_by(f64::total_cmp);
        Ok(offsets)
    }

    pub fn stable_event_ids(&self) -> Vec<NodeId> {
        self.authoritative_copy()
            .map(|graph| graph.nodes.iter().map(|node| node.id).collect())
            .unwrap_or_default()
    }

    pub fn position_on_edge(
        &self,
        edge: EdgeId,
        fraction: f64,
    ) -> Result<GraphPosition, MedialAxisError> {
        let graph = self
            .authoritative_copy()
            .map_err(invalid_public_api_error)?;
        let edge = graph
            .edges
            .get(edge.index())
            .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?;
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(MedialAxisError::invalid(
                MedialAxisErrorReason::InvalidGraphPosition,
            ));
        }
        Ok(GraphPosition::Edge {
            edge: edge.id,
            distance_mm: polyline_length(&edge.local_polyline) * fraction,
        })
    }

    pub fn point_at(&self, position: GraphPosition) -> Result<Point, MedialAxisError> {
        let graph = self
            .authoritative_copy()
            .map_err(invalid_public_api_error)?;
        match position {
            GraphPosition::Node(node) => {
                let point = graph
                    .node_local_points
                    .get(node.index())
                    .copied()
                    .ok_or_else(|| {
                        MedialAxisError::invalid(MedialAxisErrorReason::InvalidNodeId)
                    })?;
                let key = graph
                    .node_coordinate_keys
                    .get(node.index())
                    .copied()
                    .ok_or_else(|| {
                        MedialAxisError::invalid(MedialAxisErrorReason::InvalidNodeId)
                    })?;
                graph
                    .publish_local_point(point, key)
                    .map_err(invalid_public_api_error)
            }
            GraphPosition::Edge { edge, distance_mm } => graph
                .edges
                .get(edge.index())
                .ok_or_else(|| MedialAxisError::invalid(MedialAxisErrorReason::InvalidEdgeId))?
                .point_at_distance(distance_mm),
        }
    }

    pub fn center(&self) -> Result<GraphCenter, MedialAxisError> {
        let graph = self
            .authoritative_copy()
            .map_err(validation_or_resource_error)?;
        if !graph.is_acyclic_assembled() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::CyclicGraph,
            ));
        }
        graph.center_of_valid_tree()
    }

    fn center_of_valid_tree(&self) -> Result<GraphCenter, MedialAxisError> {
        let (first, _, _) = self.farthest_from(NodeId(0))?;
        let (second, diameter, parent) = self.farthest_from(first)?;
        if !diameter.is_finite() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        let radius_mm = diameter * 0.5;
        if !radius_mm.is_finite() {
            return Err(MedialAxisError::validation(
                MedialAxisErrorReason::NonFiniteGeometry,
            ));
        }
        let mut remaining = radius_mm;
        let mut current = second;
        if remaining <= LENGTH_TOLERANCE_MM {
            let point = self.published_node_point(current)?;
            return Ok(GraphCenter {
                point,
                position: GraphPosition::Node(current),
                radius_mm,
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
            let edge_length_mm = polyline_length(&edge.local_polyline);
            if remaining < edge_length_mm - LENGTH_TOLERANCE_MM {
                let distance_from_a = if edge.a == current {
                    remaining
                } else {
                    edge_length_mm - remaining
                };
                let position = GraphPosition::Edge {
                    edge: edge_id,
                    distance_mm: distance_from_a,
                };
                return Ok(GraphCenter {
                    point: edge.point_at_distance(distance_from_a)?,
                    position,
                    radius_mm,
                });
            }
            if (remaining - edge_length_mm).abs() <= LENGTH_TOLERANCE_MM {
                let point = self.published_node_point(previous)?;
                return Ok(GraphCenter {
                    point,
                    position: GraphPosition::Node(previous),
                    radius_mm,
                });
            }
            remaining -= edge_length_mm;
            current = previous;
        }

        let point = self.published_node_point(first)?;
        Ok(GraphCenter {
            point,
            position: GraphPosition::Node(first),
            radius_mm,
        })
    }

    fn published_node_point(&self, node: NodeId) -> Result<Point, MedialAxisError> {
        let local = self
            .node_local_points
            .get(node.index())
            .copied()
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
        let key = self
            .node_coordinate_keys
            .get(node.index())
            .copied()
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidNodeId))?;
        publish_point(self.canonical_origin, local, key)
            .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidGraphPosition))
    }

    fn farthest_from(&self, start: NodeId) -> Result<FarthestResult, MedialAxisError> {
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
                let next_distance = distances[node.index()] + polyline_length(&edge.local_polyline);
                if !next_distance.is_finite() {
                    return Err(MedialAxisError::validation(
                        MedialAxisErrorReason::NonFiniteGeometry,
                    ));
                }
                parent[next.index()] = Some((node, *edge_id));
                distances[next.index()] = next_distance;
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
        let boundary = self.exact_local_boundary(allowed)?;
        ensure_boundary_location_budget(self.leaves.len(), boundary.primitive_count())?;
        let mut located = Vec::with_capacity(self.leaves.len());
        for leaf in &self.leaves {
            let point = self.point_in_boundary_frame(&boundary, *leaf)?;
            located.push((boundary.nearest_location(point)?.offset_mm, *leaf));
        }
        located.sort_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.cmp(&right.1))
        });
        self.leaves = located.into_iter().map(|(_, leaf)| leaf).collect();
        self.authoritative_leaves = self.leaves.clone();
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
        let exact_local_boundary = self.exact_local_boundary.clone();
        let mut rebuilt = graph_from_polylines(
            &geometries,
            &geometry_source_ids,
            self.canonical_origin,
            &endpoint_keys,
            |point| {
                Ok(self
                    .node_local_points
                    .iter()
                    .position(|candidate| *candidate == point)
                    .and_then(|index| self.nodes.get(index))
                    .map(|node| node.clearance_mm)
                    .unwrap_or(0.0))
            },
        )?;
        rebuilt.exact_local_boundary = exact_local_boundary;
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
        endpoint_keys: &[[[i64; 2]; 2]],
    ) -> Result<(), MedialAxisError> {
        self.preflight_public_resources()?;
        let boundary = self.exact_local_boundary(allowed)?;
        let mut rebuilt = graph_from_polylines(
            polylines,
            source_ids,
            allowed.quantization_origin,
            endpoint_keys,
            |point| Ok(boundary.nearest_location(point)?.distance_mm),
        )?;
        rebuilt.attach_exact_local_boundary(boundary)?;
        *self = rebuilt;
        self.sort_leaves_on_boundary(allowed)
    }

    pub(crate) fn endpoint_keys_for_local_polylines(
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

    pub(crate) fn publish_local_point(
        &self,
        point: Point,
        coordinate_key: [i64; 2],
    ) -> Result<Point, MedialAxisError> {
        publish_point(self.canonical_origin, point, coordinate_key)
            .ok_or_else(|| MedialAxisError::degenerate(MedialAxisErrorReason::InvalidGraphPosition))
    }

    pub(crate) fn local_coordinate_key_at_segment_parameter(
        &self,
        edge: EdgeId,
        segment: usize,
        parameter: f64,
        point: Point,
    ) -> Option<[i64; 2]> {
        let edge = self.edges.get(edge.index())?;
        if parameter <= 0.0 {
            edge.local_coordinate_keys.get(segment).copied()
        } else if parameter >= 1.0 {
            edge.local_coordinate_keys.get(segment + 1).copied()
        } else {
            Some(local_coordinate_key(point))
        }
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
        let graph = self
            .authoritative_copy()
            .map_err(validation_or_resource_error)?;
        let nodes = graph
            .nodes
            .iter()
            .zip(&graph.node_local_points)
            .map(|(node, local)| MedialNode {
                id: node.id,
                point: *local,
                clearance_mm: node.clearance_mm,
            })
            .collect::<Vec<_>>();
        let edges = graph
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
                return local_polyline_slice_allowing_zero(
                    first,
                    first_distance_mm,
                    second_distance_mm,
                );
            }
            let mut path =
                local_polyline_slice_allowing_zero(first, second_distance_mm, first_distance_mm)?;
            path.reverse();
            return Ok(path);
        }

        let first_length_mm = polyline_length(&first.local_polyline);
        let second_length_mm = polyline_length(&second.local_polyline);
        let first_choices = [
            (
                first.a,
                first_distance_mm,
                local_edge_position_to_endpoint(first, first_distance_mm, first.a)?,
            ),
            (
                first.b,
                first_length_mm - first_distance_mm,
                local_edge_position_to_endpoint(first, first_distance_mm, first.b)?,
            ),
        ];
        let second_choices = [
            (
                second.a,
                second_distance_mm,
                local_edge_position_to_endpoint(second, second_distance_mm, second.a)?,
            ),
            (
                second.b,
                second_length_mm - second_distance_mm,
                local_edge_position_to_endpoint(second, second_distance_mm, second.b)?,
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
            return Ok((0.0, vec![self.node_local_points[start.index()]]));
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
        let mut path = vec![self.node_local_points[start.index()]];
        let mut length = 0.0;
        let mut current = start;
        for (_previous, edge_id) in steps {
            let edge = self
                .edges
                .get(edge_id.index())
                .ok_or_else(|| MedialAxisError::validation(MedialAxisErrorReason::InvalidEdgeId))?;
            let edge_path = self.oriented_local_polyline(edge.id, current)?;
            append_polyline(&mut path, &edge_path);
            length += polyline_length(&edge.local_polyline);
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
    F: Fn(Point) -> Result<f64, MedialAxisError>,
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
                (*polyline.first()?, keys[0], *source_ids),
                (*polyline.last()?, keys[1], *source_ids),
            ))
        })
        .flat_map(|(start, end)| [start, end])
        .collect::<Vec<_>>();
    raw_endpoints.sort_by(|left, right| {
        local_coordinate_key(left.0)
            .cmp(&local_coordinate_key(right.0))
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
        .map(|(index, (local, coordinate_key, _source_ids))| {
            Ok(MedialNode {
                id: NodeId(index as u32),
                point: publish_point(canonical_origin, local, coordinate_key).ok_or_else(|| {
                    MedialAxisError::degenerate(MedialAxisErrorReason::InvalidGraphPosition)
                })?,
                clearance_mm: clearance(local)?,
            })
        })
        .collect::<Result<Vec<_>, MedialAxisError>>()?;
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
        let mut polyline = polyline.clone();
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
        let mut coordinate_keys = polyline
            .iter()
            .copied()
            .map(local_coordinate_key)
            .collect::<Vec<_>>();
        coordinate_keys[0] = endpoints[a].1;
        let last_key = coordinate_keys.len() - 1;
        coordinate_keys[last_key] = endpoints[b].1;
        edge_data.push((a, b, *source_ids, polyline, coordinate_keys));
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
        .map(|(_, _, source_ids, _, _)| *source_ids)
        .collect();
    let edges = edge_data
        .into_iter()
        .enumerate()
        .map(
            |(index, (a, b, _source_ids, local_polyline, local_coordinate_keys))| {
                let polyline = local_polyline
                    .iter()
                    .copied()
                    .zip(&local_coordinate_keys)
                    .map(|(point, key)| {
                        publish_point(canonical_origin, point, *key).ok_or_else(|| {
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
                    canonical_origin,
                ))
            },
        )
        .collect::<Result<Vec<_>, MedialAxisError>>()?;
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
        if !edge.length_mm.is_finite()
            || edge.length_mm <= 0.0
            || !local_length.is_finite()
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
    let key_count = edges.iter().try_fold(0usize, |total, edge| {
        total.checked_add(edge.local_coordinate_keys.len())
    });
    if point_count.is_none_or(|points| points > MAX_GRAPH_ITEMS)
        || key_count.is_none_or(|keys| keys > MAX_GRAPH_ITEMS)
    {
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

fn invalid_public_api_error(error: MedialAxisError) -> MedialAxisError {
    match error {
        MedialAxisError::ResourceLimit { .. } => error,
        _ => {
            let reason = match error.reason() {
                MedialAxisErrorReason::InvalidNodeId => MedialAxisErrorReason::InvalidNodeId,
                MedialAxisErrorReason::InvalidEdgeId => MedialAxisErrorReason::InvalidEdgeId,
                _ => MedialAxisErrorReason::InvalidGraphPosition,
            };
            MedialAxisError::invalid(reason)
        }
    }
}

fn compare_canonical_endpoint(
    left: &(Point, [i64; 2], [u32; 2]),
    right: &(Point, [i64; 2], [u32; 2]),
) -> Ordering {
    local_coordinate_key(left.0)
        .cmp(&local_coordinate_key(right.0))
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

fn local_polyline_slice_allowing_zero(
    edge: &MedialEdge,
    start_mm: f64,
    end_mm: f64,
) -> Result<Vec<Point>, MedialAxisError> {
    if (end_mm - start_mm).abs() <= LENGTH_TOLERANCE_MM {
        return Ok(vec![point_at_polyline_distance(
            &edge.local_polyline,
            start_mm,
        )?]);
    }
    polyline_slice_values(&edge.local_polyline, start_mm, end_mm)
}

fn local_edge_position_to_endpoint(
    edge: &MedialEdge,
    distance_mm: f64,
    endpoint: NodeId,
) -> Result<Vec<Point>, MedialAxisError> {
    if endpoint == edge.a {
        let mut path = local_polyline_slice_allowing_zero(edge, 0.0, distance_mm)?;
        path.reverse();
        Ok(path)
    } else if endpoint == edge.b {
        local_polyline_slice_allowing_zero(edge, distance_mm, polyline_length(&edge.local_polyline))
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

fn ensure_crossing_validation_budget(graph: &MedialGraph) -> Result<(), MedialAxisError> {
    let segment_count = graph
        .edges
        .iter()
        .try_fold(0usize, |total, edge| {
            total.checked_add(edge.local_polyline.len().saturating_sub(1))
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
    Ok(())
}

fn crossings_are_valid(
    graph: &MedialGraph,
    ignore_incident_edge_pairs: bool,
) -> Result<bool, MedialAxisError> {
    graph.preflight_public_resources()?;
    ensure_crossing_validation_budget(graph)?;
    for first_edge_index in 0..graph.edges.len() {
        let first_edge = &graph.edges[first_edge_index];
        let first_polyline = &first_edge.local_polyline;
        for first_segment in 0..first_polyline.len().saturating_sub(1) {
            for second_edge_index in first_edge_index..graph.edges.len() {
                let second_edge = &graph.edges[second_edge_index];
                if ignore_incident_edge_pairs
                    && first_edge_index != second_edge_index
                    && edges_share_node(first_edge, second_edge)
                {
                    continue;
                }
                let second_polyline = &second_edge.local_polyline;
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
                                    GraphSegmentRef {
                                        edge: first_edge,
                                        polyline: first_polyline,
                                        segment: first_segment,
                                    },
                                    GraphSegmentRef {
                                        edge: second_edge,
                                        polyline: second_polyline,
                                        segment: second_segment,
                                    },
                                    hit.point,
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

#[derive(Clone, Copy)]
struct GraphSegmentRef<'a> {
    edge: &'a MedialEdge,
    polyline: &'a [Point],
    segment: usize,
}

fn allowed_graph_touch(
    graph: &MedialGraph,
    first: GraphSegmentRef<'_>,
    second: GraphSegmentRef<'_>,
    point: Point,
) -> bool {
    if first.edge.id == second.edge.id {
        if second.segment != first.segment + 1 {
            return false;
        }
        return first.polyline.get(second.segment).is_some_and(|shared| {
            distance(point, *shared) <= ENDPOINT_TOLERANCE_MM
                && segment_has_endpoint(first.polyline, first.segment, *shared)
                && segment_has_endpoint(second.polyline, second.segment, *shared)
        });
    }
    [first.edge.a, first.edge.b]
        .into_iter()
        .filter(|node| *node == second.edge.a || *node == second.edge.b)
        .any(|node| {
            let node_point = graph.node_local_points[node.index()];
            distance(point, node_point) <= ENDPOINT_TOLERANCE_MM
                && segment_has_endpoint(first.polyline, first.segment, node_point)
                && segment_has_endpoint(second.polyline, second.segment, node_point)
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

fn positive_angle_delta(from: f64, to: f64) -> f64 {
    (to - from).rem_euclid(TAU)
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

fn checked_local_coordinate_key(point: Point) -> Result<[i64; 2], MedialAxisError> {
    let coordinate = |value: f64| {
        let scaled = (value / TOPOLOGY_QUANTIZATION_MM).round();
        if !scaled.is_finite() || scaled < i64::MIN as f64 || scaled >= i64::MAX as f64 {
            None
        } else {
            Some(scaled as i64)
        }
    };
    Ok([
        coordinate(point.x)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
        coordinate(point.y)
            .ok_or_else(|| MedialAxisError::resource(MedialAxisErrorReason::GraphResourceLimit))?,
    ])
}

const fn quantized_key(point: QuantizedPoint) -> [i64; 2] {
    [point.x, point.y]
}

fn translate_local_frame(
    point: Point,
    source_origin: Point,
    target_origin: Point,
) -> Result<Point, MedialAxisError> {
    let translated = point + (source_origin - target_origin);
    if finite_point(translated) {
        Ok(translated)
    } else {
        Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::NonFiniteGeometry,
        ))
    }
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

pub(crate) fn publish_point(origin: Point, local: Point, key: [i64; 2]) -> Option<Point> {
    if !finite_point(origin) || !finite_point(local) {
        return None;
    }
    Some(Point::new(
        publish_coordinate(origin.x, local.x, key[0])?,
        publish_coordinate(origin.y, local.y, key[1])?,
    ))
}

fn publish_coordinate(origin: f64, local: f64, key: i64) -> Option<f64> {
    let ordinary = origin + local;
    if !ordinary.is_finite() {
        return None;
    }
    if recovered_coordinate_key(ordinary, origin) == Some(key) {
        return Some(ordinary);
    }

    let mut lower = Some(ordinary);
    let mut upper = Some(ordinary);
    let mut best: Option<(f64, f64)> = None;
    for _ in 0..MAX_PUBLICATION_ADJACENT_STEPS {
        lower = lower.and_then(next_down);
        upper = upper.and_then(next_up);
        for candidate in [lower, upper].into_iter().flatten() {
            if recovered_coordinate_key(candidate, origin) != Some(key) {
                continue;
            }
            let difference = (candidate - ordinary).abs();
            if best.is_none_or(|(best_difference, best_candidate)| {
                difference
                    .total_cmp(&best_difference)
                    .then_with(|| candidate.total_cmp(&best_candidate))
                    == Ordering::Less
            }) {
                best = Some((difference, candidate));
            }
        }
        if let Some((best_difference, _)) = best {
            let lower_difference = lower
                .map(|candidate| (candidate - ordinary).abs())
                .unwrap_or(f64::INFINITY);
            let upper_difference = upper
                .map(|candidate| (candidate - ordinary).abs())
                .unwrap_or(f64::INFINITY);
            if lower_difference > best_difference && upper_difference > best_difference {
                break;
            }
        }
    }
    best.map(|(_, candidate)| candidate)
}

fn recovered_coordinate_key(public: f64, origin: f64) -> Option<i64> {
    let local = public - origin;
    local.is_finite().then(|| quantized_coordinate(local))
}

fn next_up(value: f64) -> Option<f64> {
    if value.is_nan() || value == f64::INFINITY {
        return None;
    }
    if value == 0.0 {
        return Some(f64::from_bits(1));
    }
    let bits = value.to_bits();
    Some(f64::from_bits(if value > 0.0 {
        bits + 1
    } else {
        bits - 1
    }))
}

fn next_down(value: f64) -> Option<f64> {
    if value.is_nan() || value == f64::NEG_INFINITY {
        return None;
    }
    if value == 0.0 {
        return Some(f64::from_bits((1_u64 << 63) | 1));
    }
    let bits = value.to_bits();
    Some(f64::from_bits(if value > 0.0 {
        bits - 1
    } else {
        bits + 1
    }))
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

fn finite_point(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}

fn cross(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}
