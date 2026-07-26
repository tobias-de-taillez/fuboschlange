use crate::geometry::{POSITION_TOLERANCE_MM, ParameterRange};
use crate::validation::{CandidatePath, PrimitiveRole, ValidationFailure, ValidationFailureCode};
use std::collections::BTreeMap;

pub(crate) fn validate_bifilar_topology(
    candidate: &CandidatePath,
) -> Result<(), ValidationFailure> {
    let primitives = candidate.path.primitives();
    let roles = &candidate.provenance.roles;

    if roles.len() != primitives.len() {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidTopologyRoles,
        ));
    }
    if primitives.is_empty() {
        return Err(ValidationFailure::new(
            ValidationFailureCode::TopologyInvalid,
        ));
    }
    if primitives[0]
        .start()
        .distance_to(candidate.connection.start_port)
        > POSITION_TOLERANCE_MM
        || primitives
            .last()
            .unwrap()
            .end()
            .distance_to(candidate.connection.end_port)
            > POSITION_TOLERANCE_MM
    {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidPortEndpoints,
        ));
    }
    if candidate
        .connection
        .start_port
        .distance_to(candidate.connection.end_port)
        <= POSITION_TOLERANCE_MM
    {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidTopologyPorts,
        ));
    }

    if !matches!(roles.first(), Some(PrimitiveRole::StartLead))
        || roles
            .iter()
            .filter(|role| matches!(role, PrimitiveRole::StartLead))
            .count()
            != 1
        || !matches!(roles.last(), Some(PrimitiveRole::EndLead))
        || roles
            .iter()
            .filter(|role| matches!(role, PrimitiveRole::EndLead))
            .count()
            != 1
    {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidPrimitiveRoleOrder,
        ));
    }

    let inner_turn_count = roles
        .iter()
        .filter(|role| matches!(role, PrimitiveRole::InnerTurn))
        .count();
    if inner_turn_count != 1 {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidTopologyTurnCount,
        ));
    }

    let mut phase = Phase::StartLead;
    let mut last_inbound_winding = None;
    let mut last_outbound_winding = None;
    let mut saw_inbound = false;
    let mut saw_outbound = false;

    for role in roles {
        match role {
            PrimitiveRole::StartLead => {
                if phase != Phase::StartLead {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::InvalidPrimitiveRoleOrder,
                    ));
                }
            }
            PrimitiveRole::Inbound { winding } => {
                if !matches!(phase, Phase::StartLead | Phase::Inbound) {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::InvalidPrimitiveRoleOrder,
                    ));
                }
                if let Some(previous) = last_inbound_winding {
                    if *winding < previous {
                        return Err(ValidationFailure::new(
                            ValidationFailureCode::InvalidTopologyWindingOrder,
                        ));
                    }
                }
                saw_inbound = true;
                last_inbound_winding = Some(*winding);
                phase = Phase::Inbound;
            }
            PrimitiveRole::InnerTurn => {
                if phase != Phase::Inbound || !saw_inbound {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::InvalidTopologyTransition,
                    ));
                }
                phase = Phase::InnerTurn;
            }
            PrimitiveRole::Outbound { winding } => {
                if !matches!(phase, Phase::InnerTurn | Phase::Outbound) {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::InvalidTopologyTransition,
                    ));
                }
                if let Some(previous) = last_outbound_winding {
                    if *winding > previous {
                        return Err(ValidationFailure::new(
                            ValidationFailureCode::InvalidTopologyWindingOrder,
                        ));
                    }
                }
                saw_outbound = true;
                last_outbound_winding = Some(*winding);
                phase = Phase::Outbound;
            }
            PrimitiveRole::EndLead => {
                if phase != Phase::Outbound || !saw_outbound {
                    return Err(ValidationFailure::new(
                        ValidationFailureCode::InvalidPrimitiveRoleOrder,
                    ));
                }
                phase = Phase::EndLead;
            }
        }
    }

    if phase != Phase::EndLead {
        return Err(ValidationFailure::new(
            ValidationFailureCode::TopologyInvalid,
        ));
    }

    let maximum_winding = validate_winding_phases(roles)?;
    validate_parent_pairs(candidate, maximum_winding)?;

    Ok(())
}

