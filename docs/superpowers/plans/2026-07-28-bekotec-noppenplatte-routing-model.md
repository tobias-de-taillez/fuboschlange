# BEKOTEC Noppenplatte Routing Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, independently validated BEKOTEC-EN 23 FI 30 plate model and finite local pipe-motion graph with a browser debug SVG, without generating a heating loop.

**Architecture:** A versioned `PlateProfile` defines the 75 mm checkerboard motif, effective nopp collision bodies, eight headings, anchor phase classes, and canonical local templates. A `PlateTransform` embeds the periodic profile in a room polygon; graph generation emits bounded candidate nodes and edges, and a separate validator certifies complete line/arc containment, nopp clearance, headings, tangency, radius, and template provenance before debug data is returned.

**Tech Stack:** Rust 2024, existing canonical `PathPrimitive`, serde/wasm-bindgen, analytic geometry, TypeScript 7, Vite 8, Vitest, SVG.

## Global Constraints

- Selected profile: `BEKOTEC_EN_23_FI_30_16`.
- Raster pitch: exactly 75 mm; type-preserving fundamental period: 150 mm.
- Pipe diameter: 16 mm; centerline bend radius: at least 80 mm.
- Straight headings: exactly multiples of 45 degrees.
- Large effective nopp radius: 17.5 mm; small effective nopp radius: 10.5 mm.
- Calibration allowance: 0.5 mm; forbidden centerline radii: 26.0 mm and 19.0 mm.
- Plate `u` axis is parallel to the selected connection edge; only phase in `[0,75)²` varies.
- All accepted paths use canonical tangential `Line | Arc` primitives.
- Generator output is untrusted until independently certified.
- This plan may not produce or report a heating-loop success.
- Degenerate inputs return typed errors and never panic.
- Output is deterministic.
- Production dependencies may not use GPL, AGPL, or non-commercial licenses.

---

## Preparation: Remove the abandoned free-form experiment

The uncommitted changes after `f520fd5` are an abandoned diagnostic branch of the old solver, not part of the approved design. Preserve one patch outside Git for forensic reference, then restore exactly those paths before Task 1:

```bash
git diff > /tmp/single-loop-abandoned-freeform.patch
git restore single-loop/solver/src/routing/transition.rs \
  single-loop/solver/src/search/candidate.rs \
  single-loop/solver/src/solver.rs \
  single-loop/solver/src/spiral/fermat.rs \
  single-loop/solver/src/spiral/mod.rs \
  single-loop/solver/src/spiral/seam.rs \
  single-loop/solver/tests/bifilar_spiral.rs \
  single-loop/solver/tests/solve_rectangle.rs
rm -f single-loop/solver/src/spiral/dubins.rs \
  single-loop/solver/tests/false_success_regression.rs
```

Expected: `git status --short` lists only this plan until it is committed.

### Task 1: Plate contracts and versioned profile

**Files:**
- Create: `single-loop/solver/src/plate/mod.rs`
- Create: `single-loop/solver/src/plate/types.rs`
- Create: `single-loop/solver/src/plate/profile.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/plate_profile.rs`

**Interfaces:**
- Produces: `PlateProfile::bekotec_en_23_fi_30_16()`, `NoppType`, `Heading8`, `PlateModelInput`, `PlateModelErrorCode`, and shared serialized output types.
- Consumes: existing `model::{Point, PathPrimitive}`.

- [ ] **Step 1: Write failing profile and JSON-contract tests**

Create tests asserting the fixed dimensions, eight headings, finite input contract, camelCase JSON, and rejection of unknown profile names:

```rust
#[test]
fn bekotec_16_profile_has_fixed_physical_dimensions() {
    let profile = PlateProfile::bekotec_en_23_fi_30_16();
    assert_eq!(profile.id, PlateProfileId::BekotecEn23Fi30_16);
    assert_eq!(profile.pitch_mm, 75.0);
    assert_eq!(profile.period_mm, 150.0);
    assert_eq!(profile.pipe_radius_mm, 8.0);
    assert_eq!(profile.min_bend_radius_mm, 80.0);
    assert_eq!(profile.large_effective_radius_mm, 17.5);
    assert_eq!(profile.small_effective_radius_mm, 10.5);
    assert_eq!(profile.calibration_allowance_mm, 0.5);
    assert_eq!(profile.forbidden_radius(NoppType::Large), 26.0);
    assert_eq!(profile.forbidden_radius(NoppType::Small), 19.0);
}

#[test]
fn heading8_contains_exactly_the_eight_45_degree_directions() {
    assert_eq!(Heading8::ALL.map(Heading8::degrees), [0,45,90,135,180,225,270,315]);
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_profile
```

