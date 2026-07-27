use crate::geometry::erode_for_centerline;
use crate::input::{connection_warning, validate_and_normalize};
use crate::medial_axis::build_medial_graph;
use crate::model::{
    CoverageOutput, ErrorDetail, SingleLoopPlan, SolveResult, SolveSingleLoopInput, SolverError,
    SolverErrorCode, SpacingDeviations,
};
use crate::search::{SpacingEvaluation, evaluate_spacing, spacing_warnings};
use crate::validation::{ValidationContext, build_certificate, validate_hard_constraints};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const SOLVER_VERSION: &str = "0.1.0";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SolvePhase {
    Normalize,
    Generate,
    Validate,
    Coverage,
}
impl SolvePhase {
    pub const fn as_wire_str(self) -> &'static str {
        match self {
            Self::Normalize => "normalize",
            Self::Generate => "generate",
            Self::Validate => "validate",
            Self::Coverage => "coverage",
        }
    }
}

pub fn solve_single_loop(raw: SolveSingleLoopInput) -> SolveResult {
    solve_single_loop_with_progress(raw, |_| {})
}

pub fn solve_single_loop_with_progress(
    raw: SolveSingleLoopInput,
    mut progress: impl FnMut(SolvePhase),
) -> SolveResult {
    progress(SolvePhase::Normalize);
    let hash = request_hash(&raw);
    let normalized = match validate_and_normalize(raw.clone()) {
        Ok(value) => value,
        Err(error) => return SolveResult::Error { error },
    };
    let allowed = match erode_for_centerline(&normalized) {
        Ok(value) => value,
        Err(error) => return SolveResult::Error { error },
    };
    let graph = match build_medial_graph(&allowed, raw.requested_spacing_mm) {
        Ok(value) => value,
        Err(_) => {
            return SolveResult::Error {
                error: internal_error("MEDIAL_GRAPH_FAILED"),
            };
        }
    };
    progress(SolvePhase::Generate);
    let certified = match evaluate_spacing(&normalized, &allowed, &graph, raw.requested_spacing_mm)
    {
        SpacingEvaluation::Success(value) => value,
        SpacingEvaluation::LengthOnly {
            shortest_upper_bound_mm,
            ..
        } => {
            return SolveResult::Error {
                error: solver_error(
                    SolverErrorCode::NoSolutionLength,
                    "No loop fits below 100 m",
                    "shortestUpperBoundMm",
                    shortest_upper_bound_mm,
                ),
            };
        }
        SpacingEvaluation::GeometryFailure { rejection_summary } => {
            return SolveResult::Error {
                error: solver_error(
                    SolverErrorCode::NoSolutionGeometry,
                    "No certified loop geometry was found",
                    "validationRejections",
                    rejection_summary.validation_rejections as f64,
                ),
            };
        }
    };
    progress(SolvePhase::Validate);
    let context = ValidationContext {
        polygon: normalized.polygon.clone(),
        allowed_region: allowed,
    };
    if validate_hard_constraints(&certified.candidate, &context).is_err() {
        return SolveResult::Error {
            error: internal_error("FINAL_HARD_VALIDATION_FAILED"),
        };
    }
    progress(SolvePhase::Coverage);
    let mut warnings = Vec::new();
    if let Some(warning) = connection_warning(&normalized.connection) {
        warnings.push(warning);
    }
    warnings.extend(spacing_warnings(
        raw.requested_spacing_mm,
        certified.candidate.actual_spacing_mm,
    ));
    let certificate = build_certificate(&certified);
    let plan = SingleLoopPlan {
        solver_version: SOLVER_VERSION.to_string(),
        request_hash: hash,
        path: certified.candidate.path.primitives().to_vec(),
        normalized_connection: (&certified.candidate.connection).into(),
        requested_spacing_mm: raw.requested_spacing_mm,
        actual_spacing_mm: certified.candidate.actual_spacing_mm,
        total_length_mm: certified.total_length_upper_bound_mm,
        coverage: CoverageOutput {
            max_distance_mm: certified.coverage.upper_bound_mm,
            lower_bound_mm: certified.coverage.lower_bound_mm,
            upper_bound_mm: certified.coverage.upper_bound_mm,
            error_bound_mm: certified.coverage.error_bound_mm,
            worst_point: certified.coverage.worst_point,
        },
        spacing_deviations: SpacingDeviations {
            min: certified.spacing.min.clone(),
            max: certified.spacing.max.clone(),
        },
        warnings,
        constraint_certificate: certificate,
    };
    let Ok(value) = serde_json::to_value(&plan) else {
        return SolveResult::Error {
            error: internal_error("PLAN_SERIALIZATION_FAILED"),
        };
    };
    let Ok(roundtrip) = serde_json::from_value::<SingleLoopPlan>(value) else {
        return SolveResult::Error {
            error: internal_error("PLAN_DESERIALIZATION_FAILED"),
        };
    };
    if roundtrip != plan {
        return SolveResult::Error {
            error: internal_error("PLAN_ROUNDTRIP_MISMATCH"),
        };
    }
    SolveResult::Success { plan: roundtrip }
}

pub fn request_hash(raw: &SolveSingleLoopInput) -> String {
    let mut hash = Sha256::new();
    hash.update((raw.polygon.len() as u64).to_be_bytes());
    for point in &raw.polygon {
        hash.update(point.x.to_bits().to_be_bytes());
        hash.update(point.y.to_bits().to_be_bytes());
    }
    hash.update(raw.connection.edge_index.to_be_bytes());
    hash.update(raw.connection.center_offset_mm.to_bits().to_be_bytes());
    hash.update(raw.requested_spacing_mm.to_bits().to_be_bytes());
    hash.update(raw.wall_clearance_mm.to_bits().to_be_bytes());
    hash.finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn solver_error(code: SolverErrorCode, message: &str, key: &str, value: f64) -> SolverError {
    let mut details = BTreeMap::new();
    if let Some(value) = ErrorDetail::number(value) {
        details.insert(key.to_string(), value);
    }
    SolverError {
        code,
        message: message.to_string(),
        details,
    }
}
fn internal_error(reason: &str) -> SolverError {
    SolverError {
        code: SolverErrorCode::InternalValidationFailure,
        message: "Internal validation failed".to_string(),
        details: BTreeMap::from([("reason".to_string(), ErrorDetail::string(reason))]),
    }
}
