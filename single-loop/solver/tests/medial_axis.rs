use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{
    PointClassification, QuantizedPoint, Vec2, erode_for_centerline,
};
use single_loop_solver::input::validate_and_normalize;
use single_loop_solver::medial_axis::{
    AdapterEdgeFixture, EdgeId, GraphPosition, MedialAxisError, MedialAxisErrorReason, MedialEdge,
    MedialGraph, MedialNode, NodeId, adapt_parabolic_voronoi_fixture, adapt_voronoi_fixture,
    boundary_scan_work_fixture, build_medial_graph, build_medial_graph_with_diagnostics,
    first_guide_hit_fixture, flatten_parabolic_fixture, guide_hit_angle_is_accepted_fixture,
    guide_interval_count_fixture, inside_work_budget_fixture,
    reflex_faces_allow_replacement_fixture, reflex_replacement_decision_fixture,
    reflex_work_budget_fixture,
};
use single_loop_solver::model::{ConnectionInput, Point, SolveSingleLoopInput};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn allowed_polygon(
    points: &[(f64, f64)],
    wall_clearance_mm: f64,
) -> single_loop_solver::geometry::AllowedRegion {
    let polygon = points.iter().map(|&(x, y)| point(x, y)).collect::<Vec<_>>();
    let first_edge_length = (polygon[1].x - polygon[0].x).hypot(polygon[1].y - polygon[0].y);
    let normalized = validate_and_normalize(SolveSingleLoopInput {
        polygon,
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: first_edge_length * 0.5,
        },
        requested_spacing_mm: 150.0,
        wall_clearance_mm,
    })
    .unwrap();
    erode_for_centerline(&normalized).unwrap()
}

fn allowed_rectangle_at(
    origin_x: f64,
    origin_y: f64,
    width: f64,
    height: f64,
    wall: f64,
) -> single_loop_solver::geometry::AllowedRegion {
    allowed_polygon(
        &[
            (origin_x, origin_y),
            (origin_x + width, origin_y),
            (origin_x + width, origin_y + height),
            (origin_x, origin_y + height),
        ],
        wall,
    )
}

fn allowed_rectangle(
    width: f64,
    height: f64,
    wall: f64,
) -> single_loop_solver::geometry::AllowedRegion {
    allowed_rectangle_at(0.0, 0.0, width, height, wall)
}

fn allowed_l_shape() -> single_loop_solver::geometry::AllowedRegion {
    allowed_l_shape_at(0.0, 0.0)
}

fn allowed_l_shape_at(origin_x: f64, origin_y: f64) -> single_loop_solver::geometry::AllowedRegion {
    allowed_polygon(
        &[
            (origin_x, origin_y),
            (origin_x + 1_400.0, origin_y),
            (origin_x + 1_400.0, origin_y + 1_000.0),
            (origin_x + 800.0, origin_y + 1_000.0),
            (origin_x + 800.0, origin_y + 500.0),
            (origin_x, origin_y + 500.0),
        ],
        20.0,
    )
}

fn edge(id: u32, a: u32, b: u32, polyline: Vec<Point>) -> MedialEdge {
    MedialEdge::new(EdgeId(id), NodeId(a), NodeId(b), polyline)
}

fn node(id: u32, x: f64, y: f64) -> MedialNode {
    MedialNode {
        id: NodeId(id),
        point: point(x, y),
        clearance_mm: 0.0,
    }
}

fn assert_finite_graph(graph: &MedialGraph) {
    for node in &graph.nodes {
        assert!(node.point.x.is_finite());
        assert!(node.point.y.is_finite());
        assert!(node.clearance_mm.is_finite());
    }
    for edge in &graph.edges {
        assert!(edge.length_mm.is_finite() && edge.length_mm > 0.0);
        assert!(
            edge.polyline
                .iter()
                .all(|p| p.x.is_finite() && p.y.is_finite())
        );
    }
}

#[derive(Debug, PartialEq, Eq)]
struct GraphSignature {
    nodes: Vec<(NodeId, i64, i64)>,
    edges: Vec<(EdgeId, NodeId, NodeId, Vec<(i64, i64)>)>,
    ccw_edges: Vec<Vec<EdgeId>>,
    leaves: Vec<NodeId>,
}

fn local_quantized_coordinate(value: f64) -> i64 {
    (value / 0.001).round() as i64
}

fn graph_topology_signature(
    graph: &MedialGraph,
) -> (
    Vec<NodeId>,
    Vec<(EdgeId, NodeId, NodeId)>,
    Vec<Vec<EdgeId>>,
    Vec<NodeId>,
) {
    (
        graph.nodes.iter().map(|node| node.id).collect(),
        graph
            .edges
            .iter()
            .map(|edge| (edge.id, edge.a, edge.b))
            .collect(),
        graph.ccw_edges.clone(),
        graph.leaves.clone(),
    )
}

