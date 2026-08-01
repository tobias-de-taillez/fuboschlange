//! The edge band: a meander along a wall run.
//!
//! The Randzone is not a Schnecke. It runs `n` lanes one pipe spacing apart
//! along three walls — up one side, across the front, down the other — open at
//! the bottom where both ends meet the manifold, and it walks them in nesting
//! order: lane 0 against the wall, then 1, then 2, then 3. Two lanes run out,
//! two run back, which is exactly what the trade asks of an edge zone and what
//! the user asked for here.
//!
//! ## Why the obvious construction is not the one built
//!
//! The first design took a lane change to be a single reverse-family edge.
//! Those bridge two channels or three, never one, so at a 75 mm spacing the
//! lanes could only be walked `2 → 0 → 3 → 1`; three changes over two ends
//! means two of them share an end, and both of those straddle a lane the other
//! one walks. That is impossible on this plate, and not marginally so
//! (`tests/plate_spiral_facts.rs`,
//! `a_four_lane_band_cannot_put_two_reverses_at_one_end`):
//!
//! - a reverse crosses the lanes it spans at the *bottom* of its own loop,
//!   192.4 mm below its endpoints, so the straddled lane must end within
//!   142.4 mm of the other turn's row;
//! - but two such reverses one channel apart touch each other at 0 and at
//!   150 mm of stagger and only clear at 300 mm, and placements come every
//!   150 mm, so there is nothing in between.
//!
//! 300 ≤ |Δ| < 142.4 is empty. No stagger exists.
//!
//! ## What the plate does admit
//!
//! A one-channel U-turn, as a chain of three edges rather than one. Westward
//! the narrowest is `TeardropReverse → BroadReverse180 → TeardropReverse`
//! (−150, +225, −150 mm) and swings only 85 mm past its two columns. With it
//! the lanes are walked 0, 1, 2, 3 in order and no turn ever straddles a lane
//! at all — which is why this module searches for a *chain* and not a
//! template, the same way [`walk_leg`] finds its corner by asking the graph
//! instead of re-deriving it.
//!
//! What remains is that a chain still swings sideways, and at the end where
//! two of them sit the second must keep clear of the first and of the lane
//! ends beside it. That is a stagger too, but a small one and for a different
//! reason, and it is *searched* rather than derived: the walk offers every row
//! the graph admits a turn on, deepest first, and backtracks when the geometry
//! rejects one.

use crate::circuit::fields::{Field, Lane};
use crate::circuit::schnecke::{
    Claim, GraphIndex, Leg, MAX_STRAIGHTS_PER_SIDE, Stretch, channel_value, flip,
    largest_index_at_most, no_geometry, on_channel, smallest_index_at_least, walk_leg,
};
use crate::circuit::spiral::SpiralEnds;
use crate::circuit::types::{LoopError, RectMm};
use crate::circuit::zone::{ConnectionZone, LoopGraphView};
use crate::geometry::primitive_intersections;
use crate::model::Point;
use crate::plate::{EmbeddedPoseGraph, Heading8, LocalPose, PlateInstance, PoseEdge};

/// How many edges a lane change may take. Three is what the plate offers; the
/// bound is here so a graph defect cannot turn the chain search exponential.
const UTURN_CHAIN_LEN: usize = 3;

/// How many turn rows to try per lane change before giving up on a
/// configuration. The rows are offered deepest first, so this bounds the
/// stagger the band will look for at 150 mm per step.
const MAX_TURN_ROWS: usize = 12;

/// A completed band: the lanes it walks and the one chained path through them.
///
/// `lane_ids` runs parallel to `edge_ids`: `Some(id)` where the edge walks that
/// lane, `None` where it is part of a lane change. That is the meander's whole
/// bookkeeping — there is no turn-around and no return arm to separate out.
#[derive(Clone, Debug, PartialEq)]
pub struct Band {
    pub lanes: Vec<Lane>,
    pub edge_ids: Vec<u32>,
    pub lane_ids: Vec<Option<u32>>,
    pub ends: SpiralEnds,
}

