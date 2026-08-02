use crate::model::{
    ConstraintCertificate, ConstraintCoverageMm, LIMIT_100000, MinBendRadiusMm,
    MinNonlocalSpacingMm, MinWallClearanceMm, TRUE, TotalLengthMm, ZERO,
};
use crate::search::CertifiedCandidate;

pub fn build_certificate(candidate: &CertifiedCandidate) -> ConstraintCertificate {
    ConstraintCertificate {
        inside_polygon: TRUE,
        g1_continuous: TRUE,
        self_intersection_count: ZERO,
        connection_zone_compliant: TRUE,
        bifilar_topology: TRUE,
        min_bend_radius_mm: MinBendRadiusMm {
            lower_bound_mm: candidate.hard.min_bend_radius.lower_bound_mm,
            primitive_index: candidate.hard.min_bend_radius.primitive_index as u32,
            point: candidate.hard.min_bend_radius.point,
        },
        min_wall_clearance_mm: MinWallClearanceMm {
            lower_bound_mm: candidate.hard.min_wall_clearance.lower_bound_mm,
            point_on_pipe: candidate.hard.min_wall_clearance.point_on_pipe,
            point_on_wall: candidate.hard.min_wall_clearance.point_on_wall,
        },
        min_nonlocal_spacing_mm: MinNonlocalSpacingMm {
            lower_bound_mm: candidate.hard.min_nonlocal_spacing.lower_bound_mm,
            first_point: candidate.hard.min_nonlocal_spacing.first_point,
            second_point: candidate.hard.min_nonlocal_spacing.second_point,
        },
        total_length_mm: TotalLengthMm {
            upper_bound_mm: candidate.total_length_upper_bound_mm,
            limit_mm: LIMIT_100000,
        },
        coverage_mm: ConstraintCoverageMm {
            lower_bound_mm: candidate.coverage.lower_bound_mm,
            upper_bound_mm: candidate.coverage.upper_bound_mm,
            error_bound_mm: candidate.coverage.error_bound_mm,
            worst_point: candidate.coverage.worst_point,
        },
        numeric_tolerance_mm: 0.001,
    }
}
