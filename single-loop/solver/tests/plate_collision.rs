use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    Heading8, Nopp, NoppIndex, NoppType, PlateProfile, PlateTransform, PlateValidationFailureCode,
    primitive_circle_clearance, validate_line_heading, validate_primitive_against_plate,
};
use std::f64::consts::{FRAC_PI_2, FRAC_PI_8};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn line(start: Point, end: Point) -> PathPrimitive {
    PathPrimitive::Line { start, end }
}

#[test]
fn line_circle_clearance_distinguishes_separation_tangency_and_penetration() {
    let primitive = line(point(-100.0, 30.0), point(100.0, 30.0));
    assert_eq!(
        primitive_circle_clearance(&primitive, point(0.0, 0.0), 26.0),
        4.0
    );
    assert_eq!(
        primitive_circle_clearance(&primitive, point(0.0, 4.0), 26.0),
        0.0
    );
    assert!(primitive_circle_clearance(&primitive, point(0.0, 5.0), 26.0) < 0.0);
}

#[test]
fn arc_circle_clearance_uses_radial_extrema_only_inside_the_sweep() {
    let arc = PathPrimitive::Arc {
        start: point(80.0, 0.0),
        end: point(0.0, 80.0),
        center: point(0.0, 0.0),
        radius_mm: 80.0,
        sweep_rad: FRAC_PI_2,
    };
    assert_eq!(
        primitive_circle_clearance(&arc, point(0.0, 0.0), 26.0),
        54.0
    );
    let tangent_circle_center = point(54.0 / 2.0_f64.sqrt(), 54.0 / 2.0_f64.sqrt());
    assert!(primitive_circle_clearance(&arc, tangent_circle_center, 26.0).abs() <= 1e-12);
    assert!(primitive_circle_clearance(&arc, point(-80.0, 0.0), 26.0) > 87.0);
}

#[test]
fn only_exact_multiples_of_forty_five_degrees_are_straight_headings() {
    assert_eq!(
        validate_line_heading(&line(point(0.0, 0.0), point(10.0, 10.0))).unwrap(),
        Heading8::Deg45
    );
    let direction = point(FRAC_PI_8.cos(), FRAC_PI_8.sin());
    assert_eq!(
        validate_line_heading(&line(point(0.0, 0.0), direction))
            .unwrap_err()
            .code,
        PlateValidationFailureCode::UnsupportedHeading
    );
}

#[test]
fn independent_primitive_validation_rejects_radius_nopp_wall_and_concave_escape() {
    let polygon = Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(500.0, 0.0),
        point(500.0, 200.0),
        point(200.0, 200.0),
        point(200.0, 500.0),
        point(0.0, 500.0),
    ])
    .unwrap();
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let transform = PlateTransform::from_edge(
        point(0.0, 0.0),
        point(500.0, 0.0),
        point(0.0, 500.0),
        0.0,
        0.0,
    )
    .unwrap();
    let nopp = Nopp::at_index(NoppIndex::new(1, 1), &profile, &transform);

    let outside = line(point(50.0, 450.0), point(450.0, 50.0));
    assert_eq!(
        validate_primitive_against_plate(&outside, &polygon, 8.0, &[], &profile)
            .unwrap_err()
            .code,
        PlateValidationFailureCode::OutsideWallDomain
    );

    let through_nopp = line(point(25.0, 75.0), point(125.0, 75.0));
    let error = validate_primitive_against_plate(&through_nopp, &polygon, 8.0, &[nopp], &profile)
        .unwrap_err();
    assert_eq!(error.code, PlateValidationFailureCode::NoppCollision);
    assert_eq!(error.nopp_type, Some(NoppType::Large));

    let too_tight = PathPrimitive::Arc {
        start: point(160.0, 80.0),
        end: point(80.0, 160.0),
        center: point(80.0, 80.0),
        radius_mm: 79.999,
        sweep_rad: FRAC_PI_2,
    };
    assert_eq!(
        validate_primitive_against_plate(&too_tight, &polygon, 8.0, &[], &profile)
            .unwrap_err()
            .code,
        PlateValidationFailureCode::BendRadiusTooSmall
    );

    let inconsistent_arc = PathPrimitive::Arc {
        start: point(160.0, 80.0),
        end: point(80.0, 0.0),
        center: point(80.0, 80.0),
        radius_mm: 80.0,
        sweep_rad: FRAC_PI_2,
    };
    assert_eq!(
        validate_primitive_against_plate(&inconsistent_arc, &polygon, 8.0, &[], &profile)
            .unwrap_err()
            .code,
        PlateValidationFailureCode::InvalidPrimitive
    );

    let valid = line(point(37.5, 37.5), point(187.5, 37.5));
    validate_primitive_against_plate(&valid, &polygon, 8.0, &[], &profile).unwrap();
}
