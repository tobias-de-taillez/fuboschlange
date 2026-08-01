//! Task 11a: the whole generator, end to end, judged by the independent
//! validator.
//!
//! Everything here comes out of the real pipeline —
//! `PlateInstance` → `build_embedded_graph` → `build_connection_zone` →
//! `build_graph_view` → `build_lanes` → `plan_inward_arm` → `complete_spiral`
//! → `attach_port` ×2 — assembled into a `LoopCandidate` and handed to
//! `certify_loop`. Nothing in this file chooses which certified edges to
//! chain, in what order, or in which direction; that is exactly what Task 11a
//! moved into `complete_spiral`. Compare `circuit_validate.rs`, whose fixture
//! still makes those choices by hand because it predates this.
//!
//! ## Why a 3000 × 900 room and not the 3000 × 2400 one
//!
//! Two independent constraints pick the room, and both are measured, not
//! preferred:
//!
//! 1. **`certify_loop` has no section kind for a lane-change hop.** A hop
//!    between two rings runs through a free lattice node that belongs to
//!    neither, so `check_section_on_lane` — which requires *both* endpoints of
//!    a graph section's edge to sit on the ring it claims — can never accept
//!    it, and `Turn` is reserved for exactly one reverse-family edge. A
//!    candidate whose arm spans more than one ring therefore cannot be
//!    expressed at all in the validator's own type. Every one of the 38
//!    certifying candidates Task 10 found is likewise a single inward ring
//!    plus a single return ring.
//! 2. **A spiral's two attachment rings must both sit in the zone's anchor
//!    ring.** Ring 1's channel is 337.5 mm from the wall and
//!    `zone::ENTRY_RING_MM` is 150 mm, so the exit anchor only exists once
//!    `zone_depth_mm ≥ 187.5`; at that depth the zone also truncates ring 0
//!    (see `zone.rs`'s own `ENTRY_RING_MM` doc). 300 mm clears both with
//!    margin, matching `circuit_validate.rs`'s fixture.
//!
//! A 3000 × 900 room has exactly two lanes, so `plan_inward_arm` returns
//! `[0]` and reserves `{1}` — the one arm shape the validator can express —
//! without this file constraining the search. The room is a real room; the
//! lane arithmetic that produces two rings from it is pinned below so a
//! `fields.rs` change that silently turns it into three fails here rather
//! than confusing the loop assertions.

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, Field, Lane, LoopCandidate, LoopContext, LoopGraphView,
    LoopSection, RectMm, SectionKind, SpiralPath, attach_port, build_connection_zone,
    build_graph_view, build_lanes, certify_loop, complete_spiral, filter_zone_nopps,
    plan_inward_arm,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, PoseEdge,
    PoseNode, build_embedded_graph,
};
use std::collections::BTreeMap;

const ROOM_WIDTH_MM: f64 = 3000.0;
const ROOM_HEIGHT_MM: f64 = 900.0;
/// The room every other `circuit_*` file uses. Seven lanes, so the arm spans
/// four rings -- used only by
/// [`a_multi_ring_arm_cannot_be_expressed_as_a_loop_candidate_at_all`].
const TALL_ROOM_HEIGHT_MM: f64 = 2400.0;
const SPACING_MM: f64 = 150.0;
const WALL_CLEARANCE_MM: f64 = 75.0;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn rect_polygon(height_mm: f64) -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(ROOM_WIDTH_MM, 0.0),
        point(ROOM_WIDTH_MM, height_mm),
        point(0.0, height_mm),
    ])
    .unwrap()
}

fn transform(height_mm: f64) -> PlateTransform {
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(ROOM_WIDTH_MM, 0.0),
        point(ROOM_WIDTH_MM / 2.0, height_mm / 2.0),
        0.0,
        0.0,
    )
    .unwrap()
}

fn field(height_mm: f64) -> Field {
    Field {
        id: 0,
        rect_local: RectMm {
            min: point(0.0, 0.0),
            max: point(ROOM_WIDTH_MM, height_mm),
        },
    }
}

/// The connection: off-centre so the zone leaves ring 0 a usable arc on one
/// side rather than halving it, and 300 mm deep so ring 1 falls inside the
/// zone's 150 mm anchor ring (see the module doc).
fn connection() -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 2100.0,
        zone_width_mm: 600.0,
        zone_depth_mm: 300.0,
    }
}

/// Lane 1 segment 0: the doorway segment, the first ring the spiral ever
/// reserves. Same convention as `circuit_spiral_arm.rs`/`circuit_spiral_
/// return.rs`.
const ZONE_SEGMENT: (u32, u32) = (1, 0);

struct Pipeline {
    instance: PlateInstance,
    graph: EmbeddedPoseGraph,
    view: LoopGraphView,
    zone: ConnectionZone,
    lanes: Vec<Lane>,
}

impl Pipeline {
    /// Every stage the brief names, in order, with nothing hand-supplied.
    fn run() -> Self {
        Self::run_in(ROOM_HEIGHT_MM)
    }

