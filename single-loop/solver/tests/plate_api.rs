use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    PlateModelErrorCode, PlateModelInput, PlateModelResult, PlateProfileId, build_plate_model,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn input() -> PlateModelInput {
    PlateModelInput {
        polygon: vec![
            point(0.0, 0.0),
            point(900.0, 0.0),
            point(900.0, 750.0),
            point(0.0, 750.0),
        ],
        connection_edge_index: 0,
        wall_clearance_mm: 8.0,
        phase_u_mm: 0.0,
        phase_v_mm: 0.0,
        profile: PlateProfileId::BekotecEn23Fi30_16,
    }
}

#[test]
fn public_api_returns_only_an_independently_validated_plate_model() {
    let result = build_plate_model(input());
    let PlateModelResult::Success { model } = &result else {
        panic!("reference rectangle should have a plate graph: {result:?}");
    };
    assert_eq!(model.profile, PlateProfileId::BekotecEn23Fi30_16);
    assert_eq!(model.profile_version, "2026.07.28-1");
    assert!(model.validation.independently_validated);
    assert!(!model.graph.edges.is_empty());

    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["model"]["profile"], "BEKOTEC_EN_23_FI_30_16");
    assert!(json.get("plan").is_none());
    assert!(json.get("path").is_none());
    assert!(json.get("heatingLoop").is_none());
    assert!(json["model"].get("plan").is_none());
    assert!(json["model"].get("path").is_none());
}

#[test]
fn public_api_json_is_byte_deterministic() {
    let first = serde_json::to_vec(&build_plate_model(input())).unwrap();
    let second = serde_json::to_vec(&build_plate_model(input())).unwrap();
    assert_eq!(first, second);
}

#[test]
fn public_api_returns_typed_input_and_empty_model_errors() {
    let mut invalid_wall = input();
    invalid_wall.wall_clearance_mm = 7.999;
    let PlateModelResult::Error { error } = build_plate_model(invalid_wall) else {
        panic!("wall clearance below eight mm was accepted");
    };
    assert_eq!(error.code, PlateModelErrorCode::InvalidWallClearance);

    let mut invalid_phase = input();
    invalid_phase.phase_u_mm = f64::NAN;
    let PlateModelResult::Error { error } = build_plate_model(invalid_phase) else {
        panic!("nonfinite phase was accepted");
    };
    assert_eq!(error.code, PlateModelErrorCode::InvalidPlatePhase);

    let mut tiny = input();
    tiny.polygon = vec![
        point(0.0, 0.0),
        point(100.0, 0.0),
        point(100.0, 100.0),
        point(0.0, 100.0),
    ];
    let PlateModelResult::Error { error } = build_plate_model(tiny) else {
        panic!("tiny room unexpectedly contains a complete motion template");
    };
    assert_eq!(error.code, PlateModelErrorCode::NoUsablePlateCell);
}
