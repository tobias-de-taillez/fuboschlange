use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{ParameterRange, erode_for_centerline};
use single_loop_solver::input::{NormalizedConnection, validate_and_normalize};
use single_loop_solver::model::{ConnectionInput, PathPrimitive, Point, SolveSingleLoopInput};
use single_loop_solver::validation::{
    CandidateKey, CandidatePath, HardValidationReport, ParentPair, PathProvenance, PrimitiveRole,
    ValidationContext, ValidationFailure, validate_hard_constraints,
};
use std::f64::consts::{FRAC_PI_2, PI};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn polygon(points: &[(f64, f64)]) -> Vec<Point> {
    points.iter().map(|&(x, y)| point(x, y)).collect()
}

fn line(start: (f64, f64), end: (f64, f64)) -> PathPrimitive {
    PathPrimitive::Line {
        start: point(start.0, start.1),
        end: point(end.0, end.1),
    }
}

fn arc(
    start: (f64, f64),
    end: (f64, f64),
    center: (f64, f64),
    radius_mm: f64,
    sweep_rad: f64,
) -> PathPrimitive {
    PathPrimitive::Arc {
        start: point(start.0, start.1),
        end: point(end.0, end.1),
        center: point(center.0, center.1),
        radius_mm,
        sweep_rad,
    }
}

fn request(wall_clearance_mm: f64) -> SolveSingleLoopInput {
    SolveSingleLoopInput {
        polygon: polygon(&[(0.0, 0.0), (600.0, 0.0), (600.0, 400.0), (0.0, 400.0)]),
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 300.0,
        },
        requested_spacing_mm: 120.0,
        wall_clearance_mm,
    }
}

fn context_and_connection(wall_clearance_mm: f64) -> (ValidationContext, NormalizedConnection) {
    let normalized = validate_and_normalize(request(wall_clearance_mm)).unwrap();
    let allowed_region = erode_for_centerline(&normalized).unwrap();
    (
        ValidationContext {
            polygon: normalized.polygon.clone(),
            allowed_region,
        },
        normalized.connection,
    )
}

fn default_context_and_connection() -> (ValidationContext, NormalizedConnection) {
    context_and_connection(20.0)
}

fn assert_failure_code(result: Result<HardValidationReport, ValidationFailure>, expected: &str) {
    let error = result.expect_err("expected validation to fail");
    assert_eq!(error.code.as_str(), expected, "unexpected error: {error:?}");
}

fn default_parent_pairs() -> Vec<ParentPair> {
    vec![
        ParentPair {
            first_primitive: 1,
            first_range: ParameterRange::FULL,
            second_primitive: 5,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        },
        ParentPair {
            first_primitive: 2,
            first_range: ParameterRange::FULL,
            second_primitive: 4,
            second_range: ParameterRange::FULL,
            first_winding: 2,
            second_winding: 3,
        },
    ]
}

fn mirrored_racetrack_primitives(
    connection: &NormalizedConnection,
    radius_mm: f64,
) -> Vec<PathPrimitive> {
    let x1 = connection.start_port.x;
    let x2 = connection.end_port.x;
    let r = radius_mm;
    let xc = x1 - r - 25.0;
    vec![
        line((x1, 0.0), (x1, r)),
        arc((x1, r), (x1 - r, 2.0 * r), (x1 - r, r), r, FRAC_PI_2),
        line((x1 - r, 2.0 * r), (xc, 2.0 * r)),
        arc((xc, 2.0 * r), (xc, 4.0 * r), (xc, 3.0 * r), r, -PI),
        line((xc, 4.0 * r), (x2 - r, 4.0 * r)),
        arc(
            (x2 - r, 4.0 * r),
            (x2, 3.0 * r),
            (x2 - r, 3.0 * r),
            r,
            -FRAC_PI_2,
        ),
        line((x2, 3.0 * r), (x2, 0.0)),
    ]
}

fn candidate_from_parts(
    primitives: Vec<PathPrimitive>,
    roles: Vec<PrimitiveRole>,
    parent_pairs: Vec<ParentPair>,
    connection: NormalizedConnection,
    key: Vec<u32>,
) -> CandidatePath {
    CandidatePath::from_primitives(
        primitives,
        PathProvenance {
            roles,
            parent_pairs,
            start_port_edge_offset_mm: connection.start_port_edge_offset_mm,
            end_port_edge_offset_mm: connection.end_port_edge_offset_mm,
        },
        connection,
        120.0,
        CandidateKey(key),
    )
    .unwrap()
}

