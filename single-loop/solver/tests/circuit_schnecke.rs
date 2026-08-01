//! The Schnecke, end to end, judged by the independent validator.
//!
//! Same discipline as `circuit_loop_end_to_end.rs`: everything here comes out
//! of the real pipeline — `PlateInstance` → `build_embedded_graph` →
//! `build_connection_zone` → `build_graph_view` → `build_schnecke` →
//! `attach_port` ×2 — assembled into a `LoopCandidate` and handed to
//! `certify_loop`. Nothing in this file chooses which certified edges to
//! chain, in what order, or in which direction.
//!
//! The room is the user's own: 3000 × 2400 on BEKOTEC-EN 23 FI 30 plates, at
//! the 75 mm pipe spacing they plan to lay.

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, Field, Lane, LoopCandidate, LoopContext, LoopGraphView,
    LoopSection, RectMm, SectionKind, SpiralPath, attach_port, build_connection_zone,
    build_graph_view, build_schnecke, certify_loop, filter_zone_nopps,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, PoseEdge,
    PoseNode, build_embedded_graph,
};
use std::collections::BTreeMap;

const ROOM_WIDTH_MM: f64 = 3000.0;
const ROOM_HEIGHT_MM: f64 = 2400.0;
const PIPE_SPACING_MM: f64 = 75.0;
const WALL_CLEARANCE_MM: f64 = 75.0;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn rect_polygon() -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(ROOM_WIDTH_MM, 0.0),
        point(ROOM_WIDTH_MM, ROOM_HEIGHT_MM),
        point(0.0, ROOM_HEIGHT_MM),
    ])
    .unwrap()
}

fn transform() -> PlateTransform {
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(ROOM_WIDTH_MM, 0.0),
        point(ROOM_WIDTH_MM / 2.0, ROOM_HEIGHT_MM / 2.0),
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
            max: point(ROOM_WIDTH_MM, ROOM_HEIGHT_MM),
        },
    }
}

/// The connection zone has to sever the two outermost lanes — that is where
/// the two arms start and end — but must leave the third alone, or the inward
/// arm cannot get past it on its way round. With the outermost row
/// `wall_clearance` in and the lanes one spacing apart, that puts the depth
/// strictly between the second and third row.
fn connection(pipe_spacing_mm: f64) -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 1500.0,
        zone_width_mm: 600.0,
        zone_depth_mm: WALL_CLEARANCE_MM + 1.5 * pipe_spacing_mm,
    }
}

struct Pipeline {
    instance: PlateInstance,
    graph: EmbeddedPoseGraph,
    view: LoopGraphView,
    zone: ConnectionZone,
    lanes: Vec<Lane>,
    path: SpiralPath,
}

impl Pipeline {
    fn run() -> Self {
        Self::run_at(PIPE_SPACING_MM)
    }

    fn run_at(pipe_spacing_mm: f64) -> Self {
        let base = PlateInstance::new(
            rect_polygon(),
            transform(),
            PlateProfile::bekotec_en_23_fi_30_16(),
            50_000,
        )
        .unwrap();
        let graph = build_embedded_graph(&base, WALL_CLEARANCE_MM, PlateGraphLimits::default())
            .expect("the fixture room must have a certified pose graph");
        let zone =
            build_connection_zone(&rect_polygon(), &transform(), &connection(pipe_spacing_mm))
                .expect("the fixture connection must be valid");
        let view = build_graph_view(&graph, &zone, &transform());
        let mut instance = base;
        filter_zone_nopps(&mut instance, &zone);
        let schnecke = match build_schnecke(
            &field(),
            pipe_spacing_mm,
            WALL_CLEARANCE_MM,
            &graph,
            &view,
            &zone,
            &instance,
        ) {
            Ok(schnecke) => schnecke,
            Err(error) => panic!("{:?}: {}", error.code, error.message),
        };
        Self {
            instance,
            graph,
            view,
            zone,
            lanes: schnecke.lanes,
            path: schnecke.path,
        }
    }

    fn context(&self) -> LoopContext<'_> {
        LoopContext {
            instance: &self.instance,
            graph: &self.graph,
            view: &self.view,
            zone: &self.zone,
            lanes: &self.lanes,
        }
    }

    fn edges_by_id(&self) -> BTreeMap<u32, &PoseEdge> {
        self.graph
            .edges
            .iter()
            .map(|edge| (edge.id, edge))
            .collect()
    }

    fn node(&self, id: u32) -> &PoseNode {
        self.graph
            .nodes
            .iter()
            .find(|node| node.id == id)
            .expect("build_schnecke only ever names real certified nodes")
    }
}

