//! Pattern-agnostic backtracking search core that a future pattern's rules
//! (spiral, meander, ...) plug into via [`PatternRules`]. This module owns
//! the *mechanics* of chronological backtracking -- trying candidate
//! actions in deterministic order, journaling rejections, undoing on dead
//! ends, bounding total work -- and knows nothing about lanes, turns, or
//! spacing; every domain rule lives behind [`PatternRules::expand`] /
//! [`PatternRules::check`].
//!
//! ## The `backtracking_search` contract
//!
//! 1. At each state, `rules.expand(&state)` proposes an ordered list of
//!    candidate [`Action`]s. **An empty list means the state is accepted as
//!    final**: `backtracking_search` returns `Ok(state)` immediately, with
//!    no further checks. This is the *only* way a search succeeds -- a
//!    rules impl is responsible for recognizing when it has nothing left to
//!    propose (e.g. a spiral inward arm stops proposing "descend" once
//!    doing so would leave less than the turn-budget span; see
//!    `docs/superpowers/plans/2026-07-31-bekotec-loop-solver-spiral.md`,
//!    Task 6). `PatternRules::check`'s `Invariant::TurnBudget` arm is a
//!    safety net for actions a rule proposes anyway, not the primary way a
//!    search stops growing.
//! 2. Candidates are tried in order via `rules.check`. The first `Ok(())`
//!    is applied; every `Err(invariant)` appends a rejected [`JournalEntry`]
//!    (`rejected_by: Some(invariant.name().to_owned())`) and moves on to
//!    the next candidate -- rejections cost nothing against `max_actions`.
//! 3. If **every** candidate at a non-empty `expand()` is rejected, the
//!    state is a dead end: `backtracking_search` undoes the most recently
//!    applied action and resumes trying that decision's own leftover
//!    candidates (it never re-calls `expand` on the reverted state -- the
//!    leftover list is exactly what a second `expand` call would return,
//!    since `expand` is required to be deterministic, and reusing the
//!    stored list avoids relying on that a second time). If that decision
//!    has no leftovers either, the undo cascades to the one before it, and
//!    so on.
//! 4. If the cascade empties the whole decision stack (no alternative
//!    anywhere), the search fails with [`SearchFailureKind::Geometry`] --
//!    the search space is exhausted, not merely slow. Steps 1 and 3 never
//!    collide on what an empty candidate list means, because
//!    `backtracking_search` only ever inspects "is the current candidate
//!    list empty" once per loop iteration, at the very top, and by
//!    construction it is empty there only right after a fresh `expand`
//!    call (the first one, or the one right after applying an action): a
//!    list resumed after backtracking (a frame's leftover candidates) is
//!    only ever installed when it is non-empty (frames whose leftovers are
//!    empty are skipped over during the cascade), so a resumed list can
//!    never trigger the top-of-loop empty check.
//! 5. [`SearchState::actions_used`] is a monotonic, never-decremented
//!    counter of every action *applied* (accepted by `check`), including
//!    ones later undone by backtracking -- it bounds total work done, not
//!    the length of the final solution. It is compared against
//!    `max_actions` immediately before applying the next action; exceeding
//!    it fails the search with [`SearchFailureKind::LimitExceeded`] and
//!    `actions_used == max_actions` exactly (the `max_actions + 1`-th
//!    action is never applied).
//!
//! ## `Action`'s shape
//!
//! `Action` is a single struct, not a multi-variant enum, so that a future
//! `PatternRules` implementation can express new *kinds* of move --
//! "continue the lane", "descend two lanes via a certified lane-change
//! edge" -- by choosing field values, without this module (or the generic
//! core) needing to learn a new variant. `kind` is free-form, rules-owned
//! text used only to build `Decision`/`JournalEntry` descriptions;
//! `backtracking_search` never branches on it. `occupy` is the one segment
//! the action claims; `reserves` are segments it reserves as a side effect
//! (e.g. occupying lane `k` reserving all of lane `k+1`); `length_mm` is
//! charged to `SearchState::used_length_mm`; `witness` flows verbatim into
//! the resulting `JournalEntry.witness` on both acceptance and rejection,
//! for rules that can name a concrete point -- this generic core never
//! invents one itself.

use crate::circuit::fields::Lane;
use crate::circuit::types::JournalEntry;
use crate::model::Point;
use std::collections::{BTreeSet, VecDeque};

