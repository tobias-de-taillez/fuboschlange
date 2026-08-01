//! Task 10: the independent loop validator (design spec §5 and §11).
//!
//! This module is the only producer of a [`LoopCertificate`]. Nothing the
//! generator believes is taken on trust here: a [`LoopCandidate`] carries its
//! own geometry *and* its own claims about that geometry (which certified
//! graph edge each section is, which lane it belongs to, whether it is zone,
//! inward, turn or return), and every claim is re-checked against the real
//! polygon, the real pose graph and the real connection zone.
//!
//! ## Why the candidate carries primitives, not just edge ids
//!
//! A candidate that named only edge ids would make provenance tautological:
//! the validator would read the geometry out of the very graph it is
//! checking against, and could never detect a generator that emitted
//! something else. So [`LoopSection`] carries the primitives the plan would
//! actually be rendered from, and [`certify_loop`] rejects the candidate
//! unless each graph section's primitives *equal* its claimed certified
//! edge's own primitives, to 1e-6 mm and 1e-7 rad. A section nudged half a
//! millimetre off its edge fails, which is exactly the check the generator
//! cannot perform on itself.
//!
//! Provenance accepts an edge's primitives in either direction. The
//! catalogue is reversal-closed (`plate::template`'s module doc) and Task 7's
//! return construction walks reserved rings backward through independently
//! certified pose-flipped edges, so a return section legitimately matches the
//! *reversed* rendering of the edge it names.
//!
//! ## Check order is load-bearing
//!
//! Edge provenance and pattern provenance run *before* the continuity gate.
//! A tampered primitive breaks continuity as well as provenance, and if
//! `canonicalize_path` ran first every tamper test would pass for the wrong
//! reason. Every rejection therefore carries a stable reason token (see
//! [`Reason`]) as the first word of `LoopError::message`, so a test can
//! assert *which* check fired rather than merely that one did.
//!
//! ## What the zone automaton actually measures
//!
//! Design spec §11 asks for "Zone → Graph → Zone genau je einmal pro
//! Pfadende, kein Wiedereintritt". This is checked geometrically, on the
//! assembled path, not on the candidate's own section labels: the arc-length
//! intervals in which the path lies inside the zone rectangle must be exactly
//! two, one containing the start and one containing the end. A third
//! interval is a re-entry.
//!
//! Deliberately *not* "every zone section lies inside the rectangle": the
//! zone's own anchors live in the 150 mm ring *outside* the rectangle
//! (`zone::attach_port`'s doc: "a connector necessarily leaves the nopp-free
//! rectangle"), so a section-containment rule would reject every real
//! connector. Section labels are still checked structurally -- exactly two
//! zone sections, first and last -- which is what makes "one transition at
//! each end" meaningful.
//!
//! ## Locality, touching and the 50 mm rule
//!
//! `localArcLength = 80π mm` (`constants::LOCAL_ARC_LENGTH_MM`) separates the
//! two rules, and only the soft one. The 50 mm nominal laying distance is a
//! *pattern* target that design spec §7 explicitly permits a Kehre to
//! undershoot, so it is measured on nonlocal pairs only. The 16 mm
//! centre-centre floor is *physics* -- two 16 mm pipes closer than that are
//! overlapping tubes -- and §7's own wording ("bis zur physischen
//! Nichtberührung") keeps it in force inside the turn, so it is applied
//! unconditionally to every pair of primitives at least two steps apart,
//! local or not. Adjacent primitives are the only exemption, and not on
//! locality grounds: they share an endpoint by construction, so their
//! distance is identically zero. The same pair set carries design spec §5's
//! crossing rule ("keine Selbstkreuzung, keine Berührung nichtbenachbarter
//! Teile"): no two primitives more than one step apart may intersect at all.
//!
//! Pair classification is exact at both extremes; only pairs that straddle
//! the locality boundary are covered approximately, and [`pair_ranges`]
//! proves that what the approximation misses can hold neither a rejection nor
//! a penalty (the certified 80 mm curvature floor puts every such pair at
//! least ~159 mm apart).
//!
//! ## Out of scope, deliberately
//!
//! Nopp clearance is not re-checked. Design spec §5 makes nopp safety a
//! property of the certified graph edges ("keine Kollision mit expandierten
//! Noppenkörpern (via Graphkanten)"), which edge provenance already pins,
//! and the zone is nopp-free by construction (`zone::filter_zone_nopps`).
//! The free-form connectors' own nopp clearance is certified by
//! `zone::attach_port` at construction time; a caller that builds connectors
//! some other way owes that check itself. Wall clearance is likewise not
//! checked: design spec §5's table scopes it to "Wandabstand außerhalb der
//! Zone", and both ports sit on the wall by construction.

use crate::circuit::fields::Lane;
use crate::circuit::types::{JournalEntry, LocatedSpacing, LoopError, LoopErrorCode, RectMm};
use crate::circuit::zone::{ConnectionZone, ENTRY_RING_MM, LoopGraphView, zone_contains_local};
use crate::constants::{
    LOCAL_ARC_LENGTH_MM, MAX_COVERAGE_CELLS, MAX_LENGTH_MM, MIN_NONLOCAL_SPACING_MM, MIN_RADIUS_MM,
    PIPE_DIAMETER_MM,
};
use crate::geometry::{
    CanonicalPath, Intersection, ParameterRange, PointClassification, Polygon, canonicalize_path,
    primitive_distance, primitive_intersections,
};
use crate::model::{PathPrimitive, Point};
use crate::plate::{
    EmbeddedPoseGraph, PlateInstance, PlateTransform, PoseEdge, TemplateId,
    primitive_circle_clearance,
};
use crate::validation::{CoverageBounds, coverage_bounds};
use std::collections::BTreeSet;

/// Position tolerance for provenance and endpoint comparisons, in mm --
/// design spec §11's "Geometrievergleich", pinned by the brief at 1e-6 mm.
const PROVENANCE_POSITION_TOLERANCE_MM: f64 = 1e-6;

/// Angle tolerance for provenance comparisons, in radians (brief: 1e-7 rad).
const PROVENANCE_ANGLE_TOLERANCE_RAD: f64 = 1e-7;

/// Extra margin above the physical 16 mm centre-centre floor, so a candidate
/// sitting exactly on the limit is rejected rather than accepted by rounding
/// (`constants::GENERATION_MARGIN_MM`'s 0.01 mm, restated here because this
/// module -- like the rest of `circuit` -- keeps its spec-derived constants
/// local, see `escalate::COVERAGE_TIE_WINDOW_MM`).
const TOUCHING_RESERVE_MM: f64 = 0.01;

/// Coverage grid tolerance, in mm (brief: 0.1).
const COVERAGE_TOLERANCE_MM: f64 = 0.1;

/// How many parameter slices [`pair_ranges`] covers a partially-nonlocal
/// primitive pair with. See that function for what this does and does not
/// guarantee.
const STRADDLING_PAIR_SLICES: usize = 16;

/// Which part of the loop a [`LoopSection`] claims to be.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SectionKind {
    /// Free-form routing inside the connection zone. Carries no edge id: the
    /// zone is the one place the path is not made of certified graph edges
    /// (design spec §4).
    Zone,
    /// One certified graph edge of the inward arm.
    Inward,
    /// One certified graph edge of the turn-around.
    Turn,
    /// One certified graph edge of the return arm.
    Return,
}