fn graph_signature(graph: &MedialGraph, origin: Point) -> GraphSignature {
    let local_key = |value: Point| {
        (
            local_quantized_coordinate(value.x - origin.x),
            local_quantized_coordinate(value.y - origin.y),
        )
    };
    GraphSignature {
        nodes: graph
            .nodes
            .iter()
            .map(|node| {
                let (x, y) = local_key(node.point);
                (node.id, x, y)
            })
            .collect(),
        edges: graph
            .edges
            .iter()
            .map(|edge| {
                (
                    edge.id,
                    edge.a,
                    edge.b,
                    edge.polyline.iter().copied().map(local_key).collect(),
                )
            })
            .collect(),
        ccw_edges: graph.ccw_edges.clone(),
        leaves: graph.leaves.clone(),
    }
}

#[test]
fn rectangle_medial_graph_is_inside_connected_acyclic_and_centered() {
    let allowed = allowed_rectangle(6_000.0, 4_000.0, 75.0);
    let graph = build_medial_graph(&allowed, 150.0).unwrap();

    assert!(graph.is_connected());
    assert!(graph.is_acyclic());
    assert_eq!(graph.edge_count(), graph.node_count() - 1);
    assert!(graph.all_samples_inside(&allowed));
    graph.validate(&allowed).unwrap();
    assert_finite_graph(&graph);

    let center = graph.center().unwrap();
    assert_abs_diff_eq!(center.point.x, 3_000.0, epsilon = 1e-6);
    assert_abs_diff_eq!(center.point.y, 2_000.0, epsilon = 1e-6);
}

#[test]
fn l_shape_produces_a_finite_valid_planar_tree() {
    let allowed = allowed_l_shape();
    let built = build_medial_graph_with_diagnostics(&allowed, 150.0).unwrap();
    let graph = &built.graph;

    assert!(graph.node_count() >= 4);
    assert!(graph.is_connected());
    assert!(graph.is_acyclic());
    assert!(graph.all_samples_inside(&allowed));
    assert!(graph.has_no_crossings());
    assert!(graph.embedding_is_ccw());
    graph.validate(&allowed).unwrap();
    assert_finite_graph(graph);
}

#[test]
fn ids_embedding_events_and_geometry_are_deterministic() {
    let allowed = allowed_l_shape();
    let first = build_medial_graph_with_diagnostics(&allowed, 137.0).unwrap();
    let second = build_medial_graph_with_diagnostics(&allowed, 137.0).unwrap();

    assert_eq!(first.graph.nodes, second.graph.nodes);
    assert_eq!(first.graph.edges, second.graph.edges);
    assert_eq!(first.graph.ccw_edges, second.graph.ccw_edges);
    assert_eq!(first.graph.leaves, second.graph.leaves);
    assert_eq!(
        first.graph.stable_event_ids(),
        second.graph.stable_event_ids()
    );
    assert_eq!(first.diagnostics, second.diagnostics);

    for (index, node) in first.graph.nodes.iter().enumerate() {
        assert_eq!(node.id.index(), index);
    }
    for (index, edge) in first.graph.edges.iter().enumerate() {
        assert_eq!(edge.id.index(), index);
    }
}

#[test]
fn translated_regions_preserve_ids_topology_and_embedding() {
    let base = allowed_l_shape();
    let translated = allowed_l_shape_at(1_000_000_000.0004, -2_000_000_000.0004);
    let base_graph = build_medial_graph(&base, 137.0).unwrap();
    let translated_graph = build_medial_graph(&translated, 137.0).unwrap();

    assert_eq!(
        graph_signature(&base_graph, base.quantization_origin),
        graph_signature(&translated_graph, translated.quantization_origin)
    );
}

#[test]
fn huge_translation_preserves_enriched_production_graph_signature() {
    let huge = 100_000_000_000.0;
    let base = allowed_l_shape();
    let translated = allowed_l_shape_at(huge, -huge);
    let base_built = build_medial_graph_with_diagnostics(&base, 137.0).unwrap();
    let translated_built = build_medial_graph_with_diagnostics(&translated, 137.0).unwrap();

    assert!(base_built.diagnostics.guide_branches_added > 0);
    assert_eq!(
        graph_topology_signature(&base_built.graph),
        graph_topology_signature(&translated_built.graph)
    );
    for (base_edge, translated_edge) in base_built
        .graph
        .edges
        .iter()
        .zip(&translated_built.graph.edges)
    {
        assert_abs_diff_eq!(
            base_edge.length_mm,
            translated_edge.length_mm,
            epsilon = 1e-10
        );
        let graph_midpoint = translated_built
            .graph
            .point_at(GraphPosition::Edge {
                edge: translated_edge.id,
                distance_mm: translated_edge.length_mm * 0.5,
            })
            .unwrap();
        assert_eq!(
            translated_edge.point_at_fraction(0.5).unwrap(),
            graph_midpoint,
            "direct edge interpolation must use the same local arclength provenance"
        );
    }
    let base_center = base_built.graph.center().unwrap();
    let translated_center = translated_built.graph.center().unwrap();
    assert_abs_diff_eq!(
        base_center.radius_mm,
        translated_center.radius_mm,
        epsilon = 1e-10
    );
    assert_abs_diff_eq!(
        base_center.point.x - base.quantization_origin.x,
        translated_center.point.x - translated.quantization_origin.x,
        epsilon = 0.001
    );
    assert_abs_diff_eq!(
        base_center.point.y - base.quantization_origin.y,
        translated_center.point.y - translated.quantization_origin.y,
        epsilon = 0.001
    );
    for (base_node, translated_node) in base_built
        .graph
        .nodes
        .iter()
        .zip(&translated_built.graph.nodes)
    {
        assert_abs_diff_eq!(
            base_node.point.x - base.quantization_origin.x,
            translated_node.point.x - translated.quantization_origin.x,
            epsilon = 0.001
        );
        assert_abs_diff_eq!(
            base_node.point.y - base.quantization_origin.y,
            translated_node.point.y - translated.quantization_origin.y,
            epsilon = 0.001
        );
    }
}

