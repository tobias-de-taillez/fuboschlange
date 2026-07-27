use single_loop_solver::geometry::{ParameterRange, erode_for_centerline};
use single_loop_solver::input::validate_and_normalize;
use single_loop_solver::medial_axis::build_medial_graph;
use single_loop_solver::model::{ConnectionInput, PathPrimitive, Point, SolveSingleLoopInput};
use single_loop_solver::spiral::{
    AnchorKind, Direction, generate_all_cores, generate_core, perimeter_fraction_anchors,
    seam_anchors,
};
use single_loop_solver::validation::PrimitiveRole;
use single_loop_solver::wavefront::{
    WavefrontFamily, WavefrontFamilyKind, generate_wavefront_families,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn rectangular_fronts() -> WavefrontFamily {
    rectangular_family(WavefrontFamilyKind::Point)
}

fn rectangular_family(kind: WavefrontFamilyKind) -> WavefrontFamily {
    let width = 2_400.0;
    let height = 1_600.0;
    let spacing = 200.0;
    let normalized = validate_and_normalize(SolveSingleLoopInput {
        polygon: vec![
            point(0.0, 0.0),
            point(width, 0.0),
            point(width, height),
            point(0.0, height),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: width * 0.5,
        },
        requested_spacing_mm: spacing,
        wall_clearance_mm: 50.0,
    })
    .unwrap();
    let allowed = erode_for_centerline(&normalized).unwrap();
    let graph = build_medial_graph(&allowed, spacing).unwrap();
    generate_wavefront_families(&graph, &allowed, spacing, 1.0)
        .unwrap()
        .into_iter()
        .find(|family| family.kind == kind)
        .unwrap()
}

#[test]
fn seam_candidates_include_sixteen_fractions_and_event_wins_deduplication() {
    let family = rectangular_fronts();
    let fractions = perimeter_fraction_anchors(&family);
    assert_eq!(fractions.len(), 16);
    assert!(fractions.iter().enumerate().all(|(index, anchor)| {
        anchor.kind == AnchorKind::PerimeterFraction
            && anchor.anchor_order == index as u32
            && (anchor.perimeter_fraction - index as f64 / 16.0).abs() <= 1e-12
    }));

    let anchors = seam_anchors(&family);
    assert!(
        anchors
            .iter()
            .any(|anchor| anchor.kind == AnchorKind::Event)
    );
    assert!(anchors.iter().enumerate().all(|(index, anchor)| {
        anchors[..index]
            .iter()
            .all(|previous| (anchor.point - previous.point).norm() > 0.001)
    }));
    for event in anchors
        .iter()
        .filter(|anchor| anchor.kind == AnchorKind::Event)
    {
        assert!(!anchors.iter().any(|anchor| {
            anchor.kind == AnchorKind::PerimeterFraction
                && (anchor.point - event.point).norm() <= 0.001
        }));
    }
    assert_eq!(anchors, seam_anchors(&family));
}

#[test]
fn alternating_front_phases_form_one_in_and_one_out_arm() {
    let family = rectangular_fronts();
    let anchor = seam_anchors(&family)[0];
    let core = generate_core(&family, anchor, Direction::Ccw, 80.0)
        .next()
        .expect("rectangle should produce a rounded bifilar core");

    assert_eq!(core.connected_component_count(), 1);
    assert_eq!(core.provenance.inner_turn_count(), 1);
    assert!(core.provenance.inbound_windings_are_monotone());
    assert!(core.provenance.outbound_windings_are_monotone());
    assert!(core.provenance.parent_phases_alternate());
    assert!(
        core.provenance
            .roles
            .iter()
            .any(|role| matches!(role, PrimitiveRole::Inbound { winding: 0 }))
    );
    assert!(
        core.provenance
            .roles
            .iter()
            .any(|role| matches!(role, PrimitiveRole::Outbound { winding: 1 }))
    );
}

#[test]
fn core_is_open_g1_radius_compliant_and_has_complete_parent_ranges() {
    let family = rectangular_fronts();
    let anchor = seam_anchors(&family)[0];
    let core = generate_core(&family, anchor, Direction::Ccw, 80.0)
        .next()
        .unwrap();
    let primitives = core.path.primitives();

    assert_eq!(primitives.len(), core.provenance.roles.len());
    assert!(
        (primitives[0].point_at(0.0) - primitives.last().unwrap().point_at(1.0)).norm() > 0.001
    );
    assert!(primitives.windows(2).all(|pair| {
        (pair[0].point_at(1.0) - pair[1].point_at(0.0)).norm() <= 1e-6
            && (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-7
    }));
    assert!(primitives.iter().all(|primitive| match primitive {
        PathPrimitive::Line { .. } => true,
        PathPrimitive::Arc { radius_mm, .. } => *radius_mm >= 80.0,
    }));
    assert!((core.inbound_seam_pose.point - core.outbound_seam_pose.point).norm() > 50.0);

    for (primitive_index, role) in core.provenance.roles.iter().enumerate() {
        let (winding, inbound) = match role {
            PrimitiveRole::Inbound { winding } => (*winding, true),
            PrimitiveRole::Outbound { winding } => (*winding, false),
            PrimitiveRole::InnerTurn => continue,
            PrimitiveRole::StartLead | PrimitiveRole::EndLead => {
                panic!("core cannot contain leads")
            }
        };
        let mut ranges = core
            .parent_pairs
            .iter()
            .filter_map(|pair| {
                if inbound
                    && pair.first_primitive == primitive_index
                    && pair.first_winding == winding
                {
                    Some(pair.first_range)
                } else if !inbound
                    && pair.second_primitive == primitive_index
                    && pair.second_winding == winding
                {
                    Some(pair.second_range)
                } else {
                    None
                }
            })
            .collect::<Vec<ParameterRange>>();
        ranges.sort_by(|left, right| left.start.total_cmp(&right.start));
        assert!(!ranges.is_empty(), "winding {winding} must be paired");
        assert!(ranges[0].start <= 1e-12);
        assert!(ranges.last().unwrap().end >= 1.0 - 1e-12);
        assert!(ranges.windows(2).all(|pair| {
            pair[0].end <= pair[1].start + 1e-12 && (pair[0].end - pair[1].start).abs() <= 1e-12
        }));
    }
}

#[test]
fn opposite_parity_skeleton_family_preserves_one_interleaved_pair() {
    let family = rectangular_family(WavefrontFamilyKind::Skeleton);
    let cores = generate_all_cores(&family, 0, 80.0);
    assert!(!cores.is_empty());
    assert!(cores.iter().all(|core| {
        core.provenance.parent_phases_alternate()
            && core
                .provenance
                .roles
                .iter()
                .any(|role| matches!(role, PrimitiveRole::Inbound { winding: 0 }))
            && core
                .provenance
                .roles
                .iter()
                .any(|role| matches!(role, PrimitiveRole::Outbound { winding: 1 }))
    }));
}

#[test]
fn invalid_core_parameters_are_rejected_without_panicking() {
    let family = rectangular_fronts();
    let anchor = seam_anchors(&family)[0];
    assert!(
        generate_core(&family, anchor, Direction::Ccw, f64::NAN)
            .next()
            .is_none()
    );
    let mut invalid_anchor = anchor;
    invalid_anchor.perimeter_fraction = f64::NAN;
    assert!(
        generate_core(&family, invalid_anchor, Direction::Ccw, 80.0)
            .next()
            .is_none()
    );
}

#[test]
fn all_core_variants_have_stable_sorted_candidate_keys() {
    let family = rectangular_fronts();
    let first = generate_all_cores(&family, 3, 80.0);
    let second = generate_all_cores(&family, 3, 80.0);

    assert!(!first.is_empty());
    assert_eq!(
        first.iter().map(|core| core.key).collect::<Vec<_>>(),
        second.iter().map(|core| core.key).collect::<Vec<_>>()
    );
    assert!(first.windows(2).all(|pair| pair[0].key <= pair[1].key));
    assert!(
        first
            .iter()
            .any(|core| core.key.direction == Direction::Ccw)
    );
    assert!(first.iter().any(|core| core.key.direction == Direction::Cw));
    assert!(first.iter().zip(&second).all(|(left, right)| {
        left.path.primitives() == right.path.primitives()
            && left.provenance == right.provenance
            && left.parent_pairs == right.parent_pairs
    }));
    assert!(first.iter().all(|core| core.key.guide_factor_index == 3));
}
