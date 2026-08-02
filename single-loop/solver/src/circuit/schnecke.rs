//! The Schnecke: a bifilar double spiral, constructed rather than searched.
//!
//! [`spiral.rs`](super::spiral) plans the inward arm by backtracking over
//! *closed* lane rings and hopping from ring `k` to ring `k+2`. That model
//! cannot avoid crossing itself: the hop necessarily traverses ring `k+1`,
//! which the return arm occupies (`docs/superpowers/plans/
//! 2026-08-01-schnecke-offene-spiralbahnen.md` §1). This module replaces the
//! ring model for the spiral pattern with the thing a real Schnecke is — one
//! continuous spiral whose winding step is absorbed by a corner, laid twice,
//! the two arms interleaved half a pitch apart.
//!
//! ## What the plate actually admits (measured, not derived)
//!
//! Everything below was measured against the certified graph of the
//! 3000 × 2400 fixture, not read off the template table:
//!
//! - **A `BroadTurn90` corner joins any row channel to any column channel of
//!   the admissible parity.** Per heading pair there are 504 (entry, exit)
//!   channel pairs, and their parities fall into exactly two classes:
//!   `Deg0→Deg90`, `Deg90→Deg0`, `Deg180→Deg270` and `Deg270→Deg180` need
//!   entry and exit channel indices of the *same* parity; the other four
//!   need *opposite* parity. The corner does not care how far apart the two
//!   rings are, which is the whole point: **a rectangular spiral needs no
//!   lateral shift along a side at all** — the corner absorbs the winding
//!   step. (The plan's §2 assumed a side-borne S-shift of two `BroadTurn45`
//!   was needed. It is not, and no chain through a `BroadTurn45` appears in
//!   the reachable set at all.)
//! - **Both arms' corners exist.** 473 of 504 placements per heading pair
//!   have a `(+1, +1)` channel-diagonal twin, which is exactly what the
//!   second arm — inset one channel on every side — needs.
//! - **The reverse family spans two channels or three, never one.**
//!   `TeardropReverse` bridges ±150 mm (2016 placements), `BroadReverse180`
//!   ±225 mm (1008). There is no 75 mm reverse and there cannot be: it would
//!   need a 37.5 mm bend radius against a 80 mm minimum.
//!
//! ## Why the innermost gap is widened
//!
//! Rings nest strictly, so the two ends of the turn-around are always
//! *adjacent* in the nesting order — there is no way to reach past a ring
//! without crossing it. The turn therefore spans exactly one nesting gap, and
//! that gap must be one the reverse family can bridge: two channels or three.
//!
//! At the requested pipe spacing that gap is `spacing`, which is only
//! bridgeable at 150 mm or 225 mm. So the innermost gap alone is set to
//! [`TURN_SPAN_ODD`] or [`TURN_SPAN_EVEN`] channels — whichever matches the
//! spacing's parity, because every step of the inward arm must be an even
//! number of channels for the corner parities to close. Every other gap keeps
//! the requested spacing. The cost is a free core in the middle of the room,
//! which is where the turn-around itself runs and, in the trade's own
//! reasoning, the warmest spot anyway.
//!
//! ## Why the arms cannot cross
//!
//! The two arms are one nesting sequence, not two independently occupied ring
//! sets: lane `2k` belongs to the inward arm, lane `2k+1` to the return, and
//! lane `j+1` is nested strictly inside lane `j`. The return's lane is
//! reserved structurally rather than checked, and no section of either arm
//! ever leaves its own lane except at a corner that steps to the next lane of
//! the *same* arm — a step that passes through the free lattice between two
//! rings, never across the other arm's ring (see `step_clears_the_other_arm`
//! in `tests/circuit_schnecke.rs`).

use std::collections::{BTreeMap, HashSet};

use crate::circuit::fields::{Field, Lane};
use crate::circuit::spiral::{SpiralEnds, SpiralPath};
use crate::circuit::types::{LoopError, LoopErrorCode, RectMm};
use crate::circuit::zone::{ConnectionZone, ENTRY_RING_MM, LoopGraphView, attach_port};
use crate::geometry::primitive_intersections;
use crate::model::{PathPrimitive, Point};
use crate::plate::{
    EmbeddedPoseGraph, Heading8, LocalPose, PlateInstance, PoseEdge, PoseNode, TemplateId,
};

/// Pipe channels sit midway between nopp rows: `CHANNEL_OFFSET_MM +
/// CHANNEL_PITCH_MM * index`. Same lattice as `fields.rs`'s, kept local for
/// the same reason that module keeps its own copy of the constants.
pub(crate) const CHANNEL_OFFSET_MM: f64 = 37.5;
pub(crate) const CHANNEL_PITCH_MM: f64 = 75.0;

/// How close a pose's coordinate must be to a channel line to count as on it.
/// Every coordinate in this lattice is an exact multiple of 37.5 mm, so this
/// only absorbs floating-point noise.
pub(crate) const CHANNEL_MATCH_TOLERANCE_MM: f64 = 1e-6;

/// The turn-around's span, in channels, when the pipe spacing is an odd
/// number of channels (75 mm, 225 mm, …). The inward arm's own step is even,
/// so the innermost gap must be odd for the two arms' parities to differ —
/// and the only odd reverse span the plate admits is three (`BroadReverse180`,
/// 225 mm).
const TURN_SPAN_ODD: i64 = 3;

/// The turn-around's span, in channels, when the pipe spacing is an even
/// number of channels (150 mm, 300 mm, …): two channels, `TeardropReverse`,
/// 150 mm.
const TURN_SPAN_EVEN: i64 = 2;

/// How far the turn-around's body must stay off the rows of the lane it turns
/// out of. The design spec's nominal minimum centre-to-centre distance (§5);
/// anything below it would be a spacing penalty even where it is not an
/// outright crossing.
const TURN_BODY_CLEARANCE_MM: f64 = 50.0;

