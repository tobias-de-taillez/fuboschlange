//! Draws a certified Schnecke to an SVG you can hold against the floor.
//!
//! ```text
//! cargo run --example schnecke_svg -- 3000 2400 75 > schnecke.svg
//! ```
//!
//! Arguments, all in millimetres, all optional:
//! room width, room height, pipe spacing, connection offset along the bottom
//! wall. The defaults are the room this project has been measured against.
//!
//! The path drawn is the same one `certify_loop` judges — the example runs the
//! real pipeline and refuses to draw anything the validator rejects, so an SVG
//! coming out of here is a loop that certified.

use single_loop_solver::circuit::Field;
use single_loop_solver::circuit::{
    ConnectionInput, LoopCandidate, LoopContext, LoopSection, RectMm, SectionKind, attach_port,
    build_connection_zone, build_graph_view, build_schnecke, certify_loop, filter_zone_nopps,
};
use single_loop_solver::geometry::Polygon;
use single_loop_solver::model::{PathPrimitive, Point};
use single_loop_solver::plate::{
    PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, build_embedded_graph,
};

const WALL_CLEARANCE_MM: f64 = 75.0;
/// Half the nub pitch of a BEKOTEC-EN 23 FI 30 plate: the channel lattice.
const CHANNEL_PITCH_MM: f64 = 75.0;
const PIPE_DIAMETER_MM: f64 = 16.0;

fn main() -> Result<(), String> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let number = |position: usize, fallback: f64| -> f64 {
        arguments
            .get(position)
            .and_then(|text| text.parse().ok())
            .unwrap_or(fallback)
    };
    let width_mm = number(0, 3000.0);
    let height_mm = number(1, 2400.0);
    let spacing_mm = number(2, 75.0);
    let connection_offset_mm = number(3, width_mm / 2.0);

    let polygon = Polygon::try_from_original(vec![
        Point::new(0.0, 0.0),
        Point::new(width_mm, 0.0),
        Point::new(width_mm, height_mm),
        Point::new(0.0, height_mm),
    ])
    .map_err(|error| format!("{error:?}"))?;
    let transform = PlateTransform::from_edge(
        Point::new(0.0, 0.0),
        Point::new(width_mm, 0.0),
        Point::new(width_mm / 2.0, height_mm / 2.0),
        0.0,
        0.0,
    )
    .map_err(|error| format!("{error:?}"))?;

    let base = PlateInstance::new(
        polygon.clone(),
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        50_000,
    )
    .map_err(|error| format!("{error:?}"))?;
    let graph = build_embedded_graph(&base, WALL_CLEARANCE_MM, PlateGraphLimits::default())
        .map_err(|error| format!("{error:?}"))?;
    let zone = build_connection_zone(
        &polygon,
        &transform,
        &ConnectionInput {
            edge_index: 0,
            center_offset_mm: connection_offset_mm,
            zone_width_mm: 600.0,
            // The zone must sever the two outermost lanes — where the arms
            // start and end — and leave the third alone, or the inward arm
            // cannot get past it on its way round.
            zone_depth_mm: WALL_CLEARANCE_MM + 1.5 * spacing_mm,
        },
    )
    .map_err(|error| format!("{error:?}"))?;
    let view = build_graph_view(&graph, &zone, &transform);
    let mut instance = base;
    filter_zone_nopps(&mut instance, &zone);

    let field = Field {
        id: 0,
        rect_local: RectMm {
            min: Point::new(0.0, 0.0),
            max: Point::new(width_mm, height_mm),
        },
    };
    let schnecke = build_schnecke(
        &field,
        spacing_mm,
        WALL_CLEARANCE_MM,
        &graph,
        &view,
        &zone,
        &instance,
    )
    .map_err(|error| format!("{:?}: {}", error.code, error.message))?;

    let candidate = assemble(&schnecke, &graph, &zone, &instance)?;
    let certificate = certify_loop(
        &candidate,
        &LoopContext {
            instance: &instance,
            graph: &graph,
            view: &view,
            zone: &zone,
            lanes: &schnecke.lanes,
        },
    )
    .map_err(|error| format!("{:?}: {}", error.code, error.message))?;

    eprintln!(
        "{} lanes, {:.0} mm of pipe, worst uncovered point {:.0} mm, \
         min bend radius {:.1} mm, spacing penalty {:.1} mm",
        schnecke.lanes.len(),
        certificate.total_length_mm,
        certificate.coverage.upper_bound_mm,
        certificate.min_bend_radius_mm,
        certificate.penalty_sum_mm,
    );
    print!(
        "{}",
        svg(
            width_mm,
            height_mm,
            spacing_mm,
            &candidate,
            certificate.total_length_mm
        )
    );
    Ok(())
}

