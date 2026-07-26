use single_loop_solver::model::{PathPrimitive, Point, SolveResult};

#[test]
fn serializes_path_with_camel_case_discriminated_primitives() {
    let primitive = PathPrimitive::Arc {
        start: Point::new(80.0, 0.0),
        end: Point::new(0.0, 80.0),
        center: Point::new(0.0, 0.0),
        radius_mm: 80.0,
        sweep_rad: std::f64::consts::FRAC_PI_2,
    };
    let json = serde_json::to_value(primitive).unwrap();
    assert_eq!(json["kind"], "arc");
    assert_eq!(json["radiusMm"], 80.0);
    assert_eq!(json["sweepRad"], std::f64::consts::FRAC_PI_2);
    let _: Option<SolveResult> = None;
}
