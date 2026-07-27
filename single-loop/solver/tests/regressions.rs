use single_loop_solver::model::{ConnectionInput, Point, SolveResult, SolveSingleLoopInput};
use single_loop_solver::solver::solve_single_loop;
#[test]
fn accepted_plan_never_reintroduces_documented_failure_classes() {
    let input = SolveSingleLoopInput {
        polygon: vec![
            Point::new(0.0, 0.0),
            Point::new(6000.0, 0.0),
            Point::new(6000.0, 4000.0),
            Point::new(0.0, 4000.0),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 3000.0,
        },
        requested_spacing_mm: 150.0,
        wall_clearance_mm: 75.0,
    };
    let SolveResult::Success { plan } = solve_single_loop(input) else {
        panic!()
    };
    assert_eq!(
        plan.constraint_certificate.self_intersection_count,
        Default::default()
    );
    assert!(plan.constraint_certificate.inside_polygon == Default::default());
    assert!(
        plan.constraint_certificate
            .min_bend_radius_mm
            .lower_bound_mm
            >= 80.0
    );
}