#[test]
fn every_public_point_restores_the_local_quantization_origin() {
    let origin_x = 1_000_000_000.0;
    let origin_y = -2_000_000_000.0;
    let allowed = allowed_rectangle_at(origin_x, origin_y, 2_000.0, 1_200.0, 50.0);
    let graph = build_medial_graph(&allowed, 175.0).unwrap();

    for node in &graph.nodes {
        assert!(node.point.x > origin_x && node.point.x < origin_x + 2_000.0);
        assert!(node.point.y > origin_y && node.point.y < origin_y + 1_200.0);
    }
    for edge in &graph.edges {
        assert!(edge.polyline.iter().all(|p| {
            p.x >= origin_x
                && p.x <= origin_x + 2_000.0
                && p.y >= origin_y
                && p.y <= origin_y + 1_200.0
        }));
    }
    let center = graph.center().unwrap();
    assert_abs_diff_eq!(center.point.x, origin_x + 1_000.0, epsilon = 1e-6);
    assert_abs_diff_eq!(center.point.y, origin_y + 600.0, epsilon = 1e-6);
}

#[test]
fn graph_positions_interpolate_by_physical_edge_arclength() {
    let graph = MedialGraph::from_parts(
        vec![node(0, 0.0, 0.0), node(1, 10.0, 10.0)],
        vec![edge(
            0,
            0,
            1,
            vec![point(0.0, 0.0), point(10.0, 0.0), point(10.0, 10.0)],
        )],
    )
    .unwrap();

    assert_eq!(
        graph.point_at(GraphPosition::Node(NodeId(0))).unwrap(),
        point(0.0, 0.0)
    );
    let halfway = graph.position_on_edge(EdgeId(0), 0.5).unwrap();
    assert_eq!(
        halfway,
        GraphPosition::Edge {
            edge: EdgeId(0),
            distance_mm: 10.0
        }
    );
    assert_eq!(graph.point_at(halfway).unwrap(), point(10.0, 0.0));
    assert_eq!(
        graph.edges[0].point_at_distance(15.0).unwrap(),
        point(10.0, 5.0)
    );
    assert_eq!(
        graph.edges[0].point_at_fraction(0.75).unwrap(),
        point(10.0, 5.0)
    );
}

#[test]
fn leaves_are_boundary_mapped_and_cyclically_ordered() {
    let allowed = allowed_rectangle(1_600.0, 1_000.0, 50.0);
    let graph = build_medial_graph(&allowed, 150.0).unwrap();

    assert!(graph.leaves.len() >= 4);
    let offsets = graph.boundary_leaf_offsets(&allowed).unwrap();
    assert!(offsets.windows(2).all(|pair| pair[0] <= pair[1]));
    for leaf in &graph.leaves {
        let node = &graph.nodes[leaf.index()];
        assert!(allowed.exact_boundary_distance(node.point) <= 0.001 + 1e-9);
        assert_ne!(
            allowed.classify_point(node.point),
            PointClassification::Outside
        );
        assert_eq!(graph.degree(*leaf), Some(1));
    }
}

#[test]
fn weighted_tree_center_is_the_diameter_midpoint_inside_an_edge() {
    let graph = MedialGraph::from_parts(
        vec![
            node(0, 0.0, 0.0),
            node(1, 10.0, 0.0),
            node(2, 40.0, 0.0),
            node(3, 10.0, 5.0),
        ],
        vec![
            edge(0, 0, 1, vec![point(0.0, 0.0), point(10.0, 0.0)]),
            edge(1, 1, 2, vec![point(10.0, 0.0), point(40.0, 0.0)]),
            edge(2, 1, 3, vec![point(10.0, 0.0), point(10.0, 5.0)]),
        ],
    )
    .unwrap();

    let center = graph.center().unwrap();
    assert_eq!(center.point, point(20.0, 0.0));
    assert_eq!(
        center.position,
        GraphPosition::Edge {
            edge: EdgeId(1),
            distance_mm: 10.0,
        }
    );
    assert_abs_diff_eq!(center.radius_mm, 20.0, epsilon = 1e-12);
}

