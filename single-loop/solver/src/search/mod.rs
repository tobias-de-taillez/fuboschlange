mod candidate;
mod ranking;
mod spacing;

pub use candidate::{
    CertifiedCandidate, RejectionSummary, SpacingEvaluation, TopologySignature, evaluate_spacing,
};
pub use ranking::{CandidateScore, compare_candidates};
pub use spacing::{SpacingProbe, find_required_spacing, spacing_warnings};
