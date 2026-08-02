use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    EmbeddedPoseGraph, Heading8, PlateGraphErrorCode, PlateGraphLimits, PlateInstance, PlateProfile,
    PlateTransform, TemplateId, TemplateTransform, build_embedded_graph, validate_embedded_graph,
};
use std::collections::{BTreeMap, BTreeSet};

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

fn instance(vertices: Vec<Point>) -> PlateInstance {
    let polygon = Polygon::try_from_original(vertices).unwrap();
    let (start, end) = polygon.original_edge(0);
    let inward = point(50.0, 50.0);
    let transform = PlateTransform::from_edge(start, end, inward, 0.0, 0.0).unwrap();
    PlateInstance::new(
        polygon,
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        20_000,
    )
    .unwrap()
}

fn rectangle_instance() -> PlateInstance {
    instance(vec![
        point(0.0, 0.0),
        point(900.0, 0.0),
        point(900.0, 750.0),
        point(0.0, 750.0),
    ])
}

#[test]
fn embedded_graph_is_deterministic_certified_and_contains_diagonals() {
    let instance = rectangle_instance();
    let limits = PlateGraphLimits::default();
    let first = build_embedded_graph(&instance, 8.0, limits).unwrap();
    let second = build_embedded_graph(&instance, 8.0, limits).unwrap();

    assert_eq!(first, second);
    assert!(!first.nodes.is_empty());
    assert!(!first.edges.is_empty());
    assert!(!first.rejected_edges.is_empty());
    assert!(
        first
            .rejected_edges
            .iter()
            .all(|edge| !edge.primitives.is_empty())
    );
    assert!(first.edges.iter().all(|edge| edge.certificate.is_some()));
    assert!(first.edges.iter().any(|edge| {
        matches!(
            edge.start.local_pose.heading,
            Heading8::Deg45 | Heading8::Deg135 | Heading8::Deg225 | Heading8::Deg315
        )
    }));
    assert!(first.nodes.windows(2).all(|pair| pair[0].id < pair[1].id));
    assert!(first.edges.windows(2).all(|pair| pair[0].id < pair[1].id));
    validate_embedded_graph(&first, &instance, 8.0).unwrap();
}

#[test]
fn rectangle_l_u_and_c_rooms_build_bounded_graphs_without_claiming_connectivity() {
    let fixtures = vec![
        vec![
            point(0.0, 0.0),
            point(600.0, 0.0),
            point(600.0, 450.0),
            point(0.0, 450.0),
        ],
        vec![
            point(0.0, 0.0),
            point(600.0, 0.0),
            point(600.0, 225.0),
            point(300.0, 225.0),
            point(300.0, 600.0),
            point(0.0, 600.0),
        ],
        vec![
            point(0.0, 0.0),
            point(675.0, 0.0),
            point(675.0, 600.0),
            point(450.0, 600.0),
            point(450.0, 225.0),
            point(225.0, 225.0),
            point(225.0, 600.0),
            point(0.0, 600.0),
        ],
        vec![
            point(0.0, 0.0),
            point(675.0, 0.0),
            point(675.0, 150.0),
            point(300.0, 150.0),
            point(300.0, 450.0),
            point(675.0, 450.0),
            point(675.0, 600.0),
            point(0.0, 600.0),
        ],
    ];

    for vertices in fixtures {
        let instance = instance(vertices);
        let graph = build_embedded_graph(&instance, 8.0, PlateGraphLimits::default()).unwrap();
        assert!(graph.candidate_count <= PlateGraphLimits::default().max_edge_candidates);
        validate_embedded_graph(&graph, &instance, 8.0).unwrap();
    }
}

#[test]
fn edge_candidate_budget_fails_before_the_first_excess_candidate() {
    let instance = rectangle_instance();
    let limits = PlateGraphLimits {
        max_edge_candidates: 1,
        ..PlateGraphLimits::default()
    };
    let error = build_embedded_graph(&instance, 8.0, limits).unwrap_err();
    assert_eq!(error.code, PlateGraphErrorCode::SolverLimitExceeded);
    assert_eq!(error.used, 1);
    assert_eq!(error.limit, 1);
}

