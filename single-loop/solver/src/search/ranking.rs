use crate::validation::CandidateKey;
use std::cmp::Ordering;

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateScore {
    pub coverage_upper_bound_mm: f64,
    pub spacing_spread_mm: f64,
    pub total_length_upper_bound_mm: f64,
    pub key: CandidateKey,
}

pub fn compare_candidates(left: &CandidateScore, right: &CandidateScore) -> Ordering {
    left.coverage_upper_bound_mm
        .total_cmp(&right.coverage_upper_bound_mm)
        .then_with(|| left.spacing_spread_mm.total_cmp(&right.spacing_spread_mm))
        .then_with(|| {
            left.total_length_upper_bound_mm
                .total_cmp(&right.total_length_upper_bound_mm)
        })
        .then_with(|| left.key.cmp(&right.key))
}
