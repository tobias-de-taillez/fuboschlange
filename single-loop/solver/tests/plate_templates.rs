use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    Heading8, LocalPose, MotionTemplate, PlateProfile, PlateValidationFailureCode, TemplateId,
    TemplateTransform, certify_template,
};
use std::f64::consts::{FRAC_PI_2, PI};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

#[test]
fn profile_contains_straight_diagonal_and_documented_broad_turn_families() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let templates = profile.templates();
    let ids = templates
        .iter()
        .map(|template| template.id)
        .collect::<Vec<_>>();

    assert!(ids.contains(&TemplateId::Straight0));
    assert!(ids.contains(&TemplateId::Straight45));
    assert!(ids.contains(&TemplateId::BroadTurn45));
    assert!(ids.contains(&TemplateId::BroadTurn90));
    assert!(ids.contains(&TemplateId::BroadTurn135));
    assert!(ids.contains(&TemplateId::BroadReverse180));
    assert!(ids.contains(&TemplateId::TeardropReverse));
    assert!(
        templates
            .iter()
            .all(|template| certify_template(template, &profile).is_ok())
    );
}

#[test]
fn every_certified_template_matches_endpoint_poses_and_g1_joins() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    for template in profile.templates() {
        let certificate = certify_template(&template, &profile).unwrap();
        // Not `> 0.0`: `BroadTurn135` deliberately sits 9.8 micrometres inside
        // the forbidden disc, which `laying_tolerance_mm` admits. The exact
        // per-template values are pinned in
        // `certified_clearances_match_the_documented_geometry`.
        assert!(
            certificate.min_nopp_clearance_mm >= -profile.laying_tolerance_mm,
            "{:?}: clearance {} mm exceeds the laying tolerance",
            template.id,
            certificate.min_nopp_clearance_mm
        );
        assert!(certificate.min_bend_radius_mm >= 80.0);
        assert_eq!(
            template.primitives.first().unwrap().point_at(0.0),
            template.start.point
        );
        assert_eq!(
            template.primitives.last().unwrap().point_at(1.0),
            template.end.point
        );
        assert!(template.primitives.windows(2).all(|pair| {
            (pair[0].point_at(1.0) - pair[1].point_at(0.0)).norm() <= 1e-6
                && (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-7
        }));
        assert!(
            (template.primitives[0].start_tangent() - template.start.heading.direction()).norm()
                <= 1e-7
        );
        assert!(
            (template.primitives.last().unwrap().end_tangent() - template.end.heading.direction())
                .norm()
                <= 1e-7
        );
    }
}

#[test]
fn tight_handbook_turns_are_rejected_by_the_profile_certificate() {
    let tight_90 = MotionTemplate::new(
        TemplateId::HandbookRejectedTight90,
        LocalPose::new(point(0.0, -37.5), Heading8::Deg0),
        LocalPose::new(point(37.5, 0.0), Heading8::Deg90),
        vec![PathPrimitive::Arc {
            start: point(0.0, -37.5),
            end: point(37.5, 0.0),
            center: point(0.0, 0.0),
            radius_mm: 37.5,
            sweep_rad: FRAC_PI_2,
        }],
    );
    let tight_u = MotionTemplate::new(
        TemplateId::HandbookRejectedTightU,
        LocalPose::new(point(-37.5, 0.0), Heading8::Deg270),
        LocalPose::new(point(37.5, 0.0), Heading8::Deg90),
        vec![PathPrimitive::Arc {
            start: point(-37.5, 0.0),
            end: point(37.5, 0.0),
            center: point(0.0, 0.0),
            radius_mm: 37.5,
            sweep_rad: PI,
        }],
    );

    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert_eq!(
        certify_template(&tight_90, &profile).unwrap_err().code,
        PlateValidationFailureCode::BendRadiusTooSmall
    );
    assert_eq!(
        certify_template(&tight_u, &profile).unwrap_err().code,
        PlateValidationFailureCode::BendRadiusTooSmall
    );
}

