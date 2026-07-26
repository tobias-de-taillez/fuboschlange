# Single-Loop FBH Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate static Rust/WASM application that generates and independently certifies exactly one continuous bifilar underfloor-heating loop inside an arbitrary simple polygon.

**Architecture:** A Rust core owns all geometry, medial-axis/wavefront generation, radius-constrained routing, candidate search, and independent validation. A thin TypeScript layer runs the synchronous WASM API in a Web Worker, renders the canonical `Line | Arc` path as exact SVG, and provides polygon editing and diagnostics without modifying solver geometry. Candidate construction and validation are separate modules; only a twice-validated candidate may become a public plan.

**Tech Stack:** Rust 1.95+/edition 2024, `cavalier_contours 0.7`, `boostvoronoi 0.12.1`, `robust 1.2`, `earcutr 0.5`, `serde`, `wasm-bindgen`; TypeScript 7, Vite 8, Vitest 4, Playwright 1.62, SVG.

**Design Spec:** `docs/superpowers/specs/2026-07-26-single-loop-fbh-solver-design.md`

## Global Constraints

- Work only under `single-loop/` plus the root `.gitignore`; do not modify `verlegeplan.html`.
- All coordinates and distances are millimetres measured from the pipe centreline.
- Input is one finite simple straight-edged polygon with no holes and one connection edge/offset.
- Generate exactly one continuous open bifilar double spiral; never substitute a serpentine, boustrophedon pattern, multiple loops, or disconnected rings.
- Pipe diameter is 16 mm; minimum wall clearance input is 8 mm.
- Requested nominal spacing is 50–250 mm inclusive.
- Every arc radius is at least 80 mm.
- Every nonlocal pipe pair is at least 50 mm apart; “nonlocal” means path-arclength separation at least `80π` mm.
- The complete path, including both leads and inner turn, stays inside the original polygon and is at most 100,000 mm long.
- Keep `actualSpacingMm === requestedSpacingMm` whenever a valid path at the requested spacing is at most 100,000 mm; increase spacing only to satisfy length.
- Values above 250 mm are allowed only with `SPACING_INCREASED` and `SPACING_EXCEEDS_250_MM`.
- Connection ports are ±25 mm along the selected edge; midpoint range is `[58, edgeLength - 58]`; edges below 116 mm return `NO_VALID_CONNECTION_ON_EDGE`.
- Shift only an invalid connection midpoint, to the nearest valid point on the same edge, with `CONNECTION_SHIFTED`; silently repair no other input.
- Leads start/end orthogonally, may curve in the wall-clearance zone, and may not re-enter that zone after leaving it.
- Public path geometry is canonical tangent `Line | Arc`; no Bézier, Catmull-Rom, cardinal spline, raster polyline, or post-hoc visual smoothing.
- Rank valid candidates by certified maximum floor-to-pipe distance over the entire original polygon, including wall zones.
- Coverage bounds must differ by at most 0.1 mm.
- Output and candidate ordering are deterministic for identical input and solver version.
- The shipped dependency graph may not include GPL, AGPL, or non-commercial-only code.
- Follow test-driven development: each behavior starts with a failing focused test, then the smallest implementation, then the focused and broader test suites.

## Planned File Map

```text
single-loop/
├── package.json                    npm scripts and pinned web dependencies
├── package-lock.json               reproducible web dependency lock
├── tsconfig.json                   strict TypeScript configuration
├── vite.config.ts                  static build and Vitest configuration
├── playwright.config.ts            browser test configuration
├── index.html                      application shell
├── README.md                       local development and verification commands
├── scripts/check-licenses.mjs      dependency-license gate
├── fixtures/*.json                 accepted and rejected geometry corpus
├── solver/
│   ├── Cargo.toml                  Rust/WASM crate and pinned dependencies
│   ├── src/lib.rs                  native and wasm public entry points
│   ├── src/model.rs                serialized request/result contract
│   ├── src/constants.rs            all hard limits and numerical budgets
│   ├── src/input.rs                input and connection normalization
│   ├── src/solver.rs               top-level orchestration and final revalidation
│   ├── src/geometry/               exact primitive and polygon operations
│   ├── src/medial_axis/            Voronoi adapter and medial graph
│   ├── src/wavefront/              point/skeleton wavefront families
│   ├── src/spiral/                 bifilar topology, rounding, and turn
│   ├── src/routing/                pose graph and joint lead routing
│   ├── src/search/                 deterministic candidates, ranking, spacing search
│   └── src/validation/             independent hard checks and diagnostics
│   └── tests/*.rs                  integration, property, and fixture tests
├── src/
│   ├── api/                        TypeScript contract and WASM facade
│   ├── worker/                     worker protocol and cancellable client
│   ├── render/                     exact SVG conversion and scene rendering
│   ├── ui/                         editor, state, controls, diagnostics, import/export
│   ├── main.ts                     application composition root
│   └── styles.css                  application styling
└── tests/
    ├── unit/*.test.ts              API, worker, renderer, and state tests
    └── e2e/app.spec.ts             Playwright browser acceptance
```

---

### Task 1: Create the isolated workspace and lock the public contract

**Files:**
- Modify: `.gitignore`
- Create: `single-loop/package.json`
- Create: `single-loop/package-lock.json`
- Create: `single-loop/tsconfig.json`
- Create: `single-loop/vite.config.ts`
- Create: `single-loop/solver/Cargo.toml`
- Create: `single-loop/solver/src/lib.rs`
- Create: `single-loop/solver/src/constants.rs`
- Create: `single-loop/solver/src/model.rs`
- Create: `single-loop/solver/tests/model_contract.rs`
- Create: `single-loop/src/api/types.ts`

**Interfaces:**
- Produces: serialized Rust `SolveSingleLoopInput`, `SolveResult`, `SingleLoopPlan`, `PathPrimitive`, `SolverWarning`, `SolverError`, and matching exported TypeScript types.
- Produces constants: `MIN_RADIUS_MM`, `MIN_NONLOCAL_SPACING_MM`, `MIN_WALL_CLEARANCE_MM`, `MAX_LENGTH_MM`, `LOCAL_ARC_LENGTH_MM`, quantization and resource budgets.

- [ ] **Step 1: Add manifests and generated-artifact ignores**

Use exact dependency versions and scripts:

```json
{
  "name": "single-loop-fbh",
  "private": true,
  "type": "module",
  "scripts": {
    "wasm:build": "wasm-pack build solver --target web --out-dir ../src/wasm/pkg",
    "dev": "npm run wasm:build && vite",
    "build": "npm run wasm:build && tsc --noEmit && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "check": "npm run test && npm run build"
  },
  "devDependencies": {
    "@playwright/test": "1.62.0",
    "@types/node": "26.1.1",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "lib": ["ES2022", "DOM", "WebWorker"],
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  test: { environment: "jsdom", include: ["tests/unit/**/*.test.ts"] },
});
```

```toml
[package]
name = "single-loop-solver"
version = "0.1.0"
edition = "2024"
rust-version = "1.88"
license = "MIT OR Apache-2.0"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
boostvoronoi = { version = "0.12.1", features = ["serde"] }
cavalier_contours = { version = "0.7.0", features = ["serde"] }
earcutr = "0.5.0"
js-sys = "0.3.103"
robust = "1.2.0"
serde = { version = "1.0.229", features = ["derive"] }
serde-wasm-bindgen = "0.6.5"
serde_json = "1.0.151"
sha2 = "0.11.0"
thiserror = "2.0.19"
wasm-bindgen = "0.2.126"

[dev-dependencies]
approx = "0.5.1"
proptest = "1.11.0"
wasm-bindgen-test = "0.3.76"
```

Start `solver/src/lib.rs` with the two contract modules; later tasks add modules only after their tests exist:

```rust
pub mod constants;
pub mod model;
```

Append to `.gitignore`:

```gitignore
single-loop/dist/
single-loop/src/wasm/pkg/
single-loop/solver/target/
single-loop/playwright-report/
single-loop/test-results/
```

Run: `cd single-loop && npm install`  
Expected: `package-lock.json` is created with no install error.

- [ ] **Step 2: Write the failing Rust JSON-contract test**

```rust
use single_loop_solver::model::{PathPrimitive, Point, SolveResult};

#[test]
fn serializes_path_with_camel_case_discriminated_primitives() {
    let primitive = PathPrimitive::Arc {
        start: Point::new(80.0, 0.0),
        end: Point::new(0.0, 80.0),
        center: Point::new(0.0, 0.0),
        radius_mm: 80.0,
        sweep_rad: std::f64::consts::FRAC_PI_2,
    };
    let json = serde_json::to_value(primitive).unwrap();
    assert_eq!(json["kind"], "arc");
    assert_eq!(json["radiusMm"], 80.0);
    assert_eq!(json["sweepRad"], std::f64::consts::FRAC_PI_2);
    let _: Option<SolveResult> = None;
}
```

- [ ] **Step 3: Run the contract test and confirm it fails**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test model_contract`  
Expected: FAIL because `model` and its types do not exist.

- [ ] **Step 4: Add constants and the complete serialized Rust model**

Use serde camel-case fields and tagged primitives:

```rust
pub const PIPE_DIAMETER_MM: f64 = 16.0;
pub const MIN_RADIUS_MM: f64 = 80.0;
pub const MIN_NONLOCAL_SPACING_MM: f64 = 50.0;
pub const MIN_WALL_CLEARANCE_MM: f64 = 8.0;
pub const MAX_LENGTH_MM: f64 = 100_000.0;
pub const LOCAL_ARC_LENGTH_MM: f64 = std::f64::consts::PI * MIN_RADIUS_MM;
pub const TOPOLOGY_QUANTIZATION_MM: f64 = 0.001;
pub const GENERATION_MARGIN_MM: f64 = 0.01;
pub const COVERAGE_ERROR_MM: f64 = 0.1;
pub const MAX_CANDIDATE_VALIDATIONS: usize = 20_000;
pub const MAX_COVERAGE_CELLS: usize = 2_000_000;
pub const MAX_POSE_EXPANSIONS: usize = 5_000_000;
```

```rust
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Point { pub x: f64, pub y: f64 }

