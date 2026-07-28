use single_loop_solver::model::Point;
use single_loop_solver::plate::{
    LocalBounds, Nopp, NoppIndex, NoppType, PlateProfile, PlateTransform, motif_indices_for_bounds,
    nopp_type,
};

#[test]
fn checkerboard_is_stable_for_negative_indices_and_one_fifty_mm_period() {
    assert_eq!(nopp_type(NoppIndex::new(0, 0)), NoppType::Large);
    assert_eq!(nopp_type(NoppIndex::new(-1, 0)), NoppType::Small);
    assert_eq!(nopp_type(NoppIndex::new(-1, -1)), NoppType::Large);
    assert_eq!(
        nopp_type(NoppIndex::new(2, 0)),
        nopp_type(NoppIndex::new(0, 0))
    );
    assert_eq!(
        nopp_type(NoppIndex::new(0, 2)),
        nopp_type(NoppIndex::new(0, 0))
    );
    assert_eq!(
        nopp_type(NoppIndex::new(i64::MAX, i64::MAX)),
        NoppType::Large
    );
}

#[test]
fn nopp_centers_use_the_seventy_five_mm_lattice() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    let transform = PlateTransform::from_edge(
        Point::new(0.0, 0.0),
        Point::new(100.0, 0.0),
        Point::new(0.0, 100.0),
        0.0,
        0.0,
    )
    .unwrap();
    let nopp = Nopp::at_index(NoppIndex::new(-2, 3), &profile, &transform);

    assert_eq!(nopp.center, Point::new(-150.0, 225.0));
    assert_eq!(nopp.nopp_type, NoppType::Small);
    assert_eq!(nopp.forbidden_radius_mm, 19.0);
}

#[test]
fn bounded_enumeration_is_sorted_and_obeys_exact_budget() {
    let bounds = LocalBounds::new(Point::new(-10.0, -10.0), Point::new(160.0, 85.0)).unwrap();
    let indices = motif_indices_for_bounds(bounds, 75.0, 0.0, 20).unwrap();

    assert_eq!(indices.len(), 20);
    assert_eq!(indices.first(), Some(&NoppIndex::new(-1, -1)));
    assert_eq!(indices.last(), Some(&NoppIndex::new(3, 2)));
    assert!(
        indices
            .windows(2)
            .all(|pair| { (pair[0].j, pair[0].i) < (pair[1].j, pair[1].i) })
    );
    assert!(motif_indices_for_bounds(bounds, 75.0, 0.0, 19).is_err());
}
