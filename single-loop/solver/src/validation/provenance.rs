use crate::geometry::{
    CanonicalPath, G1_TOLERANCE, POSITION_TOLERANCE_MM, ParameterRange, Vec2, canonicalize_path,
};
use crate::input::NormalizedConnection;
use crate::model::PathPrimitive;
use crate::validation::{ValidationFailure, ValidationFailureCode};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CandidateKey(pub Vec<u32>);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PrimitiveRole {
    StartLead,
    Inbound { winding: usize },
    InnerTurn,
    Outbound { winding: usize },
    EndLead,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ParentPair {
    pub first_primitive: usize,
    pub first_range: ParameterRange,
    pub second_primitive: usize,
    pub second_range: ParameterRange,
    pub first_winding: usize,
    pub second_winding: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PathProvenance {
    pub roles: Vec<PrimitiveRole>,
    pub parent_pairs: Vec<ParentPair>,
    pub start_port_edge_offset_mm: f64,
    pub end_port_edge_offset_mm: f64,
}

#[derive(Clone, Debug)]
pub struct CandidatePath {
    pub path: CanonicalPath,
    pub provenance: PathProvenance,
    pub connection: NormalizedConnection,
    pub actual_spacing_mm: f64,
    pub key: CandidateKey,
}

#[derive(Clone, Debug)]
struct GroupMember {
    original_index: usize,
    start_offset_mm: f64,
    primitive_length_mm: f64,
}

#[derive(Clone, Debug)]
struct MergeGroup {
    primitive: PathPrimitive,
    role: PrimitiveRole,
    members: Vec<GroupMember>,
}

impl CandidatePath {
    pub fn from_primitives(
        primitives: Vec<PathPrimitive>,
        provenance: PathProvenance,
        connection: NormalizedConnection,
        actual_spacing_mm: f64,
        key: CandidateKey,
    ) -> Result<Self, ValidationFailure> {
        if primitives.is_empty() {
            return Err(ValidationFailure::new(ValidationFailureCode::PathEmpty));
        }
        if provenance.roles.len() != primitives.len() {
            return Err(ValidationFailure::new(
                ValidationFailureCode::RoleCountMismatch,
            ));
        }
        if !actual_spacing_mm.is_finite() {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidActualSpacing,
            ));
        }

        let mut groups: Vec<MergeGroup> = Vec::new();
        let mut previous_end: Option<crate::model::Point> = None;

        for (original_index, (primitive, role)) in primitives
            .into_iter()
            .zip(provenance.roles.iter().cloned())
            .enumerate()
        {
            let mut primitive = validate_single_primitive(primitive)?;
            if let Some(previous_end) = previous_end {
                if previous_end.distance_to(primitive.start()) <= POSITION_TOLERANCE_MM
                    && previous_end != primitive.start()
                {
                    primitive = validate_single_primitive(primitive.with_start(previous_end))?;
                }
            }

            if let Some(previous) = groups.last() {
                let gap_mm = previous.primitive.end().distance_to(primitive.start());
                if gap_mm > POSITION_TOLERANCE_MM {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::PositionDiscontinuity,
                    )
                    .with_points(previous.primitive.end(), primitive.start()));
                }
                let delta =
                    tangent_delta(previous.primitive.end_tangent(), primitive.start_tangent());
                if delta > G1_TOLERANCE {
                    return Err(
                        ValidationFailure::new(ValidationFailureCode::G1Discontinuity)
                            .with_points(previous.primitive.end(), primitive.start())
                            .with_primitives(groups.len() - 1, groups.len()),
                    );
                }
            }

            let primitive_length_mm = primitive.length();
            if let Some(previous) = groups.last_mut() {
                if previous.role == role {
                    if let Some(merged) = try_merge_same_role(&previous.primitive, &primitive) {
                        let start_offset_mm = previous.primitive.length();
                        previous.primitive = merged;
                        previous.members.push(GroupMember {
                            original_index,
                            start_offset_mm,
                            primitive_length_mm,
                        });
                        previous_end = Some(previous.primitive.end());
                        continue;
                    }
                }
            }

            previous_end = Some(primitive.end());
            groups.push(MergeGroup {
                primitive,
                role,
                members: vec![GroupMember {
                    original_index,
                    start_offset_mm: 0.0,
                    primitive_length_mm,
                }],
            });
        }

        let primitives = groups
            .iter()
            .map(|group| group.primitive.clone())
            .collect::<Vec<_>>();
        let roles = groups
            .iter()
            .map(|group| group.role.clone())
            .collect::<Vec<_>>();
        let path = CanonicalPath::from_connected(primitives);
        let parent_pairs = remap_parent_pairs(&provenance.parent_pairs, &groups)?;

        Ok(Self {
            path,
            provenance: PathProvenance {
                roles,
                parent_pairs,
                start_port_edge_offset_mm: provenance.start_port_edge_offset_mm,
                end_port_edge_offset_mm: provenance.end_port_edge_offset_mm,
            },
            connection,
            actual_spacing_mm,
            key,
        })
    }
}

