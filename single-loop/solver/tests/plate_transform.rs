use approx::assert_relative_eq;
use single_loop_solver::model::Point;
use single_loop_solver::plate::PlateTransform;

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
