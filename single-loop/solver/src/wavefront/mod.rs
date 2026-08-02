mod front;
mod schedule;
mod skeleton;

use crate::constants::{GENERATION_MARGIN_MM, MIN_NONLOCAL_SPACING_MM};
use crate::geometry::AllowedRegion;
use crate::medial_axis::MedialGraph;
use thiserror::Error;

pub use front::{
    CoreCycleVertex, EventSeamAnchor, PositionSignature, RadiusCapableCore, SkeletonSide,
    Wavefront, WavefrontFamily, WavefrontFamilyKind, WavefrontStableSignature, WavefrontVertex,
    WavefrontVertexId, non_intersecting_nested,
};
pub use schedule::point_family;
pub use skeleton::skeleton_family;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WavefrontErrorReason {
    InvalidNominalSpacing,
    InvalidGuideFactor,
    InvalidGuideSpacing,
    InvalidAllowedRegion,
    InvalidGraph,
    InvalidGraphPosition,
    EmptyFamily,
    DegenerateSkeleton,
    InvalidVertexId,
    InvalidFrontOrder,
    NonSimpleFront,
    InvalidParent,
    ParentDistanceExceeded,
    NonMonotoneGraphTime,
    NonNestedFronts,
    InvalidLeafCrossings,
    InvalidEventOrder,
    InvalidCore,
    WavefrontResourceLimit,
}

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum WavefrontError {
    #[error("invalid wavefront input: {reason:?}")]
    InvalidInput { reason: WavefrontErrorReason },
    #[error("invalid medial graph for wavefront construction: {reason:?}")]
    Graph { reason: WavefrontErrorReason },
    #[error("wavefront validation failed: {reason:?}")]
    Validation { reason: WavefrontErrorReason },
    #[error("wavefront resource limit exceeded: {reason:?}")]
    ResourceLimit { reason: WavefrontErrorReason },
}

impl WavefrontError {
    pub const fn reason(&self) -> WavefrontErrorReason {
        match *self {
            Self::InvalidInput { reason }
            | Self::Graph { reason }
            | Self::Validation { reason }
            | Self::ResourceLimit { reason } => reason,
        }
    }

    pub(crate) const fn invalid(reason: WavefrontErrorReason) -> Self {
        Self::InvalidInput { reason }
    }

    pub(crate) const fn graph(reason: WavefrontErrorReason) -> Self {
        Self::Graph { reason }
    }

    pub(crate) const fn validation(reason: WavefrontErrorReason) -> Self {
        Self::Validation { reason }
    }

    pub(crate) const fn resource(reason: WavefrontErrorReason) -> Self {
        Self::ResourceLimit { reason }
    }
}

pub fn generate_wavefront_families(
    graph: &MedialGraph,
    allowed: &AllowedRegion,
    nominal_spacing_mm: f64,
    guide_factor: f64,
) -> Result<Vec<WavefrontFamily>, WavefrontError> {
    graph
        .validate(allowed)
        .map_err(|_| WavefrontError::graph(WavefrontErrorReason::InvalidGraph))?;
    let polygon_perimeter_mm = allowed
        .boundary
        .iter()
        .map(|primitive| primitive.length())
        .sum::<f64>();
    if !polygon_perimeter_mm.is_finite() || polygon_perimeter_mm <= 0.0 {
        return Err(WavefrontError::invalid(
            WavefrontErrorReason::InvalidAllowedRegion,
        ));
    }

    let mut point = point_family(graph, nominal_spacing_mm, guide_factor)?;
    point.polygon_perimeter_mm = Some(polygon_perimeter_mm);
    let mut families = vec![point];
    if let Ok(Some(skeleton)) = skeleton_family(graph, allowed, nominal_spacing_mm, guide_factor) {
        families.push(skeleton);
    }
    Ok(families)
}

pub(crate) fn checked_guide_spacing(
    nominal_spacing_mm: f64,
    guide_factor: f64,
) -> Result<f64, WavefrontError> {
    if !nominal_spacing_mm.is_finite() || nominal_spacing_mm <= 0.0 {
        return Err(WavefrontError::invalid(
            WavefrontErrorReason::InvalidNominalSpacing,
        ));
    }
    if !guide_factor.is_finite() || guide_factor <= 0.0 || guide_factor > 1.0 {
        return Err(WavefrontError::invalid(
            WavefrontErrorReason::InvalidGuideFactor,
        ));
    }
    let guide_spacing_mm =
        (guide_factor * nominal_spacing_mm).max(MIN_NONLOCAL_SPACING_MM + GENERATION_MARGIN_MM);
    if !guide_spacing_mm.is_finite() {
        return Err(WavefrontError::invalid(
            WavefrontErrorReason::InvalidGuideSpacing,
        ));
    }
    Ok(guide_spacing_mm)
}
