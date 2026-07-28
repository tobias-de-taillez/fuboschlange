use crate::geometry::Polygon;
use crate::model::Point;
use crate::plate::{
    EmbeddedPoseGraph, PlateGraphErrorCode, PlateGraphLimits, PlateInstance,
    PlateInstanceErrorCode, PlateModelErrorCode, PlateModelInput, PlateProfile, PlateProfileId,
    PlateTransform, PlateTransformError, build_embedded_graph, certify_template,
    validate_embedded_graph,
};
use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

const MIN_WALL_CLEARANCE_MM: f64 = 8.0;
const MAX_NOPPS: usize = 20_000;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateTransformOutput {
    pub origin: Point,
    pub u: Point,
    pub v: Point,
    pub phase_u_mm: f64,
    pub phase_v_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateValidationSummary {
    pub independently_validated: bool,
    pub nopp_count: u32,
    pub node_count: u32,
    pub accepted_edge_count: u32,
    pub rejected_edge_count: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateModel {
    pub profile: PlateProfileId,
    pub profile_version: &'static str,
    pub polygon: Vec<Point>,
    pub wall_clearance_mm: f64,
    pub transform: PlateTransformOutput,
    pub nopps: Vec<crate::plate::Nopp>,
    pub graph: EmbeddedPoseGraph,
    pub validation: PlateValidationSummary,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateModelError {
    pub code: PlateModelErrorCode,
    pub message: &'static str,
    pub used: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PlateModelResult {
    Success { model: PlateModel },
    Error { error: PlateModelError },
}

impl Serialize for PlateModelResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Success { model } => {
                let mut state = serializer.serialize_struct("PlateModelSuccess", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("model", model)?;
                state.end()
            }
            Self::Error { error } => {
                let mut state = serializer.serialize_struct("PlateModelErrorResult", 2)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("error", error)?;
                state.end()
            }
        }
    }
}

pub fn build_plate_model(input: PlateModelInput) -> PlateModelResult {
    if !input.wall_clearance_mm.is_finite() || input.wall_clearance_mm < MIN_WALL_CLEARANCE_MM {
        return error(
            PlateModelErrorCode::InvalidWallClearance,
            "Wall clearance must be finite and at least 8 mm",
            None,
            None,
        );
    }
    if !input.phase_u_mm.is_finite() || !input.phase_v_mm.is_finite() {
        return error(
            PlateModelErrorCode::InvalidPlatePhase,
            "Plate phase must be finite",
            None,
            None,
        );
    }
    let polygon = match Polygon::try_from_original(input.polygon.clone()) {
        Ok(polygon) => polygon,
        Err(_) => {
            return error(
                PlateModelErrorCode::InvalidPolygon,
                "Polygon must be finite, simple, and nondegenerate",
                None,
                None,
            );
        }
    };
    let edge_index = input.connection_edge_index as usize;
    if edge_index >= polygon.original_edge_count() {
        return error(
            PlateModelErrorCode::InvalidPolygon,
            "Connection edge index is outside the polygon",
            None,
            None,
        );
    }
    let profile = match input.profile {
        PlateProfileId::BekotecEn23Fi30_16 => PlateProfile::bekotec_en_23_fi_30_16(),
    };
    if profile
        .templates()
        .iter()
        .any(|template| certify_template(template, &profile).is_err())
    {
        return error(
            PlateModelErrorCode::ProfileCertificationFailed,
            "Plate profile contains an uncertified motion template",
            None,
            None,
        );
    }
    let (edge_start, edge_end) = polygon.original_edge(edge_index);
    let Some(inward_normal) = polygon.inward_normal_for_original(edge_index) else {
        return error(
            PlateModelErrorCode::InvalidPolygon,
            "Connection edge is degenerate",
            None,
            None,
        );
    };
    let edge_midpoint = Point::new(
        (edge_start.x + edge_end.x) * 0.5,
        (edge_start.y + edge_end.y) * 0.5,
    );
    let transform = match PlateTransform::from_edge(
        edge_start,
        edge_end,
        edge_midpoint + inward_normal,
        input.phase_u_mm,
        input.phase_v_mm,
    ) {
        Ok(transform) => transform,
        Err(PlateTransformError::NonFiniteInput) => {
            return error(
                PlateModelErrorCode::InvalidPlatePhase,
                "Plate phase must be finite",
                None,
                None,
            );
        }
        Err(PlateTransformError::DegenerateEdge | PlateTransformError::AmbiguousInwardSide) => {
            return error(
                PlateModelErrorCode::InvalidPolygon,
                "Connection edge cannot define a plate frame",
                None,
                None,
            );
        }
    };
    let instance = match PlateInstance::new(polygon, transform, profile.clone(), MAX_NOPPS) {
        Ok(instance) => instance,
        Err(failure) => {
            let code = match failure.code {
                PlateInstanceErrorCode::InvalidBounds => PlateModelErrorCode::InvalidPolygon,
                PlateInstanceErrorCode::SolverLimitExceeded => {
                    PlateModelErrorCode::SolverLimitExceeded
                }
            };
            return error(
                code,
                "Plate instance could not be bounded",
                None,
                Some(failure.limit),
            );
        }
    };
    let graph = match build_embedded_graph(
        &instance,
        input.wall_clearance_mm,
        PlateGraphLimits::default(),
    ) {
        Ok(graph) => graph,
        Err(failure) => {
            let code = match failure.code {
                PlateGraphErrorCode::SolverLimitExceeded => {
                    PlateModelErrorCode::SolverLimitExceeded
                }
                PlateGraphErrorCode::InvalidGeometry
                | PlateGraphErrorCode::IndependentValidationFailed => {
                    PlateModelErrorCode::TemplateCertificationFailed
                }
            };
            return error(
                code,
                "Plate graph construction failed",
                Some(failure.used),
                Some(failure.limit),
            );
        }
    };
    if graph.edges.is_empty() {
        return error(
            PlateModelErrorCode::NoUsablePlateCell,
            "Room contains no complete certified plate motion",
            None,
            None,
        );
    }
    if validate_embedded_graph(&graph, &instance, input.wall_clearance_mm).is_err() {
        return error(
            PlateModelErrorCode::TemplateCertificationFailed,
            "Independent plate graph validation failed",
            None,
            None,
        );
    }
    let count = |value: usize| u32::try_from(value).unwrap_or(u32::MAX);
    let validation = PlateValidationSummary {
        independently_validated: true,
        nopp_count: count(instance.nopps.len()),
        node_count: count(graph.nodes.len()),
        accepted_edge_count: count(graph.edges.len()),
        rejected_edge_count: count(graph.rejected_edges.len()),
    };
    PlateModelResult::Success {
        model: PlateModel {
            profile: profile.id,
            profile_version: profile.version,
            polygon: input.polygon,
            wall_clearance_mm: input.wall_clearance_mm,
            transform: PlateTransformOutput {
                origin: transform.origin(),
                u: Point::new(transform.u().x, transform.u().y),
                v: Point::new(transform.v().x, transform.v().y),
                phase_u_mm: transform.phase_u_mm(),
                phase_v_mm: transform.phase_v_mm(),
            },
            nopps: instance.nopps,
            graph,
            validation,
        },
    }
}

fn error(
    code: PlateModelErrorCode,
    message: &'static str,
    used: Option<usize>,
    limit: Option<usize>,
) -> PlateModelResult {
    PlateModelResult::Error {
        error: PlateModelError {
            code,
            message,
            used,
            limit,
        },
    }
}