impl SectionKind {
    fn is_graph(self) -> bool {
        !matches!(self, Self::Zone)
    }
}

/// One contiguous stretch of the candidate path, together with everything the
/// generator claims about it.
#[derive(Clone, Debug, PartialEq)]
pub struct LoopSection {
    pub kind: SectionKind,
    /// The certified graph edge this section renders. `Some` exactly for
    /// graph sections; the geometry must equal that edge's own primitives
    /// (forward or reversed) within [`PROVENANCE_POSITION_TOLERANCE_MM`] /
    /// [`PROVENANCE_ANGLE_TOLERANCE_RAD`].
    pub edge_id: Option<u32>,
    /// The lane ring this section walks. `Some` for `Inward`/`Return`,
    /// `None` for `Turn` (which crosses between two rings) and `Zone`.
    pub lane_id: Option<u32>,
    /// World-space geometry, in path order.
    pub primitives: Vec<PathPrimitive>,
}

/// A complete loop proposal: the ordered sections whose concatenation is the
/// path from one port to the other. Task 11 fills this; nothing in it is
/// trusted by [`certify_loop`].
#[derive(Clone, Debug, PartialEq)]
pub struct LoopCandidate {
    pub sections: Vec<LoopSection>,
}

impl LoopCandidate {
    /// Every primitive of every section, in path order.
    pub fn primitives(&self) -> Vec<PathPrimitive> {
        self.sections
            .iter()
            .flat_map(|section| section.primitives.iter().cloned())
            .collect()
    }
}

/// Everything [`certify_loop`] checks a candidate against. All of it is real
/// pipeline output: the plate instance (polygon, plate frame, profile), the
/// certified pose graph, the zone's usable-edge view, the connection zone
/// itself, and the lane rings the pattern claims to walk.
#[derive(Clone, Copy, Debug)]
pub struct LoopContext<'a> {
    pub instance: &'a PlateInstance,
    pub graph: &'a EmbeddedPoseGraph,
    pub view: &'a LoopGraphView,
    pub zone: &'a ConnectionZone,
    pub lanes: &'a [Lane],
}

impl LoopContext<'_> {
    fn polygon(&self) -> &Polygon {
        &self.instance.polygon
    }

    fn transform(&self) -> &PlateTransform {
        &self.instance.transform
    }
}

/// What a certified loop is certified *to be*. Only [`certify_loop`] builds
/// one, so holding a `LoopCertificate` is proof the checks ran.
#[derive(Clone, Debug, PartialEq)]
pub struct LoopCertificate {
    /// The smallest measured centre-centre distance between two parts of the
    /// path at least two primitives apart, and where it was found. Always
    /// greater than `PIPE_DIAMETER_MM + TOUCHING_RESERVE_MM`. Unconditional:
    /// unlike the 50 mm penalty, this is not restricted to nonlocal pairs
    /// (see [`measure_spacing`]).
    pub min_center_distance_mm: LocatedSpacing,
    /// `Σ max(0, 50 − d)` over the measured per-pair minima (design spec
    /// §5's soft rule; feeds `escalate::Candidate::penalty_sum_mm`).
    pub penalty_sum_mm: f64,
    /// The single measured minimum that contributed the most penalty, if any
    /// pair fell below 50 mm at all.
    pub worst_penalty: Option<LocatedSpacing>,
    pub coverage: CoverageBounds,
    pub total_length_mm: f64,
    pub min_bend_radius_mm: f64,
    pub pattern_provenance_ok: bool,
    pub zone_automaton_ok: bool,
    pub edge_provenance_ok: bool,
}

/// The stable first word of every rejection message. Tests assert on these
/// rather than on `LoopErrorCode` (which is `InternalValidationFailure` for
/// all of them, design spec §11) so a tamper test cannot pass because some
/// *other* check happened to fire.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Reason {
    SectionStructure,
    EdgeProvenance,
    PatternProvenance,
    ZoneAutomaton,
    ZoneBounds,
    ZoneAnchor,
    NoppClearance,
    PathContinuity,
    PortEndpoints,
    BendRadius,
    PolygonEscape,
    SelfIntersection,
    CenterDistance,
    LengthLimit,
    Coverage,
}

impl Reason {
    fn as_str(self) -> &'static str {
        match self {
            Self::SectionStructure => "SECTION_STRUCTURE",
            Self::EdgeProvenance => "EDGE_PROVENANCE",
            Self::PatternProvenance => "PATTERN_PROVENANCE",
            Self::ZoneAutomaton => "ZONE_AUTOMATON",
            Self::ZoneBounds => "ZONE_BOUNDS",
            Self::ZoneAnchor => "ZONE_ANCHOR",
            Self::NoppClearance => "NOPP_CLEARANCE",
            Self::PathContinuity => "PATH_CONTINUITY",
            Self::PortEndpoints => "PORT_ENDPOINTS",
            Self::BendRadius => "BEND_RADIUS",
            Self::PolygonEscape => "POLYGON_ESCAPE",
            Self::SelfIntersection => "SELF_INTERSECTION",
            Self::CenterDistance => "CENTER_DISTANCE",
            Self::LengthLimit => "LENGTH_LIMIT",
            Self::Coverage => "COVERAGE",
        }
    }
}

fn reject(reason: Reason, detail: impl AsRef<str>) -> LoopError {
    let message = format!("{}: {}", reason.as_str(), detail.as_ref());
    LoopError {
        code: LoopErrorCode::InternalValidationFailure,
        message: message.clone(),
        journal_tail: vec![JournalEntry {
            decision: message,
            rejected_by: Some(reason.as_str().to_owned()),
            witness: None,
        }],
    }
}

fn reject_at(reason: Reason, detail: impl AsRef<str>, witness: Point) -> LoopError {
    let mut error = reject(reason, detail);
    if let Some(entry) = error.journal_tail.first_mut() {
        entry.witness = Some(witness);
    }
    error
}

