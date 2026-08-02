//! The Wintergarten: a real surveyed room, end to end.
//!
//! The fixture is the user's own `raumaufmass` export, unedited. This file
//! answers the question the multi-circuit solver stands or falls on — does the
//! rectified outline decompose into fields a Schnecke can actually be laid and
//! certified in — before any of it reaches a browser.
//!
//! Measured facts about this room, so the assertions below read against
//! something: 29.44 m², bounding box 7860 × 5089 mm, eleven walls. Eight of
//! them are within 0.41° of an axis (survey noise, σ̂ ≈ 9.8 mm); one, C→M, is
//! genuinely slanted at 3.01° — 160 mm over 3 m; and a 357 mm notch sits at
//! the bottom right at 10°.

use std::fs;

use single_loop_solver::circuit::{Field, rectify, slab_fields};
use single_loop_solver::model::Point;

/// The measured ring, rebuilt from the export's points and walls.
///
/// Same reconstruction `verlegeplan.html`'s importer does: a closed ring means
/// every point has exactly two walls, so following the unused neighbour from
/// any start walks the outline. The polygon is *not* straightened here — that
/// is `rectify`'s job, and keeping the two apart is what lets the test measure
/// what straightening costs.
fn measured_ring() -> Vec<Point> {
    let text = fs::read_to_string("../fixtures/rooms/wintergarten.json")
        .expect("the surveyed room fixture must be readable");
    let value: serde_json::Value = serde_json::from_str(&text).expect("valid JSON");

    let mut by_id = std::collections::BTreeMap::new();
    for point in value["pts"].as_array().expect("pts") {
        by_id.insert(
            point["id"].as_str().expect("id").to_owned(),
            Point::new(
                point["x"].as_f64().expect("x"),
                point["y"].as_f64().expect("y"),
            ),
        );
    }
    let mut neighbours: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    for wall in value["walls"].as_array().expect("walls") {
        let ends = wall.as_array().expect("wall is a pair");
        let (from, to) = (
            ends[0].as_str().expect("from").to_owned(),
            ends[1].as_str().expect("to").to_owned(),
        );
        neighbours.entry(from.clone()).or_default().push(to.clone());
        neighbours.entry(to).or_default().push(from);
    }
    assert!(
        neighbours.values().all(|list| list.len() == 2),
        "a closed ring gives every point exactly two walls"
    );

    let start = neighbours.keys().next().expect("non-empty").clone();
    let mut ring = vec![start.clone()];
    let (mut previous, mut current) = (None::<String>, start.clone());
    loop {
        let next = neighbours[&current]
            .iter()
            .find(|candidate| Some(*candidate) != previous.as_ref())
            .expect("every point has an unused neighbour")
            .clone();
        if next == start {
            break;
        }
        ring.push(next.clone());
        previous = Some(current);
        current = next;
    }
    assert_eq!(
        ring.len(),
        neighbours.len(),
        "the walls form one single ring"
    );
    ring.into_iter().map(|id| by_id[&id]).collect()
}

fn area_mm2(vertices: &[Point]) -> f64 {
    let mut sum = 0.0;
    for index in 0..vertices.len() {
        let from = vertices[index];
        let to = vertices[(index + 1) % vertices.len()];
        sum += from.x * to.y - to.x * from.y;
    }
    (sum / 2.0).abs()
}

fn field_area_mm2(field: &Field) -> f64 {
    (field.rect_local.max.x - field.rect_local.min.x)
        * (field.rect_local.max.y - field.rect_local.min.y)
}

#[test]
fn the_surveyed_ring_reconstructs() {
    let ring = measured_ring();
    assert_eq!(ring.len(), 11, "eleven corners");
    assert!(
        (area_mm2(&ring) / 1e6 - 29.44).abs() < 0.02,
        "29.44 m², got {:.2}",
        area_mm2(&ring) / 1e6
    );
}