#[test]
fn every_quarter_turn_reflection_and_period_translation_recertifies() {
    // Every template, not just one: `TemplateTransform::apply` negates
    // `sweep_rad` per primitive under reflection, and `TeardropReverse` is a
    // mixed-sign two-arc composite, which `BroadTurn90` alone would not
    // exercise. This holds because the nopp
    // checkerboard is invariant under the whole transform group: a period shift
    // moves the index by (2i, 2j), a quarter turn maps (i, j) -> (-j, i) and a
    // mirror maps it to (-i, j), all of which preserve `i + j` parity.
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    for template in profile.templates() {
        for reversed_path in [false, true] {
            for reflected in [false, true] {
                for quarter_turns in 0..4 {
                    let transform =
                        TemplateTransform::new(quarter_turns, reflected, reversed_path, -2, 3)
                            .unwrap();
                    let transformed = transform.apply(&template, profile.period_mm);
                    certify_template(&transformed, &profile).unwrap_or_else(|failure| {
                        panic!(
                            "{:?} does not recertify at quarter_turns={quarter_turns} \
                             reflected={reflected} reversed={reversed_path}: {failure:?}",
                            template.id
                        )
                    });
                }
            }
        }
    }
}

#[test]
fn reversal_is_an_exact_involution_that_preserves_the_certificate() {
    // The escalation condition for task 3c: if reversing a template changed any
    // certified quantity, the geometry would be direction-dependent somewhere.
    // It is not -- reversal keeps the point set, so clearance and bend radius
    // are bit-identical -- but it is certified independently rather than
    // assumed.
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    for template in profile.templates() {
        let forward = certify_template(&template, &profile).unwrap();
        let back = template.reversed();
        let backward = certify_template(&back, &profile).unwrap_or_else(|failure| {
            panic!("reversed {:?} does not certify: {failure:?}", template.id)
        });
        assert_eq!(
            forward.min_nopp_clearance_mm, backward.min_nopp_clearance_mm,
            "{:?}: reversal changed the nopp clearance",
            template.id
        );
        assert_eq!(
            forward.min_bend_radius_mm, backward.min_bend_radius_mm,
            "{:?}: reversal changed the bend radius",
            template.id
        );

        // Endpoints swap and both headings flip by 180 degrees.
        assert_eq!(back.start.point, template.end.point);
        assert_eq!(back.end.point, template.start.point);
        assert_eq!(
            back.start.heading,
            Heading8::from_octant(template.end.heading.octant() + 4)
        );
        assert_eq!(
            back.end.heading,
            Heading8::from_octant(template.start.heading.octant() + 4)
        );

        // ...and reversing twice is the identity.
        assert_eq!(back.reversed(), template);
    }
}

#[test]
fn template_catalogue_serialization_is_byte_deterministic() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let first = serde_json::to_vec(&profile.templates()).unwrap();
    let second = serde_json::to_vec(&profile.templates()).unwrap();
    assert_eq!(first, second);
}

/// Hand-written per-heading residue sets, transcribed from the lattice table in
/// `src/plate/template.rs` -- deliberately not recomputed with any production
/// helper, so this test fails if the catalogue and that table ever disagree.
fn expected_residues(heading: Heading8) -> [(f64, f64); 2] {
    match heading {
        Heading8::Deg0 | Heading8::Deg180 => [(0.0, 37.5), (0.0, 112.5)],
        Heading8::Deg90 | Heading8::Deg270 => [(37.5, 0.0), (112.5, 0.0)],
        Heading8::Deg45 => [(0.0, 37.5), (37.5, 0.0)],
        Heading8::Deg135 => [(0.0, 37.5), (112.5, 0.0)],
        Heading8::Deg225 => [(0.0, 112.5), (112.5, 0.0)],
        Heading8::Deg315 => [(37.5, 0.0), (0.0, 112.5)],
    }
}

