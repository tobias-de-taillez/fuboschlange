//! Lane model tests for the brief's 3000x2400 / VA150 / wall_clearance-75
//! fixture, amended per the controller's Task 4 handoff after the plate
//! layer became reversal-closed (commits 5ea8997, 182ebf4):
//!
//! - The brief's naive ring count (`floor(2250/(2*150))+1 = 8`) assumed a
//!   ring can sit at one uniform inset on all four sides. It cannot:
//!   `BroadTurn90`'s corner geometry forces the horizontal-side and
//!   vertical-side insets to differ by an odd multiple of 75mm
//!   (`.superpowers/sdd/task-4-diagnosis.md` §1.7), so the real count for
//!   this fixture is **7**, not 8.
//! - `Lane` carries per-side channel coordinates (`rect_local: RectMm`) --
//!   there is no single uniform inset to report.
//! - The outermost ring is cross-checked against `plate_graph.rs`'s
//!   independently hand-verified `e_the_outermost_closable_ring_is_a_real_
//!   directed_cycle` test (same fixture, same phase: rows y=187.5/2212.5,
//!   columns x=112.5/2887.5, 60 edges, 2 of the 4 corners are path
//!   reversals) rather than re-deriving the expectation here.

use single_loop_solver::circuit::{
    ConnectionZone, Field, LoopGraphView, RectMm, build_connection_zone, build_graph_view,
    build_lanes,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, PoseEdge,
    build_embedded_graph,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn rect_polygon() -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 2400.0),
        point(0.0, 2400.0),
    ])
    .unwrap()
}

// Edge 0 runs from (0,0) to (3000,0) with inward point (1500,1200) on the
// +y side, so plate-local coordinates equal world coordinates here (same
// convention as circuit_fields.rs / circuit_zone.rs / plate_graph.rs's
// `rectangle_3000x2400_graph`).
fn transform() -> PlateTransform {
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(1500.0, 1200.0),
        0.0,
        0.0,
    )
    .unwrap()
}

fn field() -> Field {
    // The whole room is one field for a plain rectangle (circuit_fields.rs
    // proves this via `decompose_fields`); constructed directly here to
    // avoid pulling in the guillotine machinery for a fixture that doesn't
    // exercise it.
    Field {
        id: 0,
        rect_local: RectMm {
            min: point(0.0, 0.0),
            max: point(3000.0, 2400.0),
        },
    }
}