/// The outermost lane's three channels. Lane `k` sits `k` channels inside each
/// of them.
#[derive(Clone, Copy, Debug)]
struct Run {
    left: i64,
    right: i64,
    top: i64,
    /// Whether lane 0 starts its north run on the left column.
    ///
    /// This decides which end each lane change happens at and which way it
    /// turns, and the two are not equivalent: the plate's compact 75 mm U-turn
    /// swings 85 mm one way and 225 mm the other
    /// (`plate_spiral_facts.rs`). Both handednesses are walked and the one
    /// that lays more pipe wins.
    start_left: bool,
}

/// Builds the edge band for `field`, or reports why the room does not admit
/// one.
///
/// `lane_count` lanes are laid one channel (75 mm) apart against the left, top
/// and right walls of `field`, starting and ending at the connection zone.
pub fn build_band(
    field: &Field,
    lane_count: usize,
    wall_clearance_mm: f64,
    graph: &EmbeddedPoseGraph,
    view: &LoopGraphView,
    zone: &ConnectionZone,
    instance: &PlateInstance,
) -> Result<Band, LoopError> {
    if lane_count < 2 {
        return Err(no_geometry("a band needs at least two lanes"));
    }
    let index = GraphIndex::new(graph, view, zone, instance);

    let mut best: Option<Band> = None;
    let mut failure: Option<(usize, LoopError)> = None;
    for run in run_candidates(field, wall_clearance_mm, lane_count) {
        match walk(run, lane_count, field, &index) {
            Ok(band) => {
                if best
                    .as_ref()
                    .is_none_or(|held| held.edge_ids.len() < band.edge_ids.len())
                {
                    best = Some(band);
                }
            }
            // Ranked by how many lanes the attempt got down before it stopped.
            // A handedness that cannot even reach the zone says nothing useful
            // about one that laid three lanes and ran out of room on the
            // fourth.
            Err(reached) => {
                if failure.as_ref().is_none_or(|(held, _)| *held < reached.0) {
                    failure = Some(reached);
                }
            }
        }
    }
    best.ok_or_else(|| {
        failure.map(|(_, error)| error).unwrap_or_else(|| {
            no_geometry("the room admits no edge band at this wall clearance")
        })
    })
}

/// The two channel frames the room admits, one per parity class.
///
/// Reading the corner parities round a lane forces the relation between the
/// three channels: a north run cornering onto the top row and then onto the
/// far column needs `left ≡ top ≢ right` (the parity classes measured in
/// `plate_spiral_facts.rs`). So the frame is fixed by the parity of its top
/// row, and there are exactly two candidates — each snapped away from its wall
/// so honouring the lattice never eats into the clearance the caller asked for.
fn run_candidates(field: &Field, wall_clearance_mm: f64, lane_count: usize) -> Vec<Run> {
    let rect = &field.rect_local;
    let span = lane_count as i64;
    [0i64, 1]
        .into_iter()
        .filter_map(|top_parity| {
            let top = largest_index_at_most(rect.max.y - wall_clearance_mm, top_parity)?;
            let left = smallest_index_at_least(rect.min.x + wall_clearance_mm, top_parity)?;
            let right = largest_index_at_most(rect.max.x - wall_clearance_mm, 1 - top_parity)?;
            // Every lane must still be a U, not a crossed one.
            (left + span < right - span).then_some([true, false].map(|start_left| Run {
                left,
                right,
                top,
                start_left,
            }))
        })
        .flatten()
        .collect()
}

