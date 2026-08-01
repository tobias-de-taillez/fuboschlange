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
    filter_zone_nopps, plan_inward_arm,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    PoseEdge, TemplateId, build_embedded_graph,
};
use std::collections::{BTreeMap, BTreeSet};

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

fn base_instance() -> PlateInstance {
    PlateInstance::new(
        rect_polygon(),
        transform(),
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .unwrap()
}

/// The plate the loop is laid on, with the connection zone's own noppen
/// removed -- exactly what `attach_port` (and so `complete_spiral`) needs.
fn instance() -> PlateInstance {
    let mut instance = base_instance();
    filter_zone_nopps(&mut instance, &zone());
    instance
}

fn graph() -> EmbeddedPoseGraph {
    build_embedded_graph(&base_instance(), 75.0, PlateGraphLimits::default()).unwrap()
}

/// The connection, amended for Task 11a: 600 x 300 at offset 2100, not the
/// 300 x 50 at 1500 this file used before.
///
/// `complete_spiral` now has to *reach* the zone at both ends, and the exit
/// anchor sits on ring 1, whose channel is 337.5 mm from the wall. The
/// candidate anchors are the nodes inside the zone rectangle grown by
/// `zone::ENTRY_RING_MM` (150 mm), so ring 1 only offers one once
/// `zone_depth_mm >= 187.5` -- see `zone.rs`'s own `ENTRY_RING_MM` doc, which
/// states the same arithmetic. At 300 mm the zone also truncates ring 0 to a
/// 10-edge arc, which is ordinary data (`fields.rs`) and leaves the arm's own
/// lane sequence unchanged at `[0,2,4,6]`; the off-centre offset keeps that arc
/// long instead of halving ring 0's bottom side.
fn zone() -> ConnectionZone {
    build_connection_zone(
        &rect_polygon(),
        &transform(),
        &ConnectionInput {
            edge_index: 0,
            center_offset_mm: 2100.0,
            zone_width_mm: 600.0,
            zone_depth_mm: 300.0,
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

/// The whole point of Task 11a: `SpiralPath`'s edge sequence, read in order,
/// is one chained path -- every edge's end pose is the next edge's start pose
/// exactly. Before Task 11a this held only at the two seams around the turn
/// (`spiral.rs`'s old "continuity is a two-seam contract"), and the assembled
/// sequence had 7 geometric breaks of up to 322.6 mm at the lane changes.
///
/// Poses, not rendered primitives: a `PoseEdge`'s primitives start and end at
/// its own two poses by construction, so pose equality is the same statement
/// one check earlier, and it names the offending *edge* when it fails.
/// `certify_loop`'s own `canonicalize_path` gate is what checks the rendered
/// geometry, and `circuit_loop_end_to_end.rs` runs it.
fn assert_chained(path: &SpiralPath, graph: &EmbeddedPoseGraph) {
    let by_id = edge_index(graph);
    let chained: Vec<u32> = path
        .inward_edge_ids
        .iter()
        .chain(path.turn_edge_ids.iter())
        .chain(path.return_edge_ids.iter())
        .copied()
        .collect();
    assert!(chained.len() > 1, "a spiral has more than one edge");
    for (position, pair) in chained.windows(2).enumerate() {
        let left = by_id[&pair[0]];
        let right = by_id[&pair[1]];
        assert_eq!(
            left.end.local_pose, right.start.local_pose,
            "break at position {position}: edge {} ends where edge {} does not start",
            pair[0], pair[1]
        );
    }
}

// --- Step 1: the brief's three tests, fixtures amended per the controller's
// handoff (see module doc) and again for Task 11a (see `zone`). ---

#[test]
fn completed_spiral_returns_through_every_reserved_lane_to_the_zone() {
    let graph = graph();
    let lanes = lanes7(&graph);
    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    let path = complete_spiral(&arm, &lanes, &graph, &view(&graph), &zone(), &instance()).unwrap();

    assert!(!path.turn_edge_ids.is_empty());
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    let return_lanes = lanes_of(&path.return_edge_ids, &lanes, &graph);
    assert_eq!(return_lanes, vec![5, 3, 1]);

    // `inward_edge_ids` is deliberately *not* `arm.edge_ids` any more. The arm
    // names the rings (that is what every `search.rs` invariant is stated
    // over); `complete_spiral` re-walks them as arcs so its output is a path.
    // Pinned as an inequality rather than left unsaid, because the two being
    // equal again would mean the chaining was reverted.
    assert_ne!(
        path.inward_edge_ids, arm.edge_ids,
        "the arm's provenance list is not itself a chained path"
    );
    assert_eq!(
        path.inward_edge_ids.len(),
        path.inward_lane_ids.len(),
        "every inward edge must say which ring it walks"
    );
    assert_eq!(path.return_edge_ids.len(), path.return_lane_ids.len());

    // The arm's own rings, in order, with the lane-change hops between them
    // reported as belonging to no ring -- 2 hops per change (this catalogue
    // has no single-edge lane change; Task 6's own probe), 3 changes inward
    // and 2 on the return.
    let inward_rings: Vec<u32> =
        path.inward_lane_ids
            .iter()
            .flatten()
            .copied()
            .fold(Vec::new(), |mut rings, ring| {
                if rings.last() != Some(&ring) {
                    rings.push(ring);
                }
                rings
            });
    assert_eq!(inward_rings, vec![0, 2, 4, 6]);
    assert_eq!(
        path.inward_lane_ids.iter().filter(|l| l.is_none()).count(),
        6,
        "three inward lane changes, two certified hops each"
    );
    assert_eq!(
        path.return_lane_ids.iter().filter(|l| l.is_none()).count(),
        4,
        "two return lane changes, two certified hops each"
    );

    // No *closed* ring is walked a full lap: a lap ends at the node it began
    // at, and the validator's crossing rule rejects a path that touches itself
    // there. Ring 0 is exempt because this fixture's zone truncates it to an
    // open 10-edge arc (`fields.rs`), whose two ends are different nodes --
    // walking all of it is an arc, not a lap.
    for lane in &lanes {
        let closed = lane.node_ids.first() == lane.node_ids.last();
        let walked = path
            .inward_lane_ids
            .iter()
            .chain(path.return_lane_ids.iter())
            .filter(|claimed| **claimed == Some(lane.id))
            .count();
        let ceiling = lane.edge_ids.len() - usize::from(closed);
        assert!(
            walked <= ceiling,
            "ring {} (closed={closed}) was walked {walked} of its own {} edges",
            lane.id,
            lane.edge_ids.len()
        );
    }
    assert!(
        lanes
            .iter()
            .any(|lane| lane.node_ids.first() != lane.node_ids.last()),
        "sanity: this fixture's zone really does truncate a ring"
    );

    // The arcs this fixture's rings actually admit, pinned so a change that
    // quietly shortens the loop -- which would still chain, and still certify
    // -- is visible in the diff.
    assert_eq!(path.inward_edge_ids.len(), 94);
    assert_eq!(path.return_edge_ids.len(), 64);

    let chained: Vec<u32> = path
        .inward_edge_ids
        .iter()
        .chain(path.turn_edge_ids.iter())
        .chain(path.return_edge_ids.iter())
        .copied()
        .collect();
    let unique: BTreeSet<u32> = chained.iter().copied().collect();
    assert_eq!(
        unique.len(),
        chained.len(),
        "no edge may be laid twice: {chained:?}"
    );

    // Both ends reach the connection zone, at the two different ports.
    let ends = path.ends.expect("a completed spiral must reach the zone");
    assert_ne!(ends.entry_port, ends.exit_port);
    let view = view(&graph);
    assert!(view.entry_candidates.contains(&ends.entry_anchor_node_id));
    assert!(view.entry_candidates.contains(&ends.exit_anchor_node_id));

    assert_chained(&path, &graph);
}

#[test]
fn a_ring_with_no_certified_reversed_counterparts_is_a_dead_end_not_a_repair() {
    // Controller amendment 6 asked for a clipped fixture missing one required
    // *reversed* edge, targeting a specific ring, with the forward edge left
    // in place. Task 11a keeps the property and changes the fixture, for two
    // measured reasons:
    //
    // 1. On this fixture the *return* walks all three reserved rings
    //    forwards; it is the inward arm that walks a ring (ring 0) backwards
    //    through counterparts. Which sense a ring is walked in is decided by
    //    the pose the path arrives with, not by convention (`spiral.rs`'s
    //    module doc), so the test asserts on ring 0.
    // 2. Removing *one* counterpart is something the construction can
    //    legitimately route around now, by walking a shorter arc or starting
    //    somewhere else -- and declining to lay a pipe that was never
    //    certified is the opposite of inventing geometry. The scenario the
    //    brief is about is the edge being genuinely absent, so every one of
    //    that ring's counterparts goes.
    let graph = graph();
    let lanes = lanes7(&graph);
    let intact = complete_spiral(
        &arm_on(&graph, &lanes),
        &lanes,
        &graph,
        &view(&graph),
        &zone(),
        &instance(),
    )
    .expect("the intact fixture must complete");
    let (target_ring, _) = first_backward_ring(&intact, &lanes)
        .expect("some ring must be walked backwards through counterparts");
    assert_eq!(
        target_ring, 0,
        "sanity: this fixture walks ring 0 backwards"
    );

    let ring = lanes
        .iter()
        .find(|lane| lane.id == target_ring)
        .expect("the ring exists");
    let counterparts: BTreeSet<u32> = ring
        .edge_ids
        .iter()
        .filter_map(|id| {
            let forward = graph.edges.iter().find(|edge| edge.id == *id)?;
            reversed_counterpart_id(&graph, forward)
        })
        .collect();
    assert!(
        !counterparts.is_empty(),
        "the reversal-closed catalogue must certify counterparts to remove"
    );

    let mut clipped = graph.clone();
    clipped
        .edges
        .retain(|edge| !counterparts.contains(&edge.id));
    let clipped_lanes = lanes7(&clipped);
    assert_eq!(
        clipped_lanes, lanes,
        "removing counterparts must not disturb the rings themselves"
    );

    // The arm names rings, not edges, so it must still succeed identically on
    // the clipped graph -- only the path construction can see the missing
    // edges.
    let arm = plan_inward_arm(&clipped_lanes, zone_segment(), 150.0, &clipped, 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    let failure = complete_spiral(
        &arm,
        &clipped_lanes,
        &clipped,
        &view(&clipped),
        &zone(),
        &instance(),
    )
    .unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    // Both substrings, deliberately: "lane 0" alone would also pass if the
    // walk failed to locate its start pose for an unrelated reason, since that
    // failure message also names the ring. Requiring "no certified reversed
    // counterpart" too pins this test to the specific failure this fixture
    // engineers -- the missing edge, not a different bug sharing a substring.
    assert!(
        failure.journal_tail.iter().any(|entry| {
            entry.decision.contains(&format!("lane {target_ring}"))
                && entry.decision.contains("no certified reversed counterpart")
        }),
        "journal_tail did not name a missing reversed counterpart on lane \
         {target_ring}: {:?}",
        failure.journal_tail
    );
}

/// The arm this file's fixture always produces, for tests that need it before
/// they get to the piece they are really about.
fn arm_on(graph: &EmbeddedPoseGraph, lanes: &[Lane]) -> single_loop_solver::circuit::InwardArm {
    plan_inward_arm(lanes, zone_segment(), 150.0, graph, 100_000).unwrap()
}

/// The first ring `path` walks backwards, and the certified counterpart it
/// walks first there: a ring whose own first walked edge is not a member of
/// any lane is being walked through counterparts.
fn first_backward_ring(path: &SpiralPath, lanes: &[Lane]) -> Option<(u32, u32)> {
    let edges = path
        .inward_edge_ids
        .iter()
        .chain(path.return_edge_ids.iter());
    let claims = path
        .inward_lane_ids
        .iter()
        .chain(path.return_lane_ids.iter());
    let mut seen: BTreeSet<u32> = BTreeSet::new();
    for (edge_id, claimed) in edges.zip(claims) {
        let Some(ring) = claimed else { continue };
        if !seen.insert(*ring) {
            continue;
        }
        if !lanes.iter().any(|lane| lane.edge_ids.contains(edge_id)) {
            return Some((*ring, *edge_id));
        }
    }
    None
}

#[test]
fn turn_uses_only_certified_reverse_templates_with_80_mm_arcs() {
    let graph = graph();
    let lanes = lanes7(&graph);
    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    let path = complete_spiral(&arm, &lanes, &graph, &view(&graph), &zone(), &instance()).unwrap();
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
fn an_early_terminating_arm_still_finds_its_turn_by_searching_its_whole_ring() {
    // Reuses `circuit_spiral_arm.rs`'s `descent_stops_before_violating_turn_
    // budget` fixture: ring 6's `rect_local` is overridden to a 75mm gap from
    // ring 5 (nothing in the catalogue bridges 75mm), so the arm backs off to
    // `[0,2,4]` -- ring 5 is still reserved (entering ring 4 reserves it) even
    // though the arm never entered ring 6.
    //
    // Task 7 recorded this as a dead end, and it was: every reverse-family
    // edge departing ring 4's *own closing node* lands 37.5mm short of ring
    // 5's rectangle, and the closing node was the only pose the turn was ever
    // searched from. Since Task 11a the arm's arc length is chosen so that the
    // pose it ends at is one a certified turn really departs, so the turn is
    // found from a different node of the same ring. The Task 7 note in
    // `spiral.rs` ("`turn_budget_ok` is necessary, not sufficient") stands as
    // far as the *dimensional* check goes -- it still says nothing about
    // position -- but the positional gap it described is no longer fatal.
    let graph = graph();
    let mut lanes = lanes7(&graph);
    let ring6 = lanes.iter_mut().find(|lane| lane.id == 6).unwrap();
    ring6.rect_local = RectMm {
        min: point(937.5, 1012.5),
        max: point(2062.5, 1387.5),
    };

    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4]);

    let path = complete_spiral(&arm, &lanes, &graph, &view(&graph), &zone(), &instance())
        .expect("the turn exists from some pose of ring 4's walk");
    let by_id = edge_index(&graph);
    let turn = by_id[&path.turn_edge_ids[0]];
    assert!(matches!(
        turn.template_id,
        TemplateId::TeardropReverse | TemplateId::BroadReverse180
    ));
    let ring5 = lanes.iter().find(|lane| lane.id == 5).unwrap();
    assert!(
        point_on_rect_boundary(turn.end.local_pose.point, &ring5.rect_local),
        "the turn must land on ring 5's own channel rectangle"
    );
    assert_eq!(
        lanes_of(&path.return_edge_ids, &lanes, &graph),
        vec![5, 3, 1]
    );
    assert_chained(&path, &graph);
}

#[test]
fn no_certified_turn_onto_the_reserved_ring_at_all_is_a_dead_end() {
    // The other half of the test above: when the turn is genuinely missing --
    // not merely missing from one node -- `complete_spiral` reports a dead end
    // rather than inventing geometry (see `spiral.rs`'s module doc, "a missing
    // certified edge is a dead end, not something to repair"). Built by
    // removing every reverse-family edge that lands on ring 5's rectangle;
    // ring construction uses `BroadTurn90` corners and straights only, so the
    // rings themselves are untouched, which the assertion below pins.
    let graph = graph();
    let lanes = lanes7(&graph);
    let ring5 = lanes.iter().find(|lane| lane.id == 5).unwrap().clone();

    let mut clipped = graph.clone();
    clipped.edges.retain(|edge| {
        !(matches!(
            edge.template_id,
            TemplateId::TeardropReverse | TemplateId::BroadReverse180
        ) && point_on_rect_boundary(edge.end.local_pose.point, &ring5.rect_local))
    });
    let clipped_lanes = lanes7(&clipped);
    assert_eq!(
        clipped_lanes, lanes,
        "removing reverse-family edges must not disturb the rings themselves"
    );

    let arm = plan_inward_arm(&clipped_lanes, zone_segment(), 150.0, &clipped, 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    let failure = complete_spiral(
        &arm,
        &clipped_lanes,
        &clipped,
        &view(&clipped),
        &zone(),
        &instance(),
    )
    .unwrap_err();
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
