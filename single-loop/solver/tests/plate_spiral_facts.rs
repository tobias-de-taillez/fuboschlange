//! The three structural facts `circuit::schnecke` is built on, measured
//! against the real certified graph rather than derived from the template
//! table.
//!
//! This file exists because three "structural impossibilities" in this project
//! turned out to be probe bugs or fixed-parameter artefacts. The Schnecke's
//! construction rests on exactly these three properties of the plate; if a
//! plate-layer change breaks one, the failure should read as "the plate no
//! longer admits X" here, not as a confusing walk failure three modules away.
//!
//! Fixture: the 3000 × 2400 room every other `circuit_*` file uses.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, LoopGraphView, build_connection_zone, build_graph_view,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    TemplateId, build_embedded_graph,
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

/// Channel index of a plate-local coordinate, or `None` off-lattice.
fn channel_index(value_mm: f64) -> Option<i64> {
    let steps = (value_mm - 37.5) / 75.0;
    ((steps - steps.round()).abs() < 1e-6).then(|| steps.round() as i64)
}

/// The coordinate a heading holds constant: the row for east/west, the column
/// for north/south.
fn channel_of(point: Point, heading: Heading8) -> Option<f64> {
    match heading {
        Heading8::Deg0 | Heading8::Deg180 => Some(point.y),
        Heading8::Deg90 | Heading8::Deg270 => Some(point.x),
        _ => None,
    }
}

#[test]
fn the_reverse_family_spans_two_channels_or_three_and_never_one() {
    // The turn-around's span is what forces the Schnecke's innermost gap to be
    // widened away from the requested pipe spacing: at 75 mm the two arms are
    // one channel apart, and no reverse-family placement bridges one channel.
    // It could not: a 75 mm U is a 37.5 mm bend radius against an 80 mm floor.
    let graph = graph();
    let view = view(&graph);
    let usable: HashSet<u32> = view.usable_edges.iter().copied().collect();

    let mut spans: BTreeMap<(TemplateId, i64), usize> = BTreeMap::new();
    for edge in &graph.edges {
        if !usable.contains(&edge.id)
            || !matches!(
                edge.template_id,
                TemplateId::TeardropReverse | TemplateId::BroadReverse180
            )
        {
            continue;
        }
        let (Some(start), Some(end)) = (
            channel_of(edge.start.local_pose.point, edge.start.local_pose.heading),
            channel_of(edge.end.local_pose.point, edge.end.local_pose.heading),
        ) else {
            continue;
        };
        let (Some(from), Some(to)) = (channel_index(start), channel_index(end)) else {
            continue;
        };
        *spans.entry((edge.template_id, to - from)).or_default() += 1;
    }

    let teardrop: BTreeSet<i64> = spans
        .keys()
        .filter(|(template, _)| *template == TemplateId::TeardropReverse)
        .map(|(_, span)| *span)
        .collect();
    let broad: BTreeSet<i64> = spans
        .keys()
        .filter(|(template, _)| *template == TemplateId::BroadReverse180)
        .map(|(_, span)| *span)
        .collect();
    assert_eq!(
        teardrop,
        BTreeSet::from([-2, 2]),
        "TeardropReverse bridges exactly two channels (150 mm), either way"
    );
    assert_eq!(
        broad,
        BTreeSet::from([-3, 3]),
        "BroadReverse180 bridges exactly three channels (225 mm), either way"
    );
}

