//! One call from room dimensions to a certified Schnecke and a drawing of it.
//!
//! The pipeline — plate instance, certified graph, connection zone, graph
//! view, [`build_schnecke`], `attach_port` ×2, [`certify_loop`] — is the same
//! whether it runs from the CLI example or from the browser, so it lives here
//! rather than in either caller. Nothing is drawn that the validator has not
//! certified: [`plan_schnecke`] returns the rejection instead.

use serde::{Deserialize, Serialize};

use crate::circuit::fields::Field;
use crate::circuit::schnecke::build_schnecke;
use crate::circuit::types::{LoopError, LoopErrorCode, RectMm};
use crate::circuit::validate::{
    LoopCandidate, LoopContext, LoopSection, SectionKind, certify_loop,
};
use crate::circuit::zone::{attach_port, build_connection_zone, build_graph_view, filter_zone_nopps};
use crate::geometry::Polygon;
use crate::model::{PathPrimitive, Point};
use crate::plate::{
    NoppType, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, build_embedded_graph,
};

/// Every nub the pipe has to clear, drawn at its real body.
const PIPE_DIAMETER_MM: f64 = 16.0;
const CHANNEL_PITCH_MM: f64 = 75.0;
const MAX_NOPPS: usize = 200_000;

/// What the caller chooses. Millimetres throughout.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchneckeInput {
    pub width_mm: f64,
    pub height_mm: f64,
    /// Gap between the outbound and return runs. Must be a whole multiple of
    /// the 75 mm channel pitch — the nub raster is the only place a pipe sits.
    pub pipe_spacing_mm: f64,
    pub wall_clearance_mm: f64,
    /// Where the manifold connects, measured along the bottom wall.
    pub connection_offset_mm: f64,
    pub zone_width_mm: f64,
}

/// A certified Schnecke and the numbers that decide whether to lay it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchneckePlan {
    pub svg: String,
    pub lanes: usize,
    pub total_length_mm: f64,
    /// Distance from the worst-served point of the floor to the nearest pipe.
    pub coverage_worst_mm: f64,
    pub min_bend_radius_mm: f64,
    pub min_center_distance_mm: f64,
    pub penalty_sum_mm: f64,
    pub nopp_count: usize,
    /// The zone depth the spacing forces (see [`zone_depth_mm`]).
    pub zone_depth_mm: f64,
}

/// The connection zone has to sever the two outermost lanes — that is where
/// the two arms start and end — but must leave the third alone, or the inward
/// arm cannot get past it on its way round. With the outermost row a wall
/// clearance in and the lanes one spacing apart, that is strictly between the
/// second row and the third.
pub fn zone_depth_mm(wall_clearance_mm: f64, pipe_spacing_mm: f64) -> f64 {
    wall_clearance_mm + 1.5 * pipe_spacing_mm
}

/// Plans and certifies the Schnecke for a rectangular room, and draws it.
pub fn plan_schnecke(input: SchneckeInput) -> Result<SchneckePlan, LoopError> {
    let SchneckeInput {
        width_mm,
        height_mm,
        pipe_spacing_mm,
        wall_clearance_mm,
        connection_offset_mm,
        zone_width_mm,
    } = input;
    if !(width_mm.is_finite() && height_mm.is_finite() && width_mm > 0.0 && height_mm > 0.0) {
        return Err(reject("the room must have a positive width and height"));
    }

    let polygon = Polygon::try_from_original(vec![
        Point::new(0.0, 0.0),
        Point::new(width_mm, 0.0),
        Point::new(width_mm, height_mm),
        Point::new(0.0, height_mm),
    ])
    .map_err(|error| reject(format!("the room outline is not a valid polygon: {error:?}")))?;
    let transform = PlateTransform::from_edge(
        Point::new(0.0, 0.0),
        Point::new(width_mm, 0.0),
        Point::new(width_mm / 2.0, height_mm / 2.0),
        0.0,
        0.0,
    )
    .map_err(|error| reject(format!("the connection edge is degenerate: {error:?}")))?;

    let base = PlateInstance::new(
        polygon.clone(),
        transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        MAX_NOPPS,
    )
    .map_err(|error| reject(format!("the plate does not fit this room: {error:?}")))?;
    let graph = build_embedded_graph(&base, wall_clearance_mm, PlateGraphLimits::default())
        .map_err(|error| reject(format!("no certified pose graph for this room: {error:?}")))?;

    let depth_mm = zone_depth_mm(wall_clearance_mm, pipe_spacing_mm);
    let zone = build_connection_zone(
        &polygon,
        &transform,
        &crate::circuit::types::ConnectionInput {
            edge_index: 0,
            center_offset_mm: connection_offset_mm,
            zone_width_mm,
            zone_depth_mm: depth_mm,
        },
    )?;
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
        pipe_spacing_mm,
        wall_clearance_mm,
        &graph,
        &view,
        &zone,
        &instance,
    )?;

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
    )?;

    Ok(SchneckePlan {
        svg: svg(
            width_mm,
            height_mm,
            pipe_spacing_mm,
            &instance,
            &candidate,
            certificate.total_length_mm,
        ),
        lanes: schnecke.lanes.len(),
        total_length_mm: certificate.total_length_mm,
        coverage_worst_mm: certificate.coverage.upper_bound_mm,
        min_bend_radius_mm: certificate.min_bend_radius_mm,
        min_center_distance_mm: certificate.min_center_distance_mm.distance_mm,
        penalty_sum_mm: certificate.penalty_sum_mm,
        nopp_count: instance.nopps.len(),
        zone_depth_mm: depth_mm,
    })
}

