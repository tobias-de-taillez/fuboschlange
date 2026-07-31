use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphErrorCode, PlateGraphLimits, PlateInstance, PlateProfile,
    PlateTransform, TemplateId, TemplateTransform, build_embedded_graph, validate_embedded_graph,
};
use std::collections::{BTreeMap, BTreeSet};

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

// ---------------------------------------------------------------------------
// Connectivity certification (task 3b).
//
// The plate layer used to build a graph whose template families never touched:
// no `BroadTurn*`/`*Reverse*` endpoint pose ever coincided with a straight-chain
// node, so the certified graph was a heap of disjoint islands and no turning
// path existed at all. These three tests certify the opposite property, on the
// same 3000x2400 fixture the circuit layer uses.
// ---------------------------------------------------------------------------

/// The 3000x2400 rectangle at 75 mm wall clearance. Edge 0 runs (0,0)->(3000,0)
/// with the inward point on the +y side, so plate-local coordinates equal world
/// coordinates (same convention as `circuit_fields.rs` / `circuit_lanes.rs`).
fn rectangle_3000x2400_graph() -> EmbeddedPoseGraph {
    let polygon = Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 2400.0),
        point(0.0, 2400.0),
    ])
    .unwrap();
    let transform = PlateTransform::from_edge(
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(1500.0, 1200.0),
        0.0,
        0.0,
    )
    .unwrap();
    let instance = PlateInstance::new(
        polygon,
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .unwrap();
    build_embedded_graph(&instance, 75.0, PlateGraphLimits::default()).unwrap()
}

/// Union-find over accepted edges, joined whenever two edges share a pose node.
fn edge_components(graph: &EmbeddedPoseGraph) -> Vec<usize> {
    let mut parent: Vec<usize> = (0..graph.edges.len()).collect();
    fn find(parent: &mut [usize], mut node: usize) -> usize {
        while parent[node] != node {
            parent[node] = parent[parent[node]];
            node = parent[node];
        }
        node
    }
    let mut first_edge_at_node: BTreeMap<u32, usize> = BTreeMap::new();
    for (index, edge) in graph.edges.iter().enumerate() {
        for node_id in [edge.start.id, edge.end.id] {
            match first_edge_at_node.get(&node_id) {
                None => {
                    first_edge_at_node.insert(node_id, index);
                }
                Some(&other) => {
                    let (a, b) = (find(&mut parent, index), find(&mut parent, other));
                    if a != b {
                        parent[a] = b;
                    }
                }
            }
        }
    }
    (0..graph.edges.len())
        .map(|index| find(&mut parent, index))
        .collect()
}

