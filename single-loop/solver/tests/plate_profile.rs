use single_loop_solver::plate::{
    Heading8, NoppType, PlateModelInput, PlateProfile, PlateProfileId,
};
use single_loop_solver::model::Point;

#[test]
fn bekotec_16_profile_has_fixed_physical_dimensions() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();

    assert_eq!(profile.id, PlateProfileId::BekotecEn23Fi30_16);
    assert_eq!(profile.version, "2026.07.31-1");
    assert_eq!(profile.pitch_mm, 75.0);
    assert_eq!(profile.period_mm, 150.0);
    assert_eq!(profile.pipe_radius_mm, 8.0);
    assert_eq!(profile.min_bend_radius_mm, 80.0);
    assert_eq!(profile.large_rendered_radius_mm, 33.0);
    assert_eq!(profile.large_effective_radius_mm, 17.5);
    assert_eq!(profile.small_effective_radius_mm, 10.5);
    assert_eq!(profile.calibration_allowance_mm, 0.5);
    assert_eq!(profile.forbidden_radius(NoppType::Large), 26.0);
    assert_eq!(profile.forbidden_radius(NoppType::Small), 19.0);
}

#[test]
fn heading8_contains_exactly_the_eight_45_degree_directions() {
    assert_eq!(
        Heading8::ALL.map(Heading8::degrees),
        [0, 45, 90, 135, 180, 225, 270, 315]
    );
    for heading in Heading8::ALL {
        let direction = heading.direction();
        assert!((direction.norm() - 1.0).abs() <= 1e-15);
    }
}

#[test]
fn plate_input_uses_a_closed_profile_name_and_camel_case_json() {
    let input = PlateModelInput {
        polygon: vec![
            Point::new(0.0, 0.0),
            Point::new(600.0, 0.0),
            Point::new(600.0, 450.0),
            Point::new(0.0, 450.0),
        ],
        connection_edge_index: 0,
        wall_clearance_mm: 8.0,
        phase_u_mm: 0.0,
        phase_v_mm: 37.5,
        profile: PlateProfileId::BekotecEn23Fi30_16,
    };

    let json = serde_json::to_value(&input).unwrap();
    assert_eq!(json["connectionEdgeIndex"], 0);
    assert_eq!(json["wallClearanceMm"], 8.0);
    assert_eq!(json["phaseUMm"], 0.0);
    assert_eq!(json["phaseVMm"], 37.5);
    assert_eq!(json["profile"], "BEKOTEC_EN_23_FI_30_16");

    let mut invalid = json;
    invalid["profile"] = "OTHER_PLATE".into();
    assert!(serde_json::from_value::<PlateModelInput>(invalid).is_err());
}
