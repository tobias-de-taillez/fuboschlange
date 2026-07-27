use super::provenance::{SpiralProvenance, build_parent_pairs};
use super::rounding::{RoundingError, global_dps_feasibility, round_polyline};
use super::seam::{AnchorKind, SeamAnchor, seam_anchors};
use super::turn::{InnerTurnKind, Pose, inner_turn_candidates};
use crate::constants::{GENERATION_MARGIN_MM, MIN_NONLOCAL_SPACING_MM};
use crate::geometry::{CanonicalPath, Vec2, canonicalize_path};
use crate::model::{PathPrimitive, Point};
use crate::validation::{ParentPair, PrimitiveRole};
use crate::wavefront::{WavefrontFamily, WavefrontFamilyKind};
use std::f64::consts::TAU;

const POINT_EPSILON_MM: f64 = 1e-7;
const MAX_CORE_LEVELS: usize = 256;
const MAX_RAW_CORE_POINTS: usize = 100_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Direction {
    Ccw,
    Cw,
}

impl Direction {
    const fn opposite(self) -> Self {
        match self {
            Self::Ccw => Self::Cw,
            Self::Cw => Self::Ccw,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CandidateKey {
    pub family: u8,
    pub guide_factor_index: u16,
    pub direction: Direction,
    pub anchor_kind: AnchorKind,
    pub anchor_order: u32,
    pub turn_variant: u16,
}

#[derive(Clone, Debug)]
pub struct SpiralCoreCandidate {
    pub path: CanonicalPath,
    pub provenance: SpiralProvenance,
    pub parent_pairs: Vec<ParentPair>,
    pub inbound_seam_pose: Pose,
    pub outbound_seam_pose: Pose,
    pub key: CandidateKey,
}

impl SpiralCoreCandidate {
    pub fn connected_component_count(&self) -> usize {
        let primitives = self.path.primitives();
        if primitives.is_empty() {
            return 0;
        }
        1 + primitives
            .windows(2)
            .filter(|pair| {
                (primitive_end(&pair[0]) - primitive_start(&pair[1])).norm() > POINT_EPSILON_MM
            })
            .count()
    }
}

pub fn generate_core(
    family: &WavefrontFamily,
    anchor: SeamAnchor,
    direction: Direction,
    min_radius_mm: f64,
) -> std::vec::IntoIter<SpiralCoreCandidate> {
    generate_core_with_index(family, anchor, direction, 0, min_radius_mm).into_iter()
}

pub fn generate_all_cores(
    family: &WavefrontFamily,
    guide_factor_index: u16,
    min_radius_mm: f64,
) -> Vec<SpiralCoreCandidate> {
    let mut candidates = Vec::new();
    for anchor in seam_anchors(family) {
        for direction in [Direction::Ccw, Direction::Cw] {
            candidates.extend(generate_core_with_index(
                family,
                anchor,
                direction,
                guide_factor_index,
                min_radius_mm,
            ));
        }
    }
    candidates.sort_by_key(|candidate| candidate.key);
    candidates
}

pub fn generate_core_with_index(
    family: &WavefrontFamily,
    anchor: SeamAnchor,
    direction: Direction,
    guide_factor_index: u16,
    min_radius_mm: f64,
) -> Vec<SpiralCoreCandidate> {
    if !min_radius_mm.is_finite()
        || min_radius_mm <= 0.0
        || family.fronts.len() > MAX_CORE_LEVELS
        || family.vertices.len() > MAX_RAW_CORE_POINTS
    {
        return Vec::new();
    }
    let Some(levels) = selected_front_levels(family, min_radius_mm) else {
        return Vec::new();
    };
    let Some(core_center) = core_center(family) else {
        return Vec::new();
    };
    let inbound_specs = (0..levels.len())
        .step_by(2)
        .map(|winding| (winding, levels[levels.len() - 1 - winding], direction))
        .collect::<Vec<_>>();
    let outbound_specs = (1..levels.len())
        .step_by(2)
        .rev()
        .map(|winding| {
            (
                winding,
                levels[levels.len() - 1 - winding],
                direction.opposite(),
            )
        })
        .collect::<Vec<_>>();
    let Some(&(_, first_outbound_front, first_outbound_direction)) = outbound_specs.first() else {
        return Vec::new();
    };
    let phase_advance = family
        .fronts
        .last()
        .map(|front| 0.25 / front.vertices.len().max(1) as f64)
        .unwrap_or(0.0);
    let outbound_fraction = (anchor.perimeter_fraction + phase_advance).rem_euclid(1.0);
    let Some(first_outbound_points) = open_front_points(
        family,
        first_outbound_front,
        outbound_fraction,
        first_outbound_direction,
    ) else {
        return Vec::new();
    };
    let Some(first_outbound_point) = first_outbound_points.first().copied() else {
        return Vec::new();
    };
    let turn_radius_mm = min_radius_mm + 0.5 * GENERATION_MARGIN_MM;
    if 2.0 * turn_radius_mm >= family.core.reserved_turn_diameter_mm {
        return Vec::new();
    }
    let Some((turn_start, turn_end, turn_tangent, outbound_tangent)) =
        tangent_turn_geometry(core_center, first_outbound_point, turn_radius_mm, direction)
    else {
        return Vec::new();
    };
    let approach_length_mm = 2.0 * min_radius_mm + family.guide_spacing_mm.min(40.0);

    let Some(inbound_raw) = build_inbound_raw_arm(
        family,
        &inbound_specs,
        anchor.perimeter_fraction,
        turn_start,
        turn_tangent,
        approach_length_mm,
    ) else {
        return Vec::new();
    };
    let Some(&(_, outer_front, _)) = inbound_specs.first() else {
        return Vec::new();
    };
    let Some(outer_endpoint) =
        open_front_points(family, outer_front, anchor.perimeter_fraction, direction)
            .and_then(|points| points.last().copied())
    else {
        return Vec::new();
    };
    let Some(outbound_raw) = build_outbound_raw_arm(
        family,
        &outbound_specs,
        outbound_fraction,
        turn_end,
        outer_endpoint,
    ) else {
        return Vec::new();
    };
    let Some((inbound_primitives, inbound_roles)) =
        round_and_attribute(&inbound_raw, min_radius_mm, true)
    else {
        return Vec::new();
    };
    let Some((outbound_primitives, outbound_roles)) =
        round_and_attribute(&outbound_raw, min_radius_mm, false)
    else {
        return Vec::new();
    };

    let start_turn_pose = Pose::new(turn_start, turn_tangent);
    let end_turn_pose = Pose::new(turn_end, outbound_tangent);
    let (Some(start_turn_pose), Some(end_turn_pose)) = (start_turn_pose, end_turn_pose) else {
        return Vec::new();
    };
    let turns = inner_turn_candidates(
        start_turn_pose,
        end_turn_pose,
        min_radius_mm,
        family.core.reserved_turn_diameter_mm,
    );

    let mut candidates = Vec::new();
    for (turn_index, turn) in turns.into_iter().enumerate() {
        if turn.primitives.len() != 1 {
            continue;
        }
        let Ok(turn_variant) = u16::try_from(turn_index) else {
            break;
        };
        let mut primitives = Vec::with_capacity(
            inbound_primitives.len() + turn.primitives.len() + outbound_primitives.len(),
        );
        primitives.extend(inbound_primitives.iter().cloned());
        primitives.extend(turn.primitives);
        primitives.extend(outbound_primitives.iter().cloned());
        let mut roles = Vec::with_capacity(primitives.len());
        roles.extend(inbound_roles.iter().cloned());
        roles.push(PrimitiveRole::InnerTurn);
        roles.extend(outbound_roles.iter().cloned());
        let Ok(path) = canonicalize_path(&primitives) else {
            continue;
        };
        if path.primitives().len() != roles.len()
            || !role_sequence_is_complete(&roles, levels.len())
        {
            continue;
        }
        let Some(parent_pairs) = build_parent_pairs(path.primitives(), &roles) else {
            continue;
        };
        let Some(inbound_seam_pose) = Pose::new(
            primitive_start(&path.primitives()[0]),
            path.primitives()[0].start_tangent(),
        ) else {
            continue;
        };
        let Some(last) = path.primitives().last() else {
            continue;
        };
        let Some(outbound_seam_pose) = Pose::new(primitive_end(last), last.end_tangent()) else {
            continue;
        };
        candidates.push(SpiralCoreCandidate {
            path,
            provenance: SpiralProvenance { roles },
            parent_pairs,
            inbound_seam_pose,
            outbound_seam_pose,
            key: CandidateKey {
                family: family_key(family.kind),
                guide_factor_index,
                direction,
                anchor_kind: anchor.kind,
                anchor_order: anchor.anchor_order,
                turn_variant: turn_variant.saturating_add(turn_kind_offset(turn.kind)),
            },
        });
    }
    candidates.sort_by_key(|candidate| candidate.key);
    candidates
}

#[derive(Clone, Debug)]
struct RawArm {
    points: Vec<Point>,
    protected_points: Vec<bool>,
    segment_windings: Vec<usize>,
    segment_lengths_mm: Vec<f64>,
}

impl RawArm {
    fn new(start: Point) -> Self {
        Self {
            points: vec![start],
            protected_points: vec![true],
            segment_windings: Vec::new(),
            segment_lengths_mm: Vec::new(),
        }
    }

    fn push(&mut self, point: Point, winding: usize) -> bool {
        let Some(previous) = self.points.last().copied() else {
            return false;
        };
        let length = (point - previous).norm();
        if !length.is_finite() {
            return false;
        }
        if length <= POINT_EPSILON_MM {
            return true;
        }
        if self.points.len() >= MAX_RAW_CORE_POINTS {
            return false;
        }
        self.points.push(point);
        self.protected_points.push(false);
        self.segment_windings.push(winding);
        self.segment_lengths_mm.push(length);
        true
    }

    fn protect_last(&mut self) -> Option<()> {
        *self.protected_points.last_mut()? = true;
        Some(())
    }
}

fn build_inbound_raw_arm(
    family: &WavefrontFamily,
    specs: &[(usize, usize, Direction)],
    fraction: f64,
    turn_start: Point,
    turn_tangent: Vec2,
    approach_length_mm: f64,
) -> Option<RawArm> {
    let &(first_winding, first_front, first_direction) = specs.first()?;
    let first_points = open_front_points(family, first_front, fraction, first_direction)?;
    let mut raw = RawArm::new(*first_points.first()?);
    append_front_remainder(&mut raw, &first_points, first_winding)?;
    let mut previous_winding = first_winding;
    for &(winding, front, direction) in &specs[1..] {
        let points = open_front_points(family, front, fraction, direction)?;
        raw.push(*points.first()?, previous_winding).then_some(())?;
        append_front_remainder(&mut raw, &points, winding)?;
        previous_winding = winding;
    }
    raw.push(
        turn_start - turn_tangent * approach_length_mm,
        previous_winding,
    )
    .then_some(())?;
    raw.protect_last()?;
    raw.push(turn_start, previous_winding).then_some(())?;
    Some(raw)
}

fn build_outbound_raw_arm(
    family: &WavefrontFamily,
    specs: &[(usize, usize, Direction)],
    fraction: f64,
    turn_end: Point,
    outer_endpoint: Point,
) -> Option<RawArm> {
    let &(first_winding, first_front, first_direction) = specs.first()?;
    let first_points = open_front_points(family, first_front, fraction, first_direction)?;
    let mut raw = RawArm::new(turn_end);
    raw.push(*first_points.first()?, first_winding)
        .then_some(())?;
    append_front_remainder(&mut raw, &first_points, first_winding)?;
    let mut previous_winding = first_winding;
    for &(winding, front, direction) in &specs[1..] {
        let points = open_front_points(family, front, fraction, direction)?;
        raw.push(*points.first()?, previous_winding).then_some(())?;
        append_front_remainder(&mut raw, &points, winding)?;
        previous_winding = winding;
    }
    raw.push(outer_endpoint, previous_winding).then_some(())?;
    Some(raw)
}

fn append_front_remainder(raw: &mut RawArm, points: &[Point], winding: usize) -> Option<()> {
    for point in points.iter().copied().skip(1) {
        raw.push(point, winding).then_some(())?;
    }
    Some(())
}

fn round_and_attribute(
    raw: &RawArm,
    min_radius_mm: f64,
    inbound: bool,
) -> Option<(Vec<PathPrimitive>, Vec<PrimitiveRole>)> {
    if raw.segment_windings.len() + 1 != raw.points.len()
        || raw.segment_lengths_mm.len() != raw.segment_windings.len()
    {
        return None;
    }
    let simplified = simplify_for_rounding(raw, min_radius_mm)?;
    let primitives = round_polyline(&simplified.points, min_radius_mm).ok()?;
    let mut roles = Vec::with_capacity(primitives.len());
    let mut previous_winding: Option<usize> = None;
    for primitive in &primitives {
        let midpoint = primitive.point_at(0.5);
        let nearest_winding = nearest_raw_winding(&simplified, midpoint)?;
        let winding = previous_winding.map_or(nearest_winding, |previous| {
            if inbound {
                previous.max(nearest_winding)
            } else {
                previous.min(nearest_winding)
            }
        });
        previous_winding = Some(winding);
        roles.push(if inbound {
            PrimitiveRole::Inbound { winding }
        } else {
            PrimitiveRole::Outbound { winding }
        });
    }
    Some((primitives, roles))
}

fn nearest_raw_winding(raw: &RawArm, point: Point) -> Option<usize> {
    raw.points
        .windows(2)
        .enumerate()
        .map(|(index, segment)| {
            (
                point_to_segment_distance(point, segment[0], segment[1]),
                index,
            )
        })
        .filter(|(distance, _)| distance.is_finite())
        .min_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.cmp(&right.1))
        })
        .and_then(|(_, index)| raw.segment_windings.get(index).copied())
}