fn assemble(
    schnecke: &single_loop_solver::circuit::Schnecke,
    graph: &single_loop_solver::plate::EmbeddedPoseGraph,
    zone: &single_loop_solver::circuit::ConnectionZone,
    instance: &PlateInstance,
) -> Result<LoopCandidate, String> {
    let node = |id: u32| {
        graph
            .nodes
            .iter()
            .find(|node| node.id == id)
            .expect("build_schnecke only names real certified nodes")
    };
    let ends = schnecke
        .path
        .ends
        .ok_or_else(|| "the Schnecke never reached the zone".to_owned())?;

    let entry = attach_port(
        ends.entry_port,
        zone.inward,
        node(ends.entry_anchor_node_id),
        instance,
    )
    .map_err(|error| error.message.clone())?
    .primitives;
    let exit: Vec<PathPrimitive> = attach_port(
        ends.exit_port,
        zone.inward,
        node(ends.exit_anchor_node_id),
        instance,
    )
    .map_err(|error| error.message.clone())?
    .primitives
    .iter()
    .rev()
    .map(reverse_primitive)
    .collect();

    let mut sections = vec![LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: entry,
    }];
    let path = &schnecke.path;
    let empty: Vec<Option<u32>> = Vec::new();
    for (kind, edge_ids, lane_ids) in [
        (
            SectionKind::Inward,
            &path.inward_edge_ids,
            &path.inward_lane_ids,
        ),
        (SectionKind::Turn, &path.turn_edge_ids, &empty),
        (
            SectionKind::Return,
            &path.return_edge_ids,
            &path.return_lane_ids,
        ),
    ] {
        for (position, edge_id) in edge_ids.iter().enumerate() {
            let reported = lane_ids.get(position).copied().flatten();
            let (kind, lane_id) = match reported {
                Some(lane) => (kind, Some(lane)),
                None if kind == SectionKind::Turn => (kind, None),
                None => (SectionKind::Hop, None),
            };
            let edge = graph
                .edges
                .iter()
                .find(|edge| edge.id == *edge_id)
                .expect("build_schnecke only names real certified edges");
            sections.push(LoopSection {
                kind,
                edge_id: Some(*edge_id),
                lane_id,
                primitives: edge.primitives.clone(),
            });
        }
    }
    sections.push(LoopSection {
        kind: SectionKind::Zone,
        edge_id: None,
        lane_id: None,
        primitives: exit,
    });
    Ok(LoopCandidate { sections })
}

fn reverse_primitive(primitive: &PathPrimitive) -> PathPrimitive {
    match primitive {
        PathPrimitive::Line { start, end } => PathPrimitive::Line {
            start: *end,
            end: *start,
        },
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => PathPrimitive::Arc {
            start: *end,
            end: *start,
            center: *center,
            radius_mm: *radius_mm,
            sweep_rad: -*sweep_rad,
        },
    }
}

/// The whole loop as one SVG path, drawn to scale in millimetres, with the
/// room outline and the nub grid behind it. Y is flipped so the drawing reads
/// the way the room does — origin bottom-left, the connection wall at the
/// bottom.
fn svg(
    width_mm: f64,
    height_mm: f64,
    spacing_mm: f64,
    candidate: &LoopCandidate,
    length_mm: f64,
) -> String {
    let margin = 120.0;
    let mut out = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{:.0} {:.0} {:.0} {:.0}\" \
         width=\"100%\">\n<g transform=\"translate(0,{:.0}) scale(1,-1)\">\n",
        -margin,
        -margin,
        width_mm + 2.0 * margin,
        height_mm + 2.0 * margin,
        height_mm,
    );

    out.push_str("<g stroke=\"#e6e2da\" stroke-width=\"1\">\n");
    let mut line = CHANNEL_PITCH_MM / 2.0;
    while line < width_mm {
        out.push_str(&format!(
            "<line x1=\"{line:.1}\" y1=\"0\" x2=\"{line:.1}\" y2=\"{height_mm:.1}\"/>\n"
        ));
        line += CHANNEL_PITCH_MM;
    }
    let mut line = CHANNEL_PITCH_MM / 2.0;
    while line < height_mm {
        out.push_str(&format!(
            "<line x1=\"0\" y1=\"{line:.1}\" x2=\"{width_mm:.1}\" y2=\"{line:.1}\"/>\n"
        ));
        line += CHANNEL_PITCH_MM;
    }
    out.push_str("</g>\n");

    out.push_str(&format!(
        "<rect x=\"0\" y=\"0\" width=\"{width_mm:.1}\" height=\"{height_mm:.1}\" \
         fill=\"none\" stroke=\"#3a3632\" stroke-width=\"12\"/>\n"
    ));

    // The pipe, at its real 16 mm outside diameter, so two runs that look
    // like they touch on paper really do.
    out.push_str(&format!(
        "<path fill=\"none\" stroke=\"#b4441f\" stroke-width=\"{PIPE_DIAMETER_MM}\" \
         stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\"0.85\" d=\""
    ));
    let mut started = false;
    for section in &candidate.sections {
        for primitive in &section.primitives {
            match primitive {
                PathPrimitive::Line { start, end } => {
                    if !started {
                        out.push_str(&format!("M {:.2} {:.2} ", start.x, start.y));
                        started = true;
                    }
                    out.push_str(&format!("L {:.2} {:.2} ", end.x, end.y));
                }
                PathPrimitive::Arc {
                    start,
                    end,
                    radius_mm,
                    sweep_rad,
                    ..
                } => {
                    if !started {
                        out.push_str(&format!("M {:.2} {:.2} ", start.x, start.y));
                        started = true;
                    }
                    let large = u8::from(sweep_rad.abs() > std::f64::consts::PI);
                    let sweep = u8::from(*sweep_rad > 0.0);
                    out.push_str(&format!(
                        "A {radius_mm:.2} {radius_mm:.2} 0 {large} {sweep} {:.2} {:.2} ",
                        end.x, end.y
                    ));
                }
            }
        }
    }
    out.push_str("\"/>\n</g>\n");

    out.push_str(&format!(
        "<text x=\"{:.0}\" y=\"{:.0}\" font-family=\"sans-serif\" font-size=\"64\" \
         fill=\"#3a3632\">{width_mm:.0} x {height_mm:.0} mm, Verlegeabstand {spacing_mm:.0} mm, \
         {:.1} m Rohr</text>\n</svg>\n",
        -margin + 10.0,
        height_mm + margin - 20.0,
        length_mm / 1000.0,
    ));
    out
}