fn reverse_primitive(primitive: &PathPrimitive) -> PathPrimitive {
    match primitive {
        PathPrimitive::Line { start, end } => PathPrimitive::Line {
            start: *end,
            end: *start,
        },
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => PathPrimitive::Arc {
            start: *end,
            end: *start,
            center: *center,
            radius_mm: *radius_mm,
            sweep_rad: -*sweep_rad,
        },
    }
}

/// Turns the Schnecke's path into the flat section list `certify_loop` judges.
/// The only judgement here is bookkeeping: which `SectionKind` each piece
/// carries, and that the exit connector is reversed because the loop traverses
/// it from the anchor to the port while `attach_port` builds it the other way
/// round.
fn assemble(pipeline: &Pipeline) -> LoopCandidate {
    let by_id = pipeline.edges_by_id();
    let path = &pipeline.path;
    let ends = path.ends.expect("a completed Schnecke reaches the zone");

    let entry_connector = attach_port(
        ends.entry_port,
        pipeline.zone.inward,
        pipeline.node(ends.entry_anchor_node_id),
        &pipeline.instance,
    )
    .expect("the entry anchor must be attachable")
    .primitives;
    let exit_connector: Vec<PathPrimitive> = attach_port(
        ends.exit_port,
        pipeline.zone.inward,
        pipeline.node(ends.exit_anchor_node_id),
        &pipeline.instance,
    )
    .expect("the exit anchor must be attachable")
    .primitives
    .iter()
    .rev()
    .map(reverse_primitive)
    .collect();

    let mut sections = vec![LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: entry_connector,
    }];
    let graph_sections = [
        (
            SectionKind::Inward,
            &path.inward_edge_ids,
            &path.inward_lane_ids,
        ),
        (SectionKind::Turn, &path.turn_edge_ids, &Vec::new()),
        (
            SectionKind::Return,
            &path.return_edge_ids,
            &path.return_lane_ids,
        ),
    ];
    for (kind, edge_ids, lane_ids) in graph_sections {
        for (position, edge_id) in edge_ids.iter().enumerate() {
            let reported = lane_ids.get(position).copied().flatten();
            let (kind, lane_id) = match reported {
                Some(ring) => (kind, Some(ring)),
                // A lane change belongs to no ring; `Hop` is the section kind
                // for exactly that. The turn block reports no lane either, but
                // it is the Kehre, not a lane change.
                None if kind == SectionKind::Turn => (kind, None),
                None => (SectionKind::Hop, None),
            };
            sections.push(LoopSection {
                kind,
                edge_id: Some(*edge_id),
                lane_id,
                primitives: by_id[edge_id].primitives.clone(),
            });
        }
    }
    sections.push(LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: exit_connector,
    });
    LoopCandidate { sections }
}

/// Nesting gaps between consecutive lanes, in channels, outermost first.
fn lane_gaps(pipeline: &Pipeline) -> Vec<i64> {
    pipeline
        .lanes
        .windows(2)
        .map(|pair| {
            let step = pair[1].rect_local.min.y - pair[0].rect_local.min.y;
            (step / 75.0).round() as i64
        })
        .collect()
}

#[test]
fn the_schnecke_certifies() {
    let pipeline = Pipeline::run();
    let candidate = assemble(&pipeline);
    let certificate = match certify_loop(&candidate, &pipeline.context()) {
        Ok(certificate) => certificate,
        Err(error) => panic!("{error:#?}"),
    };

    assert!(certificate.edge_provenance_ok);
    assert!(certificate.pattern_provenance_ok);
    assert!(certificate.zone_automaton_ok);
    assert!(
        certificate.min_bend_radius_mm >= 80.0,
        "min bend radius {}",
        certificate.min_bend_radius_mm
    );
    assert_eq!(
        certificate.penalty_sum_mm, 0.0,
        "the Schnecke holds the full 50 mm nominal distance everywhere"
    );
    assert!(
        certificate.total_length_mm > 0.0 && certificate.total_length_mm <= 100_000.0,
        "total length {}",
        certificate.total_length_mm
    );
    // Pinned so a construction change that quietly shortens the loop is
    // visible rather than merely still-certifying. 67.4 m of 16 mm pipe in a
    // 7.2 m^2 room at 75 mm spacing.
    assert!(
        (certificate.total_length_mm - 67_421.0).abs() < 50.0,
        "total length {}",
        certificate.total_length_mm
    );
}

