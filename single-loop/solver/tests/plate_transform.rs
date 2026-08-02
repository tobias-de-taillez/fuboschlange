use approx::assert_relative_eq;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::PlateTransform;
use std::f64::consts::FRAC_PI_2;

#[test]
fn plate_frame_aligns_with_edge_and_points_inward() {
    let transform = PlateTransform::from_edge(
        Point::new(100.0, 200.0),
        Point::new(500.0, 500.0),
        Point::new(150.0, 600.0),
        0.0,
        0.0,
    )
    .unwrap();

    let edge = Point::new(500.0, 500.0) - Point::new(100.0, 200.0);
    assert_relative_eq!(transform.u().dot(edge), edge.norm(), epsilon = 1e-12);
    assert!((Point::new(150.0, 600.0) - Point::new(100.0, 200.0)).dot(transform.v()) > 0.0);
}

#[test]
fn phase_is_canonical_and_local_world_roundtrip_is_stable() {
    let transform = PlateTransform::from_edge(
        Point::new(10.0, 20.0),
        Point::new(110.0, 20.0),
        Point::new(10.0, 120.0),
        -1.0,
        151.0,
    )
    .unwrap();

    assert_eq!(transform.phase_u_mm(), 74.0);
    assert_eq!(transform.phase_v_mm(), 1.0);

    let local = Point::new(-37.5, 212.25);
    let roundtrip = transform.to_local(transform.to_world(local));
    assert_relative_eq!(roundtrip.x, local.x, epsilon = 1e-12);
    assert_relative_eq!(roundtrip.y, local.y, epsilon = 1e-12);
}

#[test]
fn reflected_plate_frame_flips_arc_sweep_and_roundtrips_primitives() {
    let transform = PlateTransform::from_edge(
        Point::new(100.0, 0.0),
        Point::new(0.0, 0.0),
        Point::new(50.0, 100.0),
        0.0,
        0.0,
    )
    .unwrap();
    let local = PathPrimitive::Arc {
        start: Point::new(80.0, 0.0),
        end: Point::new(0.0, 80.0),
        center: Point::new(0.0, 0.0),
        radius_mm: 80.0,
        sweep_rad: FRAC_PI_2,
    };
    let world = transform.primitive_to_world(&local);
    let PathPrimitive::Arc { sweep_rad, .. } = world else {
        panic!("arc transform changed primitive kind");
    };
    assert_eq!(sweep_rad, -FRAC_PI_2);
    assert_eq!(transform.primitive_to_local(&world), local);
}

#[test]
fn invalid_edge_or_nonfinite_phase_is_rejected() {
    assert!(
        PlateTransform::from_edge(
            Point::new(0.0, 0.0),
            Point::new(0.0, 0.0),
            Point::new(1.0, 0.0),
            0.0,
            0.0,
        )
        .is_err()
    );
    assert!(
        PlateTransform::from_edge(
            Point::new(0.0, 0.0),
            Point::new(1.0, 0.0),
            Point::new(0.0, 1.0),
            f64::NAN,
            0.0,
        )
        .is_err()
    );
}