// ---------------------------------------------------------------------------
// Connectivity certification (task 3b).
//
// The plate layer used to build a graph whose template families never touched:
// no `BroadTurn*`/`*Reverse*` endpoint pose ever coincided with a straight-chain
// node, so the certified graph was a heap of disjoint islands and no turning
// path existed at all. These three tests certify the opposite property, on the
// same 3000x2400 fixture the circuit layer uses.
// ---------------------------------------------------------------------------

/// The 3000x2400 rectangle at 75 mm wall clearance. Edge 0 runs (0,0)->(3000,0)
/// with the inward point on the +y side, so plate-local coordinates equal world
/// coordinates (same convention as `circuit_fields.rs` / `circuit_lanes.rs`).
fn rectangle_3000x2400_graph() -> EmbeddedPoseGraph {
    let polygon = Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 2400.0),
        point(0.0, 2400.0),
    ])
    .unwrap();
    let transform = PlateTransform::from_edge(
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(1500.0, 1200.0),
        0.0,
        0.0,
    )
    .unwrap();
    let instance = PlateInstance::new(
        polygon,
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .unwrap();
    build_embedded_graph(&instance, 75.0, PlateGraphLimits::default()).unwrap()
}

/// Union-find over accepted edges, joined whenever two edges share a pose node.
fn edge_components(graph: &EmbeddedPoseGraph) -> Vec<usize> {
    let mut parent: Vec<usize> = (0..graph.edges.len()).collect();
    fn find(parent: &mut [usize], mut node: usize) -> usize {
        while parent[node] != node {
            parent[node] = parent[parent[node]];
            node = parent[node];
        }
        node
    }
    let mut first_edge_at_node: BTreeMap<u32, usize> = BTreeMap::new();
    for (index, edge) in graph.edges.iter().enumerate() {
        for node_id in [edge.start.id, edge.end.id] {
            match first_edge_at_node.get(&node_id) {
                None => {
                    first_edge_at_node.insert(node_id, index);
                }
                Some(&other) => {
                    let (a, b) = (find(&mut parent, index), find(&mut parent, other));
                    if a != b {
                        parent[a] = b;
                    }
                }
            }
        }
    }
    (0..graph.edges.len())
        .map(|index| find(&mut parent, index))
        .collect()
}

