mod fields;
mod types;
mod zone;

pub use fields::{Field, Lane, build_lanes, decompose_fields};
pub use types::{
    ConnectionInput, ConnectionOutput, CoverageOutput, FieldDiagnostics, JournalEntry,
    LocatedSpacing, LoopConstraintCertificate, LoopError, LoopErrorCode, LoopPattern, LoopPlan,
    LoopWarning, LoopWarningCode, RectMm, SolveLoopInput, SolveLoopResult, SpacingPenalty,
    validate_input,
};
pub use zone::{
    ConnectionZone, LoopGraphView, build_connection_zone, build_graph_view, edge_intersects_zone,
    filter_zone_nopps, zone_contains_local,
};
