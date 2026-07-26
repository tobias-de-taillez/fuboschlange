use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{Aabb, PathError, Vec2, canonicalize_path};
use single_loop_solver::model::{PathPrimitive, Point};
use std::f64::consts::{FRAC_1_SQRT_2, FRAC_PI_2, PI};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn line(start: (f64, f64), end: (f64, f64)) -> PathPrimitive {
    PathPrimitive::Line {
        start: point(start.0, start.1),
        end: point(end.0, end.1),
    }
}

fn arc(
    start: (f64, f64),
    end: (f64, f64),
    center: (f64, f64),
    radius_mm: f64,
    sweep_rad: f64,
) -> PathPrimitive {
    PathPrimitive::Arc {
        start: point(start.0, start.1),
        end: point(end.0, end.1),
        center: point(center.0, center.1),
        radius_mm,
        sweep_rad,
    }
}

fn assert_point_close(actual: Point, expected: (f64, f64)) {
    assert_abs_diff_eq!(actual.x, expected.0, epsilon = 1e-10);
    assert_abs_diff_eq!(actual.y, expected.1, epsilon = 1e-10);
}

fn assert_vec_close(actual: Vec2, expected: (f64, f64)) {
    assert_abs_diff_eq!(actual.x, expected.0, epsilon = 1e-10);
    assert_abs_diff_eq!(actual.y, expected.1, epsilon = 1e-10);
}

fn assert_aabb_close(actual: Aabb, min: (f64, f64), max: (f64, f64)) {
    assert_point_close(actual.min, min);
    assert_point_close(actual.max, max);
}

#[test]
fn quarter_arc_has_analytic_length_tangents_and_midpoint() {
    let arc = arc((80.0, 0.0), (0.0, 80.0), (0.0, 0.0), 80.0, FRAC_PI_2);
    assert_abs_diff_eq!(arc.length(), 80.0 * FRAC_PI_2, epsilon = 1e-10);
    assert_vec_close(arc.start_tangent(), (0.0, 1.0));
    assert_vec_close(arc.end_tangent(), (-1.0, 0.0));
    assert_point_close(
        arc.point_at(0.5),
        (80.0 * FRAC_1_SQRT_2, 80.0 * FRAC_1_SQRT_2),
    );
}

#[test]
fn arc_bounds_include_axis_extrema_on_negative_sweep() {
    let radius = 80.0;
    let arc = arc(
        (-radius * FRAC_1_SQRT_2, radius * FRAC_1_SQRT_2),
        (radius * FRAC_1_SQRT_2, -radius * FRAC_1_SQRT_2),
        (0.0, 0.0),
        radius,
        -PI,
    );

    assert_aabb_close(
        arc.bounds(),
        (-radius * FRAC_1_SQRT_2, -radius * FRAC_1_SQRT_2),
        (radius, radius),
    );
}

#[test]
fn arc_bounds_handle_branch_cut_wraparound() {
    let radius = 80.0;
    let arc = arc(
        (radius * FRAC_1_SQRT_2, -radius * FRAC_1_SQRT_2),
        (radius * FRAC_1_SQRT_2, radius * FRAC_1_SQRT_2),
        (0.0, 0.0),
        radius,
        FRAC_PI_2,
    );

    assert_aabb_close(
        arc.bounds(),
        (radius * FRAC_1_SQRT_2, -radius * FRAC_1_SQRT_2),
        (radius, radius * FRAC_1_SQRT_2),
    );
}

#[test]
fn canonicalization_merges_lines_and_rejects_zero_primitives() {
    let merged = canonicalize_path(&[
        line((0.0, 0.0), (10.0, 0.0)),
        line((10.0, 0.0), (20.0, 0.0)),
    ])
    .unwrap();
    assert_eq!(merged.primitives().len(), 1);
    assert!(canonicalize_path(&[line((0.0, 0.0), (0.0, 0.0))]).is_err());
}

