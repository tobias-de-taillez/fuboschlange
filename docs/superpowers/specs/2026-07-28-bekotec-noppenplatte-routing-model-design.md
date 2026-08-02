# BEKOTEC Noppenplatte Routing Model Design

**Date:** 2026-07-28  
**Status:** Approved design  
**Scope:** Mathematical plate and local motion model only; no heating-loop search

## 1. Purpose

Replace free-form pipe generation with a finite, deterministic routing substrate derived from the Schlüter-BEKOTEC noppen system. The first milestone models one BEKOTEC plate profile, embeds it into an arbitrary simple room polygon, constructs a finite graph of locally installable pipe motions, validates that graph independently, and renders all geometry in a diagnostic SVG.

This milestone must not claim to have generated a heating loop. The later bifilar-loop planner may consume only graph edges certified by this milestone.

## 2. Authoritative references

The model is based on:

1. Schlüter-BEKOTEC-THERM technical handbook, 2025/2026 edition, especially:
   - BEKOTEC-EN 23 FI 30 system data;
   - page 39, “Verlegung des Heizrohrs”;
   - page 119, BEKOTEC-THERM-HR technical data.
2. Schlüter-BEKOTEC-EN 23 F product page and product data sheet 9.2 for the shared 75 mm noppen motif and published approximate noppen sizes.
3. The manufacturer diagram that labels broad 90-degree and broad teardrop reversals as permitted and tight single-noppen turns as prohibited.

The selected profile is `BEKOTEC_EN_23_FI_30_16`: 75 mm placement raster, 16 mm BEKOTEC-THERM-HR pipe, and minimum centerline bend radius `5 × 16 mm = 80 mm`.

The linked EN 23 F product itself is limited to 14 mm pipe. It is used only as a source for the matching visible noppen motif. The solver profile is the EN 23 FI 30 variant explicitly approved for 16 mm pipe.

## 3. Retained global constraints

The future loop planner retains the existing project constraints unless this specification explicitly replaces one:

- one continuous bifilar loop;
- arbitrary simple polygon without holes;
- maximum loop length 100,000 mm;
- configurable wall clearance, minimum 8 mm;
- selected connection edge and two connection ports;
- crossing-free canonical `Line | Arc` output;
- independent validation before success;
- deterministic output;
- Rust/WASM core and browser SVG UI.

Continuous requested spacing is replaced by the discrete system choices `75`, `150`, `225`, and `300` mm. A future solver starts at the requested system spacing and may increase only through that ordered list to meet the 100 m limit. A 300 mm result carries the existing over-250-mm warning.

## 4. Coordinate systems and plate placement

Let `P` be the normalized room polygon. The plate frame is

```text
world(x, y) = origin + u*x + v*y
```

where:

- `u` is the normalized direction of the selected connection edge;
- `v` is the inward-facing perpendicular;
- `origin` is the connection-edge frame origin plus a phase `(phase_u_mm, phase_v_mm)`;
- each phase component is canonicalized into `[0, 75)` mm.

Only phase is variable. Arbitrary plate rotation is not supported. A future optimizer may enumerate or optimize phase, but this milestone accepts an explicit phase and produces one plate instance.

The mathematical plate is an infinite periodic motif clipped to the room. Individual 1200 × 900 mm sheets, overlap rows, cut lists, and material quantities are outside this milestone because overlapping sheets preserve the periodic routing motif.

## 5. Periodic noppen geometry

### 5.1 Motif

Noppen centers lie on a square lattice of pitch `p = 75 mm`:

```text
c(i, j) = (75*i, 75*j), i,j ∈ Z
```

The manufacturer drawing alternates large and small noppen in a checkerboard:

```text
large when (i + j) is even
small when (i + j) is odd
```

The smallest translational fundamental cell that preserves noppen type is therefore 150 × 150 mm.

### 5.2 Conservative replacement bodies

Published approximate plan sizes are 65 mm for a large nopp and 20 mm for a small nopp. The 65 mm base footprint is below the pipe center and therefore is **not** a valid two-dimensional collision body: expanding it by the pipe radius would incorrectly eliminate the straight and diagonal routes shown to be possible on the plate. Collision geometry must represent the horizontal nopp cross-section at pipe-center elevation, while the larger base footprint is retained only as a rendered plate feature.

The reconstructed and versioned profile uses:

- large rendered base radius: `33.0 mm`;
- large effective radius at pipe-center elevation: `17.5 mm`;
- small effective radius at pipe-center elevation: `10.5 mm`;
- calibration allowance: `0.5 mm` outward;
- pipe radius: `8.0 mm`.

The forbidden centerline radii are consequently:

- large: `26.0 mm`;
- small: `19.0 mm`.

The large effective radius is the largest half-millimetre value that conservatively preserves the documented 45-degree channel in the calibrated 75 mm checkerboard motif; the small radius rounds the published 20 mm size outward. Golden route fixtures are part of profile certification, so changing either value cannot silently remove or invent a documented channel. These values are fields of the versioned `PlateProfile`, not global constants. A later dimensioned manufacturer CAD profile can replace them without changing graph or validator interfaces.

For effective nopp body `K_k`, pipe disk `B(8)`, and calibration disk `B(0.5)`, the forbidden centerline field is

```text
F = union over all i,j of (K_type(i,j) + c(i,j)) ⊕ B(8.5)
```

Noppen bodies outside the room are instantiated only when their expanded body can intersect the room bounds. Bodies are intersected with the physical room only for rendering; collision checks use their complete expanded geometry so a cut nopp at a boundary cannot create fictitious pipe space.

## 6. Allowed centerline domain

For configured wall clearance `w`, the wall-safe domain is

```text
W = P ⊖ B(w)
```

and the noppen-safe centerline domain is

```text
A = W \ F.
```

Every accepted primitive must lie completely in `A`. Endpoint-only and sampled containment are insufficient. Line/arc versus polygon and line/arc versus circular replacement-body checks are analytic and conservative.

The pipe remains on the noppen plate throughout this milestone. Smooth distributor plates, clips, and free routing outside the noppen field are not modeled.

## 7. Directions, pose anchors, and graph

Allowed straight headings are exactly

```text
H = {0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°}.
```

Diagonal routing is mandatory. A straight primitive with any other heading is rejected.

A pose anchor is `(point, heading, phase_class)`. The profile stores a finite set of anchor phase classes inside the 150 × 150 mm fundamental cell. Translating those classes by `(150*i, 150*j)` creates all graph nodes. Template endpoints may introduce additional phase classes; anchors are not restricted to nopp centers or one simple integer lattice.

The embedded graph contains:

- a node for each transformed anchor pose inside the bounded room work area;
- a directed edge for each transformed motion template whose complete pipe geometry lies in `A`;
- exact canonical `Line | Arc` geometry, length, occupied fundamental cells, source template, and transformation on every edge;
- stable integer identifiers ordered by cell, phase class, heading, and template identifier.

The graph generator is not trusted to establish validity. It emits edge candidates; `PlateValidator` certifies accepted edges independently.

## 8. Motion-template catalogue

Templates are immutable data in the selected `PlateProfile`. A template contains exact endpoint poses, canonical primitives, required clear neighboring cells, and permitted rotations/reflections.

The initial catalogue contains:

1. straight travel in all eight headings;
2. 45-degree tangential turns;
3. 90-degree broad tangential turns;
4. 135-degree broad tangential turns;
5. orthogonal and diagonal S-shaped lane changes;
6. broad 180-degree reversal;
7. laterally displaced teardrop reversal corresponding to the permitted handbook example.

All joints are G1-continuous. Every arc radius is at least 80 mm. When a tangent construction does not end at an existing phase class, its exact endpoint becomes a profile anchor phase class. This avoids moving geometry to a nearby grid point after construction.

The following are prohibited profile fixtures:

- the tight 90-degree bend between adjacent noppen shown as impermissible;
- the tight U-turn around one nopp shown as impermissible;
- any straight heading outside `H`;
- any template requiring deformation after placement;
- any transformed template that intersects an expanded nopp or leaves `W`.

Templates may be designed from tangential line/arc formulae, but runtime graph construction never solves an unconstrained free-form routing problem.

## 9. Components

### 9.1 `PlateProfile`

Owns profile identity, all dimensions, motif classification, conservative bodies, anchor phase classes, motion templates, and profile version.

### 9.2 `PlateTransform`

Converts plate-local points, vectors, headings, cells, and primitives to and from world coordinates. It owns connection-edge alignment and phase canonicalization.

### 9.3 `PlateInstance`

Lazily enumerates only motif cells, noppen bodies, and pose anchors whose conservative bounds touch the finite room work area.

### 9.4 `EmbeddedPoseGraph`