fn point_to_segment_distance(point: Point, start: Point, end: Point) -> f64 {
    let segment = end - start;
    let length_squared = segment.norm_squared();
    if !length_squared.is_finite() || length_squared <= 0.0 {
        return f64::INFINITY;
    }
    let parameter = ((point - start).dot(segment) / length_squared).clamp(0.0, 1.0);
    (point - (start + segment * parameter)).norm()
}

fn simplify_for_rounding(raw: &RawArm, min_radius_mm: f64) -> Option<RawArm> {
    let mut simplified = raw.clone();
    let maximum_removals = simplified.points.len();
    for _ in 0..=maximum_removals {
        match global_dps_feasibility(&simplified.points, min_radius_mm) {
            Ok(()) => return Some(simplified),
            Err(RoundingError::InsufficientSegment { index }) => {
                let end_point = index + 1;
                let start_point = index;
                let remove = removable_corner(&simplified, end_point)
                    .or_else(|| removable_corner(&simplified, start_point))?;
                remove_raw_corner(&mut simplified, remove)?;
            }
            Err(RoundingError::Reversal { index }) => {
                let remove = removable_corner(&simplified, index)?;
                remove_raw_corner(&mut simplified, remove)?;
            }
            Err(
                RoundingError::TooFewPoints
                | RoundingError::InvalidPoint { .. }
                | RoundingError::InvalidRadius
                | RoundingError::NonFiniteConstruction,
            ) => return None,
        }
    }
    None
}

