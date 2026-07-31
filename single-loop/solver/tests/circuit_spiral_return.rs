//! Task 7: turn insertion and return construction. Amended per the
//! controller's handoff (`.superpowers/sdd/task-7-brief.md` predates the
//! reversal-closed catalogue and the 7-lane reality Task 6 established):
//!
//! - 7 lanes (ids 0..6), arm `[0,2,4,6]`, reserved `{1,3,5}` -- the brief's
//!   `return_lanes vec![7,5,3,1]` becomes `[5,3,1]` (there is no lane 7; the
//!   turn connects lane 6, the arm's end, directly to lane 5, the innermost
//!   reserved lane).
//! - Return edges are matched by *pose* (point + heading), never by
//!   `Lane::node_ids`/`edge_ids` membership: a reverse-family edge departing
//!   ring 6 lands on ring 5's coordinates at the *opposite* heading from
//!   ring 5's own forward node there -- a different interned `PoseNode`, same
//!   point (`spiral.rs`'s module doc, controller amendment 2). `lanes_of`
//!   below is this file's own pose-based classifier for that reason: there is
//!   no such helper in the production API (a return edge's id is not a
//!   member of any `Lane::edge_ids`), so this duplicates the same
//!   find-by-pose technique `complete_spiral` itself uses internally,
//!   against the public graph API only -- matching this crate's established
//!   precedent of duplicating small fixture/helper logic per integration
//!   test file rather than sharing a test-support crate (see `fields.rs`'s
//!   and `circuit_spiral_arm.rs`'s own module docs).

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, Field, Lane, LoopGraphView, RectMm, SearchFailureKind,
    SpiralPath, build_connection_zone, build_graph_view, build_lanes, complete_spiral,
    plan_inward_arm,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    PoseEdge, TemplateId, build_embedded_graph,
};
use std::collections::BTreeMap;

// --- Real 3000x2400 / VA150 / wall_clearance-75 fixture, duplicated from
// tests/circuit_spiral_arm.rs per that file's own precedent. ---

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
    Field {
        id: 0,
        rect_local: RectMm {
            min: point(0.0, 0.0),
            max: point(3000.0, 2400.0),
        },
    }
}

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

