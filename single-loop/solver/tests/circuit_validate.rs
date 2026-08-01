//! Task 10: the independent loop validator (design spec §5, §11).
//!
//! ## Where the "valid" candidate comes from — and what it is not
//!
//! The brief asks for a valid candidate built by the real pipeline
//! (`build_connection_zone` → `build_graph_view` → `build_lanes` →
//! `plan_inward_arm` → `complete_spiral` → `attach_port`). That is not
//! currently possible, for reasons established empirically before this file
//! was written (see `.superpowers/sdd/task-10-report.md` for the full probe
//! results). The blockers are in the *generator*, not the geometry:
//!
//! 1. `plan_inward_arm`/`complete_spiral` output is *provenance, not a
//!    chained path* — its own module doc says so, and on the 3000×2400
//!    fixture the assembled edge sequence has 7 geometric breaks of up to
//!    322.6 mm at the lane-change seams.
//! 2. `attach_port` cannot connect either port to that arm's first or last
//!    node: the arm begins at ring 0's arbitrary closing corner, whose
//!    heading is antiparallel to the port tangent.
//!
//! Neither blocker is about the geometry being unreachable: a candidate that
//! certifies at the production constants does exist, and this file uses one.
//! Finding it needs a *deep* zone (300 mm against a 187.5 mm ring-0 offset),
//! which truncates ring 0 to a short arc — enough for a short arm — while
//! putting ring 1 inside the zone's 150 mm anchor ring, so both zone-graph
//! junctions land on real `entry_candidates`. A sweep over that space found
//! 38 such candidates.
//!
//! So [`valid_candidate`] below is assembled by this test file, from real
//! pipeline pieces: a real polygon, plate instance, certified pose graph,
//! `build_connection_zone` zone, `build_graph_view` view and `build_lanes`
//! rings. Every graph section is a **verbatim copy of a real certified graph
//! edge's own primitives** — that is what makes the tamper tests bite. The
//! Both free-form zone connectors are `zone::attach_port` output too, so the
//! only thing this file supplies that the pipeline does not is the *choice*
//! of which certified edges to chain and in which order -- which is exactly
//! what `plan_inward_arm`/`complete_spiral` would supply if their output
//! chained.
//!
//! What this proves: every geometric check in `certify_loop` runs against
//! real certified geometry, and each tamper is rejected by its own check.
//! What it does not prove: that the current generator can produce a
//! certifiable loop. It cannot, and that is the point of the report.

use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, Field, Lane, LoopCandidate, LoopContext, LoopErrorCode,
    LoopGraphView, LoopSection, RectMm, SectionKind, attach_port, build_connection_zone,
    build_graph_view, build_lanes, certify_loop, filter_zone_nopps,
};
use single_loop_solver::geometry::{ParameterRange, Polygon, primitive_distance};
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, LocalPose, Nopp, NoppIndex, NoppType, PlateGraphLimits,
    PlateInstance, PlateProfile, PlateTransform, PoseEdge, PoseNode, TemplateId,
    build_embedded_graph,
};
use std::collections::BTreeMap;

// ---------------------------------------------------------------------------
// Real pipeline fixture (3000 × 2400, VA 150, wall clearance 75) — the same
// room every other `circuit_*` test file uses, duplicated per this crate's
// established per-file fixture precedent (see `circuit_spiral_return.rs`).
// ---------------------------------------------------------------------------

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

/// The connection the fixture uses. Deeper and wider than the 300x50 the
/// other `circuit_*` fixtures use, and not an arbitrary choice: the validator
/// bounds free-form zone geometry by the zone rectangle grown by
/// `ENTRY_RING_MM` (150 mm) and requires both zone-graph junctions to sit on
/// real `entry_candidates`. Ring 0 sits 187.5 mm from the wall and ring 1 at
/// 337.5, so a spiral's two attachment rings are only *both* inside that
/// window once `zone_depth_mm + 150 >= 337.5`. 300 clears it with margin.
fn connection() -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 2100.0,
        zone_width_mm: 600.0,
        zone_depth_mm: 300.0,
    }
}

/// Everything `certify_loop` needs, owned so the borrowing `LoopContext` can
/// be handed out with a lifetime tied to this struct.
struct Fixture {
    instance: PlateInstance,
    graph: EmbeddedPoseGraph,
    view: LoopGraphView,
    zone: ConnectionZone,
    lanes: Vec<Lane>,
}

