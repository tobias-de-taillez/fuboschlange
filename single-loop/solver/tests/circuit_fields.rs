use single_loop_solver::circuit::{Field, LoopErrorCode, RectMm, decompose_fields};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::Point;
use single_loop_solver::plate::PlateTransform;

fn point(x: f64, y: f64) -> Point {
    Point::new(x, y)
}

// Vertex lists match `PLATE_SHAPES` in `single-loop/src/plate-main.ts` exactly.

fn rect_vertices() -> Vec<Point> {
    vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 2400.0),
        point(0.0, 2400.0),
    ]
}

fn l_vertices() -> Vec<Point> {
    vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 1200.0),
        point(1500.0, 1200.0),
        point(1500.0, 2400.0),
        point(0.0, 2400.0),
    ]
}

fn u_vertices() -> Vec<Point> {
    vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 2400.0),
        point(2000.0, 2400.0),
        point(2000.0, 900.0),
        point(1000.0, 900.0),
        point(1000.0, 2400.0),
        point(0.0, 2400.0),
    ]
}

fn c_vertices() -> Vec<Point> {
    vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 900.0),
        point(1000.0, 900.0),
        point(1000.0, 1500.0),
        point(3000.0, 1500.0),
        point(3000.0, 2400.0),
        point(0.0, 2400.0),
    ]
}

fn rect_polygon() -> Polygon {
    Polygon::try_from_original(rect_vertices()).unwrap()
}

fn l_polygon() -> Polygon {
    Polygon::try_from_original(l_vertices()).unwrap()
}

fn u_polygon() -> Polygon {
    Polygon::try_from_original(u_vertices()).unwrap()
}

fn c_polygon() -> Polygon {
    Polygon::try_from_original(c_vertices()).unwrap()
}

// Edge 0 of every PLATE_SHAPES fixture runs from (0,0) to (3000,0); this
// transform's inward point (1500,1200) sits on the +y side, so u=(1,0),
// v=(0,1) and plate-local coordinates equal world coordinates here — fixture
// arithmetic below can be reasoned about directly, no mental round-trip.
fn transform() -> PlateTransform {
    PlateTransform::from_edge(
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(1500.0, 1200.0),
        0.0,
        0.0,
    )
    .unwrap()
}

fn polygon_area(vertices: &[Point]) -> f64 {
    let n = vertices.len();
    let mut sum = 0.0;
    for i in 0..n {
        let a = vertices[i];
        let b = vertices[(i + 1) % n];
        sum += a.x * b.y - a.y * b.x;
    }
    (sum * 0.5).abs()
}

fn rect_area(rect: &RectMm) -> f64 {
    (rect.max.x - rect.min.x) * (rect.max.y - rect.min.y)
}

#[test]
fn convex_room_is_one_field() {
    let fields = decompose_fields(&rect_polygon(), &transform(), 500).unwrap();
    assert_eq!(fields.len(), 1);
}

#[test]
fn rectangle_field_matches_the_room_exactly() {
    // Count alone doesn't prove the geometry is right; pin the coordinates.
    let fields = decompose_fields(&rect_polygon(), &transform(), 500).unwrap();
    assert_eq!(
        fields,
        vec![Field {
            id: 0,
            rect_local: RectMm {
                min: point(0.0, 0.0),
                max: point(3000.0, 2400.0),
            },
        }]
    );
}

#[test]
fn l_room_splits_into_two_squat_fields_deterministically() {
    let first = decompose_fields(&l_polygon(), &transform(), 500).unwrap();
    let second = decompose_fields(&l_polygon(), &transform(), 500).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.len(), 2);
    for field in &first {
        let w = field.rect_local.max.x - field.rect_local.min.x;
        let h = field.rect_local.max.y - field.rect_local.min.y;
        assert!(
            w / h <= 2.0 + 1e-9 && h / w <= 2.0 + 1e-9,
            "squat 1:2 violated"
        );
    }
}

#[test]
fn l_room_picks_the_vertical_cut_not_the_non_squat_horizontal_one() {
    // The L room's single reflex vertex is (1500,1200). Both candidate cuts
    // produce 2 fields, so field count alone can't distinguish them —
    // criterion (2), smallest worst aspect ratio, must decide:
    //   vertical cut   (1500,1200)-(1500,0):  1500x2400 (1.6), 1500x1200 (1.25)
    //   horizontal cut (1500,1200)-(0,1200):  3000x1200 (2.5, violates squat), 1500x1200 (1.25)
    // Pin the exact rectangles so this fails loudly if the wrong variant is
    // ever selected (e.g. field count ties break the wrong way).
    let fields = decompose_fields(&l_polygon(), &transform(), 500).unwrap();
    assert_eq!(
        fields,
        vec![
            Field {
                id: 0,
                rect_local: RectMm {
                    min: point(0.0, 0.0),
                    max: point(1500.0, 2400.0),
                },
            },
            Field {
                id: 1,
                rect_local: RectMm {
                    min: point(1500.0, 0.0),
                    max: point(3000.0, 1200.0),
                },
            },
        ]
    );
}

#[test]
fn u_and_c_rooms_split_into_three_fields() {
    assert_eq!(
        decompose_fields(&u_polygon(), &transform(), 500)
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        decompose_fields(&c_polygon(), &transform(), 500)
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn field_areas_sum_to_polygon_area_for_concave_rooms() {
    for vertices in [l_vertices(), u_vertices(), c_vertices()] {
        let polygon = Polygon::try_from_original(vertices.clone()).unwrap();
        let fields = decompose_fields(&polygon, &transform(), 500).unwrap();
        let total: f64 = fields
            .iter()
            .map(|field| rect_area(&field.rect_local))
            .sum();
        let expected = polygon_area(&vertices);
        assert!(
            (total - expected).abs() < 1e-6,
            "fields must exactly tile the polygon: fields sum to {total}, polygon area is {expected}"
        );
    }
}

#[test]
fn too_few_max_variants_is_solver_limit_exceeded() {
    // The L room has exactly one reflex vertex, i.e. 2 candidate cut-set
    // variants; a budget of 1 cannot cover them.
    let error = decompose_fields(&l_polygon(), &transform(), 1).unwrap_err();
    assert_eq!(error.code, LoopErrorCode::SolverLimitExceeded);
}

#[test]
fn non_rectilinear_convex_room_is_one_bounding_field() {
    let triangle = Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(1500.0, 2000.0),
    ])
    .unwrap();
    let fields = decompose_fields(&triangle, &transform(), 500).unwrap();
    assert_eq!(
        fields,
        vec![Field {
            id: 0,
            rect_local: RectMm {
                min: point(0.0, 0.0),
                max: point(3000.0, 2000.0),
            },
        }]
    );
}

#[test]
fn non_rectilinear_concave_room_is_no_solution_geometry() {
    // The L room's reflex vertex (1500,1200) shifted off-axis to (1400,1300)
    // so both its incident edges become diagonal, while the vertex itself
    // stays reflex (concave) — a diagonal-walled notch.
    let dart = Polygon::try_from_original(vec![
        point(0.0, 0.0),
        point(3000.0, 0.0),
        point(3000.0, 1200.0),
        point(1400.0, 1300.0),
        point(1500.0, 2400.0),
        point(0.0, 2400.0),
    ])
    .unwrap();
    let error = decompose_fields(&dart, &transform(), 500).unwrap_err();
    assert_eq!(error.code, LoopErrorCode::NoSolutionGeometry);
    assert_eq!(error.message, "NON_RECTILINEAR_CONCAVE_ROOM");
}