impl Point { pub const fn new(x: f64, y: f64) -> Self { Self { x, y } } }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum PathPrimitive {
    Line { start: Point, end: Point },
    Arc { start: Point, end: Point, center: Point, radius_mm: f64, sweep_rad: f64 },
}
```

Define the remaining wire structures with no optional members: `SolveSingleLoopInput { polygon, connection, requested_spacing_mm, wall_clearance_mm }`; `NormalizedConnectionOutput { edge_index, requested_center_offset_mm, actual_center_offset_mm, shifted_by_mm, center, first_port, second_port, start_port, end_port }`; `LocatedSpacing`; `CoverageOutput`; `ConstraintCertificate`; `SingleLoopPlan`; `SolverWarning`; and `SolverError`. Their fields and nesting are exactly the TypeScript structures in sections 6 and 19 of the design spec. Represent warning/error codes as `SCREAMING_SNAKE_CASE` serde enums and `details` as `serde_json::Map<String, Value>` so numeric and boolean diagnostics round-trip without string coercion.

Implement custom serde for the internal enum so its wire form has a boolean discriminator rather than a string tag:

```rust
pub enum SolveResult { Success { plan: SingleLoopPlan }, Error { error: SolverError } }
// Success serializes boolean `ok: true` followed by `plan`.
// Error serializes boolean `ok: false` followed by `error`.
// Deserialize through an untagged private WireSuccess/WireError pair and reject
// a false success flag or true error flag.
```

- [ ] **Step 5: Add matching TypeScript types**

```ts
export interface Point { x: number; y: number }
export type PathPrimitive =
  | { kind: "line"; start: Point; end: Point }
  | { kind: "arc"; start: Point; end: Point; center: Point; radiusMm: number; sweepRad: number };

export interface SolveSingleLoopInput {
  polygon: Point[];
  connection: { edgeIndex: number; centerOffsetMm: number };
  requestedSpacingMm: number;
  wallClearanceMm: number;
}

export type SolveResult =
  | { ok: true; plan: SingleLoopPlan }
  | { ok: false; error: SolverError };
```

Copy the remaining plan/certificate/warning/error members exactly from the approved spec; do not make fields optional.

- [ ] **Step 6: Run model tests and compile both contracts**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test model_contract`  
Expected: PASS.

Run: `cd single-loop && npx tsc --noEmit`  
Expected: PASS.

- [ ] **Step 7: Commit the isolated contract**

```bash
git add .gitignore single-loop
git commit -m "feat(single-loop): establish solver contracts"
```

---

### Task 2: Implement canonical line and arc geometry

**Files:**
- Create: `single-loop/solver/src/geometry/mod.rs`
- Create: `single-loop/solver/src/geometry/vector.rs`
- Create: `single-loop/solver/src/geometry/primitive.rs`
- Create: `single-loop/solver/src/geometry/path.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/geometry_primitives.rs`

**Interfaces:**
- Consumes: `model::{Point, PathPrimitive}` and numerical constants.
- Produces: `Vec2`, `Aabb`, primitive `length`, `point_at`, endpoint tangents, bounds, `CanonicalPath`, cumulative path offsets, and `canonicalize_path`.

- [ ] **Step 1: Write failing primitive tests**

```rust
#[test]
fn quarter_arc_has_analytic_length_and_tangents() {
    let arc = arc((80.0, 0.0), (0.0, 80.0), (0.0, 0.0), 80.0, FRAC_PI_2);
    assert_abs_diff_eq!(arc.length(), 80.0 * FRAC_PI_2, epsilon = 1e-10);
    assert_vec_close(arc.start_tangent(), (0.0, 1.0));
    assert_vec_close(arc.end_tangent(), (-1.0, 0.0));
}

#[test]
fn canonicalization_merges_lines_and_rejects_zero_primitives() {
    let merged = canonicalize_path(&[
        line((0.0, 0.0), (10.0, 0.0)),
        line((10.0, 0.0), (20.0, 0.0)),
    ]).unwrap();
    assert_eq!(merged.primitives().len(), 1);
    assert!(canonicalize_path(&[line((0.0, 0.0), (0.0, 0.0))]).is_err());
}
```

- [ ] **Step 2: Run and observe the missing geometry API**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test geometry_primitives`  
Expected: FAIL with unresolved `geometry` imports.

- [ ] **Step 3: Implement vectors, arc parameterization, and bounds**

Use a single normalized parameter `t ∈ [0,1]`:

```rust
impl PathPrimitive {
    pub fn length(&self) -> f64 {
        match self {
            Self::Line { start, end } => (*end - *start).norm(),
            Self::Arc { radius_mm, sweep_rad, .. } => radius_mm * sweep_rad.abs(),
        }
    }

    pub fn point_at(&self, t: f64) -> Point {
        match self {
            Self::Line { start, end } => start.lerp(*end, t),
            Self::Arc { start, center, radius_mm, sweep_rad, .. } => {
                let a0 = (start.y - center.y).atan2(start.x - center.x);
                *center + Vec2::from_angle(a0 + sweep_rad * t) * *radius_mm
            }
        }
    }
}
```

`Aabb` for an arc must include start/end plus every axis-extremum angle lying on the signed sweep. Reject nonfinite values, `|sweep| == 0`, `|sweep| >= 2π`, nonpositive radius, and endpoint-radius residual above 0.000001 mm.

- [ ] **Step 4: Implement canonical path continuity and merging**

```rust
pub struct CanonicalPath {
    primitives: Vec<PathPrimitive>,
    prefix_lengths: Vec<f64>,
    total_length: f64,
}

pub fn canonicalize_path(input: &[PathPrimitive]) -> Result<CanonicalPath, PathError> {
    let checked = input.iter().cloned().map(validate_primitive).collect::<Result<Vec<_>, _>>()?;
    let connected = merge_compatible_neighbors(checked)?;
    verify_position_continuity(&connected, 1e-6)?;
    verify_g1_continuity(&connected, 1e-7)?;
    Ok(CanonicalPath::from_connected(connected))
}
```

Merge arcs only when centre, radius, sign, shared tangent, and combined sweep remain valid. Preserve exact shared endpoints by assigning the previous end object to the next start.

- [ ] **Step 5: Run focused and crate tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test geometry_primitives`  
Expected: PASS.

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml`  
Expected: PASS.

- [ ] **Step 6: Commit canonical primitives**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): add canonical line arc geometry"
```

---

### Task 3: Add analytic intersections and constrained primitive distances

**Files:**
- Create: `single-loop/solver/src/geometry/intersection.rs`
- Create: `single-loop/solver/src/geometry/distance.rs`
- Create: `single-loop/solver/src/geometry/predicates.rs`
- Modify: `single-loop/solver/src/geometry/mod.rs`
- Test: `single-loop/solver/tests/analytic_geometry.rs`

**Interfaces:**
- Produces: `Intersection::{None, Points, Overlap}`, `ParameterRange`, `ClosestPair`, `primitive_intersections`, and `primitive_distance` restricted to parameter intervals.
- Used later by polygon validation, hard validation, routing, and spacing diagnostics.

- [ ] **Step 1: Write failing line/arc intersection and distance tests**

Include proper crossings, tangencies, overlaps, disjoint pairs, concentric arcs, and interval restrictions:

```rust
#[test]
fn line_arc_tangent_returns_one_point() {
    let hit = primitive_intersections(
        &line((-100.0, 80.0), (100.0, 80.0)),
        &arc((80.0, 0.0), (-80.0, 0.0), (0.0, 0.0), 80.0, PI),
    );
    assert_points_close(hit.points(), &[(0.0, 80.0)]);
}

#[test]
fn constrained_distance_ignores_excluded_local_endpoint() {
    let result = primitive_distance(
        &line((0.0, 0.0), (100.0, 0.0)), ParameterRange::new(0.5, 1.0),
        &line((0.0, 10.0), (100.0, 10.0)), ParameterRange::new(0.0, 0.25),
    );
    assert_abs_diff_eq!(result.distance_mm, hypot(25.0, 10.0), epsilon = 1e-9);
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test analytic_geometry`  
Expected: FAIL with missing intersection and distance modules.

- [ ] **Step 3: Implement robust intersection classification**

- Use `robust::orient2d` for line-line orientation decisions.
- Solve line-circle intersections from the quadratic in segment parameter and filter by the arc’s signed angular interval.
- Solve circle-circle intersections from centre distance and filter both arc intervals.
- Return `Overlap` for collinear line intervals with positive shared length and for same-circle arc intervals with positive shared sweep.
- Deduplicate tangent points within the 0.000001-mm structural tolerance while retaining their primitive parameters.

Core result shape:

```rust
pub struct IntersectionPoint { pub point: Point, pub a_t: f64, pub b_t: f64 }
pub enum Intersection { None, Points(Vec<IntersectionPoint>), Overlap }
```

- [ ] **Step 4: Implement global-minimum primitive distances**

Evaluate all analytic candidates, not a sampling approximation:

```rust
pub fn primitive_distance(
    a: &PathPrimitive,
    a_range: ParameterRange,
    b: &PathPrimitive,
    b_range: ParameterRange,
) -> ClosestPair {
    let mut candidates = endpoint_projection_candidates(a, a_range, b, b_range);
    candidates.extend(interior_stationary_candidates(a, a_range, b, b_range));
    choose_lexicographically_stable_minimum(candidates)
}
```

