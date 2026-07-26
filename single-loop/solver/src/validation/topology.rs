use crate::geometry::POSITION_TOLERANCE_MM;
use crate::validation::{CandidatePath, PrimitiveRole, ValidationFailure, ValidationFailureCode};

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

    match roles.first() {
        Some(PrimitiveRole::StartLead) => {}
        _ => {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRoleOrder,
            ));
        }
    }
    match roles.last() {
        Some(PrimitiveRole::EndLead) => {}
        _ => {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRoleOrder,
            ));
        }
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

    validate_parent_pairs(candidate)?;

    Ok(())
}

fn validate_parent_pairs(candidate: &CandidatePath) -> Result<(), ValidationFailure> {
    let roles = &candidate.provenance.roles;
    let mut minima = Vec::new();
    for pair in &candidate.provenance.parent_pairs {
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
        if !matches!(
            first_role,
            PrimitiveRole::Inbound { .. } | PrimitiveRole::Outbound { .. }
        ) || !matches!(
            second_role,
            PrimitiveRole::Inbound { .. } | PrimitiveRole::Outbound { .. }
        ) {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidTopologyParentPair,
            ));
        }
        let delta = pair.first_winding.abs_diff(pair.second_winding);
        if delta != 1 {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRolePhase,
            ));
        }
        minima.push(pair.first_winding.min(pair.second_winding));
    }

    minima.sort_unstable();
    minima.dedup();
    for pair in minima.windows(2) {
        if pair[1] != pair[0] + 1 {
            return Err(ValidationFailure::new(
                ValidationFailureCode::InvalidPrimitiveRolePhase,
            ));
        }
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Phase {
    StartLead,
    Inbound,
    InnerTurn,
    Outbound,
    EndLead,
}
