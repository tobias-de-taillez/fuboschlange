//! Task 6: the spiral inward arm. Amended per the controller's handoff
//! (`.superpowers/sdd/task-6-brief.md` predates three structural
//! discoveries):
//!
//! - The fixture has **7** lanes (ids 0..6), not 8 -- the arm occupies
//!   0,2,4,6 and reserves 1,3,5 (nothing beyond 6: there is no lane 7).
//! - `turn_budget_ok` is a dimensional catalogue lookup (does *any*
//!   reverse-family template -- geometrically: opposite end/start heading,
//!   zero displacement along the start heading -- bridge exactly this cross
//!   distance), not the brief's obsolete "span >= 160mm" formula. On this
//!   catalogue: `TeardropReverse` bridges 150mm, `BroadReverse180` bridges
//!   225mm; nothing bridges 75mm or 300mm.
//! - The lane-change ("descend") edges connecting ring k to ring k+2 are
//!   never a single graph edge (verified empirically: zero same-lane-pair
//!   single edges exist anywhere in this graph, for *any* pair of rings,
//!   adjacent or not) -- they are a certified 2-edge `BroadTurn90` chain
//!   through a free lattice node that belongs to neither ring, confirmed for
//!   0->2, 2->4 and 4->6 on the real fixture.
//!
//! `zone_segment` is fixed at `(1, 0)` throughout: lane 1 is always the
//! first lane reserved (as a side effect of occupying lane 0), so this
//! doorway segment becomes satisfied from the very first descend onward.

use single_loop_solver::circuit::{
    Action, ConnectionInput, ConnectionZone, Field, Journal, Lane, LoopGraphView, PatternRules,
    RectMm, SearchFailureKind, SearchState, SpiralRules, backtracking_search,
    build_connection_zone, build_graph_view, build_lanes, plan_inward_arm, turn_budget_ok,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    build_embedded_graph,
};
use std::collections::BTreeSet;

// --- Real 3000x2400 / VA150 / wall_clearance-75 fixture, duplicated from
// tests/circuit_lanes.rs per that file's own precedent (separate
// integration-test binaries can't share private helpers without a
// test-support crate; see fields.rs's own test module doc for the same
// reasoning). ---

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

/// The real 7 lanes (ids 0..6) for the fixture -- see `circuit_lanes.rs`'s
/// `rectangle_field_produces_expected_ring_count` for the independent proof
/// this is 7, not the brief's naive 8.
fn lanes7(graph: &EmbeddedPoseGraph) -> Vec<Lane> {
    build_lanes(&field(), 150.0, graph, &view(graph), &transform(), 75.0).unwrap()
}

/// Lane 1's segment 0: the doorway segment used for every test's
/// `zone_segment` (see module doc).
fn zone_segment() -> (u32, u32) {
    (1, 0)
}

// --- Step 1: the brief's four tests, fixtures amended per the controller's
// handoff (see module doc). ---

