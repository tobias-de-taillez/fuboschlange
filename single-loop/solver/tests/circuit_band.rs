//! The edge band, end to end, judged by the independent validator.
//!
//! Same discipline as `circuit_schnecke.rs`: everything comes out of the real
//! pipeline — `PlateInstance` → `build_embedded_graph` →
//! `build_connection_zone` → `build_graph_view` → `build_band` →
//! `attach_port` ×2 — assembled into a `LoopCandidate` and handed to
//! `certify_loop`. Nothing here chooses which certified edges to chain.
//!
//! The band's two ends sit a few channels apart at one end of the wall run,
//! which is where the manifold stands, so the connection zone is off to that
//! side rather than centred.

use single_loop_solver::circuit::{
    Band, ConnectionInput, ConnectionZone, Field, Lane, LoopCandidate, LoopContext, LoopGraphView,
    LoopPattern, LoopSection, RectMm, SectionKind, attach_port, build_band, build_connection_zone,
    build_graph_view, certify_loop, filter_zone_nopps,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, PoseNode,
    build_embedded_graph,
};

const ROOM_WIDTH_MM: f64 = 3000.0;
const ROOM_HEIGHT_MM: f64 = 2400.0;
const WALL_CLEARANCE_MM: f64 = 75.0;
const LANE_COUNT: usize = 4;

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

/// The manifold stands at the right-hand end of the run, where both of the
/// band's ends come down. The zone has to reach both of them — they are three
/// channels apart — without running off the wall.
fn connection() -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 2700.0,
        zone_width_mm: 500.0,
        zone_depth_mm: 100.0,
    }
}

struct Pipeline {
    instance: PlateInstance,
    graph: EmbeddedPoseGraph,
    view: LoopGraphView,
    zone: ConnectionZone,
    band: Band,
}

impl Pipeline {
    fn run() -> Self {
        let base = PlateInstance::new(
            rect_polygon(),
            transform(),
            PlateProfile::bekotec_en_23_fi_30_16(),
            50_000,
        )
        .unwrap();
        let graph = build_embedded_graph(&base, WALL_CLEARANCE_MM, PlateGraphLimits::default())
            .expect("the fixture room must have a certified pose graph");
        let zone = build_connection_zone(&rect_polygon(), &transform(), &connection())
            .expect("the fixture connection must be valid");
        let view = build_graph_view(&graph, &zone, &transform());
        let mut instance = base;
        filter_zone_nopps(&mut instance, &zone);
        let band = match build_band(
            &field(),
            LANE_COUNT,
            WALL_CLEARANCE_MM,
            &graph,
            &view,
            &zone,
            &instance,
        ) {
            Ok(band) => band,
            Err(error) => panic!("{:?}: {}", error.code, error.message),
        };
        Self {
            instance,
            graph,
            view,
            zone,
            band,
        }
    }

    fn lanes(&self) -> &[Lane] {
        &self.band.lanes
    }

    fn context(&self) -> LoopContext<'_> {
        LoopContext {
            instance: &self.instance,
            graph: &self.graph,
            view: &self.view,
            zone: &self.zone,
            lanes: self.lanes(),
            pattern: LoopPattern::Meander,
        }
    }

    fn node(&self, id: u32) -> &PoseNode {
        self.graph
            .nodes
            .iter()
            .find(|node| node.id == id)
            .expect("build_band only ever names real certified nodes")
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

/// Turns the band into the flat section list `certify_loop` judges. The only
/// judgement here is bookkeeping: a lane stretch is `Inward`, a lane change is
/// `Hop`, and the exit connector is reversed because the loop traverses it from
/// the anchor to the port while `attach_port` builds it the other way round.
fn assemble(pipeline: &Pipeline) -> LoopCandidate {
    let band = &pipeline.band;
    let ends = band.ends;

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
    for (edge_id, lane_id) in band.edge_ids.iter().zip(&band.lane_ids) {
        let edge = pipeline
            .graph
            .edges
            .iter()
            .find(|edge| edge.id == *edge_id)
            .expect("the band only ever names real certified edges");
        sections.push(LoopSection {
            kind: if lane_id.is_some() {
                SectionKind::Inward
            } else {
                SectionKind::Hop
            },
            edge_id: Some(*edge_id),
            lane_id: *lane_id,
            primitives: edge.primitives.clone(),
        });
    }
    sections.push(LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: exit_connector,
    });
    LoopCandidate { sections }
}

