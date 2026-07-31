use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, LoopErrorCode, build_connection_zone, build_graph_view,
    edge_intersects_zone, filter_zone_nopps,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, LocalPose, Nopp, PlateGraphLimits, PlateInstance, PlateProfile,
    PlateTransform, PoseEdge, PoseNode, TemplateId, TemplateTransform, build_embedded_graph,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

// `Point::distance_to` is `pub(crate)` inside the solver crate, so this
// integration test (a separate crate) cannot call it; reimplement the
// trivial Euclidean distance instead.
fn distance(a: Point, b: Point) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

fn rect_polygon() -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(900.0, 750.0),
        point(0.0, 750.0),
    ])
    .unwrap()
}

fn transform() -> PlateTransform {
    // Edge 0 starts at the world origin and runs along +x with zero phase,
    // so this transform happens to be the identity map (world == local).
    // Fixture helpers below still convert explicitly with `to_local`
    // instead of leaning on that coincidence.
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(450.0, 375.0),
        0.0,
        0.0,
    )
    .unwrap()
}

fn connection() -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 450.0,
        zone_width_mm: 300.0,
        zone_depth_mm: 200.0,
    }
}

// Same room as `rect_polygon()`, but with a rectangular notch bitten out of
// the top edge: x in [400,500] is removed from y=100 up to the roof. Edge 0
// (the connection edge, (0,0)-(900,0)) is untouched, so `transform()` and
// `connection()` still describe the same zone rectangle, (300,0)-(600,200)
// in local coordinates. The notch's vertical walls (x=400 and x=500) sit
// squarely inside the zone's x-range [300,600] and reach down to y=100,
// inside the zone's y-range [0,200] — well clear of all four of the zone
// rectangle's corners ((300,0), (600,0), (600,200), (300,200)), so a
// corner-only containment check cannot see it.
fn l_polygon_with_notch_over_zone() -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(900.0, 750.0),
        point(500.0, 750.0),
        point(500.0, 100.0),
        point(400.0, 100.0),
        point(400.0, 750.0),
        point(0.0, 750.0),
    ])
    .unwrap()
}

fn instance() -> PlateInstance {
    PlateInstance::new(
        rect_polygon(),
        transform(),
        PlateProfile::bekotec_en_23_fi_30_16(),
        20_000,
    )
    .unwrap()
}

fn fixture() -> (EmbeddedPoseGraph, ConnectionZone, PlateTransform) {
    let instance = instance();
    let graph = build_embedded_graph(&instance, 8.0, PlateGraphLimits::default()).unwrap();
    let zone =
        build_connection_zone(&instance.polygon, &instance.transform, &connection()).unwrap();
    (graph, zone, instance.transform)
}

fn instance_fixture() -> (PlateInstance, ConnectionZone) {
    let instance = instance();
    let zone =
        build_connection_zone(&instance.polygon, &instance.transform, &connection()).unwrap();
    (instance, zone)
}

// Independent adapter matching the brief's two-argument call site. It
// converts the nopp's world center to local coordinates itself (via the
// same `transform()` fixture used to build `instance_fixture()`) rather
// than assuming world and local coincide, so it stays correct even if the
// fixture geometry changes.
fn zone_contains_local(zone: &ConnectionZone, nopp: &Nopp) -> bool {
    single_loop_solver::circuit::zone_contains_local(zone, transform().to_local(nopp.center))
}

#[test]
fn zone_is_centered_on_port_center_and_contains_both_ports() {
    let zone = build_connection_zone(&rect_polygon(), &transform(), &connection()).unwrap();
    assert!((distance(zone.start_port, zone.end_port) - 50.0).abs() < 1e-9);
    // ports lie on the connection edge (y = 0 for edge 0 of the rectangle)
    assert!(zone.start_port.y.abs() < 1e-9);
}

#[test]
fn connection_edge_index_out_of_range_is_invalid_connection() {
    // The brief's Step 3 lists this as one of three InvalidConnection
    // triggers, but none of the brief's four tests exercise it directly
    // (the polygon-escape test below actually trips the port-margin check
    // first) — added to close that coverage gap.
    let mut connection = connection();
    connection.edge_index = 4; // rect_polygon() has 4 edges: 0..=3
    assert_eq!(
        build_connection_zone(&rect_polygon(), &transform(), &connection)
            .unwrap_err()
            .code,
        LoopErrorCode::InvalidConnection
    );
}

