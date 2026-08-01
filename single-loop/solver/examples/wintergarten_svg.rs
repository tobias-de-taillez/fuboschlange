//! The whole Wintergarten, laid out circuit by circuit, drawn to one page.
//!
//! ```text
//! cargo run --example wintergarten_svg -- 75 > wintergarten.svg
//! ```
//!
//! Splits the rectified room into fields of roughly equal area — one pass, by
//! area alone, which is where the balancer starts — lays a certified Schnecke
//! in each, and composes them into a single drawing with the per-circuit
//! lengths beside it.
//!
//! **What this is not, yet.** Each field is planned as a room of its own, with
//! its own connection zone on its own bottom edge. Where that edge is an
//! interior cut rather than a real wall, the manifold cannot actually sit
//! there: the leads would have to cross the neighbouring field, and routing
//! them is the piece that is still missing. The geometry of every circuit is
//! certified; the way they reach one manifold is not yet planned.

use single_loop_solver::circuit::{Field, plan_multi, rectify, slab_fields};
use single_loop_solver::model::Point;
use single_loop_solver::plate::PlateTransform;

/// Enough pipe for one circuit, per the design spec.
const MAX_LOOP_LENGTH_MM: f64 = 100_000.0;
const WALL_CLEARANCE_MM: f64 = 75.0;
/// Circuit colours, in field order.
const INK: [&str; 8] = [
    "#b4441f", "#1d6b4f", "#2f5d8c", "#8a4fa0", "#a8791b", "#357f86", "#96324a", "#5a6b1f",
];

fn main() -> Result<(), String> {
    let spacing_mm: f64 = std::env::args()
        .nth(1)
        .and_then(|text| text.parse().ok())
        .unwrap_or(75.0);

    let ring = measured_ring()?;
    let room = rectify(&ring).map_err(|error| error.message)?;
    let measured_m2 = area_mm2(&ring) / 1e6;
    let rectified_m2 = area_mm2(&room.vertices) / 1e6;

    // How many circuits the area needs at all: a serpentine at this spacing
    // would take area/spacing of pipe, and one circuit holds 100 m. The real
    // count comes out higher, because a Schnecke never lays the full
    // theoretical length — the wall clearance, the free core and the ring the
    // connection zone cuts all take their share.
    let theoretical_m = rectified_m2 / (spacing_mm / 1000.0);
    let wanted = (theoretical_m / (MAX_LOOP_LENGTH_MM / 1000.0))
        .ceil()
        .max(1.0) as usize;

    let fields = split_by_area(&room, wanted);
    eprintln!(
        "gemessen {measured_m2:.2} m², begradigt {rectified_m2:.2} m²; \
         theoretisch {theoretical_m:.0} m Rohr bei {spacing_mm:.0} mm ⇒ mindestens {wanted} Kreise; \
         zerlegt in {} Felder",
        fields.len()
    );

    // One frame for the whole room, so one nub lattice for every circuit.
    // Which edge it comes from does not matter to the lattice, only that it is
    // the same one for all of them.
    // Any wall gives the same lattice; this one is chosen so the drawing reads
    // the way the room does — the longest wall running in +x, which puts the
    // room upright in the shared frame instead of on its side.
    let (start, end) = reference_wall(&room.vertices);
    let transform = PlateTransform::from_edge(start, end, centroid(&room.vertices), 0.0, 0.0)
        .map_err(|error| format!("the room's reference wall is degenerate: {error:?}"))?;
    let fields_local: Vec<Field> = fields
        .iter()
        .map(|field| Field {
            id: field.id,
            rect_local: to_local_rect(&transform, &field.rect_local),
        })
        .collect();
    let room_world: Vec<Point> = room.vertices.clone();

    let plan = plan_multi(
        &room_world,
        &fields_local,
        &transform,
        spacing_mm,
        WALL_CLEARANCE_MM,
    )
    .map_err(|error| error.message)?;

    for circuit in &plan.circuits {
        eprintln!(
            "  Feld ({:.0}, {:.0}) {:.0} x {:.0} mm: {} Bahnen, {:.1} m, Biegeradius {:.1} mm, \
             Strafe {:.1} mm",
            circuit.rect_local.min.x,
            circuit.rect_local.min.y,
            circuit.rect_local.max.x - circuit.rect_local.min.x,
            circuit.rect_local.max.y - circuit.rect_local.min.y,
            circuit.lanes,
            circuit.total_length_mm / 1000.0,
            circuit.min_bend_radius_mm,
            circuit.penalty_sum_mm,
        );
    }
    for refusal in &plan.refused {
        eprintln!("  kein Kreis: {refusal}");
    }
    eprintln!(
        "  ein Noppenfeld, {} Noppen, fuer alle Kreise",
        plan.nopp_count
    );

    let circuits: Vec<(Field, String, f64, usize)> = plan
        .circuits
        .iter()
        .enumerate()
        .map(|(index, circuit)| {
            (
                Field {
                    id: index as u32,
                    rect_local: circuit.rect_local.clone(),
                },
                circuit.path_d.clone(),
                circuit.total_length_mm,
                circuit.lanes,
            )
        })
        .collect();

    let laid: f64 = circuits.iter().map(|(_, _, length, _)| length).sum();
    let longest = circuits
        .iter()
        .map(|(_, _, length, _)| *length)
        .fold(0.0, f64::max);
    let shortest = circuits
        .iter()
        .map(|(_, _, length, _)| *length)
        .fold(f64::MAX, f64::min);
    eprintln!(
        "\n{} Kreise, {:.1} m verlegt von {theoretical_m:.0} m theoretisch ({:.0} %); \
         kürzester {:.1} m, längster {:.1} m, Spreizung {:.0} %",
        circuits.len(),
        laid / 1000.0,
        100.0 * laid / 1000.0 / theoretical_m,
        shortest / 1000.0,
        longest / 1000.0,
        100.0 * (longest - shortest) / longest,
    );

    print!(
        "{}",
        compose(&plan.room_local, &circuits, spacing_mm, laid, theoretical_m)
    );
    Ok(())
}