/// The two legs of lane `k`, and the column its lane change lands on.
///
/// Even lanes start at the right wall and run out to the left; odd lanes start
/// at the left and run back. Two out, two back.
fn lane_legs(run: Run, k: i64) -> ([Leg; 2], i64) {
    let (start_column, far_column, across, next_column) = if from_left(run, k) {
        (run.left + k, run.right - k, Heading8::Deg0, run.right - k - 1)
    } else {
        (run.right - k, run.left + k, Heading8::Deg180, run.left + k + 1)
    };
    (
        [
            Leg {
                heading: Heading8::Deg90,
                channel: start_column,
                exit_heading: across,
                exit_channel: run.top - k,
            },
            Leg {
                heading: across,
                channel: run.top - k,
                exit_heading: Heading8::Deg270,
                exit_channel: far_column,
            },
        ],
        next_column,
    )
}

/// Whether lane `k` starts its north run on the left column. Lanes alternate,
/// so this is the handedness for even lanes and its opposite for odd ones.
fn from_left(run: Run, k: i64) -> bool {
    run.start_left == (k.rem_euclid(2) == 0)
}

/// The column lane `k` starts its north run on.
fn start_column(run: Run, k: i64) -> i64 {
    if from_left(run, k) {
        run.left + k
    } else {
        run.right - k
    }
}

/// The rectangle lane `k` is claimed to walk while the band is still being
/// laid: generous at the bottom, because how far south each leg reaches is
/// exactly what the walk is still deciding. [`tighten`] shrinks it to the real
/// geometry once the walk is done.
/// An edge's world-space bounding box, as a (min, max) pair.
fn span_of(edge: &PoseEdge) -> (Point, Point) {
    let mut low = Point::new(f64::MAX, f64::MAX);
    let mut high = Point::new(f64::MIN, f64::MIN);
    for primitive in &edge.primitives {
        let bounds = primitive.bounds();
        low = Point::new(low.x.min(bounds.min.x), low.y.min(bounds.min.y));
        high = Point::new(high.x.max(bounds.max.x), high.y.max(bounds.max.y));
    }
    (low, high)
}

fn open_claim(run: Run, k: i64, field: &Field) -> Claim {
    let (low, high) = (run.left + k, run.right - k);
    Claim {
        id: k as u32,
        rect: RectMm {
            min: Point::new(channel_value(low), field.rect_local.min.y),
            max: Point::new(channel_value(high), channel_value(run.top - k)),
        },
    }
}

fn walk<'g>(
    run: Run,
    lane_count: usize,
    field: &Field,
    index: &GraphIndex<'g>,
) -> Result<Band, (usize, LoopError)> {
    let mut failure: Option<(usize, LoopError)> = None;
    for (entry_port, exit_port) in [
        (index.zone.start_port, index.zone.end_port),
        (index.zone.end_port, index.zone.start_port),
    ] {
        for entry in entry_poses(index, start_column(run, 0), entry_port) {
            let Some(entry_anchor) = index.node(entry) else {
                continue;
            };
            let mut state = State {
                index,
                run,
                lane_count,
                field,
                laid: Vec::new(),
                lanes: Vec::new(),
                deepest: 0,
            };
            match state.lane(0, entry, exit_port) {
                Ok(exit_pose) => {
                    let Some(exit_anchor) = index.node(flip(exit_pose)) else {
                        failure = Some((
                            lane_count,
                            no_geometry("the exit pose is not a certified node"),
                        ));
                        continue;
                    };
                    return Ok(state.finish(entry_port, exit_port, entry_anchor.id, exit_anchor.id));
                }
                Err(error) => {
                    if failure
                        .as_ref()
                        .is_none_or(|(held, _)| *held <= state.deepest)
                    {
                        failure = Some((state.deepest, error));
                    }
                }
            }
        }
    }
    Err(failure.unwrap_or_else(|| {
        (
            0,
            no_geometry(format!(
                "no node on the outermost lane's start column (channel {}) is a zone entry \
                 anchor a port can be connected to",
                start_column(run, 0)
            )),
        )
    }))
}

