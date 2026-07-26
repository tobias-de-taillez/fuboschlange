use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{CanonicalPath, ParameterRange, canonicalize_path};
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::validation::{ParentPair, SpacingExtrema, spacing_extrema};
use std::f64::consts::PI;

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

fn serpentine_with_eighty_and_one_twenty_mm_pairs() -> CanonicalPath {
    canonicalize_path(&[
        line((0.0, 0.0), (100.0, 0.0)),
        arc((100.0, 0.0), (100.0, 80.0), (100.0, 40.0), 40.0, PI),
        line((100.0, 80.0), (0.0, 80.0)),
        arc((0.0, 80.0), (0.0, 200.0), (0.0, 140.0), 60.0, -PI),
        line((0.0, 200.0), (100.0, 200.0)),
        arc((100.0, 200.0), (100.0, 320.0), (100.0, 260.0), 60.0, PI),
        line((100.0, 320.0), (0.0, 320.0)),
    ])
    .unwrap()
}

#[test]
fn parent_pairs_report_stable_min_and_max_spacing_with_global_offsets() {
    let path = serpentine_with_eighty_and_one_twenty_mm_pairs();
    let parent_pairs = vec![
        ParentPair {
            first_primitive: 0,
            first_range: ParameterRange::FULL,
            second_primitive: 2,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        },
        ParentPair {
            first_primitive: 4,
            first_range: ParameterRange::FULL,
            second_primitive: 6,
            second_range: ParameterRange::FULL,
            first_winding: 2,
            second_winding: 3,
        },
    ];

    let result = spacing_extrema(&path, &parent_pairs, 0.1).unwrap();

    assert_abs_diff_eq!(result.min.distance_mm, 80.0, epsilon = 1e-9);
    assert_eq!(result.min.first_point, point(0.0, 0.0));
    assert_eq!(result.min.second_point, point(0.0, 80.0));
    assert_abs_diff_eq!(result.min.first_path_offset_mm, 0.0, epsilon = 1e-9);
    assert_abs_diff_eq!(
        result.min.second_path_offset_mm,
        100.0 + PI * 40.0 + 100.0,
        epsilon = 1e-9
    );

    assert_abs_diff_eq!(result.max.distance_mm, 120.0, epsilon = 1e-9);
    assert_eq!(result.max.first_point, point(0.0, 200.0));
    assert_eq!(result.max.second_point, point(0.0, 320.0));
    assert_abs_diff_eq!(
        result.max.first_path_offset_mm,
        100.0 + PI * 40.0 + 100.0 + PI * 60.0,
        epsilon = 1e-9
    );
    assert_abs_diff_eq!(
        result.max.second_path_offset_mm,
        100.0 + PI * 40.0 + 100.0 + PI * 60.0 + 100.0 + PI * 60.0 + 100.0,
        epsilon = 1e-9
    );
}

#[test]
fn diagnostics_only_consider_parent_pairs_not_leads_or_inner_turn() {
    let path = serpentine_with_eighty_and_one_twenty_mm_pairs();
    let parent_pairs = vec![ParentPair {
        first_primitive: 0,
        first_range: ParameterRange::FULL,
        second_primitive: 2,
        second_range: ParameterRange::FULL,
        first_winding: 0,
        second_winding: 1,
    }];

    let result = spacing_extrema(&path, &parent_pairs, 0.1).unwrap();

    assert_abs_diff_eq!(result.min.distance_mm, 80.0, epsilon = 1e-9);
    assert_abs_diff_eq!(result.max.distance_mm, 80.0, epsilon = 1e-9);
}

#[allow(dead_code)]
fn _spacing_type_is_public(_: SpacingExtrema) {}