#[test]
fn a_broad_turn_90_bridges_two_straight_edges_at_hand_computed_poses() {
    // Hand-computed, not recomputed with production helpers. The catalogue's
    // local geometry is
    //   Straight0   : (0, 37.5) Deg0 -> (150, 37.5) Deg0
    //   BroadTurn90 : (0, 37.5) Deg0 -> (187.5, 150) Deg90
    // and `TemplateTransform::apply` mirrors x, then rotates by quarter turns,
    // then translates by (150*period_i, 150*period_j). So, well clear of every
    // wall, the corner
    //   Straight0   qt=0 mirror=false period=(4,1): (600,187.5) -> (750,187.5)
    //   BroadTurn90 qt=0 mirror=false period=(5,1): (750,187.5) -> (937.5,300)
    //   Straight0   qt=3 mirror=true  period=(6,2): (937.5,300) -> (937.5,450)
    // is one continuous, certified, three-edge path: 600 + 150 = 750 hands over
    // to the turn, and the turn's exit 750 + 187.5 = 937.5 / 150 + 150 = 300
    // hands over to the vertical run. (The mirrored quarter turn maps
    // (0,37.5)->(150,37.5) Deg0 onto (37.5,0)->(37.5,150) Deg90, which the
    // period (6,2) shift lifts to x = 37.5 + 900 = 937.5, y = 300..450.)
    let graph = rectangle_3000x2400_graph();
    let find_edge = |id: TemplateId, transform: TemplateTransform| {
        graph
            .edges
            .iter()
            .find(|edge| edge.template_id == id && edge.template_transform == transform)
            .unwrap_or_else(|| panic!("{id:?} {transform:?} is not an accepted edge"))
    };

    let approach = find_edge(
        TemplateId::Straight0,
        TemplateTransform::new(0, false, 4, 1).unwrap(),
    );
    let turn = find_edge(
        TemplateId::BroadTurn90,
        TemplateTransform::new(0, false, 5, 1).unwrap(),
    );
    let departure = find_edge(
        TemplateId::Straight0,
        TemplateTransform::new(3, true, 6, 2).unwrap(),
    );

    assert_eq!(approach.start.local_pose.point, point(600.0, 187.5));
    assert_eq!(approach.end.local_pose.point, point(750.0, 187.5));
    assert_eq!(approach.end.local_pose.heading, Heading8::Deg0);
    assert_eq!(turn.start.local_pose.point, point(750.0, 187.5));
    assert_eq!(turn.start.local_pose.heading, Heading8::Deg0);
    assert_eq!(turn.end.local_pose.point, point(937.5, 300.0));
    assert_eq!(turn.end.local_pose.heading, Heading8::Deg90);
    assert_eq!(departure.start.local_pose.point, point(937.5, 300.0));
    assert_eq!(departure.start.local_pose.heading, Heading8::Deg90);
    assert_eq!(departure.end.local_pose.point, point(937.5, 450.0));

    // Shared *node identity*, not merely equal coordinates: the graph interned
    // them as the same pose.
    assert_eq!(
        approach.end.id, turn.start.id,
        "the straight run does not hand over to the turn"
    );
    assert_eq!(
        turn.end.id, departure.start.id,
        "the turn does not hand over to the next straight run"
    );
}

#[test]
fn b_accepted_edges_form_one_dominant_connected_component() {
    let graph = rectangle_3000x2400_graph();
    let components = edge_components(&graph);
    let mut sizes: BTreeMap<usize, usize> = BTreeMap::new();
    for root in &components {
        *sizes.entry(*root).or_default() += 1;
    }
    let largest_root = *sizes
        .iter()
        .max_by_key(|(root, size)| (**size, std::cmp::Reverse(**root)))
        .expect("graph must have edges")
        .0;
    let largest = sizes[&largest_root];
    let total = graph.edges.len();
    let fraction = largest as f64 / total as f64;
    assert!(
        fraction > 0.90,
        "largest connected component holds {largest}/{total} = {:.1}% of the accepted edges; \
         turns and straights are not in one component",
        fraction * 100.0
    );

    // ...and that one component really is mixed, not just a big straight island.
    let families: BTreeSet<TemplateId> = graph
        .edges
        .iter()
        .zip(&components)
        .filter(|(_, root)| **root == largest_root)
        .map(|(edge, _)| edge.template_id)
        .collect();
    for expected in [
        TemplateId::Straight0,
        TemplateId::Straight45,
        TemplateId::BroadTurn45,
        TemplateId::BroadTurn90,
        TemplateId::BroadTurn135,
        TemplateId::BroadReverse180,
        TemplateId::TeardropReverse,
    ] {
        assert!(
            families.contains(&expected),
            "{expected:?} is missing from the dominant component (present: {families:?})"
        );
    }
}

#[test]
fn c_reverse_family_is_reachable_from_the_straight_family() {
    let graph = rectangle_3000x2400_graph();
    let components = edge_components(&graph);
    let roots_of = |wanted: TemplateId| -> BTreeSet<usize> {
        graph
            .edges
            .iter()
            .zip(&components)
            .filter(|(edge, _)| edge.template_id == wanted)
            .map(|(_, root)| *root)
            .collect()
    };
    let straight = roots_of(TemplateId::Straight0);
    assert!(!straight.is_empty(), "fixture must contain Straight0 edges");
    for reverse in [TemplateId::BroadReverse180, TemplateId::TeardropReverse] {
        let reverse_roots = roots_of(reverse);
        assert!(
            !reverse_roots.is_empty(),
            "fixture must contain {reverse:?} edges"
        );
        assert!(
            reverse_roots.iter().any(|root| straight.contains(root)),
            "{reverse:?} shares no connected component with Straight0 -- the reverse family is \
             unreachable from the straight runs"
        );
    }
}