/// Certifies `candidate` against `context`, or rejects it with
/// `INTERNAL_VALIDATION_FAILURE` (design spec §11: a certificate
/// contradiction is never emitted as a plan).
///
/// The checks run in a fixed order, chosen so each rejection names its own
/// cause rather than an earlier check's collateral damage: section structure,
/// edge provenance, pattern provenance, zone discipline (bounds and anchors),
/// the zone automaton, path continuity, ports, bend radius, polygon
/// containment, nopp clearance, self-intersection, spacing, total length,
/// coverage.
pub fn certify_loop(
    candidate: &LoopCandidate,
    context: &LoopContext,
) -> Result<LoopCertificate, LoopError> {
    check_section_structure(candidate)?;
    check_edge_provenance(candidate, context)?;
    check_pattern_provenance(candidate, context)?;

    check_zone_discipline(candidate, context)?;

    let primitives = candidate.primitives();
    check_zone_automaton(&primitives, context)?;

    let path = canonicalize_path(&primitives)
        .map_err(|error| reject(Reason::PathContinuity, format!("{error:?}")))?;

    check_ports(&path, context)?;
    let min_bend_radius_mm = check_bend_radius(&path)?;
    check_inside_polygon(&path, context)?;
    check_nopp_clearance(&path, context)?;
    check_self_intersections(&path)?;
    let spacing = measure_spacing(&path)?;

    let total_length_mm = path.total_length();
    if total_length_mm > MAX_LENGTH_MM {
        return Err(reject(
            Reason::LengthLimit,
            format!("path is {total_length_mm:.1} mm, above the {MAX_LENGTH_MM:.0} mm limit"),
        ));
    }

    let coverage = coverage_bounds(
        context.polygon(),
        &path,
        COVERAGE_TOLERANCE_MM,
        MAX_COVERAGE_CELLS,
    )
    .map_err(|error| reject(Reason::Coverage, error.message))?;

    Ok(LoopCertificate {
        min_center_distance_mm: spacing.minimum,
        penalty_sum_mm: spacing.penalty_sum_mm,
        worst_penalty: spacing.worst_penalty,
        coverage,
        total_length_mm,
        min_bend_radius_mm,
        pattern_provenance_ok: true,
        zone_automaton_ok: true,
        edge_provenance_ok: true,
    })
}

// ---------------------------------------------------------------------------
// Section structure
// ---------------------------------------------------------------------------