fn validate_single_primitive(primitive: PathPrimitive) -> Result<PathPrimitive, ValidationFailure> {
    let path =
        canonicalize_path(std::slice::from_ref(&primitive)).map_err(path_error_to_failure)?;
    Ok(path.primitives()[0].clone())
}

fn try_merge_same_role(left: &PathPrimitive, right: &PathPrimitive) -> Option<PathPrimitive> {
    if left.end() != right.start() {
        return None;
    }

    match (left, right) {
        (PathPrimitive::Line { start, .. }, PathPrimitive::Line { end, .. })
            if tangent_delta(left.end_tangent(), right.start_tangent()) <= G1_TOLERANCE =>
        {
            Some(PathPrimitive::Line {
                start: *start,
                end: *end,
            })
        }
        (
            PathPrimitive::Arc {
                start,
                center: left_center,
                radius_mm: left_radius,
                sweep_rad: left_sweep,
                ..
            },
            PathPrimitive::Arc {
                end,
                center: right_center,
                radius_mm: right_radius,
                sweep_rad: right_sweep,
                ..
            },
        ) if left_center.distance_to(*right_center) <= POSITION_TOLERANCE_MM
            && (*left_radius - *right_radius).abs() <= POSITION_TOLERANCE_MM
            && left_sweep.signum() == right_sweep.signum()
            && tangent_delta(left.end_tangent(), right.start_tangent()) <= G1_TOLERANCE =>
        {
            let candidate = PathPrimitive::Arc {
                start: *start,
                end: *end,
                center: *left_center,
                radius_mm: *left_radius,
                sweep_rad: left_sweep + right_sweep,
            };
            canonicalize_path(std::slice::from_ref(&candidate))
                .ok()
                .map(|path| path.primitives()[0].clone())
        }
        _ => None,
    }
}

fn remap_parent_pairs(
    parent_pairs: &[ParentPair],
    groups: &[MergeGroup],
) -> Result<Vec<ParentPair>, ValidationFailure> {
    let mut original_map = vec![None; groups.iter().map(|group| group.members.len()).sum()];
    for (canonical_index, group) in groups.iter().enumerate() {
        let group_length_mm = group.primitive.length();
        for member in &group.members {
            original_map[member.original_index] = Some((
                canonical_index,
                member.start_offset_mm,
                member.primitive_length_mm,
                group_length_mm,
            ));
        }
    }

    parent_pairs
        .iter()
        .map(|pair| {
            let (first_index, first_offset_mm, first_length_mm, first_group_length_mm) =
                original_map
                    .get(pair.first_primitive)
                    .and_then(|entry| *entry)
                    .ok_or_else(|| {
                        ValidationFailure::new(ValidationFailureCode::TopologyInvalid)
                    })?;
            let (second_index, second_offset_mm, second_length_mm, second_group_length_mm) =
                original_map
                    .get(pair.second_primitive)
                    .and_then(|entry| *entry)
                    .ok_or_else(|| {
                        ValidationFailure::new(ValidationFailureCode::TopologyInvalid)
                    })?;

            Ok(ParentPair {
                first_primitive: first_index,
                first_range: remap_range(
                    pair.first_range,
                    first_offset_mm,
                    first_length_mm,
                    first_group_length_mm,
                ),
                second_primitive: second_index,
                second_range: remap_range(
                    pair.second_range,
                    second_offset_mm,
                    second_length_mm,
                    second_group_length_mm,
                ),
                first_winding: pair.first_winding,
                second_winding: pair.second_winding,
            })
        })
        .collect()
}

fn remap_range(
    range: ParameterRange,
    offset_mm: f64,
    primitive_length_mm: f64,
    group_length_mm: f64,
) -> ParameterRange {
    if group_length_mm == 0.0 {
        return ParameterRange::FULL;
    }

    let start = (offset_mm + primitive_length_mm * range.start) / group_length_mm;
    let end = (offset_mm + primitive_length_mm * range.end) / group_length_mm;
    ParameterRange::new(start, end)
}

fn tangent_delta(left: Vec2, right: Vec2) -> f64 {
    left.distance(right)
}

fn path_error_to_failure(error: crate::geometry::PathError) -> ValidationFailure {
    use crate::geometry::PathError;

    match error {
        PathError::PositionDiscontinuity {
            left_index,
            right_index,
            ..
        } => ValidationFailure::new(ValidationFailureCode::PositionDiscontinuity)
            .with_primitives(left_index, right_index),
        PathError::G1Discontinuity {
            left_index,
            right_index,
            ..
        } => ValidationFailure::new(ValidationFailureCode::G1Discontinuity)
            .with_primitives(left_index, right_index),
        PathError::NonFinitePrimitive { primitive_index }
        | PathError::ZeroLengthPrimitive { primitive_index }
        | PathError::NonPositiveRadius {
            primitive_index, ..
        }
        | PathError::InvalidSweep {
            primitive_index, ..
        }
        | PathError::EndpointRadiusResidual {
            primitive_index, ..
        }
        | PathError::EndpointSweepResidual {
            primitive_index, ..
        } => ValidationFailure::new(ValidationFailureCode::InvalidPrimitive)
            .with_primitive(primitive_index),
    }
}