impl Fixture {
    fn build() -> Self {
        let base = base_instance();
        let graph = build_embedded_graph(&base, 75.0, PlateGraphLimits::default()).unwrap();
        let zone = build_connection_zone(&rect_polygon(), &transform(), &connection()).unwrap();
        let view = build_graph_view(&graph, &zone, &transform());
        let lanes = build_lanes(&field(), 150.0, &graph, &view, &transform(), 75.0).unwrap();
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

    fn edge(&self, id: u32) -> &PoseEdge {
        self.graph
            .edges
            .iter()
            .find(|edge| edge.id == id)
            .expect("edge id must exist in the certified graph")
    }

    fn lane(&self, id: u32) -> &Lane {
        self.lanes
            .iter()
            .find(|lane| lane.id == id)
            .expect("lane id must exist")
    }
}

// ---------------------------------------------------------------------------
// Real-graph helpers (pose queries, duplicating the technique `spiral.rs`
// uses internally — no public API exposes them, and `circuit_spiral_return.rs`
// sets the precedent of restating them per test file).
// ---------------------------------------------------------------------------

fn opposite(heading: Heading8) -> Heading8 {
    Heading8::from_octant(heading.octant() + 4)
}

fn on_rect(p: Point, rect: &RectMm) -> bool {
    let eps = 1e-6;
    let vertical = (p.x - rect.min.x).abs() < eps || (p.x - rect.max.x).abs() < eps;
    let horizontal = (p.y - rect.min.y).abs() < eps || (p.y - rect.max.y).abs() < eps;
    let within_y = p.y >= rect.min.y - eps && p.y <= rect.max.y + eps;
    let within_x = p.x >= rect.min.x - eps && p.x <= rect.max.x + eps;
    (vertical && within_y) || (horizontal && within_x)
}

/// The certified edge realizing `edge`'s exact path reversal (same two poses,
/// endpoints swapped, headings flipped). The catalogue is reversal-closed, so
/// this exists for every ring edge on this fixture.
fn reversed_counterpart<'a>(graph: &'a EmbeddedPoseGraph, edge: &PoseEdge) -> &'a PoseEdge {
    let start_point = edge.end.local_pose.point;
    let start_heading = opposite(edge.end.local_pose.heading);
    let end_point = edge.start.local_pose.point;
    let end_heading = opposite(edge.start.local_pose.heading);
    graph
        .edges
        .iter()
        .filter(|candidate| {
            candidate.start.local_pose.heading == start_heading
                && candidate.end.local_pose.heading == end_heading
                && (candidate.start.local_pose.point - start_point).norm() < 1e-6
                && (candidate.end.local_pose.point - end_point).norm() < 1e-6
        })
        .min_by_key(|candidate| candidate.id)
        .expect("the reversal-closed catalogue must certify every counterpart")
}

/// The smallest-id certified reverse-family edge departing `from` and landing
/// on `target`'s own channel rectangle — the same query `spiral.rs`'s
/// `select_turn_edge` performs.
fn turn_edge<'a>(
    graph: &'a EmbeddedPoseGraph,
    from: LocalPose,
    target: &RectMm,
) -> Option<&'a PoseEdge> {
    graph
        .edges
        .iter()
        .filter(|edge| {
            matches!(
                edge.template_id,
                TemplateId::TeardropReverse | TemplateId::BroadReverse180
            ) && edge.start.local_pose.heading == from.heading
                && (edge.start.local_pose.point - from.point).norm() < 1e-6
                && on_rect(edge.end.local_pose.point, &target.clone())
        })
        .min_by_key(|edge| edge.id)
}

fn start_of(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { start, .. } | PathPrimitive::Arc { start, .. } => *start,
    }
}

