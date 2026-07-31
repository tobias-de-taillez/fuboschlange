//! Task 4 (lane model) is BLOCKED. See `.superpowers/sdd/task-4-report.md`
//! for the full investigation. In short: `build_lanes` cannot be implemented
//! as specified by the brief, because the certified `EmbeddedPoseGraph` for
//! this profile (`BEKOTEC_EN_23_FI_30_16`) contains no edge that transitions
//! between a straight run and a 90-degree turn -- "corners with the
//! `BroadTurn90` edge" is not constructible; no `BroadTurn90` instance
//! anywhere in the graph shares an endpoint with anything else.
//!
//! The tests below are a characterization of that fact, pinned so it is
//! caught if the plate layer changes (fixed) or regresses further. They
//! replace an exploratory `println!`-driven investigation run during Task 4
//! (see the report for the raw data: node/edge counts, per-template
//! connectivity table, all-pairs template co-occurrence scan).
//!
//! Root cause: graph nodes are interned by exact `(x, y, heading)`
//! (`plate::graph::pose_key`), so two edges only chain when one's end pose
//! equals the other's start pose bit-for-bit (mod the 1e-6mm intern tick).
//! `Straight0`'s template-local endpoints are `(-150, 37.5)` and
//! `(300, 37.5)` -- both x-coordinates are exact multiples of
//! `profile.period_mm` (150), so every instance (any period offset,
//! quarter-turn, reflection) has one coordinate exactly `≡ 0 mod 150`.
//! `BroadTurn90`'s endpoints, relative to its own arc center `(37.5, 37.5)`
//! radius 80, are `(37.5, -42.5)` and `(117.5, 37.5)`; `37.5`, `-42.5`
//! (`≡ 107.5`), and `117.5` are all non-zero mod 150, and rotation/reflection
//! only permute or negate coordinates (never producing an exact 0), so no
//! combination of period, quarter-turn or reflection can ever land a
//! `BroadTurn90` endpoint on a `Straight0` endpoint. This is a structural
//! property of the profile's template geometry (`plate/template.rs`), not a
//! property of any specific room, wall clearance, or spacing.

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
fn broad_turn_90_never_shares_an_endpoint_with_any_other_edge() {
    // This is the fact that blocks Task 4's brief as written: "corners with
    // the BroadTurn90 edge" requires some BroadTurn90 instance whose start
    // (or end) pose exactly equals a Straight0 chain node. None exists,
    // anywhere in this graph, at either end -- confirmed exhaustively, not
    // just near one corner or one channel row.
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
    let isolated = turns
        .iter()
        .filter(|e| touches[&e.start.id].len() == 1 && touches[&e.end.id].len() == 1)
        .count();
    assert_eq!(
        isolated,
        turns.len(),
        "expected every BroadTurn90 edge ({} total) to be isolated at both ends; if this \
         fails, the plate layer has gained a straight<->arc transition and Task 4's lane \
         model is unblocked -- see task-4-report.md",
        turns.len()
    );
}

#[test]
fn straight_and_arc_template_families_never_share_a_node() {
    // Generalizes the BroadTurn90 finding across all 7 templates: at every
    // node touched by 2+ edges, either all of them are in the straight
    // family ({Straight0, Straight45}) or none of them are. The graph's
    // only connected sub-families are Straight0<->Straight0,
    // Straight45<->Straight45, and a closed {BroadTurn135, BroadReverse180,
    // TeardropReverse} cluster (presumably the "Kehre" u-turn assembly) --
    // confirmed by an all-pairs template co-occurrence scan during the Task
    // 4 investigation (see the report). BroadTurn45 and BroadTurn90 connect
    // to nothing, not even each other.
    let graph = graph();
    let touches = touch_map(&graph);
    for (node_id, edge_ids) in &touches {
        if edge_ids.len() < 2 {
            continue;
        }
        let mut families = edge_ids
            .iter()
            .map(|&id| is_straight_family(graph.edges[id as usize].template_id));
        let first = families.next().unwrap();
        assert!(
            families.all(|is_straight| is_straight == first),
            "node {node_id} is touched by both a straight-family and an arc-family edge \
             (edges: {edge_ids:?}) -- if this fails, families now interconnect and Task 4's \
             lane model should be revisited"
        );
    }
}