fn distance_to_segment(point: Point, start: Point, end: Point) -> f64 {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length_squared = dx * dx + dy * dy;
    let t = if length_squared == 0.0 {
        0.0
    } else {
        (((point.x - start.x) * dx + (point.y - start.y) * dy) / length_squared).clamp(0.0, 1.0)
    };
    (point.x - (start.x + t * dx)).hypot(point.y - (start.y + t * dy))
}

#[test]
fn post_snap_parabolic_public_geometry_never_exceeds_the_point_zero_five_mm_bound() {
    let allowed = allowed_rectangle(120.0, 30.0504, 10.0);
    let focus = QuantizedPoint {
        x: 50_000,
        y: 11_000,
    };
    let directrix = (
        QuantizedPoint { x: 0, y: 9_000 },
        QuantizedPoint {
            x: 100_000,
            y: 9_000,
        },
    );
    let endpoints = [[49_900.0, 10_049.5], [50_100.0, 10_049.5]];
    let built =
        adapt_parabolic_voronoi_fixture(&allowed, focus, directrix, endpoints, [0, 1]).unwrap();

    assert!(built.diagnostics.max_topology_snap_mm > 0.0008);
    let mut measured_max = 0.0_f64;
    for sample in 0..=20_000 {
        let local_x = 49.9 + 0.2 * sample as f64 / 20_000.0;
        let parabola_point = point(
            allowed.quantization_origin.x + local_x,
            allowed.quantization_origin.y + 10.0 + (local_x - 50.0).powi(2) / 4.0,
        );
        let measured = built
            .graph
            .edges
            .iter()
            .flat_map(|edge| edge.polyline.windows(2))
            .map(|pair| distance_to_segment(parabola_point, pair[0], pair[1]))
            .fold(f64::INFINITY, f64::min);
        measured_max = measured_max.max(measured);
    }
    assert!(
        measured_max <= 0.05 + 1e-6,
        "post-snap public geometry error {measured_max} mm"
    );
}

#[test]
fn steep_parabolic_public_geometry_uses_finite_chord_distance_for_certification() {
    let chord_slope: f64 = -0.98;
    let allowed_top_intercept = 149.068_523_312_5;
    let source_top_intercept =
        allowed_top_intercept + 10.0 * (1.0_f64 + chord_slope.powi(2)).sqrt();
    let allowed = allowed_polygon(
        &[
            (-10.0, -10.0),
            (110.0, -10.0),
            (110.0, chord_slope * 110.0 + source_top_intercept),
            (-10.0, chord_slope * -10.0 + source_top_intercept),
        ],
        10.0,
    );
    let endpoints = [
        [49_987.315, 100_080.954_612_5],
        [50_010.725, 100_058.012_812_5],
    ];
    let built = adapt_parabolic_voronoi_fixture(
        &allowed,
        QuantizedPoint {
            x: 50_000,
            y: 100_001,
        },
        (
            QuantizedPoint { x: 0, y: 100_000 },
            QuantizedPoint {
                x: 100_000,
                y: 100_000,
            },
        ),
        endpoints,
        [0, 1],
    )
    .unwrap();

    let mut measured_max = 0.0_f64;
    for sample in 0..=20_000 {
        let local_x = 49.987_315 + (50.010_725 - 49.987_315) * sample as f64 / 20_000.0;
        let relative_x = local_x - 50.0;
        let parabola_point = point(
            allowed.quantization_origin.x + local_x,
            allowed.quantization_origin.y
                + 100.0
                + (relative_x * relative_x + 0.001_f64.powi(2)) / 0.002,
        );
        let measured = built
            .graph
            .edges
            .iter()
            .flat_map(|edge| edge.polyline.windows(2))
            .map(|pair| distance_to_segment(parabola_point, pair[0], pair[1]))
            .fold(f64::INFINITY, f64::min);
        measured_max = measured_max.max(measured);
    }
    assert!(
        measured_max <= 0.05 + 1e-6,
        "finite-chord public geometry error {measured_max} mm"
    );
}

#[test]
fn parabolic_flattening_exposes_and_meets_the_point_zero_five_mm_bound() {
    let origin = point(1_234.5, -6_789.25);
    let observation = flatten_parabolic_fixture(
        origin,
        QuantizedPoint { x: 0, y: 200_000 },
        (
            QuantizedPoint { x: -200_000, y: 0 },
            QuantizedPoint { x: 200_000, y: 0 },
        ),
        [[-100_000.0, 125_000.0], [100_000.0, 125_000.0]],
    )
    .unwrap();

    assert_eq!(observation.quantization_origin, origin);
    assert_eq!(observation.error_bound_mm, 0.05);
    assert!(observation.points_world_mm.len() > 2);
    let mut measured_max = 0.0_f64;
    for sample in 0..=20_000 {
        let x = -100.0 + 200.0 * sample as f64 / 20_000.0;
        let parabola_point = point(origin.x + x, origin.y + 100.0 + x * x / 400.0);
        let distance = observation
            .points_world_mm
            .windows(2)
            .map(|pair| distance_to_segment(parabola_point, pair[0], pair[1]))
            .fold(f64::INFINITY, f64::min);
        measured_max = measured_max.max(distance);
    }
    assert!(
        measured_max <= observation.error_bound_mm + 1e-6,
        "measured flattening error {measured_max} mm"
    );
}

