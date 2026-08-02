use approx::assert_abs_diff_eq;
use proptest::prelude::*;
use single_loop_solver::geometry::{
    ClosestPair, Intersection, ParameterRange, primitive_distance, primitive_intersections,
};
use single_loop_solver::model::{PathPrimitive, Point};
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

fn arc_from_angles(
    center: (f64, f64),
    radius_mm: f64,
    start_angle: f64,
    sweep_rad: f64,
) -> PathPrimitive {
    let start = (
        center.0 + radius_mm * start_angle.cos(),
        center.1 + radius_mm * start_angle.sin(),
    );
    let end_angle = start_angle + sweep_rad;
    let end = (
        center.0 + radius_mm * end_angle.cos(),
        center.1 + radius_mm * end_angle.sin(),
    );
    arc(start, end, center, radius_mm, sweep_rad)
}

fn assert_points_close(
    actual: &[single_loop_solver::geometry::IntersectionPoint],
    expected: &[(f64, f64)],
) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "unexpected point count: {actual:?}"
    );
    for (actual, expected) in actual.iter().zip(expected) {
        assert_abs_diff_eq!(actual.point.x, expected.0, epsilon = 1e-9);
        assert_abs_diff_eq!(actual.point.y, expected.1, epsilon = 1e-9);
    }
}

fn assert_closest_pair_close(
    actual: &ClosestPair,
    expected_distance_mm: f64,
    expected_a: (f64, f64),
    expected_b: (f64, f64),
) {
    assert_abs_diff_eq!(actual.distance_mm, expected_distance_mm, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.point_on_a.x, expected_a.0, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.point_on_a.y, expected_a.1, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.point_on_b.x, expected_b.0, epsilon = 1e-9);
    assert_abs_diff_eq!(actual.point_on_b.y, expected_b.1, epsilon = 1e-9);
}

#[test]
fn line_line_crossing_returns_one_point() {
    let hit = primitive_intersections(
        &line((0.0, 0.0), (100.0, 100.0)),
        &line((0.0, 100.0), (100.0, 0.0)),
    );

    assert_points_close(hit.points(), &[(50.0, 50.0)]);
}

#[test]
fn near_parallel_line_crossing_is_not_dropped_by_absolute_epsilon() {
    let a = line((0.0, 0.0), (1.0, 1e-16));
    let b = line((0.0, 1e-16), (1.0, 0.0));

    let hit = primitive_intersections(&a, &b);
    assert_points_close(hit.points(), &[(0.5, 0.5e-16)]);

    let distance = primitive_distance(&a, ParameterRange::FULL, &b, ParameterRange::FULL);
    assert_eq!(distance.distance_mm, 0.0);
    assert_abs_diff_eq!(distance.a_t, 0.5, epsilon = 1e-15);
    assert_abs_diff_eq!(distance.b_t, 0.5, epsilon = 1e-15);
}

#[test]
fn line_line_collinear_overlap_returns_overlap() {
    let hit = primitive_intersections(
        &line((0.0, 0.0), (100.0, 0.0)),
        &line((25.0, 0.0), (75.0, 0.0)),
    );

    assert!(matches!(hit, Intersection::Overlap));
}

#[test]
fn line_line_micro_overlap_still_returns_overlap() {
    let hit = primitive_intersections(
        &line((1.0, 0.0), (0.0, 0.0)),
        &line((0.0000005, 0.0), (0.0, 0.0)),
    );

    assert!(matches!(hit, Intersection::Overlap));
}

#[test]
fn line_arc_crossing_returns_two_points() {
    let hit = primitive_intersections(
        &line((-100.0, 40.0), (100.0, 40.0)),
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
    );

    let x = (80.0_f64.powi(2) - 40.0_f64.powi(2)).sqrt();
    assert_points_close(hit.points(), &[(-x, 40.0), (x, 40.0)]);
}

