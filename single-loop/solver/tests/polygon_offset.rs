use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{PointClassification, erode_for_centerline};
use single_loop_solver::input::validate_and_normalize;
use single_loop_solver::model::{
    ConnectionInput, PathPrimitive, Point, SolveSingleLoopInput, SolverError, SolverErrorCode,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn polygon(points: &[(f64, f64)]) -> Vec<Point> {
    points.iter().map(|&(x, y)| point(x, y)).collect()
}

fn request_with_polygon(
    polygon: Vec<Point>,
    edge_index: u32,
    center_offset_mm: f64,
    wall_clearance_mm: f64,
) -> SolveSingleLoopInput {
    SolveSingleLoopInput {
        polygon,
        connection: ConnectionInput {
            edge_index,
            center_offset_mm,
        },
        requested_spacing_mm: 120.0,
        wall_clearance_mm,
    }
}

fn assert_error(
    result: Result<impl core::fmt::Debug, SolverError>,
    code: SolverErrorCode,
) -> SolverError {
    let error = result.expect_err("expected operation to fail");
    assert_eq!(error.code, code, "unexpected error: {error:?}");
    error
}

fn line_signature(primitive: &PathPrimitive) -> Option<((i64, i64), (i64, i64))> {
    let PathPrimitive::Line { start, end } = primitive else {
        return None;
    };

    let a = (
        (start.x * 1_000_000.0).round() as i64,
        (start.y * 1_000_000.0).round() as i64,
    );
    let b = (
        (end.x * 1_000_000.0).round() as i64,
        (end.y * 1_000_000.0).round() as i64,
    );
    Some(if a <= b { (a, b) } else { (b, a) })
}

fn assert_has_line(boundary: &[PathPrimitive], start: (f64, f64), end: (f64, f64)) {
    let expected = {
        let a = (
            (start.0 * 1_000_000.0).round() as i64,
            (start.1 * 1_000_000.0).round() as i64,
        );
        let b = (
            (end.0 * 1_000_000.0).round() as i64,
            (end.1 * 1_000_000.0).round() as i64,
        );
        if a <= b { (a, b) } else { (b, a) }
    };

    assert!(
        boundary
            .iter()
            .filter_map(line_signature)
            .any(|line| line == expected),
        "missing line {expected:?} in {boundary:?}"
    );
}

#[test]
fn rectangle_erosion_is_orientation_invariant_and_stays_exact() {
    let ccw = validate_and_normalize(request_with_polygon(
        polygon(&[(0.0, 0.0), (400.0, 0.0), (400.0, 300.0), (0.0, 300.0)]),
        0,
        120.0,
        20.0,
    ))
    .unwrap();
    let cw = validate_and_normalize(request_with_polygon(
        polygon(&[(0.0, 0.0), (0.0, 300.0), (400.0, 300.0), (400.0, 0.0)]),
        0,
        120.0,
        20.0,
    ))
    .unwrap();

    for normalized in [&ccw, &cw] {
        let allowed = erode_for_centerline(normalized).unwrap();
        assert_eq!(
            allowed.boundary.len(),
            4,
            "unexpected boundary: {allowed:?}"
        );
        assert!(
            allowed
                .boundary
                .iter()
                .all(|p| matches!(p, PathPrimitive::Line { .. }))
        );
        assert_has_line(&allowed.boundary, (20.0, 20.0), (380.0, 20.0));
        assert_has_line(&allowed.boundary, (380.0, 20.0), (380.0, 280.0));
        assert_has_line(&allowed.boundary, (380.0, 280.0), (20.0, 280.0));
        assert_has_line(&allowed.boundary, (20.0, 280.0), (20.0, 20.0));
        assert_eq!(allowed.quantized_segments.len(), 4);
        assert_eq!(
            allowed.classify_point(point(200.0, 150.0)),
            PointClassification::Inside
        );
        assert_eq!(
            allowed.classify_point(point(20.0, 150.0)),
            PointClassification::Boundary
        );
        assert_eq!(
            allowed.classify_point(point(10.0, 150.0)),
            PointClassification::Outside
        );
        assert_abs_diff_eq!(
            allowed.exact_boundary_distance(point(60.0, 80.0)),
            40.0,
            epsilon = 1e-9
        );
    }
}

#[test]
fn concave_inset_retains_exact_arc_boundary() {
    let normalized = validate_and_normalize(request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (300.0, 0.0),
            (300.0, 240.0),
            (180.0, 240.0),
            (180.0, 120.0),
            (0.0, 120.0),
        ]),
        0,
        120.0,
        20.0,
    ))
    .unwrap();

    let allowed = erode_for_centerline(&normalized).unwrap();
    assert!(allowed.boundary.iter().any(|primitive| matches!(
        primitive,
        PathPrimitive::Arc { radius_mm, .. } if (radius_mm - 20.0).abs() <= 1e-9
    )));
    assert!(allowed.quantized_segments.len() > allowed.boundary.len());
}

