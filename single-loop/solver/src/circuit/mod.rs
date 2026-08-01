mod escalate;
mod fields;
mod plan;
mod schnecke;
mod search;
mod spiral;
mod types;
mod validate;
mod zone;

pub use escalate::{
    Candidate, LadderVerdict, SpacingOutcome, escalation_ladder, length_estimate_mm, rank,
    walk_ladder,
};
pub use fields::{
    Field, Lane, SpiralSide, build_lanes, decompose_fields, spiral_side_channel,
    spiral_side_sequence,
};
pub use plan::{SchneckeInput, SchneckePlan, plan_schnecke, zone_depth_mm};
pub use schnecke::{Schnecke, build_schnecke};
pub use search::{
    Action, Decision, Invariant, Journal, PatternRules, SearchFailure, SearchFailureKind,
    SearchState, backtracking_search, terminal_corridor_connected,
};
pub use spiral::{
    InwardArm, SpiralEnds, SpiralPath, SpiralRules, complete_spiral, plan_inward_arm,
    turn_budget_ok,
};
pub use types::{
    ConnectionInput, ConnectionOutput, CoverageOutput, FieldDiagnostics, JournalEntry,
    LocatedSpacing, LoopConstraintCertificate, LoopError, LoopErrorCode, LoopPattern, LoopPlan,
    LoopWarning, LoopWarningCode, RectMm, SolveLoopInput, SolveLoopResult, SpacingPenalty,
    validate_input,
};
pub use validate::{
    LoopCandidate, LoopCertificate, LoopContext, LoopSection, SectionKind, certify_loop,
};
pub use zone::{
    Attachment, ConnectionZone, LoopGraphView, attach_port, build_connection_zone,
    build_graph_view, edge_intersects_zone, filter_zone_nopps, zone_contains_local,
};