#[test]
fn rectangle_inward_arm_occupies_every_second_lane_and_reserves_between() {
    // 7 lanes -> inward arm on lanes 0,2,4,6; lanes 1,3,5 reserved (lane 6
    // has no lane 7 to reserve -- that is exactly where the terminal turn
    // lives, controller amendment 3).
    let graph = graph();
    let arm = plan_inward_arm(&lanes7(&graph), zone_segment(), 150.0, &graph, 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    // Teeth beyond the brief's own assertion: `edge_ids` must actually carry
    // real, ordered provenance -- ring 0's own edges (in ring-walk order)
    // open the arm's edge list, and the *total* length independently
    // accounts for all four rings' real edge counts plus a 2-edge
    // lane-change chain between each consecutive pair (0->2, 2->4, 4->6 are
    // each a certified 2-`BroadTurn90` chain on the real graph -- see the
    // task report's probe findings; "2" here is not read from the
    // implementation, it is the independently-verified fact). This catches
    // a missing chain, a chain collapsing to 1 hop, or a partially-walked
    // ring -- none of which a mere prefix-match or non-empty check would.
    let lanes = lanes7(&graph);
    let lane_edge_count = |id: u32| {
        lanes
            .iter()
            .find(|lane| lane.id == id)
            .unwrap()
            .edge_ids
            .len()
    };
    let ring0 = lanes.iter().find(|lane| lane.id == 0).unwrap();
    assert_eq!(arm.edge_ids[..ring0.edge_ids.len()], ring0.edge_ids[..]);
    let expected_total = lane_edge_count(0)
        + 2
        + lane_edge_count(2)
        + 2
        + lane_edge_count(4)
        + 2
        + lane_edge_count(6);
    assert_eq!(arm.edge_ids.len(), expected_total);
}

#[test]
fn occupying_a_reserved_lane_is_rejected_with_journal_witness() {
    // No natural spiral state can ever propose occupying an already-reserved
    // lane (occupation always steps by +2 from an even lane; reservation is
    // always the very next odd lane) -- the invariant is a hard safety net
    // for adversarial/malformed state, not something the happy path can
    // reach. So this test seeds a `SearchState` directly (matching
    // `circuit_search.rs`'s own style for testing `check()` against
    // states `backtracking_search` would never organically produce) rather
    // than going through `plan_inward_arm`: lane 0 is already fully walked,
    // and lane 2 -- which the search would next try to *occupy* -- has been
    // (adversarially) reserved already, alongside the normal reservation of
    // lane 1.
    let graph = graph();
    let lanes = lanes7(&graph);
    let rules = SpiralRules::new(
        lanes.clone(),
        zone_segment(),
        150.0,
        PlateProfile::bekotec_en_23_fi_30_16(),
        &graph,
    );

    let lane0 = lanes.iter().find(|lane| lane.id == 0).unwrap();
    let lane1 = lanes.iter().find(|lane| lane.id == 1).unwrap();
    let lane2 = lanes.iter().find(|lane| lane.id == 2).unwrap();
    let mut occupied: BTreeSet<(u32, u32)> = BTreeSet::new();
    occupied.extend((0..lane0.edge_ids.len() as u32).map(|i| (0, i)));
    let mut reserved: BTreeSet<(u32, u32)> = BTreeSet::new();
    reserved.extend((0..lane1.edge_ids.len() as u32).map(|i| (1, i)));
    reserved.extend((0..lane2.edge_ids.len() as u32).map(|i| (2, i))); // adversarial

    let state = SearchState {
        occupied_lane_segments: occupied,
        reserved_lane_segments: reserved,
        used_length_mm: 0.0,
        journal: Journal::new(50),
        actions_used: 0,
    };

    let failure = backtracking_search(&rules, state, 100_000).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    assert!(
        failure
            .journal_tail
            .iter()
            .any(|e| e.rejected_by.as_deref() == Some("ReservedLane"))
    );
}

#[test]
fn turn_budget_matches_the_reverse_family_catalogue_exactly() {
    // Amended from the brief's obsolete "span >= 160mm" formula (see module
    // doc): `turn_budget_ok` is a dimensional lookup against the real
    // catalogue, not a threshold. `TeardropReverse` bridges exactly 150mm;
    // `BroadReverse180` bridges exactly 225mm; nothing bridges 75mm (the
    // documented NO_SOLUTION_GEOMETRY case for VA75) or 300mm (a real
    // catalogue gap -- see the task report).
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert!(turn_budget_ok(150.0, &profile));
    assert!(!turn_budget_ok(149.0, &profile));
    assert!(turn_budget_ok(225.0, &profile));
    assert!(!turn_budget_ok(75.0, &profile));
    assert!(!turn_budget_ok(300.0, &profile));
}

#[test]
fn descent_stops_before_violating_turn_budget() {
    // Lanes sized so the natural terminus (ring 6, the structural end of
    // this 7-lane fixture) leaves only a 75mm cross-channel gap to ring 5 --
    // nothing in the catalogue bridges 75mm, so ring 6 cannot host the
    // terminal turn. The arm must back off to ring 4 (cross-channel gap to
    // ring 5: 150mm, real and unmodified -- `TeardropReverse` fits).
    //
    // Built from the real fixture's real lanes (so the 0->2->4->6 lane-change
    // edges the search needs still exist in the real graph -- those come
    // from `node_ids`/`edge_ids`, untouched here); only ring 6's
    // `rect_local` is overwritten, to exactly 75mm inside ring 5's real
    // rect on all four sides (ring 5: (862.5,937.5)-(2137.5,1462.5), so ring
    // 6 becomes (937.5,1012.5)-(2062.5,1387.5) instead of its real
    // (1012.5,1087.5)-(1987.5,1312.5), a 150mm gap).
    let graph = graph();
    let mut lanes = lanes7(&graph);
    let ring6 = lanes.iter_mut().find(|lane| lane.id == 6).unwrap();
    ring6.rect_local = RectMm {
        min: point(937.5, 1012.5),
        max: point(2062.5, 1387.5),
    };

    let arm = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap();
    assert_eq!(*arm.lane_sequence.last().unwrap(), 4);
    assert_eq!(arm.lane_sequence, vec![0, 2, 4]);
}

// --- Coverage beyond the brief's four required tests ---

#[test]
fn insufficient_turn_budget_at_every_depth_is_a_geometry_failure() {
    // Every even lane's `rect_local` is overridden to sit exactly 75mm
    // inside its would-be-reserved odd neighbor (nothing in the catalogue
    // bridges 75mm -- see `turn_budget_matches_the_reverse_family_catalogue_
    // exactly`), so termination fails at every depth the search could
    // possibly reach (0, 2, 4, and 6): the whole pattern is infeasible, not
    // a partial arm.
    //
    // This is *not* simply "request 75mm spacing": build_lanes' real
    // parity-constrained channel lattice snaps 75mm-requested spacing on
    // this exact room to a *150mm* real cross-distance between every
    // consecutive ring (verified empirically -- the lattice alternates which
    // axis absorbs each 75mm step, so adjacent real rings are never
    // actually 75mm apart here), which the catalogue *does* bridge. Only a
    // direct, controlled override of `rect_local` -- independent of the
    // requested spacing parameter -- can force every candidate termination
    // to fail.
    let graph = graph();
    let mut lanes = lanes7(&graph);
    let real = lanes7(&graph);
    let rect_for = |lane_id: u32| {
        real.iter()
            .find(|lane| lane.id == lane_id)
            .unwrap()
            .rect_local
            .clone()
    };
    // Even lanes nest *outside* their odd neighbor, so overriding an even
    // lane to sit 75mm from it means expanding the odd lane's real rect by
    // 75mm on every side (not shrinking it).
    let expand_75mm = |rect: &RectMm| RectMm {
        min: point(rect.min.x - 75.0, rect.min.y - 75.0),
        max: point(rect.max.x + 75.0, rect.max.y + 75.0),
    };
    for (even, odd) in [(0u32, 1u32), (2, 3), (4, 5)] {
        let odd_rect = rect_for(odd);
        let lane = lanes.iter_mut().find(|lane| lane.id == even).unwrap();
        lane.rect_local = expand_75mm(&odd_rect);
    }
    // Lane 6 (no lane 7) still turns back against lane 5 -- same 75mm
    // override as `descent_stops_before_violating_turn_budget`.
    let lane6 = lanes.iter_mut().find(|lane| lane.id == 6).unwrap();
    lane6.rect_local = RectMm {
        min: point(937.5, 1012.5),
        max: point(2062.5, 1387.5),
    };

    let failure = plan_inward_arm(&lanes, zone_segment(), 150.0, &graph, 100_000).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
}

#[test]
fn spiral_rules_check_rejects_reserved_occupation_directly() {
    // Narrower unit-style pin of the invariant `occupying_a_reserved_lane_
    // is_rejected_with_journal_witness` exercises through the full search:
    // `check()` alone, on a single hand-built action, without any search
    // machinery -- matching `circuit_search.rs`'s
    // `reserving_then_occupying_the_same_segment_is_a_dead_end`.
    let graph = graph();
    let lanes = lanes7(&graph);
    let rules = SpiralRules::new(
        lanes.clone(),
        zone_segment(),
        150.0,
        PlateProfile::bekotec_en_23_fi_30_16(),
        &graph,
    );
    let mut state = SearchState {
        occupied_lane_segments: BTreeSet::new(),
        reserved_lane_segments: BTreeSet::new(),
        used_length_mm: 0.0,
        journal: Journal::new(10),
        actions_used: 0,
    };
    state.reserved_lane_segments.insert((2, 0));
    let action = Action {
        kind: "descend".to_owned(),
        occupy: (2, 0),
        reserves: Vec::new(),
        length_mm: 0.0,
        witness: None,
    };
    assert!(matches!(
        PatternRules::check(&rules, &state, &action),
        Err(single_loop_solver::circuit::Invariant::ReservedLane)
    ));
}