fn topology_fixture(center_offsets: &[(f64, f64)]) -> Vec<AdapterEdgeFixture> {
    let boundary = [
        point(90.0, 0.0),
        point(180.0, 40.0),
        point(90.0, 80.0),
        point(0.0, 40.0),
    ];
    boundary
        .into_iter()
        .zip(center_offsets.iter().copied())
        .enumerate()
        .map(|(index, (leaf, center))| AdapterEdgeFixture {
            polyline_local_mm: vec![leaf, point(center.0, center.1)],
            source_site_ids: [index as u32, (index as u32 + 1) % 4],
        })
        .collect()
}

#[test]
fn topology_snaps_only_at_or_below_the_point_zero_zero_one_mm_budget() {
    let allowed = allowed_rectangle(200.0, 100.0, 10.0);
    let within = topology_fixture(&[(90.0, 40.0), (90.0009, 40.0), (90.0, 40.0), (90.0, 40.0)]);
    let snapped = adapt_voronoi_fixture(&allowed, &within).unwrap();
    assert!(snapped.graph.is_connected());
    assert_eq!(snapped.diagnostics.topology_snaps, 1);
    assert!(snapped.diagnostics.max_topology_snap_mm <= 0.001);

    let outside = topology_fixture(&[(90.0, 40.0), (90.0011, 40.0), (90.0, 40.0), (90.0, 40.0)]);
    let error = adapt_voronoi_fixture(&allowed, &outside).unwrap_err();
    assert_eq!(error.reason(), MedialAxisErrorReason::DisconnectedGraph);
}

#[test]
fn canonical_ids_use_local_quantized_coordinates_then_sources_and_survive_reversal_translation() {
    let mut fixtures = vec![
        AdapterEdgeFixture {
            polyline_local_mm: vec![point(0.0, 20.0), point(99.99955, 39.99955)],
            source_site_ids: [8, 9],
        },
        AdapterEdgeFixture {
            polyline_local_mm: vec![point(99.99955, 39.99955), point(100.00045, 40.00045)],
            source_site_ids: [5, 6],
        },
        AdapterEdgeFixture {
            polyline_local_mm: vec![point(100.00045, 40.00045), point(200.0, 60.0)],
            source_site_ids: [0, 1],
        },
    ];
    let base_allowed = allowed_rectangle(220.0, 100.0, 10.0);
    let base = adapt_voronoi_fixture(&base_allowed, &fixtures).unwrap();
    let high_source_node = base
        .graph
        .nodes
        .iter()
        .find(|node| (node.point.x - (base_allowed.quantization_origin.x + 99.99955)).abs() < 1e-7)
        .unwrap();
    let low_source_node = base
        .graph
        .nodes
        .iter()
        .find(|node| (node.point.x - (base_allowed.quantization_origin.x + 100.00045)).abs() < 1e-7)
        .unwrap();
    assert!(
        low_source_node.id < high_source_node.id,
        "source IDs must precede raw float geometry inside one local quantized key"
    );

    fixtures.reverse();
    let translated_allowed =
        allowed_rectangle_at(1_000_000_000.0004, -2_000_000_000.0004, 220.0, 100.0, 10.0);
    let translated = adapt_voronoi_fixture(&translated_allowed, &fixtures).unwrap();
    assert_eq!(
        graph_signature(&base.graph, base_allowed.quantization_origin),
        graph_signature(&translated.graph, translated_allowed.quantization_origin)
    );
}

#[test]
fn huge_translation_preserves_local_angular_ties_in_final_embedding() {
    let fixtures = vec![
        AdapterEdgeFixture {
            polyline_local_mm: vec![point(100.0, 0.0), point(100.0, 40.0)],
            source_site_ids: [0, 1],
        },
        AdapterEdgeFixture {
            polyline_local_mm: vec![
                point(100.0, 40.0),
                point(99.9999995, 41.0),
                point(80.0, 80.0),
            ],
            source_site_ids: [2, 3],
        },
        AdapterEdgeFixture {
            polyline_local_mm: vec![
                point(100.0, 40.0),
                point(100.0000005, 41.0),
                point(120.0, 80.0),
            ],
            source_site_ids: [4, 5],
        },
    ];
    let base_allowed = allowed_rectangle(220.0, 100.0, 10.0);
    let base = adapt_voronoi_fixture(&base_allowed, &fixtures).unwrap();
    let huge = 10_000_000_000.0;
    let translated_allowed = allowed_rectangle_at(huge, -huge, 220.0, 100.0, 10.0);
    let translated = adapt_voronoi_fixture(&translated_allowed, &fixtures).unwrap();

    assert_eq!(
        graph_signature(&base.graph, base_allowed.quantization_origin),
        graph_signature(&translated.graph, translated_allowed.quantization_origin)
    );
    let base_branch = base
        .graph
        .ccw_edges
        .iter()
        .find(|incident| incident.len() == 3)
        .unwrap();
    let translated_branch = translated
        .graph
        .ccw_edges
        .iter()
        .find(|incident| incident.len() == 3)
        .unwrap();
    assert_eq!(base_branch, translated_branch);
}

