use crate::model::{PathPrimitive, Point};
use crate::plate::{
    LocalPose, PlateInstance, PlateValidationFailure, PlateValidationFailureCode, TemplateId,
    TemplateTransform, certify_template, validate_world_primitive_against_plate,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

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
    /// Sized so a large room still *builds* its graph and then fails on
    /// something meaningful (loop length, coverage) rather than on graph size.
    ///
    /// Measured after reversal closure: ~3400 accepted edges per m^2 of room
    /// (24 576 edges for the 7.2 m^2 fixture), and candidates run about 2.9x
    /// edges (69 552 / 24 576) since candidates are
    /// `2 (reversal) * 8 (orientations) * templates * Ni * Nj` with
    /// `Ni = W/150 + 7`, `Nj = H/150 + 7`. Clearing a ~60 m^2 room therefore
    /// needs roughly 205 000 edges and 590 000 candidates; the values below
    /// carry that with headroom. Nodes run well under edges (6 840 vs 24 576 on
    /// the fixture), so 100 000 is generous.
    ///
    /// Memory is ~O(edges x primitives per edge) -- every edge owns its world
    /// primitives, and rejected candidates own theirs too. If these budgets ever
    /// bite in practice, the fix is a compact edge representation (store the
    /// transform and re-derive primitives on demand) rather than a further
    /// raise.
    fn default() -> Self {
        Self {
            max_edge_candidates: 800_000,
            max_nodes: 100_000,
            max_edges: 250_000,
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
    let mut emitted_geometry = BTreeSet::new();
    let mut rejected_geometry = BTreeSet::new();

    // The reversal pass runs last, as a whole pass rather than interleaved, so
    // that an unreversed instance always wins the `emitted_geometry` tie. For a
    // template that is symmetric under the transform group -- `Straight0` and
    // `BroadReverse180` are, the other five are not -- every reversed instance
    // is byte-identical to some mirrored/translated forward instance, and is
    // dropped here instead of doubling the edge. Dedupe is by exact geometry
    // rather than by a hand-maintained "this one is symmetric" flag, so a future
    // symmetric template cannot silently double its family.
    for reversed in [false, true] {
        for period_j in min_j..=max_j {
            for period_i in min_i..=max_i {
                for template in &templates {
                    for reflected in [false, true] {
                        for quarter_turns in 0..4 {
                            if candidate_count == limits.max_edge_candidates {
                                return Err(limit_error(
                                    candidate_count,
                                    limits.max_edge_candidates,
                                ));
                            }
                            candidate_count += 1;
                            let transform = TemplateTransform::new(
                                quarter_turns,
                                reflected,
                                reversed,
                                period_i,
                                period_j,
                            )
                            .unwrap();
                            let local = transform.apply(template, instance.profile.period_mm);
                            let key = geometry_key(&local);
                            let primitives = local
                                .primitives
                                .iter()
                                .map(|primitive| instance.transform.primitive_to_world(primitive))
                                .collect::<Vec<_>>();
                            // Reversed instances are certified here like every
                            // other candidate -- no certificate is ever
                            // inherited from a forward twin, even though the
                            // geometry is provably identical.
                            let template_certificate =
                                match certify_template(&local, &instance.profile) {
                                    Ok(certificate) => certificate,
                                    Err(failure) => {
                                        push_rejected(
                                            &mut rejected_edges,
                                            &mut rejected_geometry,
                                            key,
                                            template.id,
                                            transform,
                                            primitives,
                                            failure,
                                        );
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
                                push_rejected(
                                    &mut rejected_edges,
                                    &mut rejected_geometry,
                                    key,
                                    template.id,
                                    transform,
                                    primitives,
                                    failure,
                                );
                                continue;
                            }
                            if !emitted_geometry.insert(key) {
                                // Same curve, already an edge: this is a
                                // symmetric template whose reversal the mirror
                                // group already covers. Dropping it here is what
                                // keeps `Straight0` and `BroadReverse180` from
                                // doubling. See `geometry_key` for the margin
                                // invariant this relies on.
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
                                    min_nopp_clearance_mm: template_certificate
                                        .min_nopp_clearance_mm,
                                    min_bend_radius_mm: template_certificate.min_bend_radius_mm,
                                }),
                            });
                        }
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

/// Exact geometric identity of a placed template, quantised on the same 1e-6 mm
/// grid the pose interner uses. Deliberately keyed on the geometry itself
/// rather than on a hand-maintained "this template is symmetric" flag: a future
/// symmetric template then cannot silently double its own family, and a
/// genuinely new reversal can never be dropped by accident.
///
/// "Exact" means exact *after* quantisation, and the quantisation is doing real
/// work rather than being a formality. A reversed instance and its forward twin
/// reach the same arc by different f64 paths -- the twin runs
/// `mirror -> rotate -> translate`, the reversal additionally re-derives the
/// endpoint through `atan2` and negates the sweep -- so their coordinates
/// routinely differ in the last few ulps (~1e-14 mm on an 80 mm arc). Comparing
/// raw f64 would therefore miss most duplicates and double those families;
/// 1e-6 mm is eight orders of magnitude above that noise and eight below any
/// real geometric difference in this catalogue.
///
/// **Margin invariant.** Dedupe only works if the forward twin of an accepted
/// reversed instance was itself enumerated. Enumeration covers period offsets
/// out to `TEMPLATE_MARGIN_MM` (450 mm) beyond the plate's local bounds, while
/// acceptance additionally requires the whole curve to sit inside those bounds.
/// The largest twin offset in this catalogue is `BroadReverse180`'s, 450 mm in
/// +y (its reversal equals its own y-mirror shifted by three periods);
/// `Straight0`'s is 150 mm. Since an accepted `BroadReverse180` also fits its
/// own 225 mm extent inside the bounds, its twin's period index stays at least
/// 337.5 mm inside the enumerated range. **A future symmetric template whose
/// twin offset exceeds `TEMPLATE_MARGIN_MM` would silently double instead of
/// deduping -- the margin has to grow with it.**
fn geometry_key(template: &crate::plate::MotionTemplate) -> Vec<i64> {
    let mut key = Vec::with_capacity(6 + template.primitives.len() * 9);
    for pose in [template.start, template.end] {
        key.push(tick(pose.point.x));
        key.push(tick(pose.point.y));
        key.push(i64::from(pose.heading.octant()));
    }
    for primitive in &template.primitives {
        match primitive {
            PathPrimitive::Line { start, end } => {
                key.extend([0, tick(start.x), tick(start.y), tick(end.x), tick(end.y)]);
            }
            PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => {
                key.extend([
                    1,
                    tick(start.x),
                    tick(start.y),
                    tick(end.x),
                    tick(end.y),
                    tick(center.x),
                    tick(center.y),
                    tick(*radius_mm),
                    tick(*sweep_rad),
                ]);
            }
        }
    }
    key
}

fn tick(value: f64) -> i64 {
    (value * KEY_SCALE).round() as i64
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

/// Records a rejected candidate, deduped on the same geometric key as accepted
/// edges (plus the failure code, so two genuinely different verdicts on one
/// curve could never merge).
///
/// This list is not private diagnostics: `PlateModel` publishes it in full and
/// `plate-scene.ts` draws a `<path>` per entry plus a witness circle. Without
/// this, closing the catalogue under reversal would have doubled every
/// rejection stroke in the rendered overlay for the two symmetric families.
#[allow(clippy::too_many_arguments)]
fn push_rejected(
    rejected_edges: &mut Vec<RejectedEdge>,
    seen: &mut BTreeSet<Vec<i64>>,
    mut key: Vec<i64>,
    template_id: TemplateId,
    template_transform: TemplateTransform,
    primitives: Vec<PathPrimitive>,
    failure: PlateValidationFailure,
) {
    key.push(failure_code_ordinal(failure.code));
    if !seen.insert(key) {
        return;
    }
    rejected_edges.push(RejectedEdge {
        template_id,
        template_transform,
        primitives,
        code: failure.code,
        witness: failure.witness,
    });
}

const fn failure_code_ordinal(code: PlateValidationFailureCode) -> i64 {
    match code {
        PlateValidationFailureCode::InvalidPrimitive => 0,
        PlateValidationFailureCode::UnsupportedHeading => 1,
        PlateValidationFailureCode::BendRadiusTooSmall => 2,
        PlateValidationFailureCode::OutsideWallDomain => 3,
        PlateValidationFailureCode::NoppCollision => 4,
        PlateValidationFailureCode::PositionDiscontinuity => 5,
        PlateValidationFailureCode::TangentDiscontinuity => 6,
        PlateValidationFailureCode::InvalidTemplateProvenance => 7,
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
