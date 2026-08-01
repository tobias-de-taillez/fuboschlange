//! Task 9: pre-prune length estimate, the spacing escalation ladder, and
//! candidate ranking (design spec §6.9, §8, §10). Pure arithmetic and
//! ordering -- no graph or field data is touched here. A [`Candidate`] is
//! already-computed metrics (Task 10/11 build them from a certified
//! candidate path); a [`SpacingOutcome`] is an already-classified per-rung
//! search result (Task 11 builds these from `backtracking_search`/
//! `complete_spiral` output, deciding `LengthOnly` vs `GeometryFailure` --
//! see [`SpacingOutcome`]'s doc). This module owns only what happens
//! *around* those: whether a spacing is even worth searching
//! ([`length_estimate_mm`]), which spacings to try and in what order
//! ([`escalation_ladder`]), the policy for walking that ladder to a final
//! verdict ([`walk_ladder`]), and how to pick a winner among same-spacing
//! candidates ([`rank`]).
//!
//! Intended composition for the orchestration layer (Task 11): for each
//! rung `walk_ladder` calls its closure with, decompose fields at that
//! spacing, search every field, certify the resulting candidates, and
//! either (a) none certify or the pre-prune estimate already exceeded the
//! length limit -> return `SpacingOutcome::LengthOnly` or
//! `SpacingOutcome::GeometryFailure` depending on why, or (b) at least one
//! certifies -> call [`rank`] on the certified set and return
//! `SpacingOutcome::Solved` with the winner. `walk_ladder` takes it from
//! there.

use crate::circuit::search::SearchFailure;
use crate::circuit::types::{ALLOWED_SPACINGS_MM, LoopErrorCode};
use std::cmp::Ordering;

/// Fixed zone- and corridor-length allowance folded into the pre-prune
/// length estimate (design spec §6.9: `L̂ = Feldfläche/VA + Zonen- und
/// Korridorzuschlag`) -- a coarse stand-in for the connection zone's own
/// pipe run plus inter-field corridor travel. `length_estimate_mm` is a
/// cheap upper-bound *estimate* used only to decide whether a spacing is
/// worth searching at all (§6.9), not a certified length, so this does not
/// need to track real zone/corridor geometry.
const ZONE_AND_CORRIDOR_ALLOWANCE_MM: f64 = 1000.0;

/// Design spec §10 (and its predecessor's §15): two candidates' certified
/// coverage upper bounds within this window of each other are a tie on
/// coverage, resolved by the next ranking criterion instead ("innerhalb
/// 0,1 mm greifen die Tie-Breaker"). Deliberately a locally-scoped constant
/// rather than `crate::constants::COVERAGE_ERROR_MM` (same 0.1 mm value,
/// but unused anywhere in this crate): `circuit`'s modules consistently
/// define their own spec-derived constants instead of reaching into the
/// old solver's shared module -- e.g. `spiral::MAX_LOOP_LENGTH_MM`
/// duplicates `constants::MAX_LENGTH_MM` the same way for the 100 m length
/// budget, and `types::MIN_WALL_CLEARANCE_MM` duplicates
/// `constants::MIN_WALL_CLEARANCE_MM`.
const COVERAGE_TIE_WINDOW_MM: f64 = 0.1;

/// Cheap upper-bound length estimate for a candidate at `spacing_mm`
/// (design spec §6.9): the naive uniform-pitch pipe length for
/// `field_area_mm2` (`area / spacing`) plus a fixed zone/corridor
/// allowance. Used before a search even starts, to decide (together with
/// the 100 000 mm limit, design spec §8.2) whether this spacing is worth
/// attempting.
pub fn length_estimate_mm(field_area_mm2: f64, spacing_mm: f64) -> f64 {
    field_area_mm2 / spacing_mm + ZONE_AND_CORRIDOR_ALLOWANCE_MM
}

