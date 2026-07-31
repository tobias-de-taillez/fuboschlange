# BEKOTEC Loop Solver (B+) — Spiral Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the B+ backtracking loop solver end-to-end for the `spiral` pattern on the certified BEKOTEC pose graph, with connection zone, spacing escalation, independent validation, and a browser page.

**Architecture:** A new `circuit` module consumes the certified `EmbeddedPoseGraph`. Field decomposition and a lane model turn the room into ordered search units; the search plans only the inward arm under hard invariants (double-spacing reservation, terminal reachability, turn budget), then constructs the turn and the return arm instead of searching them. A journaled decision stack implements documented backtracking. An extended independent validator certifies edge provenance, zone automaton, pattern provenance, touch/50 mm spacing, and coverage before any success.

**Tech Stack:** Rust 2024, existing `plate::{EmbeddedPoseGraph, PlateInstance, PlateProfile, PlateTransform}`, existing `validation::coverage::coverage_bounds`, serde/wasm-bindgen, TypeScript 7, Vite 8, Vitest, SVG.

## Global Constraints

- Profile: `BEKOTEC_EN_23_FI_30_16`; pitch 75 mm; pipe 16 mm; min centerline bend radius 80 mm.
- Spacing values exactly `{75, 150, 225, 300}` mm; escalation only upward and only on length-only failure.
- Max loop length 100,000 mm including the connection zone.
- Hard: no self-crossing, no touching of non-adjacent path parts, center–center distance > 16 mm everywhere.
- Soft: center–center below 50 mm is penalized (`max(0, 50 − d)` summed), never forbidden outside touching.
- Outside the connection zone the path consists exclusively of certified graph edges (ID + geometry provenance).
- Ports: on the connection edge, 50 mm center–center, wall-orthogonal inward tangents.
- Connection zone: axis-parallel rectangle in the plate frame, user-parameterized (defaults 450 × 225 mm), nopp-free, free-form `Line | Arc` routing inside.
- `pattern: "meander" | "free"` returns typed `PATTERN_NOT_IMPLEMENTED` in this milestone.
- Deterministic output; typed errors; no panics; generator output untrusted until independently certified.
- No GPL/AGPL/non-commercial production dependency.
- This milestone must never claim success for a plan the independent validator did not certify.

## Planned File Map

```
single-loop/solver/src/circuit/
├── mod.rs          re-exports
├── types.rs        SolveLoopInput, LoopPlan, errors, warnings (serde camelCase)
├── zone.rs         ConnectionZone: rectangle, ports, graph filtering, entry anchors
├── fields.rs       field decomposition + lane model
├── search.rs       state, actions, journal, backtracking, reservation, cut check
├── spiral.rs       double-spacing rules, turn budget, turn insertion, return construction
├── escalate.rs     length pre-prune, spacing ladder, ranking
├── validate.rs     independent loop validator (provenance, zone automaton, spacing, coverage)
└── api.rs          solve_loop orchestration + WASM export
single-loop/src/circuit/{types.ts, model.ts}
single-loop/src/render/loop-scene.ts
single-loop/loop.html, single-loop/src/loop-main.ts
single-loop/fixtures/circuit/*.json
```

---

### Task 1: Circuit contracts

**Files:**
- Create: `single-loop/solver/src/circuit/mod.rs`
- Create: `single-loop/solver/src/circuit/types.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/circuit_types.rs`

**Interfaces:**
- Consumes: `model::{Point, PathPrimitive}`.
- Produces: `SolveLoopInput`, `ConnectionInput`, `LoopPattern`, `LoopPlan`, `LoopError`, `LoopErrorCode`, `LoopWarning`, `LoopWarningCode`, `SolveLoopResult`, `RectMm`, `JournalEntry`, `LocatedSpacing`.

- [ ] **Step 1: Write failing contract tests**

```rust
use single_loop_solver::circuit::{
    ConnectionInput, LoopErrorCode, LoopPattern, SolveLoopInput,
};

fn base_input(pattern: LoopPattern) -> SolveLoopInput {
    SolveLoopInput {
        polygon: vec![
            point(0.0, 0.0), point(3000.0, 0.0),
            point(3000.0, 2400.0), point(0.0, 2400.0),
        ],
        connection: ConnectionInput {
            edge_index: 0,
            center_offset_mm: 1500.0,
            zone_width_mm: 450.0,
            zone_depth_mm: 225.0,
        },
        requested_spacing_mm: 150,
        wall_clearance_mm: 75.0,
        phase_u_mm: 0.0,
        phase_v_mm: 0.0,
        pattern,
        profile: "BEKOTEC_EN_23_FI_30_16".to_owned(),
    }
}

#[test]
fn input_round_trips_camel_case_json() {
    let json = serde_json::to_value(base_input(LoopPattern::Spiral)).unwrap();
    assert_eq!(json["requestedSpacingMm"], 150);
    assert_eq!(json["connection"]["zoneWidthMm"], 450.0);
    assert_eq!(json["pattern"], "spiral");
    let back: SolveLoopInput = serde_json::from_value(json).unwrap();
    assert_eq!(back, base_input(LoopPattern::Spiral));
}

#[test]
fn spacing_outside_system_list_is_rejected() {
    let mut input = base_input(LoopPattern::Spiral);
    input.requested_spacing_mm = 100;
    assert_eq!(
        single_loop_solver::circuit::validate_input(&input).unwrap_err().code,
        LoopErrorCode::InvalidRequestedSpacing
    );
}

#[test]
fn meander_and_free_are_typed_not_implemented() {
    for pattern in [LoopPattern::Meander, LoopPattern::Free] {
        assert_eq!(
            single_loop_solver::circuit::validate_input(&base_input(pattern))
                .unwrap_err()
                .code,
            LoopErrorCode::PatternNotImplemented
        );
    }
}
```

- [ ] **Step 2: Run and confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_types
```

Expected: compile error, `circuit` module missing.

- [ ] **Step 3: Implement contracts**

`types.rs`: serde camelCase everywhere. `LoopPattern` as `#[serde(rename_all = "lowercase")]` enum `Spiral | Meander | Free`. `requested_spacing_mm: u32` validated against `[75, 150, 225, 300]`. `LoopErrorCode` (SCREAMING_SNAKE_CASE serde):

