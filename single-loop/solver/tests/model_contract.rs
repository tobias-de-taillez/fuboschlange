use serde_json::{json, Map, Value};
use single_loop_solver::model::{
    ConstraintCertificate, ConstraintCoverageMm, CoverageOutput, LocatedSpacing, MinBendRadiusMm,
    MinNonlocalSpacingMm, MinWallClearanceMm, NormalizedConnectionOutput, PathPrimitive, Point,
    SingleLoopPlan, SolveResult, SolverError, SolverErrorCode, SolverWarning, SolverWarningCode,
    SpacingDeviations, TotalLengthMm,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn sample_plan_coverage() -> CoverageOutput {
    CoverageOutput {
        max_distance_mm: 0.25,
        lower_bound_mm: 78.0,
        upper_bound_mm: 82.0,
        error_bound_mm: 0.1,
        worst_point: point(1.0, 2.0),
    }
}

fn sample_certificate_coverage() -> ConstraintCoverageMm {
    ConstraintCoverageMm {
        lower_bound_mm: 78.0,
        upper_bound_mm: 82.0,
        error_bound_mm: 0.1,
        worst_point: point(1.0, 2.0),
    }
}

fn sample_certificate_coverage_json() -> Value {
    json!({
        "lowerBoundMm": 78.0,
        "upperBoundMm": 82.0,
        "errorBoundMm": 0.1,
        "worstPoint": { "x": 1.0, "y": 2.0 }
    })
}

fn sample_constraint_certificate() -> ConstraintCertificate {
    ConstraintCertificate {
        inside_polygon: true,
        g1_continuous: true,
        self_intersection_count: 0,
        connection_zone_compliant: true,
        bifilar_topology: true,
        min_bend_radius_mm: MinBendRadiusMm {
            lower_bound_mm: 80.0,
            primitive_index: 0,
            point: point(0.0, 0.0),
        },
        min_wall_clearance_mm: MinWallClearanceMm {
            lower_bound_mm: 8.0,
            point_on_pipe: point(1.0, 0.0),
            point_on_wall: point(1.0, 8.0),
        },
        min_nonlocal_spacing_mm: MinNonlocalSpacingMm {
            lower_bound_mm: 50.0,
            first_point: point(2.0, 0.0),
            second_point: point(2.0, 50.0),
        },
        total_length_mm: TotalLengthMm {
            upper_bound_mm: 123.0,
            limit_mm: 100_000,
        },
        coverage_mm: sample_certificate_coverage(),
        numeric_tolerance_mm: 0.01,
    }
}

fn sample_spacing() -> LocatedSpacing {
    LocatedSpacing {
        distance_mm: 12.5,
        first_point: point(3.0, 4.0),
        second_point: point(5.0, 6.0),
        first_path_offset_mm: 11.0,
        second_path_offset_mm: 12.0,
    }
}

fn sample_plan() -> SingleLoopPlan {
    SingleLoopPlan {
        solver_version: "2026.07.26".to_owned(),
        request_hash: "abc123".to_owned(),
        path: vec![PathPrimitive::Line {
            start: point(0.0, 0.0),
            end: point(10.0, 0.0),
        }],
        normalized_connection: NormalizedConnectionOutput {
            edge_index: 2,
            requested_center_offset_mm: 15.0,
            actual_center_offset_mm: 15.0,
            shifted_by_mm: 0.0,
            center: point(5.0, 5.0),
            first_port: point(4.0, 5.0),
            second_port: point(6.0, 5.0),
            start_port: point(4.0, 5.0),
            end_port: point(6.0, 5.0),
        },
        requested_spacing_mm: 50.0,
        actual_spacing_mm: 50.0,
        total_length_mm: 123.0,
        coverage: sample_plan_coverage(),
        spacing_deviations: SpacingDeviations {
            min: sample_spacing(),
            max: LocatedSpacing {
                distance_mm: 13.5,
                first_point: point(7.0, 8.0),
                second_point: point(9.0, 10.0),
                first_path_offset_mm: 13.0,
                second_path_offset_mm: 14.0,
            },
        },
        warnings: vec![SolverWarning {
            code: SolverWarningCode::SpacingIncreased,
            details: Map::new(),
        }],
        constraint_certificate: sample_constraint_certificate(),
    }
}

fn sample_error() -> SolverError {
    let mut details = Map::new();
    details.insert("attempts".to_owned(), Value::from(3));
    details.insert("fatal".to_owned(), Value::from(false));

    SolverError {
        code: SolverErrorCode::NoSolutionGeometry,
        message: "no solution geometry".to_owned(),
        details,
    }
}

#[test]
fn serializes_constraint_certificate_coverage_without_max_distance_mm() {
    let json = serde_json::to_value(sample_constraint_certificate()).unwrap();
    assert_eq!(json["coverageMm"], sample_certificate_coverage_json());
}

#[test]
fn serializes_solve_result_success_with_ok_true() {
    let json = serde_json::to_value(SolveResult::Success {
        plan: sample_plan(),
    })
    .unwrap();

    assert_eq!(json["ok"], Value::Bool(true));
    assert_eq!(json["plan"]["solverVersion"], "2026.07.26");
}

#[test]
fn serializes_solve_result_error_with_ok_false() {
    let json = serde_json::to_value(SolveResult::Error {
        error: sample_error(),
    })
    .unwrap();

    assert_eq!(json["ok"], Value::Bool(false));
    assert_eq!(json["error"]["code"], "NO_SOLUTION_GEOMETRY");
    assert_eq!(json["error"]["details"]["fatal"], Value::Bool(false));
}

#[test]
fn rejects_contradictory_solve_result_boolean_flags() {
    let contradictory_success = json!({
        "ok": false,
        "plan": sample_plan(),
    });
    let contradictory_error = json!({
        "ok": true,
        "error": sample_error(),
    });

    assert!(serde_json::from_value::<SolveResult>(contradictory_success).is_err());
    assert!(serde_json::from_value::<SolveResult>(contradictory_error).is_err());
}