/// A hard rule a candidate [`Action`] can violate. Shared by every
/// `PatternRules` implementation; a given rules impl is free to enforce any
/// subset of these (or none).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Invariant {
    /// The action would occupy a segment already in
    /// `SearchState::reserved_lane_segments`.
    ReservedLane,
    /// The action would disconnect some reserved segment from the
    /// connection zone (see [`terminal_corridor_connected`]).
    TerminalCut,
    /// The action would leave too little span for a certified turn.
    TurnBudget,
    /// The action would occupy a lane out of the pattern's required
    /// alternation order.
    Alternation,
    /// The action would push `SearchState::used_length_mm` past the
    /// pattern's length budget.
    LengthBudget,
}

impl Invariant {
    /// Wire-stable name used as `JournalEntry.rejected_by`. Deliberately
    /// not derived from `{self:?}` at each call site (even though the two
    /// currently agree): `JournalEntry` is `Serialize` and its
    /// `rejected_by` flows out through `SearchFailure::journal_tail` into
    /// `LoopError`/`LoopPlan`, so this string is a wire value that a later
    /// change to variant order or a `Debug`-affecting derive must not be
    /// able to silently change.
    pub fn name(&self) -> &'static str {
        match self {
            Self::ReservedLane => "ReservedLane",
            Self::TerminalCut => "TerminalCut",
            Self::TurnBudget => "TurnBudget",
            Self::Alternation => "Alternation",
            Self::LengthBudget => "LengthBudget",
        }
    }
}

/// One atomic step a [`PatternRules::expand`] may propose. See the module
/// doc ("`Action`'s shape") for why this is a struct rather than a
/// multi-variant enum.
#[derive(Clone, Debug, PartialEq)]
pub struct Action {
    /// Free-form, rules-owned description of what kind of move this is
    /// (e.g. `"occupy"`, `"descend"`). Only used to build journal text;
    /// never matched on by this module.
    pub kind: String,
    /// The `(lane_id, segment_index)` this action occupies.
    pub occupy: (u32, u32),
    /// Segments newly reserved as a side effect of taking this action.
    pub reserves: Vec<(u32, u32)>,
    /// Length charged to `SearchState::used_length_mm` if this action is
    /// applied.
    pub length_mm: f64,
    /// Optional concrete point a rule can attach for `JournalEntry.witness`
    /// (copied verbatim on both acceptance and rejection).
    pub witness: Option<Point>,
}

impl Action {
    /// The minimal action: occupies `(lane, segment)`, reserves nothing,
    /// costs no length. What the brief's `Action::occupy(lane, segment)`
    /// constructs.
    pub fn occupy(lane: u32, segment: u32) -> Self {
        Self {
            kind: "occupy".to_owned(),
            occupy: (lane, segment),
            reserves: Vec::new(),
            length_mm: 0.0,
            witness: None,
        }
    }
}

/// A record of one choice point: which action was taken and how many
/// untried alternatives remained at that point. Used to build
/// `Decision::description`/`Decision::alternatives_left` for the
/// journal entry at the moment an action is applied (see
/// `backtracking_search`); not persisted on the internal decision stack --
/// once journaled as a `String`, the search never needs to reconstruct a
/// historical `Decision`.
#[derive(Clone, Debug, PartialEq)]
pub struct Decision {
    pub description: String,
    pub alternatives_left: usize,
}

/// The append-only trail of every action `backtracking_search` tried --
/// both accepted (`rejected_by: None`) and rejected (`rejected_by:
/// Some(invariant_name)`) -- including branches later undone by
/// backtracking. `entries` is private (encapsulated: only this module
/// appends to it); `tail_limit` is the caller-chosen bound a downstream
/// consumer (a `SearchFailure`, or eventually `LoopError`/`LoopPlan`)
/// should use via [`Journal::tail`].
#[derive(Clone, Debug, PartialEq)]
pub struct Journal {
    entries: Vec<JournalEntry>,
    pub tail_limit: usize,
}

impl Journal {
    pub fn new(tail_limit: usize) -> Self {
        Self {
            entries: Vec::new(),
            tail_limit,
        }
    }

    /// Every entry recorded so far, chronological (oldest first).
    pub fn entries(&self) -> &[JournalEntry] {
        &self.entries
    }

    /// The last `n` entries (fewer if the journal is shorter).
    pub fn tail(&self, n: usize) -> Vec<JournalEntry> {
        let start = self.entries.len().saturating_sub(n);
        self.entries[start..].to_vec()
    }

    fn record(&mut self, entry: JournalEntry) {
        self.entries.push(entry);
    }
}

