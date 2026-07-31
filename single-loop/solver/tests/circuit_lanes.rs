//! Task 4 (lane model) was BLOCKED on a plate-layer defect: the certified
//! `EmbeddedPoseGraph` for this profile (`BEKOTEC_EN_23_FI_30_16`) contained no
//! edge at all that transitioned between a straight run and a turn, so "corners
//! with the `BroadTurn90` edge" was not constructible and the graph was a heap
//! of disjoint islands. Root cause: nodes are interned by exact
//! `(x, y, heading)` (`plate::graph::pose_key`), and the turn templates were
//! bare tangent arcs whose endpoints landed 80 mm off every channel crossing --
//! never commensurate with the 150 mm period of the straight chains.
//!
//! Task 3b fixed that at the plate layer: the turns are now
//! `Line + Arc(>= 80 mm) + Line` composites whose lead-in and lead-out
//! straights absorb exactly that offset, so both endpoint poses land on the
//! shared anchor lattice. The tests below were originally written to pin the
//! broken state; they are kept, inverted, as the positive certification they
//! were probing for. If they fail again, the families have come apart and the
//! lane model is blocked once more.

use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, TemplateId,
    build_embedded_graph,
};
use std::collections::HashMap;

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
// convention as circuit_fields.rs / circuit_zone.rs).
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

/// The real, certified pose graph for the brief's 3000x2400 rectangle
/// fixture at wall_clearance 75mm (the `rectangle_field_produces_expected_
/// ring_count` test's own numbers) -- built once per test call, a few
/// hundred ms.
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

fn is_straight_family(id: TemplateId) -> bool {
    matches!(id, TemplateId::Straight0 | TemplateId::Straight45)
}

/// node id -> ids of every edge touching it, as either start or end.
fn touch_map(graph: &EmbeddedPoseGraph) -> HashMap<u32, Vec<u32>> {
    let mut touches: HashMap<u32, Vec<u32>> = HashMap::new();
    for edge in &graph.edges {
        touches.entry(edge.start.id).or_default().push(edge.id);
        touches.entry(edge.end.id).or_default().push(edge.id);
    }
    touches
}

#[test]
fn straight0_chains_form_long_connected_runs() {
    // Sanity baseline for the tests below: Straight0 *does* chain to itself
    // extensively (a ring's straight sides are buildable in isolation).
    // What's missing is only the corner transition -- established next.
    let graph = graph();
    let touches = touch_map(&graph);
    let straight0_both_ends_shared = graph
        .edges
        .iter()
        .filter(|e| e.template_id == TemplateId::Straight0)
        .filter(|e| touches[&e.start.id].len() > 1 && touches[&e.end.id].len() > 1)
        .count();
    assert!(
        straight0_both_ends_shared > 500,
        "expected long Straight0 chains in a 3000x2400 room, found only \
         {straight0_both_ends_shared} edges with both endpoints shared"
    );
}

#[test]
fn broad_turn_90_hands_over_to_straight_runs_at_both_ends() {
    // The maneuver Task 4's brief needs: a BroadTurn90 instance whose start
    // pose exactly equals the end pose of a straight edge, and whose end pose
    // exactly equals the start pose of another one. Before task 3b, zero of
    // 2144 BroadTurn90 edges touched anything at all.
    let graph = graph();
    let touches = touch_map(&graph);
    let turns: Vec<_> = graph
        .edges
        .iter()
        .filter(|e| e.template_id == TemplateId::BroadTurn90)
        .collect();
    assert!(
        !turns.is_empty(),
        "fixture must contain BroadTurn90 candidates for this test to mean anything"
    );
    let routable = turns
        .iter()
        .filter(|turn| {
            let straight_at = |node: u32, turn_id: u32| {
                touches[&node]
                    .iter()
                    .any(|&id| id != turn_id && is_straight_family(graph.edges[id as usize].template_id))
            };
            straight_at(turn.start.id, turn.id) && straight_at(turn.end.id, turn.id)
        })
        .count();
    assert!(
        routable * 2 > turns.len(),
        "only {routable} of {} BroadTurn90 edges have a straight run at BOTH ends; the corner \
         maneuver is not generally routable",
        turns.len()
    );
}

#[test]
fn every_arc_template_family_shares_nodes_with_the_straight_family() {
    // Generalizes the BroadTurn90 check across all five direction-changing
    // templates. Before task 3b the graph's only connected sub-families were
    // Straight0<->Straight0, Straight45<->Straight45 and a closed
    // {BroadTurn135, BroadReverse180, TeardropReverse} cluster; BroadTurn45 and
    // BroadTurn90 connected to nothing at all, not even each other. Every one
    // of them must now meet a straight run at a shared pose node.
    let graph = graph();
    let touches = touch_map(&graph);
    for family in [
        TemplateId::BroadTurn45,
        TemplateId::BroadTurn90,
        TemplateId::BroadTurn135,
        TemplateId::BroadReverse180,
        TemplateId::TeardropReverse,
    ] {
        let edges: Vec<_> = graph
            .edges
            .iter()
            .filter(|e| e.template_id == family)
            .collect();
        assert!(!edges.is_empty(), "fixture must contain {family:?} edges");
        let attached = edges
            .iter()
            .filter(|arc| {
                [arc.start.id, arc.end.id].iter().any(|node| {
                    touches[node].iter().any(|&id| {
                        id != arc.id && is_straight_family(graph.edges[id as usize].template_id)
                    })
                })
            })
            .count();
        assert!(
            attached > 0,
            "{family:?} shares no pose node with any straight edge ({} instances checked) -- \
             the families have come apart again",
            edges.len()
        );
    }
}