fn removable_corner(raw: &RawArm, point_index: usize) -> Option<usize> {
    if point_index == 0
        || point_index + 1 >= raw.points.len()
        || raw
            .protected_points
            .get(point_index)
            .copied()
            .unwrap_or(true)
    {
        return None;
    }
    let before = *raw.segment_windings.get(point_index - 1)?;
    let after = *raw.segment_windings.get(point_index)?;
    if before != after
        || raw
            .segment_windings
            .iter()
            .filter(|winding| **winding == before)
            .count()
            <= 1
    {
        return None;
    }
    Some(point_index)
}

fn remove_raw_corner(raw: &mut RawArm, point_index: usize) -> Option<()> {
    let previous = *raw.points.get(point_index - 1)?;
    let next = *raw.points.get(point_index + 1)?;
    let merged_length = (next - previous).norm();
    if !merged_length.is_finite() || merged_length <= POINT_EPSILON_MM {
        return None;
    }
    raw.points.remove(point_index);
    raw.protected_points.remove(point_index);
    raw.segment_windings.remove(point_index);
    raw.segment_lengths_mm[point_index - 1] = merged_length;
    raw.segment_lengths_mm.remove(point_index);
    Some(())
}

fn selected_front_levels(family: &WavefrontFamily, min_radius_mm: f64) -> Option<Vec<usize>> {
    let first = usize::from(family.kind == WavefrontFamilyKind::Point);
    let mut levels = (first..family.fronts.len())
        .filter(|index| front_is_usable(family, *index, min_radius_mm))
        .collect::<Vec<_>>();
    if levels.len() % 2 != 0 {
        levels.remove(0);
    }
    (levels.len() >= 2).then_some(levels)
}