Instantiates transformed template edges and records accepted and rejected edge candidates in deterministic order.

### 9.5 `PlateValidator`

Independently validates profile definitions and embedded edges. It must verify:

- finite canonical primitives;
- exact endpoint poses;
- position and tangent continuity;
- minimum 80 mm radius;
- straight heading membership in `H`;
- complete polygon and wall-clearance containment;
- no expanded-nopp collision;
- allowed template provenance and transformation;
- stable graph identifiers and absence of unchecked edges.

### 9.6 Debug scene

Produces renderer-neutral scene data and SVG layers for:

1. room polygon;
2. wall-safe region;
3. 75 mm raster and 150 mm cells;
4. large and small replacement bodies;
5. expanded forbidden bodies;
6. anchor poses and direction arrows;
7. accepted edges;
8. rejected edges colored by typed reason;
9. template identity and witnesses on selection.

## 10. Public milestone API

```text
buildPlateModel({
  polygon,
  connectionEdgeIndex,
  wallClearanceMm,
  phaseUMm,
  phaseVMm,
  profile: "BEKOTEC_EN_23_FI_30_16"
}) -> PlateModelResult
```

A successful `PlateModelResult` includes:

- profile name and version;
- canonical transform and phase;
- instantiated noppen bodies;
- expanded forbidden bodies;
- accepted pose nodes and graph edges;
- rejected-edge diagnostics;
- independent validation summary;
- deterministic debug-scene data.

It does not contain a heating-loop plan.

Typed failures include:

- `INVALID_POLYGON`;
- `INVALID_WALL_CLEARANCE`;
- `INVALID_PLATE_PHASE`;
- `UNKNOWN_PLATE_PROFILE`;
- `NO_USABLE_PLATE_CELL`;
- `PROFILE_CERTIFICATION_FAILED`;
- `TEMPLATE_CERTIFICATION_FAILED`;
- `SOLVER_LIMIT_EXCEEDED`.

Degenerate geometry is pruned deterministically or produces a typed error; it never panics.

## 11. Testing strategy

Development is test-driven. Required tests include:

### Profile tests

- exact 75 mm center lattice and 150 mm type-preserving period;
- checkerboard large/small classification, including negative indices;
- fixed conservative dimensions and expansion arithmetic;
- stable profile serialization and version.

### Transform tests

- connection-edge alignment;
- phase canonicalization;
- local/world round trips;
- translation, reflection, and 90-degree rotation metamorphics.

### Analytic geometry tests

- line/circle and arc/circle tangency, penetration, and separation;
- complete primitive containment in concave polygons;
- no tolerance-dependent acceptance at an expanded nopp boundary.

### Template tests

- horizontal, vertical, and 45-degree diagonal straight fixtures accepted;
- all permitted broad-turn handbook fixtures accepted;
- both impermissible tight-turn handbook fixtures rejected;
- every accepted template G1-continuous and radius-compliant;
- every symmetry copy has the same certification result.

### Embedded graph tests

- deterministic node and edge ordering;
- no accepted edge outside the independently computed domain;
- bounded enumeration for rectangle, L-, U-, and C-shaped rooms;
- robust clipping at boundaries and concave corners;
- stable rejection reasons and witnesses.

### Rendering tests

- exact SVG paths for lines and arcs;
- all diagnostic layers can be toggled independently;
- deterministic SVG snapshots for the reference rooms.

## 12. Completion criteria

This milestone is complete only when:

1. the permitted and prohibited manufacturer examples receive the expected classifications;
2. horizontal, vertical, and 45-degree diagonal routes are present and independently certified;
3. no accepted edge touches an expanded nopp body or forbidden wall region;
4. all accepted curves use canonical tangential `Line | Arc` primitives with radius at least 80 mm;
5. the debug SVG makes the periodic motif, forbidden regions, anchors, accepted edges, and rejection witnesses inspectable;
6. complete Rust, TypeScript, WASM, lint, and deterministic-output gates pass;
7. no API in this milestone can report a successful heating loop.

## 13. Explicitly deferred work

The following require a later separately reviewed design:

- optimization of plate phase;
- selection and construction of one bifilar loop on the embedded graph;
- spacing escalation across 75/150/225/300 mm;
- 100 m loop optimization;
- thermal coverage scoring;
- connection-port routing into the graph;
- explicit 1200 × 900 mm sheet layout and cut optimization;
- smooth distributor plates and clamp rails;
- integration into `verlegeplan.html`.