/// The full mutable state a backtracking search thread carries: which
/// segments are claimed or held in reserve, how much length has been
/// spent, the journal, and the total-work counter. Pattern-agnostic --
/// nothing here is spiral- or meander-specific.
#[derive(Clone, Debug, PartialEq)]
pub struct SearchState {
    /// `(lane_id, segment index)` pairs the path currently occupies.
    pub occupied_lane_segments: BTreeSet<(u32, u32)>,
    /// `(lane_id, segment index)` pairs held in reserve (not occupied, but
    /// off limits to `occupy` -- see `Invariant::ReservedLane`).
    pub reserved_lane_segments: BTreeSet<(u32, u32)>,
    pub used_length_mm: f64,
    pub journal: Journal,
    /// Total actions applied so far, including ones later undone by
    /// backtracking -- see the module doc, contract point 5.
    pub actions_used: usize,
}

/// The seam a concrete pattern (spiral, meander, ...) plugs into. Both
/// methods are pure queries against an explicit `state`/`action` -- no
/// interior mutability, no side channel -- which is what lets
/// `backtracking_search` apply and undo actions generically without any
/// pattern-specific "apply"/"undo" method on this trait.
pub trait PatternRules {
    /// Proposes the ordered, deterministic list of candidate next actions
    /// for `state`. An empty list means `state` is accepted as final (see
    /// the module doc, contract point 1).
    fn expand(&self, state: &SearchState) -> Vec<Action>;

    /// Whether `action` may be applied to `state`. `Err` names the
    /// violated invariant; `backtracking_search` journals it and moves on
    /// to the next candidate from `expand`'s list.
    fn check(&self, state: &SearchState, action: &Action) -> Result<(), Invariant>;
}

/// Why a [`backtracking_search`] call failed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SearchFailureKind {
    /// The search space was exhausted: every alternative, everywhere on
    /// the decision stack, was tried and rejected.
    Geometry,
    /// `max_actions` was reached before a terminal state was found.
    LimitExceeded,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchFailure {
    pub kind: SearchFailureKind,
    pub actions_used: usize,
    pub journal_tail: Vec<JournalEntry>,
}

/// One entry of the internal decision stack: the action applied to reach
/// this state, enough undo information to reverse exactly that
/// application, and the untried candidates left over from the `expand()`
/// call that produced `applied` (for resuming after an undo -- see the
/// module doc, contract point 3).
struct Frame {
    applied: Action,
    /// Whether `applied.occupy` was newly inserted into
    /// `occupied_lane_segments` (as opposed to already present) --
    /// `undo` only removes what this action actually added.
    occupy_was_new: bool,
    /// The subset of `applied.reserves` that was newly inserted into
    /// `reserved_lane_segments`.
    newly_reserved: Vec<(u32, u32)>,
    remaining: Vec<Action>,
}

/// Runs the chronological backtracking search described in the module doc.
/// `initial.actions_used` is honored as a starting count (usually `0`), and
/// `max_actions` bounds the total number of actions applied across the
/// whole search, including ones later undone.
pub fn backtracking_search(
    rules: &dyn PatternRules,
    initial: SearchState,
    max_actions: usize,
) -> Result<SearchState, SearchFailure> {
    let mut state = initial;
    let mut stack: Vec<Frame> = Vec::new();
    let mut candidates = rules.expand(&state);

    loop {
        if candidates.is_empty() {
            // See the module doc, contract point 4: a resumed candidate
            // list is never empty, so this is always a fresh `expand()`
            // result, i.e. genuine terminal success.
            return Ok(state);
        }

        let mut accepted: Option<usize> = None;
        for (index, action) in candidates.iter().enumerate() {
            match rules.check(&state, action) {
                Ok(()) => {
                    accepted = Some(index);
                    break;
                }
                Err(invariant) => {
                    state.journal.record(JournalEntry {
                        decision: describe_action(action),
                        rejected_by: Some(invariant.name().to_owned()),
                        witness: action.witness,
                    });
                }
            }
        }

        let Some(index) = accepted else {
            // Every candidate here was rejected: dead end. Cascade the
            // undo upward until a frame has a leftover alternative, or the
            // whole stack is exhausted.
            loop {
                let Some(frame) = stack.pop() else {
                    return Err(SearchFailure {
                        kind: SearchFailureKind::Geometry,
                        actions_used: state.actions_used,
                        journal_tail: state.journal.tail(state.journal.tail_limit),
                    });
                };
                undo(&mut state, &frame);
                if !frame.remaining.is_empty() {
                    candidates = frame.remaining;
                    break;
                }
            }
            continue;
        };

        if state.actions_used >= max_actions {
            return Err(SearchFailure {
                kind: SearchFailureKind::LimitExceeded,
                actions_used: state.actions_used,
                journal_tail: state.journal.tail(state.journal.tail_limit),
            });
        }

        let remaining = candidates.split_off(index + 1);
        let action = candidates
            .pop()
            .expect("index was produced by iterating these same candidates");

        let occupy_was_new = state.occupied_lane_segments.insert(action.occupy);
        let mut newly_reserved = Vec::new();
        for segment in &action.reserves {
            if state.reserved_lane_segments.insert(*segment) {
                newly_reserved.push(*segment);
            }
        }
        state.used_length_mm += action.length_mm;
        state.actions_used += 1;

        let decision = Decision {
            description: describe_action(&action),
            alternatives_left: remaining.len(),
        };
        state.journal.record(JournalEntry {
            decision: decision.description,
            rejected_by: None,
            witness: action.witness,
        });

        candidates = rules.expand(&state);
        stack.push(Frame {
            applied: action,
            occupy_was_new,
            newly_reserved,
            remaining,
        });
    }
}