fn validate_winding_phases(roles: &[PrimitiveRole]) -> Result<usize, ValidationFailure> {
    let mut phase_for_winding = BTreeMap::new();
    for role in roles {
        let (winding, arm) = match role {
            PrimitiveRole::Inbound { winding } => (*winding, Arm::Inbound),
            PrimitiveRole::Outbound { winding } => (*winding, Arm::Outbound),
            PrimitiveRole::StartLead | PrimitiveRole::InnerTurn | PrimitiveRole::EndLead => {
                continue;
            }
        };
        if phase_for_winding
            .insert(winding, arm)
            .is_some_and(|previous| previous != arm)
        {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRolePhase,
            ));
        }
    }

    let phases = phase_for_winding.into_iter().collect::<Vec<_>>();
    if phases.len() < 2 || phases.len() % 2 != 0 {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidPrimitiveRolePhase,
        ));
    }
    for (expected_winding, (winding, arm)) in phases.iter().enumerate() {
        let expected_arm = if expected_winding % 2 == 0 {
            Arm::Inbound
        } else {
            Arm::Outbound
        };
        if *winding != expected_winding || *arm != expected_arm {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRolePhase,
            ));
        }
    }

    Ok(phases.last().unwrap().0)
}

fn validate_parent_pairs(
    candidate: &CandidatePath,
    maximum_winding: usize,
) -> Result<(), ValidationFailure> {
    let roles = &candidate.provenance.roles;
    let parent_pairs = &candidate.provenance.parent_pairs;
    if parent_pairs.is_empty() {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidTopologyParentPair,
        ));
    }

    let expected_phases = (0..maximum_winding).step_by(2).collect::<Vec<_>>();
    if parent_pairs.len() != expected_phases.len() {
        return Err(ValidationFailure::new(
            ValidationFailureCode::InvalidTopologyParentPair,
        ));
    }

    for (pair_index, pair) in parent_pairs.iter().enumerate() {
        for previous in &parent_pairs[..pair_index] {
            if ranges_overlap_on_primitive(
                pair.first_primitive,
                pair.first_range,
                previous.first_primitive,
                previous.first_range,
            ) || ranges_overlap_on_primitive(
                pair.first_primitive,
                pair.first_range,
                previous.second_primitive,
                previous.second_range,
            ) || ranges_overlap_on_primitive(
                pair.second_primitive,
                pair.second_range,
                previous.first_primitive,
                previous.first_range,
            ) || ranges_overlap_on_primitive(
                pair.second_primitive,
                pair.second_range,
                previous.second_primitive,
                previous.second_range,
            ) {
                return Err(ValidationFailure::new(
                    ValidationFailureCode::InvalidTopologyParentPair,
                ));
            }
        }
        let Some(first_role) = roles.get(pair.first_primitive) else {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        };
        let Some(second_role) = roles.get(pair.second_primitive) else {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        };
        let Some((first_winding, first_arm)) = winding_and_arm(first_role) else {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        };
        let Some((second_winding, second_arm)) = winding_and_arm(second_role) else {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        };
        if first_winding != pair.first_winding || second_winding != pair.second_winding {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        }
        let expected_first_winding = expected_phases[pair_index];
        if first_arm != Arm::Inbound
            || second_arm != Arm::Outbound
            || first_winding != expected_first_winding
            || second_winding != expected_first_winding + 1
        {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRolePhase,
            ));
        }
    }

    Ok(())
}

fn ranges_overlap_on_primitive(
    left_primitive: usize,
    left_range: ParameterRange,
    right_primitive: usize,
    right_range: ParameterRange,
) -> bool {
    left_primitive == right_primitive
        && left_range.start < right_range.end
        && right_range.start < left_range.end
}

fn winding_and_arm(role: &PrimitiveRole) -> Option<(usize, Arm)> {
    match role {
        PrimitiveRole::Inbound { winding } => Some((*winding, Arm::Inbound)),
        PrimitiveRole::Outbound { winding } => Some((*winding, Arm::Outbound)),
        PrimitiveRole::StartLead | PrimitiveRole::InnerTurn | PrimitiveRole::EndLead => None,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Arm {
    Inbound,
    Outbound,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Phase {
    StartLead,
    Inbound,
    InnerTurn,
    Outbound,
    EndLead,
}
