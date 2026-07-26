mod enrich;
mod graph;
mod voronoi;

use crate::geometry::AllowedRegion;
use thiserror::Error;

pub use enrich::{
    GuideHitObservation, ReflexReplacementObservation, first_guide_hit_fixture,
    guide_hit_angle_is_accepted_fixture, guide_interval_count_fixture,
    reflex_faces_allow_replacement_fixture, reflex_replacement_decision_fixture,
    reflex_work_budget_fixture,
};
pub use graph::{
    EdgeId, GraphCenter, GraphPosition, MedialEdge, MedialGraph, MedialNode, NodeId,
    inside_work_budget_fixture,
};
pub use voronoi::{
    AdapterEdgeFixture, ParabolicFlatteningObservation, adapt_parabolic_voronoi_fixture,
    adapt_voronoi_fixture, boundary_scan_work_fixture, flatten_parabolic_fixture,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MedialAxisErrorReason {
    NonFiniteGuideSpacing,
    NonPositiveGuideSpacing,
    EmptyBoundary,
    EmptyGraph,
    VoronoiBuilderFailure,
    VoronoiLibraryPanic,
    MissingSourceSite,
    InvalidParabolicEdge,
    TopologySnapBudgetExceeded,
    FlatteningResourceLimit,
    GraphResourceLimit,
    NonFiniteGeometry,
    ZeroLengthEdge,
    InvalidNodeId,
    InvalidEdgeId,
    InvalidEdgeEndpoint,
    InvalidPolylineEndpoint,
    InvalidGraphPosition,
    DisconnectedGraph,
    CyclicGraph,
    EdgeCrossing,
    EdgeOutsideRegion,
    LeafNotOnBoundary,
    InvalidCyclicEmbedding,
    BoundaryProjectionFailed,
    EnrichmentFailure,
}

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum MedialAxisError {
    #[error("invalid medial-axis input: {reason:?}")]
    InvalidInput { reason: MedialAxisErrorReason },
    #[error("segment Voronoi construction failed: {reason:?}")]
    Voronoi { reason: MedialAxisErrorReason },
    #[error("degenerate medial graph: {reason:?}")]
    Degenerate { reason: MedialAxisErrorReason },
    #[error("medial graph validation failed: {reason:?}")]
    Validation { reason: MedialAxisErrorReason },
    #[error("medial-axis resource limit exceeded: {reason:?}")]
    ResourceLimit { reason: MedialAxisErrorReason },
}

impl MedialAxisError {
    pub const fn reason(&self) -> MedialAxisErrorReason {
        match *self {
            Self::InvalidInput { reason }
            | Self::Voronoi { reason }
            | Self::Degenerate { reason }
            | Self::Validation { reason }
            | Self::ResourceLimit { reason } => reason,
        }
    }

    pub(crate) const fn invalid(reason: MedialAxisErrorReason) -> Self {
        Self::InvalidInput { reason }
    }

    pub(crate) const fn voronoi(reason: MedialAxisErrorReason) -> Self {
        Self::Voronoi { reason }
    }

    pub(crate) const fn degenerate(reason: MedialAxisErrorReason) -> Self {
        Self::Degenerate { reason }
    }

    pub(crate) const fn validation(reason: MedialAxisErrorReason) -> Self {
        Self::Validation { reason }
    }

    pub(crate) const fn resource(reason: MedialAxisErrorReason) -> Self {
        Self::ResourceLimit { reason }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MedialGraphDiagnostics {
    pub infinite_edges_removed: usize,
    pub secondary_edges_removed: usize,
    pub outside_edges_removed: usize,
    pub parabolic_edges_flattened: usize,
    pub topology_snaps: usize,
    pub max_topology_snap_mm: f64,
    pub duplicate_edges_removed: usize,
    pub zero_length_edges_removed: usize,
    pub collinear_nodes_collapsed: usize,
    pub guide_candidates: usize,
    pub guide_branches_added: usize,
    pub low_angle_guides_rejected: usize,
    pub reflex_double_branch_candidates: usize,
    pub reflex_double_branches_replaced: usize,
    pub nonconvex_reflex_replacements_rejected: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BuiltMedialGraph {
    pub graph: MedialGraph,
    pub diagnostics: MedialGraphDiagnostics,
}

pub fn build_medial_graph(
    allowed: &AllowedRegion,
    guide_spacing_mm: f64,
) -> Result<MedialGraph, MedialAxisError> {
    build_medial_graph_with_diagnostics(allowed, guide_spacing_mm).map(|built| built.graph)
}

pub fn build_medial_graph_with_diagnostics(
    allowed: &AllowedRegion,
    guide_spacing_mm: f64,
) -> Result<BuiltMedialGraph, MedialAxisError> {
    if !guide_spacing_mm.is_finite() {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::NonFiniteGuideSpacing,
        ));
    }
    if guide_spacing_mm <= 0.0 {
        return Err(MedialAxisError::invalid(
            MedialAxisErrorReason::NonPositiveGuideSpacing,
        ));
    }
    if allowed.boundary.is_empty() || allowed.quantized_segments.is_empty() {
        return Err(MedialAxisError::degenerate(
            MedialAxisErrorReason::EmptyBoundary,
        ));
    }

    let mut diagnostics = MedialGraphDiagnostics::default();
    let mut graph = voronoi::build_from_allowed_region(allowed, &mut diagnostics)?;
    enrich::enrich_medial_graph(&mut graph, allowed, guide_spacing_mm, &mut diagnostics)?;
    graph.validate(allowed)?;

    Ok(BuiltMedialGraph { graph, diagnostics })
}