fn front_is_usable(family: &WavefrontFamily, front_index: usize, min_radius_mm: f64) -> bool {
    let Some(front) = family.fronts.get(front_index) else {
        return false;
    };
    if front.vertices.len() < 3 {
        return false;
    }
    let points = front
        .vertices
        .iter()
        .filter_map(|id| family.vertices.get(id.index()).map(|vertex| vertex.point))
        .collect::<Vec<_>>();
    if points.len() != front.vertices.len() {
        return false;
    }
    let perimeter = points
        .iter()
        .copied()
        .zip(points.iter().copied().cycle().skip(1))
        .take(points.len())
        .map(|(start, end)| (end - start).norm())
        .sum::<f64>();
    perimeter.is_finite() && perimeter >= TAU * min_radius_mm
}

fn open_front_points(
    family: &WavefrontFamily,
    front_index: usize,
    anchor_fraction: f64,
    direction: Direction,
) -> Option<Vec<Point>> {
    let front = family.fronts.get(front_index)?;
    let points = front
        .vertices
        .iter()
        .map(|id| family.vertices.get(id.index()).map(|vertex| vertex.point))
        .collect::<Option<Vec<_>>>()?;
    if points.len() < 3 {
        return None;
    }
    let mut cumulative = Vec::with_capacity(points.len() + 1);
    cumulative.push(0.0);
    for (start, end) in points
        .iter()
        .copied()
        .zip(points.iter().copied().cycle().skip(1))
        .take(points.len())
    {
        let length = (end - start).norm();
        if !length.is_finite() || length <= POINT_EPSILON_MM {
            return None;
        }
        cumulative.push(cumulative.last().copied()? + length);
    }
    let perimeter = *cumulative.last()?;
    let gap_mm = ((MIN_NONLOCAL_SPACING_MM + GENERATION_MARGIN_MM) * 2.0_f64.sqrt())
        .max(family.guide_spacing_mm * 0.05)
        .min(perimeter / 10.0);
    if gap_mm <= POINT_EPSILON_MM || perimeter <= 2.0 * gap_mm {
        return None;
    }
    let anchor_distance = anchor_fraction.rem_euclid(1.0) * perimeter;
    let start_distance = match direction {
        Direction::Ccw => anchor_distance + 0.5 * gap_mm,
        Direction::Cw => anchor_distance - 0.5 * gap_mm,
    };
    let travel = perimeter - gap_mm;
    let mut ordered = vec![point_at_perimeter(&points, &cumulative, start_distance)?];
    let mut vertices = cumulative[..points.len()]
        .iter()
        .copied()
        .enumerate()
        .filter_map(|(index, distance)| {
            let delta = match direction {
                Direction::Ccw => (distance - start_distance).rem_euclid(perimeter),
                Direction::Cw => (start_distance - distance).rem_euclid(perimeter),
            };
            (delta > POINT_EPSILON_MM && delta < travel - POINT_EPSILON_MM)
                .then_some((delta, points[index]))
        })
        .collect::<Vec<_>>();
    vertices.sort_by(|left, right| left.0.total_cmp(&right.0));
    ordered.extend(vertices.into_iter().map(|(_, point)| point));
    let end_distance = match direction {
        Direction::Ccw => start_distance + travel,
        Direction::Cw => start_distance - travel,
    };
    ordered.push(point_at_perimeter(&points, &cumulative, end_distance)?);
    Some(ordered)
}