#[test]
fn the_two_arms_interleave_at_the_pipe_spacing_and_part_only_for_the_turn() {
    // The whole no-crossing argument: one nesting sequence, one lane per arm
    // alternating, every gap the requested spacing except the innermost, which
    // is the turn-around's own span (three channels at 75 mm, because the
    // reverse family bridges two channels or three and the arms are an odd
    // number of channels apart).
    let pipeline = Pipeline::run();
    let gaps = lane_gaps(&pipeline);
    assert_eq!(
        pipeline.lanes.len(),
        11,
        "this room nests eleven lanes at 75 mm before the turn runs out of room"
    );
    let (innermost, outer) = gaps.split_last().expect("eleven lanes have ten gaps");
    assert!(
        outer.iter().all(|gap| *gap == 1),
        "every gap but the innermost is one channel (75 mm); gaps {gaps:?}"
    );
    assert_eq!(
        *innermost, 3,
        "the innermost gap is the turn-around's 225 mm span; gaps {gaps:?}"
    );

    // Strictly nested, so no two lanes can touch.
    for pair in pipeline.lanes.windows(2) {
        let (outer, inner) = (&pair[0].rect_local, &pair[1].rect_local);
        assert!(
            inner.min.x > outer.min.x
                && inner.min.y > outer.min.y
                && inner.max.x < outer.max.x
                && inner.max.y < outer.max.y,
            "lane {} is not strictly inside lane {}",
            pair[1].id,
            pair[0].id
        );
    }
}

#[test]
fn the_inward_arm_walks_the_even_lanes_and_the_return_the_odd_ones() {
    let pipeline = Pipeline::run();
    let walked = |lane_ids: &[Option<u32>]| {
        let mut walked: Vec<u32> = Vec::new();
        for lane_id in lane_ids.iter().flatten() {
            if walked.last() != Some(lane_id) {
                walked.push(*lane_id);
            }
        }
        walked
    };
    assert_eq!(
        walked(&pipeline.path.inward_lane_ids),
        vec![0, 2, 4, 6, 8, 10],
        "the inward arm steps outermost-in by two"
    );
    assert_eq!(
        walked(&pipeline.path.return_lane_ids),
        vec![9, 7, 5, 3, 1],
        "the return arm steps innermost-out by two, through the lanes the arm reserved"
    );
}

#[test]
fn the_turn_is_a_single_certified_reverse() {
    let pipeline = Pipeline::run();
    let by_id = pipeline.edges_by_id();
    assert_eq!(
        pipeline.path.turn_edge_ids.len(),
        1,
        "a Schnecke turns around exactly once"
    );
    let turn = by_id[&pipeline.path.turn_edge_ids[0]];
    assert_eq!(
        turn.template_id,
        single_loop_solver::plate::TemplateId::BroadReverse180,
        "at an odd-channel pipe spacing only the 225 mm reverse has the right parity"
    );
}

#[test]
fn the_other_spacings_on_the_ladder_certify_too() {
    // The user plans 75 mm but reserved the right to deviate, and the spec's
    // escalation ladder walks {75, 150, 225, 300}. Each spacing takes a
    // different turn-around — two channels when the spacing is an even number
    // of channels, three when it is odd — so each is its own path through the
    // construction and each needs its own end-to-end run.
    for spacing_mm in [150.0, 225.0, 300.0] {
        let pipeline = Pipeline::run_at(spacing_mm);
        let candidate = assemble(&pipeline);
        let certificate = match certify_loop(&candidate, &pipeline.context()) {
            Ok(certificate) => certificate,
            Err(error) => panic!("spacing {spacing_mm} mm: {error:#?}"),
        };
        assert!(
            certificate.min_bend_radius_mm >= 80.0,
            "spacing {spacing_mm} mm: min bend radius {}",
            certificate.min_bend_radius_mm
        );
        assert!(
            certificate.total_length_mm > 0.0 && certificate.total_length_mm <= 100_000.0,
            "spacing {spacing_mm} mm: total length {}",
            certificate.total_length_mm
        );

        let gaps = lane_gaps(&pipeline);
        let (innermost, outer) = gaps.split_last().expect("at least two lanes");
        let spacing_channels = (spacing_mm / 75.0).round() as i64;
        assert!(
            outer.iter().all(|gap| *gap == spacing_channels),
            "spacing {spacing_mm} mm: gaps {gaps:?}"
        );
        assert_eq!(
            *innermost,
            if spacing_channels.rem_euclid(2) == 1 {
                3
            } else {
                2
            },
            "spacing {spacing_mm} mm: the innermost gap is the turn's own span; gaps {gaps:?}"
        );
        println!(
            "spacing {spacing_mm:.0} mm: {} lanes, {:.0} mm, worst uncovered point {:.0} mm",
            pipeline.lanes.len(),
            certificate.total_length_mm,
            certificate.coverage.upper_bound_mm,
        );
    }
}
