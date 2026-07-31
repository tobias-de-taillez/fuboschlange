//! Task 5: the pattern-agnostic backtracking search core. The four tests
//! whose bodies are reproduced verbatim from the brief
//! (`.superpowers/sdd/task-5-brief.md`, Step 1) are marked below; the rest
//! close coverage gaps the brief's own four tests leave open (see each
//! test's comment for which gap and why).

use single_loop_solver::circuit::{
    Action, Invariant, Journal, Lane, PatternRules, RectMm, SearchFailureKind, SearchState,
    backtracking_search, terminal_corridor_connected,
};
use single_loop_solver::model::Point;
use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ToyMode {
    Normal,
    Poisoned,
    Unsolvable,
}

/// A hand-built [`PatternRules`] impl exercising `backtracking_search`
/// without any real graph/lane data, per the brief's "three lanes, one
/// poisoned segment" framing. The three toy lanes (0, 1, 2) exist only as
/// `(lane, segment)` numbers `expand`/`check` reason about -- no `Lane`
/// value is ever constructed for this struct, which is the point of the
/// pattern-agnostic core under test: it must work from `SearchState` alone.
struct ToyRules {
    mode: ToyMode,
}

impl Default for ToyRules {
    fn default() -> Self {
        Self {
            mode: ToyMode::Normal,
        }
    }
}

impl ToyRules {
    fn with_poisoned_first_choice() -> Self {
        Self {
            mode: ToyMode::Poisoned,
        }
    }

    fn unsolvable() -> Self {
        Self {
            mode: ToyMode::Unsolvable,
        }
    }

    /// Fresh state shared by every test below; `tail_limit` (20) is
    /// generous since none of these toy searches produce more than a
    /// handful of journal entries.
    fn initial() -> SearchState {
        SearchState {
            occupied_lane_segments: BTreeSet::new(),
            reserved_lane_segments: BTreeSet::new(),
            used_length_mm: 0.0,
            journal: Journal::new(20),
            actions_used: 0,
        }
    }
}

/// The first candidate at the empty state in `Poisoned` mode: occupies lane
/// 0 segment 0, carrying a nonzero length and a side-effect reservation.
/// This branch is *not* itself poisoned (it succeeds when checked) -- the
/// poison is one level deeper (see `expand` below) -- so the search must
/// apply this action, discover the dead end, and then backtrack out of it.
/// Giving it a nonzero `length_mm` and a non-empty `reserves` means the
/// eventual rollback (occupied-segment removal, reservation removal, length
/// charge reversal) is independently checkable in
/// `search_backtracks_over_a_poisoned_branch_and_finds_the_alternative`
/// below, rather than merely assumed. `(9, 9)` is an arbitrary sentinel
/// segment distinct from everything else this fixture touches.
fn poisoned_branch_first_step() -> Action {
    Action {
        kind: "occupy".to_owned(),
        occupy: (0, 0),
        reserves: vec![(9, 9)],
        length_mm: 42.0,
        witness: None,
    }
}

impl PatternRules for ToyRules {
    fn expand(&self, state: &SearchState) -> Vec<Action> {
        match self.mode {
            // Never exercised via `backtracking_search` in this file (only
            // `ToyRules::default().check(...)` is called directly, in
            // `reserving_then_occupying_the_same_segment_is_a_dead_end`) --
            // an immediately-terminal empty proposal is the simplest
            // correct choice.
            ToyMode::Normal => Vec::new(),
            ToyMode::Poisoned => {
                if state.occupied_lane_segments.is_empty() {
                    // Three candidates for "three lanes": lane 0 (leads to
                    // the poisoned branch one level down, tried first
                    // since `expand`'s order is deterministic and this is
                    // first in the list), lane 1 (safe, the eventual
                    // answer), lane 2 (never reached -- lane 1 already
                    // succeeds -- included so the toy genuinely offers a
                    // third lane's worth of choice, matching the brief's
                    // "three lanes" framing).
                    vec![
                        poisoned_branch_first_step(),
                        Action::occupy(1, 0),
                        Action::occupy(2, 0),
                    ]
                } else if state.occupied_lane_segments.contains(&(0, 0)) {
                    // One level into the lane-0 branch: the only next move
                    // is poisoned, so this whole branch is a dead end and
                    // must be backtracked out of (not just rejected and
                    // retried in place, which is why the poison sits here
                    // and not directly in the first candidate list).
                    vec![Action::occupy(0, 1)]
                } else {
                    Vec::new()
                }
            }
            ToyMode::Unsolvable => {
                // Always proposes a fresh, never-before-occupied segment on
                // lane 0, so `check` (below) never has a reason to reject
                // it and the state never becomes terminal: the only way
                // this search can end is the `max_actions` budget.
                vec![Action::occupy(0, state.occupied_lane_segments.len() as u32)]
            }
        }
    }