fn zone() -> ConnectionZone {
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

/// The real 7 lanes (ids 0..6) for the fixture, built from whichever `graph`
/// is supplied -- the clipped-graph test passes a graph with one return edge
/// removed, and lanes must be built from *that* graph so their own
/// (untouched, forward) `edge_ids` stay consistent with it.
fn lanes7(graph: &EmbeddedPoseGraph) -> Vec<Lane> {
    build_lanes(&field(), 150.0, graph, &view(graph), &transform(), 75.0).unwrap()
}

fn zone_segment() -> (u32, u32) {
    (1, 0)
}

// --- Pose-based helpers (test-only; see module doc). ---

fn opposite_heading(heading: Heading8) -> Heading8 {
    Heading8::from_octant(heading.octant() + 4)
}

fn edge_index(graph: &EmbeddedPoseGraph) -> BTreeMap<u32, &PoseEdge> {
    graph.edges.iter().map(|edge| (edge.id, edge)).collect()
}

/// The certified edge whose (start, end) poses are the exact path-reversal
/// of `edge`'s: same two poses, endpoints swapped, each heading flipped 180
/// degrees. Deterministically the smallest id if more than one matches.
fn reversed_counterpart_id(graph: &EmbeddedPoseGraph, edge: &PoseEdge) -> Option<u32> {
    let want_start_point = edge.end.local_pose.point;
    let want_start_heading = opposite_heading(edge.end.local_pose.heading);
    let want_end_point = edge.start.local_pose.point;
    let want_end_heading = opposite_heading(edge.start.local_pose.heading);
    graph
        .edges
        .iter()
        .filter(|candidate| {
            candidate.start.local_pose.heading == want_start_heading
                && candidate.end.local_pose.heading == want_end_heading
                && (candidate.start.local_pose.point - want_start_point).norm() < 1e-6
                && (candidate.end.local_pose.point - want_end_point).norm() < 1e-6
        })
        .map(|candidate| candidate.id)
        .min()
}

fn point_on_rect_boundary(point: Point, rect: &RectMm) -> bool {
    let eps = 1e-6;
    let on_vertical_side = (point.x - rect.min.x).abs() < eps || (point.x - rect.max.x).abs() < eps;
    let on_horizontal_side =
        (point.y - rect.min.y).abs() < eps || (point.y - rect.max.y).abs() < eps;
    let within_y = point.y >= rect.min.y - eps && point.y <= rect.max.y + eps;
    let within_x = point.x >= rect.min.x - eps && point.x <= rect.max.x + eps;
    (on_vertical_side && within_y) || (on_horizontal_side && within_x)
}

/// The single ring both of `edge`'s endpoints sit on the rectangle boundary
/// of, or `None` if no one ring's boundary contains both. Deliberately
/// requires *both* endpoints on the *same* ring, not just one: a reversed
/// lane-change
/// chain's second hop starts at the flipped intermediate free lattice node
/// (`spiral.rs`'s module doc, "why lane-change edges are found, not
/// asserted" -- that node belongs to neither ring by construction), but
/// Task 6's own minor findings note the exclusion barring it from the
/// *skipped* ring's own edges is edge-id-level only, not independently
/// pinned at the node level -- so that free node could in principle
/// coincide with a *skipped* ring's own node and pass a start-point-only
/// check. Requiring both endpoints on one ring's boundary is immune to
/// that: a ring-own edge (straight or `BroadTurn90` corner) always has both
/// endpoints on its own rectangle; a chain hop never does.
fn ring_for_edge(edge: &PoseEdge, lanes: &[Lane]) -> Option<u32> {
    lanes
        .iter()
        .find(|lane| {
            point_on_rect_boundary(edge.start.local_pose.point, &lane.rect_local)
                && point_on_rect_boundary(edge.end.local_pose.point, &lane.rect_local)
        })
        .map(|lane| lane.id)
}

/// Classifies each of `edge_ids` by [`ring_for_edge`], collapsing adjacent
/// duplicates -- the ordered, deduped sequence of rings the path actually
/// passes through. A lane-change/chain edge (which never has both endpoints
/// on one ring's rectangle) is simply skipped rather than breaking the
/// sequence, exactly like `InwardArm::lane_sequence` only ever names real
/// rings, never a lane-change hop.
fn lanes_of(edge_ids: &[u32], lanes: &[Lane], graph: &EmbeddedPoseGraph) -> Vec<u32> {
    let by_id = edge_index(graph);
    let mut result: Vec<u32> = Vec::new();
    for &id in edge_ids {
        let edge = by_id[&id];
        if let Some(ring_id) = ring_for_edge(edge, lanes)
            && result.last() != Some(&ring_id)
        {
            result.push(ring_id);
        }
    }
    result
}

/// Continuity at the two seams the brief's own pseudocode checks: the arm's
/// last pose is the turn's first pose, and the turn's last pose is the
/// return's first pose (see `spiral.rs`'s module doc on why this is *not*
/// asserted end-to-end across the whole return sequence -- `InwardArm::
/// edge_ids` is provenance, not a chained path, and the return sequence
/// inherits that same property beyond these two seams).
fn assert_continuous(path: &SpiralPath, graph: &EmbeddedPoseGraph) {
    let by_id = edge_index(graph);
    let last_inward = by_id[path
        .inward_edge_ids
        .last()
        .expect("inward arm must be non-empty")];
    let first_turn = by_id[path.turn_edge_ids.first().expect("turn must be non-empty")];
    assert_eq!(
        last_inward.end.local_pose, first_turn.start.local_pose,
        "the arm's final pose must equal the turn's start pose"
    );
    let last_turn = by_id[path.turn_edge_ids.last().unwrap()];
    let first_return = by_id[path
        .return_edge_ids
        .first()
        .expect("return must be non-empty")];
    assert_eq!(
        last_turn.end.local_pose, first_return.start.local_pose,
        "the turn's end pose must equal the return path's first pose"
    );
}

// --- Step 1: the brief's three tests, fixtures amended per the controller's
// handoff (see module doc). ---

#[test]
fn completed_spiral_returns_through_every_reserved_lane_to_the_zone() {
    let graph = graph();
    let lanes = lanes7(&graph);
    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    let path = complete_spiral(&arm, &lanes, &graph).unwrap();

    assert!(!path.turn_edge_ids.is_empty());
    assert_eq!(path.inward_edge_ids, arm.edge_ids);

    let return_lanes = lanes_of(&path.return_edge_ids, &lanes, &graph);
    assert_eq!(return_lanes, vec![5, 3, 1]);

    assert_continuous(&path, &graph);
}

#[test]
fn missing_return_edge_is_a_dead_end_not_a_repair() {
    // Controller amendment 6: build the clipped fixture by removing one
    // required *reversed* edge from a copied graph (the forward edge stays),
    // targeting return lane 3 specifically (the brief's own choice).
    let graph = graph();
    let lanes = lanes7(&graph);
    let by_id = edge_index(&graph);
    let ring3 = lanes.iter().find(|lane| lane.id == 3).unwrap();
    let forward_edge = by_id[&ring3.edge_ids[0]];
    let to_remove = reversed_counterpart_id(&graph, forward_edge).expect(
        "ring 3's first edge must have a certified reversed counterpart on the real fixture",
    );

    let mut clipped = graph.clone();
    clipped.edges.retain(|edge| edge.id != to_remove);

    let clipped_lanes = lanes7(&clipped);
    let arm = plan_inward_arm(&clipped_lanes, zone_segment(), 150.0, &clipped, 100_000).unwrap();
    // The inward arm never uses reversed edges, so it must still succeed
    // identically on the clipped graph -- only the return construction can
    // see the missing edge.
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    let failure = complete_spiral(&arm, &clipped_lanes, &clipped).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    // Both substrings, deliberately: "return lane 3" alone would also pass
    // if `ring_entry_index` failed for an unrelated reason (e.g. a rotation
    // bug), since that failure message also names the ring. Requiring "no
    // certified reversed counterpart" too pins this test to the specific
    // failure this fixture actually engineers -- the missing edge, not a
    // different bug that happens to share a substring.
    assert!(
        failure
            .journal_tail
            .iter()
            .any(|entry| entry.decision.contains("return lane 3")
                && entry.decision.contains("no certified reversed counterpart")),
        "journal_tail did not name a missing reversed counterpart on return lane 3: {:?}",
        failure.journal_tail
    );
}

#[test]
fn turn_uses_only_certified_reverse_templates_with_80_mm_arcs() {
    let graph = graph();
    let lanes = lanes7(&graph);
    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    let path = complete_spiral(&arm, &lanes, &graph).unwrap();
    let by_id = edge_index(&graph);

    assert!(!path.turn_edge_ids.is_empty());
    for id in &path.turn_edge_ids {
        let edge = by_id[id];
        assert!(
            matches!(
                edge.template_id,
                TemplateId::TeardropReverse | TemplateId::BroadReverse180
            ),
            "turn edge {id} used template {:?}, expected a reverse-family template",
            edge.template_id
        );
    }
}

// --- Coverage beyond the brief's three required tests ---

#[test]
fn no_certified_turn_from_an_early_terminating_arm_is_a_dead_end() {
    // Reuses `circuit_spiral_arm.rs`'s `descent_stops_before_violating_turn_
    // budget` fixture: ring 6's `rect_local` is overridden to a 75mm gap
    // from ring 5 (nothing in the catalogue bridges 75mm), so the arm backs
    // off to `[0,2,4]` -- ring 5 is still reserved (entering ring 4 reserves
    // it) even though the arm never entered ring 6.
    //
    // This is *not* the brief's "missing edge" scenario -- every edge here
    // is real and untouched. It is a genuine gap this task's own probing
    // found: `turn_budget_ok` is a purely dimensional check (ring 4 to ring
    // 5 measures the same 150mm a `TeardropReverse` bridges from ring 6, so
    // it reports `true`), but *positionally* every reverse-family edge
    // departing ring 4's own closing node lands 37.5mm short of ring 5's
    // actual rectangle -- outside it, not on it. So no certified turn
    // exists from this arm at all, and `complete_spiral` must report a
    // clean dead end rather than silently pretending ring 6's turn also
    // works one ring shallower. See `spiral.rs`'s module doc,
    // "`turn_budget_ok` is necessary, not sufficient".
    let graph = graph();
    let mut lanes = lanes7(&graph);
    let ring6 = lanes.iter_mut().find(|lane| lane.id == 6).unwrap();
    ring6.rect_local = RectMm {
        min: point(937.5, 1012.5),
        max: point(2062.5, 1387.5),
    };

    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4]);

    let failure = complete_spiral(&arm, &lanes, &graph).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    assert!(
        failure
            .journal_tail
            .iter()
            .any(|entry| entry.decision.contains("return lane 5")
                && entry
                    .decision
                    .contains("no certified reverse-template edge")),
        "journal_tail did not name a missing turn to return lane 5: {:?}",
        failure.journal_tail
    );
}