/// A bound on how many straight segments one side of one revolution may take,
/// so a graph defect cannot spin the walk forever. A side is at most a room
/// wide and a `Straight0` is 150 mm, so this clears any real room by orders
/// of magnitude.
pub(crate) const MAX_STRAIGHTS_PER_SIDE: usize = 512;

/// One revolution's four channel indices. `bottom`/`top` are row indices,
/// `left`/`right` column indices, all on the shared 37.5 + 75n lattice.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Revolution {
    bottom: i64,
    top: i64,
    left: i64,
    right: i64,
}

impl Revolution {
    /// The same revolution inset by `steps` channels on all four sides.
    fn inset(self, steps: i64) -> Self {
        Self {
            bottom: self.bottom + steps,
            top: self.top - steps,
            left: self.left + steps,
            right: self.right - steps,
        }
    }

    fn rect(self) -> RectMm {
        RectMm {
            min: Point::new(channel_value(self.left), channel_value(self.bottom)),
            max: Point::new(channel_value(self.right), channel_value(self.top)),
        }
    }
}

/// A completed Schnecke: the nesting sequence of lanes it walks, and the one
/// chained path through them.
///
/// `lanes` is in nesting order — lane 0 outermost, each lane strictly inside
/// its predecessor — with even ids belonging to the inward arm and odd ids to
/// the return. That numbering is what makes the validator's ring algebra hold
/// without a translation layer: the inward arm reads `0, 2, 4, …`, the return
/// reads the odd ids innermost-outward, and every return lane `k` has its
/// `k-1` occupied.
#[derive(Clone, Debug, PartialEq)]
pub struct Schnecke {
    pub lanes: Vec<Lane>,
    pub path: SpiralPath,
}

/// Builds the Schnecke for `field` at `pipe_spacing_mm`, or reports why the
/// room does not admit one.
///
/// `pipe_spacing_mm` is the gap between the outbound and return runs and must
/// be a positive multiple of the 75 mm channel pitch (the nub raster is the
/// only place a pipe can sit). The two arms are laid one spacing apart
/// everywhere except across the turn-around, per this module's header.
pub fn build_schnecke(
    field: &Field,
    pipe_spacing_mm: f64,
    wall_clearance_mm: f64,
    graph: &EmbeddedPoseGraph,
    view: &LoopGraphView,
    zone: &ConnectionZone,
    instance: &PlateInstance,
) -> Result<Schnecke, LoopError> {
    let spacing_channels = spacing_in_channels(pipe_spacing_mm)?;
    let turn_span = if spacing_channels.rem_euclid(2) == 1 {
        TURN_SPAN_ODD
    } else {
        TURN_SPAN_EVEN
    };
    let index = GraphIndex::new(graph, view, zone, instance);

    // Both parities of the outermost ring are legal geometry; which one nests
    // deeper depends on the room's own dimensions, so try both and keep the
    // better. Ties go to the first, which is the one whose bottom row sits
    // closest to the wall.
    let mut best: Option<Schnecke> = None;
    let mut failure: Option<LoopError> = None;
    for outermost in outermost_candidates(field, wall_clearance_mm) {
        match build_from(outermost, spacing_channels, turn_span, &index) {
            Ok(schnecke) => {
                if best
                    .as_ref()
                    .is_none_or(|held| laid_edges(&held.path) < laid_edges(&schnecke.path))
                {
                    best = Some(schnecke);
                }
            }
            Err(error) => failure = failure.or(Some(error)),
        }
    }
    best.ok_or_else(|| {
        failure.unwrap_or_else(|| {
            no_geometry("the room admits no outermost spiral ring at this wall clearance")
        })
    })
}

/// The plate-local value of channel `index`.
pub(crate) fn channel_value(index: i64) -> f64 {
    CHANNEL_OFFSET_MM + CHANNEL_PITCH_MM * index as f64
}

fn spacing_in_channels(pipe_spacing_mm: f64) -> Result<i64, LoopError> {
    if !pipe_spacing_mm.is_finite() || pipe_spacing_mm <= 0.0 {
        return Err(no_geometry("the pipe spacing must be a positive length"));
    }
    let steps = pipe_spacing_mm / CHANNEL_PITCH_MM;
    if (steps - steps.round()).abs() > 1e-9 {
        return Err(no_geometry(
            "the pipe spacing must be a whole multiple of the 75 mm channel pitch",
        ));
    }
    Ok(steps.round() as i64)
}

pub(crate) fn no_geometry(message: impl Into<String>) -> LoopError {
    LoopError {
        code: LoopErrorCode::NoSolutionGeometry,
        message: message.into(),
        journal_tail: Vec::new(),
    }
}

/// The two outermost rings the room admits, one per parity class.
///
/// A revolution's four channels are not free of each other: reading the four
/// corner parity classes around the ring forces `right ≡ bottom`,
/// `top ≡ bottom + 1` and `left ≡ bottom + 1`. So the outermost ring is
/// determined by the parity of its bottom row, and there are exactly two
/// candidates — each snapped away from its wall, so honouring the lattice
/// never eats into the wall clearance.
fn outermost_candidates(field: &Field, wall_clearance_mm: f64) -> Vec<Revolution> {
    let rect = &field.rect_local;
    [0i64, 1]
        .into_iter()
        .filter_map(|bottom_parity| {
            let bottom = smallest_index_at_least(rect.min.y + wall_clearance_mm, bottom_parity)?;
            let top = largest_index_at_most(rect.max.y - wall_clearance_mm, 1 - bottom_parity)?;
            let left = smallest_index_at_least(rect.min.x + wall_clearance_mm, 1 - bottom_parity)?;
            let right = largest_index_at_most(rect.max.x - wall_clearance_mm, bottom_parity)?;
            (bottom < top && left < right).then_some(Revolution {
                bottom,
                top,
                left,
                right,
            })
        })
        .collect()
}

