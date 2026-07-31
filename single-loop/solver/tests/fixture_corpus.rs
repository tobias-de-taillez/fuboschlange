use serde::Deserialize;
use single_loop_solver::model::{SolveResult, SolveSingleLoopInput};
use single_loop_solver::solver::solve_single_loop;
use std::{fs, path::PathBuf};

#[derive(Deserialize)]
struct Fixture {
    name: String,
    input: SolveSingleLoopInput,
    expected: Expected,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Expected {
    Success,
    Error { code: String },
}

#[test]
fn fixture_corpus_matches_invariants() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures");
    let mut paths = fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
        .collect::<Vec<_>>();
    paths.sort();
    for path in paths {
        let fixtures: Vec<Fixture> = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        for fixture in fixtures {
            let result = solve_single_loop(fixture.input);
            match (fixture.expected, result) {
                (Expected::Success, SolveResult::Success { plan }) => {
                    assert!(plan.total_length_mm <= 100000.0, "{}", fixture.name);
                    assert!(
                        plan.constraint_certificate
                            .min_bend_radius_mm
                            .lower_bound_mm
                            >= 80.0
                    );
                }
                (Expected::Error { code }, SolveResult::Error { error }) => assert_eq!(
                    serde_json::to_value(error.code).unwrap(),
                    serde_json::Value::String(code),
                    "{}",
                    fixture.name
                ),
                (_, other) => panic!("unexpected fixture result {}: {other:?}", fixture.name),
            }
        }
    }
}