/// Reverses exactly the mutations `backtracking_search` applied for
/// `frame.applied`. `actions_used` is deliberately left untouched -- see
/// the module doc, contract point 5.
fn undo(state: &mut SearchState, frame: &Frame) {
    if frame.occupy_was_new {
        state.occupied_lane_segments.remove(&frame.applied.occupy);
    }
    for segment in &frame.newly_reserved {
        state.reserved_lane_segments.remove(segment);
    }
    state.used_length_mm -= frame.applied.length_mm;
}

/// Human-readable description used for both `Decision::description` and
/// `JournalEntry::decision`. Not a wire contract (unlike `Invariant::name`),
/// so its exact wording may change freely.
fn describe_action(action: &Action) -> String {
    format!(
        "{} lane {} segment {}",
        action.kind, action.occupy.0, action.occupy.1
    )
}

/// Cross-lane adjacency margin applied on each side (so two segments'
/// approximated points may be up to twice this apart and still count as
/// adjacent). Fixed at 75 mm -- half of the common 150 mm ring spacing
/// (`fields.rs`'s `CHANNEL_PITCH_MM`, not imported here since this
/// function's signature has no `spacing_mm` of its own to relate it to).
/// See `segments_adjacent`'s doc for the resulting limitation at wider
/// spacings.
const CROSS_LANE_ADJACENCY_MARGIN_MM: f64 = 75.0;

fn lane_by_id(lanes: &[Lane], id: u32) -> Option<&Lane> {
    lanes.iter().find(|lane| lane.id == id)
}

/// Approximates segment `(lane.id, index)`'s plate-local position as a
/// point on `lane.rect_local`'s perimeter, at the fraction `index` occupies
/// among `lane.edge_ids` (segment `i`'s position is taken at the *start* of
/// its span, `i / edge_ids.len()`, walking the perimeter in the same
/// counter-clockwise order `build_ring` (fields.rs) populates `edge_ids`
/// in: from the bottom-left corner, along the bottom (left-to-right), right
/// (bottom-to-top), top (right-to-left), then left (top-to-bottom) sides.
///
/// This is deliberately coarse: `Lane` carries only the ring's bounding
/// rectangle and edge/node *ids*, not each edge's real endpoints -- exact
/// geometry would require threading `EmbeddedPoseGraph` through
/// `terminal_corridor_connected`, which the brief's signature omits (the
/// corridor-cut check only needs approximate proximity between rings, not
/// exact edge geometry). Treating every edge as equal-length (ignoring that
/// corner edges are shorter than straight-hop edges) only ever moves a
/// segment's approximated position along the perimeter it's already on, not
/// off it, so it does not change which *side* of the rectangle a segment
/// lands near.
fn segment_perimeter_point(lane: &Lane, index: u32) -> Point {
    let rect = &lane.rect_local;
    let width = rect.max.x - rect.min.x;
    let height = rect.max.y - rect.min.y;
    let perimeter = 2.0 * (width + height);
    if perimeter <= 0.0 {
        return rect.min;
    }
    let segment_count = lane.edge_ids.len().max(1) as f64;
    let fraction = (index as f64 / segment_count).rem_euclid(1.0);
    let distance = fraction * perimeter;

    if distance <= width {
        Point::new(rect.min.x + distance, rect.min.y)
    } else if distance <= width + height {
        Point::new(rect.max.x, rect.min.y + (distance - width))
    } else if distance <= 2.0 * width + height {
        Point::new(rect.max.x - (distance - width - height), rect.max.y)
    } else {
        Point::new(rect.min.x, rect.max.y - (distance - 2.0 * width - height))
    }
}