/// The smallest channel index of the given parity whose line is at least
/// `bound_mm` — "snap inward, never below the clearance the caller asked for".
pub(crate) fn smallest_index_at_least(bound_mm: f64, parity: i64) -> Option<i64> {
    let mut index = ((bound_mm - CHANNEL_OFFSET_MM) / CHANNEL_PITCH_MM).ceil() as i64;
    if index.rem_euclid(2) != parity {
        index += 1;
    }
    Some(index)
}

/// The largest channel index of the given parity whose line is at most
/// `bound_mm` — the far-wall mirror of [`smallest_index_at_least`].
pub(crate) fn largest_index_at_most(bound_mm: f64, parity: i64) -> Option<i64> {
    let mut index = ((bound_mm - CHANNEL_OFFSET_MM) / CHANNEL_PITCH_MM).floor() as i64;
    if index.rem_euclid(2) != parity {
        index -= 1;
    }
    Some(index)
}

/// The nesting sequence for one outermost ring: `count` lanes at the
/// requested spacing, then one innermost lane at the turn's own span.
///
/// The innermost lane belongs to the inward arm, so `count` — the number of
/// evenly-spaced lanes before it — is even, and the lane the turn lands on is
/// the last of them.
fn nesting_sequence(
    outermost: Revolution,
    spacing_channels: i64,
    turn_span: i64,
    count: usize,
) -> Vec<Revolution> {
    let mut lanes: Vec<Revolution> = (0..count)
        .map(|k| outermost.inset(spacing_channels * k as i64))
        .collect();
    if let Some(last) = lanes.last().copied() {
        lanes.push(last.inset(turn_span));
    }
    lanes
}

fn build_from(
    outermost: Revolution,
    spacing_channels: i64,
    turn_span: i64,
    index: &GraphIndex,
) -> Result<Schnecke, LoopError> {
    // How many evenly-spaced lanes could fit before the ring inverts. The
    // real stopping rule is "the graph has no corner there", applied below;
    // this only bounds the search.
    let height = outermost.top - outermost.bottom;
    let width = outermost.right - outermost.left;
    let room = height.min(width);
    let max_count = (room / (2 * spacing_channels).max(1)).max(0) as usize + 1;

    let mut failure: Option<LoopError> = None;
    let mut best: Option<Schnecke> = None;
    // Deepest first, but every depth is walked and the most pipe wins. A
    // deeper nesting is not automatically more floor covered: it can force the
    // turn onto an early side, and the sides the two innermost lanes then lose
    // can outweigh the extra revolution.
    for count in (1..=max_count).rev() {
        if count.rem_euclid(2) == 1 {
            // Lanes `0..count` are the evenly spaced ones and lane `count` is
            // the innermost, so the innermost belongs to the inward arm — even
            // id — exactly when `count` is even.
            continue;
        }
        let revolutions = nesting_sequence(outermost, spacing_channels, turn_span, count);
        match walk(&revolutions, index) {
            Ok(schnecke) => {
                if best
                    .as_ref()
                    .is_none_or(|held| laid_edges(&held.path) < laid_edges(&schnecke.path))
                {
                    best = Some(schnecke);
                }
            }
            // The deepest attempt's failure is the informative one: it says
            // what stopped the spiral from nesting one revolution further.
            Err(error) => failure = failure.or(Some(error)),
        }
    }
    best.ok_or_else(|| {
        failure.unwrap_or_else(|| no_geometry("the room is too small for a single revolution"))
    })
}

/// How many certified edges the loop lays. The ranking objective: at equal
/// legality, the Schnecke that puts more pipe on the floor is the better one,
/// and edge count stands in for length without needing the geometry.
fn laid_edges(path: &SpiralPath) -> usize {
    path.inward_edge_ids.len() + path.turn_edge_ids.len() + path.return_edge_ids.len()
}

// ---------------------------------------------------------------------------
// Graph access
// ---------------------------------------------------------------------------

/// The certified graph, indexed the two ways the walk reads it, plus
/// everything outside the graph the walk needs: the zone it must start and end
/// at, and the plate instance `attach_port` certifies connectors against.
pub(crate) struct GraphIndex<'a> {
    edges_by_start: BTreeMap<PoseKey, Vec<&'a PoseEdge>>,
    edges_by_id: BTreeMap<u32, &'a PoseEdge>,
    node_by_pose: BTreeMap<PoseKey, &'a PoseNode>,
    entry_candidates: HashSet<u32>,
    pub(crate) zone: &'a ConnectionZone,
    pub(crate) instance: &'a PlateInstance,
}

type PoseKey = (i64, i64, u8);

fn pose_key(pose: LocalPose) -> PoseKey {
    (
        (pose.point.x * 1000.0).round() as i64,
        (pose.point.y * 1000.0).round() as i64,
        pose.heading.octant(),
    )
}

impl<'a> GraphIndex<'a> {
    pub(crate) fn new(
        graph: &'a EmbeddedPoseGraph,
        view: &LoopGraphView,
        zone: &'a ConnectionZone,
        instance: &'a PlateInstance,
    ) -> Self {
        let usable: HashSet<u32> = view.usable_edges.iter().copied().collect();
        let mut edges_by_start: BTreeMap<PoseKey, Vec<&PoseEdge>> = BTreeMap::new();
        for edge in graph.edges.iter().filter(|edge| usable.contains(&edge.id)) {
            edges_by_start
                .entry(pose_key(edge.start.local_pose))
                .or_default()
                .push(edge);
        }
        for edges in edges_by_start.values_mut() {
            edges.sort_unstable_by_key(|edge| edge.id);
        }
        let mut node_by_pose: BTreeMap<PoseKey, &PoseNode> = BTreeMap::new();
        for node in &graph.nodes {
            node_by_pose
                .entry(pose_key(node.local_pose))
                .and_modify(|best| {
                    if node.id < best.id {
                        *best = node;
                    }
                })
                .or_insert(node);
        }
        let edges_by_id = edges_by_start
            .values()
            .flatten()
            .map(|edge| (edge.id, *edge))
            .collect();
        Self {
            edges_by_start,
            edges_by_id,
            node_by_pose,
            entry_candidates: view.entry_candidates.iter().copied().collect(),
            zone,
            instance,
        }
    }

