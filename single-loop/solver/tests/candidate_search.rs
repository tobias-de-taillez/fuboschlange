use single_loop_solver::search::{CandidateScore, compare_candidates};
use single_loop_solver::validation::CandidateKey;

fn score(coverage: f64, spread: f64, length: f64, key: u32) -> CandidateScore {
    CandidateScore {
        coverage_upper_bound_mm: coverage,
        spacing_spread_mm: spread,
        total_length_upper_bound_mm: length,
        key: CandidateKey(vec![key]),
    }
}

#[test]
fn ranking_uses_coverage_then_spacing_spread_then_length_then_key() {
    let mut values = [
        score(100.0, 4.0, 900.0, 2),
        score(99.0, 10.0, 1000.0, 9),
        score(100.0, 3.0, 1200.0, 8),
        score(100.0, 3.0, 1100.0, 7),
    ];
    values.sort_by(compare_candidates);
    assert_eq!(
        values
            .iter()
            .map(|value| value.key.0[0])
            .collect::<Vec<_>>(),
        vec![9, 7, 8, 2]
    );
}

#[test]
fn ranking_uses_total_float_order_and_is_deterministic() {
    let mut values = [score(1.0, 1.0, 1.0, 2), score(1.0, 1.0, 1.0, 1)];
    values.sort_by(compare_candidates);
    assert_eq!(values[0].key.0, vec![1]);
}