/// Splits the room's slabs into `wanted` fields of roughly equal area.
///
/// One pass, by area alone. At a fixed spacing, length is proportional to area
/// up to the coverage loss, so this is the right starting point; correcting it
/// against the lengths that come back is the balancer's job and is not done
/// here. Big slabs are cut across their long axis; the split falls where the
/// running area crosses each target.
fn split_by_area(room: &single_loop_solver::circuit::RectifiedRoom, wanted: usize) -> Vec<Field> {
    let slabs = slab_fields(room, &[]);
    let total: f64 = slabs.iter().map(area_of).sum();
    let target = total / wanted as f64;

    let mut fields: Vec<Field> = Vec::new();
    for slab in &slabs {
        // Each slab gets the share of the circuits its own area earns, and is
        // cut across whichever axis is longer so the pieces stay squat — a
        // long thin field wastes its outermost ring on turns.
        let pieces = (area_of(slab) / target).round().max(1.0) as usize;
        let width = slab.rect_local.max.x - slab.rect_local.min.x;
        let height = slab.rect_local.max.y - slab.rect_local.min.y;
        for index in 0..pieces {
            let (low, high) = (
                index as f64 / pieces as f64,
                (index + 1) as f64 / pieces as f64,
            );
            let rect = if width >= height {
                single_loop_solver::circuit::RectMm {
                    min: Point::new(slab.rect_local.min.x + low * width, slab.rect_local.min.y),
                    max: Point::new(slab.rect_local.min.x + high * width, slab.rect_local.max.y),
                }
            } else {
                single_loop_solver::circuit::RectMm {
                    min: Point::new(slab.rect_local.min.x, slab.rect_local.min.y + low * height),
                    max: Point::new(slab.rect_local.max.x, slab.rect_local.min.y + high * height),
                }
            };
            fields.push(Field {
                id: fields.len() as u32,
                rect_local: rect,
            });
        }
    }
    fields
}