/// The spacings (mm) to try, `requested` first, ascending through
/// `ALLOWED_SPACINGS_MM` (design spec §8.1/§8.3's escalation order), e.g.
/// `150 -> [150, 225, 300]`. Never descends: a spacing tighter than
/// requested is never tried, only requested-or-looser ones, in order.
///
/// Precondition: `requested` must be one of `ALLOWED_SPACINGS_MM`
/// (`validate_input`, in `types.rs`, enforces this before any caller in
/// this crate reaches escalation). Panics otherwise -- a caller reaching
/// this function with an unvalidated spacing is a programming error, not a
/// recoverable input problem this function should absorb.
pub fn escalation_ladder(requested: u32) -> Vec<u32> {
    let start = ALLOWED_SPACINGS_MM
        .iter()
        .position(|&spacing_mm| spacing_mm == requested)
        .expect(
            "requested must be one of ALLOWED_SPACINGS_MM; validate_input enforces this upstream",
        );
    ALLOWED_SPACINGS_MM[start..].to_vec()
}

/// Ranking metrics for one certified candidate at a fixed spacing (design
/// spec §10). Plain data -- Task 10/11 compute these from a certified
/// candidate path and its coverage/spacing-penalty certificates; this
/// module only compares them ([`rank`]).
#[derive(Clone, Debug, PartialEq)]
pub struct Candidate {
    pub coverage_upper_mm: f64,
    pub penalty_sum_mm: f64,
    pub spacing_span_mm: f64,
    pub total_length_mm: f64,
    pub key: String,
}

/// What trying one escalation-ladder rung produced (design spec §8.3/§8.4).
///
/// `LengthOnly` means every way the search failed at this spacing was a
/// length problem -- the §6.9 pre-prune estimate rejecting the spacing
/// outright, or every dead end during the search being an
/// `Invariant::LengthBudget` rejection -- so a looser spacing might still
/// help. `GeometryFailure` means at least one dead end was a genuine
/// geometric invariant (turn budget, alternation, a cut corridor, ...);
/// looser spacing cannot fix that, so it must end the ladder rather than
/// continue it (see [`walk_ladder`]).
///
/// Classifying a raw `SearchFailure` (or a pre-prune skip) into one of
/// these two is Task 11's job -- it has the real search state; this module
/// only consumes the already-classified result.
#[derive(Clone, Debug, PartialEq)]
pub enum SpacingOutcome {
    Solved(Candidate),
    LengthOnly,
    GeometryFailure(SearchFailure),
}

/// The final result of walking an escalation ladder (design spec §8):
/// either the candidate that solved it, or the `LoopErrorCode` to report
/// once none did.
#[derive(Clone, Debug, PartialEq)]
pub enum LadderVerdict {
    Solved(Candidate),
    NoSolution(LoopErrorCode),
}

/// Classifies a sequence of non-`Solved` rung outcomes into the failure
/// code design spec §8.3/§8.4 mandates: a `GeometryFailure` *anywhere* in
/// `outcomes` forbids escalating at all, forcing `NoSolutionGeometry` --
/// even when it is the last (highest-spacing) outcome, where an
/// exhausted-ladder reading would otherwise conclude `NoSolutionLength`
/// (§8.5). Only when every outcome is `LengthOnly` does exhausting the
/// ladder mean `NoSolutionLength`. Private: only [`walk_ladder`] calls
/// this, and only with the outcomes it actually collected (never one
/// containing a `Solved` entry -- `walk_ladder` returns as soon as one
/// appears, before this is ever called).
fn classify(outcomes: &[SpacingOutcome]) -> LoopErrorCode {
    let any_geometry_failure = outcomes
        .iter()
        .any(|outcome| matches!(outcome, SpacingOutcome::GeometryFailure(_)));
    if any_geometry_failure {
        LoopErrorCode::NoSolutionGeometry
    } else {
        LoopErrorCode::NoSolutionLength
    }
}