/// Whether segments `a` and `b` are adjacent for corridor-connectivity
/// purposes. Two cases:
///
/// - Same lane: adjacent at consecutive index, or (only when the lane is a
///   closed cycle, `node_ids.first() == node_ids.last()`) wrapping from the
///   last index to `0` -- a truncated lane has no edge connecting its two
///   open ends, so no wrap.
/// - Consecutive lanes (`|lane difference| == 1`): adjacent when their
///   `segment_perimeter_point`s, each expanded by
///   `CROSS_LANE_ADJACENCY_MARGIN_MM`, overlap on both axes (an
///   axis-aligned-box overlap test between two point-sized boxes -- see
///   `segment_perimeter_point`'s doc for why a point, not a real edge
///   extent, is what's available here).
///
/// Known limitation, not fixed here: the 75 mm margin is fixed regardless
/// of the caller's actual ring spacing. At the common 150 mm spacing, two
/// consecutive rings' matching corners land exactly on the 150 mm
/// combined-margin boundary (adjacent, inclusively). At 225 mm or 300 mm
/// spacing -- both valid values -- consecutive rings' corners are *never*
/// within the margin, so `terminal_corridor_connected` cannot see
/// cross-lane adjacency at all at those spacings and would report a
/// multi-lane reserved corridor as cut even when it is not. Flagged for
/// whichever later task is the first to call this with more than one lane
/// at 225/300 mm spacing.
fn segments_adjacent(lanes: &[Lane], a: (u32, u32), b: (u32, u32)) -> bool {
    if a.0 == b.0 {
        return same_lane_adjacent(lanes, a, b);
    }
    if a.0.abs_diff(b.0) != 1 {
        return false;
    }
    let (Some(lane_a), Some(lane_b)) = (lane_by_id(lanes, a.0), lane_by_id(lanes, b.0)) else {
        return false;
    };
    let point_a = segment_perimeter_point(lane_a, a.1);
    let point_b = segment_perimeter_point(lane_b, b.1);
    let margin = 2.0 * CROSS_LANE_ADJACENCY_MARGIN_MM;
    (point_a.x - point_b.x).abs() <= margin && (point_a.y - point_b.y).abs() <= margin
}

fn same_lane_adjacent(lanes: &[Lane], a: (u32, u32), b: (u32, u32)) -> bool {
    let Some(lane) = lane_by_id(lanes, a.0) else {
        return false;
    };
    let segment_count = lane.edge_ids.len() as u32;
    if segment_count == 0 || a.1 >= segment_count || b.1 >= segment_count {
        return false;
    }
    let diff = a.1.abs_diff(b.1);
    if diff == 1 {
        return true;
    }
    let is_closed = lane
        .node_ids
        .first()
        .is_some_and(|first| lane.node_ids.last() == Some(first));
    is_closed && segment_count > 1 && diff == segment_count - 1
}

/// Whether every segment in `reserved` is reachable from `zone_lane_segment`
/// through other `reserved` segments (breadth-first; see `segments_adjacent`
/// for the adjacency rule). `zone_lane_segment` seeds the search regardless
/// of whether it is itself a member of `reserved` -- it represents the
/// connection zone's own doorway segment, the fixed anchor the reserved
/// corridor must stay connected to, not a claim that the zone itself is
/// "reserved".
///
/// Precondition: `lanes` must be one field's lanes (as `build_lanes`
/// returns them). `Lane::id` restarts at `0` per field, and the segment key
/// this module uses throughout, `(u32, u32)`, is a bare `(lane_id,
/// segment_index)` pair with no field discriminant (matching the brief's
/// fixed `SearchState` shape) -- concatenating two fields' lanes into one
/// slice would make `lane_by_id` resolve to whichever field's lane happens
/// to share that id first, and would let `segments_adjacent`'s cross-lane
/// branch treat one field's lane 0 and another field's lane 1 as
/// consecutive rings. Not enforced here (would need a `Result` return for a
/// caller misuse, not a real search state); a caller with multiple fields
/// calls this once per field.
pub fn terminal_corridor_connected(
    reserved: &BTreeSet<(u32, u32)>,
    lanes: &[Lane],
    zone_lane_segment: (u32, u32),
) -> bool {
    let mut visited: BTreeSet<(u32, u32)> = BTreeSet::new();
    let mut queue: VecDeque<(u32, u32)> = VecDeque::new();
    visited.insert(zone_lane_segment);
    queue.push_back(zone_lane_segment);

    while let Some(current) = queue.pop_front() {
        for &segment in reserved {
            if !visited.contains(&segment) && segments_adjacent(lanes, current, segment) {
                visited.insert(segment);
                queue.push_back(segment);
            }
        }
    }

    reserved.iter().all(|segment| visited.contains(segment))
}