    /// Whether a zone connector from `port` to `anchor` really exists.
    ///
    /// The same three conditions `spiral::ZoneReach` checks, for the same
    /// reason: the generator should aim at the validator's contract rather
    /// than discover it at certification time. The anchor must be one of the
    /// zone's own entry candidates, `attach_port` must build a connector to it
    /// that clears the room and the noppen, and that connector must stay
    /// inside the zone rectangle grown by [`ENTRY_RING_MM`].
    pub(crate) fn connector_exists(&self, port: Point, anchor: &PoseNode) -> bool {
        if !self.entry_candidates.contains(&anchor.id) {
            return false;
        }
        let Ok(attachment) = attach_port(port, self.zone.inward, anchor, self.instance) else {
            return false;
        };
        let bounds = expand_rect(&self.zone.rect_local, ENTRY_RING_MM);
        attachment.primitives.iter().all(|primitive| {
            let local = self
                .instance
                .transform
                .primitive_to_local(primitive)
                .bounds();
            local.min.x >= bounds.min.x
                && local.max.x <= bounds.max.x
                && local.min.y >= bounds.min.y
                && local.max.y <= bounds.max.y
        })
    }

    /// Whether the node at `pose` can be connected to `port`.
    pub(crate) fn reaches(&self, pose: LocalPose, port: Point) -> bool {
        self.node(pose)
            .is_some_and(|node| self.connector_exists(port, node))
    }
}

/// The same pose, traversed the other way round.
///
/// The exit connector is built port → anchor and then traversed backwards by
/// the loop, so it has to leave the anchor along the direction the return arm
/// arrives with — which makes the anchor the *pose-flip* of the node the walk
/// stops on. Same rule as `spiral::SpiralEnds`' own.
pub(crate) fn flip(pose: LocalPose) -> LocalPose {
    LocalPose::new(pose.point, Heading8::from_octant(pose.heading.octant() + 4))
}

/// `rect` grown by `margin_mm` on every side. Same arithmetic as `zone.rs`'s
/// own private `expand_rect`; `circuit`'s modules keep such small geometric
/// helpers local rather than widening a sibling's API.
fn expand_rect(rect: &RectMm, margin_mm: f64) -> RectMm {
    RectMm {
        min: Point::new(rect.min.x - margin_mm, rect.min.y - margin_mm),
        max: Point::new(rect.max.x + margin_mm, rect.max.y + margin_mm),
    }
}

impl<'a> GraphIndex<'a> {
    pub(crate) fn departing(&self, pose: LocalPose) -> &[&'a PoseEdge] {
        self.edges_by_start
            .get(&pose_key(pose))
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn node(&self, pose: LocalPose) -> Option<&'a PoseNode> {
        self.node_by_pose.get(&pose_key(pose)).copied()
    }

    /// Every certified node pose, in id order.
    pub(crate) fn node_poses(&self) -> impl Iterator<Item = LocalPose> + '_ {
        self.node_by_pose.values().map(|node| node.local_pose)
    }

    pub(crate) fn node_by_id(&self, id: u32) -> Option<&'a PoseNode> {
        self.node_by_pose
            .values()
            .copied()
            .find(|node| node.id == id)
    }

    pub(crate) fn edge_by_id(&self, id: u32) -> Option<&'a PoseEdge> {
        self.edges_by_id.get(&id).copied()
    }

    /// The single `Straight0` leaving `pose`, if the graph has one.
    pub(crate) fn straight(&self, pose: LocalPose) -> Option<&'a PoseEdge> {
        self.departing(pose)
            .iter()
            .copied()
            .find(|edge| edge.template_id == TemplateId::Straight0)
    }

    /// Every edge of `template` leaving `pose`, ascending by id.
    pub(crate) fn leaving_with(&self, pose: LocalPose, template: TemplateId) -> Vec<&'a PoseEdge> {
        self.departing(pose)
            .iter()
            .copied()
            .filter(|edge| edge.template_id == template)
            .collect()
    }
}

/// Which coordinate of a pose a heading holds constant: the row for an
/// east/west heading, the column for a north/south one.
fn channel_of(pose: LocalPose) -> Option<f64> {
    match pose.heading {
        Heading8::Deg0 | Heading8::Deg180 => Some(pose.point.y),
        Heading8::Deg90 | Heading8::Deg270 => Some(pose.point.x),
        _ => None,
    }
}

pub(crate) fn on_channel(pose: LocalPose, channel_index: i64) -> bool {
    channel_of(pose).is_some_and(|value| {
        (value - channel_value(channel_index)).abs() < CHANNEL_MATCH_TOLERANCE_MM
    })
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/// One side of one revolution, as the walk sees it: run along `channel` on
/// `heading`, then take a corner onto `exit_heading` at `exit_channel`.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Leg {
    pub(crate) heading: Heading8,
    pub(crate) channel: i64,
    pub(crate) exit_heading: Heading8,
    pub(crate) exit_channel: i64,
}

/// The four legs of the inward arm's counter-clockwise revolution `here`,
/// whose last corner steps onto `next`'s bottom row.
fn inward_legs(here: Revolution, next_bottom: i64) -> [Leg; 4] {
    [
        Leg {
            heading: Heading8::Deg0,
            channel: here.bottom,
            exit_heading: Heading8::Deg90,
            exit_channel: here.right,
        },
        Leg {
            heading: Heading8::Deg90,
            channel: here.right,
            exit_heading: Heading8::Deg180,
            exit_channel: here.top,
        },
        Leg {
            heading: Heading8::Deg180,
            channel: here.top,
            exit_heading: Heading8::Deg270,
            exit_channel: here.left,
        },
        Leg {
            heading: Heading8::Deg270,
            channel: here.left,
            exit_heading: Heading8::Deg0,
            exit_channel: next_bottom,
        },
    ]
}

