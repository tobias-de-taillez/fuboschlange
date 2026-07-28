use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    Heading8, PlateGraphErrorCode, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    build_embedded_graph, validate_embedded_graph,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn instance(vertices: Vec<Point>) -> PlateInstance {
    let polygon = Polygon::try_from_original(vertices).unwrap();
    let (start, end) = polygon.original_edge(0);
    let inward = point(50.0, 50.0);
    let transform = PlateTransform::from_edge(start, end, inward, 0.0, 0.0).unwrap();
    PlateInstance::new(
        polygon,
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        20_000,
    )
    .unwrap()
}

fn rectangle_instance() -> PlateInstance {
    instance(vec![
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(900.0, 750.0),
        point(0.0, 750.0),
    ])
}

#[test]
fn embedded_graph_is_deterministic_certified_and_contains_diagonals() {
    let instance = rectangle_instance();
    let limits = PlateGraphLimits::default();
    let first = build_embedded_graph(&instance, 8.0, limits).unwrap();
    let second = build_embedded_graph(&instance, 8.0, limits).unwrap();

    assert_eq!(first, second);
    assert!(!first.nodes.is_empty());
    assert!(!first.edges.is_empty());
    assert!(!first.rejected_edges.is_empty());
    assert!(
        first
            .rejected_edges
            .iter()
            .all(|edge| !edge.primitives.is_empty())
    );
    assert!(first.edges.iter().all(|edge| edge.certificate.is_some()));
    assert!(first.edges.iter().any(|edge| {
        matches!(
            edge.start.local_pose.heading,
            Heading8::Deg45 | Heading8::Deg135 | Heading8::Deg225 | Heading8::Deg315
        )
    }));
    assert!(first.nodes.windows(2).all(|pair| pair[0].id < pair[1].id));
    assert!(first.edges.windows(2).all(|pair| pair[0].id < pair[1].id));
    validate_embedded_graph(&first, &instance, 8.0).unwrap();
}

#[test]
fn rectangle_l_u_and_c_rooms_build_bounded_graphs_without_claiming_connectivity() {
    let fixtures = vec![
        vec![
            point(0.0, 0.0),
            point(600.0, 0.0),
            point(600.0, 450.0),
            point(0.0, 450.0),
        ],
        vec![
            point(0.0, 0.0),
            point(600.0, 0.0),
            point(600.0, 225.0),
            point(300.0, 225.0),
            point(300.0, 600.0),
            point(0.0, 600.0),
        ],
        vec![
            point(0.0, 0.0),
            point(675.0, 0.0),
            point(675.0, 600.0),
            point(450.0, 600.0),
            point(450.0, 225.0),
            point(225.0, 225.0),
            point(225.0, 600.0),
            point(0.0, 600.0),
        ],
        vec![
            point(0.0, 0.0),
            point(675.0, 0.0),
            point(675.0, 150.0),
            point(300.0, 150.0),
            point(300.0, 450.0),
            point(675.0, 450.0),
            point(675.0, 600.0),
            point(0.0, 600.0),
        ],
    ];

    for vertices in fixtures {
        let instance = instance(vertices);
        let graph = build_embedded_graph(&instance, 8.0, PlateGraphLimits::default()).unwrap();
        assert!(graph.candidate_count <= PlateGraphLimits::default().max_edge_candidates);
        validate_embedded_graph(&graph, &instance, 8.0).unwrap();
    }
}

#[test]
fn edge_candidate_budget_fails_before_the_first_excess_candidate() {
    let instance = rectangle_instance();
    let limits = PlateGraphLimits {
        max_edge_candidates: 1,
        ..PlateGraphLimits::default()
    };
    let error = build_embedded_graph(&instance, 8.0, limits).unwrap_err();
    assert_eq!(error.code, PlateGraphErrorCode::SolverLimitExceeded);
    assert_eq!(error.used, 1);
    assert_eq!(error.limit, 1);
}
