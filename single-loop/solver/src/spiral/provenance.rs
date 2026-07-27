use crate::geometry::ParameterRange;
use crate::model::PathPrimitive;
use crate::validation::{ParentPair, PrimitiveRole};
use std::collections::BTreeMap;

const RANGE_EPSILON: f64 = 1e-12;

#[derive(Clone, Debug, PartialEq)]
pub struct SpiralProvenance {
    pub roles: Vec<PrimitiveRole>,
}

impl SpiralProvenance {
    pub fn inner_turn_count(&self) -> usize {
        self.roles
            .iter()
            .filter(|role| matches!(role, PrimitiveRole::InnerTurn))
            .count()
    }

    pub fn inbound_windings_are_monotone(&self) -> bool {
        nondecreasing(self.roles.iter().filter_map(|role| match role {
            PrimitiveRole::Inbound { winding } => Some(*winding),
            _ => None,
        }))
    }

    pub fn outbound_windings_are_monotone(&self) -> bool {
        nonincreasing(self.roles.iter().filter_map(|role| match role {
            PrimitiveRole::Outbound { winding } => Some(*winding),
            _ => None,
        }))
    }

    pub fn parent_phases_alternate(&self) -> bool {
        let mut phases = BTreeMap::new();
        for role in &self.roles {
            let (winding, inbound) = match role {
                PrimitiveRole::Inbound { winding } => (*winding, true),
                PrimitiveRole::Outbound { winding } => (*winding, false),
                PrimitiveRole::InnerTurn => continue,
                PrimitiveRole::StartLead | PrimitiveRole::EndLead => return false,
            };
            if phases
                .insert(winding, inbound)
                .is_some_and(|previous| previous != inbound)
            {
                return false;
            }
        }
        phases.len() >= 2
            && phases.len() % 2 == 0
            && phases
                .into_iter()
                .enumerate()
                .all(|(expected, (winding, inbound))| {
                    winding == expected && inbound == (expected % 2 == 0)
                })
    }
}

pub(crate) fn build_parent_pairs(
    primitives: &[PathPrimitive],
    roles: &[PrimitiveRole],
) -> Option<Vec<ParentPair>> {
    if primitives.len() != roles.len() {
        return None;
    }
    let maximum_winding = roles
        .iter()
        .filter_map(|role| match role {
            PrimitiveRole::Inbound { winding } | PrimitiveRole::Outbound { winding } => {
                Some(*winding)
            }
            PrimitiveRole::StartLead | PrimitiveRole::InnerTurn | PrimitiveRole::EndLead => None,
        })
        .max()?;
    if maximum_winding % 2 == 0 {
        return None;
    }

    let mut parent_pairs = Vec::new();
    for inbound_winding in (0..maximum_winding).step_by(2) {
        let inbound = normalized_phase_intervals(
            primitives,
            roles,
            PrimitiveRole::Inbound {
                winding: inbound_winding,
            },
        )?;
        let outbound = normalized_phase_intervals(
            primitives,
            roles,
            PrimitiveRole::Outbound {
                winding: inbound_winding + 1,
            },
        )?;
        append_interval_pairs(&mut parent_pairs, &inbound, &outbound, inbound_winding);
    }
    (!parent_pairs.is_empty()).then_some(parent_pairs)
}

#[derive(Clone, Copy, Debug)]
struct PhaseInterval {
    primitive_index: usize,
    phase_start: f64,
    phase_end: f64,
}

fn normalized_phase_intervals(
    primitives: &[PathPrimitive],
    roles: &[PrimitiveRole],
    target: PrimitiveRole,
) -> Option<Vec<PhaseInterval>> {
    let members = roles
        .iter()
        .enumerate()
        .filter_map(|(index, role)| (role == &target).then_some(index))
        .collect::<Vec<_>>();
    let total_length = members
        .iter()
        .map(|index| primitives[*index].length())
        .sum::<f64>();
    if members.is_empty() || !total_length.is_finite() || total_length <= 0.0 {
        return None;
    }
    let mut offset = 0.0;
    let mut intervals = Vec::with_capacity(members.len());
    for primitive_index in members {
        let length = primitives[primitive_index].length();
        if !length.is_finite() || length <= 0.0 {
            return None;
        }
        let phase_start = offset / total_length;
        offset += length;
        intervals.push(PhaseInterval {
            primitive_index,
            phase_start,
            phase_end: (offset / total_length).min(1.0),
        });
    }
    if let Some(last) = intervals.last_mut() {
        last.phase_end = 1.0;
    }
    Some(intervals)
}

fn append_interval_pairs(
    result: &mut Vec<ParentPair>,
    inbound: &[PhaseInterval],
    outbound: &[PhaseInterval],
    inbound_winding: usize,
) {
    let mut first = 0;
    let mut second = 0;
    while first < inbound.len() && second < outbound.len() {
        let left = inbound[first];
        let right = outbound[second];
        let overlap_start = left.phase_start.max(right.phase_start);
        let overlap_end = left.phase_end.min(right.phase_end);
        if overlap_end - overlap_start > RANGE_EPSILON {
            result.push(ParentPair {
                first_primitive: left.primitive_index,
                first_range: interval_parameter_range(left, overlap_start, overlap_end),
                second_primitive: right.primitive_index,
                second_range: interval_parameter_range(right, overlap_start, overlap_end),
                first_winding: inbound_winding,
                second_winding: inbound_winding + 1,
            });
        }
        if left.phase_end <= right.phase_end + RANGE_EPSILON {
            first += 1;
        }
        if right.phase_end <= left.phase_end + RANGE_EPSILON {
            second += 1;
        }
    }
}

fn interval_parameter_range(
    interval: PhaseInterval,
    overlap_start: f64,
    overlap_end: f64,
) -> ParameterRange {
    let span = interval.phase_end - interval.phase_start;
    ParameterRange {
        start: ((overlap_start - interval.phase_start) / span).clamp(0.0, 1.0),
        end: ((overlap_end - interval.phase_start) / span).clamp(0.0, 1.0),
    }
}

fn nondecreasing(mut values: impl Iterator<Item = usize>) -> bool {
    let Some(mut previous) = values.next() else {
        return false;
    };
    for value in values {
        if value < previous {
            return false;
        }
        previous = value;
    }
    true
}

fn nonincreasing(mut values: impl Iterator<Item = usize>) -> bool {
    let Some(mut previous) = values.next() else {
        return false;
    };
    for value in values {
        if value > previous {
            return false;
        }
        previous = value;
    }
    true
}