fn end_of(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { end, .. } | PathPrimitive::Arc { end, .. } => *end,
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

/// The certified graph node at exactly `pose`, if the lattice has one.
fn node_at(graph: &EmbeddedPoseGraph, pose: LocalPose) -> Option<&PoseNode> {
    graph.nodes.iter().find(|node| {
        node.local_pose.heading == pose.heading
            && (node.local_pose.point - pose.point).norm() < 1e-6
    })
}

#[test]
#[ignore = "fixture search: run manually to re-derive the INWARD_*/RETURN_* constants"]
fn fixture_search() {
    let fixture = Fixture::build();
    let ring0 = fixture.lane(0).edge_ids.len();
    for start_index in 0..ring0 {
        for inward_edges in [6usize, 10, 14, 18, 22] {
            for return_edges in [6usize, 10, 14, 18, 22] {
                for swap_ports in [false, true] {
                    let Some(candidate) = assemble(
                        &fixture,
                        start_index,
                        inward_edges,
                        return_edges,
                        swap_ports,
                    ) else {
                        continue;
                    };
                    match certify_loop(&candidate, &fixture.context()) {
                        Ok(certificate) => println!(
                            "OK start={start_index} inward={inward_edges} return={return_edges} swap={swap_ports} \
                         min_d={:.2} penalty={:.2} len={:.0}",
                            certificate.min_center_distance_mm.distance_mm,
                            certificate.penalty_sum_mm,
                            certificate.total_length_mm
                        ),
                        Err(error) => {
                            let witness =
                                error.journal_tail.first().and_then(|entry| entry.witness);
                            println!(
                                "-- start={start_index} inward={inward_edges} return={return_edges} swap={swap_ports}: {} witness={witness:?}",
                                error.message.chars().take(90).collect::<String>()
                            );
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The candidate under test
// ---------------------------------------------------------------------------

/// How the fixture's two-ring spiral is laid out on the real graph.
///
/// The inward arm walks a contiguous run of ring 0's own certified edges,
/// the turn is a real reverse-family edge onto ring 1, and the return walks
/// ring 1 backward through the certified pose-flipped counterparts. The two
/// port connectors close it. Ring 0's run is chosen to start at
/// `INWARD_START_INDEX` and to be `INWARD_EDGE_COUNT` edges long — values
/// picked so the turn exists, the two connectors do not clash, and the whole
/// path clears the 16 mm floor.
const INWARD_START_INDEX: usize = 0;
const INWARD_EDGE_COUNT: usize = 8;
const RETURN_EDGE_COUNT: usize = 10;
const SWAP_PORTS: bool = false;

/// Builds the candidate for one choice of ring-0 start, arm length and
/// return length. `None` when the real graph does not supply a piece (no
/// certified turn from that pose, no reversed counterpart, or a port
/// connector that cannot be built at the minimum bend radius) -- the fixture
/// search below uses that; the fixed constants above are one combination it
/// found.
///
/// The arm walks ring 0 *backwards*, through the certified pose-flipped
/// counterparts, and the return walks ring 1 *forwards* along its own edges.
/// Both senses are real: the catalogue is reversal-closed, and which sense
/// each ring is walked in is decided by which way the turn happens to land,
/// not by a convention.
fn assemble(
    fixture: &Fixture,
    start_index: usize,
    inward_edges: usize,
    return_edges: usize,
    swap_ports: bool,
) -> Option<LoopCandidate> {
    let by_id: BTreeMap<u32, &PoseEdge> = fixture.graph.edges.iter().map(|e| (e.id, e)).collect();
    let ring0 = fixture.lane(0);
    let ring1 = fixture.lane(1);

    let ring0_backward: Vec<&PoseEdge> = ring0
        .edge_ids
        .iter()
        .rev()
        .map(|id| reversed_counterpart(&fixture.graph, by_id[id]))
        .collect();
    let ring0_len = ring0_backward.len();
    if start_index + inward_edges > ring0_len {
        return None;
    }
    let inward: Vec<&PoseEdge> = (0..inward_edges)
        .map(|step| ring0_backward[(start_index + step) % ring0_len])
        .collect();
    let turn = turn_edge(
        &fixture.graph,
        inward[inward.len() - 1].end.local_pose,
        &ring1.rect_local,
    )?;

    let entry = turn.end.local_pose;
    let entry_index = ring1.edge_ids.iter().position(|&id| {
        let start = by_id[&id].start.local_pose;
        start.heading == entry.heading && (start.point - entry.point).norm() < 1e-6
    })?;
    let ring1_len = ring1.edge_ids.len();
    if return_edges > ring1_len {
        return None;
    }
    let ret: Vec<&PoseEdge> = (0..return_edges)
        .map(|step| by_id[&ring1.edge_ids[(entry_index + step) % ring1_len]])
        .collect();

    // Free-form connectors: port -> arm start, return end -> port. Which of
    // the two ports the loop leaves from is a naming choice (`check_ports`
    // accepts either assignment) but not a geometric one: the connectors must
    // not cross, and which port is on the inside of the arm's first turn
    // decides that.
    let (entry_port, exit_port) = if swap_ports {
        (fixture.zone.end_port, fixture.zone.start_port)
    } else {
        (fixture.zone.start_port, fixture.zone.end_port)
    };
    let inward_start = inward[0];
    let start_anchor = node_at(&fixture.graph, inward_start.start.local_pose)?;
    let start_connector = attach_port(
        entry_port,
        fixture.zone.inward,
        start_anchor,
        &fixture.instance,
    )
    .ok()?
    .primitives;
    // The exit anchor is the pose-flip of where the return arm arrives: the
    // connector is built port -> anchor and then reversed, so it must leave
    // the anchor along the direction the return arm comes in with.
    let return_end = ret[ret.len() - 1];
    let exit_anchor = node_at(
        &fixture.graph,
        LocalPose::new(
            return_end.end.local_pose.point,
            opposite(return_end.end.local_pose.heading),
        ),
    )?;
    let end_connector: Vec<PathPrimitive> = attach_port(
        exit_port,
        fixture.zone.inward,
        exit_anchor,
        &fixture.instance,
    )
    .ok()?
    .primitives
    .iter()
    .rev()
    .map(reverse_primitive)
    .collect();

    let mut sections = vec![LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: start_connector,
    }];
    for edge in &inward {
        sections.push(LoopSection {
            kind: SectionKind::Inward,
            edge_id: Some(edge.id),
            lane_id: Some(0),
            primitives: edge.primitives.clone(),
        });
    }
    sections.push(LoopSection {
        kind: SectionKind::Turn,
        edge_id: Some(turn.id),
        lane_id: None,
        primitives: turn.primitives.clone(),
    });
    for edge in &ret {
        sections.push(LoopSection {
            kind: SectionKind::Return,
            edge_id: Some(edge.id),
            lane_id: Some(1),
            primitives: edge.primitives.clone(),
        });
    }
    sections.push(LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: end_connector,
    });
    Some(LoopCandidate { sections })
}

fn valid_candidate(fixture: &Fixture) -> LoopCandidate {
    assemble(
        fixture,
        INWARD_START_INDEX,
        INWARD_EDGE_COUNT,
        RETURN_EDGE_COUNT,
        SWAP_PORTS,
    )
    .expect("the real graph must supply every piece of the fixture candidate")
}

/// Moves one primitive of one graph section `delta_mm` in +x, leaving its
/// claimed edge id untouched — the generator emitting geometry that is not
/// the edge it says it is.
fn shift_one_primitive(candidate: &mut LoopCandidate, delta_mm: f64) {
    let section = candidate
        .sections
        .iter_mut()
        .find(|section| section.kind == SectionKind::Inward)
        .expect("the fixture has inward sections");
    let primitive = &mut section.primitives[0];
    *primitive = match primitive {
        PathPrimitive::Line { start, end } => PathPrimitive::Line {
            start: point(start.x + delta_mm, start.y),
            end: point(end.x + delta_mm, end.y),
        },
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => PathPrimitive::Arc {
            start: point(start.x + delta_mm, start.y),
            end: point(end.x + delta_mm, end.y),
            center: point(center.x + delta_mm, center.y),
            radius_mm: *radius_mm,
            sweep_rad: *sweep_rad,
        },
    };
}

fn failure_message(candidate: &LoopCandidate, fixture: &Fixture) -> String {
    let context = fixture.context();
    let error = certify_loop(candidate, &context)
        .expect_err("this candidate must not certify")
        .clone();
    assert_eq!(error.code, LoopErrorCode::InternalValidationFailure);
    error.message
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn the_real_graph_candidate_certifies() {
    let fixture = Fixture::build();
    let certificate = certify_loop(&valid_candidate(&fixture), &fixture.context())
        .expect("the fixture candidate must certify");

    assert!(certificate.edge_provenance_ok);
    assert!(certificate.zone_automaton_ok);
    assert!(certificate.pattern_provenance_ok);
    // The tightest non-adjacent approach on this fixture, inside the
    // certified `TeardropReverse` turn where its own loop passes ring 1's
    // channel. It coincides with the catalogue-wide minimum that
    // `no_certified_template_breaches_the_touching_floor` measures, which is
    // why the two constants are the same. Pinned rather than merely bounded,
    // so a catalogue change that tightens it shows up here.
    assert!(
        (certificate.min_center_distance_mm.distance_mm - CATALOGUE_FLOOR_MM).abs() < 1e-6,
        "min centre distance {}",
        certificate.min_center_distance_mm.distance_mm
    );
    assert!(
        certificate.min_bend_radius_mm >= 80.0,
        "min bend radius {}",
        certificate.min_bend_radius_mm
    );
    assert!(certificate.total_length_mm > 0.0);
    assert!(certificate.total_length_mm <= 100_000.0);
    assert!(certificate.coverage.upper_bound_mm >= certificate.coverage.lower_bound_mm);
}

#[test]
fn tampered_edge_geometry_fails_provenance() {
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    shift_one_primitive(&mut candidate, 0.5);
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("EDGE_PROVENANCE"),
        "a 0.5 mm shift off a certified edge must be rejected by provenance, not by a \
         later check that only sees the collateral damage; got: {message}"
    );
}

#[test]
fn a_tamper_below_the_provenance_tolerance_is_still_the_certified_edge() {
    // The other side of the tolerance: 1e-9 mm is float noise, not a
    // different edge, and must not be reported as tampering.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    shift_one_primitive(&mut candidate, 1e-9);
    certify_loop(&candidate, &fixture.context())
        .expect("a sub-tolerance nudge is still the certified edge");
}

#[test]
fn a_section_claiming_the_wrong_edge_fails_provenance() {
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    let victim = candidate
        .sections
        .iter_mut()
        .find(|section| section.kind == SectionKind::Return)
        .expect("the fixture has return sections");
    let claimed = victim.edge_id.expect("graph sections carry an edge id");
    // Some other real, usable edge — the geometry is untouched, only the
    // claim is wrong.
    let other = fixture
        .view
        .usable_edges
        .iter()
        .copied()
        .find(|id| *id != claimed)
        .expect("the view has more than one usable edge");
    victim.edge_id = Some(other);
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("EDGE_PROVENANCE"),
        "expected EDGE_PROVENANCE, got: {message}"
    );
}

#[test]
fn a_return_section_may_render_its_edge_reversed() {
    // Task 7 walks reserved rings backward through pose-flipped counterparts,
    // so a return section legitimately carries the *reversed* rendering of
    // the edge it names. Provenance must accept it.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    let mut swapped = 0usize;
    for section in &mut candidate.sections {
        if section.kind != SectionKind::Return {
            continue;
        }
        let edge_id = section.edge_id.expect("graph sections carry an edge id");
        let forward = fixture.edge(edge_id);
        let counterpart = reversed_counterpart(&fixture.graph, forward);
        // Name the counterpart, but keep rendering the *original* geometry:
        // that is exactly "this section is the counterpart, read backward".
        section.edge_id = Some(counterpart.id);
        swapped += 1;
    }
    assert!(swapped > 0, "the fixture must have return sections");
    certify_loop(&candidate, &fixture.context())
        .expect("a reversed rendering of a certified edge is still that edge");
}

#[test]
fn zone_reentry_fails_the_automaton() {
    let fixture = Fixture::build();
    let candidate = candidate_that_dips_back_into_the_zone(&fixture);
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("ZONE_AUTOMATON"),
        "expected ZONE_AUTOMATON, got: {message}"
    );
}

/// Extends the end connector so that, before finally reaching its port, the
/// path dips into the zone rectangle, back out, and in again — a third
/// inside-zone stretch where the automaton allows exactly two.
///
/// Built from straight legs: position-continuous, so it survives to the
/// automaton, which runs before the G1 gate. That ordering is deliberate (see
/// `validate.rs`'s module doc) and the assertion above pins it: if the
/// automaton stopped seeing the re-entry, this test would fail with
/// `PATH_CONTINUITY` instead of silently passing.
fn candidate_that_dips_back_into_the_zone(fixture: &Fixture) -> LoopCandidate {
    let mut candidate = valid_candidate(fixture);
    let last = candidate.sections.len() - 1;
    let end_section = &mut candidate.sections[last];
    let arrival = start_of(&end_section.primitives[0]);
    let port = end_of(&end_section.primitives[end_section.primitives.len() - 1]);
    let transform = transform();
    let rect = &fixture.zone.rect_local;
    let inside = transform.to_world(point(
        (rect.min.x + rect.max.x) * 0.5,
        (rect.min.y + rect.max.y) * 0.5,
    ));
    // Outside the zone rectangle but still inside the anchor ring the bounds
    // check allows, so the re-entry reaches the automaton rather than being
    // stopped one check earlier.
    let outside = transform.to_world(point((rect.min.x + rect.max.x) * 0.5, rect.max.y + 100.0));
    end_section.primitives = vec![
        PathPrimitive::Line {
            start: arrival,
            end: inside,
        },
        PathPrimitive::Line {
            start: inside,
            end: outside,
        },
        PathPrimitive::Line {
            start: outside,
            end: port,
        },
    ];
    candidate
}

#[test]
fn touching_paths_are_rejected_but_49_mm_is_penalized_not_rejected() {
    let fixture = Fixture::build();

    let (touching_zone, touching) = candidate_with_center_distance(&fixture, 15.9);
    let touching_context = LoopContext {
        zone: &touching_zone,
        ..fixture.context()
    };
    let error = certify_loop(&touching, &touching_context)
        .expect_err("a 15.9 mm approach must not certify");
    assert_eq!(error.code, LoopErrorCode::InternalValidationFailure);
    // Pinned to the exact token, not "either of the two contact checks": the
    // 16 mm floor is the module's most safety-critical number, and an
    // `||` here would let `measure_spacing`'s rejection branch go untested if
    // the fixture ever started failing on self-intersection instead.
    assert!(
        error.message.starts_with("CENTER_DISTANCE"),
        "a 15.9 mm approach must be rejected by the centre-distance floor; got: {}",
        error.message
    );

    let (close_zone, close) = candidate_with_center_distance(&fixture, 49.0);
    let close_context = LoopContext {
        zone: &close_zone,
        ..fixture.context()
    };
    let certificate =
        certify_loop(&close, &close_context).expect("49 mm is a penalty, not a rejection");
    // The brief's expected 1.0 assumes exactly one primitive pair in the
    // 49-50 mm band. This fixture has two, and 2.0 is the arithmetic the
    // spec actually asks for: the entry connector's straight leg and its
    // following arc *both* have their closest point to the exit connector's
    // final straight leg at the junction they share, so `Σ max(0, 50 - d)`
    // counts 1.0 twice -- once per primitive pair, exactly as design spec §5
    // and the brief's own "counted once per pair" require. Pinned at 2.0
    // rather than loosened to "> 0" so a change in how pairs are counted
    // fails here instead of drifting.
    assert!(
        (certificate.penalty_sum_mm - 2.0).abs() < 0.2,
        "penalty sum {} for two primitive pairs at 49 mm",
        certificate.penalty_sum_mm
    );
    let worst = certificate
        .worst_penalty
        .expect("a penalised candidate must name its worst approach");
    assert!(
        (worst.distance_mm - 49.0).abs() < 0.2,
        "worst penalty at {} mm",
        worst.distance_mm
    );
}

/// The fixture candidate with its exit connector rebuilt against an exit port
/// moved to sit `distance_mm` from the entry port instead of the fixed 50 mm,
/// together with the connection zone that names that port.
///
/// Why the port moves rather than the geometry: the two ports' own stubs are
/// the fixture's closest nonlocal approach (exactly 50.00 mm — the port
/// spacing), and they are free-form zone geometry, the only part of a loop
/// where a distance the 37.5 mm channel lattice cannot express (49 mm, 15.9
/// mm) can be realised at all. Rebuilding the connector against the moved
/// port keeps it a real minimum-radius corner that still meets the return arm
/// at the same anchor with the same tangent, so continuity, provenance and
/// the pattern are untouched and only the spacing changes. Moving the
/// geometry alone would break the seam; moving the port alone would break
/// `check_ports`.
fn candidate_with_center_distance(
    fixture: &Fixture,
    distance_mm: f64,
) -> (ConnectionZone, LoopCandidate) {
    let transform = transform();
    let (entry_port, exit_port) = if SWAP_PORTS {
        (fixture.zone.end_port, fixture.zone.start_port)
    } else {
        (fixture.zone.start_port, fixture.zone.end_port)
    };
    let entry_local = transform.to_local(entry_port);
    let exit_local = transform.to_local(exit_port);
    let direction = (exit_local.x - entry_local.x).signum();
    let moved = transform.to_world(point(entry_local.x + direction * distance_mm, exit_local.y));

    let mut zone = fixture.zone.clone();
    if SWAP_PORTS {
        zone.start_port = moved;
    } else {
        zone.end_port = moved;
    }

    let mut candidate = valid_candidate(fixture);
    let last = candidate.sections.len() - 1;
    let anchor_point = start_of(&candidate.sections[last].primitives[0]);
    let anchor = fixture
        .graph
        .nodes
        .iter()
        .find(|node| {
            (node.world_point - anchor_point).norm() < 1e-6
                && attach_port(moved, fixture.zone.inward, node, &fixture.instance).is_ok()
        })
        .expect("the exit anchor must still be reachable from the moved port");
    candidate.sections[last].primitives =
        attach_port(moved, fixture.zone.inward, anchor, &fixture.instance)
            .expect("checked just above")
            .primitives
            .iter()
            .rev()
            .map(reverse_primitive)
            .collect();
    (zone, candidate)
}

#[test]
fn spiral_provenance_requires_alternation_and_exactly_one_turn() {
    let fixture = Fixture::build();
    let two_turns = candidate_with_two_turns(&fixture);
    let message = failure_message(&two_turns, &fixture);
    assert!(
        message.starts_with("PATTERN_PROVENANCE"),
        "expected PATTERN_PROVENANCE, got: {message}"
    );
}

/// Relabels one return section as a second turn, so the graph sections read
/// `Inward+ Turn Return+ Turn Return+` — two turn blocks where a spiral has
/// exactly one. Geometry and edge ids are untouched, so provenance still
/// passes and only the pattern check can fire.
fn candidate_with_two_turns(fixture: &Fixture) -> LoopCandidate {
    let mut candidate = valid_candidate(fixture);
    let position = candidate
        .sections
        .iter()
        .rposition(|section| section.kind == SectionKind::Return)
        .expect("the fixture has return sections");
    candidate.sections[position].kind = SectionKind::Turn;
    candidate.sections[position].lane_id = None;
    candidate
}

#[test]
fn a_return_section_claiming_a_ring_it_does_not_walk_fails_pattern_provenance() {
    // Relabelling the return arm as ring 3 is rejected by the *lane
    // membership* check, not by the ring algebra: ring 1's edges do not have
    // both endpoints on ring 3's rectangle. The ring algebra's own branches
    // are unreachable this way, and are covered directly by
    // `validate.rs`'s `ring_algebra_tests` instead.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    for section in &mut candidate.sections {
        if section.kind == SectionKind::Return {
            section.lane_id = Some(3);
        }
    }
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.contains("claims ring 3, but edge"),
        "expected the lane-membership branch, got: {message}"
    );
}

#[test]
fn a_candidate_without_zone_sections_at_both_ends_fails_structurally() {
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    candidate.sections.remove(0);
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("SECTION_STRUCTURE"),
        "expected SECTION_STRUCTURE, got: {message}"
    );
}

#[test]
fn a_graph_section_naming_an_edge_the_zone_removed_fails_provenance() {
    // Real certified geometry, real edge id -- but an id the zone's own view
    // does not leave usable. Design spec §11's provenance bullet is an
    // *allowlist* check, not merely "does this edge exist".
    let fixture = Fixture::build();
    let candidate = valid_candidate(&fixture);
    let banned = candidate
        .sections
        .iter()
        .find_map(|section| section.edge_id)
        .expect("the fixture has graph sections");
    let restricted = LoopGraphView {
        usable_edges: fixture
            .view
            .usable_edges
            .iter()
            .copied()
            .filter(|id| *id != banned)
            .collect(),
        entry_candidates: fixture.view.entry_candidates.clone(),
    };
    let context = LoopContext {
        view: &restricted,
        ..fixture.context()
    };
    let error = certify_loop(&candidate, &context)
        .expect_err("an edge the view does not list must not certify");
    assert_eq!(error.code, LoopErrorCode::InternalValidationFailure);
    assert!(
        error.message.starts_with("EDGE_PROVENANCE"),
        "expected EDGE_PROVENANCE, got: {}",
        error.message
    );
}

// --- The checks added after review: zone bounds, zone anchors, nopp
// clearance, and the turn's real template family. ---

#[test]
fn a_zone_section_leaving_the_anchor_ring_fails() {
    // Free-form geometry is only free *inside the zone's own anchor ring*.
    // Without that bound a "zone" section could route uncertified geometry
    // across the whole room, which is precisely what edge provenance exists
    // to prevent everywhere else.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    let anchor = end_of(candidate.sections[0].primitives.last().unwrap());
    let port = start_of(&candidate.sections[0].primitives[0]);
    let far = transform().to_world(point(
        fixture.zone.rect_local.min.x - 900.0,
        fixture.zone.rect_local.max.y + 900.0,
    ));
    candidate.sections[0].primitives = vec![
        PathPrimitive::Line {
            start: port,
            end: far,
        },
        PathPrimitive::Line {
            start: far,
            end: anchor,
        },
    ];
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("ZONE_BOUNDS"),
        "expected ZONE_BOUNDS, got: {message}"
    );
}

