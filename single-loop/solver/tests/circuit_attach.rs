use single_loop_solver::circuit::{
    ConnectionInput, ConnectionZone, LoopErrorCode, attach_port, build_connection_zone,
    build_graph_view, filter_zone_nopps,
};
use single_loop_solver::geometry::{PointClassification, Polygon};
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, LocalPose, PlateGraphLimits, PlateInstance, PlateProfile,
    PlateTransform, PoseNode, build_embedded_graph, primitive_circle_clearance,
};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

/// A room small enough to keep the graph cheap, with the connection on the
/// bottom edge. The plate frame is the identity here, so plate-local and
/// world coordinates coincide and every expectation below can be read off
/// directly.
fn rect_polygon() -> Polygon {
    Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(900.0, 750.0),
        point(0.0, 750.0),
    ])
    .unwrap()
}

fn transform() -> PlateTransform {
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(450.0, 375.0),
        0.0,
        0.0,
    )
    .unwrap()
}

fn connection() -> ConnectionInput {
    ConnectionInput {
        edge_index: 0,
        center_offset_mm: 450.0,
        zone_width_mm: 300.0,
        zone_depth_mm: 200.0,
    }
}

/// The instance whose noppen inside the connection zone have been removed,
/// which is the state `attach_port` is specified against.
fn fixture() -> (PlateInstance, EmbeddedPoseGraph, ConnectionZone) {
    let mut instance = PlateInstance::new(
        rect_polygon(),
        transform(),
        PlateProfile::bekotec_en_23_fi_30_16(),
        20_000,
    )
    .unwrap();
    let graph = build_embedded_graph(&instance, 8.0, PlateGraphLimits::default()).unwrap();
    let zone =
        build_connection_zone(&instance.polygon, &instance.transform, &connection()).unwrap();
    filter_zone_nopps(&mut instance, &zone);
    (instance, graph, zone)
}

fn node_by_id(graph: &EmbeddedPoseGraph, id: u32) -> PoseNode {
    *graph.nodes.iter().find(|node| node.id == id).unwrap()
}

/// The anchor at local (300, 262.5) heading Deg180: 125 mm to the left of the
/// start port's channel and 262.5 mm into the room, so the fixed-radius
/// fillet has 262.5 mm of run-in and 125 mm of run-out — both above the
/// 80 mm the corner consumes on each leg.
fn reachable_anchor(graph: &EmbeddedPoseGraph) -> PoseNode {
    graph
        .nodes
        .iter()
        .copied()
        .find(|node| {
            node.local_pose.point == point(300.0, 262.5)
                && node.local_pose.heading == Heading8::Deg180
        })
        .expect("fixture anchor (300, 262.5) Deg180 exists")
}

/// The anchor directly above the port center: its channel is only 25 mm to
/// the side, so an 80 mm corner cannot fit between the corner vertex and the
/// anchor.
fn too_close_anchor(graph: &EmbeddedPoseGraph) -> PoseNode {
    graph
        .nodes
        .iter()
        .copied()
        .find(|node| {
            node.local_pose.point == point(450.0, 262.5)
                && node.local_pose.heading == Heading8::Deg0
        })
        .expect("fixture anchor (450, 262.5) Deg0 exists")
}

/// An anchor whose heading is parallel to the port tangent: no fixed-radius
/// corner exists, and on this fixture no biarc candidate to it certifies
/// either, so it exercises the exhausted-both-shapes rejection.
fn parallel_anchor(graph: &EmbeddedPoseGraph) -> PoseNode {
    graph
        .nodes
        .iter()
        .copied()
        .find(|node| {
            node.local_pose.point == point(262.5, 150.0)
                && node.local_pose.heading == Heading8::Deg90
        })
        .expect("fixture anchor (262.5, 150) Deg90 exists")
}

#[test]
fn attachment_is_tangent_at_both_ends_with_min_radius() {
    let (instance, graph, zone) = fixture();
    let anchor = reachable_anchor(&graph);

    let attachment = attach_port(zone.start_port, zone.inward, &anchor, &instance).unwrap();

    let first = attachment.primitives.first().unwrap();
    let last = attachment.primitives.last().unwrap();
    assert!((first.point_at(0.0) - zone.start_port).norm() < 1e-9);
    assert!((first.start_tangent() - zone.inward).norm() < 1e-7);
    assert!((last.point_at(1.0) - anchor.world_point).norm() < 1e-9);
    let anchor_direction = instance
        .transform
        .vector_to_world(anchor.local_pose.heading.direction());
    assert!((last.end_tangent() - anchor_direction).norm() < 1e-7);

    for primitive in &attachment.primitives {
        if let PathPrimitive::Arc { radius_mm, .. } = primitive {
            assert!(
                *radius_mm >= instance.profile.min_bend_radius_mm,
                "arc radius {radius_mm} below the profile floor"
            );
        }
    }

    // Hand-computed fillet: the port channel x = 425 meets the anchor channel
    // y = 262.5 at (425, 262.5); an 80 mm quarter corner leaves the straight
    // 80 mm before that vertex and rejoins 80 mm after it.
    assert_eq!(attachment.primitives.len(), 3);
    assert!((first.point_at(1.0) - point(425.0, 182.5)).norm() < 1e-9);
    assert!((last.point_at(0.0) - point(345.0, 262.5)).norm() < 1e-9);
    match &attachment.primitives[1] {
        PathPrimitive::Arc {
            center,
            radius_mm,
            sweep_rad,
            ..
        } => {
            assert!((*center - point(345.0, 182.5)).norm() < 1e-9);
            assert!((radius_mm - 80.0).abs() < 1e-9);
            assert!((sweep_rad - std::f64::consts::FRAC_PI_2).abs() < 1e-9);
        }
        other => panic!("expected the middle primitive to be the corner arc, got {other:?}"),
    }
}

