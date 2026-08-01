//! Task 9: pre-prune length estimate, escalation ladder, and candidate
//! ranking (design spec §6.9, §8, §10). The three tests reproduced
//! verbatim from the brief (`.superpowers/sdd/task-9-brief.md`, Step 1) are
//! marked below; the rest close gaps the brief's own tests and the
//! controller's amendments (recorded in the brief's cover instructions)
//! call out explicitly -- see each test's comment for which gap and why.

use single_loop_solver::circuit::{
    Candidate, LadderVerdict, LoopErrorCode, SearchFailure, SearchFailureKind, SpacingOutcome,
    escalation_ladder, length_estimate_mm, rank, walk_ladder,
};

fn candidate(
    key: &str,
    coverage_upper_mm: f64,
    penalty_sum_mm: f64,
    spacing_span_mm: f64,
    total_length_mm: f64,
) -> Candidate {
    Candidate {
        coverage_upper_mm,
        penalty_sum_mm,
        spacing_span_mm,
        total_length_mm,
        key: key.to_owned(),
    }
}

/// A `SearchFailure` shaped like a real `SearchFailureKind::Geometry` dead
/// end. The exact `actions_used`/`journal_tail` never matter to this
/// module -- `SpacingOutcome::GeometryFailure` is opaque cargo as far as
/// `escalate.rs` is concerned, it only ever asks "was this rung's outcome a
/// `GeometryFailure` at all" -- so a minimal one is enough.
fn geometry_failure() -> SearchFailure {
    SearchFailure {
        kind: SearchFailureKind::Geometry,
        actions_used: 3,
        journal_tail: Vec::new(),
    }
}

// --- Brief Step 1, verbatim ---

#[test]
fn ladder_starts_at_request_and_only_ascends() {
    assert_eq!(escalation_ladder(150), vec![150, 225, 300]);
    assert_eq!(escalation_ladder(300), vec![300]);
}

#[test]
fn pre_prune_formula_matches_spec() {
    // 7.2 m² at VA 75: 7_200_000/75 + 1000 = 97_000 → passes
    assert!(length_estimate_mm(7_200_000.0, 75.0) <= 100_000.0);
    // 7.6 m² at VA 75: 102_333 → pruned
    assert!(length_estimate_mm(7_600_000.0, 75.0) > 100_000.0);
}

#[test]
fn ranking_orders_by_coverage_then_penalty_then_span_then_length_then_key() {
    let winner = rank(vec![
        candidate("a", 80.0, 0.0, 10.0, 90_000.0),
        candidate("b", 75.0, 5.0, 20.0, 95_000.0), // better coverage wins despite penalty
    ]);
    assert_eq!(winner.key, "b");
    let winner = rank(vec![
        candidate("a", 75.0, 5.0, 10.0, 90_000.0),
        candidate("b", 75.0, 0.0, 20.0, 95_000.0), // equal coverage → lower penalty wins
    ]);
    assert_eq!(winner.key, "b");
}

// --- Coverage the brief's three required tests don't reach ---

#[test]
fn escalation_ladder_covers_every_starting_rung() {
    // The brief only pins the two ends (150 and 300); the middle starting
    // points are just as load-bearing for §8.3's "next value in the list"
    // wording and are cheap to pin directly.
    assert_eq!(escalation_ladder(75), vec![75, 150, 225, 300]);
    assert_eq!(escalation_ladder(225), vec![225, 300]);
}

#[test]
#[should_panic(expected = "ALLOWED_SPACINGS_MM")]
fn escalation_ladder_panics_on_a_spacing_outside_the_allowed_set() {
    // `validate_input` (types.rs) is the only intended gate before a
    // spacing reaches this function; this pins that `escalation_ladder`
    // trusts that gate rather than silently returning an empty or
    // misleading ladder for whatever a future caller passes without
    // validating first.
    escalation_ladder(100);
}

#[test]
fn ranking_coverage_within_the_tie_window_falls_through_to_penalty() {
    // Design spec §10 / predecessor §15: a coverage difference "innerhalb
    // 0,1 mm" is a tie, resolved by the next criterion. (f64 subtraction
    // means 75.10 - 75.00 isn't exactly 0.1, so this doesn't pin whether
    // the window boundary itself is inclusive -- it pins that a
    // near-0.1 mm difference is still treated as a tie, which is the
    // behavior that matters.)
    let winner = rank(vec![
        candidate("a", 75.10, 5.0, 10.0, 90_000.0),
        candidate("b", 75.00, 0.0, 20.0, 95_000.0),
    ]);
    assert_eq!(winner.key, "b");
}

#[test]
fn ranking_coverage_outside_the_tie_window_wins_outright() {
    // A clearly-more-than-0.1 mm difference (0.11 mm) is not a tie: the
    // smaller-coverage candidate wins even though it loses on every other
    // criterion, pinning that the tie window is narrow, not a loose
    // threshold that would let penalty/span/length override coverage.
    let winner = rank(vec![
        candidate("a", 75.00, 5.0, 10.0, 90_000.0),
        candidate("b", 75.11, 0.0, 5.0, 80_000.0),
    ]);
    assert_eq!(winner.key, "a");
}

