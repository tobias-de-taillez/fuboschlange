//! The spiral inward arm: a [`PatternRules`] implementation that walks lane
//! rings outward-in, occupying every other ring (0, 2, 4, ...) and reserving
//! the ring in between (1, 3, 5, ...) for a later return arm, stopping once
//! it either runs out of rings or would leave too little cross-channel span
//! for a certified turn-around at the center.
//!
//! ## Why `expand` always offers a `terminate` fallback
//!
//! `search.rs`'s module doc describes the *aspirational* design: `expand`
//! itself decides not to propose "descend" once doing so would violate the
//! turn budget, with `check`'s `TurnBudget` arm as a pure safety net. That
//! is not what this module does, deliberately: whether descending to ring
//! `k+2` is survivable depends on whether ring `k+2` (or whatever ring is
//! reached after it) can host a valid terminal turn -- and that in turn
//! depends on the ring's own (possibly geometrically irregular)
//! `rect_local`, which is only known once you are standing on it, not
//! before. Pre-computing "is it safe to go deeper" would mean re-deriving
//! the whole rest of the descent inside `expand`, duplicating exactly the
//! backtracking `backtracking_search` already provides.
//!
//! Instead, `expand` always proposes `[descend, terminate]` (in that order)
//! once a ring is fully walked and a further ring exists: descend is tried
//! greedily first, and `terminate`'s own `check` -- the *primary* enforcement
//! of `Invariant::TurnBudget`, not a safety net -- is what actually
//! validates a stop. If descending all the way to the structural end
//! produces a ring that cannot terminate, every candidate at that point is
//! `terminate` alone (no further ring exists) and it is rejected, which
//! `backtracking_search` treats as a dead end: it undoes the last-applied
//! action and resumes the frame below, whose own leftover candidate is
//! exactly the `terminate` that was never tried at the *previous* ring. This
//! is not a re-implementation of the search; it is a direct, un-special-cased
//! use of `backtracking_search`'s documented undo-and-resume contract (see
//! `search.rs`, contract points 3-4) to let a purely local, per-ring
//! `terminate` check produce a globally-correct "stop as deep as possible,
//! but no deeper than the turn budget allows" result.
//!
//! `terminate` is realized as a real, idempotency-safe [`Action`] (not a
//! side channel) using the sentinel occupy tuple [`TERMINAL_MARKER`]: once
//! accepted, `expand` sees the marker in `occupied_lane_segments` and
//! returns an empty candidate list on the very next call, which is
//! `backtracking_search`'s sole path to success (see `search.rs`, contract
//! point 1). Without a real state change, offering `terminate` again on the
//! next `expand` call would loop forever.
//!
//! ## Why lane-change edges are found, not asserted
//!
//! No single certified graph edge connects any two distinct lane rings in
//! this catalogue, verified empirically against the real fixture (Task 6's
//! probe; not a property this module re-derives from the parity algebra).
//! Moving from ring `k` to ring `k+2` is a certified two-edge chain through a
//! free lattice node belonging to neither ring -- so [`SpiralRules::new`]
//! queries `graph` once, per candidate `(k, k+2)` pair, for the
//! deterministically smallest such chain (preferring a single direct edge if
//! one ever exists, matching "smallest certified lane-change edge" for a
//! catalogue that might grow one later), explicitly excluding any edge that
//! is itself one of ring `k+1`'s own catalogued segments -- the hard
//! reservation invariant must hold by construction, not by the coincidence
//! that the smallest chain never happens to reuse one.
//!
//! ## `InwardArm::edge_ids` is provenance, not a chained path
//!
//! A lane ring is a closed cycle with one fixed (if arbitrary) start/end
//! node (`fields.rs`'s own module doc already disclaims meaning in *which*
//! corner that is). The smallest certified lane-change chain out of ring `k`
//! does not depart from that specific node (checked empirically for 0->2,
//! 2->4 and 4->6 on the real fixture: it never does, on any of the three).
//! So the edge id sequence this module returns -- each occupied ring's own
//! `edge_ids` in order, with the chosen lane-change chain's edge ids spliced
//! between consecutive rings -- is the real, certified set of edges the arm
//! uses, but is not asserted (and on this fixture, is not actually true) to
//! be one continuous G1 path end-to-end. No test in this module's brief
//! requires that stronger property; stitching a truly continuous path is
//! left to whichever later task turns this provenance into rendered
//! geometry.
//!
//! ## Why `TerminalCut` is a per-ring chain check, not `terminal_corridor_connected`
//!
//! `search.rs`'s `Invariant::TerminalCut` doc points at
//! `terminal_corridor_connected` as *the* mechanism; that BFS is not usable
//! here. Its cross-lane adjacency rule only ever connects two segments whose
//! lane ids differ by exactly 1 (`segments_adjacent`'s `a.0.abs_diff(b.0) !=
//! 1 => false`), which is correct for a pattern that reserves *consecutive*
//! rings -- but this pattern reserves every *other* ring ({1, 3, 5, ...}, a
//! constant Δ2 gap by design, since the occupied rings sit at the evens in
//! between). Fed this pattern's own reserved set, the BFS can never step
//! from ring 1 to ring 3 (nothing bridges the Δ2 gap in its adjacency rule),
//! so it reports every reserved set of more than one ring as disconnected --
//! including the real, correct one the happy path produces. Using it here
//! would either reject every real arm past a single reserved ring, or (the
//! bug this replaces) get worked around with a check so weak it accepts a
//! genuinely broken corridor (see below).
//!
//! What the corridor invariant actually needs to guarantee -- "the return
//! arm can be walked from the innermost reserved ring back out through ring
//! 1 to the connection zone" -- has its own natural expression at *ring*
//! granularity, which is exactly what [`SpiralRules::corridor_reaches_zone`]
//! implements: every ring with any segment reserved is *fully* reserved (no
//! partial rings), and consecutive reserved rings are linked by a certified
//! lane-change chain (reusing [`SpiralRules`]'s own `descend_chains` --
//! `compute_descend_chains` already builds an entry for every lane id whose
//! `id + 2` exists, not only the even ones `expand` uses, so the odd
//! (reserved-ring) pairs 1->3, 3->5, ... are already there; see
//! `return_chain_tests` below for the real-fixture confirmation). A prior
//! version of this check only tested whether `zone_segment` itself was in
//! the reserved set -- true from the very first descend onward and never
//! revisited, so it could not see a gap deeper in the corridor (a hand-built
//! `{lane 1, lane 5}` reserved set with lane 3 missing passed it). That
//! existence test is kept, but demoted to an explicit sanity precondition
//! (`corridor_reaches_zone`'s point 1) rather than treated as the invariant.

