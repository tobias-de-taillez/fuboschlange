use crate::circuit::types::{ConnectionInput, LoopError, LoopErrorCode, RectMm};
use crate::geometry::{Aabb, PointClassification, Polygon, Vec2};
use crate::model::{PathPrimitive, Point};
use crate::plate::{EmbeddedPoseGraph, PlateInstance, PlateTransform, PoseEdge};

/// Half of the fixed 50 mm port-to-port distance: each port sits this many
/// millimeters from the normalized center, along the connection edge.
const CONNECTION_PORT_OFFSET_MM: f64 = 25.0;

/// Minimum distance a port may sit from either endpoint of its edge
/// (25 mm port offset + 8 mm minimum wall clearance).
const CONNECTION_PORT_ENDPOINT_MARGIN_MM: f64 = 33.0;

/// Width of the ring around the zone rectangle, in plate-local millimeters,
/// that is searched for graph-node entry/exit candidates.
const ENTRY_RING_MM: f64 = 150.0;

/// The noppen-free connection zone: an axis-parallel rectangle in the plate
/// frame where the loop enters/exits the certified graph, plus the two
/// ports on the connection edge that bound it.
#[derive(Clone, Debug, PartialEq)]
pub struct ConnectionZone {
    /// Plate-local, axis-parallel: `zone_width_mm` along `u` centered on the
    /// port center, `zone_depth_mm` along `v` starting at the connection
    /// edge and extending into the room.
    pub rect_local: RectMm,
    /// World-space point of the first port, 25 mm before the port center
    /// along the connection edge.
    pub start_port: Point,
    /// World-space point of the second port, 25 mm after the port center
    /// along the connection edge.
    pub end_port: Point,
    /// World-space unit normal of the connection edge, pointing into the
    /// room (matches the plate transform's `v` when built from the same
    /// edge).
    pub inward: Vec2,
}

/// The subset of a certified pose graph usable outside the connection zone,
/// plus the nodes on the zone's boundary ring where the loop may cross
/// between free-form zone routing and certified graph edges.
#[derive(Clone, Debug, PartialEq)]
pub struct LoopGraphView {
    /// Ids of edges whose geometry, converted to the plate-local frame,
    /// neither touches nor crosses the zone rectangle.
    pub usable_edges: Vec<u32>,
    /// Ids of nodes inside the zone rectangle expanded by 150 mm on every
    /// side, but not inside the zone rectangle itself; ascending by node
    /// id.
    pub entry_candidates: Vec<u32>,
}