    fn run_in(height_mm: f64) -> Self {
        let base = PlateInstance::new(
            rect_polygon(height_mm),
            transform(height_mm),
            PlateProfile::bekotec_en_23_fi_30_16(),
            50_000,
        )
        .unwrap();
        let graph = build_embedded_graph(&base, WALL_CLEARANCE_MM, PlateGraphLimits::default())
            .expect("the fixture room must have a certified pose graph");
        let zone = build_connection_zone(
            &rect_polygon(height_mm),
            &transform(height_mm),
            &connection(),
        )
        .expect("the fixture connection must be valid");
        let view = build_graph_view(&graph, &zone, &transform(height_mm));
        let lanes = build_lanes(
            &field(height_mm),
            SPACING_MM,
            &graph,
            &view,
            &transform(height_mm),
            WALL_CLEARANCE_MM,
        )
        .expect("the fixture field must decompose into lanes");
        let mut instance = base;
        filter_zone_nopps(&mut instance, &zone);
        Self {
            instance,
            graph,
            view,
            zone,
            lanes,
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
            .expect("complete_spiral only ever names real certified nodes")
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

/// What to put in a lane-change hop's `lane_id`. `complete_spiral` reports
/// `None` -- a hop belongs to no ring -- and `LoopSection` has no third
/// option, so these two are the whole space a caller can choose from.
#[derive(Clone, Copy, PartialEq)]
enum HopLabelling {
    /// The hop names no ring, as the generator reports it.
    AsReported,
    /// The most generous alternative: the hop claims the ring it departed.
    DepartingRing,
}

/// Turns `path` into the flat section list `certify_loop` judges.
///
/// The only judgement in here is bookkeeping: which `SectionKind` each piece
/// carries, and that the exit connector is reversed because the loop traverses
/// it from the anchor to the port while `attach_port` builds it the other way
/// round. Which edges, in which order and direction, and which anchors —
/// all of that comes out of `complete_spiral`.
fn assemble(pipeline: &Pipeline, path: &SpiralPath, hops: HopLabelling) -> LoopCandidate {
    let by_id = pipeline.edges_by_id();
    let ends = path.ends.expect("a completed spiral must reach the zone");

    let entry_connector = attach_port(
        ends.entry_port,
        pipeline.zone.inward,
        pipeline.node(ends.entry_anchor_node_id),
        &pipeline.instance,
    )
    .expect("complete_spiral only chooses anchors attach_port certifies")
    .primitives;
    let exit_connector: Vec<PathPrimitive> = attach_port(
        ends.exit_port,
        pipeline.zone.inward,
        pipeline.node(ends.exit_anchor_node_id),
        &pipeline.instance,
    )
    .expect("complete_spiral only chooses anchors attach_port certifies")
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
        let mut departing_ring: Option<u32> = None;
        for (position, edge_id) in edge_ids.iter().enumerate() {
            let reported = lane_ids.get(position).copied().flatten();
            if reported.is_some() {
                departing_ring = reported;
            }
            let lane_id = match (reported, hops) {
                (Some(ring), _) => Some(ring),
                (None, HopLabelling::AsReported) => None,
                (None, HopLabelling::DepartingRing) => departing_ring,
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

#[test]
fn the_generator_produces_a_loop_the_validator_certifies() {
    let pipeline = Pipeline::run();

    // The fixture's own lane arithmetic, pinned so a `fields.rs` change that
    // alters it is visible here rather than as a confusing loop failure.
    assert_eq!(
        pipeline.lanes.len(),
        2,
        "a 3000 x 900 room at spacing 150 has exactly two contour rings"
    );

    let arm = plan_inward_arm(
        &pipeline.lanes,
        ZONE_SEGMENT,
        SPACING_MM,
        &pipeline.graph,
        100_000,
    )
    .expect("the inward arm search must succeed on the fixture room");
    assert_eq!(arm.lane_sequence, vec![0]);

    let path = complete_spiral(
        &arm,
        &pipeline.lanes,
        &pipeline.graph,
        &pipeline.view,
        &pipeline.zone,
        &pipeline.instance,
    )
    .expect("complete_spiral must produce a chained, attachable path");

    let candidate = assemble(&pipeline, &path, HopLabelling::AsReported);
    let certificate = certify_loop(&candidate, &pipeline.context())
        .expect("the pipeline's own loop must certify");

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
        "the generated loop holds the full 50 mm nominal distance everywhere"
    );
    // The catalogue-wide minimum, inside the certified `TeardropReverse` where
    // its own loop passes ring 1's channel -- the same constant
    // `circuit_validate.rs` pins for its hand-built fixture, reached here by
    // the generator. See that file's
    // `no_certified_template_breaches_the_touching_floor` for the sweep.
    assert!(
        (certificate.min_center_distance_mm.distance_mm - CATALOGUE_FLOOR_MM).abs() < 1e-6,
        "min centre distance {}",
        certificate.min_center_distance_mm.distance_mm
    );
    assert!(
        (certificate.total_length_mm - 4234.0).abs() < 1.0,
        "total length {}",
        certificate.total_length_mm
    );
    assert!(
        certificate.total_length_mm > 0.0 && certificate.total_length_mm <= 100_000.0,
        "total length {}",
        certificate.total_length_mm
    );
}

#[test]
fn the_generated_loop_is_the_longest_one_this_room_admits() {
    // `complete_spiral` walks each ring as far as the ring allows before
    // handing over, so the arm and the return are both maximal rather than
    // "some arc that happened to work". Pinned as exact edge counts: a change
    // that quietly shortens either arm still certifies, and would otherwise be
    // invisible.
    let pipeline = Pipeline::run();
    let arm = plan_inward_arm(
        &pipeline.lanes,
        ZONE_SEGMENT,
        SPACING_MM,
        &pipeline.graph,
        100_000,
    )
    .unwrap();
    let path = complete_spiral(
        &arm,
        &pipeline.lanes,
        &pipeline.graph,
        &pipeline.view,
        &pipeline.zone,
        &pipeline.instance,
    )
    .unwrap();

    assert_eq!(
        path.inward_edge_ids.len(),
        8,
        "ring 0's arc: 8 of its 10 certified edges — the 2 beyond that have no \
         certified reverse-family turn onto ring 1"
    );
    assert_eq!(path.turn_edge_ids.len(), 1);
    assert_eq!(
        path.return_edge_ids.len(),
        10,
        "ring 1's arc: 10 edges — beyond that no node is still both a zone \
         entry candidate and reachable from the port"
    );
    // No lane-change hops: a two-lane room's arm occupies one ring.
    assert!(path.inward_lane_ids.iter().all(|lane| *lane == Some(0)));
    assert!(path.return_lane_ids.iter().all(|lane| *lane == Some(1)));
}

/// The smallest centre-centre distance any certified template places between
/// two of its own primitives at least two steps apart -- `sqrt(800)`, i.e.
/// `20 * sqrt(2)`, in `TeardropReverse`. Same value `circuit_validate.rs`
/// pins; restated here per this crate's per-file fixture precedent.
const CATALOGUE_FLOOR_MM: f64 = 28.284_271_247_461_902;

#[test]
fn a_multi_ring_arm_cannot_be_expressed_as_a_loop_candidate_at_all() {
    // The measurement behind this file's choice of room, and behind the
    // report's finding for the controller. On the 3000 x 2400 room the arm
    // spans four rings, so the path carries lane-change hops -- certified
    // edges that run from a ring node through a free lattice node belonging to
    // neither ring. `LoopSection` offers a hop exactly two labels, and both are
    // rejected, which is what makes this "inexpressible" rather than "we
    // labelled it wrong":
    //
    //   * naming the ring it departed  -> `check_section_on_lane` rejects it,
    //     because only one of the edge's two endpoints is on that ring;
    //   * naming no ring               -> `check_pattern_provenance` rejects
    //     it, because a non-`Turn` graph section must name a lane.
    //
    // `Turn` is not a third option: it is reserved for exactly one
    // reverse-family edge, and a hop is a `BroadTurn90` pair.
    //
    // The generator itself is fine here -- the path chains and reaches the zone
    // -- so this is a gap in `certify_loop`'s own type, for a later task to
    // close. Everything below is asserted, not assumed.
    let pipeline = Pipeline::run_in(TALL_ROOM_HEIGHT_MM);
    assert_eq!(pipeline.lanes.len(), 7);

    let arm = plan_inward_arm(
        &pipeline.lanes,
        ZONE_SEGMENT,
        SPACING_MM,
        &pipeline.graph,
        100_000,
    )
    .unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);

    let path = complete_spiral(
        &arm,
        &pipeline.lanes,
        &pipeline.graph,
        &pipeline.view,
        &pipeline.zone,
        &pipeline.instance,
    )
    .expect("the generator completes a four-ring spiral");
    let hop_count = path
        .inward_lane_ids
        .iter()
        .chain(path.return_lane_ids.iter())
        .filter(|lane| lane.is_none())
        .count();
    assert_eq!(
        hop_count, 10,
        "five lane changes, two certified hops each -- the pieces with no ring \
         to name"
    );

    let departing = certify_loop(
        &assemble(&pipeline, &path, HopLabelling::DepartingRing),
        &pipeline.context(),
    )
    .expect_err("a hop does not walk the ring it departed");
    assert!(
        departing.message.starts_with("PATTERN_PROVENANCE")
            && departing.message.contains("does not walk it"),
        "expected the lane-membership branch, got: {}",
        departing.message
    );

    let unlabelled = certify_loop(
        &assemble(&pipeline, &path, HopLabelling::AsReported),
        &pipeline.context(),
    )
    .expect_err("a graph section that is not a turn must name a lane");
    assert!(
        unlabelled.message.starts_with("PATTERN_PROVENANCE")
            && unlabelled.message.contains("names no lane"),
        "expected the missing-lane branch, got: {}",
        unlabelled.message
    );
}
