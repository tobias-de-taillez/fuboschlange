use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::PointClassification;
use single_loop_solver::input::{connection_warning, validate_and_normalize};
use single_loop_solver::model::{
    ConnectionInput, Point, SolveSingleLoopInput, SolverErrorCode, SolverWarningCode,
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
) -> SolveSingleLoopInput {
    SolveSingleLoopInput {
        polygon,
        connection: ConnectionInput {
            edge_index,
            center_offset_mm,
        },
        requested_spacing_mm: 120.0,
        wall_clearance_mm: 20.0,
    }
}

fn rectangle_request(
    width_mm: f64,
    height_mm: f64,
    edge_index: u32,
    center_offset_mm: f64,
) -> SolveSingleLoopInput {
    request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (width_mm, 0.0),
            (width_mm, height_mm),
            (0.0, height_mm),
        ]),
        edge_index,
        center_offset_mm,
    )
}

fn assert_error(
    result: Result<impl core::fmt::Debug, single_loop_solver::model::SolverError>,
    code: SolverErrorCode,
) {
    let error = result.expect_err("expected validation to fail");
    assert_eq!(error.code, code, "unexpected error: {error:?}");
}

fn assert_point_close(actual: Point, expected: (f64, f64)) {
    assert_abs_diff_eq!(actual.x, expected.0, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.y, expected.1, epsilon = 1e-9);
}

fn distance(a: Point, b: Point) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

fn request_ccw_on_edge_2() -> SolveSingleLoopInput {
    request_with_polygon(
        polygon(&[(0.0, 0.0), (300.0, 0.0), (300.0, 180.0), (0.0, 180.0)]),
        2,
        80.0,
    )
}

fn equivalent_request_cw_on_mapped_edge() -> SolveSingleLoopInput {
    request_with_polygon(
        polygon(&[(0.0, 0.0), (0.0, 180.0), (300.0, 180.0), (300.0, 0.0)]),
        1,
        220.0,
    )
}

#[test]
fn edge_below_116_mm_has_no_connection() {
    let input = rectangle_request(115.999, 1000.0, 0, 58.0);
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::NoValidConnectionOnEdge,
    );
}

#[test]
fn edge_at_116_mm_clamps_to_its_single_valid_midpoint() {
    let input = rectangle_request(116.0, 1000.0, 0, 4.0);
    let normalized = validate_and_normalize(input).unwrap();

    assert_abs_diff_eq!(
        normalized.connection.actual_center_offset_mm,
        58.0,
        epsilon = 1e-9
    );
    assert_abs_diff_eq!(normalized.connection.shifted_by_mm, 54.0, epsilon = 1e-9);
    assert_point_close(normalized.connection.center, (58.0, 0.0));
    assert_point_close(normalized.connection.first_port, (33.0, 0.0));
    assert_point_close(normalized.connection.second_port, (83.0, 0.0));
    assert_point_close(normalized.connection.start_port, (33.0, 0.0));
    assert_point_close(normalized.connection.end_port, (83.0, 0.0));
    assert_abs_diff_eq!(
        distance(
            normalized.connection.first_port,
            normalized.connection.second_port
        ),
        50.0,
        epsilon = 1e-9
    );

    let warning = connection_warning(&normalized.connection).unwrap();
    assert_eq!(warning.code, SolverWarningCode::ConnectionShifted);
    assert_eq!(
        warning
            .details
            .get("requestedCenterOffsetMm")
            .and_then(|value| value.as_number()),
        Some(4.0)
    );
    assert_eq!(
        warning
            .details
            .get("actualCenterOffsetMm")
            .and_then(|value| value.as_number()),
        Some(58.0)
    );
}

#[test]
fn unshifted_connection_has_no_warning() {
    let input = rectangle_request(300.0, 1000.0, 0, 120.0);
    let normalized = validate_and_normalize(input).unwrap();
    assert!(connection_warning(&normalized.connection).is_none());
}

#[test]
fn clockwise_polygon_preserves_original_connection_edge() {
    let ccw = validate_and_normalize(request_ccw_on_edge_2()).unwrap();
    let cw = validate_and_normalize(equivalent_request_cw_on_mapped_edge()).unwrap();

    assert_point_close(ccw.connection.center, (220.0, 180.0));
    assert_point_close(cw.connection.center, (220.0, 180.0));
    assert_point_close(ccw.connection.first_port, (245.0, 180.0));
    assert_point_close(cw.connection.first_port, (195.0, 180.0));
}

