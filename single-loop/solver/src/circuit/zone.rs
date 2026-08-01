use crate::circuit::types::{ConnectionInput, LoopError, LoopErrorCode, RectMm};
use crate::geometry::{
    Aabb, Intersection, PointClassification, Polygon, Vec2, primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use crate::plate::{
    EmbeddedPoseGraph, PlateInstance, PlateTransform, PoseEdge, PoseNode,
    primitive_circle_clearance,
};

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
/// Returns `InvalidConnection` when: the edge index is out of range; either
/// port would land closer than 33 mm to an edge endpoint; the zone
/// rectangle does not contain both ports (possible when `zone_width_mm` is
/// narrower than the fixed 50 mm port span); any corner of the zone
/// rectangle falls outside the polygon; or any polygon boundary segment
/// other than the connection edge itself cuts through the zone rectangle
/// (the concave-room case a corner-only check cannot see — see
/// `other_polygon_edges_intersect_rect`).
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

    // Design spec §4: "Die Zone muss beide Ports enthalten ... sonst
    // INVALID_CONNECTION." Both ports sit exactly on the connection edge,
    // i.e. at local v = rect_local.min.y (the zone's near edge) by
    // construction — the only way this can fail is a zone narrower than
    // the fixed 50 mm port span (zone_width_mm < 50), which
    // `validate_input` does not forbid (only `> 0`).
    let start_port_local = transform.to_local(start_port);
    let end_port_local = transform.to_local(end_port);
    if !rect_contains_point(&rect_local, start_port_local)
        || !rect_contains_point(&rect_local, end_port_local)
    {
        return Err(invalid_connection(
            "connection zone does not contain both ports",
        ));
    }

    let corner_outside_polygon = rect_corners(&rect_local).into_iter().any(|corner| {
        polygon.classify_point(transform.to_world(corner)) == PointClassification::Outside
    });
    if corner_outside_polygon {
        return Err(invalid_connection("connection zone leaves the polygon"));
    }

    // Four corners inside the polygon does not imply the whole rectangle
    // is inside for a concave polygon: a notch can cut through the middle
    // of a rectangle edge without ever crossing a corner. Test every other
    // polygon boundary segment against the rectangle directly. The
    // connection edge itself is excluded, not as a style choice but
    // because it is *always* collinear with part of `rect_local`'s own
    // v = min.y boundary line (that is how the rectangle was built), so
    // leaving it in would make every zone reject itself.
    if other_polygon_edges_intersect_rect(polygon, transform, edge_index, &rect_local) {
        return Err(invalid_connection(
            "connection zone is cut by a polygon edge",
        ));
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

/// Whether any polygon boundary segment other than `connection_edge_index`
/// touches or crosses `rect` once expressed in `transform`'s local frame.
/// Conservative like the rest of this module: touching counts (via
/// `line_intersects_rect`).
fn other_polygon_edges_intersect_rect(
    polygon: &Polygon,
    transform: &PlateTransform,
    connection_edge_index: usize,
    rect: &RectMm,
) -> bool {
    (0..polygon.original_edge_count())
        .filter(|&index| index != connection_edge_index)
        .any(|index| {
            let (start, end) = polygon.original_edge(index);
            line_intersects_rect(transform.to_local(start), transform.to_local(end), rect)
        })
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

/// Tolerance below which two unit directions count as parallel, and below
/// which a straight leg of a connector is dropped as degenerate.
const ATTACHMENT_EPS: f64 = 1e-9;

/// The free-form connector between a port and one certified graph anchor.
///
/// Its primitives are world-space and tangent-continuous: they start at the
/// port with the wall-orthogonal inward tangent and end at the anchor with
/// the anchor's own heading, so the loop can be assembled by concatenation.
#[derive(Clone, Debug, PartialEq)]
pub struct Attachment {
    pub primitives: Vec<PathPrimitive>,
}

/// Builds the connector from a port pose to a certified graph anchor.
///
/// The construction is a fixed-radius corner: a straight along the port's
/// inward normal, one tangent arc of the profile's minimum bend radius, and a
/// straight arriving along the anchor's heading. Either straight collapses
/// when the corner consumes its whole leg. No other shape is produced —
/// parallel poses would need an S-shaped biarc, which this milestone does not
/// construct and rejects as `INVALID_CONNECTION`.
///
/// Containment: the anchors the loop can attach to lie in the ring *outside*
/// the connection zone (`LoopGraphView::entry_candidates`), so a connector
/// necessarily leaves the nopp-free rectangle. The conservative reading of
/// the zone rule that this function implements is therefore the physical one:
/// the connector must stay inside the room polygon, and must clear every nopp
/// that survived `filter_zone_nopps` by the profile's laying tolerance —
/// inside the zone there are none left, outside the zone the same rule the
/// certified graph edges obey applies. Wall clearance deliberately does not
/// apply: a port sits on the wall by construction.
///
/// `instance` supplies the polygon, the plate frame, the surviving noppen and
/// the profile in one consistent piece; callers must pass the instance whose
/// zone noppen were already removed.
pub fn attach_port(
    port: Point,
    inward: Vec2,
    anchor: &PoseNode,
    instance: &PlateInstance,
) -> Result<Attachment, LoopError> {
    let start_direction = inward
        .normalized()
        .ok_or_else(|| invalid_connection("attachment: the port tangent is degenerate"))?;
    let end_direction = instance
        .transform
        .vector_to_world(anchor.local_pose.heading.direction())
        .normalized()
        .ok_or_else(|| invalid_connection("attachment: the anchor heading is degenerate"))?;

    let primitives = fixed_radius_corner(
        port,
        start_direction,
        anchor.world_point,
        end_direction,
        instance.profile.min_bend_radius_mm,
    )?;
    certify_attachment(&primitives, port, instance)?;
    Ok(Attachment { primitives })
}

/// Joins two poses with `straight — arc(radius_mm) — straight`.
fn fixed_radius_corner(
    start: Point,
    start_direction: Vec2,
    end: Point,
    end_direction: Vec2,
    radius_mm: f64,
) -> Result<Vec<PathPrimitive>, LoopError> {
    let cross = start_direction.x * end_direction.y - start_direction.y * end_direction.x;
    let dot = start_direction.dot(end_direction);
    if cross.abs() <= ATTACHMENT_EPS {
        let offset = end - start;
        let along = offset.dot(start_direction);
        let lateral = (offset - start_direction * along).norm();
        if dot > 0.0 && along > 0.0 && lateral <= ATTACHMENT_EPS {
            return Ok(vec![PathPrimitive::Line { start, end }]);
        }
        return Err(invalid_connection(
            "attachment: port and anchor tangents are parallel, which needs a biarc",
        ));
    }

    // Vertex where the two tangent lines meet: start + run_in * start_direction
    // = end - run_out * end_direction.
    let offset = end - start;
    let run_in_mm = (offset.x * end_direction.y - offset.y * end_direction.x) / cross;
    let run_out_mm = (start_direction.x * offset.y - start_direction.y * offset.x) / cross;
    if run_in_mm <= 0.0 || run_out_mm <= 0.0 {
        return Err(invalid_connection(
            "attachment: the anchor lies behind the port tangent or faces away from it",
        ));
    }

    // A corner of `radius_mm` consumes this much of each leg.
    let turn_rad = cross.atan2(dot);
    let leg_mm = radius_mm * (turn_rad.abs() / 2.0).tan();
    if leg_mm > run_in_mm + ATTACHMENT_EPS || leg_mm > run_out_mm + ATTACHMENT_EPS {
        return Err(invalid_connection(
            "attachment: the minimum-radius corner does not fit between port and anchor",
        ));
    }

    let vertex = start + start_direction * run_in_mm;
    let arc_start = vertex - start_direction * leg_mm;
    let arc_end = vertex + end_direction * leg_mm;
    let normal = if cross > 0.0 {
        start_direction.perp_ccw()
    } else {
        -start_direction.perp_ccw()
    };
    let center = arc_start + normal * radius_mm;

    let mut primitives = Vec::with_capacity(3);
    if (arc_start - start).norm() > ATTACHMENT_EPS {
        primitives.push(PathPrimitive::Line {
            start,
            end: arc_start,
        });
    }
    primitives.push(PathPrimitive::Arc {
        start: arc_start,
        end: arc_end,
        center,
        radius_mm,
        sweep_rad: turn_rad,
    });
    if (end - arc_end).norm() > ATTACHMENT_EPS {
        primitives.push(PathPrimitive::Line {
            start: arc_end,
            end,
        });
    }
    Ok(primitives)
}

/// Rejects a constructed connector that leaves the room or touches a nopp.
fn certify_attachment(
    primitives: &[PathPrimitive],
    port: Point,
    instance: &PlateInstance,
) -> Result<(), LoopError> {
    let tolerance_mm = instance.profile.laying_tolerance_mm;
    // Leaving the room is the more fundamental failure, so it is reported
    // even when a nopp collision happens to occur earlier along the path.
    for primitive in primitives {
        if let PathPrimitive::Arc { radius_mm, .. } = primitive
            && *radius_mm < instance.profile.min_bend_radius_mm
        {
            return Err(invalid_connection(
                "attachment: the constructed arc is below the minimum bend radius",
            ));
        }
        if primitive_leaves_polygon(primitive, port, &instance.polygon) {
            return Err(invalid_connection(
                "attachment: the connector leaves the room polygon",
            ));
        }
    }
    for primitive in primitives {
        for nopp in &instance.nopps {
            if primitive_circle_clearance(primitive, nopp.center, nopp.forbidden_radius_mm)
                < -tolerance_mm
            {
                return Err(invalid_connection(
                    "attachment: the connector collides with a nopp",
                ));
            }
        }
    }
    Ok(())
}

/// True when the primitive crosses the polygon boundary anywhere but at the
/// port, or lies outside it entirely.
///
/// The port sits exactly on the connection edge, so the connector's first
/// primitive necessarily touches the boundary there; every other contact is a
/// real escape.
fn primitive_leaves_polygon(primitive: &PathPrimitive, port: Point, polygon: &Polygon) -> bool {
    if polygon.classify_point(primitive.point_at(0.5)) == PointClassification::Outside {
        return true;
    }
    for edge_index in 0..polygon.original_edge_count() {
        let (edge_start, edge_end) = polygon.original_edge(edge_index);
        let edge = PathPrimitive::Line {
            start: edge_start,
            end: edge_end,
        };
        match primitive_intersections(primitive, &edge) {
            Intersection::None => {}
            Intersection::Points(points) => {
                if points
                    .iter()
                    .any(|hit| (hit.point - port).norm() > ATTACHMENT_EPS)
                {
                    return true;
                }
            }
            _ => return true,
        }
    }
    false
}
