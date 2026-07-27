use super::ranking::{CandidateScore, compare_candidates};
use crate::constants::MIN_RADIUS_MM;
use crate::geometry::{AllowedRegion, ParameterRange};
use crate::input::NormalizedInput;
use crate::medial_axis::MedialGraph;
use crate::model::PathPrimitive;
use crate::routing::{PortAssignment, RouteBudget, RoutingFixture, route_lead_pair};
use crate::spiral::generate_all_cores;
use crate::validation::{
    CandidateKey, CandidatePath, CoverageBounds, HardValidationReport, ParentPair, PathProvenance,
    PrimitiveRole, SpacingExtrema, ValidationContext, coverage_bounds, spacing_extrema,
    validate_hard_constraints,
};
use crate::wavefront::{WavefrontFamilyKind, generate_wavefront_families};
use std::f64::consts::PI;

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
    if certified.is_empty()
        && let Some(fallback) = fallback_racetrack(normalized, &context, spacing_mm)
    {
        let score = CandidateScore {
            coverage_upper_bound_mm: fallback.coverage.upper_bound_mm,
            spacing_spread_mm: fallback.spacing.max.distance_mm - fallback.spacing.min.distance_mm,
            total_length_upper_bound_mm: fallback.total_length_upper_bound_mm,
            key: fallback.candidate.key.clone(),
        };
        certified.push((score, fallback));
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

fn fallback_racetrack(
    normalized: &NormalizedInput,
    context: &ValidationContext,
    spacing_mm: f64,
) -> Option<CertifiedCandidate> {
    let connection = &normalized.connection;
    let radius = (MIN_RADIUS_MM * 2.0).max(normalized.raw.wall_clearance_mm + 90.0);
    let angle = PI / 6.0;
    let lead_length = (radius * angle.cos() - 25.0) / angle.sin();
    let dx = lead_length * angle.sin();
    let y = lead_length * angle.cos();
    let local = |base: crate::model::Point, along: f64, inward: f64| {
        base + connection.edge_tangent * along + connection.inward_normal * inward
    };
    let start = connection.start_port;
    let end = connection.end_port;
    let s1 = local(start, -dx / 3.0, y / 3.0);
    let s2 = local(start, -2.0 * dx / 3.0, 2.0 * y / 3.0);
    let arc_start = local(start, -dx, y);
    let center = local(arc_start, radius * angle.cos(), radius * angle.sin());
    let arc_end = local(end, dx, y);
    let e1 = local(end, 2.0 * dx / 3.0, 2.0 * y / 3.0);
    let e2 = local(end, dx / 3.0, y / 3.0);
    let primitives = vec![
        PathPrimitive::Line { start, end: s1 },
        PathPrimitive::Line { start: s1, end: s2 },
        PathPrimitive::Line {
            start: s2,
            end: arc_start,
        },
        PathPrimitive::Arc {
            start: arc_start,
            end: arc_end,
            center,
            radius_mm: radius,
            sweep_rad: -(PI + 2.0 * angle),
        },
        PathPrimitive::Line {
            start: arc_end,
            end: e1,
        },
        PathPrimitive::Line { start: e1, end: e2 },
        PathPrimitive::Line { start: e2, end },
    ];
    let roles = vec![
        PrimitiveRole::StartLead,
        PrimitiveRole::StartLead,
        PrimitiveRole::Inbound { winding: 0 },
        PrimitiveRole::InnerTurn,
        PrimitiveRole::Outbound { winding: 1 },
        PrimitiveRole::EndLead,
        PrimitiveRole::EndLead,
    ];
    let parent_pairs = vec![ParentPair {
        first_primitive: 2,
        first_range: ParameterRange::FULL,
        second_primitive: 4,
        second_range: ParameterRange::FULL,
        first_winding: 0,
        second_winding: 1,
    }];
    let candidate = CandidatePath::from_primitives(
        primitives,
        PathProvenance {
            roles,
            parent_pairs,
            start_port_edge_offset_mm: connection.start_port_edge_offset_mm,
            end_port_edge_offset_mm: connection.end_port_edge_offset_mm,
        },
        connection.clone(),
        spacing_mm,
        CandidateKey(vec![u32::MAX]),
    )
    .ok()?;
    let hard = validate_hard_constraints(&candidate, context).ok()?;
    let coverage = coverage_bounds(&normalized.polygon, &candidate.path, 0.1, 500_000).ok()?;
    let spacing = spacing_extrema(&candidate.path, &candidate.provenance.parent_pairs, 0.1).ok()?;
    let total_length_upper_bound_mm = candidate.path.total_length();
    Some(CertifiedCandidate {
        candidate,
        hard,
        coverage,
        spacing,
        total_length_upper_bound_mm,
    })
}
