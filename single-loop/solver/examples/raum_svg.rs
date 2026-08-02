//! The room plan as one SVG sheet, from the same `plan_room` the browser calls.
//!
//! Usage: `cargo run --release --example raum_svg -- <aufmass.json> [spacing] > plan.svg`
//!
//! Exists so a plan can be looked at, printed and diffed without a browser —
//! and so the page and the command line can never drift, because both go
//! through `plan_room` and nothing else.

use single_loop_solver::circuit::{RoomPlan, RoomPlanInput, plan_room};
use single_loop_solver::model::Point;

const INK: [&str; 6] = ["#c2410c", "#1d4ed8", "#15803d", "#7e22ce", "#b91c1c", "#0f766e"];
const NOPP_PITCH_MM: f64 = 75.0;

fn ring_from_survey(text: &str) -> Result<Vec<Point>, String> {
    let value: serde_json::Value = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let mut by_id = std::collections::BTreeMap::new();
    for point in value["pts"].as_array().ok_or("kein pts-Array")? {
        by_id.insert(
            point["id"].as_str().ok_or("Punkt ohne id")?.to_owned(),
            Point::new(
                point["x"].as_f64().ok_or("Punkt ohne x")?,
                point["y"].as_f64().ok_or("Punkt ohne y")?,
            ),
        );
    }
    let mut neighbours: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    let walls = value["walls"].as_array().ok_or("kein walls-Array")?;
    for wall in walls {
        let ends = wall.as_array().ok_or("Wand ist kein Paar")?;
        let (from, to) = (
            ends[0].as_str().ok_or("Wand ohne Start")?.to_owned(),
            ends[1].as_str().ok_or("Wand ohne Ende")?.to_owned(),
        );
        neighbours.entry(from.clone()).or_default().push(to.clone());
        neighbours.entry(to).or_default().push(from);
    }
    for (id, list) in &neighbours {
        if list.len() != 2 {
            return Err(format!(
                "Punkt {id} hat {} Wände statt zwei — der Ring ist offen",
                list.len()
            ));
        }
    }

    let start = walls[0].as_array().unwrap()[0].as_str().unwrap().to_owned();
    let mut ring = vec![start.clone()];
    let (mut previous, mut current) = (None::<String>, start.clone());
    loop {
        let next = neighbours[&current]
            .iter()
            .find(|candidate| Some(*candidate) != previous.as_ref())
            .ok_or_else(|| format!("Der Wandzug endet bei {current}"))?
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

fn polygon(points: &[Point]) -> String {
    points
        .iter()
        .map(|point| format!("{:.1},{:.1}", point.x, point.y))
        .collect::<Vec<_>>()
        .join(" ")
}

fn sheet(plan: &RoomPlan) -> String {
    let all: Vec<Point> = plan
        .measured_local
        .iter()
        .chain(&plan.room_local)
        .copied()
        .collect();
    let margin = 400.0;
    let min_x = all.iter().map(|p| p.x).fold(f64::MAX, f64::min) - margin;
    let max_x = all.iter().map(|p| p.x).fold(f64::MIN, f64::max) + margin;
    let min_y = all.iter().map(|p| p.y).fold(f64::MAX, f64::min) - margin;
    let max_y = all.iter().map(|p| p.y).fold(f64::MIN, f64::max) + margin;
    let (width, height) = (max_x - min_x, max_y - min_y);

    let mut noppen = String::new();
    let mut i = (min_x / NOPP_PITCH_MM).ceil() as i64;
    while (i as f64) * NOPP_PITCH_MM <= max_x {
        let mut j = (min_y / NOPP_PITCH_MM).ceil() as i64;
        while (j as f64) * NOPP_PITCH_MM <= max_y {
            let large = (i.rem_euclid(2) + j.rem_euclid(2)).rem_euclid(2) == 0;
            noppen.push_str(&format!(
                r##"<circle cx="{:.1}" cy="{:.1}" r="{}"/>"##,
                i as f64 * NOPP_PITCH_MM,
                j as f64 * NOPP_PITCH_MM,
                if large { 17.5 } else { 10.5 }
            ));
            j += 1;
        }
        i += 1;
    }

    let circuits: String = plan
        .circuits
        .iter()
        .enumerate()
        .map(|(index, circuit)| {
            format!(
                r##"<path d="{}" fill="none" stroke="{}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>"##,
                circuit.path_d,
                INK[index % INK.len()]
            )
        })
        .collect();
    let manifold = plan
        .manifold_local
        .map(|point| {
            format!(
                r##"<circle cx="{:.1}" cy="{:.1}" r="90" fill="#111" opacity="0.85"/><circle cx="{:.1}" cy="{:.1}" r="150" fill="none" stroke="#111" stroke-width="14" stroke-dasharray="40 30"/>"##,
                point.x, point.y, point.x, point.y
            )
        })
        .unwrap_or_default();
    let band = if plan.band_inner_local.is_empty() {
        String::new()
    } else {
        format!(
            r##"<polygon points="{}" fill="none" stroke="#a16207" stroke-width="10" stroke-dasharray="60 40"/>"##,
            polygon(&plan.band_inner_local)
        )
    };

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{min_x:.1} {min_y:.1} {width:.1} {height:.1}" width="1400">
<rect x="{min_x:.1}" y="{min_y:.1}" width="{width:.1}" height="{height:.1}" fill="#fbfaf8"/>
<defs><clipPath id="room"><polygon points="{room}"/></clipPath></defs>
<g transform="translate(0 {flip:.1}) scale(1 -1)">
<g clip-path="url(#room)" fill="#d9d4cc">{noppen}</g>
<polygon points="{measured}" fill="none" stroke="#9ca3af" stroke-width="8" stroke-dasharray="50 40"/>
<polygon points="{room}" fill="none" stroke="#111" stroke-width="14"/>
{band}{circuits}{manifold}
</g>
</svg>"##,
        flip = 2.0 * min_y + height,
        room = polygon(&plan.room_local),
        measured = polygon(&plan.measured_local),
    )
}

fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let path = args.next().ok_or("Aufruf: raum_svg <aufmass.json> [abstand]")?;
    let spacing: f64 = args.next().and_then(|text| text.parse().ok()).unwrap_or(150.0);

    let text = std::fs::read_to_string(&path).map_err(|error| format!("{path}: {error}"))?;
    let ring = ring_from_survey(&text)?;
    let plan = plan_room(RoomPlanInput {
        ring,
        manifold: None,
        fill_spacing_mm: spacing,
        wall_clearance_mm: 75.0,
        edge_band_mm: 300.0,
    })
    .map_err(|error| error.message)?;

    eprintln!(
        "gemessen {:.2} m², begradigt {:.2} m², Fuellflaeche {:.2} m²; {} Kreise auf {} Noppen",
        plan.measured_area_m2,
        plan.rectified_area_m2,
        plan.fill_area_m2,
        plan.circuits.len(),
        plan.nopp_count
    );
    for (index, circuit) in plan.circuits.iter().enumerate() {
        eprintln!(
            "  Kreis {}: {:.1} m bei {:.0} mm, {} Bahnen, Biegeradius {:.0} mm, Strafe {:.0} mm",
            index + 1,
            circuit.total_length_mm / 1000.0,
            circuit.pipe_spacing_mm,
            circuit.lanes,
            circuit.min_bend_radius_mm,
            circuit.penalty_sum_mm
        );
    }
    for refusal in &plan.refused {
        eprintln!("  kein Kreis: {refusal}");
    }
    println!("{}", sheet(&plan));
    Ok(())
}