#[test]
fn duplicate_zero_length_and_iteration_order_fixtures_are_handled_deterministically() {
    let allowed = allowed_rectangle(200.0, 100.0, 10.0);
    let mut fixtures = topology_fixture(&[(90.0, 40.0); 4]);
    fixtures.push(fixtures[0].clone());
    fixtures.push(AdapterEdgeFixture {
        polyline_local_mm: vec![point(90.0, 40.0), point(90.0, 40.0)],
        source_site_ids: [9, 10],
    });

    let first = adapt_voronoi_fixture(&allowed, &fixtures).unwrap();
    fixtures.reverse();
    let second = adapt_voronoi_fixture(&allowed, &fixtures).unwrap();

    assert_eq!(first.graph.nodes, second.graph.nodes);
    assert_eq!(first.graph.edges, second.graph.edges);
    assert_eq!(first.graph.ccw_edges, second.graph.ccw_edges);
    assert_eq!(first.graph.leaves, second.graph.leaves);
    assert_eq!(first.diagnostics.duplicate_edges_removed, 1);
    assert_eq!(first.diagnostics.zero_length_edges_removed, 1);
}

#[test]
fn adjacent_backtracking_polyline_is_rejected_as_an_edge_crossing() {
    let error = MedialGraph::from_parts(
        vec![node(0, 0.0, 0.0), node(1, 1.0, 0.0)],
        vec![edge(
            0,
            0,
            1,
            vec![point(0.0, 0.0), point(2.0, 0.0), point(1.0, 0.0)],
        )],
    )
    .unwrap_err();

    assert_eq!(error.reason(), MedialAxisErrorReason::EdgeCrossing);
}