#[test]
fn a_zone_graph_junction_off_the_certified_anchors_fails() {
    // Design spec §4: "Übergänge Zone ↔ Graph nur an Pose-Ankern". The
    // geometry is untouched; only the set of anchors the zone view offers
    // shrinks, so nothing but the anchor rule can fire.
    let fixture = Fixture::build();
    let candidate = valid_candidate(&fixture);
    let junction = end_of(candidate.sections[0].primitives.last().unwrap());
    let banned: Vec<u32> = fixture
        .graph
        .nodes
        .iter()
        .filter(|node| (node.world_point - junction).norm() < 1e-6)
        .map(|node| node.id)
        .collect();
    assert!(!banned.is_empty(), "the junction must sit on a real node");
    let restricted = LoopGraphView {
        usable_edges: fixture.view.usable_edges.clone(),
        entry_candidates: fixture
            .view
            .entry_candidates
            .iter()
            .copied()
            .filter(|id| !banned.contains(id))
            .collect(),
    };
    let context = LoopContext {
        view: &restricted,
        ..fixture.context()
    };
    let error = certify_loop(&candidate, &context)
        .expect_err("a junction off the certified anchor set must not certify");
    assert!(
        error.message.starts_with("ZONE_ANCHOR"),
        "expected ZONE_ANCHOR, got: {}",
        error.message
    );
}