Expected: compilation fails because `single_loop_solver::plate` does not exist.

- [ ] **Step 3: Implement minimal contracts and profile**

Use serde camelCase contracts. Keep `PlateModelInput.profile` as a closed enum and validate all numeric values with explicit constructors; no NaN may enter a profile or output. Export the module from `lib.rs`:

```rust
pub mod plate;
```

`Heading8` stores an integer octant, not a float, and exposes exact vectors using `FRAC_1_SQRT_2`.

- [ ] **Step 4: Run focused tests and Clippy**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_profile
cargo clippy --manifest-path single-loop/solver/Cargo.toml --lib -- -D warnings
```

Expected: PASS; no warnings.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/lib.rs single-loop/solver/src/plate single-loop/solver/tests/plate_profile.rs
git commit -m "feat(single-loop): define BEKOTEC plate profile"
```

### Task 2: Plate frame, phase, and checkerboard motif

**Files:**
- Create: `single-loop/solver/src/plate/transform.rs`
- Create: `single-loop/solver/src/plate/motif.rs`
- Modify: `single-loop/solver/src/plate/mod.rs`
- Test: `single-loop/solver/tests/plate_transform.rs`
- Test: `single-loop/solver/tests/plate_motif.rs`

**Interfaces:**
- Consumes: `PlateProfile`, `Point`, existing `Vec2`, normalized polygon edge.
- Produces: `PlateTransform::from_edge`, `to_world`, `to_local`, `NoppIndex`, `Nopp::at_index`, and bounded deterministic `motif_indices_for_bounds`.

- [ ] **Step 1: Write failing transform and motif tests**

Cover phase canonicalization, local/world roundtrip, connection-edge alignment, negative checkerboard indices, and 150 mm type preservation:

```rust
assert_eq!(nopp_type(-1, 0), NoppType::Small);
assert_eq!(nopp_type(-1, -1), NoppType::Large);
assert_eq!(nopp_type(2, 0), nopp_type(0, 0));
assert_eq!(transform.phase_u_mm(), 74.0); // input -1 mm
assert_relative_eq!(transform.to_local(transform.to_world(p)).x, p.x, epsilon=1e-9);
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_transform --test plate_motif
```

Expected: unresolved transform/motif imports.

- [ ] **Step 3: Implement transform and lazy motif enumeration**

Canonicalize with `rem_euclid(75.0)`. Derive `u` from the selected nonzero polygon edge and choose the polygon-interior perpendicular using polygon orientation. Enumerate integer index ranges from the inverse-transformed expanded world AABB; sort by `(j,i)` and impose an exact configured cell budget.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_transform --test plate_motif
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/plate single-loop/solver/tests/plate_transform.rs single-loop/solver/tests/plate_motif.rs
git commit -m "feat(single-loop): embed periodic noppen motif"
```

### Task 3: Independent analytic plate collision checks

**Files:**
- Create: `single-loop/solver/src/plate/collision.rs`
- Create: `single-loop/solver/src/plate/validator.rs`
- Modify: `single-loop/solver/src/plate/mod.rs`
- Test: `single-loop/solver/tests/plate_collision.rs`

**Interfaces:**
- Consumes: `PathPrimitive`, `Nopp`, `PlateProfile`, normalized `Polygon`.
- Produces: `primitive_circle_clearance`, `validate_primitive_in_wall_domain`, `PlateValidationFailure`, and `PlateValidationFailureCode`.

- [ ] **Step 1: Write failing analytic tests**

Include line/circle and arc/circle separation, tangency rejection, concave polygon escape, 80 mm radius acceptance, 79.999 mm rejection, cardinal and 45-degree heading acceptance, and 22.5-degree line rejection:

```rust
assert_eq!(validate_heading(line_45), Ok(Heading8::Deg45));
assert_eq!(validate_heading(line_22_5).unwrap_err().code,
           PlateValidationFailureCode::UnsupportedHeading);