fn racetrack_candidate(radius_mm: f64) -> CandidatePath {
    let (_context, connection) = default_context_and_connection();
    candidate_from_parts(
        mirrored_racetrack_primitives(&connection, radius_mm),
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 2 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 3 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        default_parent_pairs(),
        connection,
        vec![1, 2, 3],
    )
}

fn outside_polygon_candidate() -> CandidatePath {
    let (_context, connection) = default_context_and_connection();
    let x1 = connection.start_port.x;
    let x2 = connection.end_port.x;
    let r = 80.0;
    let outside_left = -20.0;
    candidate_from_parts(
        vec![
            line((x1, 0.0), (x1, r)),
            arc((x1, r), (x1 - r, 2.0 * r), (x1 - r, r), r, FRAC_PI_2),
            line((x1 - r, 2.0 * r), (outside_left, 2.0 * r)),
            arc(
                (outside_left, 2.0 * r),
                (outside_left, 4.0 * r),
                (outside_left, 3.0 * r),
                r,
                -PI,
            ),
            line((outside_left, 4.0 * r), (x2 - r, 4.0 * r)),
            arc(
                (x2 - r, 4.0 * r),
                (x2, 3.0 * r),
                (x2 - r, 3.0 * r),
                r,
                -FRAC_PI_2,
            ),
            line((x2, 3.0 * r), (x2, 0.0)),
        ],
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 2 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 3 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        default_parent_pairs(),
        connection,
        vec![9, 9, 9],
    )
}

fn malformed_topology_candidate() -> CandidatePath {
    let (_context, connection) = default_context_and_connection();
    candidate_from_parts(
        mirrored_racetrack_primitives(&connection, 80.0),
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Inbound { winding: 1 },
            PrimitiveRole::Outbound { winding: 0 },
            PrimitiveRole::EndLead,
        ],
        vec![ParentPair {
            first_primitive: 1,
            first_range: ParameterRange::FULL,
            second_primitive: 2,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 0,
        }],
        connection,
        vec![4, 5, 6],
    )
}

fn self_contact_candidate(custom_end_x: f64, key: Vec<u32>) -> CandidatePath {
    let (_context, mut connection) = default_context_and_connection();
    let x1 = connection.start_port.x;
    connection.end_port = point(custom_end_x, 0.0);
    connection.second_port = connection.end_port;
    connection.end_port_edge_offset_mm = custom_end_x;
    connection.second_port_edge_offset_mm = custom_end_x;
    let r = 80.0;
    let xc = x1 - r - 25.0;
    candidate_from_parts(
        vec![
            line((x1, 0.0), (x1, r)),
            arc((x1, r), (x1 - r, 2.0 * r), (x1 - r, r), r, FRAC_PI_2),
            line((x1 - r, 2.0 * r), (xc, 2.0 * r)),
            arc((xc, 2.0 * r), (xc, 4.0 * r), (xc, 3.0 * r), r, -PI),
            line((xc, 4.0 * r), (custom_end_x - r, 4.0 * r)),
            arc(
                (custom_end_x - r, 4.0 * r),
                (custom_end_x, 3.0 * r),
                (custom_end_x - r, 3.0 * r),
                r,
                -FRAC_PI_2,
            ),
            line((custom_end_x, 3.0 * r), (custom_end_x, 0.0)),
        ],
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 2 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 3 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        default_parent_pairs(),
        connection,
        key,
    )
}

fn nonadjacent_tangency_candidate() -> CandidatePath {
    self_contact_candidate(275.0, vec![7, 7, 7])
}

fn crossing_candidate() -> CandidatePath {
    self_contact_candidate(260.0, vec![8, 8, 8])
}

