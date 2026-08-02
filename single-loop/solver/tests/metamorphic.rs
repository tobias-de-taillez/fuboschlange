use single_loop_solver::model::{ConnectionInput, Point, SolveResult, SolveSingleLoopInput};
use single_loop_solver::solver::solve_single_loop;

fn input(dx: f64, dy: f64) -> SolveSingleLoopInput {
    SolveSingleLoopInput {
        polygon: vec![
            Point::new(dx, dy),
            Point::new(dx + 6000.0, dy),
            Point::new(dx + 6000.0, dy + 4000.0),
            Point::new(dx, dy + 4000.0),
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
fn translation_preserves_certified_metrics() {
    let SolveResult::Success { plan: a } = solve_single_loop(input(0.0, 0.0)) else {
        panic!()
    };
    let SolveResult::Success { plan: b } = solve_single_loop(input(1000.0, -500.0)) else {
        panic!()
    };
    assert!((a.total_length_mm - b.total_length_mm).abs() <= 0.001);
    assert!((a.coverage.upper_bound_mm - b.coverage.upper_bound_mm).abs() <= 0.1);
}