use crate::circuit::fields::Lane;
use crate::circuit::search::{
    Action, Invariant, Journal, PatternRules, SearchFailure, SearchState, backtracking_search,
};
use crate::circuit::types::RectMm;
use crate::model::PathPrimitive;
use crate::plate::{EmbeddedPoseGraph, Heading8, MotionTemplate, PlateProfile, PoseEdge};
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Sentinel `(lane, segment)` marking "the arm has terminated" in
/// `SearchState::occupied_lane_segments`. `u32::MAX` can never collide with
/// a real lane id (lane ids are small, dense, and start at 0 -- see
/// `fields.rs`'s `Lane::id` doc) so this is unambiguous against any real
/// occupation. See the module doc's "why `expand` always offers a
/// `terminate` fallback" for why a real, idempotency-safe state change is
/// needed here rather than a side channel.
const TERMINAL_MARKER: (u32, u32) = (u32::MAX, 0);

/// Total loop length ceiling (100 m), a physically-motivated round number
/// for a single BEKOTEC pipe run -- not derived from any other constant in
/// this crate (there is no existing "max loop length" anywhere else to
/// share). `ZONE_LENGTH_ALLOWANCE_MM` is reserved at each end for the
/// free-form connection-zone routing a later task adds outside this
/// module's scope (matching the brief's "zone allowance 2 x 500mm").
const MAX_LOOP_LENGTH_MM: f64 = 100_000.0;
const ZONE_LENGTH_ALLOWANCE_MM: f64 = 500.0;

/// Tolerance for matching a reverse-family template's span against a
/// requested cross distance in [`turn_budget_ok`], and for detecting a
/// template's start-heading-aligned displacement component as "zero" in
/// [`reverse_span_mm`]. Every value on both sides of these comparisons is an
/// exact multiple of 37.5mm (channel lattice) or a literal template
/// endpoint (`template.rs`'s `Composite::line_to`, which jumps straight to a
/// literal point rather than accumulating arithmetic) -- no float noise is
/// expected at any realistic scale, so this stays tight instead of
/// borrowing `fields.rs`'s much larger snapping-slack constants (those
/// absorb independent per-side channel snapping, a concern this module does
/// not have: it reads `rect_local` values, never re-derives them).
const GEOMETRY_EPSILON_MM: f64 = 1e-6;

/// The certified real-graph provenance for one "descend from ring `k` to
/// ring `k+2`" transition: the deterministically smallest chain of 1 or 2
/// real graph edges realizing it (see the module doc), and that chain's
/// combined length.
#[derive(Clone, Debug, PartialEq)]
struct DescendChain {
    to_lane: u32,
    hop_edge_ids: Vec<u32>,
    length_mm: f64,
}

/// [`PatternRules`] for the spiral inward arm. See the module doc for the
/// `expand`/`check` design; [`SpiralRules::new`] does the one-time real-graph
/// work (`descend_chains`, `edge_lengths`) that `expand`/`check` then only
/// ever read.
#[derive(Clone, Debug)]
pub struct SpiralRules {
    pub lanes: Vec<Lane>,
    /// The `(lane, segment)` a caller has identified as overlapping the
    /// connection zone's entry ring (`ConnectionZone`/`LoopGraphView` in
    /// `zone.rs`) -- computed by the caller, not re-derived here (see the
    /// module doc and controller amendment 4: "don't re-derive zone geometry
    /// inside spiral.rs").
    pub zone_segment: (u32, u32),
    pub spacing_mm: f64,
    pub profile: PlateProfile,
    descend_chains: BTreeMap<u32, DescendChain>,
    edge_lengths: BTreeMap<u32, f64>,
}