#[test]
fn public_graph_resource_preflight_precedes_clone_and_preserves_the_error_family() {
    let mut graph = MedialGraph::from_parts(
        vec![node(0, 0.0, 0.0), node(1, 1.0, 0.0)],
        vec![edge(0, 0, 1, vec![point(0.0, 0.0), point(1.0, 0.0)])],
    )
    .unwrap();
    graph.ccw_edges[0] = vec![EdgeId(0); 2_000_001];
    let allowed = allowed_rectangle(600.0, 400.0, 20.0);

    assert!(matches!(
        graph.validate(&allowed),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
    assert!(matches!(
        graph.center(),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
}

#[test]
fn fixture_adapter_preflights_aggregate_points_before_cloning() {
    let allowed = allowed_rectangle(200.0, 100.0, 10.0);
    let fixtures = vec![AdapterEdgeFixture {
        polyline_local_mm: vec![point(90.0, 40.0); 2_000_001],
        source_site_ids: [0, 1],
    }];

    assert!(matches!(
        adapt_voronoi_fixture(&allowed, &fixtures),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
}

#[test]
fn helper_boundary_scan_work_is_checked_before_nested_scans() {
    assert!(matches!(
        boundary_scan_work_fixture(usize::MAX, 2),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
    assert!(boundary_scan_work_fixture(4, 4).is_ok());
    assert!(matches!(
        reflex_work_budget_fixture(usize::MAX, 2, 2),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
    assert!(matches!(
        inside_work_budget_fixture(usize::MAX, 2),
        Err(MedialAxisError::ResourceLimit {
            reason: MedialAxisErrorReason::GraphResourceLimit
        })
    ));
}

#[test]
fn invalid_and_degenerate_families_return_stable_typed_reasons() {
    let allowed = allowed_rectangle(600.0, 400.0, 20.0);
    assert_eq!(
        build_medial_graph(&allowed, f64::NAN).unwrap_err(),
        MedialAxisError::InvalidInput {
            reason: MedialAxisErrorReason::NonFiniteGuideSpacing,
        }
    );
    assert_eq!(
        build_medial_graph(&allowed, 0.0).unwrap_err().reason(),
        MedialAxisErrorReason::NonPositiveGuideSpacing
    );
    assert_eq!(
        adapt_voronoi_fixture(&allowed, &[]).unwrap_err().reason(),
        MedialAxisErrorReason::EmptyGraph
    );

    let crossing = MedialGraph::from_parts(
        vec![
            node(0, -1.0, 0.0),
            node(1, 1.0, 0.0),
            node(2, 0.0, -1.0),
            node(3, 0.0, 1.0),
        ],
        vec![
            edge(0, 0, 1, vec![point(-1.0, 0.0), point(1.0, 0.0)]),
            edge(1, 2, 3, vec![point(0.0, -1.0), point(0.0, 1.0)]),
            edge(2, 1, 2, vec![point(1.0, 0.0), point(0.0, -1.0)]),
        ],
    )
    .unwrap_err();
    assert_eq!(crossing.reason(), MedialAxisErrorReason::EdgeCrossing);
}

#[test]
fn independent_validation_reports_disconnectedness_and_acyclicity_with_typed_reasons() {
    let mut disconnected = MedialGraph::from_parts(
        vec![
            node(0, 0.0, 0.0),
            node(1, 1.0, 0.0),
            node(2, 2.0, 0.0),
            node(3, 3.0, 0.0),
        ],
        vec![
            edge(0, 0, 1, vec![point(0.0, 0.0), point(1.0, 0.0)]),
            edge(1, 1, 2, vec![point(1.0, 0.0), point(2.0, 0.0)]),
            edge(2, 2, 3, vec![point(2.0, 0.0), point(3.0, 0.0)]),
        ],
    )
    .unwrap();
    disconnected.edges[2] = edge(2, 0, 1, vec![point(0.0, 0.0), point(1.0, 0.0)]);
    let allowed = allowed_rectangle(600.0, 400.0, 20.0);
    assert_eq!(
        disconnected.validate(&allowed).unwrap_err().reason(),
        MedialAxisErrorReason::DisconnectedGraph
    );

    let mut cyclic = MedialGraph::from_parts(
        vec![node(0, 0.0, 0.0), node(1, 2.0, 0.0), node(2, 1.0, 1.0)],
        vec![
            edge(0, 0, 1, vec![point(0.0, 0.0), point(2.0, 0.0)]),
            edge(1, 1, 2, vec![point(2.0, 0.0), point(1.0, 1.0)]),
        ],
    )
    .unwrap();
    cyclic
        .edges
        .push(edge(2, 2, 0, vec![point(1.0, 1.0), point(0.0, 0.0)]));
    assert_eq!(
        cyclic.validate(&allowed).unwrap_err().reason(),
        MedialAxisErrorReason::CyclicGraph
    );
}

#[test]
fn independent_validation_covers_outside_leaves_and_cyclic_embedding() {
    let allowed = allowed_rectangle(600.0, 400.0, 20.0);
    let interior_leaf_graph = MedialGraph::from_parts(
        vec![node(0, 100.0, 100.0), node(1, 200.0, 100.0)],
        vec![edge(
            0,
            0,
            1,
            vec![point(100.0, 100.0), point(200.0, 100.0)],
        )],
    )
    .unwrap();
    assert_eq!(
        interior_leaf_graph.validate(&allowed).unwrap_err().reason(),
        MedialAxisErrorReason::LeafNotOnBoundary
    );

    let outside_graph = MedialGraph::from_parts(
        vec![
            node(0, 20.0, 200.0),
            node(1, 700.0, 200.0),
            node(2, 580.0, 200.0),
        ],
        vec![
            edge(0, 0, 1, vec![point(20.0, 200.0), point(700.0, 200.0)]),
            edge(1, 1, 2, vec![point(700.0, 200.0), point(580.0, 200.0)]),
        ],
    )
    .unwrap();
    assert_eq!(
        outside_graph.validate(&allowed).unwrap_err().reason(),
        MedialAxisErrorReason::EdgeOutsideRegion
    );

    let mut graph = build_medial_graph(&allowed, 150.0).unwrap();
    let branch = graph
        .ccw_edges
        .iter_mut()
        .find(|incident| incident.len() >= 3)
        .unwrap();
    branch.swap(0, 1);
    assert_eq!(
        graph.validate(&allowed).unwrap_err().reason(),
        MedialAxisErrorReason::InvalidCyclicEmbedding
    );
}

#[test]
fn nearly_collinear_notch_is_pruned_or_rejected_without_panicking() {
    let allowed = allowed_polygon(
        &[
            (0.0, 0.0),
            (1_200.0, 0.0),
            (1_200.0, 800.0),
            (700.0, 800.0),
            (700.0, 400.002),
            (699.999, 400.0),
            (0.0, 400.0),
        ],
        10.0,
    );

    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        build_medial_graph_with_diagnostics(&allowed, 150.0)
    }));
    let result = outcome.expect("medial-axis construction must never panic");
    match result {
        Ok(built) => built.graph.validate(&allowed).unwrap(),
        Err(error) => assert!(matches!(
            error,
            MedialAxisError::Voronoi { .. }
                | MedialAxisError::Degenerate { .. }
                | MedialAxisError::Validation { .. }
                | MedialAxisError::ResourceLimit { .. }
        )),
    }
}

#[test]
fn abrahamsen_fixtures_expose_exact_intervals_first_hit_and_strict_angle_gate() {
    assert_eq!(guide_interval_count_fixture(300.0, 100.0).unwrap(), 3);
    assert_eq!(guide_interval_count_fixture(300.000_001, 100.0).unwrap(), 4);

    let graph = MedialGraph::from_parts(
        vec![
            node(0, 2.0, -1.0),
            node(1, 2.0, 1.0),
            node(2, 4.0, 1.0),
            node(3, 4.0, -1.0),
        ],
        vec![
            edge(0, 0, 1, vec![point(2.0, -1.0), point(2.0, 1.0)]),
            edge(1, 1, 2, vec![point(2.0, 1.0), point(4.0, 1.0)]),
            edge(2, 2, 3, vec![point(4.0, 1.0), point(4.0, -1.0)]),
        ],
    )
    .unwrap();
    let first = first_guide_hit_fixture(&graph, point(0.0, 0.0), Vec2::new(1.0, 0.0))
        .expect("the inward ray must hit both vertical edges");
    assert_eq!(first.edge, EdgeId(0));
    assert_eq!(first.point, point(2.0, 0.0));
    assert_abs_diff_eq!(first.ray_distance_mm, 2.0, epsilon = 1e-12);
    assert_abs_diff_eq!(first.angle_degrees, 90.0, epsilon = 1e-12);

    assert!(!guide_hit_angle_is_accepted_fixture(49.999_999));
    assert!(!guide_hit_angle_is_accepted_fixture(50.0));
    assert!(guide_hit_angle_is_accepted_fixture(50.000_001));
}

#[test]
fn reflex_replacement_fixture_requires_both_complete_faces_to_be_convex() {
    let first_convex = [point(0.0, 0.0), point(2.0, 0.0), point(1.0, 1.0)];
    let second_convex = [point(1.0, 1.0), point(2.0, 2.0), point(0.0, 2.0)];
    assert!(reflex_faces_allow_replacement_fixture(
        &first_convex,
        &second_convex
    ));

    let complete_concave_face = [
        point(0.0, 0.0),
        point(3.0, 0.0),
        point(3.0, 3.0),
        point(1.5, 1.0),
        point(0.0, 3.0),
    ];
    assert!(!reflex_faces_allow_replacement_fixture(
        &complete_concave_face,
        &second_convex
    ));
}

fn reflex_fixture_graph(previous_side_dent: Option<Point>) -> MedialGraph {
    let mut polyline = vec![point(6.0, 8.0)];
    if let Some(dent) = previous_side_dent {
        polyline.push(dent);
    }
    polyline.extend([
        point(7.5, 5.0),
        point(8.0, 4.0),
        point(7.0, 3.0),
        point(5.0, 2.0),
        point(2.0, 4.0),
    ]);
    MedialGraph::from_parts(
        vec![node(0, 6.0, 8.0), node(1, 2.0, 4.0)],
        vec![edge(0, 0, 1, polyline)],
    )
    .unwrap()
}

#[test]
fn reflex_replacement_uses_actual_post_replacement_faces() {
    let boundary = vec![
        point(0.0, 0.0),
        point(10.0, 0.0),
        point(10.0, 10.0),
        point(6.0, 10.0),
        point(6.0, 4.0),
        point(0.0, 4.0),
    ];
    let candidate_offsets = [29.0, 31.0];

    let accepted = reflex_replacement_decision_fixture(
        &reflex_fixture_graph(None),
        &boundary,
        &candidate_offsets,
    )
    .unwrap();
    assert_eq!(accepted.selected_branch_faces_convex, [true, true]);
    assert_eq!(accepted.complete_faces_convex, [true, true]);
    assert!(accepted.accepted);
    assert_eq!(accepted.candidate_count_after, 1);

    let rejected = reflex_replacement_decision_fixture(
        &reflex_fixture_graph(Some(point(6.8, 6.0))),
        &boundary,
        &candidate_offsets,
    )
    .unwrap();
    assert_eq!(rejected.selected_branch_faces_convex, [true, true]);
    assert!(rejected.complete_faces_convex.contains(&false));
    assert!(!rejected.accepted);
    assert_eq!(rejected.candidate_count_after, 2);
    assert_eq!(rejected.rejected_replacements, 1);
}

#[test]
fn abrahamsen_enrichment_adds_perpendicular_guides_on_long_boundary_runs() {
    let allowed = allowed_rectangle(1_600.0, 1_000.0, 50.0);
    let coarse = build_medial_graph_with_diagnostics(&allowed, 10_000.0).unwrap();
    let enriched = build_medial_graph_with_diagnostics(&allowed, 150.0).unwrap();

    assert_eq!(coarse.diagnostics.guide_branches_added, 0);
    assert!(enriched.diagnostics.guide_candidates > 0);
    assert!(enriched.diagnostics.guide_branches_added > 0);
    assert!(enriched.graph.leaves.len() > coarse.graph.leaves.len());
    assert!(
        enriched.diagnostics.guide_branches_added + enriched.diagnostics.low_angle_guides_rejected
            <= enriched.diagnostics.guide_candidates
    );
    enriched.graph.validate(&allowed).unwrap();

    let has_non_corner_guide_leaf = enriched.graph.leaves.iter().any(|leaf| {
        let p = enriched.graph.nodes[leaf.index()].point;
        let on_horizontal_side = (p.y - 50.0).abs() <= 1e-6 || (p.y - 950.0).abs() <= 1e-6;
        on_horizontal_side && p.x > 50.0 + 1e-6 && p.x < 1_550.0 - 1e-6
    });
    assert!(has_non_corner_guide_leaf);
}