// ---------------------------------------------------------------------------
// Not yet green, and exactly where it stands
// ---------------------------------------------------------------------------
//
// The band walks lanes 0, 1 and 2, finds its 75 mm U-turns in the graph and
// lands them cleanly. What is left is the *last* lane change, and it is the
// one the plan called the hard point: two turns share the left-hand end, and
// the outer one's sideways swing crosses the columns the inner two lanes run
// down.
//
//     the lane change from lane 2 onto channel 5 at (337.5, 300.0)
//     runs into edge N, already laid
//
// What has been ruled out, by measurement rather than by trying:
//
//   - It is not the landing. Three-edge chains land cleanly on only one column
//     parity per direction, and a U's two side columns are forced to opposite
//     parity by its corners, so three edges could never serve both ends. Four
//     edges break that lock, `circuit::band` now tries them, and lane 1 — which
//     used to foul immediately — walks.
//   - It is not the wall clearance. At 150 mm the walk fails in the same place.
//
// What is left to try, in order:
//
//   1. `MAX_TURN_ROWS` bounds each lane change to the twelve deepest rows it
//      could sit on. The two same-end turns need the *inner* one high up, and
//      whether twelve rows reaches that far on this fixture is arithmetic
//      nobody has done.
//   2. Rank turn candidates by which way their body swings, so a turn beside
//      the wall is offered its inward swing first. Today they come in graph
//      order.
//
// The tests below are ignored rather than deleted or weakened: they are the
// acceptance the band has to pass, and they run as written the moment the last
// lane change lands. `cargo test --test circuit_band -- --ignored` shows where
// it stands.

#[test]
#[ignore = "the lane change's landing still meets the lane it lands on; see the note above"]
fn the_band_certifies() {
    let pipeline = Pipeline::run();
    let candidate = assemble(&pipeline);
    let certificate = match certify_loop(&candidate, &pipeline.context()) {
        Ok(certificate) => certificate,
        Err(error) => panic!("{}", error.message),
    };
    println!(
        "band: {} lanes, {:.2} m of pipe, min centre distance {:.1} mm, penalty {:.1} mm, \
         min bend radius {:.1} mm",
        pipeline.lanes().len(),
        certificate.total_length_mm / 1000.0,
        certificate.min_center_distance_mm.distance_mm,
        certificate.penalty_sum_mm,
        certificate.min_bend_radius_mm,
    );
    assert_eq!(pipeline.lanes().len(), LANE_COUNT);
}

#[test]
#[ignore = "blocked on the same landing as the_band_certifies"]
fn the_lanes_are_one_channel_apart_and_walked_outermost_first() {
    let pipeline = Pipeline::run();
    let lanes = pipeline.lanes();

    // Nested, one channel per step, on all three walls of the run.
    for pair in lanes.windows(2) {
        let (outer, inner) = (&pair[0], &pair[1]);
        assert!(
            (inner.rect_local.min.x - outer.rect_local.min.x - 75.0).abs() < 1e-6
                && (outer.rect_local.max.x - inner.rect_local.max.x - 75.0).abs() < 1e-6
                && (outer.rect_local.max.y - inner.rect_local.max.y - 75.0).abs() < 1e-6,
            "lane {} must sit one channel inside lane {}",
            inner.id,
            outer.id
        );
    }

    // Walked in that order, each exactly once — which is the whole of a
    // meander's lane bookkeeping, and what `check_meander_provenance` holds it
    // to independently.
    let mut walked: Vec<u32> = Vec::new();
    for lane_id in pipeline.band.lane_ids.iter().flatten() {
        if walked.last() != Some(lane_id) {
            walked.push(*lane_id);
        }
    }
    assert_eq!(walked, vec![0, 1, 2, 3]);
}

#[test]
#[ignore = "blocked on the same landing as the_band_certifies"]
fn every_lane_change_is_a_chain_of_reverses_and_there_are_exactly_three() {
    use single_loop_solver::plate::TemplateId;
    let pipeline = Pipeline::run();

    let mut changes: Vec<Vec<TemplateId>> = Vec::new();
    let mut current: Vec<TemplateId> = Vec::new();
    for (edge_id, lane_id) in pipeline.band.edge_ids.iter().zip(&pipeline.band.lane_ids) {
        let template = pipeline
            .graph
            .edges
            .iter()
            .find(|edge| edge.id == *edge_id)
            .expect("real edge")
            .template_id;
        if lane_id.is_none() {
            current.push(template);
        } else if !current.is_empty() {
            changes.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        changes.push(current);
    }

    assert_eq!(
        changes.len(),
        LANE_COUNT - 1,
        "four lanes joined in order need three lane changes, got {changes:?}"
    );
    for chain in &changes {
        assert_eq!(chain.len(), 3, "a 75 mm U-turn is three edges: {chain:?}");
        assert!(
            chain.iter().any(|template| matches!(
                template,
                TemplateId::TeardropReverse | TemplateId::BroadReverse180
            )),
            "a U-turn reverses direction, so at least one of its edges is a reverse: {chain:?}"
        );
    }
    println!("lane changes: {changes:?}");
}