fn point_at_perimeter(points: &[Point], cumulative: &[f64], distance: f64) -> Option<Point> {
    let perimeter = *cumulative.last()?;
    let target = distance.rem_euclid(perimeter);
    let segment = cumulative[1..]
        .partition_point(|end| *end < target)
        .min(points.len() - 1);
    let start_distance = cumulative[segment];
    let end_distance = cumulative[segment + 1];
    let parameter = ((target - start_distance) / (end_distance - start_distance)).clamp(0.0, 1.0);
    Some(points[segment] + (points[(segment + 1) % points.len()] - points[segment]) * parameter)
}

fn tangent_turn_geometry(
    center: Point,
    outbound_target: Point,
    radius_mm: f64,
    direction: Direction,
) -> Option<(Point, Point, Vec2, Vec2)> {
    let to_target = outbound_target - center;
    let distance = to_target.norm();
    if !distance.is_finite() || distance <= radius_mm {
        return None;
    }
    let radial = to_target / distance;
    let perpendicular = radial.perp_ccw();
    let along = radius_mm * radius_mm / distance;
    let across = radius_mm * (distance * distance - radius_mm * radius_mm).sqrt() / distance;
    let sign = match direction {
        Direction::Ccw => 1.0,
        Direction::Cw => -1.0,
    };
    let turn_end = center + radial * along + perpendicular * (sign * across);
    let outbound_tangent = (outbound_target - turn_end).normalized()?;
    let turn_start = center + (center - turn_end);
    let turn_tangent = -outbound_tangent;
    Some((turn_start, turn_end, turn_tangent, outbound_tangent))
}