/// The result of a successful [`plan_inward_arm`] call: which rings the arm
/// occupies (ascending, e.g. `[0, 2, 4, 6]`) and the real certified edge ids
/// it uses, in ring-then-lane-change order (see the module doc's
/// "provenance, not a chained path").
#[derive(Clone, Debug, PartialEq)]
pub struct InwardArm {
    pub lane_sequence: Vec<u32>,
    pub edge_ids: Vec<u32>,
}

impl SpiralRules {
    /// Builds the rules, including the one-time real-graph work: for every
    /// lane `k` whose `k+2` also exists among `lanes`, finds the
    /// deterministically smallest certified lane-change chain (see the
    /// module doc), and the real length of every edge either a lane or a
    /// chain references (for [`Invariant::LengthBudget`]).
    pub fn new(
        lanes: Vec<Lane>,
        zone_segment: (u32, u32),
        spacing_mm: f64,
        profile: PlateProfile,
        graph: &EmbeddedPoseGraph,
    ) -> Self {
        let descend_chains = compute_descend_chains(&lanes, graph);
        let edge_lengths = compute_edge_lengths(&lanes, &descend_chains, graph);
        Self {
            lanes,
            zone_segment,
            spacing_mm,
            profile,
            descend_chains,
            edge_lengths,
        }
    }

    fn lane_by_id(&self, id: u32) -> Option<&Lane> {
        self.lanes.iter().find(|lane| lane.id == id)
    }

    fn edge_length_mm(&self, edge_id: u32) -> f64 {
        // Always populated by `compute_edge_lengths` for every edge id any
        // lane or descend chain references; `unwrap_or(0.0)` is a
        // non-panicking fallback for a construction invariant, not an
        // expected path.
        self.edge_lengths.get(&edge_id).copied().unwrap_or(0.0)
    }

    /// The [`Action`] entering `lane_id` at its own segment 0: reserves
    /// `lane_id + 1` (if it exists among `self.lanes`) as a side effect, per
    /// "on occupying lane k, immediately insert every segment of lane k+1
    /// into `reserved_lane_segments`". `extra_length_mm` is the lane-change
    /// chain's length for a `"descend"`, or `0.0` for the very first
    /// (`"start"`) entry into ring 0, which needs no chain at all.
    fn enter_lane_action(&self, lane_id: u32, kind: &str, extra_length_mm: f64) -> Option<Action> {
        let lane = self.lane_by_id(lane_id)?;
        let first_segment_length = lane
            .edge_ids
            .first()
            .map_or(0.0, |&id| self.edge_length_mm(id));
        Some(Action {
            kind: kind.to_owned(),
            occupy: (lane_id, 0),
            reserves: self.reserved_segments_for(lane_id + 1),
            length_mm: extra_length_mm + first_segment_length,
            witness: None,
        })
    }