For arc-arc pairs include centre-line radial extrema and both interval endpoints. If primitives intersect in the allowed ranges, return zero at the lexicographically smallest intersection.

- [ ] **Step 5: Run analytic and property checks**

Add a proptest comparing every analytic distance to a dense 2,001×2,001 parameter sample as a one-sided check: analytic distance must be no greater than sampled distance plus 0.000001 mm.

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test analytic_geometry`  
Expected: PASS.

- [ ] **Step 6: Commit analytic geometry**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): add analytic intersections and distances"
```

---

### Task 4: Validate polygons, normalize connections, and compute the allowed region

**Files:**
- Create: `single-loop/solver/src/geometry/polygon.rs`
- Create: `single-loop/solver/src/geometry/offset.rs`
- Create: `single-loop/solver/src/input.rs`
- Modify: `single-loop/solver/src/geometry/mod.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/input_normalization.rs`
- Test: `single-loop/solver/tests/polygon_offset.rs`

**Interfaces:**
- Produces: `Polygon`, `Winding`, `NormalizedInput`, `NormalizedConnection`, `AllowedRegion`, `validate_and_normalize`, `erode_for_centerline`, point classification and exact boundary distance.
- Guarantees that connection indices remain tied to original input order.

- [ ] **Step 1: Write failing input and connection boundary tests**

```rust
#[test]
fn edge_below_116_mm_has_no_connection() {
    let input = rectangle_request(115.999, 1000.0, 0, 58.0);
    assert_error(validate_and_normalize(input), "NO_VALID_CONNECTION_ON_EDGE");
}

#[test]
fn edge_at_116_mm_clamps_to_its_single_valid_midpoint() {
    let input = rectangle_request(116.0, 1000.0, 0, 4.0);
    let n = validate_and_normalize(input).unwrap();
    assert_eq!(n.connection.actual_center_offset_mm, 58.0);
    assert_eq!(n.connection.shifted_by_mm, 54.0);
    assert_abs_diff_eq!(n.connection.first_port.distance(n.connection.second_port), 50.0, epsilon = 1e-9);
}

#[test]
fn clockwise_polygon_preserves_original_connection_edge() {
    let ccw = validate_and_normalize(request_ccw_on_edge_2()).unwrap();
    let cw = validate_and_normalize(equivalent_request_cw_on_mapped_edge()).unwrap();
    assert_points_close(&ccw.connection.center, &cw.connection.center);
}
```

Also assert each invalid scalar/error code and reject repeated closing points, self-crossing bow ties, overlaps, nonadjacent touches, zero area, and zero edges.

- [ ] **Step 2: Verify input tests fail**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test input_normalization`  
Expected: FAIL with missing `input` and polygon APIs.

- [ ] **Step 3: Implement robust simple-polygon validation and mapping**

```rust
pub struct Polygon {
    original: Vec<Point>,
    internal_ccw: Vec<Point>,
    original_edge_for_internal: Vec<usize>,
}

pub fn validate_and_normalize(raw: SolveSingleLoopInput) -> Result<NormalizedInput, SolverError> {
    validate_scalars(&raw)?;
    let polygon = Polygon::try_from_original(raw.polygon)?;
    let connection = normalize_connection(&polygon, raw.connection)?;
    Ok(NormalizedInput { raw, polygon, connection })
}
```

Use robust orientation and analytic segment intersections. Adjacent edges may share only their common vertex. Keep collinear consecutive vertices but create a separate simplified internal contour with a reversible edge map.

- [ ] **Step 4: Implement exact connection normalization**

Compute edge unit tangent from the original edge. Clamp the midpoint offset to `[58, length-58]`; derive ports at `actualOffset ± 25`; derive the inward normal from polygon winding. Store both parametric edge offsets so the validator can certify exact 50-mm port separation.

Warning generation must be pure:

```rust
pub fn connection_warning(c: &NormalizedConnection) -> Option<SolverWarning> {
    (c.shifted_by_mm != 0.0).then(|| warning("CONNECTION_SHIFTED", [
        ("requestedCenterOffsetMm", c.requested_center_offset_mm),
        ("actualCenterOffsetMm", c.actual_center_offset_mm),
    ]))
}
```

- [ ] **Step 5: Write failing allowed-region tests**

Test a rectangle erosion, a concave corner arc, total disappearance, and a narrow-neck polygon that erodes into two components. Assert the concave offset arc remains an `Arc` and that disconnected output maps to `NO_SOLUTION_GEOMETRY`.

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test polygon_offset`  
Expected: FAIL before the offset adapter exists.

- [ ] **Step 6: Implement the `cavalier_contours` offset adapter**

```rust
pub struct AllowedRegion {
    pub boundary: Vec<PathPrimitive>,
    pub quantized_segments: Vec<(QuantizedPoint, QuantizedPoint)>,
    pub wall_clearance_mm: f64,
}

pub fn erode_for_centerline(input: &NormalizedInput) -> Result<AllowedRegion, SolverError> {
    let loops = offset_inward_with_cavalier(&input.polygon, input.raw.wall_clearance_mm)?;
    match loops.as_slice() {
        [single] if has_positive_area(single) => AllowedRegion::from_exact_loop(single),
        _ => Err(no_solution_geometry("WALL_INSET_DISCONNECTED_OR_EMPTY")),
    }
}
```

Convert line/arc bulge output to exact `PathPrimitive`; tessellate arcs only for Voronoi helper segments with a 0.05-mm Hausdorff bound. Validate the exact offset loop before returning it.

- [ ] **Step 7: Run focused and crate tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test input_normalization --test polygon_offset`  
Expected: PASS.

- [ ] **Step 8: Commit input and allowed region**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): validate polygon and connection input"
```

---

### Task 5: Build the independent hard-constraint validator

**Files:**
- Create: `single-loop/solver/src/validation/mod.rs`
- Create: `single-loop/solver/src/validation/provenance.rs`
- Create: `single-loop/solver/src/validation/containment.rs`
- Create: `single-loop/solver/src/validation/intersections.rs`
- Create: `single-loop/solver/src/validation/clearance.rs`
- Create: `single-loop/solver/src/validation/topology.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/hard_validator.rs`
- Test: `single-loop/solver/tests/nonlocal_spacing.rs`

**Interfaces:**
- Produces: `CandidatePath`, `PathProvenance`, `PrimitiveRole`, `HardValidationReport`, `ValidationFailure`, and `validate_hard_constraints`.
- Does not consume medial-axis, wavefront, spiral, routing, or search internals beyond explicit public candidate geometry/provenance.

- [ ] **Step 1: Write failing validator tests using handcrafted canonical paths**

Cover: radius 79.999 rejected, radius 80 accepted, line/arc outside polygon rejected, nonadjacent tangency rejected, crossing rejected, G1 break rejected, valid wall-zone prefix accepted, leave/re-enter rejected, and malformed topology rejected.

```rust
#[test]
fn connection_zone_may_be_left_only_once_from_each_port() {
    let valid = candidate_with_zone_sequence([true, true, false, false]);
    assert!(validate_hard_constraints(&valid, &context()).is_ok());
    let invalid = candidate_with_zone_sequence([true, false, true, false]);
    assert_failure(validate_hard_constraints(&invalid, &context()), "CONNECTION_ZONE_REENTRY");
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test hard_validator`  
Expected: FAIL with unresolved validation APIs.

- [ ] **Step 3: Define provenance and validator boundaries**

```rust
pub enum PrimitiveRole {
    StartLead,
    Inbound { winding: usize },
    InnerTurn,
    Outbound { winding: usize },
    EndLead,
}

pub struct ParentPair {
    pub first_primitive: usize,
    pub first_range: ParameterRange,
    pub second_primitive: usize,
    pub second_range: ParameterRange,
    pub first_winding: usize,
    pub second_winding: usize,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CandidateKey(pub Vec<u32>);

pub struct PathProvenance {
    pub roles: Vec<PrimitiveRole>,
    pub parent_pairs: Vec<ParentPair>,
    pub start_port_edge_offset_mm: f64,
    pub end_port_edge_offset_mm: f64,
}

pub struct CandidatePath {
    pub path: CanonicalPath,
    pub provenance: PathProvenance,
    pub connection: NormalizedConnection,
    pub actual_spacing_mm: f64,
    pub key: CandidateKey,
}
```

Require one role per canonical primitive; when canonicalization merges primitives, merge only equal roles and remap parent-pair ranges.

- [ ] **Step 4: Implement independent containment, crossing, radius, and zone checks**

- Split each line/arc at every analytic intersection with every original polygon edge; midpoint-classify each open interval.
- Permit original-boundary contact only at the two parametric ports.
- Check exact primitive-to-wall distance outside `StartLead`/`EndLead` exception intervals.
- Check all primitive pairs through AABB broad phase, allowing only the shared endpoint of consecutive primitives.
- Check every arc’s radius lower bound and every join’s G1 residual.
- Traverse start roles forward and end roles backward with `ZonePhase::{NearWall, Inside}`; reject `Inside → NearWall`.

Return stable failure codes and witness points; do not reuse generator booleans.

- [ ] **Step 5: Write failing nonlocal-distance subdivision tests**

```rust
#[test]
fn nonlocal_result_is_invariant_under_line_subdivision() {
    let whole = parallel_return_path(false);
    let split = parallel_return_path(true);
    let a = minimum_nonlocal_distance(&whole, LOCAL_ARC_LENGTH_MM).unwrap();
    let b = minimum_nonlocal_distance(&split, LOCAL_ARC_LENGTH_MM).unwrap();
    assert_abs_diff_eq!(a.distance_mm, b.distance_mm, epsilon = 1e-9);
}

#[test]
fn mandated_ports_certify_exactly_fifty_mm() {
    let report = validate_hard_constraints(&valid_port_pair_candidate(), &context()).unwrap();
    assert_eq!(report.min_nonlocal_spacing.lower_bound_mm, 50.0);
}
```