#[test]
fn free_form_geometry_colliding_with_a_nopp_fails() {
    // `filter_zone_nopps` only clears the zone *rectangle*, while a connector
    // reaches past it to its anchor, and the fixture's connectors are not
    // built by `attach_port` (whose own clearance loop would have caught
    // this). Nobody but the validator checks them. Rather than move the
    // connector onto a nopp -- which would break continuity first -- move a
    // nopp onto the connector.
    let fixture = Fixture::build();
    let candidate = valid_candidate(&fixture);
    let victim = candidate.sections[0].primitives[0].point_at(0.5);
    let mut instance = fixture.instance.clone();
    let profile = instance.profile.clone();
    instance.nopps.push(Nopp {
        index: NoppIndex::new(-1, -1),
        nopp_type: NoppType::Large,
        center: victim,
        rendered_radius_mm: profile.large_rendered_radius_mm,
        effective_radius_mm: profile.large_effective_radius_mm,
        forbidden_radius_mm: profile.forbidden_radius(NoppType::Large),
    });
    let context = LoopContext {
        instance: &instance,
        ..fixture.context()
    };
    let error = certify_loop(&candidate, &context)
        .expect_err("free-form geometry running through a nopp must not certify");
    assert!(
        error.message.starts_with("NOPP_CLEARANCE"),
        "expected NOPP_CLEARANCE, got: {}",
        error.message
    );
}