```rust
InvalidPolygon, InvalidWallClearance, InvalidPlatePhase, UnknownPlateProfile,
InvalidConnection, InvalidRequestedSpacing, PatternNotImplemented,
NoSolutionGeometry, NoSolutionLength, SolverLimitExceeded,
InternalValidationFailure,
```

`LoopWarningCode`: `SpacingIncreased, SpacingExceeds250Mm, SpacingPenaltyApplied`.
`validate_input(&SolveLoopInput) -> Result<(), LoopError>` checks finiteness, spacing list, pattern, profile name, wall clearance ≥ 8, zone dimensions > 0. `LoopPlan`, `RectMm { min: Point, max: Point }`, `JournalEntry { decision: String, rejected_by: Option<String>, witness: Option<Point> }`, `LocatedSpacing { distance_mm, first_point, second_point }`, `SolveLoopResult` as tagged `{ ok: true, plan } | { ok: false, error }` mirroring `PlateModelResult` serialization in `plate/api.rs`. Export `pub mod circuit;` from `lib.rs`.

- [ ] **Step 4: Run tests and clippy**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_types
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets -- -D warnings
```

Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/lib.rs single-loop/solver/src/circuit single-loop/solver/tests/circuit_types.rs
git commit -m "feat(single-loop): define circuit solver contracts"
```

### Task 2: Connection zone and loop-usable graph view

**Files:**
- Create: `single-loop/solver/src/circuit/zone.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_zone.rs`

**Interfaces:**
- Consumes: `plate::{PlateInstance, PlateTransform, EmbeddedPoseGraph, PoseNode, PoseEdge}`, `geometry::Polygon`, `circuit::types::{ConnectionInput, LoopError}`.
- Produces:

```rust
pub struct ConnectionZone {
    pub rect_local: RectMm,          // plate-local, axis-parallel
    pub start_port: Point,           // world
    pub end_port: Point,             // world
    pub inward: Vec2,                // world unit normal, into the room
}
pub fn build_connection_zone(
    polygon: &Polygon, transform: &PlateTransform, connection: &ConnectionInput,
) -> Result<ConnectionZone, LoopError>;
pub struct LoopGraphView {
    pub usable_edges: Vec<u32>,              // edge ids untouched by the zone
    pub entry_candidates: Vec<u32>,          // node ids inside zone ⊕ 150 mm ring
}
pub fn build_graph_view(
    graph: &EmbeddedPoseGraph, zone: &ConnectionZone, transform: &PlateTransform,
) -> LoopGraphView;
pub fn filter_zone_nopps(instance: &mut PlateInstance, zone: &ConnectionZone);
```

- [ ] **Step 1: Write failing zone tests**

```rust
#[test]
fn zone_is_centered_on_port_center_and_contains_both_ports() {
    let zone = build_connection_zone(&rect_polygon(), &transform(), &connection()).unwrap();
    assert!((zone.start_port.distance_to(zone.end_port) - 50.0).abs() < 1e-9);
    // ports lie on the connection edge (y = 0 for edge 0 of the rectangle)
    assert!(zone.start_port.y.abs() < 1e-9);
}

#[test]
fn zone_outside_polygon_is_invalid_connection() {
    let mut connection = connection();
    connection.center_offset_mm = 10.0; // zone would leave the polygon
    assert_eq!(
        build_connection_zone(&rect_polygon(), &transform(), &connection)
            .unwrap_err().code,
        LoopErrorCode::InvalidConnection
    );
}

#[test]
fn graph_view_drops_zone_crossing_edges_and_keeps_far_edges() {
    let (graph, zone, transform) = fixture();
    let view = build_graph_view(&graph, &zone, &transform);
    assert!(!view.usable_edges.is_empty());
    for edge in &graph.edges {
        let crosses = edge_intersects_zone(edge, &zone, &transform);
        assert_eq!(view.usable_edges.contains(&edge.id), !crosses);
    }
    assert!(!view.entry_candidates.is_empty());
}

#[test]
fn zone_nopps_are_removed_from_the_instance() {
    let (mut instance, zone) = instance_fixture();
    let before = instance.nopps.len();
    filter_zone_nopps(&mut instance, &zone);
    assert!(instance.nopps.len() < before);
    assert!(instance.nopps.iter().all(|nopp| !zone_contains_local(&zone, nopp)));
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_zone
```

Expected: unresolved `circuit::zone` imports.

- [ ] **Step 3: Implement**

Zone rectangle in plate-local coordinates: centered on the normalized port
center on the selected edge, `zone_width_mm` along `u`, `zone_depth_mm` along
`v` into the room. `InvalidConnection` when: edge index out of range, ports
closer than 33 mm (25 + 8) to an edge endpoint, or any zone corner outside the
polygon. Ports: ±25 mm along the edge around the center. Edge/zone
intersection test: analytic line/arc vs axis-parallel rectangle in local
coordinates (transform primitives with the existing `PlateTransform::to_local`);
conservative — any intersection or containment drops the edge. Entry
candidates: nodes whose local point lies in the zone rectangle expanded by
150 mm but not inside the zone itself, sorted by node id.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_zone
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_zone.rs
git commit -m "feat(single-loop): model connection zone and loop graph view"
```

### Task 3: Field decomposition

**Files:**
- Create: `single-loop/solver/src/circuit/fields.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_fields.rs`

**Interfaces:**
- Consumes: `geometry::Polygon`, `plate::PlateTransform`.
- Produces:

```rust
pub struct Field {
    pub id: u32,
    pub rect_local: RectMm,      // axis-parallel in plate frame
}
pub fn decompose_fields(
    polygon: &Polygon, transform: &PlateTransform, max_variants: usize,
) -> Result<Vec<Field>, LoopError>;
```

- [ ] **Step 1: Write failing decomposition tests**

```rust
#[test]
fn convex_room_is_one_field() {
    let fields = decompose_fields(&rect_polygon(), &transform(), 500).unwrap();
    assert_eq!(fields.len(), 1);
}