fn core_center(family: &WavefrontFamily) -> Option<Point> {
    let front = family.fronts.first()?;
    let points = front
        .vertices
        .iter()
        .map(|id| family.vertices.get(id.index()).map(|vertex| vertex.point))
        .collect::<Option<Vec<_>>>()?;
    if points.is_empty() {
        return None;
    }
    let origin = points[0];
    let average_offset = points
        .iter()
        .map(|point| *point - origin)
        .fold(Vec2::ZERO, |sum, offset| sum + offset)
        / points.len() as f64;
    let center = origin + average_offset;
    (center.x.is_finite() && center.y.is_finite()).then_some(center)
}

fn role_sequence_is_complete(roles: &[PrimitiveRole], phase_count: usize) -> bool {
    let provenance = SpiralProvenance {
        roles: roles.to_vec(),
    };
    if provenance.inner_turn_count() != 1
        || !provenance.inbound_windings_are_monotone()
        || !provenance.outbound_windings_are_monotone()
        || !provenance.parent_phases_alternate()
    {
        return false;
    }
    let mut present = vec![false; phase_count];
    for role in roles {
        match role {
            PrimitiveRole::Inbound { winding } | PrimitiveRole::Outbound { winding }
                if *winding < phase_count =>
            {
                present[*winding] = true;
            }
            PrimitiveRole::InnerTurn => {}
            PrimitiveRole::Inbound { .. }
            | PrimitiveRole::Outbound { .. }
            | PrimitiveRole::StartLead
            | PrimitiveRole::EndLead => return false,
        }
    }
    present.into_iter().all(|phase| phase)
}

const fn family_key(kind: WavefrontFamilyKind) -> u8 {
    match kind {
        WavefrontFamilyKind::Point => 0,
        WavefrontFamilyKind::Skeleton => 1,
    }
}

const fn turn_kind_offset(kind: InnerTurnKind) -> u16 {
    match kind {
        InnerTurnKind::Semicircle => 0,
        InnerTurnKind::LargerArc => 1_000,
        InnerTurnKind::Biarc => 2_000,
    }
}

fn primitive_start(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { start, .. } | PathPrimitive::Arc { start, .. } => *start,
    }
}

fn primitive_end(primitive: &PathPrimitive) -> Point {
    match primitive {
        PathPrimitive::Line { end, .. } | PathPrimitive::Arc { end, .. } => *end,
    }
}
