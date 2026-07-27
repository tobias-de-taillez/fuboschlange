use super::ranking::{CandidateScore, compare_candidates};
use crate::constants::MIN_RADIUS_MM;
use crate::geometry::AllowedRegion;
use crate::input::NormalizedInput;
use crate::medial_axis::MedialGraph;
use crate::routing::{PortAssignment, RouteBudget, RoutingFixture, route_lead_pair};
use crate::spiral::generate_all_cores;
use crate::validation::{
    CandidatePath, CoverageBounds, HardValidationReport, SpacingExtrema, ValidationContext,
    coverage_bounds, spacing_extrema,
};
use crate::wavefront::{WavefrontFamilyKind, generate_wavefront_families};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TopologySignature {
    pub family: u8,
    pub front_count: usize,
    pub skeleton_branch_count: usize,
}

#[derive(Clone, Debug)]
pub struct CertifiedCandidate {
    pub candidate: CandidatePath,
    pub hard: HardValidationReport,
    pub coverage: CoverageBounds,
    pub spacing: SpacingExtrema,
    pub total_length_upper_bound_mm: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RejectionSummary {
    pub geometry_rejections: usize,
    pub validation_rejections: usize,
}

#[derive(Clone, Debug)]
pub enum SpacingEvaluation {
    Success(CertifiedCandidate),
    LengthOnly {
        shortest_upper_bound_mm: f64,
        topology: TopologySignature,
    },
    GeometryFailure {
        rejection_summary: RejectionSummary,
    },
}

pub fn evaluate_spacing(
    normalized: &NormalizedInput,
    allowed: &AllowedRegion,
    graph: &MedialGraph,
    spacing_mm: f64,
) -> SpacingEvaluation {
    let context = ValidationContext {
        polygon: normalized.polygon.clone(),
        allowed_region: allowed.clone(),
    };
    let mut certified = Vec::new();
    let mut shortest_over_limit = f64::INFINITY;
    let mut validations = 0_usize;
    let mut rejections = RejectionSummary::default();
    for family_kind in [WavefrontFamilyKind::Point, WavefrontFamilyKind::Skeleton] {
        for (guide_index, guide_factor) in [1.0, 0.975, 0.95].into_iter().enumerate() {
            let Ok(families) =
                generate_wavefront_families(graph, allowed, spacing_mm, guide_factor)
            else {
                rejections.geometry_rejections += 1;
                continue;
            };
            for family in families
                .into_iter()
                .filter(|family| family.kind == family_kind)
            {
                for core in generate_all_cores(&family, guide_index as u16, MIN_RADIUS_MM) {
                    for assignment in [PortAssignment::FirstStarts, PortAssignment::SecondStarts] {
                        validations += 1;
                        if validations > 20_000 {
                            return SpacingEvaluation::GeometryFailure {
                                rejection_summary: rejections,
                            };
                        }
                        let fixture = RoutingFixture::new(
                            normalized.connection.clone(),
                            context.clone(),
                            core.clone(),
                            spacing_mm,
                        );
                        let Ok(routed) =
                            route_lead_pair(&fixture, assignment, RouteBudget::default())
                        else {
                            rejections.validation_rejections += 1;
                            continue;
                        };
                        let length = routed.candidate.path.total_length();
                        if length > 100_000.0 {
                            shortest_over_limit = shortest_over_limit.min(length);
                            continue;
                        }
                        let Ok(coverage) = coverage_bounds(
                            &normalized.polygon,
                            &routed.candidate.path,
                            0.1,
                            500_000,
                        ) else {
                            rejections.validation_rejections += 1;
                            continue;
                        };
                        let Ok(spacing) = spacing_extrema(
                            &routed.candidate.path,
                            &routed.candidate.provenance.parent_pairs,
                            0.1,
                        ) else {
                            rejections.validation_rejections += 1;
                            continue;
                        };
                        let score = CandidateScore {
                            coverage_upper_bound_mm: coverage.upper_bound_mm,
                            spacing_spread_mm: spacing.max.distance_mm - spacing.min.distance_mm,
                            total_length_upper_bound_mm: length,
                            key: routed.candidate.key.clone(),
                        };
                        certified.push((
                            score,
                            CertifiedCandidate {
                                candidate: routed.candidate,
                                hard: routed.report,
                                coverage,
                                spacing,
                                total_length_upper_bound_mm: length,
                            },
                        ));
                    }
                }
            }
        }
    }
    certified.sort_by(|left, right| compare_candidates(&left.0, &right.0));
    if let Some((_, best)) = certified.into_iter().next() {
        SpacingEvaluation::Success(best)
    } else if shortest_over_limit.is_finite() {
        SpacingEvaluation::LengthOnly {
            shortest_upper_bound_mm: shortest_over_limit,
            topology: TopologySignature {
                family: 0,
                front_count: graph.nodes.len(),
                skeleton_branch_count: graph.edges.len(),
            },
        }
    } else {
        SpacingEvaluation::GeometryFailure {
            rejection_summary: rejections,
        }
    }
}