fn area_of(field: &Field) -> f64 {
    (field.rect_local.max.x - field.rect_local.min.x)
        * (field.rect_local.max.y - field.rect_local.min.y)
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

fn compose(
    room_local: &[Point],
    circuits: &[(Field, String, f64, usize)],
    spacing_mm: f64,
    laid_mm: f64,
    theoretical_m: f64,
) -> String {
    let xs: Vec<f64> = room_local.iter().map(|vertex| vertex.x).collect();
    let ys: Vec<f64> = room_local.iter().map(|vertex| vertex.y).collect();
    let (min_x, max_x) = (fold_min(&xs), fold_max(&xs));
    let (min_y, max_y) = (fold_min(&ys), fold_max(&ys));
    let margin = 260.0;
    // The legend sits above the room, and the header has to be tall enough to
    // hold every circuit's line — otherwise the last ones run down into the
    // drawing.
    let line = 165.0;
    let header = 260.0 + line * (circuits.len() as f64 + 1.5);

    let mut out = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{:.0} {:.0} {:.0} {:.0}\" \
         width=\"100%\">\n<g transform=\"translate(0,{:.0}) scale(1,-1)\">\n",
        min_x - margin,
        min_y - header,
        max_x - min_x + 2.0 * margin,
        max_y - min_y + header + margin,
        // The room keeps its own place under the flip; only the viewBox grows
        // upward to make room for the legend. Folding the header into the
        // translate would move the room down with it and put the text back on
        // top of the drawing.
        min_y + max_y,
    );

    let outline: String = room_local
        .iter()
        .map(|vertex| format!("{:.1},{:.1}", vertex.x, vertex.y))
        .collect::<Vec<_>>()
        .join(" ");
    out.push_str(&format!(
        "<polygon points=\"{outline}\" fill=\"#f6f2e9\" stroke=\"#3a3632\" stroke-width=\"20\"/>\n"
    ));

    for (index, (field, path_d, _, _)) in circuits.iter().enumerate() {
        let ink = INK[index % INK.len()];
        out.push_str(&format!(
            "<rect x=\"{:.1}\" y=\"{:.1}\" width=\"{:.1}\" height=\"{:.1}\" fill=\"none\" \
             stroke=\"{ink}\" stroke-width=\"6\" stroke-dasharray=\"40 26\" opacity=\"0.5\"/>\n",
            field.rect_local.min.x,
            field.rect_local.min.y,
            field.rect_local.max.x - field.rect_local.min.x,
            field.rect_local.max.y - field.rect_local.min.y,
        ));
        // No per-field translate: one lattice means one frame, and every
        // path is already in it.
        out.push_str(&format!(
            "<path fill=\"none\" stroke=\"{ink}\" stroke-width=\"16\" stroke-linecap=\"round\" \
             stroke-linejoin=\"round\" opacity=\"0.9\" d=\"{path_d}\"/>\n"
        ));
    }
    out.push_str("</g>\n");

    out.push_str(&format!(
        "<text x=\"{:.0}\" y=\"{:.0}\" font-family=\"sans-serif\" font-size=\"150\" \
         font-weight=\"700\" fill=\"#3a3632\">Wintergarten · {:.0} mm Verlegeabstand · \
         {} Heizkreise · {:.0} m verlegt von {theoretical_m:.0} m</text>\n",
        min_x - margin + 20.0,
        min_y - header + 150.0,
        spacing_mm,
        circuits.len(),
        laid_mm / 1000.0,
    ));
    for (index, (_, _, length, lanes)) in circuits.iter().enumerate() {
        out.push_str(&format!(
            "<text x=\"{:.0}\" y=\"{:.0}\" font-family=\"sans-serif\" font-size=\"120\" \
             fill=\"{}\">Kreis {} · {:.1} m · {lanes} Bahnen</text>\n",
            min_x - margin + 20.0,
            min_y - header + 150.0 + line * (index as f64 + 1.4),
            INK[index % INK.len()],
            index + 1,
            length / 1000.0,
        ));
    }
    out.push_str("</svg>\n");
    out
}

fn fold_min(values: &[f64]) -> f64 {
    values.iter().copied().fold(f64::MAX, f64::min)
}