#[test]
fn arc_tessellation_reserves_error_for_endpoint_quantization() {
    let normalized = validate_and_normalize(request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (300.0, 0.0),
            (300.0, 240.0),
            (180.0, 240.0),
            (180.0, 120.0),
            (0.0, 120.0),
        ]),
        0,
        120.0,
        16.1,
    ))
    .unwrap();

    let allowed = erode_for_centerline(&normalized).unwrap();
    let line_count = allowed
        .boundary
        .iter()
        .filter(|primitive| matches!(primitive, PathPrimitive::Line { .. }))
        .count();
    let quantized_arc_segment_count = allowed.quantized_segments.len() - line_count;

    assert!(
        quantized_arc_segment_count >= 11,
        "quantization reserve requires at least 11 arc chords, got {quantized_arc_segment_count}"
    );
}

#[test]
fn huge_finite_translation_returns_helper_quantization_resource_error() {
    let origin = 1e16;
    let normalized = validate_and_normalize(request_with_polygon(
        polygon(&[
            (origin, origin),
            (origin + 1e9, origin),
            (origin + 1e9, origin + 1e9),
            (origin, origin + 1e9),
        ]),
        0,
        5e8,
        20.0,
    ))
    .unwrap();

    let error = assert_error(
        erode_for_centerline(&normalized),
        SolverErrorCode::SolverLimitExceeded,
    );
    assert_eq!(
        error.details.get("reason").and_then(|value| value.as_str()),
        Some("HELPER_QUANTIZATION_RANGE")
    );
}

#[test]
fn total_disappearance_maps_to_no_solution_geometry() {
    let normalized = validate_and_normalize(request_with_polygon(
        polygon(&[(0.0, 0.0), (200.0, 0.0), (200.0, 80.0), (0.0, 80.0)]),
        0,
        100.0,
        50.0,
    ))
    .unwrap();

    let error = assert_error(
        erode_for_centerline(&normalized),
        SolverErrorCode::NoSolutionGeometry,
    );
    assert_eq!(
        error.details.get("reason").and_then(|value| value.as_str()),
        Some("WALL_INSET_DISCONNECTED_OR_EMPTY")
    );
}

#[test]
fn narrow_neck_disconnection_maps_to_no_solution_geometry() {
    let normalized = validate_and_normalize(request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (120.0, 0.0),
            (120.0, 30.0),
            (200.0, 30.0),
            (200.0, 0.0),
            (320.0, 0.0),
            (320.0, 120.0),
            (200.0, 120.0),
            (200.0, 90.0),
            (120.0, 90.0),
            (120.0, 120.0),
            (0.0, 120.0),
        ]),
        0,
        60.0,
        40.0,
    ))
    .unwrap();

    let error = assert_error(
        erode_for_centerline(&normalized),
        SolverErrorCode::NoSolutionGeometry,
    );
    assert_eq!(
        error.details.get("reason").and_then(|value| value.as_str()),
        Some("WALL_INSET_DISCONNECTED_OR_EMPTY")
    );
}
