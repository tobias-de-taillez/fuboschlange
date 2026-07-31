use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, LoopErrorCode, build_connection_zone, build_graph_view,
    edge_intersects_zone, filter_zone_nopps,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Nopp, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    build_embedded_graph,
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