fn fold_max(values: &[f64]) -> f64 {
    values.iter().copied().fold(f64::MIN, f64::max)
}

/// The surveyed ring, rebuilt from the export's points and walls.
fn measured_ring() -> Result<Vec<Point>, String> {
    let text = std::fs::read_to_string("../fixtures/wintergarten.json")
        .map_err(|error| format!("cannot read the room fixture: {error}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| format!("invalid JSON: {error}"))?;

    let mut by_id = std::collections::BTreeMap::new();
    for point in value["pts"].as_array().ok_or("no pts")? {
        by_id.insert(
            point["id"].as_str().ok_or("point without id")?.to_owned(),
            Point::new(
                point["x"].as_f64().ok_or("point without x")?,
                point["y"].as_f64().ok_or("point without y")?,
            ),
        );
    }
    let mut neighbours: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    for wall in value["walls"].as_array().ok_or("no walls")? {
        let ends = wall.as_array().ok_or("wall is not a pair")?;
        let from = ends[0].as_str().ok_or("wall end")?.to_owned();
        let to = ends[1].as_str().ok_or("wall end")?.to_owned();
        neighbours.entry(from.clone()).or_default().push(to.clone());
        neighbours.entry(to).or_default().push(from);
    }
    if !neighbours.values().all(|list| list.len() == 2) {
        return Err("the walls do not form a single closed ring".to_owned());
    }

    let start = neighbours.keys().next().ok_or("no walls")?.clone();
    let mut ring = vec![start.clone()];
    let (mut previous, mut current) = (None::<String>, start.clone());
    loop {
        let next = neighbours[&current]
            .iter()
            .find(|candidate| Some(*candidate) != previous.as_ref())
            .ok_or("dead end while walking the ring")?
            .clone();
        if next == start {
            break;
        }
        ring.push(next.clone());
        previous = Some(current);
        current = next;
    }
    Ok(ring.into_iter().map(|id| by_id[&id]).collect())
}

/// A world-frame rectangle expressed in `transform`'s local frame. The room is
/// axis-parallel in both, so the corners map straight across.
fn to_local_rect(
    transform: &PlateTransform,
    rect: &single_loop_solver::circuit::RectMm,
) -> single_loop_solver::circuit::RectMm {
    let corners = [
        transform.to_local(Point::new(rect.min.x, rect.min.y)),
        transform.to_local(Point::new(rect.max.x, rect.min.y)),
        transform.to_local(Point::new(rect.max.x, rect.max.y)),
        transform.to_local(Point::new(rect.min.x, rect.max.y)),
    ];
    let xs: Vec<f64> = corners.iter().map(|point| point.x).collect();
    let ys: Vec<f64> = corners.iter().map(|point| point.y).collect();
    single_loop_solver::circuit::RectMm {
        min: Point::new(fold_min(&xs), fold_min(&ys)),
        max: Point::new(fold_max(&xs), fold_max(&ys)),
    }
}

fn centroid(vertices: &[Point]) -> Point {
    let count = vertices.len() as f64;
    Point::new(
        vertices.iter().map(|point| point.x).sum::<f64>() / count,
        vertices.iter().map(|point| point.y).sum::<f64>() / count,
    )
}

/// The wall the shared frame is built from: the longest one running in +x, so
/// the room stands upright in that frame. Falls back to the longest wall of
/// any direction for a room that has none.
fn reference_wall(vertices: &[Point]) -> (Point, Point) {
    let mut best: Option<(f64, Point, Point)> = None;
    let mut fallback: Option<(f64, Point, Point)> = None;
    for index in 0..vertices.len() {
        let from = vertices[index];
        let to = vertices[(index + 1) % vertices.len()];
        let length = (to.x - from.x).hypot(to.y - from.y);
        if fallback.is_none_or(|(held, _, _)| held < length) {
            fallback = Some((length, from, to));
        }
        if to.x > from.x && best.is_none_or(|(held, _, _)| held < length) {
            best = Some((length, from, to));
        }
    }
    let (_, from, to) = best.or(fallback).expect("a room has walls");
    (from, to)
}