#[test]
fn collinear_original_edge_is_preserved_during_internal_simplification() {
    let input = request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (150.0, 0.0),
            (300.0, 0.0),
            (300.0, 200.0),
            (0.0, 200.0),
        ]),
        1,
        75.0,
    );
    let normalized = validate_and_normalize(input).unwrap();

    assert_point_close(normalized.connection.center, (225.0, 0.0));
    assert_eq!(normalized.polygon.internal_ccw_vertices().len(), 4);
}

#[test]
fn invalid_requested_spacing_values_are_rejected() {
    let mut too_small = rectangle_request(300.0, 200.0, 0, 120.0);
    too_small.requested_spacing_mm = 49.999;
    assert_error(
        validate_and_normalize(too_small),
        SolverErrorCode::InvalidRequestedSpacing,
    );

    let mut too_large = rectangle_request(300.0, 200.0, 0, 120.0);
    too_large.requested_spacing_mm = 250.001;
    assert_error(
        validate_and_normalize(too_large),
        SolverErrorCode::InvalidRequestedSpacing,
    );

    let mut non_finite = rectangle_request(300.0, 200.0, 0, 120.0);
    non_finite.requested_spacing_mm = f64::NAN;
    assert_error(
        validate_and_normalize(non_finite),
        SolverErrorCode::InvalidRequestedSpacing,
    );
}

#[test]
fn invalid_wall_clearance_values_are_rejected() {
    let mut too_small = rectangle_request(300.0, 200.0, 0, 120.0);
    too_small.wall_clearance_mm = 7.999;
    assert_error(
        validate_and_normalize(too_small),
        SolverErrorCode::InvalidWallClearance,
    );

    let mut non_finite = rectangle_request(300.0, 200.0, 0, 120.0);
    non_finite.wall_clearance_mm = f64::INFINITY;
    assert_error(
        validate_and_normalize(non_finite),
        SolverErrorCode::InvalidWallClearance,
    );
}

#[test]
fn invalid_connection_edge_values_are_rejected() {
    let out_of_range = rectangle_request(300.0, 200.0, 9, 120.0);
    assert_error(
        validate_and_normalize(out_of_range),
        SolverErrorCode::InvalidConnectionEdge,
    );

    let non_finite_offset = rectangle_request(300.0, 200.0, 0, f64::NAN);
    assert_error(
        validate_and_normalize(non_finite_offset),
        SolverErrorCode::InvalidConnectionEdge,
    );
}

#[test]
fn polygon_classifies_points_and_measures_exact_boundary_distance() {
    let normalized = validate_and_normalize(rectangle_request(300.0, 200.0, 0, 120.0)).unwrap();

    assert_eq!(
        normalized.polygon.classify_point(point(150.0, 100.0)),
        PointClassification::Inside
    );
    assert_eq!(
        normalized.polygon.classify_point(point(0.0, 100.0)),
        PointClassification::Boundary
    );
    assert_eq!(
        normalized.polygon.classify_point(point(-1.0, 100.0)),
        PointClassification::Outside
    );
    assert_abs_diff_eq!(
        normalized
            .polygon
            .exact_boundary_distance(point(40.0, 80.0)),
        40.0,
        epsilon = 1e-9
    );
}

#[test]
fn repeated_closing_point_is_invalid_polygon() {
    let input = request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (300.0, 0.0),
            (300.0, 200.0),
            (0.0, 200.0),
            (0.0, 0.0),
        ]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn non_finite_polygon_coordinates_are_invalid() {
    let input = request_with_polygon(
        polygon(&[(0.0, 0.0), (300.0, 0.0), (f64::NAN, 200.0), (0.0, 200.0)]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn self_crossing_bow_tie_is_invalid_polygon() {
    let input = request_with_polygon(
        polygon(&[(0.0, 0.0), (300.0, 200.0), (0.0, 200.0), (300.0, 0.0)]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn overlapping_edges_are_invalid_polygon() {
    let input = request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (300.0, 0.0),
            (120.0, 0.0),
            (120.0, 200.0),
            (0.0, 200.0),
        ]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn nonadjacent_touch_is_invalid_polygon() {
    let input = request_with_polygon(
        polygon(&[
            (0.0, 0.0),
            (300.0, 0.0),
            (300.0, 200.0),
            (150.0, 200.0),
            (150.0, 0.0),
            (0.0, 200.0),
        ]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn zero_area_polygon_is_invalid() {
    let input = request_with_polygon(polygon(&[(0.0, 0.0), (150.0, 0.0), (300.0, 0.0)]), 0, 120.0);
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}

#[test]
fn zero_length_edge_is_invalid_polygon() {
    let input = request_with_polygon(
        polygon(&[(0.0, 0.0), (300.0, 0.0), (300.0, 0.0), (0.0, 200.0)]),
        0,
        120.0,
    );
    assert_error(
        validate_and_normalize(input),
        SolverErrorCode::InvalidPolygon,
    );
}
