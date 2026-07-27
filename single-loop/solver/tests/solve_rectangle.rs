use single_loop_solver::model::{ConnectionInput, Point, SolveResult, SolveSingleLoopInput};
use single_loop_solver::solver::solve_single_loop;

fn request() -> SolveSingleLoopInput {
    SolveSingleLoopInput {
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
    }
}

#[test]
fn solves_rectangle_as_one_certified_bifilar_loop() {
    let result = solve_single_loop(request());
    let SolveResult::Success { plan } = result else {
        panic!("rectangle must solve: {result:?}");
    };
    assert_eq!(plan.actual_spacing_mm, 150.0);
    assert!(plan.total_length_mm <= 100_000.0);
    assert!(
        plan.constraint_certificate
            .min_bend_radius_mm
            .lower_bound_mm
            >= 80.0
    );
    assert!(
        plan.constraint_certificate
            .min_nonlocal_spacing_mm
            .lower_bound_mm
            >= 50.0
    );
    assert!(plan.coverage.error_bound_mm <= 0.1);
}