/// Builds the connection zone for `connection` on `polygon`, expressed in
/// `transform`'s plate-local frame. `transform` must be the plate frame
/// built from the same edge as `connection.edge_index` (the usual pipeline
/// invariant: the plate frame's `u` axis runs along the connection edge) —
/// otherwise the "along the edge" / "into the room" rectangle axes below
/// stop lining up with the physical edge.
///
/// Returns `InvalidConnection` when the edge index is out of range, either
/// port would land closer than 33 mm to an edge endpoint, or any corner of
/// the zone rectangle falls outside the polygon.
///
/// Precondition: callers must run `circuit::validate_input` (or otherwise
/// guarantee `connection.center_offset_mm`, `zone_width_mm`, and
/// `zone_depth_mm` are finite and that the zone dimensions are positive)
/// first — this function only re-checks the geometry-dependent properties
/// above, which need the polygon and plate frame that `validate_input`
/// does not have.
pub fn build_connection_zone(
    polygon: &Polygon,
    transform: &PlateTransform,
    connection: &ConnectionInput,
) -> Result<ConnectionZone, LoopError> {
    let edge_index = connection.edge_index as usize;
    if edge_index >= polygon.original_edge_count() {
        return Err(invalid_connection(
            "connection.edgeIndex is outside the polygon",
        ));
    }
    let (edge_start, _edge_end) = polygon.original_edge(edge_index);
    let edge_length = polygon.original_edge_length(edge_index);
    let Some(edge_tangent) = polygon.edge_tangent_for_original(edge_index) else {
        return Err(invalid_connection("connection edge is degenerate"));
    };
    let Some(inward) = polygon.inward_normal_for_original(edge_index) else {
        return Err(invalid_connection("connection edge is degenerate"));
    };

    let first_offset_mm = connection.center_offset_mm - CONNECTION_PORT_OFFSET_MM;
    let second_offset_mm = connection.center_offset_mm + CONNECTION_PORT_OFFSET_MM;
    let port_clears_endpoints = |offset_mm: f64| {
        offset_mm >= CONNECTION_PORT_ENDPOINT_MARGIN_MM
            && (edge_length - offset_mm) >= CONNECTION_PORT_ENDPOINT_MARGIN_MM
    };
    if !port_clears_endpoints(first_offset_mm) || !port_clears_endpoints(second_offset_mm) {
        return Err(invalid_connection(
            "connection ports are closer than 33 mm to an edge endpoint",
        ));
    }

    let start_port = edge_start + edge_tangent * first_offset_mm;
    let end_port = edge_start + edge_tangent * second_offset_mm;
    let center_world = edge_start + edge_tangent * connection.center_offset_mm;
    let center_local = transform.to_local(center_world);

    let half_width_mm = connection.zone_width_mm * 0.5;
    let rect_local = RectMm {
        min: Point::new(center_local.x - half_width_mm, center_local.y),
        max: Point::new(
            center_local.x + half_width_mm,
            center_local.y + connection.zone_depth_mm,
        ),
    };

    let corner_outside_polygon = rect_corners(&rect_local).into_iter().any(|corner| {
        polygon.classify_point(transform.to_world(corner)) == PointClassification::Outside
    });
    if corner_outside_polygon {
        return Err(invalid_connection("connection zone leaves the polygon"));
    }

    Ok(ConnectionZone {
        rect_local,
        start_port,
        end_port,
        inward,
    })
}

/// Splits `graph` into the edges left usable by `zone` and the nodes on its
/// 150 mm entry/exit ring. `transform` converts each edge's world-space
/// primitives into `zone`'s plate-local frame; graph nodes already carry
/// their local pose and need no conversion.
pub fn build_graph_view(
    graph: &EmbeddedPoseGraph,
    zone: &ConnectionZone,
    transform: &PlateTransform,
) -> LoopGraphView {
    let usable_edges = graph
        .edges
        .iter()
        .filter(|edge| !edge_intersects_zone(edge, zone, transform))
        .map(|edge| edge.id)
        .collect();

    let expanded_rect = expand_rect(&zone.rect_local, ENTRY_RING_MM);
    let mut entry_candidates: Vec<u32> = graph
        .nodes
        .iter()
        .filter(|node| {
            rect_contains_point(&expanded_rect, node.local_pose.point)
                && !zone_contains_local(zone, node.local_pose.point)
        })
        .map(|node| node.id)
        .collect();
    entry_candidates.sort_unstable();

    LoopGraphView {
        usable_edges,
        entry_candidates,
    }
}

/// Whether `edge`'s world-space primitives touch or cross `zone`'s
/// rectangle once expressed in `transform`'s local frame. Lines are tested
/// exactly against the axis-parallel rectangle (Liang-Barsky clipping,
/// touching counts as intersecting). Arcs are tested by their tight
/// bounding box (`PathPrimitive::bounds`) instead of the true curve: this
/// is a deliberate, conservative over-approximation — an arc whose bounding
/// box grazes the rectangle but whose curve stays clear is still reported
/// as intersecting (and its edge dropped), in keeping with "when in doubt,
/// drop the edge" for zone safety.
pub fn edge_intersects_zone(
    edge: &PoseEdge,
    zone: &ConnectionZone,
    transform: &PlateTransform,
) -> bool {
    edge.primitives.iter().any(|primitive| {
        let local = transform.primitive_to_local(primitive);
        primitive_intersects_rect(&local, &zone.rect_local)
    })
}