    fn check(&self, state: &SearchState, action: &Action) -> Result<(), Invariant> {
        if state.reserved_lane_segments.contains(&action.occupy) {
            return Err(Invariant::ReservedLane);
        }
        if self.mode == ToyMode::Poisoned && action.occupy == (0, 1) {
            // The toy's one poisoned segment. `TurnBudget` has no special
            // meaning here -- `Invariant` is a closed, shared enum, and
            // this rejection reason is otherwise unrelated to any of its
            // five real meanings; it is reused purely as a distinguishable
            // label.
            return Err(Invariant::TurnBudget);
        }
        Ok(())
    }
}

// --- Brief Step 1, verbatim ---

#[test]
fn search_backtracks_over_a_poisoned_branch_and_finds_the_alternative() {
    let rules = ToyRules::with_poisoned_first_choice();
    let result = backtracking_search(&rules, ToyRules::initial(), 1000).unwrap();
    assert!(
        result
            .journal
            .entries()
            .iter()
            .any(|e| e.rejected_by.is_some())
    );

    // Teeth beyond the brief's own assertion: the search must have actually
    // undone the poisoned branch's first step, not merely found a way
    // around it while leaving stray state behind. Without these, a
    // `backtracking_search` that never undoes anything (e.g. one that just
    // keeps trying candidates from the *same* frame forever) could still
    // satisfy the assertion above as long as some candidate, anywhere, was
    // ever rejected.
    assert!(
        !result.occupied_lane_segments.contains(&(0, 0)),
        "backtracking must roll back the poisoned branch's occupied segment"
    );
    assert!(
        result.reserved_lane_segments.is_empty(),
        "backtracking must roll back the poisoned branch's side-effect reservation"
    );
    assert_eq!(
        result.used_length_mm, 0.0,
        "backtracking must roll back the poisoned branch's length charge"
    );
    assert!(result.occupied_lane_segments.contains(&(1, 0)));
}

#[test]
fn search_exceeding_action_budget_is_a_typed_limit() {
    let rules = ToyRules::unsolvable();
    let failure = backtracking_search(&rules, ToyRules::initial(), 10).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::LimitExceeded);
    assert_eq!(failure.actions_used, 10);
}

#[test]
fn reserving_then_occupying_the_same_segment_is_a_dead_end() {
    let mut state = ToyRules::initial();
    state.reserved_lane_segments.insert((1, 0));
    let action = Action::occupy(1, 0);
    assert!(matches!(
        ToyRules::default().check(&state, &action),
        Err(Invariant::ReservedLane)
    ));
}

/// A single, deliberately *not closed* (`node_ids.first() != node_ids.last()`)
/// three-segment lane: `terminal_corridor_cut_is_detected` below must only
/// exercise the plain "consecutive index" adjacency rule, not the
/// closed-cycle wrap-around (covered separately in
/// `wrap_around_adjacency_only_applies_to_a_closed_cycle`).
fn lanes() -> Vec<Lane> {
    vec![Lane {
        id: 1,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(400.0, 300.0),
        },
        node_ids: vec![10, 11, 12, 13],
        edge_ids: vec![100, 101, 102],
    }]
}