#[test]
fn a_turn_section_rendering_a_straight_edge_fails_pattern_provenance() {
    // The Kehre's template family is read off the real graph edge, not taken
    // from the candidate's own label. Geometry and edge id stay consistent
    // with each other, so provenance still passes.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    let straight_id = candidate
        .sections
        .iter()
        .find(|section| section.kind == SectionKind::Inward)
        .and_then(|section| section.edge_id)
        .expect("the fixture has inward sections");
    let straight = fixture.edge(straight_id);
    assert!(
        !matches!(
            straight.template_id,
            TemplateId::TeardropReverse | TemplateId::BroadReverse180
        ),
        "the substitute must not itself be a reverse-family edge"
    );
    let turn = candidate
        .sections
        .iter_mut()
        .find(|section| section.kind == SectionKind::Turn)
        .expect("the fixture has a turn");
    turn.edge_id = Some(straight_id);
    turn.primitives = straight.primitives.clone();
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.starts_with("PATTERN_PROVENANCE"),
        "expected PATTERN_PROVENANCE, got: {message}"
    );
}

#[test]
fn a_candidate_with_no_turn_at_all_fails_pattern_provenance() {
    // The zero side of "exactly one turn". The Kehre section is *removed*,
    // not relabelled: relabelling it `Return` on ring 1 is caught earlier by
    // `check_section_on_lane`, because a turn edge spans two rings and so
    // cannot have both endpoints on ring 1's rectangle. Removing it leaves
    // `Inward+ Return+`, which every earlier check accepts, so the turn
    // counter is the only thing that can reject this.
    let fixture = Fixture::build();
    let mut candidate = valid_candidate(&fixture);
    let position = candidate
        .sections
        .iter()
        .position(|section| section.kind == SectionKind::Turn)
        .expect("the fixture has a turn");
    candidate.sections.remove(position);
    let message = failure_message(&candidate, &fixture);
    assert!(
        message.contains("exactly one turn section; found 0"),
        "expected the turn counter's zero case, got: {message}"
    );
}

