use serde::Deserialize;
use single_loop_solver::plate::{
    MotionTemplate, PlateProfile, PlateValidationFailureCode, certify_template,
};
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
enum Classification {
    #[serde(rename = "ACCEPTED")]
    Accepted,
    #[serde(rename = "REJECTED")]
    Rejected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GoldenFixture {
    source: String,
    expected_classification: Classification,
    #[serde(default)]
    expected_rejection_code: Option<PlateValidationFailureCode>,
    profile_version: String,
    template: MotionTemplate,
}

const REQUIRED_FIXTURES: [&str; 4] = [
    "handbook-allowed-90.json",
    "handbook-allowed-teardrop.json",
    "handbook-rejected-tight-90.json",
    "handbook-rejected-tight-u.json",
];

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/plate")
}

#[test]
fn golden_handbook_fixtures_certify_to_their_documented_classification() {
    let dir = fixture_dir();
    let mut names = fs::read_dir(&dir)
        .unwrap_or_else(|error| panic!("missing fixture directory {}: {error}", dir.display()))
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name.ends_with(".json"))
        .collect::<Vec<_>>();
    names.sort();
    for required in REQUIRED_FIXTURES {
        assert!(
            names.iter().any(|name| name == required),
            "missing golden fixture {required}"
        );
    }

    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let catalogue = profile.templates();
    for name in names {
        let raw = fs::read_to_string(dir.join(&name))
            .unwrap_or_else(|error| panic!("{name}: unreadable fixture: {error}"));
        let fixture: GoldenFixture = serde_json::from_str(&raw)
            .unwrap_or_else(|error| panic!("{name}: invalid fixture JSON: {error}"));
        assert!(
            !fixture.source.trim().is_empty(),
            "{name}: fixture must cite its manufacturer source"
        );
        assert_eq!(
            fixture.profile_version, profile.version,
            "{name}: fixture profile version does not match the certified profile"
        );

        match certify_template(&fixture.template, &profile) {
            Ok(certificate) => {
                assert_eq!(
                    fixture.expected_classification,
                    Classification::Accepted,
                    "{name}: certified although the handbook rejects it"
                );
                assert!(certificate.min_bend_radius_mm >= 80.0, "{name}");
                assert!(certificate.min_nopp_clearance_mm > 0.0, "{name}");
                let canonical = catalogue
                    .iter()
                    .find(|template| template.id == fixture.template.id)
                    .unwrap_or_else(|| panic!("{name}: accepted template missing from catalogue"));
                assert_eq!(
                    canonical, &fixture.template,
                    "{name}: fixture drifted from the canonical catalogue template"
                );
            }
            Err(failure) => {
                assert_eq!(
                    fixture.expected_classification,
                    Classification::Rejected,
                    "{name}: rejected although the handbook allows it: {failure:?}"
                );
                assert_eq!(
                    Some(failure.code),
                    fixture.expected_rejection_code,
                    "{name}: rejection code mismatch"
                );
            }
        }
    }
}