/// The same table for the reversed catalogue, hand-written rather than computed
/// from `expected_residues`, so a transcription error in one cannot hide in the
/// other. Reversal keeps each endpoint where it is and turns its heading by
/// 180 degrees, so these are the forward classes of the opposite heading;
/// `the_reversed_residue_table_is_the_forward_table_turned_180_degrees` pins
/// exactly that relationship.
fn expected_reversed_residues(heading: Heading8) -> [(f64, f64); 2] {
    match heading {
        // Axial classes are already 180-degree symmetric.
        Heading8::Deg0 | Heading8::Deg180 => [(0.0, 37.5), (0.0, 112.5)],
        Heading8::Deg90 | Heading8::Deg270 => [(37.5, 0.0), (112.5, 0.0)],
        // Diagonal classes are not -- every one of these four is new.
        Heading8::Deg45 => [(0.0, 112.5), (112.5, 0.0)],
        Heading8::Deg135 => [(37.5, 0.0), (0.0, 112.5)],
        Heading8::Deg225 => [(0.0, 37.5), (37.5, 0.0)],
        Heading8::Deg315 => [(0.0, 37.5), (112.5, 0.0)],
    }
}

fn residue(point: Point) -> (f64, f64) {
    (point.x.rem_euclid(150.0), point.y.rem_euclid(150.0))
}

fn on_lattice(residue: (f64, f64), allowed: [(f64, f64); 2]) -> bool {
    allowed
        .iter()
        .any(|(x, y)| (residue.0 - x).abs() < 1e-9 && (residue.1 - y).abs() < 1e-9)
}

#[test]
fn both_endpoints_of_every_template_sit_on_the_shared_anchor_lattice() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let templates = profile.templates();
    assert_eq!(templates.len(), 7, "catalogue size changed; update this test");

    for template in templates {
        for (reversed, subject) in [(false, template.clone()), (true, template.reversed())] {
            for (label, pose) in [("start", subject.start), ("end", subject.end)] {
                let residue = residue(pose.point);
                let allowed = if reversed {
                    expected_reversed_residues(pose.heading)
                } else {
                    expected_residues(pose.heading)
                };
                assert!(
                    on_lattice(residue, allowed),
                    "{:?}{} {label} pose {:?} at ({}, {}) has residue ({}, {}) mod 150, which is \
                     not on the anchor lattice for that heading (allowed: {allowed:?}) -- it \
                     cannot chain with a straight run",
                    subject.id,
                    if reversed { " reversed" } else { "" },
                    pose.heading,
                    pose.point.x,
                    pose.point.y,
                    residue.0,
                    residue.1
                );
            }
        }
    }
}

#[test]
fn the_reversed_residue_table_is_the_forward_table_turned_180_degrees() {
    // Pins the derivation, so the two hand-written tables cannot drift apart.
    for heading in Heading8::ALL {
        let opposite = Heading8::from_octant(heading.octant() + 4);
        let mut reversed = expected_reversed_residues(heading);
        let mut forward = expected_residues(opposite);
        let order = |set: &mut [(f64, f64); 2]| {
            set.sort_by(|a, b| a.partial_cmp(b).unwrap());
        };
        order(&mut reversed);
        order(&mut forward);
        assert_eq!(
            reversed, forward,
            "reversed residues for {heading:?} should be the forward residues for {opposite:?}"
        );
    }

    // ...and two concrete reversed templates that the forward table alone would
    // have called impossible. Straight45 runs (0,37.5)Deg45 -> (150,187.5)Deg45;
    // reversed it starts at (150,187.5) -- residue (0,37.5) -- heading Deg225,
    // which the forward table restricts to (0,112.5)/(112.5,0). BroadTurn135
    // ends at (150,187.5) Deg135; reversed that becomes a Deg315 start on the
    // same residue, likewise absent from the forward Deg315 class.
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let find = |id: TemplateId| {
        profile
            .templates()
            .into_iter()
            .find(|template| template.id == id)
            .unwrap()
    };
    for (id, heading) in [
        (TemplateId::Straight45, Heading8::Deg225),
        (TemplateId::BroadTurn135, Heading8::Deg315),
    ] {
        let reversed = find(id).reversed();
        assert_eq!(reversed.start.point, point(150.0, 187.5));
        assert_eq!(reversed.start.heading, heading);
        assert_eq!(residue(reversed.start.point), (0.0, 37.5));
        assert!(
            !on_lattice((0.0, 37.5), expected_residues(heading)),
            "{heading:?} at (0,37.5) should be absent from the forward table"
        );
        assert!(
            on_lattice((0.0, 37.5), expected_reversed_residues(heading)),
            "{heading:?} at (0,37.5) should be present in the reversed table"
        );
    }
}

