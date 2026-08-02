use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::erode_for_centerline;
use single_loop_solver::input::validate_and_normalize;
use single_loop_solver::medial_axis::{
    EdgeId, MedialEdge, MedialGraph, MedialNode, NodeId, build_medial_graph,
};
use single_loop_solver::model::{ConnectionInput, Point, SolveSingleLoopInput};
use single_loop_solver::wavefront::{
    SkeletonSide, WavefrontErrorReason, WavefrontFamilyKind, generate_wavefront_families,
    non_intersecting_nested, point_family, skeleton_family,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn node(id: u32, x: f64, y: f64) -> MedialNode {
    MedialNode {
        id: NodeId(id),
        point: point(x, y),
        clearance_mm: 0.0,
    }
}

fn edge(id: u32, a: u32, b: u32, points: &[(f64, f64)]) -> MedialEdge {
    MedialEdge::new(
        EdgeId(id),
        NodeId(a),
        NodeId(b),
        points.iter().map(|&(x, y)| point(x, y)).collect(),
    )
}

fn cross_tree() -> MedialGraph {
    MedialGraph::from_parts(
        vec![
            node(0, 1_000.0, 1_000.0),
            node(1, 1_000.0, 50.0),
            node(2, 1_950.0, 1_000.0),
            node(3, 1_000.0, 1_950.0),
            node(4, 50.0, 1_000.0),
        ],
        vec![
            edge(0, 0, 1, &[(1_000.0, 1_000.0), (1_000.0, 50.0)]),
            edge(1, 0, 2, &[(1_000.0, 1_000.0), (1_950.0, 1_000.0)]),
            edge(2, 0, 3, &[(1_000.0, 1_000.0), (1_000.0, 1_950.0)]),
            edge(3, 0, 4, &[(1_000.0, 1_000.0), (50.0, 1_000.0)]),
        ],
    )
    .unwrap()
}

fn corridor_tree() -> MedialGraph {
    MedialGraph::from_parts(
        vec![node(0, 1_150.0, 100.0), node(1, 50.0, 100.0)],
        vec![edge(0, 0, 1, &[(1_150.0, 100.0), (50.0, 100.0)])],
    )
    .unwrap()
}

fn short_diagonal_tree() -> MedialGraph {
    MedialGraph::from_parts(
        vec![node(0, 1_000.0, 50.0), node(1, 50.0, 100.0)],
        vec![edge(0, 0, 1, &[(1_000.0, 50.0), (50.0, 100.0)])],
    )
    .unwrap()
}

fn uneven_branch_tree() -> MedialGraph {
    MedialGraph::from_parts(
        vec![
            node(0, 0.0, 0.0),
            node(1, 1_000.0, 0.0),
            node(2, 0.0, 600.0),
            node(3, -1_000.0, 0.0),
            node(4, 0.0, -1_000.0),
            node(5, 0.0, 100.0),
        ],
        vec![
            edge(0, 0, 1, &[(0.0, 0.0), (1_000.0, 0.0)]),
            edge(1, 0, 5, &[(0.0, 0.0), (0.0, 100.0)]),
            edge(2, 5, 2, &[(0.0, 100.0), (0.0, 600.0)]),
            edge(3, 0, 3, &[(0.0, 0.0), (-1_000.0, 0.0)]),
            edge(4, 0, 4, &[(0.0, 0.0), (0.0, -1_000.0)]),
        ],
    )
    .unwrap()
}

fn allowed_rectangle(
    width: f64,
    height: f64,
    wall: f64,
) -> single_loop_solver::geometry::AllowedRegion {
    let normalized = validate_and_normalize(SolveSingleLoopInput {
        polygon: vec![
            point(0.0, 0.0),
            point(width, 0.0),
            point(width, height),
            point(0.0, height),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: width * 0.5,
        },
        requested_spacing_mm: 150.0,
        wall_clearance_mm: wall,
    })
    .unwrap();
    erode_for_centerline(&normalized).unwrap()
}

#[test]
fn point_family_has_one_ordered_crossing_per_root_leaf_path() {
    let graph = cross_tree();
    let family = point_family(&graph, 150.0, 1.0).unwrap();

    assert_eq!(family.kind, WavefrontFamilyKind::Point);
    assert!(
        family
            .fronts
            .windows(2)
            .all(|pair| non_intersecting_nested(&family, &pair[0], &pair[1]))
    );
    assert!(
        family
            .vertices
            .iter()
            .all(|vertex| vertex.parent_count() <= 1)
    );
    assert!(family.max_parent_distance_mm() <= 150.0 + 1e-9);
    assert!(family.crosses_each_root_leaf_path_once());
    assert!(family.validate(&graph).is_ok());
    assert_eq!(family.fronts.first().unwrap().vertices.len(), 1);
    assert_eq!(
        family.fronts.last().unwrap().vertices.len(),
        graph.leaves.len()
    );
}

#[test]
fn schedule_is_monotone_and_parent_events_are_stable() {
    let graph = cross_tree();
    let first = point_family(&graph, 137.0, 0.975).unwrap();
    let second = point_family(&graph, 137.0, 0.975).unwrap();

    assert_eq!(first.stable_signature(), second.stable_signature());
    assert!(
        first
            .vertices
            .iter()
            .all(|vertex| vertex.parent.is_none_or(|parent| {
                first.vertices[parent.index()].graph_time < vertex.graph_time
                    && first.vertices[parent.index()].root_distance_mm <= vertex.root_distance_mm
            }))
    );
    assert!(
        first
            .event_seam_anchors
            .windows(2)
            .all(|pair| pair[0].event_id < pair[1].event_id)
    );
    assert_abs_diff_eq!(first.guide_spacing_mm, 137.0 * 0.975, epsilon = 1e-12);
}

#[test]
fn ten_to_one_corridor_selects_a_radius_capable_skeleton() {
    let graph = corridor_tree();
    let allowed = allowed_rectangle(1_200.0, 200.0, 50.0);
    graph.validate(&allowed).unwrap();

    let family = skeleton_family(&graph, &allowed, 100.0, 1.0)
        .unwrap()
        .expect("a 10:1 corridor needs a skeleton family");

    assert_eq!(family.kind, WavefrontFamilyKind::Skeleton);
    assert!(family.core.skeleton_length_mm >= 800.0 - 1e-9);
    assert!(
        family
            .core
            .cycle
            .iter()
            .any(|vertex| vertex.side == SkeletonSide::Forward)
            && family
                .core
                .cycle
                .iter()
                .any(|vertex| vertex.side == SkeletonSide::Reverse)
    );
    assert!(family.core.reserved_turn_diameter_mm >= 160.0);
    assert!(family.core.perimeter_proxy_mm >= 0.05 * family.polygon_perimeter_mm.unwrap());
    assert!(family.max_parent_distance_mm() <= 100.0 + 1e-9);
    assert!(family.validate(&graph).is_ok());
}

#[test]
fn branched_tree_produces_point_and_skeleton_families() {
    let graph = cross_tree();
    let allowed = allowed_rectangle(2_000.0, 2_000.0, 50.0);
    graph.validate(&allowed).unwrap();

    let families = generate_wavefront_families(&graph, &allowed, 150.0, 1.0).unwrap();
    assert_eq!(families.len(), 2);
    assert_eq!(families[0].kind, WavefrontFamilyKind::Point);
    assert_eq!(families[1].kind, WavefrontFamilyKind::Skeleton);
    assert!(
        families
            .iter()
            .all(|family| family.validate(&graph).is_ok())
    );
}

#[test]
fn skeleton_is_omitted_when_its_perimeter_proxy_is_below_five_percent() {
    let graph = short_diagonal_tree();
    let allowed = allowed_rectangle(10_000.0, 8_000.0, 50.0);
    graph.validate(&allowed).unwrap();

    let skeleton = skeleton_family(&graph, &allowed, 100.0, 1.0).unwrap();
    assert!(skeleton.is_none());
}

#[test]
fn edge_speeds_do_not_increase_toward_a_shorter_subtree_leaf() {
    let family = point_family(&uneven_branch_tree(), 150.0, 1.0).unwrap();
    let event_time = |node: NodeId| {
        family
            .event_seam_anchors
            .iter()
            .find(|event| event.graph_node == Some(node))
            .unwrap()
            .graph_time
    };

    let branch_time = event_time(NodeId(5));
    let incoming_speed = 100.0 / branch_time;
    let outgoing_speed = 500.0 / (1.0 - branch_time);
    assert!(incoming_speed + 1e-9 >= outgoing_speed);
    assert_abs_diff_eq!(incoming_speed, outgoing_speed, epsilon = 1e-9);
}

#[test]
fn minimum_clearance_reserve_wins_over_a_fifty_mm_nominal_guide() {
    let family = point_family(&cross_tree(), 50.0, 0.95).unwrap();
    assert_abs_diff_eq!(family.guide_spacing_mm, 50.01, epsilon = 1e-12);
    assert!(family.max_parent_distance_mm() <= family.guide_spacing_mm + 1e-9);
}

#[test]
fn invalid_schedule_scalars_return_stable_typed_reasons() {
    let graph = cross_tree();
    for (spacing, factor, reason) in [
        (0.0, 1.0, WavefrontErrorReason::InvalidNominalSpacing),
        (f64::NAN, 1.0, WavefrontErrorReason::InvalidNominalSpacing),
        (150.0, 0.0, WavefrontErrorReason::InvalidGuideFactor),
        (150.0, 1.001, WavefrontErrorReason::InvalidGuideFactor),
    ] {
        assert_eq!(
            point_family(&graph, spacing, factor).unwrap_err().reason(),
            reason
        );
    }
}

#[test]
fn independent_family_validation_rejects_parent_and_core_corruption() {
    let graph = cross_tree();
    let family = point_family(&graph, 150.0, 1.0).unwrap();

    let mut broken_parent = family.clone();
    let outer = broken_parent.fronts[1].vertices[0];
    broken_parent.vertices[outer.index()].parent = None;
    assert_eq!(
        broken_parent.validate(&graph).unwrap_err().reason(),
        WavefrontErrorReason::InvalidParent
    );

    let mut broken_core = family;
    broken_core.core.reserved_turn_diameter_mm = 159.999;
    assert_eq!(
        broken_core.validate(&graph).unwrap_err().reason(),
        WavefrontErrorReason::InvalidCore
    );
}

#[test]
fn production_medial_graph_feeds_both_wavefront_families_deterministically() {
    let allowed = allowed_rectangle(3_000.0, 300.0, 50.0);
    let graph = build_medial_graph(&allowed, 150.0).unwrap();

    let first = generate_wavefront_families(&graph, &allowed, 150.0, 1.0).unwrap();
    let second = generate_wavefront_families(&graph, &allowed, 150.0, 1.0).unwrap();

    assert_eq!(first.len(), 2);
    assert_eq!(first[0].kind, WavefrontFamilyKind::Point);
    assert_eq!(first[1].kind, WavefrontFamilyKind::Skeleton);
    assert_eq!(
        first
            .iter()
            .map(|family| family.stable_signature())
            .collect::<Vec<_>>(),
        second
            .iter()
            .map(|family| family.stable_signature())
            .collect::<Vec<_>>()
    );
}