/// The four legs of the return arm's clockwise revolution `here`, whose last
/// corner steps *outward* onto `next`'s left column.
fn return_legs(here: Revolution, next_left: i64) -> [Leg; 4] {
    [
        Leg {
            heading: Heading8::Deg90,
            channel: here.left,
            exit_heading: Heading8::Deg0,
            exit_channel: here.top,
        },
        Leg {
            heading: Heading8::Deg0,
            channel: here.top,
            exit_heading: Heading8::Deg270,
            exit_channel: here.right,
        },
        Leg {
            heading: Heading8::Deg270,
            channel: here.right,
            exit_heading: Heading8::Deg180,
            exit_channel: here.bottom,
        },
        Leg {
            heading: Heading8::Deg180,
            channel: here.bottom,
            exit_heading: Heading8::Deg90,
            exit_channel: next_left,
        },
    ]
}

/// The lane a stretch is nominally walking, and the rectangle that lane's four
/// channels bound.
#[derive(Clone)]
pub(crate) struct Claim {
    pub(crate) id: u32,
    pub(crate) rect: RectMm,
}

impl Claim {
    /// Whether `edge` really walks this lane. A spiral's revolution is not
    /// closed: the corner that steps inward lands on the next lane's bottom
    /// row *west of* that lane's own left column, so the first stretch after a
    /// step runs outside the rectangle it is heading for. Those edges belong
    /// to neither ring and must say so — which is what a hop is. Deciding this
    /// from the geometry, with the validator's own predicate, means the label
    /// cannot drift from the truth as the construction changes.
    fn covers(&self, edge: &PoseEdge) -> bool {
        point_on_rect_boundary(edge.start.local_pose.point, &self.rect)
            && point_on_rect_boundary(edge.end.local_pose.point, &self.rect)
    }

    pub(crate) fn label(&self, edge: &PoseEdge) -> Option<u32> {
        self.covers(edge).then_some(self.id)
    }
}

/// Whether `point` sits on one of `rect`'s four channel sides. The same
/// predicate `validate::check_section_on_lane` judges a claim by; kept local
/// for the same reason that module keeps its own copy.
pub(crate) fn point_on_rect_boundary(point: Point, rect: &RectMm) -> bool {
    let eps = CHANNEL_MATCH_TOLERANCE_MM;
    let on_vertical_side = (point.x - rect.min.x).abs() < eps || (point.x - rect.max.x).abs() < eps;
    let on_horizontal_side =
        (point.y - rect.min.y).abs() < eps || (point.y - rect.max.y).abs() < eps;
    let within_y = point.y >= rect.min.y - eps && point.y <= rect.max.y + eps;
    let within_x = point.x >= rect.min.x - eps && point.x <= rect.max.x + eps;
    (on_vertical_side && within_y) || (on_horizontal_side && within_x)
}

/// What one walked stretch contributed: its edges, each tagged with the lane
/// it walks (`None` where it walks none, i.e. a lane change).
pub(crate) struct Stretch {
    pub(crate) edge_ids: Vec<u32>,
    pub(crate) lane_ids: Vec<Option<u32>>,
    pub(crate) pose: LocalPose,
}

impl Stretch {
    pub(crate) fn new(pose: LocalPose) -> Self {
        Self {
            edge_ids: Vec::new(),
            lane_ids: Vec::new(),
            pose,
        }
    }

    pub(crate) fn push(&mut self, edge: &PoseEdge, claim: &Claim) {
        self.edge_ids.push(edge.id);
        self.lane_ids.push(claim.label(edge));
        self.pose = edge.end.local_pose;
    }

    pub(crate) fn absorb(&mut self, other: Stretch) {
        self.edge_ids.extend(other.edge_ids);
        self.lane_ids.extend(other.lane_ids);
        self.pose = other.pose;
    }
}

/// Runs `Straight0` edges from `pose` until the corner `leg` names is
/// reachable, and takes it. Returns the walked edges plus the corner.
///
/// The corner is *found*, never re-derived: the walk asks the graph, at every
/// step along the channel, whether a `BroadTurn90` leaves this pose onto the
/// leg's exit channel. That is the same "query edges, don't re-derive parity"
/// discipline `fields.rs` applies to its rings.
pub(crate) fn walk_leg(
    index: &GraphIndex,
    start: LocalPose,
    leg: Leg,
    claim: &Claim,
) -> Result<Stretch, LoopError> {
    if !on_channel(start, leg.channel) {
        return Err(no_geometry(format!(
            "the walk entered a {:?} leg off its own channel {}",
            leg.heading, leg.channel
        )));
    }
    let mut stretch = Stretch::new(start);
    for _ in 0..MAX_STRAIGHTS_PER_SIDE {
        if let Some(corner) = corner_from(index, stretch.pose, leg) {
            stretch.push(corner, claim);
            return Ok(stretch);
        }
        let Some(straight) = index.straight(stretch.pose) else {
            return Err(no_geometry(format!(
                "no corner onto channel {} and no straight to continue on, at ({:.1}, {:.1})",
                leg.exit_channel, stretch.pose.point.x, stretch.pose.point.y
            )));
        };
        stretch.push(straight, claim);
    }
    Err(no_geometry(
        "a spiral side ran past its straight-segment bound",
    ))
}

/// The `BroadTurn90` leaving `pose` onto `leg`'s exit channel and heading, if
/// the graph has one here.
fn corner_from<'a>(index: &GraphIndex<'a>, pose: LocalPose, leg: Leg) -> Option<&'a PoseEdge> {
    index
        .leaving_with(pose, TemplateId::BroadTurn90)
        .into_iter()
        .find(|edge| {
            edge.end.local_pose.heading == leg.exit_heading
                && on_channel(edge.end.local_pose, leg.exit_channel)
        })
}