/// The real, certified pose graph for the fixture -- built once per call,
/// on the order of a second including the reversal pass.
fn graph() -> EmbeddedPoseGraph {
    let instance = PlateInstance::new(
        rect_polygon(),
        transform(),
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .unwrap();
    build_embedded_graph(&instance, 75.0, PlateGraphLimits::default()).unwrap()
}

/// A tiny connection zone tucked against the connection edge (width 300mm,
/// depth 50mm, centered at x=1500) -- shallow enough to stay entirely below
/// every ring's bottom row (the outermost ring's is already at y=187.5) and
/// every ring's leftmost column-node y (150), so it cannot clip any lane
/// edge in this fixture. `build_lanes` doesn't otherwise care about the
/// zone's placement, but the fixture must not accidentally truncate a lane
/// the amendments say should be a complete cycle.
fn zone() -> ConnectionZone {
    use single_loop_solver::circuit::ConnectionInput;
    build_connection_zone(
        &rect_polygon(),
        &transform(),
        &ConnectionInput {
            edge_index: 0,
            center_offset_mm: 1500.0,
            zone_width_mm: 300.0,
            zone_depth_mm: 50.0,
        },
    )
    .unwrap()
}

fn view(graph: &EmbeddedPoseGraph) -> LoopGraphView {
    build_graph_view(graph, &zone(), &transform())
}

fn edge_by_id(graph: &EmbeddedPoseGraph, id: u32) -> &PoseEdge {
    graph.edges.iter().find(|edge| edge.id == id).unwrap()
}

#[test]
fn rectangle_field_produces_expected_ring_count() {
    // 3000 x 2400 room, wall clearance 75, VA 150: the naive uniform-inset
    // formula gives 8, but no uniform-inset ring is constructible (see
    // module docs). The graph-verified count is 7.
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    assert_eq!(lanes.len(), 7);
    assert_eq!(lanes[0].id, 0);
    assert!(
        lanes[0].node_ids.len() > lanes[6].node_ids.len(),
        "outer ring is longer"
    );
}

#[test]
fn outermost_ring_matches_the_hand_verified_sixty_edge_cycle() {
    // Cross-check against plate_graph.rs's independently hand-computed
    // ring: rows y=187.5 (m=2) / y=2212.5 (m=29), columns x=112.5 (n=1) /
    // x=2887.5 (n=38); 4 corners + 56 straights = 60 edges.
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    let outer = &lanes[0];
    assert_eq!(
        outer.rect_local,
        RectMm {
            min: point(112.5, 187.5),
            max: point(2887.5, 2212.5),
        }
    );
    assert_eq!(outer.edge_ids.len(), 60);
    assert_eq!(outer.node_ids.len(), 61);
}

#[test]
fn ring_edge_counts_match_the_diagnosed_nested_family() {
    // task-4-diagnosis.md §2.3's nested-ring table (edges column), derived
    // independently from the same parity algebra: 4 corners plus
    // 2*(width-375)/150 row hops plus 2*(height-225)/150 column hops for
    // each successively-nested ring.
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    let edge_counts: Vec<usize> = lanes.iter().map(|lane| lane.edge_ids.len()).collect();
    assert_eq!(edge_counts, vec![60, 52, 44, 36, 28, 20, 12]);
}

#[test]
fn lane_edges_form_a_connected_ordered_ring() {
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    for lane in &lanes {
        for pair in lane.edge_ids.windows(2) {
            let a = edge_by_id(&graph, pair[0]);
            let b = edge_by_id(&graph, pair[1]);
            assert_eq!(a.end.id, b.start.id, "edges are chained");
        }
        assert!(
            lane.edge_ids
                .iter()
                .all(|id| view.usable_edges.contains(id))
        );
    }
}

#[test]
fn all_seven_fixture_lanes_are_complete_untruncated_cycles() {
    // Amendment 4: with the reversal-closed graph, the brief's truncation
    // rule stands but should not fire on this fixture.
    //
    // `node_ids.len() == edge_ids.len() + 1` is structural in `build_ring`
    // (every edge push is paired with exactly one node push) -- it holds for
    // a truncated arc too, so it cannot by itself catch truncation. The
    // assertion with teeth is `first == last`: that's only true if
    // `walk_straight_hops`'s closing leg actually reached back to the ring's
    // start node, which is exactly what a missing edge would break.
    // `ring_edge_counts_match_the_diagnosed_nested_family` above is the
    // other truncation catcher here -- a truncated lane would fall well
    // short of its pinned edge count.
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    for lane in &lanes {
        assert_eq!(
            lane.node_ids.len(),
            lane.edge_ids.len() + 1,
            "lane {} has a node/edge count mismatch (build_ring invariant broken)",
            lane.id
        );
        assert_eq!(
            lane.node_ids.first(),
            lane.node_ids.last(),
            "lane {} does not close (truncated?)",
            lane.id
        );
    }
}

#[test]
fn lanes_are_deterministic() {
    let graph = graph();
    let view = view(&graph);
    let a = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    let b = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
    assert_eq!(a, b);
}

#[test]
fn odd_channel_step_spacing_still_produces_closed_rings() {
    // ALLOWED_SPACINGS_MM (circuit/types.rs) is [75, 150, 225, 300]; every
    // other test here uses 150mm, which steps consecutive rings by exactly
    // one translation period (2 channels) and so trivially preserves each
    // side's channel parity. 225mm steps by 3 channels -- an odd number --
    // which is the case `ring_channels`' doc comment claims still works
    // because corner constructibility is a parity relationship *within* one
    // ring (diagnosis §1.7), not a function of the raw step between rings.
    // That claim was previously asserted but never exercised; this pins it.
    let graph = graph();
    let view = view(&graph);
    let lanes = build_lanes(&field(), 225.0, &graph, &view, &transform(), 75.0).unwrap();
    assert!(
        !lanes.is_empty(),
        "expected at least one ring at spacing 225 on this fixture"
    );
    for lane in &lanes {
        assert_eq!(
            lane.node_ids.len(),
            lane.edge_ids.len() + 1,
            "lane {} did not close at spacing 225",
            lane.id
        );
        assert_eq!(
            lane.node_ids.first(),
            lane.node_ids.last(),
            "lane {} did not close at spacing 225",
            lane.id
        );
    }
}
