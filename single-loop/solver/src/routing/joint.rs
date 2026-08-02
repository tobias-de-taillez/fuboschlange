use super::graph::{ExpansionCounter, RouteBudget, RoutingError};
use super::pose::ZonePhase;
use super::transition::{RouteTransition, pose_transitions};
use crate::constants::MIN_RADIUS_MM;
use crate::input::NormalizedConnection;
use crate::spiral::{Direction, Pose, SpiralCoreCandidate};
use crate::validation::{
    CandidateKey, CandidatePath, HardValidationReport, ParentPair, PathProvenance, PrimitiveRole,
    ValidationContext, validate_hard_constraints,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PortAssignment {
    FirstStarts,
    SecondStarts,
}

#[derive(Clone, Debug)]
pub struct RoutingFixture {
    pub connection: NormalizedConnection,
    pub context: ValidationContext,
    pub core: SpiralCoreCandidate,
    pub actual_spacing_mm: f64,
}

impl RoutingFixture {
    pub fn new(
        connection: NormalizedConnection,
        context: ValidationContext,
        core: SpiralCoreCandidate,
        actual_spacing_mm: f64,
    ) -> Self {
        Self {
            connection,
            context,
            core,
            actual_spacing_mm,
        }
    }
}

#[derive(Clone, Debug)]
pub struct RoutedPair {
    pub candidate: CandidatePath,
    pub report: HardValidationReport,
    pub expansion_count: u64,
    pub assignment: PortAssignment,
    pub zone_phases: Vec<ZonePhase>,
}

pub fn route_lead_pair(
    fixture: &RoutingFixture,
    assignment: PortAssignment,
    budget: RouteBudget,
) -> Result<RoutedPair, RoutingError> {
    let connection = assigned_connection(&fixture.connection, assignment);
    let start_pose =
        Pose::new(connection.start_port, connection.inward_normal).ok_or(RoutingError::NoRoute)?;
    let end_pose =
        Pose::new(connection.end_port, -connection.inward_normal).ok_or(RoutingError::NoRoute)?;
    let start_transitions =
        pose_transitions(start_pose, fixture.core.inbound_seam_pose, MIN_RADIUS_MM);
    let end_transitions =
        pose_transitions(fixture.core.outbound_seam_pose, end_pose, MIN_RADIUS_MM);
    if start_transitions.is_empty() || end_transitions.is_empty() {
        return Err(RoutingError::NoRoute);
    }

    let mut counter = ExpansionCounter::new(budget);
    for (start_index, start) in start_transitions.iter().enumerate() {
        for (end_index, end) in end_transitions.iter().enumerate() {
            counter.pop()?;
            let Some(candidate) = assemble_candidate(
                fixture,
                connection.clone(),
                assignment,
                start,
                end,
                start_index,
                end_index,
            ) else {
                continue;
            };
            let Ok(report) = validate_hard_constraints(&candidate, &fixture.context) else {
                continue;
            };
            return Ok(RoutedPair {
                candidate,
                report,
                expansion_count: counter.count(),
                assignment,
                zone_phases: vec![ZonePhase::NearWall, ZonePhase::Inside],
            });
        }
    }
    Err(RoutingError::NoRoute)
}

fn assemble_candidate(
    fixture: &RoutingFixture,
    connection: NormalizedConnection,
    assignment: PortAssignment,
    start: &RouteTransition,
    end: &RouteTransition,
    start_index: usize,
    end_index: usize,
) -> Option<CandidatePath> {
    let core_primitives = fixture.core.path.primitives();
    let mut primitives =
        Vec::with_capacity(start.primitives.len() + core_primitives.len() + end.primitives.len());
    primitives.extend(start.primitives.iter().cloned());
    primitives.extend(core_primitives.iter().cloned());
    primitives.extend(end.primitives.iter().cloned());

    let mut roles = Vec::with_capacity(primitives.len());
    roles.extend((0..start.primitives.len()).map(|_| PrimitiveRole::StartLead));
    roles.extend(fixture.core.provenance.roles.iter().cloned());
    roles.extend((0..end.primitives.len()).map(|_| PrimitiveRole::EndLead));
    let parent_pairs = fixture
        .core
        .parent_pairs
        .iter()
        .map(|pair| shifted_parent_pair(pair, start.primitives.len()))
        .collect();
    let provenance = PathProvenance {
        roles,
        parent_pairs,
        start_port_edge_offset_mm: connection.start_port_edge_offset_mm,
        end_port_edge_offset_mm: connection.end_port_edge_offset_mm,
    };
    let key = CandidateKey(vec![
        u32::from(fixture.core.key.family),
        u32::from(fixture.core.key.guide_factor_index),
        match fixture.core.key.direction {
            Direction::Ccw => 0,
            Direction::Cw => 1,
        },
        fixture.core.key.anchor_order,
        u32::from(fixture.core.key.turn_variant),
        match assignment {
            PortAssignment::FirstStarts => 0,
            PortAssignment::SecondStarts => 1,
        },
        u32::try_from(start_index).ok()?,
        u32::try_from(end_index).ok()?,
    ]);
    CandidatePath::from_primitives(
        primitives,
        provenance,
        connection,
        fixture.actual_spacing_mm,
        key,
    )
    .ok()
}

fn shifted_parent_pair(pair: &ParentPair, offset: usize) -> ParentPair {
    ParentPair {
        first_primitive: pair.first_primitive + offset,
        first_range: pair.first_range,
        second_primitive: pair.second_primitive + offset,
        second_range: pair.second_range,
        first_winding: pair.first_winding,
        second_winding: pair.second_winding,
    }
}

fn assigned_connection(
    source: &NormalizedConnection,
    assignment: PortAssignment,
) -> NormalizedConnection {
    let mut connection = source.clone();
    match assignment {
        PortAssignment::FirstStarts => {
            connection.start_port = source.first_port;
            connection.end_port = source.second_port;
            connection.start_port_edge_offset_mm = source.first_port_edge_offset_mm;
            connection.end_port_edge_offset_mm = source.second_port_edge_offset_mm;
        }
        PortAssignment::SecondStarts => {
            connection.start_port = source.second_port;
            connection.end_port = source.first_port;
            connection.start_port_edge_offset_mm = source.second_port_edge_offset_mm;
            connection.end_port_edge_offset_mm = source.first_port_edge_offset_mm;
        }
    }
    connection
}