#[test]
fn a_broad_turn_90_bridges_two_straight_edges_at_hand_computed_poses() {
    // Hand-computed, not recomputed with production helpers. The catalogue's
    // local geometry is
    //   Straight0   : (0, 37.5) Deg0 -> (150, 37.5) Deg0
    //   BroadTurn90 : (0, 37.5) Deg0 -> (187.5, 150) Deg90
    // and `TemplateTransform::apply` mirrors x, then rotates by quarter turns,
    // then translates by (150*period_i, 150*period_j). So, well clear of every
    // wall, the corner
    //   Straight0   qt=0 mirror=false period=(4,1): (600,187.5) -> (750,187.5)
    //   BroadTurn90 qt=0 mirror=false period=(5,1): (750,187.5) -> (937.5,300)
    //   Straight0   qt=3 mirror=true  period=(6,2): (937.5,300) -> (937.5,450)
    // is one continuous, certified, three-edge path: 600 + 150 = 750 hands over
    // to the turn, and the turn's exit 750 + 187.5 = 937.5 / 150 + 150 = 300
    // hands over to the vertical run. (The mirrored quarter turn maps
    // (0,37.5)->(150,37.5) Deg0 onto (37.5,0)->(37.5,150) Deg90, which the
    // period (6,2) shift lifts to x = 37.5 + 900 = 937.5, y = 300..450.)
    let graph = rectangle_3000x2400_graph();
    let find_edge = |id: TemplateId, transform: TemplateTransform| {
        graph
            .edges
            .iter()
            .find(|edge| edge.template_id == id && edge.template_transform == transform)
            .unwrap_or_else(|| panic!("{id:?} {transform:?} is not an accepted edge"))
    };

    let approach = find_edge(
        TemplateId::Straight0,
        TemplateTransform::new(0, false, false, 4, 1).unwrap(),
    );
    let turn = find_edge(
        TemplateId::BroadTurn90,
        TemplateTransform::new(0, false, false, 5, 1).unwrap(),
    );
    let departure = find_edge(
        TemplateId::Straight0,
        TemplateTransform::new(3, true, false, 6, 2).unwrap(),
    );

    assert_eq!(approach.start.local_pose.point, point(600.0, 187.5));
    assert_eq!(approach.end.local_pose.point, point(750.0, 187.5));
    assert_eq!(approach.end.local_pose.heading, Heading8::Deg0);
    assert_eq!(turn.start.local_pose.point, point(750.0, 187.5));
    assert_eq!(turn.start.local_pose.heading, Heading8::Deg0);
    assert_eq!(turn.end.local_pose.point, point(937.5, 300.0));
    assert_eq!(turn.end.local_pose.heading, Heading8::Deg90);
    assert_eq!(departure.start.local_pose.point, point(937.5, 300.0));
    assert_eq!(departure.start.local_pose.heading, Heading8::Deg90);
    assert_eq!(departure.end.local_pose.point, point(937.5, 450.0));

    // Shared *node identity*, not merely equal coordinates: the graph interned
    // them as the same pose.
    assert_eq!(
        approach.end.id, turn.start.id,
        "the straight run does not hand over to the turn"
    );
    assert_eq!(
        turn.end.id, departure.start.id,
        "the turn does not hand over to the next straight run"
    );
}

#[test]
fn b_accepted_edges_form_one_dominant_connected_component() {
    let graph = rectangle_3000x2400_graph();
    let components = edge_components(&graph);
    let mut sizes: BTreeMap<usize, usize> = BTreeMap::new();
    for root in &components {
        *sizes.entry(*root).or_default() += 1;
    }
    let largest_root = *sizes
        .iter()
        .max_by_key(|(root, size)| (**size, std::cmp::Reverse(**root)))
        .expect("graph must have edges")
        .0;
    let largest = sizes[&largest_root];
    let total = graph.edges.len();
    let fraction = largest as f64 / total as f64;
    assert!(
        fraction > 0.90,
        "largest connected component holds {largest}/{total} = {:.1}% of the accepted edges; \
         turns and straights are not in one component",
        fraction * 100.0
    );

    // ...and that one component really is mixed, not just a big straight island.
    let families: BTreeSet<TemplateId> = graph
        .edges
        .iter()
        .zip(&components)
        .filter(|(_, root)| **root == largest_root)
        .map(|(edge, _)| edge.template_id)
        .collect();
    for expected in [
        TemplateId::Straight0,
        TemplateId::Straight45,
        TemplateId::BroadTurn45,
        TemplateId::BroadTurn90,
        TemplateId::BroadTurn135,
        TemplateId::BroadReverse180,
        TemplateId::TeardropReverse,
    ] {
        assert!(
            families.contains(&expected),
            "{expected:?} is missing from the dominant component (present: {families:?})"
        );
    }
}

#[test]
fn c_reverse_family_is_reachable_from_the_straight_family() {
    let graph = rectangle_3000x2400_graph();
    let components = edge_components(&graph);
    let roots_of = |wanted: TemplateId| -> BTreeSet<usize> {
        graph
            .edges
            .iter()
            .zip(&components)
            .filter(|(edge, _)| edge.template_id == wanted)
            .map(|(_, root)| *root)
            .collect()
    };
    let straight = roots_of(TemplateId::Straight0);
    assert!(!straight.is_empty(), "fixture must contain Straight0 edges");
    for reverse in [TemplateId::BroadReverse180, TemplateId::TeardropReverse] {
        let reverse_roots = roots_of(reverse);
        assert!(
            !reverse_roots.is_empty(),
            "fixture must contain {reverse:?} edges"
        );
        assert!(
            reverse_roots.iter().any(|root| straight.contains(root)),
            "{reverse:?} shares no connected component with Straight0 -- the reverse family is \
             unreachable from the straight runs"
        );
    }
}

