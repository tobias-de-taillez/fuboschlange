use single_loop_solver::circuit::{ConnectionInput, LoopErrorCode, LoopPattern, SolveLoopInput};
use single_loop_solver::model::Point;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn base_input(pattern: LoopPattern) -> SolveLoopInput {
    SolveLoopInput {
        polygon: vec![
            point(0.0, 0.0),
            point(3000.0, 0.0),
            point(3000.0, 2400.0),
            point(0.0, 2400.0),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 1500.0,
            zone_width_mm: 450.0,
            zone_depth_mm: 225.0,
        },
        requested_spacing_mm: 150,
        wall_clearance_mm: 75.0,
        phase_u_mm: 0.0,
        phase_v_mm: 0.0,
        pattern,
        profile: "BEKOTEC_EN_23_FI_30_16".to_owned(),
    }
}

#[test]
fn input_round_trips_camel_case_json() {
    let json = serde_json::to_value(base_input(LoopPattern::Spiral)).unwrap();
    assert_eq!(json["requestedSpacingMm"], 150);
    assert_eq!(json["connection"]["zoneWidthMm"], 450.0);
    assert_eq!(json["pattern"], "spiral");
    let back: SolveLoopInput = serde_json::from_value(json).unwrap();
    assert_eq!(back, base_input(LoopPattern::Spiral));
}

#[test]
fn spacing_outside_system_list_is_rejected() {
    let mut input = base_input(LoopPattern::Spiral);
    input.requested_spacing_mm = 100;
    assert_eq!(
        single_loop_solver::circuit::validate_input(&input)
            .unwrap_err()
            .code,
        LoopErrorCode::InvalidRequestedSpacing
    );
}

#[test]
fn meander_and_free_are_typed_not_implemented() {
    for pattern in [LoopPattern::Meander, LoopPattern::Free] {
        assert_eq!(
            single_loop_solver::circuit::validate_input(&base_input(pattern))
                .unwrap_err()
                .code,
            LoopErrorCode::PatternNotImplemented
        );
    }
}