assert!(primitive_circle_clearance(&arc, center, 26.0) > 0.0);
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_collision
```

Expected: unresolved collision APIs.

- [ ] **Step 3: Implement exact primitive/circle distance and domain checks**

For a line, project the circle center onto `[0,1]`. For an arc, compare radial projection when the center angle lies in the arc sweep and both endpoints otherwise. Reject contact within the profile numeric tolerance. Reuse analytic primitive/boundary intersections; do not accept a primitive from sampled points alone.

- [ ] **Step 4: Run collision and existing geometry suites**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_collision --test analytic_geometry --test polygon_offset
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/plate single-loop/solver/tests/plate_collision.rs
git commit -m "feat(single-loop): certify plate primitive clearance"
```

### Task 4: Canonical local motion templates

**Files:**
- Create: `single-loop/solver/src/plate/template.rs`
- Modify: `single-loop/solver/src/plate/profile.rs`
- Modify: `single-loop/solver/src/plate/validator.rs`
- Test: `single-loop/solver/tests/plate_templates.rs`

**Interfaces:**
- Consumes: canonical `PathPrimitive`, `Heading8`, `PlateProfile`, local motif collision checks.
- Produces: `MotionTemplate`, `TemplateId`, `TemplateTransform`, `PlateProfile::templates()`, and `certify_template`.

- [ ] **Step 1: Write failing catalogue and handbook-fixture tests**

Tests must require:

```rust
assert!(ids.contains(&TemplateId::Straight45));
assert!(ids.contains(&TemplateId::BroadTurn90));
assert!(ids.contains(&TemplateId::BroadReverse180));
assert!(ids.contains(&TemplateId::TeardropReverse));
assert_eq!(certify_template(&tight_turn_90()).unwrap_err().code,
           PlateValidationFailureCode::BendRadiusTooSmall);
assert_eq!(certify_template(&tight_u_turn()).unwrap_err().code,
           PlateValidationFailureCode::BendRadiusTooSmall);
```

Every accepted template must have exact endpoint poses, G1 joins, arc radius at least 80 mm, collision clearance, and deterministic symmetry copies.

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_templates
```

Expected: missing template catalogue.

- [ ] **Step 3: Implement straight and broad-turn templates**

Use exact tangent constructions. The canonical 90-degree fixture uses an 80 mm quarter arc centered in the safe checkerboard phase near `(37.5,37.5)` with exact straight stubs as required. Generate rotations and reflections from canonical local geometry, then canonicalize endpoints from transformed primitive endpoints rather than snapping.

For the teardrop, use one deterministic bounded-curvature `RLR`/`LRL` local construction between adjacent opposite-heading lane poses. This construction runs only while creating immutable profile templates; graph construction never invokes a free-form router. Reject any candidate not independently certified and select the lexicographically smallest shortest certified candidate.

- [ ] **Step 4: Run template tests twice for determinism**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_templates
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_templates
```

Expected: both runs PASS with identical serialized catalogue fixture.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/plate single-loop/solver/tests/plate_templates.rs
git commit -m "feat(single-loop): certify BEKOTEC motion templates"
```

### Task 5: Bounded embedded pose graph

**Files:**
- Create: `single-loop/solver/src/plate/instance.rs`
- Create: `single-loop/solver/src/plate/graph.rs`
- Modify: `single-loop/solver/src/plate/validator.rs`
- Modify: `single-loop/solver/src/plate/mod.rs`
- Test: `single-loop/solver/tests/plate_graph.rs`

**Interfaces:**
- Consumes: normalized room, `PlateTransform`, motif, profile anchors/templates, collision validator.
- Produces: `PlateInstance`, `PoseNode`, `PoseEdge`, `RejectedEdge`, `EmbeddedPoseGraph`, and `build_embedded_graph`.

- [ ] **Step 1: Write failing graph tests**

Require stable IDs, accepted cardinal and diagonal edges, bounded counts, rejected-edge witnesses, and no unchecked edge:

```rust
let first = build_embedded_graph(&fixture()).unwrap();
let second = build_embedded_graph(&fixture()).unwrap();
assert_eq!(first, second);
assert!(first.edges.iter().any(|e| e.end.heading == Heading8::Deg45));
assert!(first.edges.iter().all(|e| e.certificate.is_some()));
assert!(validate_embedded_graph(&first, &fixture()).is_ok());
```

Add rectangle, L, U, and C fixtures; these tests validate graph construction only, not graph connectivity or a heating loop.

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_graph
```