// ---------------------------------------------------------------------------
// Reversal closure (task 3c).
//
// The pipe is undirected but the pose graph is not. The 8-element symmetry
// group behind the catalogue does not contain path reversal, so for the five
// asymmetric templates the reverse of every certified maneuver was simply
// absent: `{Straight0, BroadTurn90}` was a directed acyclic graph, every
// (heading, channel parity) state had exactly one successor, and no closed ring
// existed anywhere, at any inset, in any room.
// ---------------------------------------------------------------------------

/// `(x_ticks, y_ticks, octant)` on the same 1e-6 mm grid the graph interns on.
type PoseTicks = (i64, i64, u8);

fn pose_ticks(pose: single_loop_solver::plate::LocalPose) -> PoseTicks {
    (
        (pose.point.x * 1e6).round() as i64,
        (pose.point.y * 1e6).round() as i64,
        pose.heading.octant(),
    )
}

fn flip(key: PoseTicks) -> PoseTicks {
    (key.0, key.1, (key.2 + 4) % 8)
}

#[test]
fn d_every_accepted_edge_has_an_accepted_reverse() {
    let graph = rectangle_3000x2400_graph();

    // Determinism, pinned on the fixture where the reversal pass's geometric
    // dedupe actually fires (the small rectangle in
    // `embedded_graph_is_deterministic_certified_and_contains_diagonals` need
    // not produce a single duplicate). `plate_api`'s byte-determinism test
    // depends on this holding for every room, not just that one.
    assert_eq!(
        graph,
        rectangle_3000x2400_graph(),
        "the reversal pass is not deterministic"
    );
    assert!(
        graph
            .edges
            .iter()
            .any(|edge| edge.template_transform.reversed),
        "fixture must contain reversed edges for this test to mean anything"
    );
    let pairs: BTreeSet<(PoseTicks, PoseTicks)> = graph
        .edges
        .iter()
        .map(|edge| {
            (
                pose_ticks(edge.start.local_pose),
                pose_ticks(edge.end.local_pose),
            )
        })
        .collect();
    let missing: Vec<u32> = graph
        .edges
        .iter()
        .filter(|edge| {
            let start = pose_ticks(edge.start.local_pose);
            let end = pose_ticks(edge.end.local_pose);
            !pairs.contains(&(flip(end), flip(start)))
        })
        .map(|edge| edge.id)
        .collect();
    assert!(
        missing.is_empty(),
        "{} of {} accepted edges have no accepted reverse (first few: {:?}); the catalogue is \
         not closed under path reversal, so directed cycles -- rings, and the spiral's return \
         arm -- cannot exist",
        missing.len(),
        graph.edges.len(),
        &missing[..missing.len().min(5)]
    );
}