fn g1_break_candidate() -> Result<CandidatePath, ValidationFailure> {
    let (_context, connection) = default_context_and_connection();
    CandidatePath::from_primitives(
        vec![
            line(
                (connection.start_port.x, 0.0),
                (connection.start_port.x, 80.0),
            ),
            line(
                (connection.start_port.x, 80.0),
                (connection.start_port.x + 80.0, 80.0),
            ),
        ],
        PathProvenance {
            roles: vec![
                PrimitiveRole::StartLead,
                PrimitiveRole::Inbound { winding: 0 },
            ],
            parent_pairs: vec![],
            start_port_edge_offset_mm: connection.start_port_edge_offset_mm,
            end_port_edge_offset_mm: connection.end_port_edge_offset_mm,
        },
        connection,
        120.0,
        CandidateKey(vec![0]),
    )
}

fn wall_zone_reentry_candidate() -> CandidatePath {
    let (_context, connection) = context_and_connection(100.0);
    candidate_from_parts(
        mirrored_racetrack_primitives(&connection, 80.0),
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 2 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 3 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        default_parent_pairs(),
        connection,
        vec![3, 1, 4],
    )
}

fn multiple_start_leads_candidate() -> CandidatePath {
    let (_context, connection) = default_context_and_connection();
    candidate_from_parts(
        mirrored_racetrack_primitives(&connection, 80.0),
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        vec![ParentPair {
            first_primitive: 2,
            first_range: ParameterRange::FULL,
            second_primitive: 4,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        }],
        connection,
        vec![2, 3, 5, 7],
    )
}

fn initial_nonlead_wall_candidate(split_y: f64) -> CandidatePath {
    let (_context, connection) = default_context_and_connection();
    let mut primitives = mirrored_racetrack_primitives(&connection, 80.0);
    primitives.splice(
        0..1,
        [
            line(
                (connection.start_port.x, 0.0),
                (connection.start_port.x, split_y),
            ),
            line(
                (connection.start_port.x, split_y),
                (connection.start_port.x, 80.0),
            ),
        ],
    );
    candidate_from_parts(
        primitives,
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 2 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 3 },
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::EndLead,
        ],
        vec![
            ParentPair {
                first_primitive: 2,
                first_range: ParameterRange::FULL,
                second_primitive: 6,
                second_range: ParameterRange::FULL,
                first_winding: 0,
                second_winding: 1,
            },
            ParentPair {
                first_primitive: 3,
                first_range: ParameterRange::FULL,
                second_primitive: 5,
                second_range: ParameterRange::FULL,
                first_winding: 2,
                second_winding: 3,
            },
        ],
        connection,
        vec![1, 6, 1, 8],
    )
}

fn nonlead_initial_wall_prefix_candidate() -> CandidatePath {
    initial_nonlead_wall_candidate(10.0)
}

fn certified_wall_threshold_candidate() -> CandidatePath {
    initial_nonlead_wall_candidate(20.0)
}

#[test]
fn tolerant_arc_merge_returns_validation_error_instead_of_panicking() {
    let (_context, connection) = default_context_and_connection();
    let radius_delta = 0.5e-6;
    let outcome = std::panic::catch_unwind(|| {
        CandidatePath::from_primitives(
            vec![
                arc((80.0, 0.0), (0.0, 80.0), (0.0, 0.0), 80.0, FRAC_PI_2),
                arc(
                    (0.0, 80.0),
                    (-80.0 - radius_delta, -radius_delta),
                    (0.0, -radius_delta),
                    80.0 + radius_delta,
                    FRAC_PI_2,
                ),
            ],
            PathProvenance {
                roles: vec![
                    PrimitiveRole::Inbound { winding: 0 },
                    PrimitiveRole::Inbound { winding: 0 },
                ],
                parent_pairs: vec![ParentPair {
                    first_primitive: 0,
                    first_range: ParameterRange::FULL,
                    second_primitive: 1,
                    second_range: ParameterRange::FULL,
                    first_winding: 0,
                    second_winding: 0,
                }],
                start_port_edge_offset_mm: connection.start_port_edge_offset_mm,
                end_port_edge_offset_mm: connection.end_port_edge_offset_mm,
            },
            connection,
            120.0,
            CandidateKey(vec![1, 1, 2, 3, 5]),
        )
    });

    let result = outcome.expect("candidate validation must not unwind");
    assert_eq!(result.unwrap_err().code.as_str(), "TOPOLOGY_INVALID");
}