#[test]
fn line_arc_tangent_returns_one_point() {
    let hit = primitive_intersections(
        &line((-100.0, 80.0), (100.0, 80.0)),
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
    );

    assert_points_close(hit.points(), &[(0.0, 80.0)]);
}

#[test]
fn line_arc_disjoint_returns_none() {
    let hit = primitive_intersections(
        &line((-100.0, 120.0), (100.0, 120.0)),
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
    );

    assert!(matches!(hit, Intersection::None));
}

#[test]
fn line_arc_near_tangent_disjoint_stays_disjoint() {
    let delta = 1e-10;
    let line = line((-1.0, 80.0 + delta), (1.0, 80.0 + delta));
    let arc = arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI);

    let hit = primitive_intersections(&line, &arc);
    assert!(matches!(hit, Intersection::None), "unexpected hit: {hit:?}");

    let result = primitive_distance(&line, ParameterRange::FULL, &arc, ParameterRange::FULL);
    assert_abs_diff_eq!(result.distance_mm, delta, epsilon = 1e-12);
    assert_abs_diff_eq!(result.point_on_a.x, 0.0, epsilon = 1e-12);
    assert_abs_diff_eq!(result.point_on_a.y, 80.0 + delta, epsilon = 1e-12);
    assert_abs_diff_eq!(result.point_on_b.x, 0.0, epsilon = 1e-12);
    assert_abs_diff_eq!(result.point_on_b.y, 80.0, epsilon = 1e-12);
}

#[test]
fn arc_arc_crossing_returns_two_points() {
    let hit = primitive_intersections(
        &arc_from_angles((0.0, 0.0), 80.0, -2.0 * PI / 3.0, 4.0 * PI / 3.0),
        &arc_from_angles((80.0, 0.0), 80.0, PI / 3.0, 4.0 * PI / 3.0),
    );

    let y = (80.0_f64.powi(2) - 40.0_f64.powi(2)).sqrt();
    assert_points_close(hit.points(), &[(40.0, -y), (40.0, y)]);
}

#[test]
fn arc_arc_tangent_returns_one_point() {
    let hit = primitive_intersections(
        &arc_from_angles((0.0, 0.0), 80.0, -PI / 2.0, PI),
        &arc_from_angles((160.0, 0.0), 80.0, PI / 2.0, PI),
    );

    assert_points_close(hit.points(), &[(80.0, 0.0)]);
}

#[test]
fn arc_arc_same_circle_overlap_returns_overlap() {
    let hit = primitive_intersections(
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
        &arc((0.0, 80.0), (0.0, -80.0), (0.0, 0.0), 80.0, PI),
    );

    assert!(matches!(hit, Intersection::Overlap));
}

#[test]
fn arc_arc_same_circle_micro_overlap_returns_overlap() {
    let hit = primitive_intersections(
        &arc_from_angles((0.0, 0.0), 80.0, 0.0, 0.75e-12),
        &arc_from_angles((0.0, 0.0), 80.0, 0.5e-12, 0.75e-12),
    );

    assert!(
        matches!(hit, Intersection::Overlap),
        "unexpected hit: {hit:?}"
    );
}

#[test]
fn arc_arc_same_circle_micro_gap_returns_none() {
    let hit = primitive_intersections(
        &arc_from_angles((0.0, 0.0), 80.0, 0.0, 1.0e-12),
        &arc_from_angles((0.0, 0.0), 80.0, 1.5e-12, 1.0e-12),
    );

    assert!(matches!(hit, Intersection::None), "unexpected hit: {hit:?}");
}

#[test]
fn same_circle_micro_gap_ranges_keep_positive_distance() {
    let arc = arc_from_angles((0.0, 0.0), 80.0, 0.0, 4.0e-12);
    let gap = 80.0 * 0.5e-12;

    let result = primitive_distance(
        &arc,
        ParameterRange::new(0.0, 0.25),
        &arc,
        ParameterRange::new(0.375, 0.625),
    );

    assert!(
        result.distance_mm > 0.0,
        "unexpected zero candidate: {result:?}"
    );
    assert_abs_diff_eq!(result.distance_mm, gap, epsilon = 1e-12);
}

