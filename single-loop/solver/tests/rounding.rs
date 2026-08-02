use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::canonicalize_path;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::spiral::{
    RoundingError, global_dps_feasibility, round_across_multiple_corners, round_polyline,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn assert_point(actual: Point, expected: Point) {
    assert_abs_diff_eq!(actual.x, expected.x, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.y, expected.y, epsilon = 1e-9);
}

#[test]
fn ninety_degree_corner_uses_eighty_mm_tangent_offsets() {
    let rounded = round_polyline(
        &[point(0.0, 0.0), point(200.0, 0.0), point(200.0, 200.0)],
        80.0,
    )
    .unwrap();

    assert_eq!(rounded.len(), 3);
    canonicalize_path(&rounded).unwrap();
    let PathPrimitive::Line { start, end } = rounded[0] else {
        panic!("expected inbound line");
    };
    assert_point(start, point(0.0, 0.0));
    assert_point(end, point(120.0, 0.0));
    let PathPrimitive::Arc {
        start,
        end,
        center,
        radius_mm,
        sweep_rad,
    } = rounded[1]
    else {
        panic!("expected fixed-radius corner arc");
    };
    assert_point(start, point(120.0, 0.0));
    assert_point(end, point(200.0, 80.0));
    assert_point(center, point(120.0, 80.0));
    assert_abs_diff_eq!(radius_mm, 80.0, epsilon = 1e-9);
    assert_abs_diff_eq!(sweep_rad, std::f64::consts::FRAC_PI_2, epsilon = 1e-12);
    let PathPrimitive::Line { start, end } = rounded[2] else {
        panic!("expected outbound line");
    };
    assert_point(start, point(200.0, 80.0));
    assert_point(end, point(200.0, 200.0));
}

#[test]
fn invalid_rounding_inputs_return_typed_errors() {
    assert_eq!(
        round_polyline(&[point(0.0, 0.0)], 80.0),
        Err(RoundingError::TooFewPoints)
    );
    assert_eq!(
        round_polyline(&[point(0.0, 0.0), point(200.0, 0.0)], f64::NAN),
        Err(RoundingError::InvalidRadius)
    );
    assert_eq!(
        round_polyline(&[point(0.0, 0.0), point(f64::INFINITY, 0.0)], 80.0),
        Err(RoundingError::InvalidPoint { index: 1 })
    );
}

#[test]
fn two_corners_reject_insufficient_shared_segment() {
    let points = [
        point(0.0, 0.0),
        point(100.0, 0.0),
        point(100.0, 100.0),
        point(200.0, 100.0),
    ];
    assert_eq!(
        global_dps_feasibility(&points, 80.0),
        Err(RoundingError::InsufficientSegment { index: 1 })
    );
    assert_eq!(
        round_polyline(&points, 80.0),
        Err(RoundingError::InsufficientSegment { index: 1 })
    );
}

#[test]
fn exact_shared_dps_budget_succeeds_without_a_zero_length_line() {
    let points = [
        point(0.0, 0.0),
        point(100.0, 0.0),
        point(100.0, 160.0),
        point(200.0, 160.0),
    ];
    global_dps_feasibility(&points, 80.0).unwrap();
    let rounded = round_polyline(&points, 80.0).unwrap();
    assert!(rounded.iter().all(|primitive| primitive.length() > 0.0));
    assert!(
        rounded
            .windows(2)
            .all(|pair| (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-8)
    );

    let mut short = points;
    short[2].y = 159.999;
    assert_eq!(
        global_dps_feasibility(&short, 80.0),
        Err(RoundingError::InsufficientSegment { index: 1 })
    );
}

#[test]
fn aligned_forward_points_are_merged_but_reversal_is_typed() {
    let rounded = round_polyline(
        &[
            point(0.0, 0.0),
            point(100.0, 0.0),
            point(200.0, 0.0),
            point(200.0, 200.0),
        ],
        80.0,
    )
    .unwrap();
    assert_eq!(rounded.len(), 3);
    assert!(matches!(
        round_polyline(&[point(0.0, 0.0), point(100.0, 0.0), point(0.0, 0.0)], 80.0),
        Err(RoundingError::Reversal { index: 1 })
    ));
}

#[test]
fn multi_corner_variants_are_stable_g1_and_radius_compliant() {
    let points = [
        point(0.0, 0.0),
        point(300.0, 0.0),
        point(400.0, 100.0),
        point(400.0, 400.0),
    ];
    let first = round_across_multiple_corners(&points, 80.0);
    let second = round_across_multiple_corners(&points, 80.0);

    assert!(!first.is_empty());
    assert_eq!(first, second);
    for variant in first {
        assert!(variant.primitives.windows(2).all(|pair| {
            let left = pair[0].end_tangent();
            let right = pair[1].start_tangent();
            (left.x - right.x).hypot(left.y - right.y) <= 1e-7
        }));
        assert!(variant.primitives.iter().all(|primitive| match primitive {
            PathPrimitive::Line { .. } => true,
            PathPrimitive::Arc { radius_mm, .. } => *radius_mm >= 80.0,
        }));
    }
}

#[test]
fn across_all_corners_emits_a_stable_maximal_span_when_tangencies_fit() {
    let points = [
        point(0.0, 0.0),
        point(500.0, 0.0),
        point(450.0, 50.0),
        point(400.0, 50.0),
        point(400.0, 500.0),
    ];
    let variants = round_across_multiple_corners(&points, 80.0);
    let spanning = variants
        .iter()
        .find(|variant| {
            variant.kind == single_loop_solver::spiral::RoundingVariantKind::AcrossAllCorners
        })
        .expect("maximal first/last segment pair should be feasible");
    assert_eq!(spanning.start_segment_index, 0);
    assert_eq!(spanning.end_segment_index, 3);
    assert_eq!(spanning.primitives.len(), 3);
    assert!(matches!(
        spanning.primitives[1],
        PathPrimitive::Arc { radius_mm, .. } if radius_mm == 80.0
    ));
}
