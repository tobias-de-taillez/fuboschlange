use crate::model::{SolverWarning, SolverWarningCode, WarningDetail};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SpacingProbe<T = f64> {
    Success(T),
    LengthOnly,
    GeometryFailure,
}

pub fn find_required_spacing<T>(
    requested_mm: f64,
    maximum_mm: f64,
    mut probe: impl FnMut(f64) -> SpacingProbe<T>,
) -> Option<T> {
    match probe(requested_mm) {
        SpacingProbe::Success(value) => return Some(value),
        SpacingProbe::GeometryFailure => return None,
        SpacingProbe::LengthOnly => {}
    }
    let mut grid = (requested_mm * 10.0).floor() / 10.0 + 0.1;
    while grid <= maximum_mm + 1e-12 {
        match probe(grid) {
            SpacingProbe::Success(value) => return Some(value),
            SpacingProbe::GeometryFailure => return None,
            SpacingProbe::LengthOnly => grid = ((grid * 10.0).round() + 1.0) / 10.0,
        }
    }
    None
}

pub fn spacing_warnings(requested: f64, actual: f64) -> Vec<SolverWarning> {
    let (Some(requested_detail), Some(actual_detail)) = (
        WarningDetail::number(requested),
        WarningDetail::number(actual),
    ) else {
        return Vec::new();
    };
    let mut warnings = Vec::new();
    if actual > requested {
        warnings.push(SolverWarning {
            code: SolverWarningCode::SpacingIncreased,
            details: BTreeMap::from([
                ("requestedSpacingMm".to_string(), requested_detail),
                ("actualSpacingMm".to_string(), actual_detail.clone()),
            ]),
        });
    }
    if actual > 250.0 {
        warnings.push(SolverWarning {
            code: SolverWarningCode::SpacingExceeds250Mm,
            details: BTreeMap::from([("actualSpacingMm".to_string(), actual_detail)]),
        });
    }
    warnings
}