#[test]
fn arc_arc_near_tangent_disjoint_stays_disjoint() {
    let gap = 1e-8;
    let a = arc_from_angles((0.0, 0.0), 80.0, -PI / 2.0, PI);
    let b = arc_from_angles((160.0 + gap, 0.0), 80.0, PI / 2.0, PI);

    let hit = primitive_intersections(&a, &b);
    assert!(matches!(hit, Intersection::None), "unexpected hit: {hit:?}");

    let result = primitive_distance(&a, ParameterRange::FULL, &b, ParameterRange::FULL);
    assert_abs_diff_eq!(result.distance_mm, gap, epsilon = 1e-10);
    assert_abs_diff_eq!(result.point_on_a.x, 80.0, epsilon = 1e-10);
    assert_abs_diff_eq!(result.point_on_a.y, 0.0, epsilon = 1e-10);
    assert_abs_diff_eq!(result.point_on_b.x, 80.0 + gap, epsilon = 1e-10);
    assert_abs_diff_eq!(result.point_on_b.y, 0.0, epsilon = 1e-10);
}

#[test]
fn near_coincident_distinct_arcs_keep_their_point_intersection() {
    let a = arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI);
    let b = arc(
        (80.0000005, 0.0),
        (-79.9999995, 0.0),
        (0.0000005, 0.0),
        80.0,
        PI,
    );
    let x = 0.00000025_f64;
    let y = (80.0_f64.powi(2) - x.powi(2)).sqrt();

    let hit = primitive_intersections(&a, &b);
    assert_points_close(hit.points(), &[(x, y)]);

    let result = primitive_distance(&a, ParameterRange::FULL, &b, ParameterRange::FULL);
    assert_closest_pair_close(&result, 0.0, (x, y), (x, y));
}

#[test]
fn arc_arc_concentric_distinct_radii_return_none() {
    let hit = primitive_intersections(
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
        &arc((100.0, 0.0), (-100.0, 0.0), (0.0, 0.0), 100.0, PI),
    );

    assert!(matches!(hit, Intersection::None));
}

#[test]
fn primitive_distance_returns_zero_for_intersection_inside_ranges() {
    let result = primitive_distance(
        &line((0.0, 0.0), (100.0, 100.0)),
        ParameterRange::new(0.0, 1.0),
        &line((0.0, 100.0), (100.0, 0.0)),
        ParameterRange::new(0.0, 1.0),
    );

    assert_closest_pair_close(&result, 0.0, (50.0, 50.0), (50.0, 50.0));
}

#[test]
fn constrained_distance_ignores_excluded_local_endpoint() {
    let result = primitive_distance(
        &line((0.0, 0.0), (100.0, 0.0)),
        ParameterRange::new(0.5, 1.0),
        &line((0.0, 10.0), (100.0, 10.0)),
        ParameterRange::new(0.0, 0.25),
    );

    assert_abs_diff_eq!(result.distance_mm, 25.0_f64.hypot(10.0), epsilon = 1e-9);
}

#[test]
fn constrained_distance_excludes_filtered_intersection() {
    let result = primitive_distance(
        &line((0.0, 0.0), (100.0, 100.0)),
        ParameterRange::new(0.0, 0.4),
        &line((0.0, 100.0), (100.0, 0.0)),
        ParameterRange::new(0.0, 0.4),
    );

    assert_closest_pair_close(&result, 20.0, (40.0, 40.0), (40.0, 60.0));
}

#[test]
fn line_arc_distance_uses_interior_normal_projection() {
    let result = primitive_distance(
        &line((-100.0, 120.0), (100.0, 120.0)),
        ParameterRange::new(0.0, 1.0),
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
        ParameterRange::new(0.0, 1.0),
    );

    assert_closest_pair_close(&result, 40.0, (0.0, 120.0), (0.0, 80.0));
}