#[test]
fn consecutive_attachment_primitives_join_without_a_gap() {
    let (instance, graph, zone) = fixture();
    let anchor = reachable_anchor(&graph);

    let attachment = attach_port(zone.start_port, zone.inward, &anchor, &instance).unwrap();

    for pair in attachment.primitives.windows(2) {
        assert!((pair[0].point_at(1.0) - pair[1].point_at(0.0)).norm() < 1e-9);
        assert!((pair[0].end_tangent() - pair[1].start_tangent()).norm() < 1e-7);
    }
}

#[test]
fn unreachable_anchor_orientation_is_typed_invalid_connection() {
    let (instance, graph, zone) = fixture();
    let anchor = too_close_anchor(&graph);

    let error = attach_port(zone.start_port, zone.inward, &anchor, &instance).unwrap_err();

    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
    assert!(
        error.message.contains("corner"),
        "message should name the corner that does not fit: {}",
        error.message
    );
}

#[test]
fn an_anchor_parallel_to_the_port_tangent_is_typed_invalid_connection() {
    let (instance, graph, zone) = fixture();
    let anchor = parallel_anchor(&graph);

    let error = attach_port(zone.start_port, zone.inward, &anchor, &instance).unwrap_err();

    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
    assert!(
        error.message.contains("parallel"),
        "message should name the parallel poses: {}",
        error.message
    );
}

#[test]
fn an_anchor_outside_the_room_is_rejected_before_it_reaches_the_wall() {
    let (instance, _graph, zone) = fixture();
    // Synthetic anchor beyond the right wall: the connector would have to
    // leave the polygon to reach it.
    let anchor = PoseNode {
        id: u32::MAX,
        local_pose: LocalPose::new(point(1200.0, 262.5), Heading8::Deg0),
        world_point: point(1200.0, 262.5),
    };

    let error = attach_port(zone.start_port, zone.inward, &anchor, &instance).unwrap_err();

    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
    assert!(
        error.message.contains("polygon"),
        "message should name the polygon: {}",
        error.message
    );
}

#[test]
fn every_accepted_attachment_clears_the_remaining_noppen() {
    let (instance, graph, zone) = fixture();
    let view = build_graph_view(&graph, &zone, &instance.transform);
    let tolerance = instance.profile.laying_tolerance_mm;

    let mut accepted = 0usize;
    for &id in &view.entry_candidates {
        let anchor = node_by_id(&graph, id);
        let Ok(attachment) = attach_port(zone.start_port, zone.inward, &anchor, &instance) else {
            continue;
        };
        accepted += 1;
        for primitive in &attachment.primitives {
            for nopp in &instance.nopps {
                let clearance =
                    primitive_circle_clearance(primitive, nopp.center, nopp.forbidden_radius_mm);
                assert!(
                    clearance >= -tolerance,
                    "accepted attachment to anchor {id} collides with nopp at {:?}: {clearance}",
                    nopp.center
                );
            }
        }
    }

    assert!(
        accepted > 0,
        "no entry candidate is reachable from the start port"
    );
}

#[test]
fn both_the_corner_and_the_biarc_fallback_are_used_on_the_fixture() {
    let (instance, graph, zone) = fixture();
    let view = build_graph_view(&graph, &zone, &instance.transform);

    let (mut corners, mut biarcs) = (0usize, 0usize);
    for &id in &view.entry_candidates {
        let anchor = node_by_id(&graph, id);
        let Ok(attachment) = attach_port(zone.start_port, zone.inward, &anchor, &instance) else {
            continue;
        };
        let arcs = attachment
            .primitives
            .iter()
            .filter(|primitive| matches!(primitive, PathPrimitive::Arc { .. }))
            .count();
        // A fixed-radius corner has exactly one arc between its straights; a
        // biarc is two arcs and nothing else.
        if attachment.primitives.len() == 2 && arcs == 2 {
            biarcs += 1;
        } else {
            assert_eq!(arcs, 1, "a corner carries exactly one arc");
            corners += 1;
        }
    }

    // Measured on this fixture: 26 corners, 10 biarcs, 128 anchors reachable
    // by neither. The biarc count is what makes the fallback load-bearing —
    // without it those ten anchors would be lost.
    assert_eq!(corners, 26);
    assert_eq!(biarcs, 10);
}

#[test]
fn every_accepted_attachment_stays_inside_the_room() {
    let (instance, graph, zone) = fixture();
    let view = build_graph_view(&graph, &zone, &instance.transform);

    let mut checked = 0usize;
    for &id in &view.entry_candidates {
        let anchor = node_by_id(&graph, id);
        let Ok(attachment) = attach_port(zone.start_port, zone.inward, &anchor, &instance) else {
            continue;
        };
        checked += 1;
        for primitive in &attachment.primitives {
            // Dense independent sampling as a counter-check on the analytic
            // containment test, per the design spec's testing rules: samples
            // are a test-side control, never the production certificate.
            for step in 0..=64 {
                let sample = primitive.point_at(f64::from(step) / 64.0);
                let classification = instance.polygon.classify_point(sample);
                let on_port = (sample - zone.start_port).norm() <= 1e-9;
                assert!(
                    classification != PointClassification::Outside
                        && (classification != PointClassification::Boundary || on_port),
                    "anchor {id}: accepted attachment samples {sample:?} outside the room"
                );
            }
        }
    }

    assert!(checked > 0, "no attachment was available to check");
}