/// Walks `escalation_ladder(requested)` in ascending order, calling
/// `try_spacing` once per rung, and applies design spec §8.3/§8.4's
/// escalation policy as it goes -- the single tested home for that policy,
/// so callers never reimplement "stop at Solved / GeometryFailure, only
/// continue past LengthOnly" themselves:
///
/// - the first `Solved` outcome wins immediately; no looser spacing is
///   ever tried after one is found (§8.2 -- `try_spacing` is not called
///   again once this happens);
/// - a `GeometryFailure` at any rung ends the ladder right there, with
///   `NoSolutionGeometry` -- including at the very first (requested)
///   spacing, which forbids escalating at all (§8.4);
/// - a `LengthOnly` outcome is the only case that continues to the next
///   rung;
/// - exhausting every rung with nothing but `LengthOnly` outcomes ends
///   with `NoSolutionLength` (§8.5).
pub fn walk_ladder(
    requested: u32,
    mut try_spacing: impl FnMut(u32) -> SpacingOutcome,
) -> LadderVerdict {
    let mut outcomes = Vec::new();
    for spacing_mm in escalation_ladder(requested) {
        let outcome = try_spacing(spacing_mm);
        if let SpacingOutcome::Solved(candidate) = outcome {
            return LadderVerdict::Solved(candidate);
        }
        let is_geometry_failure = matches!(outcome, SpacingOutcome::GeometryFailure(_));
        outcomes.push(outcome);
        if is_geometry_failure {
            break;
        }
    }
    LadderVerdict::NoSolution(classify(&outcomes))
}

/// Orders two candidates by design spec §10's criteria, in order: coverage
/// upper bound (within [`COVERAGE_TIE_WINDOW_MM`], a tie), penalty sum,
/// spacing span, total length, lexicographic key. Only the coverage
/// criterion uses the tie window -- the remaining criteria compare
/// exactly, matching the predecessor spec's ranking convention (§15:
/// "innerhalb 0,1 mm greifen die Tie-Breaker", scoped to coverage alone).
///
/// Not a total order (the tie window is not transitive: a candidate at
/// 75.00 mm ties one at 75.08 mm, which ties one at 75.16 mm, but 75.00 and
/// 75.16 do not tie each other) -- do not `sort_by`/`sort_unstable_by` with
/// this; Rust's sort can panic on a comparator that isn't a strict weak
/// ordering. [`rank`] only ever uses it for pairwise min-reduction (a left
/// fold), which stays well-defined and deterministic for a fixed input
/// order regardless.
fn compare_candidates(left: &Candidate, right: &Candidate) -> Ordering {
    compare_with_tie_window(
        left.coverage_upper_mm,
        right.coverage_upper_mm,
        COVERAGE_TIE_WINDOW_MM,
    )
    .then_with(|| left.penalty_sum_mm.total_cmp(&right.penalty_sum_mm))
    .then_with(|| left.spacing_span_mm.total_cmp(&right.spacing_span_mm))
    .then_with(|| left.total_length_mm.total_cmp(&right.total_length_mm))
    .then_with(|| left.key.cmp(&right.key))
}

/// `Equal` when `left` and `right` are within `window_mm` of each other,
/// otherwise their real order. See `compare_candidates` for why this is
/// intentionally not a total order.
fn compare_with_tie_window(left: f64, right: f64, window_mm: f64) -> Ordering {
    if (left - right).abs() <= window_mm {
        Ordering::Equal
    } else {
        left.total_cmp(&right)
    }
}

/// Picks the winning candidate among `candidates` by design spec §10's
/// ranking criteria (see [`compare_candidates`]). Panics if `candidates` is
/// empty -- callers only ever rank the candidates a ladder rung actually
/// certified, which is never an empty set (a rung with zero certified
/// candidates is a `LengthOnly`/`GeometryFailure` outcome, not a call to
/// `rank`).
pub fn rank(candidates: Vec<Candidate>) -> Candidate {
    let mut candidates = candidates.into_iter();
    let first = candidates
        .next()
        .expect("rank requires at least one candidate");
    candidates.fold(first, |best, candidate| {
        if compare_candidates(&candidate, &best) == Ordering::Less {
            candidate
        } else {
            best
        }
    })
}