#[test]
fn canonicalization_rejects_arc_endpoints_inconsistent_with_sweep() {
    let invalid = [arc((80.0, 0.0), (0.0, -80.0), (0.0, 0.0), 80.0, FRAC_PI_2)];
    assert!(canonicalize_path(&invalid).is_err());
}

#[test]
fn canonicalization_rejects_invalid_arc_parameters() {
    let endpoint_residual = [arc((80.0, 0.0), (0.0, 80.000002), (0.0, 0.0), 80.0, FRAC_PI_2)];
    let zero_radius = [arc((80.0, 0.0), (0.0, 80.0), (0.0, 0.0), 0.0, FRAC_PI_2)];
    let zero_sweep = [arc((80.0, 0.0), (80.0, 0.0), (0.0, 0.0), 80.0, 0.0)];
    let full_turn = [arc(
        (80.0, 0.0),
        (80.0, 0.0),
        (0.0, 0.0),
        80.0,
        std::f64::consts::TAU,
    )];
    let nonfinite = [PathPrimitive::Arc {
        start: point(f64::INFINITY, 0.0),
        end: point(0.0, 80.0),
        center: point(0.0, 0.0),
        radius_mm: 80.0,
        sweep_rad: FRAC_PI_2,
    }];

    assert!(matches!(
        canonicalize_path(&endpoint_residual),
        Err(PathError::EndpointRadiusResidual { .. })
    ));
    assert!(matches!(
        canonicalize_path(&zero_radius),
        Err(PathError::NonPositiveRadius { .. })
    ));
    assert!(matches!(
        canonicalize_path(&zero_sweep),
        Err(PathError::InvalidSweep { .. })
    ));
    assert!(matches!(
        canonicalize_path(&full_turn),
        Err(PathError::InvalidSweep { .. })
    ));
    assert!(matches!(
        canonicalize_path(&nonfinite),
        Err(PathError::NonFinitePrimitive { .. })
    ));
}

#[test]
fn canonicalization_rejects_g1_discontinuities() {
    let corner = [
        line((0.0, 0.0), (10.0, 0.0)),
        line((10.0, 0.0), (10.0, 10.0)),
    ];
    assert!(canonicalize_path(&corner).is_err());
}

#[test]
fn canonicalization_merges_compatible_arcs() {
    let merged = canonicalize_path(&[
        arc((80.0, 0.0), (0.0, 80.0), (0.0, 0.0), 80.0, FRAC_PI_2),
        arc((0.0, 80.0), (-80.0, 0.0), (0.0, 0.0), 80.0, FRAC_PI_2),
    ])
    .unwrap();

    assert_eq!(merged.primitives().len(), 1);
    match &merged.primitives()[0] {
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            assert_point_close(*start, (80.0, 0.0));
            assert_point_close(*end, (-80.0, 0.0));
            assert_point_close(*center, (0.0, 0.0));
            assert_abs_diff_eq!(*radius_mm, 80.0, epsilon = 1e-10);
            assert_abs_diff_eq!(*sweep_rad, PI, epsilon = 1e-10);
        }
        PathPrimitive::Line { .. } => panic!("expected merged arc"),
    }
}

#[test]
fn canonical_path_snaps_shared_endpoints_and_tracks_prefix_lengths() {
    let path = canonicalize_path(&[
        line((80.0, -10.0), (80.0, 0.0)),
        arc((80.0, 0.0000005), (0.0, 80.0), (0.0, 0.0), 80.0, FRAC_PI_2),
    ])
    .unwrap();

    assert_eq!(path.prefix_lengths(), &[0.0, 10.0]);
    assert_abs_diff_eq!(
        path.total_length(),
        10.0 + 80.0 * FRAC_PI_2,
        epsilon = 1e-10
    );

    match &path.primitives()[1] {
        PathPrimitive::Arc { start, .. } => assert_eq!(*start, point(80.0, 0.0)),
        PathPrimitive::Line { .. } => panic!("expected trailing arc"),
    }
}