Expected: missing graph APIs.

- [ ] **Step 3: Implement lazy candidate emission and independent acceptance**

Enumerate cells, anchor phases, headings, and template transforms in stable integer order. Before expensive validation, reject candidates whose AABB misses the wall-safe domain. Record every later rejection with typed code, template ID, transformed cell, primitive index, and witness point. Stop on the first exact node/edge budget excess with `SOLVER_LIMIT_EXCEEDED`.

- [ ] **Step 4: Run graph and metamorphic tests**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_graph --test metamorphic
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/plate single-loop/solver/tests/plate_graph.rs
git commit -m "feat(single-loop): embed certified plate pose graph"
```

### Task 6: Public Rust and WASM plate-model API

**Files:**
- Create: `single-loop/solver/src/plate/api.rs`
- Modify: `single-loop/solver/src/plate/mod.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/plate_api.rs`

**Interfaces:**
- Consumes: `PlateModelInput`, normalization, transform, instance, graph, validator.
- Produces: `build_plate_model(PlateModelInput) -> PlateModelResult` and WASM export `buildPlateModel`.

- [ ] **Step 1: Write failing API contract tests**

Assert camelCase roundtrip, stable JSON bytes, typed errors for invalid profile/phase/polygon/wall clearance/no usable cell/budget, and that successful output has no `plan`, `path`, or heating-loop success field:

```rust
let json = serde_json::to_value(build_plate_model(input())).unwrap();
assert!(json.get("plan").is_none());
assert!(json.get("heatingLoop").is_none());
assert_eq!(json["profile"], "BEKOTEC_EN_23_FI_30_16");
```

- [ ] **Step 2: Confirm RED**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_api
```

Expected: missing API.

- [ ] **Step 3: Implement orchestration and WASM export**

Normalize the polygon using existing robust input geometry without invoking the old solver. Build and independently validate the plate graph, convert internal IDs and witnesses to serialized outputs, and export:

```rust
#[wasm_bindgen(js_name = buildPlateModel)]
pub fn build_plate_model_wasm(input: JsValue) -> Result<JsValue, JsValue>;
```

Malformed JavaScript input returns a rejected JS result only when deserialization itself fails; geometric failures serialize as typed `PlateModelResult::Error`.

- [ ] **Step 4: Run API and WASM build**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_api
cd single-loop && npm run wasm:build
```

Expected: PASS and generated TypeScript/WASM package.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/lib.rs single-loop/solver/src/plate single-loop/solver/tests/plate_api.rs
git commit -m "feat(single-loop): expose BEKOTEC plate model API"
```

### Task 7: TypeScript contracts and diagnostic SVG renderer

**Files:**
- Create: `single-loop/src/plate/types.ts`
- Create: `single-loop/src/plate/model.ts`
- Create: `single-loop/src/render/plate-scene.ts`
- Create: `single-loop/tests/unit/plate-model.test.ts`
- Create: `single-loop/tests/unit/plate-scene.test.ts`

**Interfaces:**
- Consumes: generated WASM `buildPlateModel`, serialized Rust contracts.
- Produces: `buildPlateModel(input)`, `renderPlateScene(svg, model, layers)`, and layer toggles.

- [ ] **Step 1: Write failing TS contract and renderer tests**

Use a fixture with one large and one small nopp, forbidden circles, one horizontal edge, one diagonal edge, and one rejected edge. Assert escaped deterministic SVG, exact arc commands, CSS layer names, and no pipe-plan class.

- [ ] **Step 2: Confirm RED**

```bash
cd single-loop && npm test -- --run tests/unit/plate-model.test.ts tests/unit/plate-scene.test.ts
```

Expected: module resolution failures.

- [ ] **Step 3: Implement typed adapter and renderer**

The adapter calls WASM synchronously for this bounded debug milestone and validates the discriminated result. The renderer builds these `<g>` layers in fixed order: `room`, `wall-domain`, `raster`, `cells`, `noppen`, `forbidden`, `anchors`, `accepted-edges`, `rejected-edges`, `witnesses`. Use existing `pathData` for exact primitives and DOM APIs or escaped numeric-only templates; never inject error text as markup.

- [ ] **Step 4: Run tests and typecheck**