- [ ] **Step 6: Implement path-arclength-constrained minimum spacing**

For primitive pair `(i,j)`, convert the global condition
`|s_i(t)-s_j(u)| ≥ 80π` into at most two rectangular/triangular parameter domains. Minimize distance over each domain with Task 3’s constrained solver. Skip only domains that are wholly local; never skip based on primitive index.

Treat the start/end port pair as an exact parametric identity if their original-edge offsets differ by exactly 50 mm and endpoint residuals are within structural tolerance. All other pairs use conservative f64 error subtraction.

- [ ] **Step 7: Implement bifilar provenance validation**

Require role order:

```text
StartLead → Inbound winding numbers monotone inward → exactly one InnerTurn
→ Outbound winding numbers monotone outward → EndLead
```

Verify alternating parent-pair phases, distinct ports, no extra closed component, and exactly one inbound/outbound transition.

- [ ] **Step 8: Run validator suites**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test hard_validator --test nonlocal_spacing`  
Expected: PASS.

- [ ] **Step 9: Commit the validator**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): certify hard path constraints"
```

---

### Task 6: Add certified coverage and winding-spacing diagnostics

**Files:**
- Create: `single-loop/solver/src/validation/coverage.rs`
- Create: `single-loop/solver/src/validation/spacing.rs`
- Modify: `single-loop/solver/src/validation/mod.rs`
- Test: `single-loop/solver/tests/coverage_certificate.rs`
- Test: `single-loop/solver/tests/spacing_diagnostics.rs`

**Interfaces:**
- Produces: `coverage_bounds(polygon, path, tolerance, budget)`, `CoverageBounds`, `spacing_extrema(path, parent_pairs, tolerance)`, and `LocatedSpacing`.
- Coverage uses the entire original polygon and complete path.

- [ ] **Step 1: Write failing exact-bound coverage tests**

```rust
#[test]
fn horizontal_diameter_of_square_has_fifty_mm_max_distance() {
    let polygon = square(100.0);
    let path = canonical(&[line((0.0, 50.0), (100.0, 50.0))]);
    let c = coverage_bounds(&polygon, &path, 0.1, 100_000).unwrap();
    assert!(c.lower_bound_mm <= 50.0 && c.upper_bound_mm >= 50.0);
    assert!(c.upper_bound_mm - c.lower_bound_mm <= 0.1);
}

#[test]
fn coverage_budget_is_deterministic() {
    assert_limit(coverage_bounds(&large_polygon(), &short_path(), 1e-9, 12), "MAX_COVERAGE_CELLS", 12);
}
```

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test coverage_certificate`  
Expected: FAIL because coverage code is absent.

- [ ] **Step 3: Implement triangulation and Lipschitz branch-and-bound**

```rust
pub fn coverage_bounds(
    polygon: &Polygon,
    path: &CanonicalPath,
    tolerance_mm: f64,
    max_cells: usize,
) -> Result<CoverageBounds, SolverError> {
    let mut heap = seed_earcut_triangles(polygon, path)?;
    let mut best = heap.iter().map(|c| c.sample_distance).max_by(total_cmp).unwrap();
    let mut used = heap.len();
    while heap.peek().unwrap().upper_bound_mm - best.distance_mm > tolerance_mm {
        ensure_budget(used, max_cells, "MAX_COVERAGE_CELLS")?;
        let cell = heap.pop().unwrap();
        for child in cell.longest_edge_bisection(path) {
            best = stable_max(best, child.best_sample());
            heap.push(child);
            used += 1;
        }
    }
    Ok(bounds_from(best, heap.peek().unwrap(), used))
}
```

For each cell, evaluate vertices and centroid exactly against every primitive. Use centroid distance plus the farthest-cell-point radius as the safe upper bound. Stable heap ordering is `(upper bound descending, triangle id ascending)`.

- [ ] **Step 4: Write failing spacing-extrema tests**

Create two paired parallel lines with distances varying from 80 to 120 mm and assert both extrema and witness points. Assert leads and the inner-turn role are excluded from nominal diagnostics.

- [ ] **Step 5: Implement adaptive parent-pair extrema**

Use the same interval-bounding pattern on each `ParentPair`: exact lower candidates from analytic primitive distance; upper variation bound from subrange arc lengths. Refine until 0.1 mm. Return stable witness points and global path offsets.

- [ ] **Step 6: Run focused tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test coverage_certificate --test spacing_diagnostics`  
Expected: PASS.

- [ ] **Step 7: Commit certified diagnostics**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): certify coverage and spacing extrema"
```

---

### Task 7: Build and validate the segment-Voronoi medial graph

**Files:**
- Create: `single-loop/solver/src/medial_axis/mod.rs`
- Create: `single-loop/solver/src/medial_axis/graph.rs`
- Create: `single-loop/solver/src/medial_axis/voronoi.rs`
- Create: `single-loop/solver/src/medial_axis/enrich.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/medial_axis.rs`

**Interfaces:**
- Consumes: `AllowedRegion` exact boundary and quantized helper segments.
- Produces: deterministic planar `MedialGraph { nodes, edges, embedding, leaves }`, graph validation, edge interpolation, graph centre, and stable event IDs.

- [ ] **Step 1: Write failing rectangle, L-shape, and degeneracy tests**

```rust
#[test]
fn rectangle_medial_graph_is_inside_connected_and_acyclic() {
    let allowed = allowed_rectangle(6000.0, 4000.0, 75.0);
    let graph = build_medial_graph(&allowed, 150.0).unwrap();
    assert!(graph.is_connected());
    assert_eq!(graph.edge_count(), graph.node_count() - 1);
    assert!(graph.all_samples_inside(&allowed));
    assert_eq!(graph.center().point, Point::new(3000.0, 2000.0));
}
```

Also feed duplicated Voronoi vertices and a nearly collinear notch to the adapter fixture and assert stable pruning or a typed family rejection, never panic.

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test medial_axis`  
Expected: FAIL with missing medial-axis module.

- [ ] **Step 3: Implement graph types and deterministic planar embedding**

```rust
pub struct MedialNode { pub id: NodeId, pub point: Point, pub clearance_mm: f64 }
pub struct MedialEdge {
    pub id: EdgeId,
    pub a: NodeId,
    pub b: NodeId,
    pub polyline: Vec<Point>,
    pub length_mm: f64,
}
pub struct MedialGraph {
    pub nodes: Vec<MedialNode>,
    pub edges: Vec<MedialEdge>,
    pub ccw_edges: Vec<Vec<EdgeId>>,
    pub leaves: Vec<NodeId>,
}
```

IDs are assigned after sorting quantized coordinates and source-site IDs, not in library iteration order.

- [ ] **Step 4: Implement the `boostvoronoi` adapter**

- Build with `Builder::<i64>::default().with_segments(segments.iter())?.build()?`.
- Remove edges with an infinite endpoint.
- Retain only edge samples classified inside `AllowedRegion`.
- Convert straight edges directly; flatten parabolic edges to ≤0.05-mm Hausdorff error.
- Snap graph endpoints only inside the 0.001-mm topology budget.
- Collapse zero-length and degree-two collinear helper nodes.
- Reject unresolved cycles/disconnections with `MedialAxisError`, allowing the caller to discard that family.

- [ ] **Step 5: Implement Abrahamsen enrichment**

For consecutive boundary leaves farther apart than guide spacing, insert boundary samples at `ceil(length/spacing)` intervals, cast inward normals to the first medial edge, and add branches only when the hit angle exceeds 50°. Replace reflex-corner double branches by the angle bisector only after explicit convexity checks of both resulting faces.

- [ ] **Step 6: Implement graph centre and validation**

Find the weighted tree diameter with two deterministic traversals; place the point centre at the diameter midpoint, splitting an edge if needed. Independently verify planar edge crossings, inside samples, connectivity, acyclicity, leaf-on-boundary mapping, and cyclic incident-edge ordering.

- [ ] **Step 7: Run medial tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test medial_axis`  
Expected: PASS.

- [ ] **Step 8: Commit the medial graph**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): derive medial graph from segment voronoi"
```

---

### Task 8: Generate point-centred and skeleton-centred wavefront families

**Files:**
- Create: `single-loop/solver/src/wavefront/mod.rs`
- Create: `single-loop/solver/src/wavefront/schedule.rs`
- Create: `single-loop/solver/src/wavefront/front.rs`
- Create: `single-loop/solver/src/wavefront/skeleton.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/wavefront.rs`

**Interfaces:**
- Consumes: validated `MedialGraph`, `AllowedRegion`, nominal spacing, and guide factor.
- Produces: `WavefrontFamily`, ordered fronts, stable parent relations, event seam anchors, and a radius-capable core description.

- [ ] **Step 1: Write failing wavefront invariant tests**

Use hand-authored tree graphs so the test does not depend on Voronoi output:

```rust
#[test]
fn point_family_has_one_ordered_crossing_per_root_leaf_path() {
    let family = point_family(&branched_tree(), 150.0, 1.0).unwrap();
    assert!(family.fronts.windows(2).all(non_intersecting_nested));
    assert!(family.vertices.iter().all(|v| v.parent_count() <= 1));
    assert!(family.max_parent_distance_mm() <= 150.0 + 1e-9);
}
```

