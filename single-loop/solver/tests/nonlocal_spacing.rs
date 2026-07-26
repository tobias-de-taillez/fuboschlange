use approx::assert_abs_diff_eq;
use single_loop_solver::constants::LOCAL_ARC_LENGTH_MM;
use single_loop_solver::geometry::{ParameterRange, erode_for_centerline};
use single_loop_solver::input::{NormalizedConnection, validate_and_normalize};
use single_loop_solver::model::{ConnectionInput, PathPrimitive, Point, SolveSingleLoopInput};
use single_loop_solver::validation::{
    CandidateKey, CandidatePath, ParentPair, PathProvenance, PrimitiveRole, ValidationContext,
    minimum_nonlocal_distance, validate_hard_constraints,
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

fn request() -> SolveSingleLoopInput {
    SolveSingleLoopInput {
        polygon: polygon(&[(0.0, 0.0), (600.0, 0.0), (600.0, 400.0), (0.0, 400.0)]),
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 300.0,
        },
        requested_spacing_mm: 120.0,
        wall_clearance_mm: 20.0,
    }
}

fn context_and_connection() -> (ValidationContext, NormalizedConnection) {
    let normalized = validate_and_normalize(request()).unwrap();
    let allowed_region = erode_for_centerline(&normalized).unwrap();
    (
        ValidationContext {
            polygon: normalized.polygon.clone(),
            allowed_region,
        },
        normalized.connection,
    )
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

fn valid_port_pair_candidate() -> CandidatePath {
    let (_context, connection) = context_and_connection();
    let x1 = connection.start_port.x;
    let x2 = connection.end_port.x;
    let r = 80.0;
    let xc = x1 - r - 25.0;
    candidate_from_parts(
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
        ],
        vec![
            PrimitiveRole::StartLead,
            PrimitiveRole::Inbound { winding: 0 },
            PrimitiveRole::Inbound { winding: 1 },
            PrimitiveRole::InnerTurn,
            PrimitiveRole::Outbound { winding: 1 },
            PrimitiveRole::Outbound { winding: 0 },
            PrimitiveRole::EndLead,
        ],
        vec![ParentPair {
            first_primitive: 1,
            first_range: ParameterRange::FULL,
            second_primitive: 4,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        }],
        connection,
        vec![1, 2, 3],
    )
}

fn parallel_return_path(split: bool) -> CandidatePath {
    let (_context, connection) = context_and_connection();
    let mut primitives = vec![
        line((40.0, 40.0), (340.0, 40.0)),
        arc((340.0, 40.0), (340.0, 200.0), (340.0, 120.0), 80.0, PI),
    ];
    let mut roles = vec![PrimitiveRole::StartLead, PrimitiveRole::InnerTurn];

    if split {
        primitives.push(line((340.0, 200.0), (190.0, 200.0)));
        primitives.push(line((190.0, 200.0), (40.0, 200.0)));
        roles.push(PrimitiveRole::Outbound { winding: 1 });
        roles.push(PrimitiveRole::EndLead);
    } else {
        primitives.push(line((340.0, 200.0), (40.0, 200.0)));
        roles.push(PrimitiveRole::EndLead);
    }

    candidate_from_parts(primitives, roles, vec![], connection, vec![9, split as u32])
}

#[test]
fn nonlocal_result_is_invariant_under_line_subdivision() {
    let whole = parallel_return_path(false);
    let split = parallel_return_path(true);
    let a = minimum_nonlocal_distance(&whole, LOCAL_ARC_LENGTH_MM).unwrap();
    let b = minimum_nonlocal_distance(&split, LOCAL_ARC_LENGTH_MM).unwrap();
    assert_abs_diff_eq!(a.distance_mm, 160.0, epsilon = 1e-9);
    assert_abs_diff_eq!(b.distance_mm, 160.0, epsilon = 1e-9);
    assert_abs_diff_eq!(a.distance_mm, b.distance_mm, epsilon = 1e-9);
}

#[test]
fn mandated_ports_certify_exactly_fifty_mm() {
    let (context, _connection) = context_and_connection();
    let report = validate_hard_constraints(&valid_port_pair_candidate(), &context).unwrap();
    assert_eq!(report.min_nonlocal_spacing.lower_bound_mm, 50.0);
}
