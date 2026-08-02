use single_loop_solver::model::{ConnectionInput, Point, SolveSingleLoopInput};
use single_loop_solver::solver::solve_single_loop;

#[test]
fn invalid_request_is_byte_deterministic() {
    let input = SolveSingleLoopInput {
        polygon: vec![
            Point::new(0.0, 0.0),
            Point::new(200.0, 0.0),
            Point::new(200.0, 200.0),
            Point::new(0.0, 200.0),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 100.0,
        },
        requested_spacing_mm: 150.0,
        wall_clearance_mm: 7.0,
    };
    let expected = serde_json::to_vec(&solve_single_loop(input.clone())).unwrap();
    for _ in 0..20 {
        assert_eq!(
            serde_json::to_vec(&solve_single_loop(input.clone())).unwrap(),
            expected
        );
    }
}