Assert skeleton selection for a 10:1 corridor, point and skeleton families for a branched tree, and skeleton omission when its perimeter proxy is below 5% of polygon perimeter.

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test wavefront`  
Expected: FAIL with missing wavefront APIs.

- [ ] **Step 3: Implement the monotone tree schedule**

Root the graph at the centre. Compute subtree height to leaves bottom-up. Assign node hit time and nonincreasing edge speed so every root-to-leaf path reaches its leaf at `t=1`. For each discrete phase, traverse the planar embedding and create exactly one front vertex on each active root-to-leaf branch.

```rust
pub struct WavefrontVertex {
    pub point: Point,
    pub graph_position: GraphPosition,
    pub parent: Option<WavefrontVertexId>,
    pub boundary_order: usize,
}
pub struct Wavefront { pub phase: usize, pub vertices: Vec<WavefrontVertexId> }
```

Choose front count from `ceil(max_root_leaf_length / guide_spacing)`. Apply the upper convex hull of `(front arc length, graph time)` to remove unnecessary sharp phase changes while retaining parent-distance bounds.

- [ ] **Step 4: Implement skeleton extraction and schedule**

Follow the paper-derived deterministic criteria using graph subtree values:

- include the longest child branch;
- include another branch only when projected length is at least `1.5 × D`;
- require spanned boundary over `2 × D`;
- stop at remaining height `D` so the skeleton does not approach the wall;
- thicken the zero-area tree only in the core descriptor to reserve at least a 160-mm turn diameter plus generation margin.

Generate fronts on both sides of the skeleton cycle representation and retain one global cyclic order.

- [ ] **Step 5: Validate each family before returning it**

Check front simplicity, pairwise nesting, parent uniqueness, parent-distance bound, graph-time monotonicity, and ordered event IDs. A failed family returns `WavefrontError` and does not poison other families.

- [ ] **Step 6: Run wavefront tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test wavefront`  
Expected: PASS.

- [ ] **Step 7: Commit wavefront families**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): generate nested wavefront families"
```

---

### Task 9: Implement fixed-radius rounding, robust biarcs, and inner turns

**Files:**
- Create: `single-loop/solver/src/spiral/mod.rs`
- Create: `single-loop/solver/src/spiral/rounding.rs`
- Create: `single-loop/solver/src/spiral/biarc.rs`
- Create: `single-loop/solver/src/spiral/turn.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/rounding.rs`
- Test: `single-loop/solver/tests/biarc.rs`

**Interfaces:**
- Produces: `Pose`, `RoundingVariant`, DPS existence checks, fixed-radius line/arc rounding, robust pose-to-pose biarc candidates, and radius-compliant inner-turn candidates.

- [ ] **Step 1: Write failing DPS and turn tests**

```rust
#[test]
fn ninety_degree_corner_uses_eighty_mm_tangent_offsets() {
    let rounded = round_polyline(&[(0.0, 0.0), (200.0, 0.0), (200.0, 200.0)], 80.0).unwrap();
    assert_line_ends_at(&rounded[0], (120.0, 0.0));
    assert_arc_radius(&rounded[1], 80.0);
    assert_line_starts_at(&rounded[2], (200.0, 80.0));
}

#[test]
fn two_corners_reject_insufficient_shared_segment() {
    assert_eq!(global_dps_feasibility(&tight_polyline(), 80.0), Err(RoundingError::InsufficientSegment { index: 1 }));
}

#[test]
fn parallel_opposite_poses_need_at_least_160_mm_for_semicircle() {
    assert!(semicircle_turn(pose(0.0, 0.0, 0.0), pose(0.0, 159.99, PI), 80.0).is_none());
}
```

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test rounding --test biarc`  
Expected: FAIL with missing spiral curve modules.

- [ ] **Step 3: Implement Pastorelli fixed-radius rounding**

At an interior angle `α`, tangent distance is `R / tan(α/2)`. Enforce the sum of the two adjacent tangent consumptions on every shared segment before constructing any arc. Handle aligned points by merging them; reject a reversal that needs unbounded tangent length.

Return only exact primitives:

```rust
pub fn round_polyline(points: &[Point], radius_mm: f64) -> Result<Vec<PathPrimitive>, RoundingError>;
pub fn round_across_multiple_corners(points: &[Point], min_radius_mm: f64) -> Vec<RoundingVariant>;
```

The multi-corner variant enumerates maximal start/end segment pairs in stable order, solves the tangent circle, and filters radius and sweep before the independent validator performs collision checks.

- [ ] **Step 4: Implement robust biarc computation**

Use the Bertolazzi/Frego scaled 2×2 system with pseudoinverse fallback for near-singular tangents. Enumerate join-tangent branches in stable angle order. For each result verify endpoint pose residual, G1 join, finite geometry, both radii ≥80 mm, and nonzero sweeps.

```rust
pub fn biarc_candidates(start: Pose, end: Pose, min_radius_mm: f64) -> Vec<[PathPrimitive; 2]>;
```

Return an empty vector rather than an unchecked curve when the algebraic system is singular or radius fails.

- [ ] **Step 5: Implement inner-turn candidates**

Generate in order:

1. one semicircle where pose geometry permits;
2. one larger tangent arc where the reserved core permits;
3. filtered biarc candidates.

All candidates connect opposite arm poses exactly and are tagged as one `InnerTurn`, even when represented by two arcs.

- [ ] **Step 6: Run rounding suites**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test rounding --test biarc`  
Expected: PASS.

- [ ] **Step 7: Commit radius-compliant curves**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): construct bounded-radius spiral curves"
```

---

### Task 10: Construct bifilar Connected-Fermat spiral cores

**Files:**
- Create: `single-loop/solver/src/spiral/provenance.rs`
- Create: `single-loop/solver/src/spiral/fermat.rs`
- Create: `single-loop/solver/src/spiral/seam.rs`
- Modify: `single-loop/solver/src/spiral/mod.rs`
- Test: `single-loop/solver/tests/bifilar_spiral.rs`

**Interfaces:**
- Consumes: `WavefrontFamily`, seam anchor, direction, guide factor, and inner-turn variants.
- Produces: `SpiralCoreCandidate { path, provenance, parent_pairs, inbound_seam_pose, outbound_seam_pose, key }` without wall leads.

- [ ] **Step 1: Write failing topology tests**

```rust
#[test]
fn alternating_front_phases_form_one_in_and_one_out_arm() {
    let core = generate_core(&rectangular_fronts(), seam(0), Direction::Ccw, 80.0).next().unwrap();
    assert_eq!(core.connected_component_count(), 1);
    assert_eq!(core.provenance.inner_turn_count(), 1);
    assert!(core.provenance.inbound_windings_are_monotone());
    assert!(core.provenance.outbound_windings_are_monotone());
    assert!(core.provenance.parent_phases_alternate());
}
```

Assert no closed ring, seam endpoints are distinct, all joins are G1, and core variants are emitted in stable key order.

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test bifilar_spiral`  
Expected: FAIL with missing Fermat core generator.

- [ ] **Step 3: Implement continuous front interpolation**

For each adjacent pair of fronts, use boundary arc-length phase to choose one graph-position crossing per parent branch. Connect front fragments in cyclic order and advance phase continuously so the guide changes level through the seam rather than closing a ring.

Build arms as:

```text
inbound: outer phase 0, 2, 4, … → core
turn:    exactly one selected radius-compliant candidate
outbound: core → …, 5, 3, 1 → outer phase 1
```

When a family has opposite parity, reverse the phase assignment but preserve one interleaved pair.

- [ ] **Step 4: Round the guide and retain provenance**

Run Task 9’s sequence: merge near points, fixed-radius corners, multi-corner arcs, then local biarc fallback. Split or merge provenance ranges together with geometry. Emit parent pairs only for `Inbound`/`Outbound` windings; never include leads or inner turn.

- [ ] **Step 5: Generate seam candidates deterministically**

`seam.rs` must expose event anchors plus exactly 16 perimeter-fraction anchors. Deduplicate at 0.001 mm with event anchors winning. Preserve fields `(family, guideFactorIndex, direction, anchorKind, anchorOrder, turnVariant)` in `CandidateKey`.

- [ ] **Step 6: Run the core suite**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test bifilar_spiral`  
Expected: PASS.

- [ ] **Step 7: Commit bifilar core construction**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): construct bifilar fermat spiral cores"
```

---

### Task 11: Route both orthogonal wall leads with a pose graph

**Files:**
- Create: `single-loop/solver/src/routing/mod.rs`
- Create: `single-loop/solver/src/routing/pose.rs`
- Create: `single-loop/solver/src/routing/transition.rs`
- Create: `single-loop/solver/src/routing/graph.rs`
- Create: `single-loop/solver/src/routing/joint.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/connection_routing.rs`

**Interfaces:**
- Consumes: normalized ports, a spiral core and exact polygon/allowed region.
- Produces: zero or more complete `CandidatePath`s for both port assignments, plus deterministic pose-expansion accounting.

- [ ] **Step 1: Write failing routing tests**

Test both port assignments, exact orthogonal tangents, a curve beginning before wall-clearance exit, no re-entry, crossing rejection, rip-up/re-route success, and deterministic budget failure.

```rust
#[test]
fn routed_pair_starts_orthogonally_and_never_crosses() {
    let routed = route_lead_pair(&routing_fixture(), PortAssignment::FirstStarts, budget()).unwrap();
    assert_parallel(routed.path.start_tangent(), routing_fixture().inward_normal);
    assert_parallel(routed.path.end_tangent(), -routing_fixture().inward_normal);
    assert_eq!(nonadjacent_intersections(&routed.path), 0);
    assert!(zone_phases_are_monotone(&routed));
}
```

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test connection_routing`  
Expected: FAIL with missing routing module.

- [ ] **Step 3: Define pose states and exact transitions**

