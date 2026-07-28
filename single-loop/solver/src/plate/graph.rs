use crate::model::{PathPrimitive, Point};
use crate::plate::{
    LocalPose, PlateInstance, PlateValidationFailure, PlateValidationFailureCode, TemplateId,
    TemplateTransform, certify_template, validate_world_primitive_against_plate,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const KEY_SCALE: f64 = 1_000_000.0;
const TEMPLATE_MARGIN_MM: f64 = 450.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlateGraphErrorCode {
    InvalidGeometry,
    SolverLimitExceeded,
    IndependentValidationFailed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PlateGraphError {
    pub code: PlateGraphErrorCode,
    pub used: usize,
    pub limit: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PlateGraphLimits {
    pub max_edge_candidates: usize,
    pub max_nodes: usize,
    pub max_edges: usize,
}

impl Default for PlateGraphLimits {
    fn default() -> Self {
        Self {
            max_edge_candidates: 100_000,
            max_nodes: 50_000,
            max_edges: 50_000,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PoseKey {
    x_ticks: i64,
    y_ticks: i64,
    heading: crate::plate::Heading8,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoseNode {
    pub id: u32,
    pub local_pose: LocalPose,
    pub world_point: Point,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateEdgeCertificate {
    pub min_nopp_clearance_mm: f64,
    pub min_bend_radius_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoseEdge {
    pub id: u32,
    pub start: PoseNode,
    pub end: PoseNode,
    pub template_id: TemplateId,
    pub template_transform: TemplateTransform,
    pub primitives: Vec<PathPrimitive>,
    pub certificate: Option<PlateEdgeCertificate>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectedEdge {
    pub template_id: TemplateId,
    pub template_transform: TemplateTransform,
    pub primitives: Vec<PathPrimitive>,
    pub code: PlateValidationFailureCode,
    pub witness: Option<Point>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedPoseGraph {
    pub nodes: Vec<PoseNode>,
    pub edges: Vec<PoseEdge>,
    pub rejected_edges: Vec<RejectedEdge>,
    pub candidate_count: usize,
}

pub fn build_embedded_graph(
    instance: &PlateInstance,
    wall_clearance_mm: f64,
    limits: PlateGraphLimits,
) -> Result<EmbeddedPoseGraph, PlateGraphError> {
    let templates = instance.profile.templates();
    let (min_i, max_i) = period_range(
        instance.local_bounds.min.x - TEMPLATE_MARGIN_MM,
        instance.local_bounds.max.x + TEMPLATE_MARGIN_MM,
        instance.profile.period_mm,
    )?;
    let (min_j, max_j) = period_range(
        instance.local_bounds.min.y - TEMPLATE_MARGIN_MM,
        instance.local_bounds.max.y + TEMPLATE_MARGIN_MM,
        instance.profile.period_mm,
    )?;
    let mut node_ids = BTreeMap::new();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut rejected_edges = Vec::new();
    let mut candidate_count = 0usize;

    for period_j in min_j..=max_j {
        for period_i in min_i..=max_i {
            for template in &templates {
                for reflected in [false, true] {
                    for quarter_turns in 0..4 {
                        if candidate_count == limits.max_edge_candidates {
                            return Err(limit_error(candidate_count, limits.max_edge_candidates));
                        }
                        candidate_count += 1;
                        let transform =
                            TemplateTransform::new(quarter_turns, reflected, period_i, period_j)
                                .unwrap();
                        let local = transform.apply(template, instance.profile.period_mm);
                        let primitives = local
                            .primitives
                            .iter()
                            .map(|primitive| instance.transform.primitive_to_world(primitive))
                            .collect::<Vec<_>>();
                        let template_certificate = match certify_template(&local, &instance.profile)
                        {
                            Ok(certificate) => certificate,
                            Err(failure) => {
                                rejected_edges.push(rejected(
                                    template.id,
                                    transform,
                                    primitives,
                                    failure,
                                ));
                                continue;
                            }
                        };
                        if let Some(failure) = primitives.iter().find_map(|primitive| {
                            validate_world_primitive_against_plate(
                                primitive,
                                &instance.polygon,
                                wall_clearance_mm,
                                &instance.nopps,
                                &instance.profile,
                                &instance.transform,
                            )
                            .err()
                        }) {
                            rejected_edges.push(rejected(
                                template.id,
                                transform,
                                primitives,
                                failure,
                            ));
                            continue;
                        }
                        if edges.len() == limits.max_edges {
                            return Err(limit_error(edges.len(), limits.max_edges));
                        }
                        let start = intern_node(
                            local.start,
                            &instance.transform,
                            &mut node_ids,
                            &mut nodes,
                            limits.max_nodes,
                        )?;
                        let end = intern_node(
                            local.end,
                            &instance.transform,
                            &mut node_ids,
                            &mut nodes,
                            limits.max_nodes,
                        )?;
                        edges.push(PoseEdge {
                            id: u32::try_from(edges.len()).map_err(|_| PlateGraphError {
                                code: PlateGraphErrorCode::InvalidGeometry,
                                used: edges.len(),
                                limit: u32::MAX as usize,
                            })?,
                            start,
                            end,
                            template_id: template.id,
                            template_transform: transform,
                            primitives,
                            certificate: Some(PlateEdgeCertificate {
                                min_nopp_clearance_mm: template_certificate.min_nopp_clearance_mm,
                                min_bend_radius_mm: template_certificate.min_bend_radius_mm,
                            }),
                        });
                    }
                }
            }
        }
    }

    Ok(EmbeddedPoseGraph {
        nodes,
        edges,
        rejected_edges,
        candidate_count,
    })
}

pub fn validate_embedded_graph(
    graph: &EmbeddedPoseGraph,
    instance: &PlateInstance,
    wall_clearance_mm: f64,
) -> Result<(), PlateGraphError> {
    for (index, node) in graph.nodes.iter().enumerate() {
        if node.id as usize != index || pose_key(node.local_pose).is_none() {
            return Err(independent_error(index));
        }
    }
    let templates = instance.profile.templates();
    for (index, edge) in graph.edges.iter().enumerate() {
        if edge.id as usize != index || edge.certificate.is_none() {
            return Err(independent_error(index));
        }
        let source = templates
            .iter()
            .find(|template| template.id == edge.template_id)
            .ok_or_else(|| independent_error(index))?;
        let local = edge
            .template_transform
            .apply(source, instance.profile.period_mm);
        let expected = local
            .primitives
            .iter()
            .map(|primitive| instance.transform.primitive_to_world(primitive))
            .collect::<Vec<_>>();
        if expected != edge.primitives
            || local.start != edge.start.local_pose
            || local.end != edge.end.local_pose
            || instance.transform.to_world(local.start.point) != edge.start.world_point
            || instance.transform.to_world(local.end.point) != edge.end.world_point
        {
            return Err(independent_error(index));
        }
        for primitive in &edge.primitives {
            validate_world_primitive_against_plate(
                primitive,
                &instance.polygon,
                wall_clearance_mm,
                &instance.nopps,
                &instance.profile,
                &instance.transform,
            )
            .map_err(|_| independent_error(index))?;
        }
    }
    Ok(())
}

fn intern_node(
    local_pose: LocalPose,
    transform: &crate::plate::PlateTransform,
    ids: &mut BTreeMap<PoseKey, u32>,
    nodes: &mut Vec<PoseNode>,
    limit: usize,
) -> Result<PoseNode, PlateGraphError> {
    let key = pose_key(local_pose).ok_or(PlateGraphError {
        code: PlateGraphErrorCode::InvalidGeometry,
        used: nodes.len(),
        limit,
    })?;
    if let Some(id) = ids.get(&key) {
        return Ok(nodes[*id as usize]);
    }
    if nodes.len() == limit {
        return Err(limit_error(nodes.len(), limit));
    }
    let id = u32::try_from(nodes.len()).map_err(|_| PlateGraphError {
        code: PlateGraphErrorCode::InvalidGeometry,
        used: nodes.len(),
        limit: u32::MAX as usize,
    })?;
    let node = PoseNode {
        id,
        local_pose,
        world_point: transform.to_world(local_pose.point),
    };
    ids.insert(key, id);
    nodes.push(node);
    Ok(node)
}

fn pose_key(pose: LocalPose) -> Option<PoseKey> {
    Some(PoseKey {
        x_ticks: coordinate_ticks(pose.point.x)?,
        y_ticks: coordinate_ticks(pose.point.y)?,
        heading: pose.heading,
    })
}

fn coordinate_ticks(value: f64) -> Option<i64> {
    let scaled = value * KEY_SCALE;
    (scaled.is_finite() && scaled >= i64::MIN as f64 && scaled < i64::MAX as f64)
        .then_some(scaled.round() as i64)
}

fn period_range(min: f64, max: f64, period: f64) -> Result<(i64, i64), PlateGraphError> {
    let min = (min / period).floor();
    let max = (max / period).ceil();
    if !min.is_finite() || !max.is_finite() || min < i64::MIN as f64 || max >= i64::MAX as f64 {
        return Err(PlateGraphError {
            code: PlateGraphErrorCode::InvalidGeometry,
            used: 0,
            limit: 0,
        });
    }
    Ok((min as i64, max as i64))
}

fn rejected(
    template_id: TemplateId,
    template_transform: TemplateTransform,
    primitives: Vec<PathPrimitive>,
    failure: PlateValidationFailure,
) -> RejectedEdge {
    RejectedEdge {
        template_id,
        template_transform,
        primitives,
        code: failure.code,
        witness: failure.witness,
    }
}

fn limit_error(used: usize, limit: usize) -> PlateGraphError {
    PlateGraphError {
        code: PlateGraphErrorCode::SolverLimitExceeded,
        used,
        limit,
    }
}

fn independent_error(used: usize) -> PlateGraphError {
    PlateGraphError {
        code: PlateGraphErrorCode::IndependentValidationFailed,
        used,
        limit: 0,
    }
}