#[test]
fn l_room_splits_into_two_squat_fields_deterministically() {
    let first = decompose_fields(&l_polygon(), &transform(), 500).unwrap();
    let second = decompose_fields(&l_polygon(), &transform(), 500).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.len(), 2);
    for field in &first {
        let w = field.rect_local.max.x - field.rect_local.min.x;
        let h = field.rect_local.max.y - field.rect_local.min.y;
        assert!(w / h <= 2.0 + 1e-9 && h / w <= 2.0 + 1e-9, "squat 1:2 violated");
    }
}

#[test]
fn u_and_c_rooms_split_into_three_fields() {
    assert_eq!(decompose_fields(&u_polygon(), &transform(), 500).unwrap().len(), 3);
    assert_eq!(decompose_fields(&c_polygon(), &transform(), 500).unwrap().len(), 3);
}
```

Use the same L/U/C vertex lists as `PLATE_SHAPES` in `single-loop/src/plate-main.ts`.

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_fields
```

Expected: missing `decompose_fields`.

- [ ] **Step 3: Implement guillotine decomposition**

Work in plate-local coordinates (polygon vertices transformed with
`to_local`). Algorithm: axis-parallel guillotine cuts anchored at concave
vertices. Enumerate cut sets deterministically (each concave vertex extends
one horizontal or one vertical cut to the nearest boundary); choose the
variant with (1) fewest fields, (2) all aspect ratios ≤ 1:2 where achievable,
(3) lexicographically smallest cut description. Count enumerated variants;
exceeding `max_variants` returns `SolverLimitExceeded`. Rooms whose local
outline is not rectilinear within 0.5 mm (diagonal walls) are one field per
convex part of a triangulated merge — out of scope for squatness, but must
still be deterministic; if the outline is not rectilinear, return the whole
polygon bounding shape as a single field only when the polygon is convex,
otherwise `NoSolutionGeometry` with message `NON_RECTILINEAR_CONCAVE_ROOM`
(documented limitation of this milestone).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_fields
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_fields.rs
git commit -m "feat(single-loop): decompose concave rooms into squat fields"
```

### Task 4: Lane model

**Files:**
- Modify: `single-loop/solver/src/circuit/fields.rs`
- Test: `single-loop/solver/tests/circuit_lanes.rs`

**Interfaces:**
- Consumes: `Field`, `EmbeddedPoseGraph`, `LoopGraphView`, `PlateTransform`, wall-safe inset from `geometry` (existing polygon offset used by `plate`).
- Produces:

```rust
pub struct Lane {
    pub id: u32,                  // 0 = outermost ring of the field
    pub field_id: u32,
    pub node_ids: Vec<u32>,       // ordered ring/segment of graph nodes
    pub edge_ids: Vec<u32>,       // ordered connecting graph edges
}
pub fn build_lanes(
    field: &Field, spacing_mm: f64, graph: &EmbeddedPoseGraph,
    view: &LoopGraphView, transform: &PlateTransform, wall_clearance_mm: f64,
) -> Result<Vec<Lane>, LoopError>;
```

- [ ] **Step 1: Write failing lane tests**

```rust
#[test]
fn rectangle_field_produces_expected_ring_count() {
    // 3000 × 2400 room, wall clearance 75, VA 150:
    // usable span 2850 × 2250 → min span 2250 → rings = floor(2250 / (2*150)) + 1 = 8
    let lanes = build_lanes(&field(), 150.0, &graph(), &view(), &transform(), 75.0).unwrap();
    assert_eq!(lanes.len(), 8);
    assert_eq!(lanes[0].id, 0);
    assert!(lanes[0].node_ids.len() > lanes[7].node_ids.len(), "outer ring is longer");
}

#[test]
fn lane_edges_form_a_connected_ordered_ring() {
    let lanes = build_lanes(&field(), 150.0, &graph(), &view(), &transform(), 75.0).unwrap();
    for lane in &lanes {
        for pair in lane.edge_ids.windows(2) {
            let a = edge_by_id(pair[0]); let b = edge_by_id(pair[1]);
            assert_eq!(a.end.id, b.start.id, "edges are chained");
        }
        assert!(lane.edge_ids.iter().all(|id| view_contains(id)));
    }
}