#[test]
fn a_corner_joins_any_two_channels_of_its_own_parity_class() {
    // This is what lets a rectangular spiral step inward without any lateral
    // shift along a side: the corner is free to leave one ring's column and
    // arrive on the *next* ring's row. The parity classes below are what makes
    // the inward arm's step an even number of channels.
    let graph = graph();
    let view = view(&graph);
    let usable: HashSet<u32> = view.usable_edges.iter().copied().collect();

    let mut parities: BTreeMap<(Heading8, Heading8), BTreeSet<i64>> = BTreeMap::new();
    let mut placements: BTreeMap<(Heading8, Heading8), BTreeSet<(i64, i64)>> = BTreeMap::new();
    for edge in &graph.edges {
        if !usable.contains(&edge.id) || edge.template_id != TemplateId::BroadTurn90 {
            continue;
        }
        let (Some(entry), Some(exit)) = (
            channel_of(edge.start.local_pose.point, edge.start.local_pose.heading),
            channel_of(edge.end.local_pose.point, edge.end.local_pose.heading),
        ) else {
            continue;
        };
        let (Some(from), Some(to)) = (channel_index(entry), channel_index(exit)) else {
            continue;
        };
        let headings = (edge.start.local_pose.heading, edge.end.local_pose.heading);
        parities
            .entry(headings)
            .or_default()
            .insert((to - from).rem_euclid(2));
        placements.entry(headings).or_default().insert((from, to));
    }

    // Every heading pair admits exactly one parity of channel difference —
    // never both. A corner therefore fixes the parity relation between the two
    // sides it joins, and the four corners of a revolution compose to "the
    // next revolution's row has the same parity as this one".
    for (headings, seen) in &parities {
        assert_eq!(
            seen.len(),
            1,
            "corner {headings:?} admits both parities of channel difference"
        );
    }
    let same: BTreeSet<(Heading8, Heading8)> = parities
        .iter()
        .filter(|(_, seen)| seen.contains(&0))
        .map(|(headings, _)| *headings)
        .collect();
    assert_eq!(
        same,
        BTreeSet::from([
            (Heading8::Deg0, Heading8::Deg90),
            (Heading8::Deg90, Heading8::Deg0),
            (Heading8::Deg180, Heading8::Deg270),
            (Heading8::Deg270, Heading8::Deg180),
        ]),
        "these four corners join channels of equal parity; the other four flip it"
    );

    // And the second arm's corners exist: inset one channel on every side, a
    // corner's (entry, exit) pair moves diagonally by (+1, +1) or (+1, -1)
    // depending on the side, and the overwhelming majority of placements have
    // that twin. (Not all: the outermost placements have no room for one.)
    for (headings, pairs) in &placements {
        let twin = if same.contains(headings) { 1 } else { -1 };
        let with_twin = pairs
            .iter()
            .filter(|(from, to)| pairs.contains(&(from + 1, to + twin)))
            .count();
        assert!(
            with_twin * 10 >= pairs.len() * 9,
            "corner {headings:?}: only {with_twin} of {} placements have their \
             one-channel-inward twin",
            pairs.len()
        );
    }
}

#[test]
fn no_chain_of_certified_edges_shifts_a_run_sideways_by_one_channel() {
    // The plan this construction replaced assumed a side-borne S-shift of two
    // `BroadTurn45` moved a run 150 mm sideways while preserving its heading.
    // Nothing of the sort is reachable: within four edges the smallest
    // direction-preserving lateral shift that uses no reverse-family edge is
    // 300 mm, and it is a `BroadTurn90` pair, not a `BroadTurn45` pair. The
    // Schnecke needs no such shift at all — its corners absorb the step — and
    // this test is what says so, so nobody rebuilds the S-shift theory.
    let graph = graph();
    let view = view(&graph);
    let usable: HashSet<u32> = view.usable_edges.iter().copied().collect();
    let mut by_start: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (position, edge) in graph.edges.iter().enumerate() {
        if usable.contains(&edge.id) {
            by_start.entry(edge.start.id).or_default().push(position);
        }
    }

    // Start deep inside the room so no wall truncates the answer.
    let start = graph
        .nodes
        .iter()
        .find(|node| {
            node.local_pose.heading == Heading8::Deg0
                && (node.local_pose.point.x - 1050.0).abs() < 1e-6
                && (node.local_pose.point.y - 1087.5).abs() < 1e-6
        })
        .expect("the fixture has an interior east-running node here");

    let mut frontier: Vec<(u32, bool)> = vec![(start.id, false)];
    let mut turns_only_shifts: BTreeSet<i64> = BTreeSet::new();
    for depth in 1..=4usize {
        let mut next: Vec<(u32, bool)> = Vec::new();
        let mut seen: BTreeSet<u32> = BTreeSet::new();
        for (node_id, used_reverse) in &frontier {
            for position in by_start.get(node_id).map(Vec::as_slice).unwrap_or(&[]) {
                let edge = &graph.edges[*position];
                let used_reverse = *used_reverse
                    || matches!(
                        edge.template_id,
                        TemplateId::TeardropReverse | TemplateId::BroadReverse180
                    );
                if edge.end.local_pose.heading == Heading8::Deg0 && !used_reverse {
                    let shift =
                        ((edge.end.local_pose.point.y - start.local_pose.point.y) / 75.0).round();
                    if shift != 0.0 {
                        turns_only_shifts.insert(shift as i64);
                    }
                }
                if depth < 4 && seen.insert(edge.end.id) {
                    next.push((edge.end.id, used_reverse));
                }
            }
        }
        frontier = next;
    }

    let smallest = turns_only_shifts
        .iter()
        .map(|shift| shift.abs())
        .min()
        .expect("some direction-preserving lateral shift is reachable");
    assert_eq!(
        smallest, 4,
        "the smallest reverse-free direction-preserving lateral shift is four channels \
         (300 mm), not two; reachable shifts were {turns_only_shifts:?}"
    );
}
