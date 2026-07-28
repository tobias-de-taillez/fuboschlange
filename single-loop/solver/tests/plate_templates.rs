use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    Heading8, LocalPose, MotionTemplate, PlateProfile, PlateValidationFailureCode, TemplateId,
    TemplateTransform, certify_template,
};
use std::f64::consts::{FRAC_PI_2, PI};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

#[test]
fn profile_contains_straight_diagonal_and_documented_broad_turn_families() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let templates = profile.templates();
    let ids = templates
        .iter()
        .map(|template| template.id)
        .collect::<Vec<_>>();

    assert!(ids.contains(&TemplateId::Straight0));
    assert!(ids.contains(&TemplateId::Straight45));
    assert!(ids.contains(&TemplateId::BroadTurn45));
    assert!(ids.contains(&TemplateId::BroadTurn90));
    assert!(ids.contains(&TemplateId::BroadTurn135));
    assert!(ids.contains(&TemplateId::BroadReverse180));
    assert!(ids.contains(&TemplateId::TeardropReverse));
    assert!(
        templates
            .iter()
            .all(|template| certify_template(template, &profile).is_ok())
    );
}

#[test]
fn every_certified_template_matches_endpoint_poses_and_g1_joins() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    for template in profile.templates() {
        let certificate = certify_template(&template, &profile).unwrap();
        assert!(certificate.min_nopp_clearance_mm > 0.0);
        assert!(certificate.min_bend_radius_mm >= 80.0);
        assert_eq!(
            template.primitives.first().unwrap().point_at(0.0),
            template.start.point
        );
        assert_eq!(
            template.primitives.last().unwrap().point_at(1.0),
            template.end.point
        );
        assert!(template.primitives.windows(2).all(|pair| {
            (pair[0].point_at(1.0) - pair[1].point_at(0.0)).norm() <= 1e-6
                && (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-7
        }));
        assert!(
            (template.primitives[0].start_tangent() - template.start.heading.direction()).norm()
                <= 1e-7
        );
        assert!(
            (template.primitives.last().unwrap().end_tangent() - template.end.heading.direction())
                .norm()
                <= 1e-7
        );
    }
}

#[test]
fn tight_handbook_turns_are_rejected_by_the_profile_certificate() {
    let tight_90 = MotionTemplate::new(
        TemplateId::HandbookRejectedTight90,
        LocalPose::new(point(0.0, -37.5), Heading8::Deg0),
        LocalPose::new(point(37.5, 0.0), Heading8::Deg90),
        vec![PathPrimitive::Arc {
            start: point(0.0, -37.5),
            end: point(37.5, 0.0),
            center: point(0.0, 0.0),
            radius_mm: 37.5,
            sweep_rad: FRAC_PI_2,
        }],
    );
    let tight_u = MotionTemplate::new(
        TemplateId::HandbookRejectedTightU,
        LocalPose::new(point(-37.5, 0.0), Heading8::Deg270),
        LocalPose::new(point(37.5, 0.0), Heading8::Deg90),
        vec![PathPrimitive::Arc {
            start: point(-37.5, 0.0),
            end: point(37.5, 0.0),
            center: point(0.0, 0.0),
            radius_mm: 37.5,
            sweep_rad: PI,
        }],
    );

    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert_eq!(
        certify_template(&tight_90, &profile).unwrap_err().code,
        PlateValidationFailureCode::BendRadiusTooSmall
    );
    assert_eq!(
        certify_template(&tight_u, &profile).unwrap_err().code,
        PlateValidationFailureCode::BendRadiusTooSmall
    );
}

#[test]
fn every_quarter_turn_reflection_and_period_translation_recertifies() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let broad_90 = profile
        .templates()
        .into_iter()
        .find(|template| template.id == TemplateId::BroadTurn90)
        .unwrap();

    for reflected in [false, true] {
        for quarter_turns in 0..4 {
            let transform = TemplateTransform::new(quarter_turns, reflected, -2, 3).unwrap();
            let transformed = transform.apply(&broad_90, profile.period_mm);
            certify_template(&transformed, &profile).unwrap();
        }
    }
}

#[test]
fn template_catalogue_serialization_is_byte_deterministic() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let first = serde_json::to_vec(&profile.templates()).unwrap();
    let second = serde_json::to_vec(&profile.templates()).unwrap();
    assert_eq!(first, second);
}