/// The smallest centre-centre distance any certified template places between
/// two of its own primitives that are at least two steps apart, measured
/// across every placement in the fixture graph by
/// [`no_certified_template_breaches_the_touching_floor`].
///
/// Exactly `sqrt(800)`: the witness pair sits 27.838_821_814_150_15 mm apart
/// in x and exactly 5 mm apart in y, and 27.838_821_814_150_15^2 + 5^2 = 800
/// to the last representable bit, so the value is `20 * sqrt(2)` rather than
/// a rounded decimal.
const CATALOGUE_FLOOR_MM: f64 = 28.284_271_247_461_902;

#[test]
fn no_certified_template_breaches_the_touching_floor() {
    // The 16 mm floor is unconditional and hard, so a certified template that
    // breached it would make `certify_loop` reject legitimate generator
    // output -- a failure mode the floor introduces and which one fixture
    // cannot rule out. Sweep every placement in the graph instead, and pin
    // both the per-template minima and the global one.
    let fixture = Fixture::build();
    let mut per_template: BTreeMap<String, f64> = BTreeMap::new();
    let mut global = f64::INFINITY;
    let mut widest_edge = 0usize;

    for edge in &fixture.graph.edges {
        widest_edge = widest_edge.max(edge.primitives.len());
        for first in 0..edge.primitives.len() {
            for second in (first + 2)..edge.primitives.len() {
                let distance_mm = primitive_distance(
                    &edge.primitives[first],
                    ParameterRange::FULL,
                    &edge.primitives[second],
                    ParameterRange::FULL,
                )
                .distance_mm;
                let slot = per_template
                    .entry(format!("{:?}", edge.template_id))
                    .or_insert(f64::INFINITY);
                *slot = slot.min(distance_mm);
                global = global.min(distance_mm);
            }
        }
    }

    // Every template family that can have such a pair at all must appear:
    // a sweep that silently measured nothing would otherwise "pass".
    assert_eq!(widest_edge, 5, "widest certified edge, in primitives");
    let mut families: Vec<&String> = per_template.keys().collect();
    families.sort();
    assert_eq!(
        families,
        vec![
            "BroadReverse180",
            "BroadTurn135",
            "BroadTurn45",
            "BroadTurn90",
            "TeardropReverse",
        ],
        "the straight templates have fewer than three primitives, so they \
         contribute no pair at index distance two; every turning family must"
    );

    for (template, minimum_mm) in &per_template {
        assert!(
            *minimum_mm > 16.01,
            "certified template {template} places two of its own primitives \
             {minimum_mm:.6} mm apart, at or below the physical floor -- the \
             floor would reject legitimate generator output"
        );
    }
    assert!(
        (global - CATALOGUE_FLOOR_MM).abs() < 1e-6,
        "catalogue-wide minimum is {global:.6} mm"
    );
    // The margin, stated so a future catalogue addition that eats into it is
    // visible in the diff rather than only in a threshold comparison.
    assert!(global - 16.01 > 12.0);
}