#[test]
fn ranking_falls_through_penalty_and_span_ties_to_length_then_key() {
    // Coverage and penalty tied: span decides.
    let winner = rank(vec![
        candidate("a", 75.0, 0.0, 20.0, 90_000.0),
        candidate("b", 75.0, 0.0, 10.0, 95_000.0),
    ]);
    assert_eq!(winner.key, "b");

    // Coverage, penalty, and span all tied: length decides.
    let winner = rank(vec![
        candidate("a", 75.0, 0.0, 10.0, 95_000.0),
        candidate("b", 75.0, 0.0, 10.0, 90_000.0),
    ]);
    assert_eq!(winner.key, "b");

    // Everything tied except the key: lexicographically smallest wins,
    // regardless of input order.
    let winner = rank(vec![
        candidate("b", 75.0, 0.0, 10.0, 90_000.0),
        candidate("a", 75.0, 0.0, 10.0, 90_000.0),
    ]);
    assert_eq!(winner.key, "a");
}

#[test]
#[should_panic(expected = "at least one candidate")]
fn rank_panics_on_an_empty_candidate_list() {
    rank(Vec::new());
}

// --- Controller amendment 2: VA300 geometry, never mislabeled as length ---

#[test]
fn every_rung_failing_with_the_last_on_geometry_classifies_as_geometry() {
    // Pins the VA300 reality (Task 6/9 controller notes): 150 and 225 mm
    // fail only on length (so the ladder escalates past both), but the
    // 300 mm rung fails because no reverse-family template bridges a
    // 300 mm cross distance -- a turn-budget/geometry dead end, not a
    // length one. Design spec §8.4 says any geometry failure ends the
    // ladder without escalating -- but 300 mm is already the top of the
    // ladder, so the only way to tell this apart from an ordinary
    // exhausted-ladder length failure (§8.5) is the *kind* of the last
    // failure, not its position. Get this wrong and a real VA300 spiral
    // reports `NO_SOLUTION_LENGTH` for a problem more spacing can never
    // fix.
    let mut attempted = Vec::new();
    let verdict = walk_ladder(150, |spacing_mm| {
        attempted.push(spacing_mm);
        if spacing_mm == 300 {
            SpacingOutcome::GeometryFailure(geometry_failure())
        } else {
            SpacingOutcome::LengthOnly
        }
    });
    assert_eq!(attempted, vec![150, 225, 300]);
    assert_eq!(
        verdict,
        LadderVerdict::NoSolution(LoopErrorCode::NoSolutionGeometry)
    );
}

#[test]
fn exhausting_the_ladder_on_length_alone_reports_length_not_geometry() {
    // Positive control for the test above: without it, a classification
    // that always returned `NoSolutionGeometry` would also pass.
    let verdict = walk_ladder(150, |_spacing_mm| SpacingOutcome::LengthOnly);
    assert_eq!(
        verdict,
        LadderVerdict::NoSolution(LoopErrorCode::NoSolutionLength)
    );
}

#[test]
fn geometry_failure_at_the_requested_spacing_forbids_any_escalation() {
    // Design spec §8.4, the sharper edge: a geometry failure at the very
    // first (requested) rung must stop right there, never even trying
    // 225/300 -- escalation is a length-only remedy.
    let mut attempted = Vec::new();
    let verdict = walk_ladder(150, |spacing_mm| {
        attempted.push(spacing_mm);
        SpacingOutcome::GeometryFailure(geometry_failure())
    });
    assert_eq!(attempted, vec![150]);
    assert_eq!(
        verdict,
        LadderVerdict::NoSolution(LoopErrorCode::NoSolutionGeometry)
    );
}

#[test]
fn solving_a_rung_stops_the_ladder_without_trying_looser_spacings() {
    // Design spec §8.2: once a certified candidate exists, no larger
    // spacing is investigated at all.
    let mut attempted = Vec::new();
    let verdict = walk_ladder(150, |spacing_mm| {
        attempted.push(spacing_mm);
        SpacingOutcome::Solved(candidate("winner", 10.0, 0.0, 0.0, 50_000.0))
    });
    assert_eq!(attempted, vec![150]);
    assert_eq!(
        verdict,
        LadderVerdict::Solved(candidate("winner", 10.0, 0.0, 0.0, 50_000.0))
    );
}

#[test]
fn solving_after_escalating_past_length_only_failures_stops_there() {
    // Combines both continuation rules: escalate past two length-only
    // rungs, then stop at the first solved one without ever trying 300.
    let mut attempted = Vec::new();
    let verdict = walk_ladder(75, |spacing_mm| {
        attempted.push(spacing_mm);
        match spacing_mm {
            225 => SpacingOutcome::Solved(candidate("mid", 20.0, 0.0, 0.0, 60_000.0)),
            _ => SpacingOutcome::LengthOnly,
        }
    });
    assert_eq!(attempted, vec![75, 150, 225]);
    assert_eq!(
        verdict,
        LadderVerdict::Solved(candidate("mid", 20.0, 0.0, 0.0, 60_000.0))
    );
}