fn reserved_chain() -> BTreeSet<(u32, u32)> {
    [(1, 0), (1, 1), (1, 2)].into_iter().collect()
}

#[test]
fn terminal_corridor_cut_is_detected() {
    // reserved segments: (1,0)-(1,1)-(1,2); removing (1,1) cuts (1,2) from the zone at (1,0)
    let mut reserved = reserved_chain();
    reserved.remove(&(1, 1));
    assert!(!terminal_corridor_connected(&reserved, &lanes(), (1, 0)));
}

// --- Coverage the brief's four required tests don't reach ---

#[test]
fn terminal_corridor_is_connected_before_the_cut() {
    // Positive control for `terminal_corridor_cut_is_detected`: the
    // required test above only exercises the "cut" branch, never
    // confirming the same fixture reports "connected" before the middle
    // segment is removed. Without this, an implementation that always
    // returns `false` for this fixture would also pass the required test.
    let reserved = reserved_chain();
    assert!(terminal_corridor_connected(&reserved, &lanes(), (1, 0)));
}

#[test]
fn wrap_around_adjacency_only_applies_to_a_closed_cycle() {
    // Closes the "wrap-around for closed cycles" half of the brief's Step 3
    // adjacency rule: `lanes()` above is deliberately truncated (not
    // closed) so it cannot exercise this. Segments 0 and 3 of a 4-segment
    // ring are reserved with segments 1 and 2 deliberately absent, so this
    // can only pass via the wrap edge between index 3 and index 0, never
    // via ordinary consecutive-index adjacency.
    let closed = Lane {
        id: 2,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(400.0, 300.0),
        },
        node_ids: vec![20, 21, 22, 23, 20], // closed: first == last
        edge_ids: vec![200, 201, 202, 203],
    };
    let reserved: BTreeSet<(u32, u32)> = [(2, 0), (2, 3)].into_iter().collect();
    assert!(terminal_corridor_connected(
        &reserved,
        std::slice::from_ref(&closed),
        (2, 0)
    ));

    // Same two segments, but the lane is truncated (not closed): the wrap
    // edge no longer exists, so they must NOT be considered adjacent.
    let open = Lane {
        node_ids: vec![20, 21, 22, 23],
        ..closed
    };
    assert!(!terminal_corridor_connected(&reserved, &[open], (2, 0)));
}

#[test]
fn cross_lane_adjacency_connects_matching_corners_of_nested_rings() {
    // `terminal_corridor_cut_is_detected` only reaches same-lane adjacency;
    // this exercises the cross-lane AABB-overlap approximation so that code
    // path isn't entirely unexercised by this suite. Two nested rings at
    // the common 150 mm ring spacing (matching `circuit_lanes.rs`'s
    // fixtures): each lane's segment 0 sits at its own `rect_local.min`
    // (bottom-left corner), 150 mm apart on both axes -- comfortably within
    // the geometry-derived margin (see `segments_adjacent`'s doc; this is
    // no longer a knife-edge case now that the margin scales with the
    // pair's own measured inset instead of a fixed constant).
    let outer = Lane {
        id: 0,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(2850.0, 2250.0),
        },
        node_ids: vec![900, 901, 900],
        edge_ids: vec![900, 901],
    };
    let inner = Lane {
        id: 1,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(150.0, 150.0),
            max: Point::new(2700.0, 2100.0),
        },
        node_ids: vec![910, 911, 910],
        edge_ids: vec![910, 911],
    };
    let reserved: BTreeSet<(u32, u32)> = [(0, 0), (1, 0)].into_iter().collect();
    assert!(terminal_corridor_connected(
        &reserved,
        &[outer, inner],
        (0, 0)
    ));
}

