pub mod circuit;
pub mod constants;
pub mod geometry;
pub mod input;
pub mod medial_axis;
pub mod model;
pub mod plate;
pub mod routing;
pub mod search;
pub mod solver;
pub mod spiral;
pub mod validation;
pub mod wavefront;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = buildPlateModel)]
pub fn build_plate_model_wasm(input: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input = serde_wasm_bindgen::from_value(input)
        .map_err(|error| JsValue::from_str(&format!("invalid PlateModelInput: {error}")))?;
    serde_wasm_bindgen::to_value(&plate::build_plate_model(input))
        .map_err(|error| JsValue::from_str(&format!("cannot serialize PlateModelResult: {error}")))
}

#[wasm_bindgen(js_name = solveSingleLoop)]
pub fn solve_single_loop_wasm(input: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input = serde_wasm_bindgen::from_value(input)
        .map_err(|error| JsValue::from_str(&format!("invalid SolveSingleLoopInput: {error}")))?;
    serde_wasm_bindgen::to_value(&solver::solve_single_loop(input))
        .map_err(|error| JsValue::from_str(&format!("cannot serialize SolveResult: {error}")))
}

#[wasm_bindgen(js_name = solveSingleLoopWithProgress)]
pub fn solve_single_loop_with_progress_wasm(
    input: JsValue,
    callback: js_sys::Function,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input = serde_wasm_bindgen::from_value(input)
        .map_err(|error| JsValue::from_str(&format!("invalid SolveSingleLoopInput: {error}")))?;
    let result = solver::solve_single_loop_with_progress(input, |phase| {
        let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(phase.as_wire_str()));
    });
    serde_wasm_bindgen::to_value(&result)
        .map_err(|error| JsValue::from_str(&format!("cannot serialize SolveResult: {error}")))
}
