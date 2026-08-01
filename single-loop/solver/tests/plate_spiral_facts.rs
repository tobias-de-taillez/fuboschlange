//! The structural facts `circuit`'s constructed patterns are built on,
//! measured against the real certified graph rather than derived from the
//! template table.
//!
//! This file exists because "structural impossibilities" in this project keep
//! turning out to be probe bugs or fixed-parameter artefacts. The first three
//! tests are what the Schnecke rests on; the rest are what the edge band
//! rests on, and one of them — `a_four_lane_band_cannot_put_two_reverses_at_
//! one_end` — is a genuine impossibility that killed the band's first design.
//! If a plate-layer change breaks one, the failure should read as "the plate
//! no longer admits X" here, not as a confusing walk failure three modules
//! away.
//!
//! Fixture: the 3000 × 2400 room every other `circuit_*` file uses.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, LoopGraphView, build_connection_zone, build_graph_view,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform,
    PoseEdge, TemplateId, build_embedded_graph,
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

fn instance() -> PlateInstance {
    PlateInstance::new(
        rect_polygon(),
        transform(),
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .unwrap()
}

fn graph() -> EmbeddedPoseGraph {
    build_embedded_graph(&instance(), 75.0, PlateGraphLimits::default()).unwrap()
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

// ---------------------------------------------------------------------------
// What a lane change costs, and why a four-lane band cannot be laid the
// obvious way
// ---------------------------------------------------------------------------

/// Local-space samples along a primitive, dense enough that the extremes below
/// are read off the real curve rather than off its endpoints.
fn local_samples(instance: &PlateInstance, primitive: &PathPrimitive) -> Vec<Point> {
    let local = instance.transform.primitive_to_local(primitive);
    const STEPS: usize = 400;
    match local {
        PathPrimitive::Line { start, end } => (0..=STEPS)
            .map(|step| {
                let t = step as f64 / STEPS as f64;
                Point::new(
                    start.x + (end.x - start.x) * t,
                    start.y + (end.y - start.y) * t,
                )
            })
            .collect(),
        PathPrimitive::Arc {
            start,
            center,
            radius_mm,
            sweep_rad,
            ..
        } => {
            let start_angle = (start.y - center.y).atan2(start.x - center.x);
            (0..=STEPS)
                .map(|step| {
                    let angle = start_angle + sweep_rad * (step as f64 / STEPS as f64);
                    Point::new(
                        center.x + radius_mm * angle.cos(),
                        center.y + radius_mm * angle.sin(),
                    )
                })
                .collect()
        }
    }
}

/// Every local-space sample of an edge's body.
fn edge_body(instance: &PlateInstance, edge: &PoseEdge) -> Vec<Point> {
    edge.primitives
        .iter()
        .flat_map(|primitive| local_samples(instance, primitive))
        .collect()
}

/// A southbound reverse-family placement well inside the room, so no wall
/// clips its body.
fn interior_reverse<'a>(
    graph: &'a EmbeddedPoseGraph,
    usable: &HashSet<u32>,
    template: TemplateId,
) -> &'a PoseEdge {
    graph
        .edges
        .iter()
        .filter(|edge| usable.contains(&edge.id) && edge.template_id == template)
        .find(|edge| {
            edge.start.local_pose.heading == Heading8::Deg270
                && edge.start.local_pose.point.x > 900.0
                && edge.start.local_pose.point.x < 2100.0
                && (edge.start.local_pose.point.y - 1050.0).abs() < 1e-6
        })
        .expect("a southbound reverse placement in the interior")
}

#[test]
fn a_reverse_crosses_the_lanes_it_spans_at_the_bottom_of_its_own_loop() {
    // Where a turn meets the lanes between its two ends decides whether a band
    // can be laid at all, and it is not where the plan assumed. A reverse does
    // not sweep across the intermediate channels at its endpoints' own height:
    // its body drops almost its whole overhang first and crosses them in a
    // narrow band at the very bottom. That is what leaves room for a lane to
    // end just above it.
    let instance = instance();
    let graph = graph();
    let usable: HashSet<u32> = view(&graph).usable_edges.iter().copied().collect();

    for (template, overhang_mm, west_bulge_mm) in [
        (TemplateId::TeardropReverse, 192.5, 10.0),
        (TemplateId::BroadReverse180, 112.5, 0.0),
    ] {
        let edge = interior_reverse(&graph, &usable, template);
        let start = edge.start.local_pose.point;
        let end = edge.end.local_pose.point;
        let body = edge_body(&instance, edge);
        let min_y = body.iter().map(|p| p.y).fold(f64::MAX, f64::min);
        let max_y = body.iter().map(|p| p.y).fold(f64::MIN, f64::max);
        let min_x = body.iter().map(|p| p.x).fold(f64::MAX, f64::min);
        let max_x = body.iter().map(|p| p.x).fold(f64::MIN, f64::max);

        assert!(
            (start.y - end.y).abs() < 1e-6,
            "{template:?}: both ends sit on the same row"
        );
        assert!(
            (start.y - min_y - overhang_mm).abs() < 0.1 && (max_y - start.y).abs() < 0.1,
            "{template:?}: the body reaches {:.1} mm past the endpoint row, not {overhang_mm}",
            start.y - min_y
        );
        assert!(
            (start.x.min(end.x) - min_x - west_bulge_mm).abs() < 0.1
                && (max_x - start.x.max(end.x)).abs() < 0.1,
            "{template:?}: the body bulges {:.1} mm past the entry column, not {west_bulge_mm}",
            start.x.min(end.x) - min_x
        );

        // The crossing itself: every channel strictly between the two ends is
        // met exactly once, within a millimetre of the deepest point.
        let mut column = start.x.min(end.x) + 75.0;
        while column < start.x.max(end.x) - 1e-6 {
            let rows: Vec<f64> = body
                .iter()
                .filter(|p| (p.x - column).abs() < 1.0)
                .map(|p| p.y)
                .collect();
            assert!(
                !rows.is_empty(),
                "{template:?}: the body never reaches column {column:.1}"
            );
            let deepest = start.y - rows.iter().copied().fold(f64::MIN, f64::max);
            assert!(
                (deepest - (overhang_mm - 0.1)).abs() < 0.5,
                "{template:?}: column {column:.1} is crossed {deepest:.1} mm down, not at the \
                 bottom of the {overhang_mm} mm loop"
            );
            column += 75.0;
        }
    }
}