#[test]
fn lanes_are_deterministic() {
    let a = build_lanes(&field(), 150.0, &graph(), &view(), &transform(), 75.0).unwrap();
    let b = build_lanes(&field(), 150.0, &graph(), &view(), &transform(), 75.0).unwrap();
    assert_eq!(a, b);
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_lanes
```

Expected: missing `build_lanes`.

- [ ] **Step 3: Implement contour-parallel lanes**

Lane `k` is the rectangular ring at inset `wall_clearance + k * spacing` of
the field rectangle, snapped to the 75 mm channel grid (channel centerlines
lie at `37.5 + 75*n` in plate-local coordinates; snap each ring side to the
nearest channel at least the required inset from the field boundary — snapping
must never reduce wall clearance). Map each ring to graph nodes: walk the ring
per side, collect nodes whose local point lies on the channel within 0.5 mm,
ordered clockwise starting at the corner nearest the zone; connect consecutive
nodes with the unique straight edge from `view.usable_edges`, corners with the
`BroadTurn90` edge. A ring whose connecting edge is missing (clipped at the
boundary) is truncated to its longest connected arc — lanes are data, the
search decides whether a truncated lane is usable. Innermost ring: stop when
the ring degenerates (span < 2×80 mm turn diameter).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_lanes
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_lanes.rs
git commit -m "feat(single-loop): build contour-parallel lane model"
```

### Task 5: Search core with journal and reservation

**Files:**
- Create: `single-loop/solver/src/circuit/search.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_search.rs`

**Interfaces:**
- Consumes: `Lane`, `LoopGraphView`, `EmbeddedPoseGraph`.
- Produces:

```rust
pub enum Invariant { ReservedLane, TerminalCut, TurnBudget, Alternation, LengthBudget }
pub struct Decision { pub description: String, pub alternatives_left: usize }
pub struct Journal { entries: Vec<JournalEntry>, pub tail_limit: usize }
pub struct SearchState {
    pub occupied_lane_segments: BTreeSet<(u32, u32)>,   // (lane_id, segment index)
    pub reserved_lane_segments: BTreeSet<(u32, u32)>,
    pub used_length_mm: f64,
    pub journal: Journal,
    pub actions_used: usize,
}
pub trait PatternRules {
    fn expand(&self, state: &SearchState) -> Vec<Action>;   // deterministic order
    fn check(&self, state: &SearchState, action: &Action) -> Result<(), Invariant>;
}
pub fn backtracking_search(
    rules: &dyn PatternRules, initial: SearchState, max_actions: usize,
) -> Result<SearchState, SearchFailure>;
pub fn terminal_corridor_connected(
    reserved: &BTreeSet<(u32, u32)>, lanes: &[Lane], zone_lane_segment: (u32, u32),
) -> bool;
```

- [ ] **Step 1: Write failing search tests**

Use a hand-built toy rules impl (three lanes, one poisoned segment) — no real
graph needed:

```rust
#[test]
fn search_backtracks_over_a_poisoned_branch_and_finds_the_alternative() {
    let rules = ToyRules::with_poisoned_first_choice();
    let result = backtracking_search(&rules, ToyRules::initial(), 1000).unwrap();
    assert!(result.journal.entries().iter().any(|e| e.rejected_by.is_some()));
}

#[test]
fn search_exceeding_action_budget_is_a_typed_limit() {
    let rules = ToyRules::unsolvable();
    let failure = backtracking_search(&rules, ToyRules::initial(), 10).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::LimitExceeded);
    assert_eq!(failure.actions_used, 10);
}

#[test]
fn reserving_then_occupying_the_same_segment_is_a_dead_end() {
    let mut state = ToyRules::initial();
    state.reserved_lane_segments.insert((1, 0));
    let action = Action::occupy(1, 0);
    assert!(matches!(
        ToyRules::default().check(&state, &action),
        Err(Invariant::ReservedLane)
    ));
}

#[test]
fn terminal_corridor_cut_is_detected() {
    // reserved segments: (1,0)-(1,1)-(1,2); removing (1,1) cuts (1,2) from the zone at (1,0)
    let mut reserved = reserved_chain();
    reserved.remove(&(1, 1));
    assert!(!terminal_corridor_connected(&reserved, &lanes(), (1, 0)));
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_search
```

Expected: missing search module.

- [ ] **Step 3: Implement**

Chronological backtracking over an explicit stack of `(Decision, remaining
alternatives)`. Every rejection appends a `JournalEntry` with the violated
`Invariant` name and optional witness. `Journal` keeps all entries during the
search but exposes `tail(n)`. Adjacency for `terminal_corridor_connected`:
segments are adjacent when same lane and consecutive index, or same segment
index range touching across consecutive lanes (share ≥ 1 mm of arc-length
projection); BFS from the zone segment. Every counter (`actions_used`)
increments on expansion, not on check.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_search
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_search.rs
git commit -m "feat(single-loop): journaled backtracking search core"
```

### Task 6: Spiral inward arm rules

**Files:**
- Create: `single-loop/solver/src/circuit/spiral.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_spiral_arm.rs`

**Interfaces:**
- Consumes: `search::{PatternRules, SearchState, Invariant}`, `Lane`, `ConnectionZone`, profile constants.
- Produces:

```rust
pub struct SpiralRules { /* lanes, zone segment, spacing, turn templates */ }
impl PatternRules for SpiralRules { ... }
pub struct InwardArm { pub lane_sequence: Vec<u32>, pub edge_ids: Vec<u32> }
pub fn plan_inward_arm(
    lanes: &[Lane], zone_segment: (u32, u32), spacing_mm: f64,
    graph: &EmbeddedPoseGraph, max_actions: usize,
) -> Result<InwardArm, SearchFailure>;
pub fn turn_budget_ok(inner_free_span_mm: f64, profile: &PlateProfile) -> bool;
```

- [ ] **Step 1: Write failing arm tests**

```rust
#[test]
fn rectangle_inward_arm_occupies_every_second_lane_and_reserves_between() {
    // 8 lanes → inward arm on lanes 0,2,4,6; lanes 1,3,5,7 reserved
    let arm = plan_inward_arm(&lanes8(), zone_segment(), 150.0, &graph(), 100_000).unwrap();
    assert_eq!(arm.lane_sequence, vec![0, 2, 4, 6]);
}

#[test]
fn occupying_a_reserved_lane_is_rejected_with_journal_witness() {
    let failure = plan_inward_arm(&lanes_with_forced_conflict(), zone_segment(), 150.0, &graph(), 100_000)
        .unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    assert!(failure.journal_tail.iter().any(|e|
        e.rejected_by.as_deref() == Some("ReservedLane")));
}

#[test]
fn turn_budget_requires_160_mm_free_span() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert!(turn_budget_ok(160.0, &profile));
    assert!(!turn_budget_ok(159.0, &profile));
}