/// The candidate starting poses: north-running nodes on lane 0's column that
/// `entry_port` can actually be connected to, southernmost first — the further
/// south the band can start, the more of that column it lays.
fn entry_poses(index: &GraphIndex, column: i64, entry_port: Point) -> Vec<LocalPose> {
    let mut poses: Vec<LocalPose> = index
        .nodes_on_channel(Heading8::Deg90, column)
        .into_iter()
        .filter(|pose| {
            index
                .node(*pose)
                .is_some_and(|node| index.connector_exists(entry_port, node))
        })
        .collect();
    poses.sort_by(|left, right| {
        left.point
            .y
            .partial_cmp(&right.point.y)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    poses
}

/// The walk in progress: what has been laid so far, so a candidate lane change
/// can be tested against it before the walk commits to it.
struct State<'a, 'g> {
    index: &'a GraphIndex<'g>,
    run: Run,
    lane_count: usize,
    field: &'a Field,
    /// Every edge laid so far, with the lane it walks. Real references, not
    /// ids: a candidate lane change is tested against all of them, and looking
    /// each one up again would make that search quadratic in the whole graph.
    laid: Vec<(&'g PoseEdge, Option<u32>)>,
    lanes: Vec<Claim>,
    /// The highest lane index the walk reached, so a failure can be ranked by
    /// how far it got rather than by when it happened.
    deepest: usize,
}

impl<'g> State<'_, 'g> {
    /// Walks lane `k` from `start`, then either turns onto lane `k + 1` and
    /// recurses, or — on the last lane — runs out to the exit. Returns the pose
    /// the band ends on.
    ///
    /// The recursion is what makes the stagger searched rather than derived:
    /// each lane change offers every row the graph admits one on, deepest
    /// first, and a row whose chain fouls what is already laid simply fails and
    /// the next is tried.
    fn lane(
        &mut self,
        k: usize,
        start: LocalPose,
        exit_port: Point,
    ) -> Result<LocalPose, LoopError> {
        self.deepest = self.deepest.max(k);
        let claim = open_claim(self.run, k as i64, self.field);
        let (legs, next_column) = lane_legs(self.run, k as i64);
        let mut pose = start;
        let mark_legs = self.laid.len();
        for leg in legs {
            let stretch = walk_leg(self.index, pose, leg, &claim)?;
            pose = stretch.pose;
            self.absorb(&stretch);
        }
        if let Err(fouled) = self.clears_from(mark_legs) {
            // Not this lane's fault: it ran where an earlier lane change had
            // already swung. The caller retries that change on another row.
            return Err(no_geometry(format!(
                "lane {k} runs into edge {fouled}, laid by an earlier lane change"
            )));
        }
        self.lanes.push(claim.clone());

        if k + 1 == self.lane_count {
            let mark_exit = self.laid.len();
            let pose = self.run_to_exit(pose, &claim, exit_port)?;
            if let Err(fouled) = self.clears_from(mark_exit) {
                return Err(no_geometry(format!(
                    "the band's run out to the manifold meets edge {fouled}"
                )));
            }
            return Ok(pose);
        }

        let mark = self.laid.len();
        let mut failure: Option<LoopError> = None;
        for (approach, chain) in self.turn_candidates(pose, next_column, &claim) {
            self.laid.truncate(mark);
            self.lanes.truncate(k + 1);
            for edge in approach {
                self.laid.push((edge, Some(claim.id)));
            }
            for edge in &chain {
                self.laid.push((edge, None));
            }
            if let Err(fouled) = self.clears_from(mark) {
                let detail = no_geometry(format!(
                    "the lane change from lane {k} onto channel {next_column} at \
                     ({:.1}, {:.1}) runs into edge {fouled}, already laid",
                    chain[0].start.local_pose.point.x, chain[0].start.local_pose.point.y
                ));
                failure = failure.or(Some(detail));
                continue;
            }
            match self.lane(k + 1, chain[UTURN_CHAIN_LEN - 1].end.local_pose, exit_port) {
                Ok(end) => return Ok(end),
                // A failure from further in says more than "this turn fouled
                // something": it means the turn was fine and the band ran out
                // of room later. Always prefer it.
                Err(error) => failure = Some(error),
            }
        }
        self.laid.truncate(mark);
        self.lanes.truncate(k + 1);
        Err(failure.unwrap_or_else(|| {
            no_geometry(format!(
                "lane {k} reaches no lane change onto channel {next_column}"
            ))
        }))
    }

    /// Every (approach, chain) a lane change from `pose` onto `landing` could
    /// take, deepest first.
    ///
    /// The approach is the run of straights south along the lane's own column
    /// before the chain starts; those edges still walk the lane. The chain is
    /// three edges ending on `landing` running the other way.
    #[allow(clippy::type_complexity)]
    fn turn_candidates(
        &self,
        pose: LocalPose,
        landing: i64,
        claim: &Claim,
    ) -> Vec<(Vec<&'g PoseEdge>, Vec<&'g PoseEdge>)> {
        let mut rows: Vec<(Vec<&'g PoseEdge>, Vec<&'g PoseEdge>)> = Vec::new();
        let mut approach: Vec<&'g PoseEdge> = Vec::new();
        let mut here = pose;
        for _ in 0..MAX_STRAIGHTS_PER_SIDE {
            for chain in self.index.uturn_chains(here, landing, UTURN_CHAIN_LEN) {
                rows.push((approach.clone(), chain));
            }
            let Some(straight) = self.index.straight(here) else {
                break;
            };
            if claim.label(straight).is_none() {
                // The column ran past the lane's own rectangle; anything below
                // this is no longer on the lane.
                break;
            }
            approach.push(straight);
            here = straight.end.local_pose;
        }
        rows.reverse();
        rows.truncate(MAX_TURN_ROWS);
        rows
    }

    /// Whether everything laid from `from` on keeps clear of everything laid
    /// before it.
    ///
    /// The lanes themselves cannot foul each other — they are distinct channels
    /// — so what this catches is the thing the whole design turns on: a lane
    /// change swings sideways, and that swing can meet an earlier chain, an
    /// earlier lane's end, or a *later* lane running back past it. Both
    /// directions matter, which is why the check runs over the whole tail
    /// rather than only over a candidate chain.
    ///
    /// Same rule the validator applies — primitives two or more apart must not
    /// touch — behind a bounding-box reject so it stays linear in practice.
    fn clears_from(&self, from: usize) -> Result<(), u32> {
        for index in from..self.laid.len() {
            let edge = self.laid[index].0;
            let (low, high) = span_of(edge);
            for (earlier, _) in self.laid.iter().take(index.saturating_sub(1)) {
                let (other_low, other_high) = span_of(earlier);
                if other_low.x > high.x
                    || other_high.x < low.x
                    || other_low.y > high.y
                    || other_high.y < low.y
                {
                    continue;
                }
                for first in &earlier.primitives {
                    for second in &edge.primitives {
                        if !primitive_intersections(first, second).points().is_empty() {
                            return Err(earlier.id);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn absorb(&mut self, stretch: &Stretch) {
        for (id, lane) in stretch.edge_ids.iter().zip(&stretch.lane_ids) {
            if let Some(edge) = self.index.edge_by_id(*id) {
                self.laid.push((edge, *lane));
            }
        }
    }

    /// Runs the last lane's final column south until the zone stops it, and
    /// leaves the walk on the furthest node the exit port can be connected to.
    fn run_to_exit(
        &mut self,
        start: LocalPose,
        claim: &Claim,
        exit_port: Point,
    ) -> Result<LocalPose, LoopError> {
        let mut stretch = Stretch::new(start);
        let mut anchored = self
            .index
            .reaches(flip(stretch.pose), exit_port)
            .then_some(0usize);
        for _ in 0..MAX_STRAIGHTS_PER_SIDE {
            let Some(straight) = self.index.straight(stretch.pose) else {
                break;
            };
            stretch.push(straight, claim);
            if self.index.reaches(flip(stretch.pose), exit_port) {
                anchored = Some(stretch.edge_ids.len());
            }
        }
        let Some(keep) = anchored else {
            return Err(no_geometry(
                "the band's last lane reaches no zone entry anchor",
            ));
        };
        stretch.edge_ids.truncate(keep);
        stretch.lane_ids.truncate(keep);
        let mut pose = start;
        for id in &stretch.edge_ids {
            let Some(edge) = self
                .index
                .departing(pose)
                .iter()
                .copied()
                .find(|edge| edge.id == *id)
            else {
                break;
            };
            pose = edge.end.local_pose;
        }
        self.absorb(&stretch);
        Ok(pose)
    }

    /// The finished band, with every lane's rectangle shrunk to the geometry
    /// the walk actually laid on it.
    fn finish(
        self,
        entry_port: Point,
        exit_port: Point,
        entry_anchor_node_id: u32,
        exit_anchor_node_id: u32,
    ) -> Band {
        let lanes = self
            .lanes
            .iter()
            .map(|claim| {
                let mut rect = claim.rect.clone();
                let mut lowest = rect.max.y;
                for (edge, lane) in &self.laid {
                    if *lane != Some(claim.id) {
                        continue;
                    }
                    lowest = lowest
                        .min(edge.start.local_pose.point.y)
                        .min(edge.end.local_pose.point.y);
                }
                rect.min.y = lowest;
                Lane {
                    id: claim.id,
                    field_id: 0,
                    rect_local: rect,
                    node_ids: Vec::new(),
                    edge_ids: Vec::new(),
                }
            })
            .collect();
        Band {
            lanes,
            edge_ids: self.laid.iter().map(|(edge, _)| edge.id).collect(),
            lane_ids: self.laid.iter().map(|(_, lane)| *lane).collect(),
            ends: SpiralEnds {
                entry_port,
                exit_port,
                entry_anchor_node_id,
                exit_anchor_node_id,
            },
        }
    }
}

impl<'a> GraphIndex<'a> {
    /// Every chain of `length` certified edges from `pose` that ends running
    /// the other way on channel `landing`.
    ///
    /// Found, never constructed: on this plate the 75 mm U-turn is three
    /// chained reverses, but which three depends on where in the room it sits,
    /// and asking the graph is the only way to stay right about that.
    pub(crate) fn uturn_chains(
        &self,
        pose: LocalPose,
        landing: i64,
        length: usize,
    ) -> Vec<Vec<&'a PoseEdge>> {
        let reversed = Heading8::from_octant(pose.heading.octant() + 4);
        let mut chains: Vec<Vec<&'a PoseEdge>> = Vec::new();
        let mut frontier: Vec<(LocalPose, Vec<&'a PoseEdge>)> = vec![(pose, Vec::new())];
        for step in 1..=length {
            let mut next: Vec<(LocalPose, Vec<&'a PoseEdge>)> = Vec::new();
            for (here, taken) in &frontier {
                for edge in self.departing(*here) {
                    let end = edge.end.local_pose;
                    let mut chain = taken.clone();
                    chain.push(edge);
                    if step == length {
                        if end.heading == reversed && on_channel(end, landing) {
                            chains.push(chain);
                        }
                    } else {
                        next.push((end, chain));
                    }
                }
            }
            frontier = next;
        }
        chains
    }

    /// Every certified node pose on `channel` running `heading`.
    pub(crate) fn nodes_on_channel(&self, heading: Heading8, channel: i64) -> Vec<LocalPose> {
        self.node_poses()
            .filter(|pose| pose.heading == heading && on_channel(*pose, channel))
            .collect()
    }
}