#[test]
fn radius_below_80_mm_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&racetrack_candidate(79.999), &context),
        "BEND_RADIUS_TOO_SMALL",
    );
}

#[test]
fn radius_of_80_mm_is_accepted() {
    let (context, _connection) = default_context_and_connection();
    let report = validate_hard_constraints(&racetrack_candidate(80.0), &context).unwrap();
    assert_abs_diff_eq!(report.min_bend_radius.lower_bound_mm, 80.0, epsilon = 1e-9);
}

#[test]
fn path_segment_outside_polygon_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&outside_polygon_candidate(), &context),
        "PATH_OUTSIDE_POLYGON",
    );
}

#[test]
fn nonadjacent_tangency_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&nonadjacent_tangency_candidate(), &context),
        "SELF_INTERSECTION",
    );
}

#[test]
fn crossing_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&crossing_candidate(), &context),
        "SELF_INTERSECTION",
    );
}

#[test]
fn g1_break_is_rejected() {
    let error = g1_break_candidate().expect_err("expected candidate construction to fail");
    assert_eq!(error.code.as_str(), "G1_DISCONTINUITY");
}

#[test]
fn valid_wall_zone_prefix_is_accepted() {
    let (context, _connection) = default_context_and_connection();
    assert!(validate_hard_constraints(&racetrack_candidate(80.0), &context).is_ok());
}

#[test]
fn accepted_wall_clearance_must_meet_reported_lower_bound() {
    let (context, _connection) = default_context_and_connection();

    assert_failure_code(
        validate_hard_constraints(&certified_wall_threshold_candidate(), &context),
        "WALL_CLEARANCE_TOO_SMALL",
    );
}

#[test]
fn nonlead_geometry_in_initial_wall_prefix_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&nonlead_initial_wall_prefix_candidate(), &context),
        "CONNECTION_ZONE_REENTRY",
    );
}

#[test]
fn wall_zone_leave_and_reenter_is_rejected() {
    let (context, _connection) = context_and_connection(100.0);
    assert_failure_code(
        validate_hard_constraints(&wall_zone_reentry_candidate(), &context),
        "CONNECTION_ZONE_REENTRY",
    );
}

#[test]
fn empty_parent_phase_data_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    let mut candidate = racetrack_candidate(80.0);
    candidate.provenance.parent_pairs.clear();
    assert_failure_code(
        validate_hard_constraints(&candidate, &context),
        "INVALID_TOPOLOGY_PARENT_PAIR",
    );
}

#[test]
fn duplicate_parent_phase_data_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    let mut candidate = racetrack_candidate(80.0);
    candidate
        .provenance
        .parent_pairs
        .push(candidate.provenance.parent_pairs[0].clone());
    assert_failure_code(
        validate_hard_constraints(&candidate, &context),
        "INVALID_TOPOLOGY_PARENT_PAIR",
    );
}

#[test]
fn parent_metadata_must_match_indexed_role_windings() {
    let (context, _connection) = default_context_and_connection();
    let mut candidate = racetrack_candidate(80.0);
    candidate.provenance.parent_pairs[0].first_winding = 8;
    candidate.provenance.parent_pairs[0].second_winding = 9;
    assert_failure_code(
        validate_hard_constraints(&candidate, &context),
        "INVALID_TOPOLOGY_PARENT_PAIR",
    );
}

#[test]
fn parent_phase_pair_must_alternate_inbound_and_outbound() {
    let (context, _connection) = default_context_and_connection();
    let mut candidate = racetrack_candidate(80.0);
    candidate.provenance.parent_pairs[0].second_primitive = 2;
    candidate.provenance.parent_pairs[0].second_winding = 2;
    assert_failure_code(
        validate_hard_constraints(&candidate, &context),
        "INVALID_PRIMITIVE_ROLE_PHASE",
    );
}

#[test]
fn multiple_start_lead_roles_are_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&multiple_start_leads_candidate(), &context),
        "INVALID_PRIMITIVE_ROLE_ORDER",
    );
}

#[test]
fn malformed_topology_is_rejected() {
    let (context, _connection) = default_context_and_connection();
    assert_failure_code(
        validate_hard_constraints(&malformed_topology_candidate(), &context),
        "INVALID_TOPOLOGY_TRANSITION",
    );
}