/// Walks the whole Schnecke for one nesting sequence.
fn walk(revolutions: &[Revolution], index: &GraphIndex) -> Result<Schnecke, LoopError> {
    let lane_count = revolutions.len();
    if lane_count < 2 {
        return Err(no_geometry(
            "a Schnecke needs at least one inward and one return lane",
        ));
    }
    let lanes: Vec<Lane> = revolutions
        .iter()
        .enumerate()
        .map(|(id, revolution)| Lane {
            id: id as u32,
            field_id: 0,
            rect_local: revolution.rect(),
            node_ids: Vec::new(),
            edge_ids: Vec::new(),
        })
        .collect();

    let mut failure: Option<LoopError> = None;
    // Either port may serve as the entry; the other is then the exit. Both
    // orders usually walk, but only one of them keeps the two connectors
    // apart: if the entry port is the one further from the arm's own end of
    // the zone, its connector has to reach across the exit's, and the two
    // cross right in front of the manifold. Which order that is depends on
    // where the turn put the return arm's outer end, so it is decided by the
    // real crossing test rather than by a distance proxy standing in for one.
    for (entry_port, exit_port) in [
        (index.zone.start_port, index.zone.end_port),
        (index.zone.end_port, index.zone.start_port),
    ] {
        // Westernmost entry pose first, so the arm lays as much of the
        // outermost row as it can; the ones behind it are the fallback for
        // when that start cannot walk the whole spiral or its connector
        // crosses the loop.
        for entry in entry_poses(index, revolutions[0].bottom, entry_port) {
            match walk_from(revolutions, index, entry, entry_port, exit_port) {
                Ok(path) => match connectors_clear_the_loop(index, &path) {
                    Ok(()) => return Ok(Schnecke { lanes, path }),
                    Err(error) => failure = failure.or(Some(error)),
                },
                Err(error) => failure = failure.or(Some(error)),
            }
        }
    }
    Err(failure.unwrap_or_else(|| {
        no_geometry(format!(
            "no node on the outermost lane's bottom row (channel {}) is a zone entry anchor a \
             port can be connected to",
            revolutions[0].bottom
        ))
    }))
}

/// Whether the two zone connectors keep clear of each other and of the loop.
///
/// The arms themselves cannot cross — that is what the nesting sequence buys —
/// but the two free-form connectors are not part of that argument: they run
/// from the ports out to the anchors through the one part of the room the
/// lattice does not govern, and whether they cross depends on which port
/// serves which anchor. Checked with the same predicate the validator uses,
/// against the same "primitives two or more apart must not touch" rule, but
/// only for the pairs involving a connector — the rest is already settled by
/// construction, and checking it here would make this quadratic in the whole
/// loop for nothing.
fn connectors_clear_the_loop(index: &GraphIndex, path: &SpiralPath) -> Result<(), LoopError> {
    let Some(ends) = path.ends else {
        return Ok(());
    };
    let connector = |port: Point, node_id: u32| -> Vec<PathPrimitive> {
        index
            .node_by_id(node_id)
            .and_then(|node| attach_port(port, index.zone.inward, node, index.instance).ok())
            .map(|attachment| attachment.primitives)
            .unwrap_or_default()
    };
    let entry = connector(ends.entry_port, ends.entry_anchor_node_id);
    let exit: Vec<PathPrimitive> = connector(ends.exit_port, ends.exit_anchor_node_id)
        .iter()
        .rev()
        .map(reverse_primitive)
        .collect();

    let mut ordered: Vec<PathPrimitive> = entry.clone();
    let entry_end = ordered.len();
    for edge_id in path
        .inward_edge_ids
        .iter()
        .chain(&path.turn_edge_ids)
        .chain(&path.return_edge_ids)
    {
        if let Some(edge) = index.edge_by_id(*edge_id) {
            ordered.extend(edge.primitives.iter().cloned());
        }
    }
    let exit_start = ordered.len();
    ordered.extend(exit);

    for first in 0..ordered.len() {
        let involves_connector = first < entry_end || first >= exit_start;
        for second in (first + 2)..ordered.len() {
            if !involves_connector && second < exit_start {
                continue;
            }
            if !primitive_intersections(&ordered[first], &ordered[second])
                .points()
                .is_empty()
            {
                return Err(no_geometry(format!(
                    "a zone connector crosses the loop at path primitives {first} and {second}"
                )));
            }
        }
    }
    Ok(())
}

