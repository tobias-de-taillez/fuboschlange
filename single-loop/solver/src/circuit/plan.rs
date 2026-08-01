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
use crate::circuit::types::{LoopError, LoopErrorCode, LoopPattern, RectMm};
use crate::circuit::validate::{
    LoopCandidate, LoopContext, LoopSection, SectionKind, certify_loop,
};
use crate::circuit::zone::{
    attach_port, build_connection_zone, build_graph_view, filter_zone_nopps,
};
use crate::geometry::Polygon;
use crate::model::{PathPrimitive, Point};
use crate::plate::{
    NoppType, PlateGraphLimits, PlateInstance, PlateProfile, PlateTransform, build_embedded_graph,
};

/// Every nub the pipe has to clear, drawn at its real body.
const PIPE_DIAMETER_MM: f64 = 16.0;
const CHANNEL_PITCH_MM: f64 = 75.0;
/// Channels sit midway between nub rows, at `37.5 + 75n`.
const CHANNEL_OFFSET_MM: f64 = 37.5;
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
    /// The loop alone, as SVG path data in the field's own frame (origin at
    /// its bottom-left, y up). What a multi-field drawing composes: it can
    /// translate this into room coordinates, which the whole-page `svg` above
    /// cannot be.
    pub path_d: String,
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
    .map_err(|error| {
        reject(format!(
            "the room outline is not a valid polygon: {error:?}"
        ))
    })?;
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
            pattern: LoopPattern::Spiral,
        },
    )?;

    Ok(SchneckePlan {
        path_d: path_data(&candidate),
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

/// The loop as SVG path data, in the plate-local frame.
fn path_data(candidate: &LoopCandidate) -> String {
    let mut out = String::new();
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
    out
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
         stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\"0.85\" d=\"{}\"/>\n</g>\n",
        path_data(candidate)
    ));

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

// ---------------------------------------------------------------------------
// Many circuits, one nub field
// ---------------------------------------------------------------------------

/// One circuit of a multi-circuit room.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CircuitPlan {
    /// The field it fills, in the shared plate-local frame.
    pub rect_local: RectMm,
    pub pipe_spacing_mm: f64,
    /// The loop as SVG path data, in that same shared frame — so every
    /// circuit's path can be drawn into one picture without a per-circuit
    /// translation, which is what having one lattice buys.
    pub path_d: String,
    pub lanes: usize,
    pub total_length_mm: f64,
    pub min_bend_radius_mm: f64,
    pub min_center_distance_mm: f64,
    pub penalty_sum_mm: f64,
}

/// Every circuit of a room, plus what they share.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiPlan {
    pub circuits: Vec<CircuitPlan>,
    /// The room outline in the shared plate-local frame.
    pub room_local: Vec<Point>,
    /// Fields that produced no certified circuit, with the reason.
    pub refused: Vec<String>,
    pub nopp_count: usize,
}

/// Plans every circuit of a rectilinear room against **one** nub field.
///
/// The plate instance, its nub lattice and the certified pose graph are built
/// once, from one transform, and every field is planned against that. Planning
/// each field as a room of its own — which is what calling [`plan_schnecke`]
/// per field does — gives each one its own lattice anchored at its own origin,
/// and those lattices do not agree: on the room this was built for they sat
/// 2.3 to 20.9 mm apart, against 11.5 mm of clearance between a channel and a
/// large nub's body. Only one of them could have been the real floor.
///
/// `room_local` must be an axis-parallel outline in the frame `transform`
/// defines, and `fields` axis-parallel rectangles inside it. Both come from
/// [`super::rectify`] and [`super::slab_fields`]; field edges are snapped onto
/// the channel lattice here, because a cut off the lattice moves every lane in
/// the field off it too.
pub fn plan_multi(
    room_world: &[Point],
    fields_local: &[(Field, f64)],
    transform: &PlateTransform,
    wall_clearance_mm: f64,
) -> Result<MultiPlan, LoopError> {
    let polygon = Polygon::try_from_original(room_world.to_vec()).map_err(|error| {
        reject(format!(
            "the room outline is not a valid polygon: {error:?}"
        ))
    })?;
    // One instance, one lattice, one graph — for every circuit in the room.
    let base = PlateInstance::new(
        polygon.clone(),
        *transform,
        PlateProfile::bekotec_en_23_fi_30_16(),
        MAX_NOPPS,
    )
    .map_err(|error| reject(format!("the plate does not fit this room: {error:?}")))?;
    let graph = build_embedded_graph(&base, wall_clearance_mm, PlateGraphLimits::default())
        .map_err(|error| reject(format!("no certified pose graph for this room: {error:?}")))?;
    let nopp_count = base.nopps.len();

    let mut circuits = Vec::new();
    let mut refused = Vec::new();
    // Each circuit carries its own pipe spacing: an edge zone is laid dense
    // where the heat is lost and the field wider, and one number for the whole
    // room cannot express that.
    for (field, pipe_spacing_mm) in fields_local {
        let field = snap_to_channels(field);
        let width = field.rect_local.max.x - field.rect_local.min.x;
        let depth_mm = zone_depth_mm(wall_clearance_mm, *pipe_spacing_mm);
        match plan_one(
            &field,
            &graph,
            &base,
            transform,
            *pipe_spacing_mm,
            wall_clearance_mm,
            depth_mm,
        ) {
            Ok(circuit) => circuits.push(circuit),
            Err(error) => refused.push(format!(
                "field at ({:.0}, {:.0}), {width:.0} mm wide: {}",
                field.rect_local.min.x, field.rect_local.min.y, error.message
            )),
        }
    }

    Ok(MultiPlan {
        circuits,
        room_local: room_world
            .iter()
            .map(|vertex| transform.to_local(*vertex))
            .collect(),
        refused,
        nopp_count,
    })
}