#[test]
fn e_the_outermost_closable_ring_is_a_real_directed_cycle() {
    // A hand-computed closed ring, counter-clockwise, on the outermost channel
    // combination the parity system allows for this fixture: rows
    // y = 187.5 (m = 2) and y = 2212.5 (m = 29), columns x = 112.5 (n = 1) and
    // x = 2887.5 (n = 38). A uniform inset is impossible -- the horizontal and
    // vertical insets must differ by an odd multiple of 75 mm.
    //
    // Each corner is a left turn, and the nopp it rounds fixes the parity it
    // needs: E->N and W->S round a nopp of index sum n+m+1 (so n+m must be
    // even), N->W and S->E one of sum n+m (so n+m must be odd). Here
    // 38+2 = 40 even, 38+29 = 67 odd, 1+29 = 30 even, 1+2 = 3 odd -- all four
    // satisfied.
    //
    // Which of the two lead-length variants applies is fixed by the individual
    // parities: the long lead (107.5 + R = 187.5 of reach) sits on the even
    // side, the short one (R + 32.5 = 112.5) on the odd side. Hence, e.g., the
    // bottom-right corner reaches 187.5 back along the row (n = 38 even) and
    // 112.5 up the column (m = 2 even).
    let ring = [
        // (corner label, start pose, end pose, straight hops to the next corner)
        ("BR E->N", (point(2700.0, 187.5), Heading8::Deg0), (point(2887.5, 300.0), Heading8::Deg90), 12),
        ("TR N->W", (point(2887.5, 2100.0), Heading8::Deg90), (point(2700.0, 2212.5), Heading8::Deg180), 16),
        ("TL W->S", (point(300.0, 2212.5), Heading8::Deg180), (point(112.5, 2100.0), Heading8::Deg270), 12),
        ("BL S->E", (point(112.5, 300.0), Heading8::Deg270), (point(300.0, 187.5), Heading8::Deg0), 16),
    ];

    let graph = rectangle_3000x2400_graph();
    let edge_between = |from: (Point, Heading8), to: (Point, Heading8)| {
        let want_start = (
            (from.0.x * 1e6).round() as i64,
            (from.0.y * 1e6).round() as i64,
            from.1.octant(),
        );
        let want_end = (
            (to.0.x * 1e6).round() as i64,
            (to.0.y * 1e6).round() as i64,
            to.1.octant(),
        );
        graph.edges.iter().find(|edge| {
            pose_ticks(edge.start.local_pose) == want_start
                && pose_ticks(edge.end.local_pose) == want_end
        })
    };

    let mut reversed_corners = 0;
    let mut total_edges = 0;
    for (index, (label, corner_start, corner_end, hops)) in ring.iter().enumerate() {
        let corner = edge_between(*corner_start, *corner_end)
            .unwrap_or_else(|| panic!("ring corner {label} is not an accepted edge"));
        assert_eq!(
            corner.template_id,
            TemplateId::BroadTurn90,
            "ring corner {label} is not a BroadTurn90"
        );
        if corner.template_transform.reversed {
            reversed_corners += 1;
        }
        total_edges += 1;

        // Walk the side to the next corner's start, one 150 mm lattice hop at a
        // time, asserting every hop is a real accepted edge.
        let heading = corner_end.1;
        let step = match heading {
            Heading8::Deg0 => (150.0, 0.0),
            Heading8::Deg90 => (0.0, 150.0),
            Heading8::Deg180 => (-150.0, 0.0),
            Heading8::Deg270 => (0.0, -150.0),
            other => panic!("ring side has a diagonal heading {other:?}"),
        };
        let mut cursor = corner_end.0;
        for hop in 0..*hops {
            let next = point(cursor.x + step.0, cursor.y + step.1);
            edge_between((cursor, heading), (next, heading)).unwrap_or_else(|| {
                panic!(
                    "hop {hop} of the side after {label} -- ({}, {}) to ({}, {}) heading {:?} -- \
                     is not an accepted edge",
                    cursor.x, cursor.y, next.x, next.y, heading
                )
            });
            cursor = next;
            total_edges += 1;
        }
        let (next_corner_point, next_corner_heading) = ring[(index + 1) % ring.len()].1;
        assert_eq!(
            (cursor.x, cursor.y, heading),
            (
                next_corner_point.x,
                next_corner_point.y,
                next_corner_heading
            ),
            "the side after {label} does not land on the next corner"
        );
    }

    assert_eq!(total_edges, 60, "the ring should be 4 corners plus 56 straights");
    assert_eq!(
        reversed_corners, 2,
        "exactly two of a ring's four corners are path reversals -- if this is 0, the ring is \
         being built from the old, one-directional octet and something else is wrong"
    );
}

