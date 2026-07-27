use approx::assert_abs_diff_eq;
use single_loop_solver::geometry::{Vec2, canonicalize_path};
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::spiral::{
    InnerTurnKind, Pose, biarc_candidates, inner_turn_candidates, semicircle_turn,
};
use std::f64::consts::PI;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn pose(x: f64, y: f64, heading: f64) -> Pose {
    Pose::new(point(x, y), Vec2::from_angle(heading)).unwrap()
}

fn assert_pose_residuals(candidate: &[PathPrimitive; 2], start: Pose, end: Pose) {
    let first_start = candidate[0].point_at(0.0);
    let second_end = candidate[1].point_at(1.0);
    assert_abs_diff_eq!(first_start.x, start.point.x, epsilon = 1e-7);
    assert_abs_diff_eq!(first_start.y, start.point.y, epsilon = 1e-7);
    assert_abs_diff_eq!(second_end.x, end.point.x, epsilon = 1e-7);
    assert_abs_diff_eq!(second_end.y, end.point.y, epsilon = 1e-7);
    assert!((candidate[0].start_tangent() - start.tangent).norm() <= 1e-7);
    assert!((candidate[1].end_tangent() - end.tangent).norm() <= 1e-7);
    assert!((candidate[0].end_tangent() - candidate[1].start_tangent()).norm() <= 1e-7);
}

#[test]
fn parallel_opposite_poses_need_at_least_160_mm_for_semicircle() {
    let start = pose(0.0, 0.0, 0.0);
    assert!(semicircle_turn(start, pose(0.0, 159.99, PI), 80.0).is_none());

    let arc = semicircle_turn(start, pose(0.0, 160.0, PI), 80.0).unwrap();
    let PathPrimitive::Arc {
        radius_mm,
        sweep_rad,
        ..
    } = arc
    else {
        panic!("semicircle must be one exact arc");
    };
    assert_abs_diff_eq!(radius_mm, 80.0, epsilon = 1e-9);
    assert_abs_diff_eq!(sweep_rad.abs(), PI, epsilon = 1e-12);
}

#[test]
fn off_axis_or_nonopposite_poses_do_not_claim_a_semicircle() {
    assert!(semicircle_turn(pose(0.0, 0.0, 0.0), pose(1.0, 160.0, PI), 80.0).is_none());
    assert!(semicircle_turn(pose(0.0, 0.0, 0.0), pose(0.0, 160.0, PI - 1e-4), 80.0).is_none());
}

#[test]
fn robust_biarcs_match_both_endpoint_poses_and_the_g1_join() {
    let start = pose(0.0, 0.0, 0.0);
    let end = pose(500.0, 300.0, PI / 2.0);
    let candidates = biarc_candidates(start, end, 80.0);

    assert!(!candidates.is_empty());
    assert!(candidates.windows(2).all(|pair| {
        let left = pair[0][0].end_tangent();
        let right = pair[1][0].end_tangent();
        left.y.atan2(left.x) <= right.y.atan2(right.x)
    }));
    for candidate in &candidates {
        canonicalize_path(candidate).unwrap();
        assert_pose_residuals(candidate, start, end);
        assert!(candidate.iter().all(|primitive| matches!(
            primitive,
            PathPrimitive::Arc { radius_mm, sweep_rad, .. }
                if *radius_mm >= 80.0 && sweep_rad.abs() > 1e-9
        )));
    }
}

#[test]
fn translated_pose_system_is_deterministic_and_never_leaks_an_unchecked_candidate() {
    let start = pose(1.0e12, -1.0e12, 0.0);
    let end = pose(1.0e12 + 500.0, -1.0e12 + 300.0, PI / 2.0);
    let first = biarc_candidates(start, end, 80.0);
    let second = biarc_candidates(start, end, 80.0);
    assert_eq!(first, second);
    for candidate in &first {
        assert_pose_residuals(candidate, start, end);
        assert!(candidate.iter().all(|primitive| matches!(
            primitive,
            PathPrimitive::Arc { radius_mm, .. } if *radius_mm >= 80.0
        )));
    }
}

#[test]
fn near_singular_pose_system_is_deterministic_and_never_returns_unchecked_curves() {
    let start = pose(0.0, 0.0, 0.0);
    let end = pose(1_000.0, 0.001, 1e-10);
    let first = biarc_candidates(start, end, 80.0);
    let second = biarc_candidates(start, end, 80.0);
    assert_eq!(first, second);
    for candidate in &first {
        assert_pose_residuals(candidate, start, end);
    }
}

#[test]
fn heading_grid_only_emits_canonical_radius_compliant_biarcs() {
    let headings = [-2.4, -1.2, -0.2, 0.7, 1.6, 2.8];
    let endpoints = [point(300.0, 250.0), point(600.0, -180.0)];
    let mut accepted = 0_usize;
    for start_heading in headings {
        for end_heading in headings {
            for endpoint in endpoints {
                let start = pose(0.0, 0.0, start_heading);
                let end = Pose::from_heading(endpoint, end_heading).unwrap();
                let first = biarc_candidates(start, end, 80.0);
                let second = biarc_candidates(start, end, 80.0);
                assert_eq!(first, second);
                for candidate in first {
                    canonicalize_path(&candidate).unwrap();
                    assert_pose_residuals(&candidate, start, end);
                    accepted += 1;
                }
            }
        }
    }
    assert!(accepted >= 20);
}

#[test]
fn invalid_or_too_close_pose_pairs_return_no_unchecked_biarc() {
    let invalid = Pose {
        point: point(0.0, 0.0),
        tangent: Vec2::new(2.0, 0.0),
    };
    assert!(biarc_candidates(invalid, pose(500.0, 300.0, PI / 2.0), 80.0).is_empty());
    assert!(
        biarc_candidates(pose(0.0, 0.0, 0.0), pose(500.0, 300.0, PI / 2.0), f64::NAN).is_empty()
    );

    let candidates = biarc_candidates(pose(0.0, 0.0, 0.0), pose(20.0, 20.0, PI), 80.0);
    assert!(candidates.is_empty());
}

#[test]
fn inner_turn_candidates_are_radius_compliant_and_stably_ordered() {
    let start = pose(0.0, 0.0, 0.0);
    let end = pose(0.0, 200.0, PI);
    assert!(inner_turn_candidates(start, end, 80.0, 199.999).is_empty());
    let first = inner_turn_candidates(start, end, 80.0, 200.0);
    let second = inner_turn_candidates(start, end, 80.0, 200.0);

    assert_eq!(first, second);
    assert!(!first.is_empty());
    assert!(first.windows(2).all(|pair| pair[0].kind <= pair[1].kind));
    assert!(matches!(
        first[0].kind,
        InnerTurnKind::Semicircle | InnerTurnKind::LargerArc
    ));
    assert!(first.iter().all(|candidate| {
        candidate
            .primitives
            .iter()
            .all(|primitive| match primitive {
                PathPrimitive::Arc { radius_mm, .. } => *radius_mm >= 80.0,
                PathPrimitive::Line { .. } => false,
            })
    }));
}