#[test]
fn two_reverses_one_channel_apart_need_two_rows_of_stagger() {
    // The band's two same-end turns are congruent teardrops one channel apart.
    // Flush, or one row apart, they touch. Two rows apart they clear each
    // other with room to spare. There is nothing in between: placements along
    // a column come at 150 mm.
    let instance = instance();
    let graph = graph();
    let usable: HashSet<u32> = view(&graph).usable_edges.iter().copied().collect();

    let mut by_column: BTreeMap<i64, BTreeMap<i64, u32>> = BTreeMap::new();
    for edge in &graph.edges {
        if !usable.contains(&edge.id) || edge.template_id != TemplateId::TeardropReverse {
            continue;
        }
        let (start, end) = (edge.start.local_pose, edge.end.local_pose);
        if start.heading != Heading8::Deg270 || (end.point.x - start.point.x - 150.0).abs() > 1e-6 {
            continue;
        }
        by_column
            .entry((start.point.x * 10.0).round() as i64)
            .or_default()
            .insert((start.point.y * 10.0).round() as i64, edge.id);
    }

    let west = &by_column[&10_125]; // x = 1012.5 mm
    let east = &by_column[&10_875]; // one channel east
    let pitch: BTreeSet<i64> = west
        .keys()
        .zip(west.keys().skip(1))
        .map(|(low, high)| high - low)
        .collect();
    assert_eq!(
        pitch,
        BTreeSet::from([1500]),
        "reverse placements come every 150 mm along a column, so the stagger is quantised"
    );

    let anchor = 10_500i64; // y = 1050 mm
    let west_body = edge_body(
        &instance,
        graph
            .edges
            .iter()
            .find(|edge| edge.id == west[&anchor])
            .unwrap(),
    );
    let mut clearances: Vec<(f64, f64)> = Vec::new();
    for (row, id) in east {
        let delta = (row - anchor) as f64 / 10.0;
        if delta.abs() > 300.5 {
            continue;
        }
        let other = edge_body(
            &instance,
            graph.edges.iter().find(|edge| edge.id == *id).unwrap(),
        );
        let mut min = f64::MAX;
        for a in &west_body {
            for b in &other {
                min = min.min(((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt());
            }
        }
        clearances.push((delta, min));
    }

    for (delta, min) in &clearances {
        if delta.abs() <= 150.0 {
            assert!(
                *min < 1.0,
                "two teardrops one channel apart and {delta} mm of stagger already touch \
                 ({min:.1} mm), so a smaller stagger cannot help"
            );
        } else {
            assert!(
                *min > 100.0,
                "at {delta} mm of stagger the two teardrops must clear each other; got {min:.1} mm"
            );
        }
    }
    assert_eq!(clearances.len(), 5, "deltas -300, -150, 0, +150, +300");
}

#[test]
fn a_four_lane_band_cannot_put_two_reverses_at_one_end() {
    // The two facts above, put together — and the reason the plan this file
    // was written for does not survive contact with the plate.
    //
    // Four lanes one channel apart, one circuit, both ends at the same
    // manifold. The reachability graph over {0,1,2,3} with reverse-family
    // steps (±2, ±3) has exactly one Hamiltonian path up to reversal,
    // 2-0-3-1, so three lane changes are spread over two ends of the run and
    // two of them share an end. Those two are always the ±2 steps, and they
    // always straddle a lane the other one walks.
    //
    // Let A and B be the rows the two same-end turns sit on:
    //
    //   the turn spanning lanes 1..3 crosses lane 2 at A − 192.4, and lane 2
    //   runs from B up   ⇒  A < B + 142.4   (192.4 minus the 50 mm nominal)
    //   the turn spanning lanes 0..2 crosses lane 1 at B − 192.4, and lane 1
    //   runs from A up   ⇒  B < A + 142.4
    //   the two teardrop bodies themselves ⇒  |A − B| ≥ 300
    //
    // 300 ≤ |A − B| < 142.4 is empty. No stagger exists. A four-lane 75 mm
    // band therefore needs a lane change the reverse family does not
    // provide — see the next test.
    const CROSSING_DEPTH_MM: f64 = 192.4;
    const NOMINAL_SPACING_MM: f64 = 50.0;
    const REQUIRED_STAGGER_MM: f64 = 300.0;

    let lane_window_mm = CROSSING_DEPTH_MM - NOMINAL_SPACING_MM;
    assert!(
        REQUIRED_STAGGER_MM > lane_window_mm,
        "if the two turns ever fit ({REQUIRED_STAGGER_MM} mm of stagger inside a \
         {lane_window_mm} mm window), this whole argument is void and the band should be \
         built the obvious way"
    );
}

#[test]
fn a_one_channel_uturn_exists_only_as_a_three_edge_chain() {
    // The way out, and its price. No single edge reverses across one channel
    // — `the_reverse_family_spans_two_channels_or_three_and_never_one` — but
    // three chained edges do. The chain is not free: its body swings 225 mm
    // sideways, three channels, past both of the columns it joins. A band
    // using it must therefore have that much room on the side it swings to,
    // which the innermost lane pair has (the open room) and the outermost
    // pair does not (the wall).
    let instance = instance();
    let graph = graph();
    let usable: HashSet<u32> = view(&graph).usable_edges.iter().copied().collect();
    let mut by_start: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (position, edge) in graph.edges.iter().enumerate() {
        if usable.contains(&edge.id) {
            by_start.entry(edge.start.id).or_default().push(position);
        }
    }
    let start = graph
        .nodes
        .iter()
        .find(|node| {
            node.local_pose.heading == Heading8::Deg270
                && (node.local_pose.point.x - 1462.5).abs() < 1e-6
                && (node.local_pose.point.y - 1200.0).abs() < 1e-6
        })
        .expect("an interior southbound node");

    let mut swings: BTreeMap<i64, Vec<(f64, Vec<TemplateId>)>> = BTreeMap::new();
    for a in by_start.get(&start.id).map(Vec::as_slice).unwrap_or(&[]) {
        for b in by_start
            .get(&graph.edges[*a].end.id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            for c in by_start
                .get(&graph.edges[*b].end.id)
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                let end = graph.edges[*c].end.local_pose;
                if end.heading != Heading8::Deg90 {
                    continue;
                }
                let shift = ((end.point.x - start.local_pose.point.x) / 75.0).round() as i64;
                if shift.abs() != 1 {
                    continue;
                }
                let body: Vec<Point> = [*a, *b, *c]
                    .iter()
                    .flat_map(|position| edge_body(&instance, &graph.edges[*position]))
                    .collect();
                let min_x = body.iter().map(|p| p.x).fold(f64::MAX, f64::min);
                let max_x = body.iter().map(|p| p.x).fold(f64::MIN, f64::max);
                let (low, high) = (
                    start.local_pose.point.x.min(end.point.x),
                    start.local_pose.point.x.max(end.point.x),
                );
                // Positive to the east, negative to the west.
                let swing = if max_x - high > low - min_x {
                    max_x - high
                } else {
                    min_x - low
                };
                let templates: Vec<TemplateId> = [*a, *b, *c]
                    .iter()
                    .map(|position| graph.edges[*position].template_id)
                    .collect();
                swings.entry(shift).or_default().push((swing.abs(), templates));
            }
        }
    }
    for widths in swings.values_mut() {
        widths.sort_by(|left, right| left.0.partial_cmp(&right.0).unwrap());
    }

    assert_eq!(
        swings.keys().copied().collect::<BTreeSet<i64>>(),
        BTreeSet::from([-1, 1]),
        "a one-channel U-turn is reachable in three edges, both ways"
    );

    // Westward, the narrowest is three chained reverses and swings barely more
    // than one channel — compact enough that a band's lane change costs the
    // neighbouring lane nothing but a staggered end.
    let (west_swing, west_chain) = &swings[&-1][0];
    assert!(
        (west_swing - 85.0).abs() < 1.0,
        "the narrowest westward U-turn swings {west_swing:.1} mm, not 85"
    );
    assert_eq!(
        west_chain,
        &vec![
            TemplateId::TeardropReverse,
            TemplateId::BroadReverse180,
            TemplateId::TeardropReverse
        ],
        "it is three chained reverses: -150, +225, -150 mm"
    );

    // Eastward from the same southbound pose the graph offers no such chain;
    // the narrowest swings three channels. A band therefore turns westward at
    // whichever end it can, and pays the wide swing at the other.
    let (east_swing, _) = &swings[&1][0];
    assert!(
        (east_swing - 225.0).abs() < 1.0,
        "the narrowest eastward U-turn swings {east_swing:.1} mm, not 225"
    );
}