#[test]
fn certified_clearances_match_the_documented_geometry() {
    // Pins both the geometry and the laying-tolerance decision: `BroadTurn135`
    // is the direct 135-degree elbow and is *negative* by 9.8 micrometres, which
    // only certifies because `laying_tolerance_mm` admits it. If someone raises
    // the radius, shifts a parity or drops the tolerance, one of these moves.
    let expected = [
        (TemplateId::Straight0, 11.5000),
        (TemplateId::Straight45, 0.5165),
        (TemplateId::BroadTurn45, 0.5165),
        (TemplateId::BroadTurn90, 0.8959),
        (TemplateId::BroadTurn135, -0.0098),
        (TemplateId::BroadReverse180, 0.8959),
        (TemplateId::TeardropReverse, 4.3211),
    ];
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    for (id, want) in expected {
        let template = profile
            .templates()
            .into_iter()
            .find(|template| template.id == id)
            .unwrap_or_else(|| panic!("{id:?} missing from the catalogue"));
        let certificate = certify_template(&template, &profile).unwrap();
        let got = certificate.min_nopp_clearance_mm;
        assert!(
            (got - want).abs() < 1e-3,
            "{id:?}: certified clearance {got:.4} mm, expected {want:.4} mm"
        );
        assert!(
            got >= -profile.laying_tolerance_mm,
            "{id:?}: clearance {got:.4} mm is outside the laying tolerance"
        );
    }
}

#[test]
fn the_laying_tolerance_is_a_bound_not_a_floor() {
    // The clearance table asserts every catalogue template is *within* the
    // tolerance; this asserts the tolerance still rejects something. Two
    // synthetic probes straddling the bound: a straight run parallel to the
    // nopp row at (0,0), whose forbidden radius is 26.0 mm as a large nopp.
    // (The TemplateId is inert here -- `certify_template` only reads geometry --
    // so these reuse a rejected-handbook id rather than growing the enum.)
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert_eq!(profile.laying_tolerance_mm, 0.1);

    let probe = |offset_mm: f64| {
        let start = point(-50.0, offset_mm);
        let end = point(50.0, offset_mm);
        MotionTemplate::new(
            TemplateId::HandbookRejectedTight90,
            LocalPose::new(start, Heading8::Deg0),
            LocalPose::new(end, Heading8::Deg0),
            vec![PathPrimitive::Line { start, end }],
        )
    };

    // 0.05 mm inside the disc: within tolerance, certified, and the certificate
    // reports the true negative clearance rather than clamping it to zero.
    let inside = certify_template(&probe(25.95), &profile).unwrap();
    assert!(
        (inside.min_nopp_clearance_mm - -0.05).abs() < 1e-9,
        "expected a reported clearance of -0.05 mm, got {}",
        inside.min_nopp_clearance_mm
    );

    // 0.2 mm inside: past the tolerance, still a hard collision.
    let outside = certify_template(&probe(25.8), &profile).unwrap_err();
    assert_eq!(outside.code, PlateValidationFailureCode::NoppCollision);
    assert_eq!(outside.witness, Some(point(0.0, 0.0)));
}