#[test]
fn descent_stops_before_violating_turn_budget() {
    // lanes sized so lane 6 leaves 150 mm inner span: arm must stop at lane 4
    let arm = plan_inward_arm(&lanes_tight_center(), zone_segment(), 150.0, &graph(), 100_000).unwrap();
    assert_eq!(*arm.lane_sequence.last().unwrap(), 4);
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_spiral_arm
```

Expected: missing spiral module.

- [ ] **Step 3: Implement**

`SpiralRules::expand`: continue current lane (next chained edge) first; then
descend to lane `k+2` via the deterministically smallest certified
lane-change edge. On occupying lane `k`, immediately insert every segment of
lane `k+1` into `reserved_lane_segments`. `check` enforces, in order:
ReservedLane (action touches a reserved segment), Alternation (action would
occupy a lane adjacent to an occupied lane outside a lane change), TurnBudget
(before descent below the last lane pair: inner free span
`= 2 * spacing − pipe allowance` must satisfy `turn_budget_ok`, i.e.
`span ≥ 2 × 80 mm`), TerminalCut (after the action,
`terminal_corridor_connected` still true), LengthBudget (running length +
action length ≤ 100,000 − zone allowance 2 × 500 mm).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_spiral_arm
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_spiral_arm.rs
git commit -m "feat(single-loop): spiral inward arm under hard invariants"
```

### Task 7: Turn insertion and return construction

**Files:**
- Modify: `single-loop/solver/src/circuit/spiral.rs`
- Test: `single-loop/solver/tests/circuit_spiral_return.rs`

**Interfaces:**
- Consumes: `InwardArm`, reserved segments, `EmbeddedPoseGraph`, turn templates (`TeardropReverse`, `BroadReverse180` families via `PlateProfile::templates()`).
- Produces:

```rust
pub struct SpiralPath {
    pub inward_edge_ids: Vec<u32>,
    pub turn_edge_ids: Vec<u32>,
    pub return_edge_ids: Vec<u32>,
}
pub fn complete_spiral(
    arm: &InwardArm, lanes: &[Lane], graph: &EmbeddedPoseGraph,
) -> Result<SpiralPath, SearchFailure>;
```

- [ ] **Step 1: Write failing completion tests**

```rust
#[test]
fn completed_spiral_returns_through_every_reserved_lane_to_the_zone() {
    let arm = plan_inward_arm(&lanes8(), zone_segment(), 150.0, &graph(), 100_000).unwrap();
    let path = complete_spiral(&arm, &lanes8(), &graph()).unwrap();
    assert!(!path.turn_edge_ids.is_empty());
    let return_lanes = lanes_of(&path.return_edge_ids);
    assert_eq!(return_lanes, vec![7, 5, 3, 1]);
    // continuity: last inward node == first turn node, last turn node == first return node
    assert_continuous(&path);
}

#[test]
fn missing_return_edge_is_a_dead_end_not_a_repair() {
    // graph fixture with one clipped edge on lane 3
    let arm = plan_inward_arm(&lanes8(), zone_segment(), 150.0, &clipped_graph(), 100_000).unwrap();
    let failure = complete_spiral(&arm, &lanes8(), &clipped_graph()).unwrap_err();
    assert_eq!(failure.kind, SearchFailureKind::Geometry);
    assert!(failure.journal_tail.iter().any(|e|
        e.decision.contains("return lane 3")));
}

#[test]
fn turn_uses_only_certified_reverse_templates_with_80_mm_arcs() {
    let path = complete_spiral(&arm8(), &lanes8(), &graph()).unwrap();
    for id in &path.turn_edge_ids {
        let edge = edge_by_id(*id);
        assert!(matches!(edge.template_id,
            TemplateId::TeardropReverse | TemplateId::BroadReverse180));
    }
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_spiral_return
```

Expected: missing `complete_spiral`.

- [ ] **Step 3: Implement**

Turn: at the inner end of the arm, select the deterministically smallest
certified reverse-template edge whose start pose equals the arm's final pose
and whose end pose lies on the innermost reserved lane. Return: walk reserved
lanes outward (`k+1` descending order of the arm), chaining the stored
`edge_ids` of each reserved lane in reverse direction, connected by the same
lane-change template family used inward; every required edge must exist in
`usable_edges` — a missing edge appends a journal entry naming the lane and
returns a Geometry failure (the caller backtracks the arm). No new geometry
is invented here; only existing certified edges are referenced.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_spiral_return
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_spiral_return.rs
git commit -m "feat(single-loop): construct turn and return arm from reservations"
```

### Task 8: Zone attachment (free-form port connectors)

**Files:**
- Modify: `single-loop/solver/src/circuit/zone.rs`
- Test: `single-loop/solver/tests/circuit_attach.rs`

**Interfaces:**
- Consumes: `ConnectionZone`, `LoopGraphView::entry_candidates`, `SpiralPath` end poses, `geometry` arc construction.
- Produces:

```rust
pub struct Attachment { pub primitives: Vec<PathPrimitive> }   // port → anchor pose
pub fn attach_port(
    port: Point, inward: Vec2, anchor: &PoseNode, transform: &PlateTransform,
) -> Result<Attachment, LoopError>;
```

- [ ] **Step 1: Write failing attachment tests**

```rust
#[test]
fn attachment_is_tangent_at_both_ends_with_min_radius() {
    let attachment = attach_port(port(), inward(), &anchor(), &transform()).unwrap();
    let first = attachment.primitives.first().unwrap();
    let last = attachment.primitives.last().unwrap();
    assert!((first.point_at(0.0) - port()).norm() < 1e-9);
    assert!((first.start_tangent() - inward()).norm() < 1e-7);
    assert!((last.point_at(1.0) - anchor().world_point).norm() < 1e-9);
    for primitive in &attachment.primitives {
        if let PathPrimitive::Arc { radius_mm, .. } = primitive {
            assert!(*radius_mm >= 80.0);
        }
    }
}

#[test]
fn unreachable_anchor_orientation_is_typed_invalid_connection() {
    // anchor 40 mm from the port facing away: no ≥80 mm biarc fits in the zone
    let error = attach_port(port(), inward(), &hostile_anchor(), &transform()).unwrap_err();
    assert_eq!(error.code, LoopErrorCode::InvalidConnection);
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_attach
```

Expected: missing `attach_port`.

- [ ] **Step 3: Implement**

Construct line–arc–line: straight from the port along `inward`, one tangent
arc (radius exactly 80 mm unless a larger radius fits), straight into the
anchor pose. Solve the tangent geometry analytically (two poses, fixed
radius); when no single-arc solution exists, fall back to the existing robust
biarc construction from the old solver's geometry (reuse
`geometry` biarc helper — both arcs ≥ 80 mm). All primitives must stay
inside the zone rectangle expanded to the polygon boundary; otherwise
`InvalidConnection` with witness point. Deterministic anchor iteration order
is the caller's concern (Task 9 orchestration tries `entry_candidates` in
ascending node id).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_attach
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_attach.rs
git commit -m "feat(single-loop): free-form port attachment into the graph"
```

### Task 9: Pre-prune, escalation ladder, ranking

**Files:**
- Create: `single-loop/solver/src/circuit/escalate.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_escalate.rs`

**Interfaces:**
- Consumes: `Field` areas, candidate metrics `{ coverage_upper_mm, penalty_sum_mm, spacing_span_mm, total_length_mm, key: String }`.
- Produces:

```rust
pub fn length_estimate_mm(field_area_mm2: f64, spacing_mm: f64) -> f64; // A/VA + 1000
pub fn escalation_ladder(requested: u32) -> Vec<u32>;   // e.g. 150 → [150, 225, 300]
pub enum SpacingOutcome { Solved(Candidate), LengthOnly, GeometryFailure(SearchFailure) }
pub fn rank(candidates: Vec<Candidate>) -> Candidate;
```

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn ladder_starts_at_request_and_only_ascends() {
    assert_eq!(escalation_ladder(150), vec![150, 225, 300]);
    assert_eq!(escalation_ladder(300), vec![300]);
}

#[test]
fn pre_prune_formula_matches_spec() {
    // 7.2 m² at VA 75: 7_200_000/75 + 1000 = 97_000 → passes
    assert!(length_estimate_mm(7_200_000.0, 75.0) <= 100_000.0);
    // 7.6 m² at VA 75: 102_333 → pruned
    assert!(length_estimate_mm(7_600_000.0, 75.0) > 100_000.0);
}

#[test]
fn ranking_orders_by_coverage_then_penalty_then_span_then_length_then_key() {
    let winner = rank(vec![
        candidate("a", 80.0, 0.0, 10.0, 90_000.0),
        candidate("b", 75.0, 5.0, 20.0, 95_000.0),   // better coverage wins despite penalty
    ]);
    assert_eq!(winner.key, "b");
    let winner = rank(vec![
        candidate("a", 75.0, 5.0, 10.0, 90_000.0),
        candidate("b", 75.0, 0.0, 20.0, 95_000.0),   // equal coverage → lower penalty wins
    ]);
    assert_eq!(winner.key, "b");
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_escalate
```

Expected: missing escalate module.

- [ ] **Step 3: Implement**

`length_estimate_mm = area/spacing + 1000.0` (zone + corridor allowance,
constant documented in code). Coverage comparison uses a 0.1 mm tie window
before falling to the next criterion (same convention as the old ranking).
`SpacingOutcome` distinguishes length-only failures (every search failure was
`LengthBudget` or pre-prune) from geometry failures (any other invariant) —
only length-only failures allow trying the next ladder value.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_escalate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_escalate.rs
git commit -m "feat(single-loop): spacing escalation and candidate ranking"
```

### Task 10: Independent loop validator

**Files:**
- Create: `single-loop/solver/src/circuit/validate.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Test: `single-loop/solver/tests/circuit_validate.rs`

**Interfaces:**
- Consumes: candidate path (ordered `PathPrimitive` + edge id provenance + zone), `EmbeddedPoseGraph`, `Polygon`, `validation::coverage::coverage_bounds`, `geometry` primitive distance helpers.
- Produces:

```rust
pub struct LoopCertificate {
    pub min_center_distance_mm: LocatedSpacing,   // must be > 16.0
    pub penalty_sum_mm: f64,
    pub worst_penalty: Option<LocatedSpacing>,
    pub coverage: CoverageBounds,
    pub total_length_mm: f64,
    pub min_bend_radius_mm: f64,
    pub pattern_provenance_ok: bool,
    pub zone_automaton_ok: bool,
    pub edge_provenance_ok: bool,
}
pub fn certify_loop(candidate: &LoopCandidate, context: &LoopContext)
    -> Result<LoopCertificate, LoopError>;
```

- [ ] **Step 1: Write failing validator tests**

```rust
#[test]
fn tampered_edge_geometry_fails_provenance() {
    let mut candidate = valid_candidate();
    shift_one_primitive(&mut candidate, 0.5);   // 0.5 mm off the certified edge
    assert_eq!(
        certify_loop(&candidate, &context()).unwrap_err().code,
        LoopErrorCode::InternalValidationFailure
    );
}

#[test]
fn zone_reentry_fails_the_automaton() {
    let candidate = candidate_that_dips_back_into_the_zone();
    assert!(certify_loop(&candidate, &context()).is_err());
}

#[test]
fn touching_paths_are_rejected_but_49_mm_is_penalized_not_rejected() {
    let touching = candidate_with_center_distance(15.9);
    assert!(certify_loop(&touching, &context()).is_err());
    let close = candidate_with_center_distance(49.0);
    let certificate = certify_loop(&close, &context()).unwrap();
    assert!((certificate.penalty_sum_mm - 1.0).abs() < 0.2);
    assert!(certificate.worst_penalty.is_some());
}

#[test]
fn spiral_provenance_requires_alternation_and_exactly_one_turn() {
    let two_turns = candidate_with_two_turns();
    assert!(certify_loop(&two_turns, &context()).is_err());
}
```

Note: the guarantee "no generator success the validator rejects" is enforced
structurally — `certify_loop` is the only producer of `LoopCertificate`, and
`solve_loop` (Task 11) can only return `ok` with a certificate. Task 11's
tests exercise the seam.

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_validate
```

Expected: missing validate module.

- [ ] **Step 3: Implement**

Edge provenance: for every path section outside the zone, the claimed edge id
must exist in `usable_edges` and the section's primitives must equal the
stored edge primitives within 1e-6 mm / 1e-7 rad. Zone automaton: classify
path arc-length intervals as zone/graph by rectangle containment; accept
exactly `zone → graph → zone` with one transition at each end. Spacing:
non-local pairs (path arc-length difference ≥ `80π mm`) measured with the
existing analytic primitive-distance helpers; global minimum must exceed
16 mm + 0.01 mm reserve; penalty `Σ max(0, 50 − d)` accumulated over measured
local minima (per primitive pair, counted once per pair). Pattern provenance:
recover arm labels from the candidate's lane metadata; verify lane alternation
and exactly one turn section. Bend radius from primitives directly. Coverage
via `coverage_bounds(polygon, canonical_path, 0.1, 2_000_000)`. Length from
primitives (`radius × |sweep|` for arcs).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_validate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit single-loop/solver/tests/circuit_validate.rs
git commit -m "feat(single-loop): independent loop certification"
```

### Task 11: Orchestration, WASM export, determinism

**Files:**
- Create: `single-loop/solver/src/circuit/api.rs`
- Modify: `single-loop/solver/src/circuit/mod.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/circuit_api.rs`

**Interfaces:**
- Consumes: everything above plus `plate::{PlateInstance, build_embedded_graph}`.
- Produces: `pub fn solve_loop(input: SolveLoopInput) -> SolveLoopResult` and WASM `solveLoop`.

- [ ] **Step 1: Write failing API tests**

```rust
#[test]
fn rectangle_spiral_solves_and_is_certified() {
    let result = solve_loop(rect_input(150));
    let plan = match result { SolveLoopResult::Success { plan } => plan, other => panic!("{other:?}") };
    assert_eq!(plan.actual_spacing_mm, 150);
    assert!(plan.total_length_mm <= 100_000.0);
    assert_eq!(plan.pattern, LoopPattern::Spiral);
    assert!(plan.constraint_certificate.edge_provenance_ok);
    // path starts and ends on the ports
    assert!((first_point(&plan.path) - plan.connection.start_port).norm() < 1e-6);
    assert!((last_point(&plan.path) - plan.connection.end_port).norm() < 1e-6);
}

#[test]
fn identical_input_is_byte_identical() {
    let a = serde_json::to_vec(&solve_loop(rect_input(150))).unwrap();
    let b = serde_json::to_vec(&solve_loop(rect_input(150))).unwrap();
    assert_eq!(a, b);
}

#[test]
fn geometry_failure_carries_journal_tail() {
    let result = solve_loop(no_turn_space_input());   // VA 75 in a room without turn space
    let error = match result { SolveLoopResult::Error { error } => error, _ => panic!() };
    assert_eq!(error.code, LoopErrorCode::NoSolutionGeometry);
    assert!(!error.journal_tail.is_empty());
}
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_api
```

Expected: missing api.

- [ ] **Step 3: Implement orchestration**

Pipeline per ladder value: validate input → normalize polygon (existing plate
input path) → build zone → build instance, filter zone nopps → build graph →
graph view → decompose fields → per field lanes → pre-prune → spiral search →
complete spiral → attachments (entry candidates ascending) → assemble
candidate → `certify_loop` → rank across candidates of this spacing → return
first spacing with a certified winner. Failures classified per Task 9. WASM:

```rust
#[wasm_bindgen(js_name = solveLoop)]
pub fn solve_loop_wasm(input: JsValue) -> Result<JsValue, JsValue>;
```

`request_hash`: SHA-256 hex of the canonical serialized input (reuse the old
solver's hashing helper if present; otherwise `sha2` is already in the tree —
verify before adding any dependency).

- [ ] **Step 4: Run tests, clippy, wasm build**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_api
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets -- -D warnings
cd single-loop && npm run wasm:build
```

Expected: PASS, no warnings, wasm builds.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/lib.rs single-loop/solver/src/circuit single-loop/solver/tests/circuit_api.rs
git commit -m "feat(single-loop): deterministic certified solveLoop"
```

### Task 12: Golden circuit fixtures

**Files:**
- Create: `single-loop/fixtures/circuit/rect-spiral-150.json`
- Create: `single-loop/fixtures/circuit/escalates-to-225.json`
- Create: `single-loop/fixtures/circuit/no-turn-space-75.json`
- Create: `single-loop/solver/tests/circuit_golden.rs`

**Interfaces:**
- Consumes: `solve_loop`.
- Produces: regression corpus `{ name, input, expected: { kind, actualSpacingMm? , errorCode? } }`.

- [ ] **Step 1: Write the golden test before the fixtures**

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenCircuit { name: String, input: SolveLoopInput, expected: Expected }

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Expected {
    Success { actual_spacing_mm: u32 },
    Error { code: LoopErrorCode },
}

#[test]
fn golden_circuit_fixtures_match_expectations() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/circuit");
    let mut names: Vec<_> = fs::read_dir(&dir).unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .filter(|n| n.ends_with(".json")).collect();
    names.sort();
    assert!(names.len() >= 3, "expected at least three golden fixtures");
    for name in names {
        let fixture: GoldenCircuit = serde_json::from_str(
            &fs::read_to_string(dir.join(&name)).unwrap()).unwrap();
        match (solve_loop(fixture.input), fixture.expected) {
            (SolveLoopResult::Success { plan }, Expected::Success { actual_spacing_mm }) => {
                assert_eq!(plan.actual_spacing_mm, actual_spacing_mm, "{name}");
            }
            (SolveLoopResult::Error { error }, Expected::Error { code }) => {
                assert_eq!(error.code, code, "{name}");
            }
            (other, _) => panic!("{name}: unexpected outcome {other:?}"),
        }
    }
}
```

- [ ] **Step 2: Confirm RED (missing fixtures)**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_golden
```

Expected: FAIL naming the missing directory or count.

- [ ] **Step 3: Author the three fixtures**

`rect-spiral-150`: the Task 11 rectangle, expects success at 150.
`escalates-to-225`: rectangle sized so `area/150 + 1000 > 100_000` but
`area/225 + 1000 ≤ 100_000` (e.g. 16.5 × 1.0 m strip is invalid — pick
14.85 m² ≈ 4500 × 3300 mm), expects success at 225 with `SPACING_INCREASED`.
`no-turn-space-75`: small room where VA 75 leaves < 160 mm inner span and
geometry (not length) fails, expects `NO_SOLUTION_GEOMETRY`. Verify each
fixture's expectation by running the solver once and inspecting the result
before freezing it.

- [ ] **Step 4: Run**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_golden
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/fixtures/circuit single-loop/solver/tests/circuit_golden.rs
git commit -m "test(single-loop): golden circuit fixtures"
```

### Task 13: TypeScript contracts and adapter

**Files:**
- Create: `single-loop/src/circuit/types.ts`
- Create: `single-loop/src/circuit/model.ts`
- Test: `single-loop/tests/unit/circuit-model.test.ts`

**Interfaces:**
- Consumes: WASM `solveLoop`, Rust serde shapes from Tasks 1/11.
- Produces: `initializeLoopSolver(): Promise<void>`, `solveLoop(input: SolveLoopInput): SolveLoopResult`, `parseSolveLoopResult(value: unknown): SolveLoopResult`.

- [ ] **Step 1: Write failing parser tests**

Mirror `plate-model.test.ts`: a success fixture (checks `pattern`,
`actualSpacingMm`, `path` array, `constraintCertificate` flags, journal tail
array) and a failure fixture (`NO_SOLUTION_GEOMETRY` with `journalTail`);
`parseSolveLoopResult` throws on a success payload whose
`constraintCertificate.edgeProvenanceOk !== true`.

```ts
it("rejects a plan that is not provenance-certified", () => {
  const tampered = structuredClone(success);
  tampered.plan.constraintCertificate.edgeProvenanceOk = false;
  expect(() => parseSolveLoopResult(tampered)).toThrow();
});
```

- [ ] **Step 2: Confirm RED**

```bash
cd single-loop && npm test -- --run tests/unit/circuit-model.test.ts
```

Expected: module resolution failure.

- [ ] **Step 3: Implement types + adapter**

`types.ts` mirrors the Rust serde output field-for-field (camelCase).
`model.ts` follows `plate/model.ts` exactly: single init promise, synchronous
WASM call, structural validation of the discriminated union.

- [ ] **Step 4: Run tests and typecheck**

```bash
cd single-loop && npm test -- --run tests/unit/circuit-model.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/src/circuit single-loop/tests/unit/circuit-model.test.ts
git commit -m "feat(single-loop): typed solveLoop adapter"
```

### Task 14: Loop scene renderer

**Files:**
- Create: `single-loop/src/render/loop-scene.ts`
- Test: `single-loop/tests/unit/loop-scene.test.ts`

**Interfaces:**
- Consumes: `LoopPlan`, existing `pathData` from `render/svg-path.ts`.
- Produces: `renderLoopScene(svg: SVGSVGElement, plan: LoopPlan, layers: LoopLayerVisibility): void`, `DEFAULT_LOOP_LAYERS`.

- [ ] **Step 1: Write failing renderer tests**

Layers in fixed order: `room`, `zone`, `fields`, `inward-arm`, `turn`,
`return-arm`, `attachments`, `penalties`, `coverage-worst`. Tests assert:
exact `d` attributes via `pathData`, inward vs return arms carry distinct CSS
classes (`arm-inward` / `arm-return`), penalty markers appear at
`spacingPenalty.worst`, disabled layers are omitted, and no element uses the
legacy `pipe` class.

- [ ] **Step 2: Confirm RED**

```bash
cd single-loop && npm test -- --run tests/unit/loop-scene.test.ts
```

Expected: module resolution failure.

- [ ] **Step 3: Implement**

Follow `plate-scene.ts` structure: string-built `<g data-layer="...">`
groups, numeric-only interpolation, `escapeAttribute` for enum strings, no
error text as markup. Arm segmentation comes from the plan's edge-id sections
(`fields[].inwardEdgeIds` etc. exposed in `FieldDiagnostics`).

- [ ] **Step 4: Run tests**

```bash
cd single-loop && npm test -- --run tests/unit/loop-scene.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/src/render/loop-scene.ts single-loop/tests/unit/loop-scene.test.ts
git commit -m "feat(single-loop): render certified loop plans"
```

### Task 15: Loop page, README, full verification

**Files:**
- Create: `single-loop/loop.html`
- Create: `single-loop/src/loop-main.ts`
- Modify: `single-loop/src/styles.css`
- Modify: `single-loop/vite.config.ts`
- Modify: `single-loop/README.md`
- Test: `single-loop/tests/unit/loop-page.test.ts`

**Interfaces:**
- Consumes: `solveLoop` adapter, `renderLoopScene`, `PLATE_SHAPES` (re-exported from `plate-main.ts`).
- Produces: third Vite entry `loop.html`; `setupLoopPage(deps)` exported from `loop-main.ts` following the `setupPlatePage` dependency-injection pattern.

- [ ] **Step 1: Write failing page tests**

Mirror `plate-page.test.ts`: shape/edge/spacing (select with 75/150/225/300)/
zone width/depth/pattern select (spiral enabled; meander and free rendered
`disabled`); build button invokes only `solveLoop` (raw-source assertion:
source contains neither `buildPlateModel` misuse for solving nor
`solveSingleLoop`); success renders layers and shows
`actualSpacingMm`, total length, coverage bound, penalty sum; failure shows
the error code and the journal tail as text (`<img` injection test identical
to the plate page).

- [ ] **Step 2: Confirm RED**

```bash
cd single-loop && npm test -- --run tests/unit/loop-page.test.ts
```

Expected: missing controller.

- [ ] **Step 3: Implement page + third entry**

`loop.html` German UI: header „Heizkreis planen (Schnecke)", pattern select,
spacing select, zone inputs, journal panel `<ol id="loop-journal">` filled via
`textContent` per entry. Add `loop` input to `vite.config.ts` rollup inputs.
Styles: `.arm-inward{stroke:#185f45}`, `.arm-return{stroke:#2f6fb0}`,
`.penalty-marker{fill:none;stroke:#c0442d}`, `.zone-rect{fill:#f2e8d9}`.
README: document `loop.html`, the three patterns (one implemented), and the
verification commands.

- [ ] **Step 4: Full verification**

```bash
cargo test --release --manifest-path single-loop/solver/Cargo.toml
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets -- -D warnings
cd single-loop
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0; `dist/index.html`, `dist/plate.html`,
`dist/loop.html` all exist. Open `loop.html` in the dev server and solve the
rectangle at VA 150: spiral renders with colored arms, one turn, zone, and
plausible counts.

- [ ] **Step 5: Commit**

```bash
git add single-loop/loop.html single-loop/src/loop-main.ts single-loop/src/styles.css single-loop/vite.config.ts single-loop/README.md single-loop/tests/unit/loop-page.test.ts
git commit -m "feat(single-loop): loop planning page for the spiral solver"
```

## Plan self-review

- Spec §§ 3–13 map to Tasks 1–12; § 14 UI to Tasks 13–15; § 15 tests are
  distributed into each task plus golden Task 12.
- Meander/free are typed `PATTERN_NOT_IMPLEMENTED` (spec § 1 scope honored,
  UI renders them disabled).
- Search never invents geometry: lanes, turn, return, and attachments
  reference certified edges or analytically constructed zone primitives that
  the validator re-checks (spec § 16).
- Determinism asserted at API level (byte-identical serialization).
- Names used across tasks are consistent: `solve_loop`/`solveLoop`,
  `certify_loop`, `plan_inward_arm`, `complete_spiral`, `attach_port`,
  `build_lanes`, `decompose_fields`, `LoopGraphView`, `entry_candidates`.
- Known deferred limitation encoded as typed error:
  `NON_RECTILINEAR_CONCAVE_ROOM` (Task 3) — concave rooms with diagonal
  walls need a later field strategy.