#[test]
fn rectifying_stays_inside_the_measured_room_and_says_what_it_cost() {
    let ring = measured_ring();
    let room = rectify(&ring).expect("this room rectifies");

    // Inscribed, never inflated: the rectified outline is smaller than the
    // measured one, and by how much is reported rather than hidden — that is
    // the user's wall that moved.
    let measured = area_mm2(&ring);
    let rectified = area_mm2(&room.vertices);
    assert!(
        rectified < measured,
        "rectified {rectified:.0} mm² must be inside measured {measured:.0} mm²"
    );
    assert!(
        (room.inscribed_loss_mm2 - (measured - rectified)).abs() < 1.0,
        "the reported loss must be the real one"
    );

    // The cost is dominated by the one genuinely slanted wall. Anything much
    // above a couple of percent would mean rectification is eating real room,
    // not survey noise.
    let loss_fraction = room.inscribed_loss_mm2 / measured;
    assert!(
        loss_fraction < 0.05,
        "rectification gave up {:.1} % of the room",
        loss_fraction * 100.0
    );

    // Axis-parallel, alternating, closed.
    for index in 0..room.vertices.len() {
        let from = room.vertices[index];
        let to = room.vertices[(index + 1) % room.vertices.len()];
        let horizontal = (from.y - to.y).abs() < 1e-6;
        let vertical = (from.x - to.x).abs() < 1e-6;
        assert!(
            horizontal != vertical,
            "wall {index} is neither axis-parallel nor a corner: {from:?} -> {to:?}"
        );
    }

    println!(
        "rectified: {} corners, {:.2} m² (measured {:.2} m²), {:.2} m² given up, \
         {} short walls dropped",
        room.vertices.len(),
        rectified / 1e6,
        measured / 1e6,
        room.inscribed_loss_mm2 / 1e6,
        room.dropped_walls,
    );
    for vertex in &room.vertices {
        println!("  ({:.0}, {:.0})", vertex.x, vertex.y);
    }
}

#[test]
fn the_room_slabs_into_rectangles_that_tile_it() {
    let room = rectify(&measured_ring()).expect("this room rectifies");
    let fields = slab_fields(&room, &[]);
    assert!(!fields.is_empty(), "the room must decompose into fields");

    let covered: f64 = fields.iter().map(field_area_mm2).sum();
    let rectified = area_mm2(&room.vertices);
    assert!(
        (covered - rectified).abs() / rectified < 1e-6,
        "the slabs must tile the room exactly: {covered:.0} vs {rectified:.0} mm²"
    );

    for field in &fields {
        println!(
            "  field {}: {:.0} x {:.0} mm at ({:.0}, {:.0}), {:.2} m²",
            field.id,
            field.rect_local.max.x - field.rect_local.min.x,
            field.rect_local.max.y - field.rect_local.min.y,
            field.rect_local.min.x,
            field.rect_local.min.y,
            field_area_mm2(field) / 1e6,
        );
    }
}

#[test]
fn the_whole_room_plans_around_a_manifold_in_the_notch() {
    use single_loop_solver::circuit::{RoomPlanInput, plan_room};

    // The manifold stands in the 357 mm notch at the bottom right — M-O-N-F in
    // the survey. `rectify` drops that notch as an artefact, which is right for
    // the heated area but not for the manifold, so its position is handed in
    // separately rather than recovered from the outline.
    let ring = measured_ring();
    let manifold = Point::new(7420.0, -1850.0);

    let plan = plan_room(RoomPlanInput {
        ring: ring.clone(),
        manifold: Some(manifold),
        fill_spacing_mm: 150.0,
        wall_clearance_mm: 75.0,
        edge_band_mm: 300.0,
    })
    .expect("this room plans");

    println!(
        "gemessen {:.2} m², begradigt {:.2} m², Fuellflaeche {:.2} m² ({} kurze Waende verworfen)",
        plan.measured_area_m2, plan.rectified_area_m2, plan.fill_area_m2, plan.dropped_walls
    );
    for (index, circuit) in plan.circuits.iter().enumerate() {
        println!(
            "  Kreis {index}: {:.0} x {:.0} mm, {} Bahnen, {:.1} m bei {:.0} mm, \
             Biegeradius {:.1} mm, Strafe {:.1} mm",
            circuit.rect_local.max.x - circuit.rect_local.min.x,
            circuit.rect_local.max.y - circuit.rect_local.min.y,
            circuit.lanes,
            circuit.total_length_mm / 1000.0,
            circuit.pipe_spacing_mm,
            circuit.min_bend_radius_mm,
            circuit.penalty_sum_mm,
        );
    }
    for refusal in &plan.refused {
        println!("  kein Kreis: {refusal}");
    }
    println!("  ein Noppenfeld, {} Noppen", plan.nopp_count);

    assert!(!plan.circuits.is_empty(), "the room must get circuits");
    assert!(
        plan.manifold_local.is_some(),
        "the manifold position must survive into the shared frame"
    );
    for circuit in &plan.circuits {
        assert!(
            circuit.total_length_mm <= 100_000.0,
            "no circuit may exceed 100 m"
        );
        assert!(circuit.min_bend_radius_mm >= 80.0, "5x diameter is the floor");
        assert!(!circuit.path_d.is_empty(), "every circuit must draw");
    }
}
