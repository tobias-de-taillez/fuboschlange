use single_loop_solver::geometry::{CanonicalPath, Polygon, canonicalize_path};
use single_loop_solver::model::{PathPrimitive, Point, SolverErrorCode};
use single_loop_solver::validation::{CoverageBounds, coverage_bounds};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn line(start: (f64, f64), end: (f64, f64)) -> PathPrimitive {
    PathPrimitive::Line {
        start: point(start.0, start.1),
        end: point(end.0, end.1),
    }
}

fn square(size: f64) -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(size, 0.0),
        point(size, size),
        point(0.0, size),
    ])
    .unwrap()
}

fn canonical(primitives: &[PathPrimitive]) -> CanonicalPath {
    canonicalize_path(primitives).unwrap()
}

#[test]
fn horizontal_diameter_of_square_has_fifty_mm_max_distance() {
    let polygon = square(100.0);
    let path = canonical(&[line((0.0, 50.0), (100.0, 50.0))]);
    let c = coverage_bounds(&polygon, &path, 0.1, 100_000).unwrap();

    assert!(c.lower_bound_mm <= 50.0);
    assert!(c.upper_bound_mm >= 50.0);
    assert!(c.upper_bound_mm - c.lower_bound_mm <= 0.1);
    assert_eq!(c.worst_point, point(0.0, 0.0));
}

#[test]
fn coverage_budget_stops_before_evaluating_excess_seed_triangle() {
    let polygon = Polygon::try_from_original(vec![
        point(0.0, 30.0),
        point(10.0, 10.0),
        point(30.0, 0.0),
        point(50.0, 10.0),
        point(60.0, 30.0),
        point(50.0, 50.0),
        point(30.0, 60.0),
        point(10.0, 50.0),
    ])
    .unwrap();
    let path = canonical(&[line((0.0, 30.0), (60.0, 30.0))]);

    let error = coverage_bounds(&polygon, &path, 0.1, 3).unwrap_err();

    assert_eq!(error.code, SolverErrorCode::SolverLimitExceeded);
    assert_eq!(error.details["reason"].as_str(), Some("MAX_COVERAGE_CELLS"));
    assert_eq!(error.details["limit"].as_number(), Some(3.0));
    assert_eq!(error.details["used"].as_number(), Some(3.0));
}

#[test]
fn coverage_budget_counts_both_evaluated_children() {
    let polygon = square(100.0);
    let path = canonical(&[line((0.0, 50.0), (100.0, 50.0))]);

    let error = coverage_bounds(&polygon, &path, 40.0, 4).unwrap_err();

    assert_eq!(error.code, SolverErrorCode::SolverLimitExceeded);
    assert_eq!(error.details["reason"].as_str(), Some("MAX_COVERAGE_CELLS"));
    assert_eq!(error.details["limit"].as_number(), Some(4.0));
    assert_eq!(error.details["used"].as_number(), Some(4.0));
}

#[test]
fn coverage_budget_is_deterministic_at_exact_cell_limit() {
    let polygon = square(1_000.0);
    let path = canonical(&[line((0.0, 500.0), (1_000.0, 500.0))]);

    let first = coverage_bounds(&polygon, &path, 1e-9, 12).unwrap_err();
    let second = coverage_bounds(&polygon, &path, 1e-9, 12).unwrap_err();

    assert_eq!(first, second);
    assert_eq!(first.code, SolverErrorCode::SolverLimitExceeded);
    assert_eq!(first.details["reason"].as_str(), Some("MAX_COVERAGE_CELLS"));
    assert_eq!(first.details["limit"].as_number(), Some(12.0));
    assert_eq!(first.details["used"].as_number(), Some(12.0));
}

#[allow(dead_code)]
fn _coverage_type_is_public(_: CoverageBounds) {}