```rust
pub enum ZonePhase { NearWall, Inside }
pub struct PoseState {
    pub point: Point,
    pub heading_rad: f64,
    pub phase: ZonePhase,
    pub source_id: u32,
}
pub struct RouteTransition {
    pub primitives: Vec<PathPrimitive>,
    pub length_mm: f64,
    pub bend_count: u16,
    pub clearance_reserve_mm: f64,
}
```

State keys quantize position to 0.001 mm and heading to stable source tangent IDs; do not quantize output geometry. Transitions are straight, tangent line-arc, arc-line, and filtered CSC/biarc pose connections with every radius ≥80 mm.

- [ ] **Step 4: Build deterministic pose-graph nodes and A***

Create nodes at ports, both seam poses, exact tangent points on allowed-boundary features, visibility events, and corridor samples at 50-mm increments plus endpoints. Reject a transition before insertion if it exits the polygon, violates the current phase, crosses the spiral/reserved lead, or falls below generation margins.

A* ordering is the tuple:

```text
(total estimated length, bend count, negative clearance reserve, state key)
```

Increment the global pose-expansion budget on every popped state and return `SOLVER_LIMIT_EXCEEDED` at exactly 5,000,001.

- [ ] **Step 5: Implement joint pair routing and rip-up/re-route**

Route the geometrically inner fan-out branch first, reserve its exact primitives plus 50-mm nonlocal envelope, then route the second. If that order fails, clear both lead reservations and reverse the order once. Run both port assignments. Concatenate `StartLead + core + reversed EndLead`, canonicalize roles, and send every complete candidate through the independent hard validator.

- [ ] **Step 6: Run routing tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test connection_routing`  
Expected: PASS.

- [ ] **Step 7: Commit pose routing**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): route ordered bounded-radius leads"
```

---

### Task 12: Add deterministic candidate search, ranking, and spacing escalation

**Files:**
- Create: `single-loop/solver/src/search/mod.rs`
- Create: `single-loop/solver/src/search/candidate.rs`
- Create: `single-loop/solver/src/search/ranking.rs`
- Create: `single-loop/solver/src/search/spacing.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/candidate_search.rs`
- Test: `single-loop/solver/tests/spacing_search.rs`

**Interfaces:**
- Produces: `evaluate_spacing`, stable `CandidateScore`, top-eight/four-step seam refinement, length-only failure classification, and `find_required_spacing`.
- Consumes all generator families but accepts plans only from validation reports.

- [ ] **Step 1: Write failing deterministic ranking tests**

```rust
#[test]
fn ranking_uses_coverage_then_spacing_spread_then_length_then_key() {
    let mut candidates = score_fixtures();
    candidates.sort_by(compare_candidates);
    assert_eq!(candidates[0].key, key("best-coverage"));
    assert_eq!(candidates[1].key, key("same-coverage-less-spread"));
}

#[test]
fn requested_spacing_wins_without_evaluating_larger_spacing() {
    let trace = solve_with_fake_factory(factory_valid_at(150.0));
    assert_eq!(trace.evaluated_spacings, vec![150.0]);
    assert_eq!(trace.plan.actual_spacing_mm, 150.0);
}
```

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test candidate_search --test spacing_search`  
Expected: FAIL with missing search module.

- [ ] **Step 3: Implement stable candidate enumeration and work budget**

Enumerate axes in this exact nesting order:

```rust
for family in [Point, Skeleton] {
    for guide_factor in [1.0, 0.975, 0.95] {
        for direction in [CounterClockwise, Clockwise] {
            for port_assignment in [FirstStarts, SecondStarts] {
                for seam in stable_seams {
                    for turn in stable_turns {
                        evaluate_complete_candidate(family, guide_factor, direction, port_assignment, seam, turn, &mut work)?;
                    }
                }
            }
        }
    }
}
```

Replace the comment in production with a call that generates the core, routes both leads, increments candidate-validation work, hard-validates, computes diagnostics, and records either a certified candidate or a stable rejection reason. At 20,001 attempted complete validations, return the resource error.

- [ ] **Step 4: Implement coverage-first ranking and seam refinement**

Compute coarse coverage bounds for all hard-valid candidates; select the eight best stable seam anchors. Around each, evaluate four deterministic perimeter-offset halvings in negative then positive order. Refine overlapping leading coverage intervals until separated or ≤0.1 mm. Compare final tuple:

```rust
(
    OrderedFloat(coverage.upper_bound_mm),
    OrderedFloat(spacing.max.distance_mm - spacing.min.distance_mm),
    OrderedFloat(total_length_upper_bound_mm),
    candidate.key.clone(),
)
```

Use an internal total-order wrapper based on `f64::total_cmp`; do not add a dependency solely for ordering.

- [ ] **Step 5: Implement length-only classification and spacing search**

`evaluate_spacing` returns:

```rust
pub struct TopologySignature {
    pub family: u8,
    pub front_count: usize,
    pub skeleton_branch_count: usize,
}

pub struct CertifiedCandidate {
    pub candidate: CandidatePath,
    pub hard: HardValidationReport,
    pub coverage: CoverageBounds,
    pub spacing: SpacingExtrema,
    pub total_length_upper_bound_mm: f64,
}

pub enum SpacingEvaluation {
    Success(CertifiedCandidate),
    LengthOnly { shortest_upper_bound_mm: f64, topology: TopologySignature },
    GeometryFailure { rejection_summary: RejectionSummary },
}
```

Call requested spacing first. Only `LengthOnly` enters upward search. Examine topology-event intervals in ascending spacing, then the absolute 0.1-mm grid starting at `(floor(requested*10)+1)/10`. Return the smallest successful grid value. Stop with `NO_SOLUTION_LENGTH` only after the minimal topology has a certified shortest candidate above 100,000 mm. A geometry failure never triggers spacing escalation.

- [ ] **Step 6: Generate warnings in fixed order**

```rust
pub fn spacing_warnings(requested: f64, actual: f64) -> Vec<SolverWarning> {
    let mut out = Vec::new();
    if actual > requested { out.push(spacing_increased(requested, actual)); }
    if actual > 250.0 { out.push(spacing_exceeds_250(actual)); }
    out
}
```

Prepend `CONNECTION_SHIFTED` if present so final order matches the public contract.

- [ ] **Step 7: Run search suites**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test candidate_search --test spacing_search`  
Expected: PASS.

- [ ] **Step 8: Commit deterministic search**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): rank candidates and enforce loop length"
```

---

### Task 13: Wire the public solver, certificate, hash, and final revalidation

**Files:**
- Create: `single-loop/solver/src/solver.rs`
- Create: `single-loop/solver/src/validation/certificate.rs`
- Modify: `single-loop/solver/src/validation/mod.rs`
- Modify: `single-loop/solver/src/lib.rs`
- Test: `single-loop/solver/tests/solve_rectangle.rs`
- Test: `single-loop/solver/tests/determinism.rs`

**Interfaces:**
- Produces native `pub fn solve_single_loop(input: SolveSingleLoopInput) -> SolveResult`.
- Produces full `ConstraintCertificate`, canonical SHA-256 `requestHash`, fixed solver version, and post-serialization second validation.

- [ ] **Step 1: Write failing end-to-end rectangle test**

Use a 6000×4000-mm rectangle, bottom-edge midpoint connection, requested 150 mm, wall clearance 75 mm. Assert success and every public invariant rather than a particular candidate key:

```rust
#[test]
fn solves_rectangle_as_one_certified_bifilar_loop() {
    let result = solve_single_loop(rectangle_request(6000.0, 4000.0, 150.0, 75.0));
    let plan = result.unwrap_plan();
    assert_eq!(plan.actual_spacing_mm, 150.0);
    assert!(plan.total_length_mm <= 100_000.0);
    assert!(plan.constraint_certificate.inside_polygon);
    assert!(plan.constraint_certificate.bifilar_topology);
    assert!(plan.constraint_certificate.min_bend_radius_mm.lower_bound_mm >= 80.0);
    assert!(plan.constraint_certificate.min_nonlocal_spacing_mm.lower_bound_mm >= 50.0);
    assert!(plan.coverage.error_bound_mm <= 0.1);
}
```

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test solve_rectangle --release`  
Expected: FAIL because top-level orchestration is absent.

- [ ] **Step 3: Implement canonical request hash and orchestration**

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SolvePhase { Normalize, Generate, Validate, Coverage }

impl SolvePhase {
    pub const fn as_wire_str(self) -> &'static str {
        match self {
            Self::Normalize => "normalize",
            Self::Generate => "generate",
            Self::Validate => "validate",
            Self::Coverage => "coverage",
        }
    }
}

pub fn solve_single_loop(raw: SolveSingleLoopInput) -> SolveResult {
    solve_single_loop_with_progress(raw, |_| {})
}

pub fn solve_single_loop_with_progress(
    raw: SolveSingleLoopInput,
    mut progress: impl FnMut(SolvePhase),
) -> SolveResult {
    progress(SolvePhase::Normalize);
    match solve_checked(raw.clone(), &mut progress) {
        Ok(candidate) => finalize_twice(raw, candidate),
        Err(error) => SolveResult::Error { error },
    }
}