#[test]
fn arc_arc_distance_uses_centre_line_radial_extrema() {
    let result = primitive_distance(
        &arc_from_angles((0.0, 0.0), 40.0, -PI / 2.0, PI),
        ParameterRange::new(0.0, 1.0),
        &arc_from_angles((120.0, 0.0), 40.0, PI / 2.0, PI),
        ParameterRange::new(0.0, 1.0),
    );

    assert_closest_pair_close(&result, 40.0, (40.0, 0.0), (80.0, 0.0));
}

#[test]
fn overlap_distance_uses_lexicographically_smallest_allowed_shared_point() {
    let result = primitive_distance(
        &arc_from_angles((0.0, 0.0), 80.0, PI / 4.0, 3.0 * PI / 2.0),
        ParameterRange::FULL,
        &arc_from_angles((0.0, 0.0), 80.0, 3.0 * PI / 4.0, PI / 2.0),
        ParameterRange::new(0.25, 0.75),
    );

    assert_closest_pair_close(&result, 0.0, (-80.0, 0.0), (-80.0, 0.0));
}

fn line_strategy() -> impl Strategy<Value = PathPrimitive> {
    (
        -120.0_f64..120.0_f64,
        -120.0_f64..120.0_f64,
        -120.0_f64..120.0_f64,
        -120.0_f64..120.0_f64,
    )
        .prop_filter("line must have non-zero length", |(x0, y0, x1, y1)| {
            (x1 - x0).hypot(y1 - y0) > 1.0
        })
        .prop_map(|(x0, y0, x1, y1)| line((x0, y0), (x1, y1)))
}

fn arc_strategy() -> impl Strategy<Value = PathPrimitive> {
    (
        -80.0_f64..80.0_f64,
        -80.0_f64..80.0_f64,
        10.0_f64..120.0_f64,
        -PI..PI,
        (-1.75 * PI)..(1.75 * PI),
    )
        .prop_filter(
            "arc sweep must stay away from zero",
            |(_, _, _, _, sweep)| sweep.abs() > 0.1,
        )
        .prop_map(|(cx, cy, radius_mm, start_angle, sweep_rad)| {
            arc_from_angles((cx, cy), radius_mm, start_angle, sweep_rad)
        })
}

fn primitive_strategy() -> impl Strategy<Value = PathPrimitive> {
    prop_oneof![line_strategy(), arc_strategy()]
}

fn range_strategy() -> impl Strategy<Value = ParameterRange> {
    (0.0..1.0_f64, 0.0..1.0_f64).prop_map(|(a, b)| ParameterRange::new(a.min(b), a.max(b)))
}

fn sample_distance(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> f64 {
    let mut best = f64::INFINITY;

    for i in 0..=2000 {
        let a_t = a_range.start + (a_range.end - a_range.start) * (i as f64 / 2000.0);
        let a_point = a.point_at(a_t);

        for j in 0..=2000 {
            let b_t = b_range.start + (b_range.end - b_range.start) * (j as f64 / 2000.0);
            let b_point = b.point_at(b_t);
            best = best.min((a_point.x - b_point.x).hypot(a_point.y - b_point.y));
        }
    }

    best
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(4))]

    #[test]
    fn analytic_distance_is_no_greater_than_dense_sampling(
        a in primitive_strategy(),
        a_range in range_strategy(),
        b in primitive_strategy(),
        b_range in range_strategy(),
    ) {
        let analytic = primitive_distance(&a, a_range, &b, b_range);
        let sampled = sample_distance(&a, a_range, &b, b_range);
        prop_assert!(analytic.distance_mm <= sampled + 1e-6,
            "analytic={} sampled={}\na={:?}\na_range={:?}\nb={:?}\nb_range={:?}",
            analytic.distance_mm,
            sampled,
            a,
            a_range,
            b,
            b_range,
        );
    }
}