/// The same primitive, traversed the other way round. The exit connector is
/// built port → anchor and walked back.
pub(crate) fn reverse_primitive(primitive: &PathPrimitive) -> PathPrimitive {
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

/// The candidate starting poses: east-running nodes on the outermost lane's
/// bottom row that `entry_port` can actually be connected to.
///
/// Westernmost first — the arm runs east from here, so the further west it
/// can start the more of that row it lays.
fn entry_poses(index: &GraphIndex, bottom: i64, entry_port: Point) -> Vec<LocalPose> {
    let mut poses: Vec<LocalPose> = index
        .node_by_pose
        .values()
        .filter(|node| {
            node.local_pose.heading == Heading8::Deg0
                && on_channel(node.local_pose, bottom)
                && index.connector_exists(entry_port, node)
        })
        .map(|node| node.local_pose)
        .collect();
    poses.sort_by(|left, right| {
        left.point
            .x
            .partial_cmp(&right.point.x)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    poses
}

fn walk_from(
    revolutions: &[Revolution],
    index: &GraphIndex,
    entry: LocalPose,
    entry_port: Point,
    exit_port: Point,
) -> Result<SpiralPath, LoopError> {
    let innermost = revolutions.len() - 1;
    let entry_anchor = index
        .node(entry)
        .ok_or_else(|| no_geometry("the entry pose is not a certified node"))?;

    // --- Inward: even lanes, outermost to innermost. ---
    let mut inward = Stretch::new(entry);
    let mut lane_id = 0usize;
    while lane_id < innermost {
        let next = lane_id + 2;
        let next_bottom = revolutions
            .get(next)
            .map_or(revolutions[innermost].bottom, |revolution| {
                revolution.bottom
            });
        let claim = claim_for(revolutions, lane_id);
        for leg in inward_legs(revolutions[lane_id], next_bottom) {
            let stretch = walk_leg(index, inward.pose, leg, &claim)?;
            inward.absorb(stretch);
        }
        lane_id = next;
    }

    // --- The innermost lane and the turn-around. ---
    let core = walk_core(index, revolutions, inward.pose)?;
    inward.absorb(core.run);
    let turn_edge_ids = core.turn_edge_ids;

    // --- Return: odd lanes, innermost to outermost. ---
    // The turn lands on the same side of the next lane out that it left the
    // innermost one on, running the other way — so the return's first
    // revolution starts at that side rather than at its left column. `3 - i`
    // is that side: the two leg orders run opposite ways round.
    let mut ret = Stretch::new(core.after_turn);
    let mut first_return_leg = 3 - core.turn_leg;
    let mut lane_id = innermost - 1;
    loop {
        let next = lane_id.checked_sub(2);
        let next_left = next.map_or(revolutions[lane_id].left, |id| revolutions[id].left);
        let claim = claim_for(revolutions, lane_id);
        for (position, leg) in return_legs(revolutions[lane_id], next_left)
            .into_iter()
            .enumerate()
            .skip(first_return_leg)
        {
            if position == 3 && next.is_none() {
                // The outermost return lane has no lane to step out to: it
                // runs its bottom row back to the zone and stops there.
                let stretch = run_to_exit(index, ret.pose, leg, &claim, exit_port)?;
                ret.absorb(stretch);
                let exit_anchor = index
                    .node(flip(ret.pose))
                    .ok_or_else(|| no_geometry("the exit pose is not a certified node"))?;
                return Ok(SpiralPath {
                    inward_edge_ids: inward.edge_ids,
                    turn_edge_ids,
                    return_edge_ids: ret.edge_ids,
                    inward_lane_ids: inward.lane_ids,
                    return_lane_ids: ret.lane_ids,
                    ends: Some(SpiralEnds {
                        entry_port,
                        exit_port,
                        entry_anchor_node_id: entry_anchor.id,
                        exit_anchor_node_id: exit_anchor.id,
                    }),
                });
            }
            let stretch = walk_leg(index, ret.pose, leg, &claim)?;
            ret.absorb(stretch);
        }
        first_return_leg = 0;
        lane_id = next.expect("the outermost lane returns above");
    }
}

/// The innermost lane walked up to and including its turn-around.
struct Core {
    /// The innermost lane's sides, plus the run along the turning side.
    run: Stretch,
    turn_edge_ids: Vec<u32>,
    after_turn: LocalPose,
    /// Which of the four inward legs the turn was taken on.
    turn_leg: usize,
}

/// Walks the innermost lane and turns around on the best side it offers.
///
/// The turn can go on any of the four sides, and which one matters twice
/// over. It has to *fit*: a reverse-family placement overhangs its own
/// endpoints — 192 mm for a `TeardropReverse`, 112 mm for a
/// `BroadReverse180` — along the side it sits on, so a squat lane has room
/// for it on the long sides and none on the short ones. And it costs
/// coverage: turning on leg `i` means the inward arm laid sides `0..=i` of
/// the innermost lane and the return lays sides `3-i..=3` of the next one
/// out, so `2(i+1)` of those eight sides get pipe.
///
/// Hence: try the last leg first and walk back. The best-covering side that
/// fits wins, and only if none of the four fits does the caller back the
/// whole nesting off by a revolution.
fn walk_core(
    index: &GraphIndex,
    revolutions: &[Revolution],
    start: LocalPose,
) -> Result<Core, LoopError> {
    let innermost = revolutions.len() - 1;
    let core = revolutions[innermost];
    let claim = claim_for(revolutions, innermost);
    let outward = revolutions[innermost - 1];
    let landings = [outward.bottom, outward.right, outward.top, outward.left];
    let legs = inward_legs(core, core.bottom);

    let mut failure: Option<LoopError> = None;
    for turn_leg in (0..4usize).rev() {
        let mut run = Stretch::new(start);
        let attempt = (|| {
            for leg in legs.iter().take(turn_leg) {
                let stretch = walk_leg(index, run.pose, *leg, &claim)?;
                run.absorb(stretch);
            }
            walk_turn(index, run.pose, legs[turn_leg], landings[turn_leg], &claim)
        })();
        match attempt {
            Ok((turn_edge_ids, turn_run, after_turn)) => {
                run.absorb(turn_run);
                return Ok(Core {
                    run,
                    turn_edge_ids,
                    after_turn,
                    turn_leg,
                });
            }
            Err(error) => failure = failure.or(Some(error)),
        }
    }
    Err(failure.unwrap_or_else(|| no_geometry("the innermost lane has no side to turn around on")))
}

/// The lane claim for nesting index `id`.
fn claim_for(revolutions: &[Revolution], id: usize) -> Claim {
    Claim {
        id: id as u32,
        rect: revolutions[id].rect(),
    }
}

/// Runs the innermost left column down to a reverse-family edge that lands on
/// the return arm's innermost column, and takes it.
///
/// Returns the turn's own edge ids (the validator's `Turn` sections), the
/// straights walked to reach it (still inward), and the pose the return arm
/// starts from.
fn walk_turn(
    index: &GraphIndex,
    start: LocalPose,
    leg: Leg,
    landing: i64,
    claim: &Claim,
) -> Result<(Vec<u32>, Stretch, LocalPose), LoopError> {
    if !on_channel(start, leg.channel) {
        return Err(no_geometry(format!(
            "the walk reached the turning side {:?} off its own channel {}",
            leg.heading, leg.channel
        )));
    }
    let mut run = Stretch::new(start);
    for _ in 0..MAX_STRAIGHTS_PER_SIDE {
        if let Some(turn) = turn_from(index, run.pose, landing) {
            if !turn_clears_its_own_lane(index, turn, claim) {
                // The turn's body reaches past its two endpoints — a
                // `TeardropReverse` loops 192 mm beyond them — and here it
                // would land on the innermost lane's own far side. Running
                // further along this side only moves it closer, so this side
                // is out; the caller tries the next one.
                return Err(no_geometry(format!(
                    "the turn-around from channel {} onto channel {landing} would run into \
                     lane {}'s own far side",
                    leg.channel, claim.id
                )));
            }
            return Ok((vec![turn.id], run, turn.end.local_pose));
        }
        let Some(straight) = index.straight(run.pose) else {
            return Err(no_geometry(format!(
                "no turn-around from channel {} onto channel {landing}, and no straight to \
                 continue on, at ({:.1}, {:.1})",
                leg.channel, run.pose.point.x, run.pose.point.y
            )));
        };
        run.push(straight, claim);
    }
    Err(no_geometry(
        "a turning side ran past its straight-segment bound without a turn-around",
    ))
}

/// Whether `turn`'s body keeps clear of the two sides bounding the lane it
/// turns out of.
///
/// A reverse-family placement is not contained between its own endpoints: a
/// `TeardropReverse` loops up to 192 mm past them, a `BroadReverse180` 112 mm.
/// Both ends sit on the same side of the lane, so what that overhang can run
/// into is one of the two sides *perpendicular* to it — and on a lane squat
/// enough that the turn is forced to sit right against one of them, it does.
/// Rejecting it here is what lets `walk_core` try the next side, and failing
/// that, the caller back the nesting off by a revolution.
///
/// Which axis to measure follows the turn's own heading, not the lane: a turn
/// on a column overhangs along `y`, a turn on a row along `x`. Measuring the
/// wrong one passes vacuously, which is the whole failure this guards against.
fn turn_clears_its_own_lane(index: &GraphIndex, turn: &PoseEdge, claim: &Claim) -> bool {
    let on_column = matches!(
        turn.start.local_pose.heading,
        Heading8::Deg90 | Heading8::Deg270
    );
    let mut lowest = f64::MAX;
    let mut highest = f64::MIN;
    for primitive in &turn.primitives {
        let bounds = index
            .instance
            .transform
            .primitive_to_local(primitive)
            .bounds();
        let (low, high) = if on_column {
            (bounds.min.y, bounds.max.y)
        } else {
            (bounds.min.x, bounds.max.x)
        };
        lowest = lowest.min(low);
        highest = highest.max(high);
    }
    let (floor, ceiling) = if on_column {
        (claim.rect.min.y, claim.rect.max.y)
    } else {
        (claim.rect.min.x, claim.rect.max.x)
    };
    lowest >= floor + TURN_BODY_CLEARANCE_MM && highest <= ceiling - TURN_BODY_CLEARANCE_MM
}

/// The reverse-family edge leaving `pose` that lands on column `landing`
/// running back the other way.
fn turn_from<'a>(index: &GraphIndex<'a>, pose: LocalPose, landing: i64) -> Option<&'a PoseEdge> {
    let reversed = Heading8::from_octant(pose.heading.octant() + 4);
    [TemplateId::BroadReverse180, TemplateId::TeardropReverse]
        .into_iter()
        .flat_map(|template| index.leaving_with(pose, template))
        .find(|edge| {
            edge.end.local_pose.heading == reversed && on_channel(edge.end.local_pose, landing)
        })
}

/// Runs the outermost return lane's bottom row west until the zone stops it,
/// and leaves the walk on the last node it reached.
///
/// The zone's edges are not in the usable set, so the run simply ends where
/// the zone begins — which is exactly where the exit connector attaches. The
/// pose it stops on must be one the `exit_port` can be connected to, or the
/// loop has no way back to the port.
fn run_to_exit(
    index: &GraphIndex,
    start: LocalPose,
    leg: Leg,
    claim: &Claim,
    exit_port: Point,
) -> Result<Stretch, LoopError> {
    if !on_channel(start, leg.channel) {
        return Err(no_geometry(
            "the return arm entered its outermost row off channel",
        ));
    }
    let mut stretch = Stretch::new(start);
    let mut anchored_len = index
        .reaches(flip(stretch.pose), exit_port)
        .then_some(0usize);
    for _ in 0..MAX_STRAIGHTS_PER_SIDE {
        let Some(straight) = index.straight(stretch.pose) else {
            break;
        };
        stretch.push(straight, claim);
        if index.reaches(flip(stretch.pose), exit_port) {
            anchored_len = Some(stretch.edge_ids.len());
        }
    }
    // Stop at the furthest anchor the row reached: running past it would end
    // the loop somewhere the connector cannot attach.
    let Some(keep) = anchored_len else {
        return Err(no_geometry(
            "the return arm's outermost row reaches no zone entry anchor",
        ));
    };
    stretch.edge_ids.truncate(keep);
    stretch.lane_ids.truncate(keep);
    stretch.pose = pose_after(index, start, &stretch.edge_ids);
    Ok(stretch)
}

/// The pose reached by walking `edge_ids` from `start`.
fn pose_after(index: &GraphIndex, start: LocalPose, edge_ids: &[u32]) -> LocalPose {
    let mut pose = start;
    for id in edge_ids {
        let Some(edge) = index
            .departing(pose)
            .iter()
            .copied()
            .find(|edge| edge.id == *id)
        else {
            break;
        };
        pose = edge.end.local_pose;
    }
    pose
}