fn solve_checked(
    raw: SolveSingleLoopInput,
    progress: &mut impl FnMut(SolvePhase),
) -> Result<CertifiedCandidate, SolverError> {
    let normalized = validate_and_normalize(raw)?;
    let allowed = erode_for_centerline(&normalized)?;
    let graph = build_medial_graph(&allowed, normalized.raw.requested_spacing_mm)?;
    progress(SolvePhase::Generate);
    search::solve(normalized, allowed, graph, progress)
}
```

`search::solve` emits `Validate` before full hard-candidate validation and `Coverage` before diagnostic refinement. Coalesce repeated identical phases so callback sequences are deterministic and bounded. `solve_single_loop` remains the no-progress public native API used by callers.

Canonical hashing serializes object fields in a hard-coded order and each finite f64 as its IEEE-754 hexadecimal bits before SHA-256. Do not hash locale-formatted decimal strings.

- [ ] **Step 4: Build the complete certificate from independent reports**

Combine hard validation, analytic length upper bound, coverage bounds, and spacing diagnostics. `minWallClearanceMm` covers only regulated path intervals; `connectionZoneCompliant` certifies the exceptions. Set `numericToleranceMm` to the maximum active topology/metric error budget, not the coverage error.

- [ ] **Step 5: Add the final serialization boundary check**

Serialize `SingleLoopPlan` to `serde_json::Value`, deserialize it, canonicalize its path again, and rerun hard validation plus metric consistency. Any discrepancy returns `INTERNAL_VALIDATION_FAILURE` with reason and candidate key; never return the pre-serialization plan.

- [ ] **Step 6: Write and pass deterministic-byte tests**

Run the same input 20 times and compare `serde_json::to_vec` byte-for-byte. Reverse polygon winding with mapped edge and assert equivalent metrics and transformed path. Translate and rotate fixtures and assert metrics within the declared numerical budget.

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test solve_rectangle --test determinism --release`  
Expected: PASS.

- [ ] **Step 7: Commit the native solver**

```bash
git add single-loop/solver
git commit -m "feat(single-loop): expose certified deterministic solver"
```

---

### Task 14: Add the full fixture corpus and regression/property gates

**Files:**
- Create: `single-loop/fixtures/rectangle.json`
- Create: `single-loop/fixtures/convex.json`
- Create: `single-loop/fixtures/l-shape.json`
- Create: `single-loop/fixtures/u-shape.json`
- Create: `single-loop/fixtures/c-shape.json`
- Create: `single-loop/fixtures/elongated.json`
- Create: `single-loop/fixtures/dumbbell.json`
- Create: `single-loop/fixtures/deep-notch.json`
- Create: `single-loop/fixtures/comb.json`
- Create: `single-loop/fixtures/invalid-and-boundaries.json`
- Create: `single-loop/solver/tests/fixture_corpus.rs`
- Create: `single-loop/solver/tests/metamorphic.rs`
- Create: `single-loop/solver/tests/regressions.rs`

**Interfaces:**
- Produces stable JSON fixtures consumed by Rust and later browser tests.
- Encodes `expected: success | error-code` plus only invariant expectations, not brittle full paths.

- [ ] **Step 1: Create fixture schema and corpus runner**

Each JSON entry has this shape:

```json
{
  "name": "l-shape-standard",
  "input": {
    "polygon": [{"x":0,"y":0},{"x":6000,"y":0},{"x":6000,"y":2500},{"x":3500,"y":2500},{"x":3500,"y":5000},{"x":0,"y":5000}],
    "connection": {"edgeIndex":0,"centerOffsetMm":3000},
    "requestedSpacingMm":150,
    "wallClearanceMm":75
  },
  "expected": {"kind":"success","maxLengthMm":100000,"maxCoverageErrorMm":0.1}
}
```

Include exact boundary/error entries for 115.999/116/116.001-mm connection edges, 7.999/8-mm wall clearance, 49.999/50/250/250.001-mm requested spacing, self-crossing polygon, repeated endpoint, and disconnected inset.

- [ ] **Step 2: Run the corpus against the completed native solver**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --test fixture_corpus --release -- --nocapture`  
Expected: PASS; every expected-success fixture is independently certified and every expected-error fixture returns its exact code. A failure blocks this task and must be reduced to a focused failing test in the module named by the rejection trace before changing production geometry.

- [ ] **Step 3: Add metamorphic proptests**

Generate simple star-shaped and orthogonal polygons with valid connection edges. For successful base solves, test translation, quarter-turn rotations, reflection, and winding reversal. Check metric invariance and final validation, using at most 32 cases per property to keep CI bounded.

- [ ] **Step 4: Port documented legacy regressions**

Translate cases from:

- `docs/2026-07-26-wo-der-biegeradius-bricht.md`
- `docs/2026-07-26-radius-attribution-zwei-populationen.md`
- `docs/2026-07-26-kreuzungen-sind-die-anbindung.md`
- `docs/2026-07-26-deckung-ist-ein-inset-budget.md`

Assert no accepted plan exhibits the recorded failure class: false radius attribution, connector crossing, path exit, or coverage ranking that ignores wall zones.

- [ ] **Step 5: Run all native tests**

Run: `cargo test --manifest-path single-loop/solver/Cargo.toml --release`  
Expected: PASS with all unit, corpus, regression, and property tests.

- [ ] **Step 6: Commit the acceptance corpus**

```bash
git add single-loop/fixtures single-loop/solver
git commit -m "test(single-loop): add polygon and regression corpus"
```

---

### Task 15: Expose WASM and a cancellable typed Web Worker

**Files:**
- Modify: `single-loop/solver/src/lib.rs`
- Create: `single-loop/src/api/wasm.ts`
- Create: `single-loop/src/api/solve.ts`
- Create: `single-loop/src/worker/protocol.ts`
- Create: `single-loop/src/worker/solver.worker.ts`
- Create: `single-loop/src/worker/client.ts`
- Create: `single-loop/tests/unit/api.test.ts`
- Create: `single-loop/tests/unit/worker.test.ts`

**Interfaces:**
- Produces synchronous `solveSingleLoop(input): SolveResult` WASM facade.
- Produces `SingleLoopWorkerClient.solve(input, { signal, onProgress }): Promise<SolveResult>`; abort terminates and recreates the worker.

- [ ] **Step 1: Install the WASM target/tool and write a failing wasm smoke test**

Run:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
```

Add a Vitest that imports `solveSingleLoop`, submits invalid wall clearance, and expects `INVALID_WALL_CLEARANCE`.

Run: `cd single-loop && npm test -- api.test.ts`  
Expected: FAIL because the WASM facade does not exist.

- [ ] **Step 2: Export the synchronous Rust function**

```rust
#[wasm_bindgen(js_name = solveSingleLoop)]
pub fn solve_single_loop_wasm(input: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let input = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("invalid SolveSingleLoopInput: {e}")))?;
    serde_wasm_bindgen::to_value(&solver::solve_single_loop(input))
        .map_err(|e| JsValue::from_str(&format!("cannot serialize SolveResult: {e}")))
}

#[wasm_bindgen(js_name = solveSingleLoopWithProgress)]
pub fn solve_single_loop_with_progress_wasm(
    input: JsValue,
    callback: js_sys::Function,
) -> Result<JsValue, JsValue> {
    let input = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("invalid SolveSingleLoopInput: {e}")))?;
    let result = solver::solve_single_loop_with_progress(input, |phase| {
        let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(phase.as_wire_str()));
    });
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("cannot serialize SolveResult: {e}")))
}
```

Add `console_error_panic_hook = "0.1.7"` to Cargo dependencies. Keep native `solve_single_loop` separate for Rust tests.

- [ ] **Step 3: Build WASM and add the synchronous TypeScript facade**

```ts
import init, {
  solveSingleLoop as solveWasm,
  solveSingleLoopWithProgress as solveWasmWithProgress,
} from "../wasm/pkg/single_loop_solver.js";
import type { SolveResult, SolveSingleLoopInput } from "./types";
import type { SolvePhase } from "../worker/protocol";

let ready: Promise<void> | undefined;
let initialized = false;
export function initializeSolver(): Promise<void> {
  return ready ??= init().then(() => { initialized = true; });
}
export function solveSingleLoop(input: SolveSingleLoopInput): SolveResult {
  if (!initialized) throw new Error("initializeSolver() must resolve before solveSingleLoop()");
  return solveWasm(input) as SolveResult;
}
export function solveSingleLoopWithProgress(
  input: SolveSingleLoopInput,
  onProgress: (phase: SolvePhase) => void,
): SolveResult {
  if (!initialized) throw new Error("initializeSolver() must resolve before solveSingleLoop()");
  return solveWasmWithProgress(input, onProgress) as SolveResult;
}
```

Run: `cd single-loop && npm run wasm:build && npm test -- api.test.ts`  
Expected: PASS.

- [ ] **Step 4: Define worker protocol and write failing cancellation tests**

```ts
export type SolvePhase = "normalize" | "generate" | "validate" | "coverage";
export type WorkerRequest = { type: "solve"; id: number; input: SolveSingleLoopInput };
export type WorkerResponse =
  | { type: "progress"; id: number; phase: SolvePhase }
  | { type: "result"; id: number; result: SolveResult }
  | { type: "fatal"; id: number; message: string };
```

Test stale-result suppression, one in-flight request, progress ordering, abort rejection with `AbortError`, and worker recreation.

- [ ] **Step 5: Implement worker and client**

The worker initializes WASM once, passes a callback to `solveSingleLoopWithProgress`, forwards only the four typed phase strings for the active request ID, and posts only a final complete result. The client owns the worker factory, monotonically increasing request IDs, and terminates the worker on abort so Rust cannot publish a partial result.

- [ ] **Step 6: Run TypeScript tests and production build**

Run: `cd single-loop && npm test -- api.test.ts worker.test.ts`  
Expected: PASS.

Run: `cd single-loop && npm run build`  
Expected: PASS and create `single-loop/dist/`.

- [ ] **Step 7: Commit WASM and worker integration**

```bash
git add single-loop
git commit -m "feat(single-loop): run solver through cancellable wasm worker"
```

---

### Task 16: Render exact SVG and build the polygon editor