#[test]
fn zone_outside_polygon_is_invalid_connection() {
    let mut connection = connection();
    connection.center_offset_mm = 10.0; // zone would leave the polygon
    assert_eq!(
        build_connection_zone(&rect_polygon(), &transform(), &connection)
            .unwrap_err()
            .code,
        LoopErrorCode::InvalidConnection
    );
}

#[test]
fn zone_corner_outside_polygon_via_depth_is_invalid_connection() {
    // The test above (`zone_outside_polygon_is_invalid_connection`) actually
    // trips the port-endpoint-margin check first: center_offset_mm = 10.0
    // puts the first port at edge offset -15.0, already invalid before any
    // corner is examined. That leaves the "any zone corner outside the
    // polygon" branch itself unexercised. Here `center_offset_mm` stays at
    // the valid default (450.0, well clear of both edge endpoints) and only
    // `zone_depth_mm` grows past the room's 750 mm depth, so the corner
    // check is what actually fires. Verified with an ad-hoc run before
    // adding this test: 800.0 mm depth on this fixture returns
    // `InvalidConnection`, 200.0 mm (the default) returns `Ok`.
    let mut connection = connection();
    connection.zone_depth_mm = 800.0; // deeper than the 750 mm room
    assert_eq!(
        build_connection_zone(&rect_polygon(), &transform(), &connection)
            .unwrap_err()
            .code,
        LoopErrorCode::InvalidConnection
    );
}

#[test]
fn zone_narrower_than_the_port_span_is_invalid_connection() {
    // Design spec §4 requires the zone to contain both ports. Ports sit at
    // center_offset_mm +/- 25.0 (a fixed 50 mm span); zone_width_mm = 40.0
    // gives a zone only +/-20.0 wide around the same center, so both ports
    // fall just outside it. validate_input only rejects zone_width_mm <= 0,
    // so this is a real, reachable input, not a contrived one.
    let mut connection = connection();
    connection.zone_width_mm = 40.0;
    let error = build_connection_zone(&rect_polygon(), &transform(), &connection).unwrap_err();
    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
    // Every InvalidConnection cause shares the same code; pin the message
    // too so this test can only pass because the ports-in-zone check fired,
    // not some other InvalidConnection branch.
    assert!(
        error.message.contains("does not contain both ports"),
        "expected the ports-in-zone check to fire, got: {}",
        error.message
    );
}

#[test]
fn zone_cut_by_a_concave_notch_without_touching_a_corner_is_invalid_connection() {
    let error = build_connection_zone(
        &l_polygon_with_notch_over_zone(),
        &transform(),
        &connection(),
    )
    .unwrap_err();
    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
    // Same reasoning as above: pin the message so this test proves the new
    // polygon-boundary-vs-rectangle check fired, not the (already covered
    // by an earlier test) corner-only check landing on this fixture for an
    // unaccounted-for reason.
    assert!(
        error.message.contains("cut by a polygon edge"),
        "expected the polygon-boundary-vs-rectangle check to fire, got: {}",
        error.message
    );
}

#[test]
fn graph_view_drops_zone_crossing_edges_and_keeps_far_edges() {
    let (graph, zone, transform) = fixture();
    let view = build_graph_view(&graph, &zone, &transform);
    assert!(!view.usable_edges.is_empty());
    for edge in &graph.edges {
        let crosses = edge_intersects_zone(edge, &zone, &transform);
        assert_eq!(view.usable_edges.contains(&edge.id), !crosses);
    }
    assert!(!view.entry_candidates.is_empty());
}

// A `PoseNode` with world == local, matching `transform()`'s identity map,
// so the coordinates below can be reasoned about once instead of twice.
fn node(id: u32, x: f64, y: f64) -> PoseNode {
    PoseNode {
        id,
        local_pose: LocalPose::new(point(x, y), Heading8::Deg0),
        world_point: point(x, y),
    }
}