    /// Every `(lane_id, segment)` pair of `lane_id`, if it exists among
    /// `self.lanes`; empty if it doesn't (e.g. reserving "ring 7" when only
    /// rings 0..6 exist -- controller amendment 3's "that is precisely where
    /// the turn lives", a no-op here rather than an error).
    fn reserved_segments_for(&self, lane_id: u32) -> Vec<(u32, u32)> {
        self.lane_by_id(lane_id)
            .map(|lane| {
                (0..lane.edge_ids.len() as u32)
                    .map(|i| (lane_id, i))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn continue_action(&self, lane: &Lane, index: u32) -> Action {
        Action {
            kind: "continue".to_owned(),
            occupy: (lane.id, index),
            reserves: Vec::new(),
            length_mm: self.edge_length_mm(lane.edge_ids[index as usize]),
            witness: None,
        }
    }

    fn terminate_action(&self) -> Action {
        Action {
            kind: "terminate".to_owned(),
            occupy: TERMINAL_MARKER,
            reserves: Vec::new(),
            length_mm: 0.0,
            witness: None,
        }
    }

    /// Whether every segment of `lane_id` is already in
    /// `state.reserved_lane_segments` -- vacuously true if `lane_id` does not
    /// exist among `self.lanes` (nothing to reserve, same "no lane 7" case
    /// as `reserved_segments_for`). `Invariant::Alternation`'s check: "is it
    /// still fine for lane `lane_id` to be unreserved" (yes, if it can't
    /// exist at all).
    fn lane_fully_reserved(&self, state: &SearchState, lane_id: u32) -> bool {
        self.ring_reservation_status(&state.reserved_lane_segments, lane_id)
            .unwrap_or(true)
    }

    /// `Some(true)`/`Some(false)` for whether every segment of `ring` is
    /// present in `reserved`, or `None` if `ring` does not exist among
    /// `self.lanes` at all. Shared arithmetic between two different
    /// invariants that disagree on what a missing ring *means*:
    /// `lane_fully_reserved` (`Invariant::Alternation`) treats "doesn't
    /// exist" as vacuously fine (nothing to reserve), while
    /// `corridor_reaches_zone` (`Invariant::TerminalCut`) treats a reserved
    /// segment naming a ring that doesn't exist as straightforwardly invalid
    /// -- see each caller.
    fn ring_reservation_status(&self, reserved: &BTreeSet<(u32, u32)>, ring: u32) -> Option<bool> {
        self.lane_by_id(ring)
            .map(|lane| (0..lane.edge_ids.len() as u32).all(|i| reserved.contains(&(ring, i))))
    }

    /// `Invariant::TerminalCut`'s real check (see the module doc's "why
    /// `TerminalCut` is a per-ring chain check, not `terminal_corridor_
    /// connected`"): whether `reserved` describes a return corridor that can
    /// actually be walked from its innermost ring back out to
    /// `self.zone_segment`'s own ring. Three conditions, all required:
    ///
    /// 1. `self.zone_segment` itself is reserved -- the amendment's literal
    ///    text, kept as an explicit sanity precondition (not the invariant
    ///    itself: it alone cannot see a gap deeper in the corridor, which is
    ///    exactly the vacuous case this replaces).
    /// 2. Every ring with *any* segment in `reserved` is *fully* reserved --
    ///    true by construction under `SpiralRules`' own atomic
    ///    reservation (`enter_lane_action` reserves a whole ring in one
    ///    side effect), so this should never actually fire under normal
    ///    operation; it is still a real check here, not a `debug_assert!`,
    ///    because `check` is a public trait method a test (or a future
    ///    caller) can hand any `SearchState` to, and this module never
    ///    panics on adversarial input (matching `expand`'s own "fail closed,
    ///    don't panic" stance).
    /// 3. `reserved`'s distinct rings, sorted ascending, are consecutive
    ///    lane-change pairs each present in `self.descend_chains` -- reused
    ///    directly, not recomputed: `compute_descend_chains` already builds
    ///    an entry for *every* lane id whose `id + 2` exists, which includes
    ///    the odd (reserved-ring) pairs 1->3, 3->5, ... alongside the even
    ///    ones `expand` uses for descend actions (confirmed on the real
    ///    fixture by `return_chain_tests`, below). A gap (e.g. `{1, 5}`
    ///    without `3`) fails here: `descend_chains[&1].to_lane == 3 != 5`.
    fn corridor_reaches_zone(&self, reserved: &BTreeSet<(u32, u32)>) -> bool {
        if reserved.is_empty() {
            return true;
        }
        if !reserved.contains(&self.zone_segment) {
            return false;
        }
        let rings: BTreeSet<u32> = reserved.iter().map(|&(ring, _)| ring).collect();
        if rings
            .iter()
            .any(|&ring| self.ring_reservation_status(reserved, ring) != Some(true))
        {
            return false;
        }
        rings
            .iter()
            .copied()
            .collect::<Vec<u32>>()
            .windows(2)
            .all(|pair| {
                self.descend_chains
                    .get(&pair[0])
                    .is_some_and(|chain| chain.to_lane == pair[1])
            })
    }

    /// `Invariant::TurnBudget`'s real check, run only against a `terminate`
    /// action (see the module doc): whether the cross-channel gap between
    /// the innermost occupied real lane and the innermost reserved lane
    /// (the return path's own starting ring) is bridgeable by some
    /// certified reverse-family template. Vacuously true if nothing is
    /// reserved at all yet (a degenerate single-lane arm has no return path
    /// to validate a turn against).
    fn terminate_turn_budget_ok(&self, state: &SearchState) -> bool {
        let Some(current_id) = innermost_occupied_lane(state) else {
            return false;
        };
        let Some(reserved_id) = innermost_reserved_lane(state) else {
            return true;
        };
        match (self.lane_by_id(current_id), self.lane_by_id(reserved_id)) {
            (Some(current_lane), Some(reserved_lane)) => turn_budget_ok(
                cross_distance_mm(&current_lane.rect_local, &reserved_lane.rect_local),
                &self.profile,
            ),
            _ => false,
        }
    }
}

impl PatternRules for SpiralRules {
    fn expand(&self, state: &SearchState) -> Vec<Action> {
        if state.occupied_lane_segments.contains(&TERMINAL_MARKER) {
            return Vec::new();
        }
        match innermost_occupied_lane(state) {
            None => match self.lanes.iter().map(|lane| lane.id).min() {
                Some(outermost) => self
                    .enter_lane_action(outermost, "start", 0.0)
                    .into_iter()
                    .collect(),
                None => Vec::new(),
            },
            Some(current) => {
                let Some(lane) = self.lane_by_id(current) else {
                    // `current` came from `state.occupied_lane_segments`,
                    // which only ever holds segments this same `expand`
                    // proposed -- always a real member of `self.lanes`. Not
                    // reachable via this module's own actions; defensive
                    // rather than asserted so a future caller handing this
                    // trait object a foreign `SearchState` fails closed
                    // (empty candidates) instead of panicking.
                    return Vec::new();
                };
                let walked = walked_count(state, current);
                if walked < lane.edge_ids.len() as u32 {
                    return vec![self.continue_action(lane, walked)];
                }
                let mut candidates = Vec::new();
                if let Some(chain) = self.descend_chains.get(&current)
                    && let Some(action) =
                        self.enter_lane_action(chain.to_lane, "descend", chain.length_mm)
                {
                    candidates.push(action);
                }
                candidates.push(self.terminate_action());
                candidates
            }
        }
    }

    fn check(&self, state: &SearchState, action: &Action) -> Result<(), Invariant> {
        if state.reserved_lane_segments.contains(&action.occupy) {
            return Err(Invariant::ReservedLane);
        }
        if action.kind == "descend" {
            // `checked_sub`, not `- 1`: `"descend"` only ever targets
            // `lane_id >= 2` *by this module's own construction*
            // (bootstrap uses `"start"`, never `"descend"`), but `check` is
            // a public trait method a test or future caller can hand any
            // `Action` to -- guarded at this boundary rather than trusted,
            // failing closed (rejected, not panicking) exactly like
            // `expand` fails closed on a foreign `SearchState`.
            let Some(prev_lane) = action.occupy.0.checked_sub(1) else {
                return Err(Invariant::Alternation);
            };
            if !self.lane_fully_reserved(state, prev_lane) {
                return Err(Invariant::Alternation);
            }
        }
        if action.occupy == TERMINAL_MARKER && !self.terminate_turn_budget_ok(state) {
            return Err(Invariant::TurnBudget);
        }
        // `Invariant::TerminalCut` is evaluated on every action, not only
        // ones that add a reservation. An earlier draft skipped it whenever
        // `action.reserves` was empty, reasoning that an unchanged input has
        // an unchanged (already-checked) answer -- true only if every
        // reservation in `state` was itself built up through a `check`-ed
        // action on *this* path. That does not hold for a hand-seeded
        // `SearchState` (exactly what `check` -- a public trait method --
        // must still handle correctly, and what
        // `terminal_cut_rejects_a_disconnected_reserved_corridor` below
        // exercises): a caller can construct a broken reserved set directly
        // and then check a `"descend"`/`"terminate"` action whose own
        // `reserves` happens to be empty (e.g. descending to ring 6 reserves
        // nothing further -- ring 7 doesn't exist), which would let the
        // pre-existing break through unexamined. Running the check
        // unconditionally costs nothing extra that matters: the expensive
        // part (real graph queries) is already fully precomputed, once, in
        // `self.descend_chains` (see the module doc) -- what runs here on
        // every call is a handful of `BTreeSet`/`BTreeMap` lookups over at
        // most a few hundred reserved segments, not a graph traversal.
        let mut simulated_reserved = state.reserved_lane_segments.clone();
        simulated_reserved.extend(action.reserves.iter().copied());
        if !self.corridor_reaches_zone(&simulated_reserved) {
            return Err(Invariant::TerminalCut);
        }
        if state.used_length_mm + action.length_mm
            > MAX_LOOP_LENGTH_MM - 2.0 * ZONE_LENGTH_ALLOWANCE_MM
        {
            return Err(Invariant::LengthBudget);
        }
        Ok(())
    }
}

fn innermost_occupied_lane(state: &SearchState) -> Option<u32> {
    state
        .occupied_lane_segments
        .iter()
        .map(|&(lane, _)| lane)
        .filter(|&lane| lane != TERMINAL_MARKER.0)
        .max()
}

fn innermost_reserved_lane(state: &SearchState) -> Option<u32> {
    state
        .reserved_lane_segments
        .iter()
        .map(|&(lane, _)| lane)
        .max()
}

fn walked_count(state: &SearchState, lane_id: u32) -> u32 {
    state
        .occupied_lane_segments
        .iter()
        .filter(|&&(lane, _)| lane == lane_id)
        .count() as u32
}

/// The cross-channel gap between two lane rings' `rect_local`s: the largest
/// of the four same-side gaps. Identical in shape to `search.rs`'s
/// `segments_adjacent` cross-lane `inset` (both measure "how far apart are
/// these two rings, really, given each side snaps independently") -- not
/// shared code because `search.rs` computes it from two `(lane, segment)`
/// keys plus a slice of lanes (its own established interface), while this
/// module already holds the two `Lane`s directly.
fn cross_distance_mm(a: &RectMm, b: &RectMm) -> f64 {
    [
        (a.min.x - b.min.x).abs(),
        (a.max.x - b.max.x).abs(),
        (a.min.y - b.min.y).abs(),
        (a.max.y - b.max.y).abs(),
    ]
    .into_iter()
    .fold(0.0_f64, f64::max)
}

/// Whether `profile`'s catalogue contains a reverse-family template (see
/// [`reverse_span_mm`]) whose span exactly matches `cross_distance_mm` --
/// the dimensional feasibility check controller amendment 2 replaces the
/// brief's "span >= 160mm" formula with. Scans `profile.templates()` *and*
/// each one's `reversed()` twin (the catalogue is closed under path
/// reversal, `template.rs`'s own module doc) rather than trusting either
/// list alone, even though on the current seven-template catalogue neither
/// `BroadReverse180` nor `TeardropReverse` needs its reversed twin to be
/// found (both are already reverse-family in their base orientation) --
/// scanning both is what makes this check keep working if a future
/// catalogue addition is only reverse-family after reversal.
pub fn turn_budget_ok(cross_distance_mm: f64, profile: &PlateProfile) -> bool {
    profile.templates().iter().any(|template| {
        let reversed = template.reversed();
        [template, &reversed].into_iter().any(|candidate| {
            reverse_span_mm(candidate)
                .is_some_and(|span| (span - cross_distance_mm).abs() < GEOMETRY_EPSILON_MM)
        })
    })
}

/// `Some(span)` when `template` is reverse-family -- its end heading is
/// exactly opposite its start heading, and its net displacement has no
/// component along the start heading (all of the displacement is
/// cross-channel) -- where `span` is that cross-channel displacement's
/// magnitude. `None` for every turn/straight template, which either doesn't
/// reverse heading at all (`Straight0`/`Straight45`) or turns by something
/// other than 180 degrees (`BroadTurn45`/`90`/`135`).
fn reverse_span_mm(template: &MotionTemplate) -> Option<f64> {
    let opposite = Heading8::from_octant(template.start.heading.octant() + 4);
    if template.end.heading != opposite {
        return None;
    }
    let displacement = template.end.point - template.start.point;
    let along = displacement.dot(template.start.heading.direction());
    if along.abs() > GEOMETRY_EPSILON_MM {
        return None;
    }
    Some(displacement.norm())
}

fn primitives_length_mm(primitives: &[PathPrimitive]) -> f64 {
    primitives.iter().map(PathPrimitive::length).sum()
}

/// For every lane `k` in `lanes` whose `k+2` is also present, the smallest
/// certified lane-change chain from `k` to `k+2` (see the module doc);
/// absent for a `k` with no valid chain (that `k`'s `expand` will then never
/// offer `"descend"`, only `"terminate"`).
///
/// This map has two callers with different exclusion needs, both satisfied
/// by the same "exclude `k+1`" rule for an unrelated reason each: for even
/// `k` (an occupied ring), entry `k` is the inward arm's own lane-change,
/// where `k+1` is the *reserved* ring the entry must not cut across; for
/// odd `k` (a reserved ring), entry `k` is reused by
/// [`SpiralRules::corridor_reaches_zone`] as the return path's lane-change,
/// where `k+1` is instead the *occupied* ring the return path must not cut
/// across. Both are correct only because "the ring strictly between two
/// reserved-or-occupied rings two apart" happens to be `k+1` regardless of
/// which parity `k` has -- if `excluded_edge_ids`'s signature ever changes
/// to something other than `(from, from + 1, to)`, re-derive this for both
/// callers, not just the inward-arm one it was written for.
fn compute_descend_chains(
    lanes: &[Lane],
    graph: &EmbeddedPoseGraph,
) -> BTreeMap<u32, DescendChain> {
    let by_start = index_edges_by_start_node(graph);
    let edge_by_id: BTreeMap<u32, &PoseEdge> =
        graph.edges.iter().map(|edge| (edge.id, edge)).collect();
    let lane_ids: BTreeSet<u32> = lanes.iter().map(|lane| lane.id).collect();

    let mut chains = BTreeMap::new();
    for from in &lane_ids {
        let to = from + 2;
        if !lane_ids.contains(&to) {
            continue;
        }
        let excluded = excluded_edge_ids(lanes, *from, from + 1, to);
        if let Some(chain) =
            find_smallest_chain(lanes, &by_start, &edge_by_id, *from, to, &excluded)
        {
            chains.insert(*from, chain);
        }
    }
    chains
}

fn index_edges_by_start_node(graph: &EmbeddedPoseGraph) -> BTreeMap<u32, Vec<u32>> {
    let mut by_start: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for edge in &graph.edges {
        by_start.entry(edge.start.id).or_default().push(edge.id);
    }
    by_start
}

/// The real catalogued edges of `lanes[from]`, `lanes[skipped]` (the ring
/// that will be reserved, if it exists) and `lanes[to]` -- excluded from
/// lane-change chain candidates so a chain can never, even coincidentally,
/// reuse a segment the search will go on to reserve (controller amendment
/// 5's hard-invariant concern; see the module doc).
///
/// Called from [`compute_descend_chains`] with `skipped == from + 1` for
/// every `from`, which is the *reserved* ring when `from` is even (inward
/// arm) and the *occupied* ring when `from` is odd (return path, reused by
/// `corridor_reaches_zone`) -- see that function's doc for why one call
/// shape correctly serves both.
fn excluded_edge_ids(lanes: &[Lane], from: u32, skipped: u32, to: u32) -> HashSet<u32> {
    let mut excluded = HashSet::new();
    for id in [from, skipped, to] {
        if let Some(lane) = lanes.iter().find(|lane| lane.id == id) {
            excluded.extend(lane.edge_ids.iter().copied());
        }
    }
    excluded
}

/// The deterministically smallest chain (fewest hops first, then smallest
/// edge id(s)) from any node of `lanes[from]` to any node of `lanes[to]`,
/// using only edges outside `excluded`. Tries a single direct edge first
/// (none exist on the real fixture for any ring pair -- verified empirically
/// -- but a future catalogue addition might supply one), then a two-edge
/// chain through a shared intermediate node.
fn find_smallest_chain(
    lanes: &[Lane],
    by_start: &BTreeMap<u32, Vec<u32>>,
    edge_by_id: &BTreeMap<u32, &PoseEdge>,
    from: u32,
    to: u32,
    excluded: &HashSet<u32>,
) -> Option<DescendChain> {
    let from_nodes = &lanes.iter().find(|lane| lane.id == from)?.node_ids;
    let to_nodes: HashSet<u32> = lanes
        .iter()
        .find(|lane| lane.id == to)?
        .node_ids
        .iter()
        .copied()
        .collect();

    let mut best_direct: Option<u32> = None;
    for &start_node in from_nodes {
        for &edge_id in by_start.get(&start_node).into_iter().flatten() {
            if excluded.contains(&edge_id) {
                continue;
            }
            let edge = edge_by_id[&edge_id];
            if to_nodes.contains(&edge.end.id) && best_direct.is_none_or(|best| edge_id < best) {
                best_direct = Some(edge_id);
            }
        }
    }
    if let Some(edge_id) = best_direct {
        let edge = edge_by_id[&edge_id];
        return Some(DescendChain {
            to_lane: to,
            hop_edge_ids: vec![edge_id],
            length_mm: primitives_length_mm(&edge.primitives),
        });
    }

    let mut best_pair: Option<(u32, u32)> = None;
    for &start_node in from_nodes {
        for &hop1_id in by_start.get(&start_node).into_iter().flatten() {
            if excluded.contains(&hop1_id) {
                continue;
            }
            let hop1 = edge_by_id[&hop1_id];
            for &hop2_id in by_start.get(&hop1.end.id).into_iter().flatten() {
                if excluded.contains(&hop2_id) {
                    continue;
                }
                let hop2 = edge_by_id[&hop2_id];
                if to_nodes.contains(&hop2.end.id) {
                    let candidate = (hop1_id, hop2_id);
                    if best_pair.is_none_or(|best| candidate < best) {
                        best_pair = Some(candidate);
                    }
                }
            }
        }
    }
    let (hop1_id, hop2_id) = best_pair?;
    let length_mm = primitives_length_mm(&edge_by_id[&hop1_id].primitives)
        + primitives_length_mm(&edge_by_id[&hop2_id].primitives);
    Some(DescendChain {
        to_lane: to,
        hop_edge_ids: vec![hop1_id, hop2_id],
        length_mm,
    })
}

/// The real length of every edge id any lane or any descend chain
/// references -- exactly the set [`SpiralRules::edge_length_mm`] will ever
/// be asked to look up.
fn compute_edge_lengths(
    lanes: &[Lane],
    chains: &BTreeMap<u32, DescendChain>,
    graph: &EmbeddedPoseGraph,
) -> BTreeMap<u32, f64> {
    let edge_by_id: BTreeMap<u32, &PoseEdge> =
        graph.edges.iter().map(|edge| (edge.id, edge)).collect();
    let mut needed: HashSet<u32> = HashSet::new();
    for lane in lanes {
        needed.extend(lane.edge_ids.iter().copied());
    }
    for chain in chains.values() {
        needed.extend(chain.hop_edge_ids.iter().copied());
    }
    needed
        .into_iter()
        .filter_map(|id| {
            edge_by_id
                .get(&id)
                .map(|edge| (id, primitives_length_mm(&edge.primitives)))
        })
        .collect()
}

/// Journal tail length `plan_inward_arm`'s `backtracking_search` call keeps.
/// A full four-ring arm on the real fixture applies on the order of 150
/// actions before terminating; 50 is generous enough to carry a rejection
/// plus its surrounding context without keeping the entire run.
const JOURNAL_TAIL_LIMIT: usize = 50;

/// Runs the spiral inward arm search: walks `lanes` outward-in on every
/// other ring, reserving the ring in between, until either the rings run
/// out or the deepest reachable ring cannot host a certified turn-around
/// (see the module doc). `zone_segment` and `spacing_mm` are threaded
/// straight into [`SpiralRules`]; `graph` is only used for the one-time
/// lane-change-chain and edge-length lookups in [`SpiralRules::new`].
pub fn plan_inward_arm(
    lanes: &[Lane],
    zone_segment: (u32, u32),
    spacing_mm: f64,
    graph: &EmbeddedPoseGraph,
    max_actions: usize,
) -> Result<InwardArm, SearchFailure> {
    let rules = SpiralRules::new(
        lanes.to_vec(),
        zone_segment,
        spacing_mm,
        PlateProfile::bekotec_en_23_fi_30_16(),
        graph,
    );
    let initial = SearchState {
        occupied_lane_segments: BTreeSet::new(),
        reserved_lane_segments: BTreeSet::new(),
        used_length_mm: 0.0,
        journal: Journal::new(JOURNAL_TAIL_LIMIT),
        actions_used: 0,
    };
    let result = backtracking_search(&rules, initial, max_actions)?;
    Ok(reconstruct_arm(&rules, &result))
}

/// Rebuilds the arm's public shape from a successful search's final state:
/// `lane_sequence` is the distinct real lane ids in `occupied_lane_segments`
/// (ascending; the sentinel excluded), and `edge_ids` is each occupied
/// lane's own `edge_ids` in order, with the chosen descend chain's edge ids
/// spliced in between consecutive lanes (see the module doc's "provenance,
/// not a chained path").
fn reconstruct_arm(rules: &SpiralRules, state: &SearchState) -> InwardArm {
    let lane_sequence: Vec<u32> = state
        .occupied_lane_segments
        .iter()
        .map(|&(lane, _)| lane)
        .filter(|&lane| lane != TERMINAL_MARKER.0)
        .collect::<BTreeSet<u32>>()
        .into_iter()
        .collect();

    let mut edge_ids = Vec::new();
    for (index, &lane_id) in lane_sequence.iter().enumerate() {
        if index > 0 {
            let previous = lane_sequence[index - 1];
            if let Some(chain) = rules.descend_chains.get(&previous) {
                edge_ids.extend(chain.hop_edge_ids.iter().copied());
            }
        }
        if let Some(lane) = rules.lane_by_id(lane_id) {
            edge_ids.extend(lane.edge_ids.iter().copied());
        }
    }
    InwardArm {
        lane_sequence,
        edge_ids,
    }
}

#[cfg(test)]
mod return_chain_tests {
    //! Started as a throwaway reviewer-review probe ("does `compute_descend_
    //! chains` -- which iterates *every* lane id whose `id+2` also exists,
    //! not just even ones -- already produce usable entries for the odd
    //! (reserved) ring pairs 1->3 and 3->5, with hop edges that avoid the
    //! *occupied* middle ring (2, 4 respectively), on the real fixture?");
    //! confirmed yes (`descend_chains.keys() == [0,1,2,3,4]`) and kept as a
    //! permanent pin, matching `fields.rs`'s own precedent for a private
    //! invariant the integration tests can only reach indirectly (via
    //! `Invariant::TerminalCut`, which is *what* fails, not *why* the
    //! underlying chain lookup would have failed).
    use super::*;
    use crate::circuit::types::ConnectionInput;
    use crate::circuit::zone::{build_connection_zone, build_graph_view};
    use crate::geometry::Polygon;
    use crate::model::Point;
    use crate::plate::{PlateGraphLimits, PlateInstance, build_embedded_graph};

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

    fn transform() -> crate::plate::PlateTransform {
        crate::plate::PlateTransform::from_edge(
            point(0.0, 0.0),
            point(3000.0, 0.0),
            point(1500.0, 1200.0),
            0.0,
            0.0,
        )
        .unwrap()
    }

    #[test]
    fn odd_ring_pairs_have_certified_return_chains_avoiding_the_occupied_middle_ring() {
        let instance = PlateInstance::new(
            rect_polygon(),
            transform(),
            PlateProfile::bekotec_en_23_fi_30_16(),
            50_000,
        )
        .unwrap();
        let graph = build_embedded_graph(&instance, 75.0, PlateGraphLimits::default()).unwrap();
        let zone = build_connection_zone(
            &rect_polygon(),
            &transform(),
            &ConnectionInput {
                edge_index: 0,
                center_offset_mm: 1500.0,
                zone_width_mm: 300.0,
                zone_depth_mm: 50.0,
            },
        )
        .unwrap();
        let view = build_graph_view(&graph, &zone, &transform());
        let field = crate::circuit::fields::Field {
            id: 0,
            rect_local: RectMm {
                min: point(0.0, 0.0),
                max: point(3000.0, 2400.0),
            },
        };
        let lanes =
            crate::circuit::fields::build_lanes(&field, 150.0, &graph, &view, &transform(), 75.0)
                .unwrap();
        assert_eq!(lanes.len(), 7, "sanity: real fixture has 7 lanes");

        let chains = compute_descend_chains(&lanes, &graph);

        let chain_1_3 = chains.get(&1);
        eprintln!("chain from ring 1: {chain_1_3:?}");
        assert!(
            chain_1_3.is_some(),
            "no certified chain found from ring 1 to ring 3"
        );
        let chain_1_3 = chain_1_3.unwrap();
        assert_eq!(chain_1_3.to_lane, 3);
        let ring2_edges: HashSet<u32> = lanes[2].edge_ids.iter().copied().collect();
        assert!(
            chain_1_3
                .hop_edge_ids
                .iter()
                .all(|id| !ring2_edges.contains(id)),
            "1->3 chain must avoid the occupied middle ring (2)'s own edges"
        );

        let chain_3_5 = chains.get(&3);
        eprintln!("chain from ring 3: {chain_3_5:?}");
        assert!(
            chain_3_5.is_some(),
            "no certified chain found from ring 3 to ring 5"
        );
        let chain_3_5 = chain_3_5.unwrap();
        assert_eq!(chain_3_5.to_lane, 5);
        let ring4_edges: HashSet<u32> = lanes[4].edge_ids.iter().copied().collect();
        assert!(
            chain_3_5
                .hop_edge_ids
                .iter()
                .all(|id| !ring4_edges.contains(id)),
            "3->5 chain must avoid the occupied middle ring (4)'s own edges"
        );

        eprintln!(
            "all descend_chains keys: {:?}",
            chains.keys().collect::<Vec<_>>()
        );
    }
}