#[test]
fn f_symmetric_families_are_never_emitted_as_reversed_instances() {
    // `Straight0` and `BroadReverse180` are symmetric under the transform group:
    // every reversed placement of them is byte-identical to some mirrored,
    // translated forward placement, so the reversal pass must drop all of them.
    // If this ever counts anything but zero, those two families have silently
    // doubled and every downstream edge count is inflated.
    let graph = rectangle_3000x2400_graph();
    for family in [TemplateId::Straight0, TemplateId::BroadReverse180] {
        let total = graph
            .edges
            .iter()
            .filter(|edge| edge.template_id == family)
            .count();
        let reversed = graph
            .edges
            .iter()
            .filter(|edge| edge.template_id == family && edge.template_transform.reversed)
            .count();
        assert!(total > 0, "fixture must contain {family:?} edges");
        assert_eq!(
            reversed, 0,
            "{family:?} is symmetric, so none of its {total} accepted edges should come from the \
             reversal pass -- {reversed} did, which means the dedupe stopped working"
        );
    }

    // The five asymmetric families must, conversely, be genuinely doubled.
    for family in [
        TemplateId::Straight45,
        TemplateId::BroadTurn45,
        TemplateId::BroadTurn90,
        TemplateId::BroadTurn135,
        TemplateId::TeardropReverse,
    ] {
        let (forward, reversed): (Vec<_>, Vec<_>) = graph
            .edges
            .iter()
            .filter(|edge| edge.template_id == family)
            .partition(|edge| !edge.template_transform.reversed);
        assert_eq!(
            forward.len(),
            reversed.len(),
            "{family:?} should contribute one reversed edge per forward edge"
        );
        assert!(!forward.is_empty(), "fixture must contain {family:?} edges");
    }
}

#[test]
fn g_no_two_accepted_edges_share_the_same_geometry() {
    // The dedupe's actual contract, independent of which families happen to be
    // symmetric: no curve is ever emitted twice. Keyed exactly as
    // `plate::graph::geometry_key` does -- 1e-6 mm ticks, because a reversed
    // instance and its forward twin reach the same arc by different f64 paths
    // and differ in the last few ulps.
    let graph = rectangle_3000x2400_graph();
    let mut keys = BTreeSet::new();
    let mut duplicates = 0usize;
    for edge in &graph.edges {
        let mut key = vec![
            (edge.start.world_point.x * 1e6).round() as i64,
            (edge.start.world_point.y * 1e6).round() as i64,
            i64::from(edge.start.local_pose.heading.octant()),
            (edge.end.world_point.x * 1e6).round() as i64,
            (edge.end.world_point.y * 1e6).round() as i64,
            i64::from(edge.end.local_pose.heading.octant()),
        ];
        for primitive in &edge.primitives {
            match primitive {
                PathPrimitive::Line { start, end } => key.extend([
                    0,
                    (start.x * 1e6).round() as i64,
                    (start.y * 1e6).round() as i64,
                    (end.x * 1e6).round() as i64,
                    (end.y * 1e6).round() as i64,
                ]),
                PathPrimitive::Arc {
                    start,
                    end,
                    center,
                    radius_mm,
                    sweep_rad,
                } => key.extend([
                    1,
                    (start.x * 1e6).round() as i64,
                    (start.y * 1e6).round() as i64,
                    (end.x * 1e6).round() as i64,
                    (end.y * 1e6).round() as i64,
                    (center.x * 1e6).round() as i64,
                    (center.y * 1e6).round() as i64,
                    (radius_mm * 1e6).round() as i64,
                    (sweep_rad * 1e6).round() as i64,
                ]),
            }
        }
        if !keys.insert(key) {
            duplicates += 1;
        }
    }
    assert_eq!(
        keys.len(),
        graph.edges.len(),
        "{duplicates} of {} accepted edges duplicate another edge's exact geometry",
        graph.edges.len()
    );
}
