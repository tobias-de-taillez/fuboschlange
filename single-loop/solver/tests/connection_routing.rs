use single_loop_solver::geometry::{ParameterRange, canonicalize_path, erode_for_centerline};
use single_loop_solver::input::validate_and_normalize;
use single_loop_solver::model::{ConnectionInput, PathPrimitive, Point, SolveSingleLoopInput};
use single_loop_solver::routing::{
    PortAssignment, RouteBudget, RoutingError, RoutingFixture, ZonePhase, pose_transitions,
    route_lead_pair,
};
use single_loop_solver::spiral::{
    AnchorKind, CandidateKey as SpiralCandidateKey, Direction, Pose, SpiralCoreCandidate,
    SpiralProvenance, biarc_candidates,
};
use single_loop_solver::validation::{ParentPair, PrimitiveRole, ValidationContext};
use std::f64::consts::PI;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn line(start: Point, end: Point) -> PathPrimitive {
    PathPrimitive::Line { start, end }
}

fn fixture() -> RoutingFixture {
    let raw = SolveSingleLoopInput {
        polygon: vec![
            point(0.0, 0.0),
            point(600.0, 0.0),
            point(600.0, 600.0),
            point(0.0, 600.0),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 300.0,
        },
        requested_spacing_mm: 120.0,
        wall_clearance_mm: 20.0,
    };
    let normalized = validate_and_normalize(raw).unwrap();
    let allowed_region = erode_for_centerline(&normalized).unwrap();
    let context = ValidationContext {
        polygon: normalized.polygon.clone(),
        allowed_region,
    };

    let lead_radius = 160.0;
    let seam_in = point(
        normalized.connection.start_port.x - lead_radius + lead_radius * (PI / 6.0).cos(),
        lead_radius * (PI / 6.0).sin(),
    );
    let seam_out = point(
        normalized.connection.end_port.x + lead_radius - lead_radius * (PI / 6.0).cos(),
        lead_radius * (PI / 6.0).sin(),
    );
    let inbound_pose = Pose::from_heading(seam_in, 2.0 * PI / 3.0).unwrap();
    let outbound_pose = Pose::from_heading(seam_out, 4.0 * PI / 3.0).unwrap();
    let turn_start = seam_in + inbound_pose.tangent * 120.0;
    let turn_end = seam_out - outbound_pose.tangent * 120.0;
    let turn = biarc_candidates(
        Pose::new(turn_start, inbound_pose.tangent).unwrap(),
        Pose::new(turn_end, outbound_pose.tangent).unwrap(),
        80.0,
    )
    .into_iter()
    .min_by(|left, right| {
        left.iter()
            .map(PathPrimitive::length)
            .sum::<f64>()
            .total_cmp(&right.iter().map(PathPrimitive::length).sum::<f64>())
    })
    .unwrap();
    let primitives = vec![
        line(seam_in, turn_start),
        turn[0].clone(),
        turn[1].clone(),
        line(turn_end, seam_out),
    ];
    let path = canonicalize_path(&primitives).unwrap();
    let mut core_roles = vec![PrimitiveRole::Inbound { winding: 0 }];
    core_roles.extend((1..path.primitives().len() - 1).map(|_| PrimitiveRole::InnerTurn));
    core_roles.push(PrimitiveRole::Outbound { winding: 1 });
    let outbound_primitive = path.primitives().len() - 1;
    let core = SpiralCoreCandidate {
        inbound_seam_pose: inbound_pose,
        outbound_seam_pose: outbound_pose,
        path,
        provenance: SpiralProvenance { roles: core_roles },
        parent_pairs: vec![ParentPair {
            first_primitive: 0,
            first_range: ParameterRange::FULL,
            second_primitive: outbound_primitive,
            second_range: ParameterRange::FULL,
            first_winding: 0,
            second_winding: 1,
        }],
        key: SpiralCandidateKey {
            family: 0,
            guide_factor_index: 0,
            direction: Direction::Ccw,
            anchor_kind: AnchorKind::Event,
            anchor_order: 0,
            turn_variant: 0,
        },
    };
    RoutingFixture::new(normalized.connection, context, core, 120.0)
}

#[test]
fn pose_transitions_are_exact_g1_and_radius_compliant() {
    let fixture = fixture();
    let start = Pose::new(
        fixture.connection.start_port,
        fixture.connection.inward_normal,
    )
    .unwrap();
    let transitions = pose_transitions(start, fixture.core.inbound_seam_pose, 80.0);
    assert!(!transitions.is_empty());
    for transition in transitions {
        assert!(
            transition
                .primitives
                .windows(2)
                .all(|pair| { (pair[0].end_tangent() - pair[1].start_tangent()).norm() <= 1e-7 })
        );
        assert!(
            transition
                .primitives
                .iter()
                .all(|primitive| match primitive {
                    PathPrimitive::Line { .. } => true,
                    PathPrimitive::Arc { radius_mm, .. } => *radius_mm >= 80.0,
                })
        );
    }
}

#[test]
fn routed_pair_starts_orthogonally_and_has_monotone_zone_phases() {
    let fixture = fixture();
    let routed = route_lead_pair(
        &fixture,
        PortAssignment::FirstStarts,
        RouteBudget::new(5_000_000),
    )
    .unwrap();
    let primitives = routed.candidate.path.primitives();
    assert!(matches!(primitives[0], PathPrimitive::Arc { .. }));
    assert!((primitives[0].start_tangent() - fixture.connection.inward_normal).norm() <= 1e-7);
    assert!(
        (primitives.last().unwrap().end_tangent() + fixture.connection.inward_normal).norm()
            <= 1e-7
    );
    assert!(
        routed
            .zone_phases
            .windows(2)
            .all(|pair| { !matches!(pair, [ZonePhase::Inside, ZonePhase::NearWall]) })
    );
    assert!(routed.report.min_bend_radius.lower_bound_mm >= 80.0);
}

#[test]
fn both_port_assignments_and_results_are_deterministic() {
    let fixture = fixture();
    let mut successful_assignments = 0;
    for assignment in [PortAssignment::FirstStarts, PortAssignment::SecondStarts] {
        let first = route_lead_pair(&fixture, assignment, RouteBudget::new(5_000_000));
        let second = route_lead_pair(&fixture, assignment, RouteBudget::new(5_000_000));
        match (first, second) {
            (Ok(first), Ok(second)) => {
                successful_assignments += 1;
                assert_eq!(
                    first.candidate.path.primitives(),
                    second.candidate.path.primitives()
                );
                assert_eq!(first.expansion_count, second.expansion_count);
            }
            (Err(first), Err(second)) => assert_eq!(first, second),
            _ => panic!("routing outcome must be deterministic"),
        }
    }
    assert!(successful_assignments >= 1);
}

#[test]
fn pose_budget_fails_on_the_first_excess_pop() {
    let error =
        route_lead_pair(&fixture(), PortAssignment::FirstStarts, RouteBudget::new(0)).unwrap_err();
    assert_eq!(
        error,
        RoutingError::SolverLimitExceeded {
            attempted_expansion: 1,
            limit: 0,
        }
    );
}