```bash
cd single-loop
npm test -- --run tests/unit/plate-model.test.ts tests/unit/plate-scene.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add single-loop/src/plate single-loop/src/render/plate-scene.ts single-loop/tests/unit/plate-*.test.ts
git commit -m "feat(single-loop): render BEKOTEC plate diagnostics"
```

### Task 8: Dedicated browser debug page

**Files:**
- Create: `single-loop/plate.html`
- Create: `single-loop/src/plate-main.ts`
- Modify: `single-loop/src/styles.css`
- Modify: `single-loop/vite.config.ts`
- Test: `single-loop/tests/unit/plate-page.test.ts`

**Interfaces:**
- Consumes: plate API and renderer.
- Produces: a separate Vite entry at `plate.html`; the existing `index.html` solver remains untouched by this milestone.

- [ ] **Step 1: Write failing page-state test**

Test phase inputs, wall clearance, selected connection edge, layer toggles, error rendering, and that clicking “Noppenmodell aufbauen” invokes only `buildPlateModel`, never `solveSingleLoop`.

- [ ] **Step 2: Confirm RED**

```bash
cd single-loop && npm test -- --run tests/unit/plate-page.test.ts
```

Expected: missing page controller.

- [ ] **Step 3: Implement the page and multi-entry build**

Add numeric phase controls constrained to `[0,75)`, wall clearance, a profile readout, counts, validation status, and SVG checkboxes. Configure Rollup inputs for both `index.html` and `plate.html` via `fileURLToPath(new URL(..., import.meta.url))`. Display a prominent “Nur Noppenmodell – kein Heizkreis” label.

- [ ] **Step 4: Run UI gates**

```bash
cd single-loop
npm test
npm run typecheck
npm run build
```

Expected: PASS; `dist/index.html` and `dist/plate.html` both exist.

- [ ] **Step 5: Commit**

```bash
git add single-loop/plate.html single-loop/src/plate-main.ts single-loop/src/styles.css single-loop/vite.config.ts single-loop/tests/unit/plate-page.test.ts
git commit -m "feat(single-loop): add noppen model debug page"
```

### Task 9: Golden fixtures, full verification, and documentation

**Files:**
- Create: `single-loop/fixtures/plate/handbook-allowed-90.json`
- Create: `single-loop/fixtures/plate/handbook-allowed-teardrop.json`
- Create: `single-loop/fixtures/plate/handbook-rejected-tight-90.json`
- Create: `single-loop/fixtures/plate/handbook-rejected-tight-u.json`
- Create: `single-loop/solver/tests/plate_golden.rs`
- Modify: `single-loop/README.md`

**Interfaces:**
- Consumes: complete plate API.
- Produces: traceable manufacturer-derived regression fixtures and documented debug-page usage.

- [ ] **Step 1: Add golden tests before fixture implementation**

Each JSON fixture records source document/page, expected classification, canonical primitives, profile version, and expected rejection code where applicable. The Rust test loads all files in lexical order and certifies the expected result.

- [ ] **Step 2: Confirm fixture tests fail before all fixtures exist**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test plate_golden
```

Expected: FAIL naming the first missing or uncertified fixture.

- [ ] **Step 3: Add fixtures and concise README instructions**

Document:

```bash
cd single-loop
npm run dev
# open http://localhost:5173/plate.html
```

State explicitly that this page validates the routing substrate and does not generate a loop.

- [ ] **Step 4: Run complete fresh verification**

```bash
cargo test --release --manifest-path single-loop/solver/Cargo.toml
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets -- -D warnings
cd single-loop
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0. Inspect `plate.html` with rectangle, L, U, and C polygons and confirm horizontal, vertical, diagonal, accepted-turn, rejected-turn, forbidden-body, and witness layers are visible.

- [ ] **Step 5: Commit**

```bash
git add single-loop/fixtures/plate single-loop/solver/tests/plate_golden.rs single-loop/README.md
git commit -m "test(single-loop): certify BEKOTEC plate substrate"
```

## Plan self-review

- Spec sections 1–13 map to Tasks 1–9.
- The plan contains no phase optimization or heating-loop search.
- Profile constants and API names are consistent across Rust and TypeScript tasks.
- Manufacturer allowed/rejected references are golden fixtures, not runtime guesses.
- Analytic validation is independent of candidate emission.
- Diagonal routing is tested explicitly.
- The browser output is a dedicated diagnostic page and cannot be mistaken for a successful loop plan.