**Files:**
- Create: `single-loop/index.html`
- Create: `single-loop/src/render/svg-path.ts`
- Create: `single-loop/src/render/scene.ts`
- Create: `single-loop/src/ui/state.ts`
- Create: `single-loop/src/ui/editor.ts`
- Create: `single-loop/src/main.ts`
- Create: `single-loop/src/styles.css`
- Create: `single-loop/tests/unit/svg-path.test.ts`
- Create: `single-loop/tests/unit/editor.test.ts`

**Interfaces:**
- Produces exact SVG `d` commands from canonical primitives, no curve approximation.
- Produces editor state for polygon vertices, selected edge, midpoint offset, spacing, clearance, and solve lifecycle.

- [ ] **Step 1: Write failing exact SVG arc tests**

```ts
it("emits one exact SVG A command for a solver arc", () => {
  expect(pathData([{kind:"arc", start:{x:80,y:0}, end:{x:0,y:80}, center:{x:0,y:0}, radiusMm:80, sweepRad:Math.PI/2}]))
    .toBe("M 80 0 A 80 80 0 0 1 0 80");
});

it("uses the large-arc flag without sampling", () => {
  expect(pathData([arcWithSweep(1.5 * Math.PI)])).toContain(" A 80 80 0 1 1 ");
});
```

- [ ] **Step 2: Verify failure**

Run: `cd single-loop && npm test -- svg-path.test.ts editor.test.ts`  
Expected: FAIL with missing renderer/editor.

- [ ] **Step 3: Implement exact SVG path conversion**

```ts
export function pathData(path: PathPrimitive[]): string {
  if (path.length === 0) return "";
  const parts = [`M ${fmt(path[0].start.x)} ${fmt(path[0].start.y)}`];
  for (const p of path) {
    if (p.kind === "line") parts.push(`L ${fmt(p.end.x)} ${fmt(p.end.y)}`);
    else parts.push(`A ${fmt(p.radiusMm)} ${fmt(p.radiusMm)} 0 ${Math.abs(p.sweepRad) > Math.PI ? 1 : 0} ${p.sweepRad > 0 ? 1 : 0} ${fmt(p.end.x)} ${fmt(p.end.y)}`);
  }
  return parts.join(" ");
}
```

Render solver coordinates in an SVG group with the documented world/screen transform; apply the matching inverse transform for pointer input. Keep labels outside the reflected geometry group.

- [ ] **Step 4: Implement immutable editor state and polygon gestures**

State actions must cover add vertex, move vertex, close polygon, select edge, set midpoint by projected click, set numeric inputs, solve start/progress/result/error, and reset. Reject editor actions that create nonfinite points; show solver validation for geometric invalidity rather than silently changing the polygon.

- [ ] **Step 5: Compose the initial application shell**

Create controls for spacing (50–250), wall clearance (minimum 8), solve/cancel, and layer toggles. Render polygon edges with selectable hit targets, numbered vertices, two port previews, connection midpoint, and the exact result path. Disable Solve only when the request object cannot be formed; let the solver return geometric errors.

- [ ] **Step 6: Run renderer/editor tests and build**

Run: `cd single-loop && npm test -- svg-path.test.ts editor.test.ts`  
Expected: PASS.

Run: `cd single-loop && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit rendering and editing**

```bash
git add single-loop
git commit -m "feat(single-loop): add exact svg editor"
```

---

### Task 17: Add diagnostics, import/export, and browser acceptance tests

**Files:**
- Create: `single-loop/src/ui/diagnostics.ts`
- Create: `single-loop/src/ui/io.ts`
- Modify: `single-loop/src/main.ts`
- Modify: `single-loop/src/styles.css`
- Create: `single-loop/playwright.config.ts`
- Create: `single-loop/tests/unit/io.test.ts`
- Create: `single-loop/tests/e2e/app.spec.ts`

**Interfaces:**
- Produces visible normalized connection, warnings, length, coverage, spacing extrema, certificate, and diagnostic witness points.
- Produces JSON input/result and exact SVG exports plus JSON import.

- [ ] **Step 1: Write failing import/export tests**

Assert stable JSON key order, request validation on import, exact path preservation, SVG export containing one path with line/arc commands, and no replacement by sampled points.

- [ ] **Step 2: Implement diagnostics view models**

Map warning codes to German UI text without changing API codes. Display:

- requested and actual connection offsets and shifted distance;
- requested and actual nominal spacing;
- total length in metres and millimetres;
- coverage lower/upper/error and worst point;
- nominal min/max spacing with both witness points;
- every certificate lower/upper bound;
- solver version and request hash.

Use red markers for any error witness, distinct markers for coverage and spacing extrema, and a visible badge for every warning.

- [ ] **Step 3: Implement deterministic import/export**

```ts
export function exportInput(input: SolveSingleLoopInput): string {
  return JSON.stringify(input, null, 2) + "\n";
}
export function exportResult(result: SolveResult): string {
  return JSON.stringify(result, null, 2) + "\n";
}
export function exportSvg(scene: RenderScene): string {
  return serializeStandaloneSvg(renderScene(scene));
}
```

Import only the public request shape and reject unknown nonfinite values with an explicit UI error. Do not accept a result as solver input.

- [ ] **Step 4: Write Playwright acceptance tests**

Test:

1. load the default rectangle;
2. choose the bottom edge and move connection near an endpoint;
3. solve and observe `CONNECTION_SHIFTED` if clamped;
4. verify one SVG result path containing `A` commands;
5. inspect length, coverage, spacing, and certificate;
6. start another solve and cancel it;
7. export JSON and SVG;
8. import the L-shape fixture and solve it;
9. enter wall clearance 7.999 and observe `INVALID_WALL_CLEARANCE`.

- [ ] **Step 5: Run unit and browser tests**

Run: `cd single-loop && npm test -- io.test.ts`  
Expected: PASS.

Run: `cd single-loop && npx playwright install chromium && npm run test:e2e`  
Expected: PASS in Chromium.

- [ ] **Step 6: Commit diagnostics and browser flow**

```bash
git add single-loop
git commit -m "feat(single-loop): expose solver diagnostics and exports"
```

---

### Task 18: Add license gates, documentation, and run final acceptance

**Files:**
- Create: `single-loop/scripts/check-licenses.mjs`
- Create: `single-loop/README.md`
- Modify: `single-loop/package.json`

**Interfaces:**
- Produces reproducible setup/build/test documentation and a dependency-license failure gate.
- Final verification covers native Rust, WASM, TypeScript, static build, Playwright, deterministic fixtures, and unchanged legacy application.

- [ ] **Step 1: Add a failing license check before wiring its script**

The script reads `cargo metadata --format-version 1` and `package-lock.json`, treats Cargo packages as production unless they are only reachable through `[dev-dependencies]`, and treats npm lockfile packages with `dev !== true` as production. It normalizes SPDX expressions and fails on `GPL-*`, `AGPL-*`, `SSPL-*`, `BUSL-*`, non-commercial terms, or missing production dependency licenses. It explicitly allows MIT, Apache-2.0, BSL-1.0, ISC, BSD-2-Clause, BSD-3-Clause, Unicode-3.0, CC0-1.0, and Zlib.

Add package script:

```json
"check:licenses": "node scripts/check-licenses.mjs"
```

Run: `cd single-loop && npm run check:licenses`  
Expected: PASS and print the allowed production dependency count; any disallowed dependency exits nonzero with package and license.

- [ ] **Step 2: Document exact local commands and limitations**

`single-loop/README.md` must contain:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm install
npm run dev
cargo test --manifest-path solver/Cargo.toml --release
npm test
npm run test:e2e
npm run build
npm run check:licenses
```

Document units, input contract, the three warnings, error codes, static `dist/` deployment, no thermal suitability claim, no holes/multiple loops, and that `verlegeplan.html` remains separate.

Keep all documentation inside `single-loop/`; do not change the legacy root README or application.

- [ ] **Step 3: Run formatting and static checks**

Run:

```bash
cargo fmt --manifest-path single-loop/solver/Cargo.toml -- --check
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets -- -D warnings
cd single-loop && npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the complete native and web suites**

Run:

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --release
cd single-loop && npm test
cd single-loop && npm run build
cd single-loop && npm run test:e2e
cd single-loop && npm run check:licenses
```

Expected: all tests pass, static build completes, browser acceptance passes, and license gate passes.

- [ ] **Step 5: Verify hard repository boundaries and deterministic output**

Run:

```bash
git diff --exit-code HEAD -- verlegeplan.html
cargo test --manifest-path single-loop/solver/Cargo.toml --test determinism --release
find single-loop/dist -type f -maxdepth 3 | sort
```

Expected: no `verlegeplan.html` diff, deterministic test PASS, and only static HTML/CSS/JS/WASM assets in `dist/`.

- [ ] **Step 6: Commit final quality gates**

```bash
git add single-loop
git commit -m "docs(single-loop): add verification and deployment guide"
```

---

## Final Acceptance Checklist

- [ ] Every public success is a twice-validated single open bifilar path between the normalized ports.
- [ ] Every output primitive is canonical `Line | Arc`, G1 continuous, inside the polygon, and radius compliant.
- [ ] The independent validator certifies wall-zone behavior, no crossings, 50-mm nonlocal spacing, and length ≤100,000 mm.
- [ ] Coverage spans the entire original polygon with a ≤0.1-mm bound interval.
- [ ] Requested spacing is preserved whenever it can satisfy the length cap.
- [ ] Connection shifting and spacing warnings are ordered and complete.
- [ ] Repeated identical requests produce byte-identical results for the same solver version.
- [ ] Fixture, property, regression, WASM, UI, browser, static-build, and license suites pass.
- [ ] `verlegeplan.html` is unchanged.