// A minimal, fully hand-controlled graph — two straight edges placed by
// coordinates chosen for this test, not mined from `build_embedded_graph`'s
// real (template/period/rotation-enumerated) output. `template_id` and
// `template_transform` are placeholders: `build_graph_view` never reads
// them, only `.id` and `.primitives`.
fn hand_built_graph_and_zone() -> (EmbeddedPoseGraph, ConnectionZone, PlateTransform) {
    let transform = transform();
    let zone = build_connection_zone(&rect_polygon(), &transform, &connection()).unwrap();
    // zone.rect_local is (300,0)-(600,200) for the `connection()` fixture.

    let placeholder_transform = TemplateTransform::new(0, false, 0, 0).unwrap();

    // Line from (250,50) to (650,50): constant y=50, inside the zone's
    // y-range [0,200]; x-range [250,650] straddles the zone's x-range
    // [300,600] on both sides. It must cross the zone rectangle.
    let crossing_edge = PoseEdge {
        id: 0,
        start: node(0, 250.0, 50.0),
        end: node(1, 650.0, 50.0),
        template_id: TemplateId::Straight0,
        template_transform: placeholder_transform,
        primitives: vec![PathPrimitive::Line {
            start: point(250.0, 50.0),
            end: point(650.0, 50.0),
        }],
        certificate: None,
    };

    // Line from (0,500) to (100,500): x-range [0,100] does not overlap the
    // zone's x-range [300,600] at all, and y=500 is well past the zone's
    // y-range [0,200] (and past the 150 mm entry ring, which stops at
    // y = 200 + 150 = 350). It must not touch the zone rectangle.
    let far_edge = PoseEdge {
        id: 1,
        start: node(2, 0.0, 500.0),
        end: node(3, 100.0, 500.0),
        template_id: TemplateId::Straight0,
        template_transform: placeholder_transform,
        primitives: vec![PathPrimitive::Line {
            start: point(0.0, 500.0),
            end: point(100.0, 500.0),
        }],
        certificate: None,
    };

    let graph = EmbeddedPoseGraph {
        nodes: vec![
            node(0, 250.0, 50.0),
            node(1, 650.0, 50.0),
            node(2, 0.0, 500.0),
            node(3, 100.0, 500.0),
        ],
        edges: vec![crossing_edge, far_edge],
        rejected_edges: Vec::new(),
        candidate_count: 2,
    };

    (graph, zone, transform)
}

#[test]
fn graph_view_matches_hand_checked_edges_independent_of_the_predicate() {
    // Unlike `graph_view_drops_zone_crossing_edges_and_keeps_far_edges`
    // above (which re-derives its expectation by calling
    // `edge_intersects_zone`, the same function `build_graph_view` uses
    // internally — a consistency check, not an independent one), this test
    // never calls `edge_intersects_zone`. The expected membership for both
    // edges is justified in the comments on `hand_built_graph_and_zone`
    // by plain interval arithmetic on coordinates chosen for this test.
    let (graph, zone, transform) = hand_built_graph_and_zone();
    let view = build_graph_view(&graph, &zone, &transform);

    assert!(
        !view.usable_edges.contains(&0),
        "crossing edge must be dropped"
    );
    assert!(view.usable_edges.contains(&1), "far edge must stay usable");

    // Bonus, same fixture: node 0 (250,50) and node 1 (650,50) sit inside
    // the zone rectangle expanded by 150 mm ((150,-150)-(750,350)) but
    // outside the zone itself, so both are entry candidates; node 2 and
    // node 3 at y=500 fall outside even the expanded ring (which stops at
    // y=350), so neither is.
    assert_eq!(view.entry_candidates, vec![0, 1]);
}

#[test]
fn zone_nopps_are_removed_from_the_instance() {
    let (mut instance, zone) = instance_fixture();
    let before = instance.nopps.len();
    filter_zone_nopps(&mut instance, &zone);
    assert!(instance.nopps.len() < before);
    assert!(
        instance
            .nopps
            .iter()
            .all(|nopp| !zone_contains_local(&zone, nopp))
    );
}