#[test]
fn cross_lane_adjacency_at_225_spacing_connects_matching_corners() {
    // Reproduces the reviewer-reported bug directly: 225 mm is a valid
    // `ALLOWED_SPACINGS_MM` value, but the old fixed 75 mm-per-side margin
    // (150 mm combined) could never bridge a 225 mm ring step, so a real
    // spiral search using 225 mm spacing would see every multi-lane
    // reserved corridor reported as cut regardless of whether it truly was.
    // Same shape as the 150 mm fixture above, scaled to a 225 mm inset on
    // every side.
    let outer = Lane {
        id: 0,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(2850.0, 2250.0),
        },
        node_ids: vec![920, 921, 920],
        edge_ids: vec![920, 921],
    };
    let inner = Lane {
        id: 1,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(225.0, 225.0),
            max: Point::new(2625.0, 2025.0),
        },
        node_ids: vec![930, 931, 930],
        edge_ids: vec![930, 931],
    };
    let reserved: BTreeSet<(u32, u32)> = [(0, 0), (1, 0)].into_iter().collect();
    assert!(terminal_corridor_connected(
        &reserved,
        &[outer, inner],
        (0, 0)
    ));
}

#[test]
fn cross_lane_adjacency_rejects_a_450_mm_gap_as_not_consecutive_nesting() {
    // Negative pin for the plausibility gate `segments_adjacent` applies to
    // the pair's own derived inset (see its doc comment): two lanes with
    // consecutive ids but a 450 mm gap on every side -- what ring 0 and
    // ring 3 would look like at 150 mm spacing, three real ring steps
    // apart despite this fixture handing them consecutive ids 0/1 -- must
    // NOT be treated as adjacent, even though matching corners (segment 0
    // vs segment 0) is the case the proximity half of the check is most
    // permissive about (see `cross_lane_adjacency_does_not_bridge_
    // mismatched_corners_of_nearby_rings` below for why matching corners
    // alone can never fail the proximity half, which is exactly why this
    // gate exists as a separate check).
    let outer = Lane {
        id: 0,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(3000.0, 3000.0),
        },
        node_ids: vec![940, 941, 940],
        edge_ids: vec![940, 941],
    };
    let inner = Lane {
        id: 1,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(450.0, 450.0),
            max: Point::new(2550.0, 2550.0),
        },
        node_ids: vec![950, 951, 950],
        edge_ids: vec![950, 951],
    };
    let reserved: BTreeSet<(u32, u32)> = [(0, 0), (1, 0)].into_iter().collect();
    assert!(!terminal_corridor_connected(
        &reserved,
        &[outer, inner],
        (0, 0)
    ));
}

#[test]
fn cross_lane_adjacency_does_not_bridge_mismatched_corners_of_nearby_rings() {
    // Negative pin for the proximity half of the check specifically, not
    // the plausibility gate: reuses the 150 mm nested pair from
    // `cross_lane_adjacency_connects_matching_corners_of_nested_rings`
    // (inset 150, comfortably under the gate), but compares the outer
    // ring's bottom-left corner (segment 0) against the inner ring's
    // top-right corner (segment 1 of its 2-segment `edge_ids` -- see
    // `segment_perimeter_point`) instead of its matching bottom-left.
    // These are genuinely far apart (roughly the inner ring's own
    // diagonal), so this must stay NOT adjacent -- without this test nesting the
    // rects closely enough to pass the plausibility gate would be
    // sufficient to bridge *any* pair of segments on them, which would
    // silently readmit the "distance doesn't matter" failure mode the
    // 450 mm test above catches only for the gate half.
    let outer = Lane {
        id: 0,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(2850.0, 2250.0),
        },
        node_ids: vec![960, 961, 960],
        edge_ids: vec![960, 961],
    };
    let inner = Lane {
        id: 1,
        field_id: 0,
        rect_local: RectMm {
            min: Point::new(150.0, 150.0),
            max: Point::new(2700.0, 2100.0),
        },
        node_ids: vec![970, 971, 970],
        edge_ids: vec![970, 971],
    };
    let reserved: BTreeSet<(u32, u32)> = [(0, 0), (1, 1)].into_iter().collect();
    assert!(!terminal_corridor_connected(
        &reserved,
        &[outer, inner],
        (0, 0)
    ));
}