fn reject(message: impl Into<String>) -> LoopError {
    LoopError {
        code: LoopErrorCode::NoSolutionGeometry,
        message: message.into(),
        journal_tail: Vec::new(),
    }
}

/// Turns the Schnecke's path into the flat section list `certify_loop` judges.
fn assemble(
    schnecke: &crate::circuit::schnecke::Schnecke,
    graph: &crate::plate::EmbeddedPoseGraph,
    zone: &crate::circuit::zone::ConnectionZone,
    instance: &PlateInstance,
) -> Result<LoopCandidate, LoopError> {
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
        .ok_or_else(|| reject("the Schnecke never reached the connection zone"))?;

    let entry = attach_port(
        ends.entry_port,
        zone.inward,
        node(ends.entry_anchor_node_id),
        instance,
    )?
    .primitives;
    let exit: Vec<PathPrimitive> = attach_port(
        ends.exit_port,
        zone.inward,
        node(ends.exit_anchor_node_id),
        instance,
    )?
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

/// The loop over the nub field it is threaded through, to scale in
/// millimetres, pipe at its true outside diameter. Y is flipped so the drawing
/// reads the way the room does: origin bottom-left, connection wall at the
/// bottom.
fn svg(
    width_mm: f64,
    height_mm: f64,
    spacing_mm: f64,
    instance: &PlateInstance,
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

    // The real nub field, not a helper grid: the checkerboard of large and
    // small nubs on the 75 mm pitch, each with the body the pipe must clear.
    // Where two of those bodies nearly touch is the channel, which is what
    // makes 75 mm pipe spacing possible at all.
    out.push_str("<g>\n");
    for nopp in &instance.nopps {
        let local = instance.transform.to_local(nopp.center);
        if local.x < -CHANNEL_PITCH_MM
            || local.y < -CHANNEL_PITCH_MM
            || local.x > width_mm + CHANNEL_PITCH_MM
            || local.y > height_mm + CHANNEL_PITCH_MM
        {
            continue;
        }
        let opacity = match nopp.nopp_type {
            NoppType::Large => 0.55,
            NoppType::Small => 0.30,
        };
        out.push_str(&format!(
            "<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"{:.1}\" fill=\"#e8a33d\" \
             opacity=\"{opacity}\"/>\n",
            local.x, local.y, nopp.rendered_radius_mm
        ));
        out.push_str(&format!(
            "<circle cx=\"{:.1}\" cy=\"{:.1}\" r=\"{:.1}\" fill=\"none\" stroke=\"#c98a2a\" \
             stroke-width=\"1.5\" opacity=\"0.45\"/>\n",
            local.x, local.y, nopp.forbidden_radius_mm
        ));
    }
    out.push_str("</g>\n");

    out.push_str(&format!(
        "<rect x=\"0\" y=\"0\" width=\"{width_mm:.1}\" height=\"{height_mm:.1}\" fill=\"none\" \
         stroke=\"#3a3632\" stroke-width=\"12\"/>\n"
    ));

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
