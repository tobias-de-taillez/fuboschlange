use single_loop_solver::model::SolverWarningCode;
use single_loop_solver::search::{SpacingProbe, find_required_spacing, spacing_warnings};

#[test]
fn requested_spacing_wins_without_evaluating_larger_spacing() {
    let mut seen = Vec::new();
    let result = find_required_spacing(150.0, 151.0, |spacing| {
        seen.push(spacing);
        SpacingProbe::Success(spacing)
    })
    .unwrap();
    assert_eq!(seen, vec![150.0]);
    assert_eq!(result, 150.0);
}

#[test]
fn only_length_failure_escalates_on_the_point_one_mm_grid() {
    let mut seen = Vec::new();
    let result = find_required_spacing(150.04, 150.4, |spacing| {
        seen.push(spacing);
        if spacing < 150.2 {
            SpacingProbe::LengthOnly
        } else {
            SpacingProbe::Success(spacing)
        }
    })
    .unwrap();
    assert_eq!(seen, vec![150.04, 150.1, 150.2]);
    assert_eq!(result, 150.2);
}

#[test]
fn geometry_failure_never_increases_spacing() {
    let mut calls = 0;
    assert!(
        find_required_spacing(150.0, 200.0, |_| {
            calls += 1;
            SpacingProbe::<f64>::GeometryFailure
        })
        .is_none()
    );
    assert_eq!(calls, 1);
}

#[test]
fn spacing_warning_order_is_stable() {
    let warnings = spacing_warnings(150.0, 250.1);
    assert_eq!(
        warnings
            .iter()
            .map(|warning| warning.code.clone())
            .collect::<Vec<_>>(),
        vec![
            SolverWarningCode::SpacingIncreased,
            SolverWarningCode::SpacingExceeds250Mm
        ]
    );
}