/// A field whose edges sit on the channel lattice.
///
/// Shrunk, never grown: a field that reached past its slab would put pipe in
/// the neighbour's lane. The lost strip is under one channel pitch per edge.
fn snap_to_channels(field: &Field) -> Field {
    let inward = |value: f64| {
        CHANNEL_OFFSET_MM
            + ((value - CHANNEL_OFFSET_MM) / CHANNEL_PITCH_MM).ceil() * CHANNEL_PITCH_MM
    };
    let outward = |value: f64| {
        CHANNEL_OFFSET_MM
            + ((value - CHANNEL_OFFSET_MM) / CHANNEL_PITCH_MM).floor() * CHANNEL_PITCH_MM
    };
    Field {
        id: field.id,
        rect_local: RectMm {
            min: Point::new(
                inward(field.rect_local.min.x),
                inward(field.rect_local.min.y),
            ),
            max: Point::new(
                outward(field.rect_local.max.x),
                outward(field.rect_local.max.y),
            ),
        },
    }
}

/// One field against the shared lattice.
///
/// The connection zone is built from the *field's* own rectangle rather than
/// the room's outline, so a field whose bottom edge is an interior cut still
/// gets one. The zone rectangle it returns is in the shared frame, so the
/// room-wide graph is what gets cut and the room-wide instance is what the
/// noppen are checked against — the field never gets a plate of its own.
fn plan_one(
    field: &Field,
    graph: &crate::plate::EmbeddedPoseGraph,
    base: &PlateInstance,
    transform: &PlateTransform,
    pipe_spacing_mm: f64,
    wall_clearance_mm: f64,
    depth_mm: f64,
) -> Result<CircuitPlan, LoopError> {
    let rect = &field.rect_local;
    let corners = [
        transform.to_world(Point::new(rect.min.x, rect.min.y)),
        transform.to_world(Point::new(rect.max.x, rect.min.y)),
        transform.to_world(Point::new(rect.max.x, rect.max.y)),
        transform.to_world(Point::new(rect.min.x, rect.max.y)),
    ];
    let field_polygon = Polygon::try_from_original(corners.to_vec())
        .map_err(|error| reject(format!("the field is not a valid rectangle: {error:?}")))?;
    let width = rect.max.x - rect.min.x;
    let zone = build_connection_zone(
        &field_polygon,
        transform,
        &crate::circuit::types::ConnectionInput {
            edge_index: 0,
            center_offset_mm: width / 2.0,
            zone_width_mm: 600.0_f64.min(width / 2.0),
            zone_depth_mm: depth_mm,
        },
    )?;
    let view = build_graph_view(graph, &zone, transform);
    let mut instance = base.clone();
    filter_zone_nopps(&mut instance, &zone);

    let schnecke = build_schnecke(
        field,
        pipe_spacing_mm,
        wall_clearance_mm,
        graph,
        &view,
        &zone,
        &instance,
    )?;
    let candidate = assemble(&schnecke, graph, &zone, &instance)?;
    let certificate = certify_loop(
        &candidate,
        &LoopContext {
            instance: &instance,
            graph,
            view: &view,
            zone: &zone,
            lanes: &schnecke.lanes,
            pattern: LoopPattern::Spiral,
        },
    )?;

    Ok(CircuitPlan {
        rect_local: rect.clone(),
        pipe_spacing_mm,
        path_d: path_data_local(&candidate, transform),
        lanes: schnecke.lanes.len(),
        total_length_mm: certificate.total_length_mm,
        min_bend_radius_mm: certificate.min_bend_radius_mm,
        min_center_distance_mm: certificate.min_center_distance_mm.distance_mm,
        penalty_sum_mm: certificate.penalty_sum_mm,
    })
}

/// The loop as SVG path data in the shared plate-local frame.
fn path_data_local(candidate: &LoopCandidate, transform: &PlateTransform) -> String {
    let local = LoopCandidate {
        sections: candidate
            .sections
            .iter()
            .map(|section| LoopSection {
                kind: section.kind,
                edge_id: section.edge_id,
                lane_id: section.lane_id,
                primitives: section
                    .primitives
                    .iter()
                    .map(|primitive| transform.primitive_to_local(primitive))
                    .collect(),
            })
            .collect(),
    };
    path_data(&local)
}