/// Removes every nopp from `instance` whose plate-local center lies inside
/// `zone`'s rectangle, or close enough that its effective (pipe-clearance)
/// radius overlaps the rectangle. Overlap, not strict containment, is the
/// removal rule: a nopp that merely grazes the zone boundary still leaves
/// no room for the free-form routing certified elsewhere in the zone, so it
/// is removed too (the conservative choice).
pub fn filter_zone_nopps(instance: &mut PlateInstance, zone: &ConnectionZone) {
    let transform = instance.transform;
    instance.nopps.retain(|nopp| {
        let local_center = transform.to_local(nopp.center);
        !circle_overlaps_rect(local_center, nopp.effective_radius_mm, &zone.rect_local)
    });
}

/// Whether `point`, already expressed in the plate-local frame, lies inside
/// or on the boundary of `zone`'s rectangle.
pub fn zone_contains_local(zone: &ConnectionZone, point: Point) -> bool {
    rect_contains_point(&zone.rect_local, point)
}

fn primitive_intersects_rect(primitive: &PathPrimitive, rect: &RectMm) -> bool {
    match primitive {
        PathPrimitive::Line { start, end } => line_intersects_rect(*start, *end, rect),
        PathPrimitive::Arc { .. } => aabb_overlaps_rect(&primitive.bounds(), rect),
    }
}

/// Liang-Barsky segment-vs-rectangle clipping: returns whether the closed
/// segment `start..end` has any point in common with the closed rectangle
/// `rect` (touching the boundary counts).
fn line_intersects_rect(start: Point, end: Point, rect: &RectMm) -> bool {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let clip_checks = [
        (-dx, start.x - rect.min.x),
        (dx, rect.max.x - start.x),
        (-dy, start.y - rect.min.y),
        (dy, rect.max.y - start.y),
    ];
    let mut t_enter = 0.0_f64;
    let mut t_exit = 1.0_f64;
    for (coefficient, bound) in clip_checks {
        if coefficient == 0.0 {
            if bound < 0.0 {
                return false;
            }
            continue;
        }
        let t = bound / coefficient;
        if coefficient < 0.0 {
            if t > t_exit {
                return false;
            }
            t_enter = t_enter.max(t);
        } else {
            if t < t_enter {
                return false;
            }
            t_exit = t_exit.min(t);
        }
    }
    t_enter <= t_exit
}

fn aabb_overlaps_rect(aabb: &Aabb, rect: &RectMm) -> bool {
    aabb.min.x <= rect.max.x
        && aabb.max.x >= rect.min.x
        && aabb.min.y <= rect.max.y
        && aabb.max.y >= rect.min.y
}

fn circle_overlaps_rect(center: Point, radius_mm: f64, rect: &RectMm) -> bool {
    let closest_x = center.x.clamp(rect.min.x, rect.max.x);
    let closest_y = center.y.clamp(rect.min.y, rect.max.y);
    let dx = center.x - closest_x;
    let dy = center.y - closest_y;
    dx * dx + dy * dy <= radius_mm * radius_mm
}

fn rect_contains_point(rect: &RectMm, point: Point) -> bool {
    point.x >= rect.min.x && point.x <= rect.max.x && point.y >= rect.min.y && point.y <= rect.max.y
}

fn expand_rect(rect: &RectMm, margin_mm: f64) -> RectMm {
    RectMm {
        min: Point::new(rect.min.x - margin_mm, rect.min.y - margin_mm),
        max: Point::new(rect.max.x + margin_mm, rect.max.y + margin_mm),
    }
}

fn rect_corners(rect: &RectMm) -> [Point; 4] {
    [
        Point::new(rect.min.x, rect.min.y),
        Point::new(rect.max.x, rect.min.y),
        Point::new(rect.max.x, rect.max.y),
        Point::new(rect.min.x, rect.max.y),
    ]
}

fn invalid_connection(message: &str) -> LoopError {
    LoopError {
        code: LoopErrorCode::InvalidConnection,
        message: message.to_owned(),
        journal_tail: Vec::new(),
    }
}