/// The shape every candidate must have before any geometry is looked at: a
/// zone section at each end and nowhere else, at least one graph section in
/// between, no empty section, and edge ids present exactly on graph sections.
fn check_section_structure(candidate: &LoopCandidate) -> Result<(), LoopError> {
    let sections = &candidate.sections;
    if sections.len() < 3 {
        return Err(reject(
            Reason::SectionStructure,
            format!(
                "a loop needs a zone section, at least one graph section and a zone section; got {}",
                sections.len()
            ),
        ));
    }
    for (index, section) in sections.iter().enumerate() {
        if section.primitives.is_empty() {
            return Err(reject(
                Reason::SectionStructure,
                format!("section {index} carries no geometry"),
            ));
        }
        let is_graph = section.kind.is_graph();
        if is_graph != section.edge_id.is_some() {
            return Err(reject(
                Reason::SectionStructure,
                format!(
                    "section {index} is {:?} but {} an edge id",
                    section.kind,
                    if section.edge_id.is_some() {
                        "carries"
                    } else {
                        "carries no"
                    }
                ),
            ));
        }
    }
    let zone_positions: Vec<usize> = sections
        .iter()
        .enumerate()
        .filter(|(_, section)| section.kind == SectionKind::Zone)
        .map(|(index, _)| index)
        .collect();
    if zone_positions != vec![0, sections.len() - 1] {
        return Err(reject(
            Reason::SectionStructure,
            format!(
                "expected exactly two zone sections, first and last; found them at {zone_positions:?}"
            ),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Edge provenance
// ---------------------------------------------------------------------------

/// Design spec §11's first bullet: outside the zone, every path section must
/// *be* a certified graph edge -- id present in the zone's usable set, and
/// geometry equal to that edge's own, in either direction.
fn check_edge_provenance(
    candidate: &LoopCandidate,
    context: &LoopContext,
) -> Result<(), LoopError> {
    let usable: BTreeSet<u32> = context.view.usable_edges.iter().copied().collect();
    for (index, section) in candidate.sections.iter().enumerate() {
        let Some(edge_id) = section.edge_id else {
            continue;
        };
        if !usable.contains(&edge_id) {
            return Err(reject(
                Reason::EdgeProvenance,
                format!(
                    "section {index} claims graph edge {edge_id}, which the connection zone does not leave usable"
                ),
            ));
        }
        let Some(edge) = find_edge(context.graph, edge_id) else {
            return Err(reject(
                Reason::EdgeProvenance,
                format!("section {index} claims graph edge {edge_id}, which does not exist"),
            ));
        };
        if !renders_edge(&section.primitives, edge) {
            return Err(reject_at(
                Reason::EdgeProvenance,
                format!(
                    "section {index}'s geometry is not graph edge {edge_id}'s certified geometry, forward or reversed"
                ),
                start_of(&section.primitives[0]),
            ));
        }
    }
    Ok(())
}

fn find_edge(graph: &EmbeddedPoseGraph, edge_id: u32) -> Option<&PoseEdge> {
    graph.edges.iter().find(|edge| edge.id == edge_id)
}

/// Whether `primitives` is `edge`'s certified rendering, read forward or
/// backward. The backward reading is not a convenience: the pose graph is
/// reversal-closed and Task 7's return arm renders reserved rings by walking
/// them backward, so a return section's geometry is legitimately the reversed
/// counterpart's -- and a validator that only accepted the forward reading
/// would reject every real return arm.
fn renders_edge(primitives: &[PathPrimitive], edge: &PoseEdge) -> bool {
    same_primitives(primitives, &edge.primitives)
        || same_primitives(
            primitives,
            &edge
                .primitives
                .iter()
                .rev()
                .map(reverse_primitive)
                .collect::<Vec<_>>(),
        )
}

fn same_primitives(left: &[PathPrimitive], right: &[PathPrimitive]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right.iter())
            .all(|(a, b)| same_primitive(a, b))
}

fn same_primitive(left: &PathPrimitive, right: &PathPrimitive) -> bool {
    match (left, right) {
        (
            PathPrimitive::Line {
                start: a_start,
                end: a_end,
            },
            PathPrimitive::Line {
                start: b_start,
                end: b_end,
            },
        ) => same_point(*a_start, *b_start) && same_point(*a_end, *b_end),
        (
            PathPrimitive::Arc {
                start: a_start,
                end: a_end,
                center: a_center,
                radius_mm: a_radius,
                sweep_rad: a_sweep,
            },
            PathPrimitive::Arc {
                start: b_start,
                end: b_end,
                center: b_center,
                radius_mm: b_radius,
                sweep_rad: b_sweep,
            },
        ) => {
            same_point(*a_start, *b_start)
                && same_point(*a_end, *b_end)
                && same_point(*a_center, *b_center)
                && (a_radius - b_radius).abs() <= PROVENANCE_POSITION_TOLERANCE_MM
                && (a_sweep - b_sweep).abs() <= PROVENANCE_ANGLE_TOLERANCE_RAD
        }
        _ => false,
    }
}

fn same_point(left: Point, right: Point) -> bool {
    (left - right).norm() <= PROVENANCE_POSITION_TOLERANCE_MM
}

/// The same primitive traversed the other way: endpoints swapped, and (for an
/// arc) the sweep negated so the same centre and radius describe the same
/// curve run backward.
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

// ---------------------------------------------------------------------------
// Pattern provenance (spiral)
// ---------------------------------------------------------------------------

/// Design spec §11's third bullet, for the spiral pattern: the graph sections
/// must read `Inward+ Turn+ Return+` (so there is exactly *one* turn block),
/// the inward rings must alternate outward-in in steps of two, the return
/// rings must alternate back out in steps of two, and every return ring must
/// be the ring reserved next to an occupied one.
///
/// The claimed ring is not taken on trust either: a section's edge must
/// actually have both of its endpoints on that lane's own channel rectangle
/// (the test used by `circuit_spiral_return.rs`'s own `ring_for_edge`), which
/// a lane-change or turn edge never does.
fn check_pattern_provenance(
    candidate: &LoopCandidate,
    context: &LoopContext,
) -> Result<(), LoopError> {
    let graph_sections: Vec<&LoopSection> = candidate
        .sections
        .iter()
        .filter(|section| section.kind.is_graph())
        .collect();

    let mut inward_lanes: Vec<u32> = Vec::new();
    let mut return_lanes: Vec<u32> = Vec::new();
    let mut turn_blocks = 0usize;
    let mut phase = 0u8; // 0 = inward, 1 = turn, 2 = return
    for (index, section) in graph_sections.iter().enumerate() {
        let next_phase = match section.kind {
            SectionKind::Inward => 0,
            SectionKind::Turn => 1,
            SectionKind::Return => 2,
            SectionKind::Zone => unreachable!("filtered above"),
        };
        if next_phase < phase {
            return Err(reject(
                Reason::PatternProvenance,
                format!(
                    "graph section {index} is {:?} after the path already reached a later phase",
                    section.kind
                ),
            ));
        }
        if section.kind == SectionKind::Turn && phase != 1 {
            turn_blocks += 1;
        }
        phase = next_phase;

        match section.kind {
            SectionKind::Turn => {
                if section.lane_id.is_some() {
                    return Err(reject(
                        Reason::PatternProvenance,
                        format!("turn section {index} claims a lane; a turn crosses two rings"),
                    ));
                }
                // The template family is read off the real graph edge, not
                // taken from the candidate's own label: "spiral" means the
                // Kehre is a certified reverse-family placement (design spec
                // §11's pattern provenance), and a generator that labelled a
                // straight `Turn` would otherwise pass.
                let edge_id = section.edge_id.expect("graph sections carry an edge id");
                let edge =
                    find_edge(context.graph, edge_id).expect("existence checked by provenance");
                if !matches!(
                    edge.template_id,
                    TemplateId::TeardropReverse | TemplateId::BroadReverse180
                ) {
                    return Err(reject(
                        Reason::PatternProvenance,
                        format!(
                            "turn section {index} renders graph edge {edge_id}, whose template \
                             {:?} is not one of the certified reverse-family turns",
                            edge.template_id
                        ),
                    ));
                }
            }
            _ => {
                let Some(lane_id) = section.lane_id else {
                    return Err(reject(
                        Reason::PatternProvenance,
                        format!(
                            "graph section {index} is {:?} but names no lane",
                            section.kind
                        ),
                    ));
                };
                check_section_on_lane(index, section, lane_id, context)?;
                let lanes = if section.kind == SectionKind::Inward {
                    &mut inward_lanes
                } else {
                    &mut return_lanes
                };
                if lanes.last() != Some(&lane_id) {
                    lanes.push(lane_id);
                }
            }
        }
    }

    // In practice this only ever catches `turn_blocks == 0`: a *second* turn
    // block is already impossible, because it would have to follow a `Return`
    // section, which the phase-monotonicity check above rejects first
    // (`Turn` is phase 1, `Return` phase 2). Kept as a real check rather than
    // folded into "is there a turn at all", because "exactly one turn" is the
    // property design spec §11 states and the two mechanisms enforcing it sit
    // in different places.
    if turn_blocks != 1 {
        return Err(reject(
            Reason::PatternProvenance,
            format!("a spiral has exactly one turn section; found {turn_blocks}"),
        ));
    }
    if inward_lanes.is_empty() || return_lanes.is_empty() {
        return Err(reject(
            Reason::PatternProvenance,
            "a spiral needs at least one inward ring and one return ring",
        ));
    }
    check_alternation(&inward_lanes, "inward")?;
    let mut descending = return_lanes.clone();
    descending.reverse();
    check_alternation(&descending, "return")?;

    let occupied: BTreeSet<u32> = inward_lanes.iter().copied().collect();
    for lane_id in &return_lanes {
        if occupied.contains(lane_id) {
            return Err(reject(
                Reason::PatternProvenance,
                format!("return ring {lane_id} is also walked by the inward arm"),
            ));
        }
        if !occupied.contains(&lane_id.saturating_sub(1)) || *lane_id == 0 {
            return Err(reject(
                Reason::PatternProvenance,
                format!("return ring {lane_id} is not the ring reserved beside an occupied ring"),
            ));
        }
    }
    // Where the turn must land: on the innermost ring the arm actually
    // reserved. Entering ring `k` reserves ring `k + 1`
    // (`spiral::reserved_ring_ids`), so that is `innermost + 1` whenever that
    // ring exists at all -- and `innermost - 1` when it does not, which is
    // the full-depth arm's case (arm `[0,2,4,6]` on seven rings reserves
    // `{1,3,5}`; there is no ring 7, so the turn goes to 5).
    let innermost_occupied = *inward_lanes.last().expect("checked non-empty");
    let inner_ring_exists = context
        .lanes
        .iter()
        .any(|lane| lane.id == innermost_occupied + 1);
    let expected_first_return = if inner_ring_exists {
        innermost_occupied + 1
    } else {
        innermost_occupied.saturating_sub(1)
    };
    let first_return = return_lanes[0];
    if first_return != expected_first_return {
        return Err(reject(
            Reason::PatternProvenance,
            format!(
                "the turn must land on ring {expected_first_return}, the innermost ring the arm \
                 reserved beside its own innermost ring {innermost_occupied}; the return starts \
                 on ring {first_return}"
            ),
        ));
    }
    Ok(())
}

/// Ascending, in steps of exactly two -- the spiral's own "occupy every other
/// ring" rule (`spiral.rs`'s module doc), applied to the arm as walked and to
/// the return arm read innermost-outward.
fn check_alternation(lanes: &[u32], label: &str) -> Result<(), LoopError> {
    for pair in lanes.windows(2) {
        if pair[1] != pair[0] + 2 {
            return Err(reject(
                Reason::PatternProvenance,
                format!(
                    "{label} rings must step by two; {} is followed by {}",
                    pair[0], pair[1]
                ),
            ));
        }
    }
    Ok(())
}

/// Whether the section's claimed edge really walks the ring it names: both of
/// its endpoints must sit on that lane's own channel rectangle.
fn check_section_on_lane(
    index: usize,
    section: &LoopSection,
    lane_id: u32,
    context: &LoopContext,
) -> Result<(), LoopError> {
    let Some(lane) = context.lanes.iter().find(|lane| lane.id == lane_id) else {
        return Err(reject(
            Reason::PatternProvenance,
            format!("graph section {index} names ring {lane_id}, which does not exist"),
        ));
    };
    let edge_id = section.edge_id.expect("graph sections carry an edge id");
    let edge = find_edge(context.graph, edge_id).expect("edge existence checked by provenance");
    let on_ring = point_on_rect_boundary(edge.start.local_pose.point, &lane.rect_local)
        && point_on_rect_boundary(edge.end.local_pose.point, &lane.rect_local);
    if !on_ring {
        return Err(reject(
            Reason::PatternProvenance,
            format!(
                "graph section {index} claims ring {lane_id}, but edge {edge_id} does not walk it"
            ),
        ));
    }
    Ok(())
}

/// Whether `point` (plate-local) sits on one of `rect`'s four channel sides.
/// Same predicate as `spiral::point_on_rect_boundary`, which is private to
/// that module; `circuit`'s modules keep such small geometric predicates
/// local rather than widening a sibling's API (see `spiral::opposite_heading`
/// for the same choice).
fn point_on_rect_boundary(point: Point, rect: &RectMm) -> bool {
    let eps = PROVENANCE_POSITION_TOLERANCE_MM;
    let on_vertical_side = (point.x - rect.min.x).abs() < eps || (point.x - rect.max.x).abs() < eps;
    let on_horizontal_side =
        (point.y - rect.min.y).abs() < eps || (point.y - rect.max.y).abs() < eps;
    let within_y = point.y >= rect.min.y - eps && point.y <= rect.max.y + eps;
    let within_x = point.x >= rect.min.x - eps && point.x <= rect.max.x + eps;
    (on_vertical_side && within_y) || (on_horizontal_side && within_x)
}

// ---------------------------------------------------------------------------
// Zone discipline: how far free-form geometry may reach, and where it may
// meet the certified graph
// ---------------------------------------------------------------------------

/// Design spec §4's two structural rules for the connection zone, neither of
/// which the automaton can express:
///
/// 1. **Bounds.** Free-form geometry is bounded by the zone rectangle grown
///    by [`ENTRY_RING_MM`] -- the very ring `build_graph_view` searched for
///    anchors. Not the bare rectangle: a connector necessarily leaves it to
///    reach an anchor (`zone::attach_port`'s own doc). Without this rule a
///    "zone" section is spatially unbounded and could route uncertified
///    geometry across the whole room, which is exactly what edge provenance
///    exists to prevent everywhere else.
/// 2. **Anchors.** Each zone-graph junction must land on a real graph node
///    that `build_graph_view` listed as an entry candidate -- design spec
///    §4's "Übergänge Zone ↔ Graph nur an Pose-Ankern auf dem Zonenrand".
fn check_zone_discipline(
    candidate: &LoopCandidate,
    context: &LoopContext,
) -> Result<(), LoopError> {
    let transform = context.transform();
    let allowed = expand_rect(&context.zone.rect_local, ENTRY_RING_MM);
    for (index, section) in candidate.sections.iter().enumerate() {
        if section.kind != SectionKind::Zone {
            continue;
        }
        for primitive in &section.primitives {
            let bounds = transform.primitive_to_local(primitive).bounds();
            if !rect_contains_rect(&allowed, &bounds) {
                return Err(reject_at(
                    Reason::ZoneBounds,
                    format!(
                        "zone section {index} routes free-form geometry outside the connection \
                         zone's own {ENTRY_RING_MM:.0} mm anchor ring"
                    ),
                    primitive.point_at(0.5),
                ));
            }
        }
    }

    let anchors: BTreeSet<u32> = context.view.entry_candidates.iter().copied().collect();
    let sections = &candidate.sections;
    let junctions = [
        end_of(
            sections[0]
                .primitives
                .last()
                .expect("structure check rejects empty sections"),
        ),
        start_of(&sections[sections.len() - 1].primitives[0]),
    ];
    for junction in junctions {
        let anchored = context
            .graph
            .nodes
            .iter()
            .any(|node| anchors.contains(&node.id) && same_point(node.world_point, junction));
        if !anchored {
            return Err(reject_at(
                Reason::ZoneAnchor,
                "a zone-graph transition does not sit on a certified entry anchor",
                junction,
            ));
        }
    }
    Ok(())
}

fn rect_contains_rect(outer: &RectMm, inner: &crate::geometry::Aabb) -> bool {
    let eps = PROVENANCE_POSITION_TOLERANCE_MM;
    inner.min.x >= outer.min.x - eps
        && inner.max.x <= outer.max.x + eps
        && inner.min.y >= outer.min.y - eps
        && inner.max.y <= outer.max.y + eps
}

fn expand_rect(rect: &RectMm, margin_mm: f64) -> RectMm {
    RectMm {
        min: Point::new(rect.min.x - margin_mm, rect.min.y - margin_mm),
        max: Point::new(rect.max.x + margin_mm, rect.max.y + margin_mm),
    }
}

// ---------------------------------------------------------------------------
// Zone automaton
// ---------------------------------------------------------------------------

/// Design spec §11's second bullet, measured on the geometry: the arc-length
/// intervals in which the path lies inside the zone rectangle must be exactly
/// two, the first starting at the path's start and the second ending at its
/// end. See the module doc for why this is not a per-section containment
/// rule.
fn check_zone_automaton(
    primitives: &[PathPrimitive],
    context: &LoopContext,
) -> Result<(), LoopError> {
    let (intervals, total) = inside_zone_intervals(primitives, context);
    if intervals.len() != 2 {
        return Err(reject(
            Reason::ZoneAutomaton,
            format!(
                "the path must be inside the connection zone in exactly two stretches, one at each end; found {}",
                intervals.len()
            ),
        ));
    }
    let tolerance = PROVENANCE_POSITION_TOLERANCE_MM;
    if intervals[0].0 > tolerance {
        return Err(reject(
            Reason::ZoneAutomaton,
            "the path does not start inside the connection zone",
        ));
    }
    if intervals[1].1 < total - tolerance {
        return Err(reject(
            Reason::ZoneAutomaton,
            "the path does not end inside the connection zone",
        ));
    }
    Ok(())
}

/// The merged arc-length intervals in which the path lies inside the zone
/// rectangle, and its total length.
///
/// Measured on the candidate's own primitives rather than the canonicalized
/// path: the automaton runs before the continuity gate (see the module doc),
/// and merging collinear neighbours would in any case hide nothing but change
/// indices.
///
/// Each primitive is split at its crossings with the rectangle's
/// four sides (exactly, via `primitive_intersections`), and each resulting
/// piece is classified by its own midpoint -- so a primitive that dips in and
/// out mid-span is seen, which an endpoint-only test would miss.
fn inside_zone_intervals(
    primitives: &[PathPrimitive],
    context: &LoopContext,
) -> (Vec<(f64, f64)>, f64) {
    let sides = zone_sides_world(context.zone, context.transform());
    let mut intervals: Vec<(f64, f64)> = Vec::new();
    let mut prefix = 0.0_f64;
    for primitive in primitives {
        let length = primitive.length();
        let mut cuts = vec![0.0_f64, 1.0_f64];
        for side in &sides {
            for hit in primitive_intersections(primitive, side).points() {
                cuts.push(hit.a_t.clamp(0.0, 1.0));
            }
        }
        cuts.sort_by(f64::total_cmp);
        for pair in cuts.windows(2) {
            let (from, to) = (pair[0], pair[1]);
            if to - from <= f64::EPSILON {
                continue;
            }
            let midpoint = primitive.point_at((from + to) * 0.5);
            if !zone_contains_local(context.zone, context.transform().to_local(midpoint)) {
                continue;
            }
            let piece = (prefix + from * length, prefix + to * length);
            match intervals.last_mut() {
                Some(last) if piece.0 - last.1 <= PROVENANCE_POSITION_TOLERANCE_MM => {
                    last.1 = piece.1;
                }
                _ => intervals.push(piece),
            }
        }
        prefix += length;
    }
    (intervals, prefix)
}

/// The zone rectangle's four sides as world-space segments. The rectangle is
/// axis-parallel in the plate frame only; in world space it is a rotated
/// rectangle, so its corners are transformed rather than its extents.
fn zone_sides_world(zone: &ConnectionZone, transform: &PlateTransform) -> [PathPrimitive; 4] {
    let rect = &zone.rect_local;
    let corners = [
        transform.to_world(Point::new(rect.min.x, rect.min.y)),
        transform.to_world(Point::new(rect.max.x, rect.min.y)),
        transform.to_world(Point::new(rect.max.x, rect.max.y)),
        transform.to_world(Point::new(rect.min.x, rect.max.y)),
    ];
    [
        PathPrimitive::Line {
            start: corners[0],
            end: corners[1],
        },
        PathPrimitive::Line {
            start: corners[1],
            end: corners[2],
        },
        PathPrimitive::Line {
            start: corners[2],
            end: corners[3],
        },
        PathPrimitive::Line {
            start: corners[3],
            end: corners[0],
        },
    ]
}

// ---------------------------------------------------------------------------
// Ports, radius, containment, crossings
// ---------------------------------------------------------------------------

/// Design spec §5's topology rule: one open path, port to port. Either
/// assignment is accepted -- which port a loop leaves from is a naming
/// choice, not a geometric property.
fn check_ports(path: &CanonicalPath, context: &LoopContext) -> Result<(), LoopError> {
    let primitives = path.primitives();
    let start = start_of(&primitives[0]);
    let end = end_of(&primitives[primitives.len() - 1]);
    let zone = context.zone;
    let forward = same_point(start, zone.start_port) && same_point(end, zone.end_port);
    let backward = same_point(start, zone.end_port) && same_point(end, zone.start_port);
    if forward || backward {
        return Ok(());
    }
    Err(reject_at(
        Reason::PortEndpoints,
        "the path does not run from one connection port to the other",
        start,
    ))
}

fn check_bend_radius(path: &CanonicalPath) -> Result<f64, LoopError> {
    let mut minimum = f64::INFINITY;
    for primitive in path.primitives() {
        if let PathPrimitive::Arc {
            radius_mm, start, ..
        } = primitive
        {
            minimum = minimum.min(*radius_mm);
            if *radius_mm < MIN_RADIUS_MM - PROVENANCE_POSITION_TOLERANCE_MM {
                return Err(reject_at(
                    Reason::BendRadius,
                    format!(
                        "an arc bends at {radius_mm:.3} mm, below the {MIN_RADIUS_MM:.0} mm floor"
                    ),
                    *start,
                ));
            }
        }
    }
    Ok(minimum)
}

/// Design spec §5: the path lies entirely inside the room. The two ports sit
/// exactly on the polygon boundary by construction, so a contact there is not
/// an escape; every other contact is.
fn check_inside_polygon(path: &CanonicalPath, context: &LoopContext) -> Result<(), LoopError> {
    let polygon = context.polygon();
    let ports = [context.zone.start_port, context.zone.end_port];
    for primitive in path.primitives() {
        let midpoint = primitive.point_at(0.5);
        if polygon.classify_point(midpoint) == PointClassification::Outside {
            return Err(reject_at(
                Reason::PolygonEscape,
                "the path leaves the room polygon",
                midpoint,
            ));
        }
        for edge_index in 0..polygon.original_edge_count() {
            let (edge_start, edge_end) = polygon.original_edge(edge_index);
            let wall = PathPrimitive::Line {
                start: edge_start,
                end: edge_end,
            };
            match primitive_intersections(primitive, &wall) {
                Intersection::None => {}
                Intersection::Points(points) => {
                    if let Some(hit) = points
                        .iter()
                        .find(|hit| ports.iter().all(|port| !same_point(hit.point, *port)))
                    {
                        return Err(reject_at(
                            Reason::PolygonEscape,
                            "the path touches a wall away from its ports",
                            hit.point,
                        ));
                    }
                }
                Intersection::Overlap => {
                    return Err(reject_at(
                        Reason::PolygonEscape,
                        "the path runs along a wall",
                        midpoint,
                    ));
                }
            }
        }
    }
    Ok(())
}

/// Design spec §5's nopp rule: the path must clear every expanded nopp body
/// that survived `zone::filter_zone_nopps`, by the profile's laying
/// tolerance.
///
/// The graph sections inherit this from their edges' own plate certification,
/// which edge provenance already pins -- but the free-form zone connectors do
/// not, and `filter_zone_nopps` only clears the zone *rectangle*, while a
/// connector reaches into the anchor ring outside it. `zone::attach_port`
/// certifies the connectors it builds; nothing certifies connectors built any
/// other way, so the validator does it here rather than trusting the
/// generator's choice of constructor. Same predicate and same sign convention
/// as `attach_port`'s own check.
fn check_nopp_clearance(path: &CanonicalPath, context: &LoopContext) -> Result<(), LoopError> {
    let tolerance_mm = context.instance.profile.laying_tolerance_mm;
    for primitive in path.primitives() {
        // The nopp list is thousands of entries on a real room and the path
        // is hundreds of primitives, so reject the overwhelming majority by
        // bounding box before running the analytic clearance.
        let bounds = primitive.bounds();
        for nopp in &context.instance.nopps {
            let reach = nopp.forbidden_radius_mm + tolerance_mm;
            if nopp.center.x < bounds.min.x - reach
                || nopp.center.x > bounds.max.x + reach
                || nopp.center.y < bounds.min.y - reach
                || nopp.center.y > bounds.max.y + reach
            {
                continue;
            }
            let clearance_mm =
                primitive_circle_clearance(primitive, nopp.center, nopp.forbidden_radius_mm);
            if clearance_mm < -tolerance_mm {
                return Err(reject_at(
                    Reason::NoppClearance,
                    format!(
                        "the path overlaps an expanded nopp body by {:.3} mm, more than the \
                         {tolerance_mm} mm laying tolerance",
                        -clearance_mm
                    ),
                    nopp.center,
                ));
            }
        }
    }
    Ok(())
}

/// Design spec §5's crossing rule: no self-intersection and no contact
/// between non-adjacent parts. Adjacent primitives are skipped because they
/// share an endpoint by construction; everything two or more steps apart must
/// not meet at all. This is what protects *local* geometry, which the 16 mm
/// and 50 mm rules cannot apply to (see the module doc).
fn check_self_intersections(path: &CanonicalPath) -> Result<(), LoopError> {
    let primitives = path.primitives();
    for first in 0..primitives.len() {
        for second in (first + 2)..primitives.len() {
            match primitive_intersections(&primitives[first], &primitives[second]) {
                Intersection::None => {}
                Intersection::Points(points) => {
                    let witness = points
                        .first()
                        .map(|hit| hit.point)
                        .unwrap_or_else(|| primitives[first].point_at(0.5));
                    return Err(reject_at(
                        Reason::SelfIntersection,
                        format!("path primitives {first} and {second} touch or cross"),
                        witness,
                    ));
                }
                Intersection::Overlap => {
                    return Err(reject_at(
                        Reason::SelfIntersection,
                        format!("path primitives {first} and {second} overlap"),
                        primitives[first].point_at(0.5),
                    ));
                }
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Nonlocal spacing
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct SpacingReport {
    minimum: LocatedSpacing,
    penalty_sum_mm: f64,
    worst_penalty: Option<LocatedSpacing>,
}

/// Design spec §5's hard minimum distance and §11's fourth bullet's soft
/// 50 mm rule. Two separate sweeps over the same primitive pairs, because
/// they are two different rules over two different pair sets:
///
/// - **The 16 mm centre-centre floor is unconditional.** It applies to every
///   pair of primitives at least two steps apart in the path, measured over
///   their whole extent, whether or not they are local. Locality is a
///   *pattern* notion -- design spec §7 permits the nominal spacing to be
///   undershot inside a Kehre -- but "bis zur physischen Nichtberührung"
///   states the physical floor still holds there, and two passes of a 16 mm
///   pipe 5 mm apart are overlapping tubes no matter how close together they
///   are along the path. Only *adjacent* primitives are exempt, and for a
///   structural reason that has nothing to do with locality: they share an
///   endpoint by construction, so their distance is identically zero. That is
///   the same pair set `check_self_intersections` scans.
/// - **The 50 mm soft rule is nonlocal-only.** It is the nominal laying
///   distance, which a minimum-radius turn legitimately undershoots, so it is
///   measured only where the two points are at least `LOCAL_ARC_LENGTH_MM`
///   apart along the path (see [`pair_ranges`]), and each qualifying pair
///   contributes its own measured minimum once.
fn measure_spacing(path: &CanonicalPath) -> Result<SpacingReport, LoopError> {
    let primitives = path.primitives();
    let prefix = path.prefix_lengths();
    let mut minimum: Option<LocatedSpacing> = None;
    let mut penalty_sum_mm = 0.0;
    let mut worst_penalty: Option<LocatedSpacing> = None;

    for first in 0..primitives.len() {
        // The hard floor: every pair at least two steps apart, whole extent.
        for second in (first + 2)..primitives.len() {
            let closest = primitive_distance(
                &primitives[first],
                ParameterRange::FULL,
                &primitives[second],
                ParameterRange::FULL,
            );
            let located = LocatedSpacing {
                distance_mm: closest.distance_mm,
                first_point: closest.point_on_a,
                second_point: closest.point_on_b,
            };
            if minimum
                .as_ref()
                .is_none_or(|best| located.distance_mm < best.distance_mm)
            {
                minimum = Some(located);
            }
        }
        // The soft rule: nonlocal pairs only, including the adjacent pair
        // (which `pair_ranges` will class as local and skip, but is included
        // for completeness rather than assumed away).
        for second in (first + 1)..primitives.len() {
            let ranges = pair_ranges(
                prefix[first],
                primitives[first].length(),
                prefix[second],
                primitives[second].length(),
            );
            let mut pair_minimum: Option<LocatedSpacing> = None;
            for (first_range, second_range) in ranges {
                let closest = primitive_distance(
                    &primitives[first],
                    first_range,
                    &primitives[second],
                    second_range,
                );
                let located = LocatedSpacing {
                    distance_mm: closest.distance_mm,
                    first_point: closest.point_on_a,
                    second_point: closest.point_on_b,
                };
                if pair_minimum
                    .as_ref()
                    .is_none_or(|best| located.distance_mm < best.distance_mm)
                {
                    pair_minimum = Some(located);
                }
            }
            let Some(pair_minimum) = pair_minimum else {
                continue;
            };
            let penalty = (MIN_NONLOCAL_SPACING_MM - pair_minimum.distance_mm).max(0.0);
            if penalty > 0.0 {
                penalty_sum_mm += penalty;
                if worst_penalty
                    .as_ref()
                    .is_none_or(|worst| pair_minimum.distance_mm < worst.distance_mm)
                {
                    worst_penalty = Some(pair_minimum);
                }
            }
        }
    }

    let Some(minimum) = minimum else {
        return Err(reject(
            Reason::CenterDistance,
            "a loop needs at least three primitives before any two of them are far enough \
             apart in the path to be measured against each other",
        ));
    };
    let floor_mm = PIPE_DIAMETER_MM + TOUCHING_RESERVE_MM;
    if minimum.distance_mm <= floor_mm {
        return Err(reject_at(
            Reason::CenterDistance,
            format!(
                "two parts of the path are {:.3} mm apart centre to centre, at or below the \
                 {floor_mm:.2} mm physical floor",
                minimum.distance_mm
            ),
            minimum.first_point,
        ));
    }
    Ok(SpacingReport {
        minimum,
        penalty_sum_mm,
        worst_penalty,
    })
}

/// The parameter ranges of a primitive pair that are guaranteed nonlocal.
///
/// Two points are nonlocal when they are at least `LOCAL_ARC_LENGTH_MM` apart
/// *along the path*. For a pair `(first, second)` with `first` earlier, that
/// is the half-plane `s_second − s_first ≥ L` inside the unit parameter
/// square. This function returns rectangles covering it:
///
/// - **Fully local pair** (even the pair's farthest-apart points are closer
///   than `L` along the path): empty -- exact, the pair is exempt.
/// - **Fully nonlocal pair** (even the pair's closest-together points are `L`
///   apart along the path): the whole square -- exact.
/// - **Straddling pair**: [`STRADDLING_PAIR_SLICES`] rectangles, each wholly
///   inside the half-plane, covering all of it except slivers of parameter
///   width `1/slices` along the locality boundary.
///
/// The slivers cannot hide a violation, and that is provable rather than
/// hopeful. By the time `measure_spacing` runs, `canonicalize_path` has
/// certified G1 continuity (step 5) and `check_bend_radius` has certified
/// every arc at radius >= `MIN_RADIUS_MM` (step 7), so the path's curvature
/// radius is at least `R = 80` mm everywhere (lines have curvature zero).
/// For such a path, two points at arc-length separation `s <= pi*R` are at
/// least `2*R*sin(s / 2R)` apart in space -- the circular arc of radius `R`
/// is the shape that minimises the chord. `LOCAL_ARC_LENGTH_MM` is exactly
/// `pi*R`, so *at* the locality boundary the smallest possible chord is
/// `2R = 160` mm; the missed slivers only ever contain pairs at `s` barely
/// above that boundary, hence chords of ~159 mm and up. That is an order of
/// magnitude above both the 16 mm floor and the 50 mm penalty threshold, so
/// no rejection and no penalty can live in a sliver.
///
/// The cover is deliberately inside the half-plane rather than around it: the
/// opposite error (measuring the *local* part of a straddling pair) would
/// reject every minimum-radius turn, whose two halves pass within
/// millimetres of each other by construction. Pairs that matter physically --
/// two different passes of the pipe -- are separated by thousands of
/// millimetres along the path and land in the exact "fully nonlocal" case.
fn pair_ranges(
    first_prefix_mm: f64,
    first_length_mm: f64,
    second_prefix_mm: f64,
    second_length_mm: f64,
) -> Vec<(ParameterRange, ParameterRange)> {
    let closest_separation_mm = second_prefix_mm - (first_prefix_mm + first_length_mm);
    let farthest_separation_mm = (second_prefix_mm + second_length_mm) - first_prefix_mm;
    if farthest_separation_mm < LOCAL_ARC_LENGTH_MM {
        return Vec::new();
    }
    if closest_separation_mm >= LOCAL_ARC_LENGTH_MM {
        return vec![(ParameterRange::FULL, ParameterRange::FULL)];
    }
    if second_length_mm <= 0.0 {
        return Vec::new();
    }
    let slices = STRADDLING_PAIR_SLICES as f64;
    let mut ranges = Vec::new();
    for slice in 0..STRADDLING_PAIR_SLICES {
        let first_from = slice as f64 / slices;
        let first_to = (slice + 1) as f64 / slices;
        // Worst case inside this slice: `first` as late as it gets.
        let required_second_mm =
            first_prefix_mm + first_to * first_length_mm + LOCAL_ARC_LENGTH_MM - second_prefix_mm;
        let second_from = required_second_mm / second_length_mm;
        if second_from > 1.0 {
            continue;
        }
        ranges.push((
            ParameterRange::new(first_from, first_to),
            ParameterRange::new(second_from.max(0.0), 1.0),
        ));
    }
    ranges
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

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

#[cfg(test)]
mod spacing_rule_tests {
    //! The two spacing rules differ in *which pairs they apply to*, and that
    //! difference is only observable from inside the module: `certify_loop`
    //! gates on G1 continuity and the 80 mm bend radius before it ever
    //! measures, and on such a path two points closer than 16 mm in space are
    //! necessarily within ~16 mm of each other along the path too (the chord
    //! bound in `pair_ranges`' doc, read backwards). So a *local* pair below
    //! the floor cannot be reached through the public entry point at all --
    //! which is exactly why the rule must not quietly depend on locality.
    //! These build the `CanonicalPath` directly.
    use super::*;
    use crate::geometry::CanonicalPath;

    /// Two parallel legs `gap_mm` apart, joined by a short cross leg. The
    /// legs are 100 mm so that even the pair's farthest-apart points are
    /// `2 * 100 + gap < 80*pi` apart along the path: the pair is *entirely*
    /// local, which `pair_ranges` skips outright. Anything these tests
    /// observe therefore comes from the unconditional floor, not from the
    /// nonlocal sweep.
    fn hairpin(gap_mm: f64) -> CanonicalPath {
        CanonicalPath::from_connected(vec![
            PathPrimitive::Line {
                start: Point::new(100.0, 0.0),
                end: Point::new(0.0, 0.0),
            },
            PathPrimitive::Line {
                start: Point::new(0.0, 0.0),
                end: Point::new(0.0, gap_mm),
            },
            PathPrimitive::Line {
                start: Point::new(0.0, gap_mm),
                end: Point::new(100.0, gap_mm),
            },
        ])
    }

    #[test]
    fn the_hairpin_pair_really_is_local() {
        // Guards the two tests below: if this ever became a straddling pair,
        // they would silently start proving the nonlocal sweep instead.
        assert!(pair_ranges(0.0, 100.0, 130.0, 100.0).is_empty());
    }

    #[test]
    fn the_touching_floor_applies_to_local_pairs_too() {
        let error = measure_spacing(&hairpin(10.0))
            .expect_err("10 mm centre-centre is overlapping pipe, local or not");
        assert!(
            error.message.starts_with("CENTER_DISTANCE"),
            "got: {}",
            error.message
        );
    }

    #[test]
    fn a_local_pair_above_the_floor_is_accepted_without_penalty() {
        // The same shape at 30 mm: above the physical floor, below the 50 mm
        // nominal spacing -- but local, so the soft rule does not apply and
        // no penalty accrues. This is design spec §7's "lokale
        // Abstandsunterschreitung ... ist zulaessig".
        let report = measure_spacing(&hairpin(30.0)).expect("30 mm clears the physical floor");
        assert!((report.minimum.distance_mm - 30.0).abs() < 1e-6);
        assert_eq!(report.penalty_sum_mm, 0.0);
        assert!(report.worst_penalty.is_none());
    }
}

#[cfg(test)]
mod alternation_tests {
    //! `check_alternation` is only reachable through a candidate whose arm
    //! spans three or more rings; the integration fixture spans two, where
    //! `windows(2)` is empty and the check is vacuous. Pinned directly.
    use super::*;

    #[test]
    fn rings_two_apart_alternate() {
        assert!(check_alternation(&[0, 2, 4, 6], "inward").is_ok());
        assert!(check_alternation(&[0], "inward").is_ok());
        assert!(check_alternation(&[], "inward").is_ok());
    }

    #[test]
    fn consecutive_or_skipped_rings_do_not() {
        for broken in [vec![0, 1, 2], vec![0, 2, 5], vec![2, 0], vec![0, 2, 2]] {
            let error =
                check_alternation(&broken, "inward").expect_err("rings must step by exactly two");
            assert!(
                error.message.starts_with("PATTERN_PROVENANCE"),
                "got: {}",
                error.message
            );
        }
    }
}

#[cfg(test)]
mod pair_range_tests {
    //! `pair_ranges` is the one place the locality notion is turned into
    //! concrete parameter windows, and its three cases are only reachable
    //! indirectly through `certify_loop`. Pinned here, matching this crate's
    //! precedent for private invariants an integration test can only observe
    //! as a downstream symptom (`spiral.rs`'s `return_chain_tests`).
    use super::*;

    #[test]
    fn a_fully_local_pair_is_not_measured_at_all() {
        // Two 100 mm primitives 50 mm apart along the path: even end to end
        // they span 250 mm, just under 80π.
        assert!(pair_ranges(0.0, 100.0, 150.0, 100.0).is_empty());
    }

    #[test]
    fn a_fully_nonlocal_pair_is_measured_over_its_whole_extent() {
        let ranges = pair_ranges(0.0, 100.0, 5000.0, 100.0);
        assert_eq!(ranges.len(), 1);
        assert_eq!(ranges[0].0, ParameterRange::FULL);
        assert_eq!(ranges[0].1, ParameterRange::FULL);
    }

    #[test]
    fn a_straddling_pair_only_covers_parameters_that_are_really_nonlocal() {
        let (first_prefix, first_length) = (0.0, 400.0);
        let (second_prefix, second_length) = (400.0, 400.0);
        let ranges = pair_ranges(first_prefix, first_length, second_prefix, second_length);
        assert!(!ranges.is_empty());
        for (first_range, second_range) in ranges {
            // The worst corner of every returned rectangle -- `first` latest,
            // `second` earliest -- must still be nonlocal.
            let first_s = first_prefix + first_range.end * first_length;
            let second_s = second_prefix + second_range.start * second_length;
            assert!(
                second_s - first_s >= LOCAL_ARC_LENGTH_MM - 1e-9,
                "returned a range whose closest corner is local: {} vs {}",
                second_s - first_s,
                LOCAL_ARC_LENGTH_MM
            );
        }
    }
}
