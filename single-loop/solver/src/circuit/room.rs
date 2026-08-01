//! From a measured room to rectangles a Schnecke can be laid in.
//!
//! A surveyed outline is not the idealised polygon the rest of this crate
//! wants. `raumaufmass` exports points and walls with a residual of roughly a
//! centimetre, so a wall meant to be square comes back at 0.3° and a room
//! meant to be rectilinear is neither rectilinear nor, strictly, closed.
//! [`rectify`] turns that into an axis-parallel outline;
//! [`slab_fields`] cuts the result into the rectangles
//! [`super::build_schnecke`] can work in.
//!
//! ## Inscribed, never inflated
//!
//! Every wall is moved to an axis-parallel line that lies **inside** the
//! measured outline. A wall that is off-axis by noise barely moves; one that
//! is genuinely slanted gives up a wedge. That direction is not arbitrary: pipe
//! outside the room is a defect, a cold strip along a wall is a drawback.
//!
//! On the room this was built for that costs 1.38 m² of 29.44 — **4.7 %** —
//! and it is reported, not hidden. Two things account for it: the one
//! genuinely slanted wall (3.0°, 160 mm over 3 m), and the 357 mm notch, whose
//! four short walls are dropped outright. The notch could not be heated
//! anyway: 207 mm of usable width after wall clearance, against 150 mm for a
//! lane pair plus the room a turn needs.

use crate::circuit::fields::Field;
use crate::circuit::types::{LoopError, LoopErrorCode, RectMm};
use crate::model::Point;

/// A wall shorter than this is a survey artefact — a chamfer, a pillar face,
/// a niche — not a room boundary a Schnecke can use. It is absorbed into its
/// neighbours rather than becoming its own axis-parallel wall.
///
/// Sized from what a lane pair needs: at the tightest pipe spacing a field
/// must hold two runs plus wall clearance on both sides, so anything under
/// half a metre cannot be heated on its own.
const MIN_WALL_MM: f64 = 500.0;

/// One axis-parallel wall of a rectified outline.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Axis {
    /// Constant `y`.
    Horizontal,
    /// Constant `x`.
    Vertical,
}

/// The rectified outline: an axis-parallel closed ring, counter-clockwise,
/// inscribed in the measured one.
#[derive(Clone, Debug, PartialEq)]
pub struct RectifiedRoom {
    pub vertices: Vec<Point>,
    /// Area given up to rectification, in square millimetres. Reported rather
    /// than hidden: it is the user's wall that moved.
    pub inscribed_loss_mm2: f64,
    /// Walls dropped as too short to bound a heatable field.
    pub dropped_walls: usize,
}

/// Rectifies a measured ring into an axis-parallel outline inscribed in it.
///
/// `ring` must be a simple closed polygon in survey coordinates, either
/// winding. Returns the outline plus what rectifying it cost.
pub fn rectify(ring: &[Point]) -> Result<RectifiedRoom, LoopError> {
    if ring.len() < 4 {
        return Err(reject("a room needs at least four corners"));
    }
    let measured_area = signed_area(ring).abs();
    if measured_area < 1e5 {
        return Err(reject("the outline encloses practically no area"));
    }
    // Work counter-clockwise so "inside" is unambiguous below.
    let mut ring = ring.to_vec();
    if signed_area(&ring) < 0.0 {
        ring.reverse();
    }

    // Long walls become axis-parallel lines; short ones are dropped and their
    // neighbours meet instead.
    let mut walls: Vec<(Axis, Point, Point)> = Vec::new();
    let mut dropped = 0usize;
    for index in 0..ring.len() {
        let from = ring[index];
        let to = ring[(index + 1) % ring.len()];
        let (dx, dy) = (to.x - from.x, to.y - from.y);
        if dx.hypot(dy) < MIN_WALL_MM {
            dropped += 1;
            continue;
        }
        let axis = if dx.abs() >= dy.abs() {
            Axis::Horizontal
        } else {
            Axis::Vertical
        };
        walls.push((axis, from, to));
    }
    if walls.len() < 4 {
        return Err(reject(
            "fewer than four walls survive; this outline is not a room",
        ));
    }

    // Each wall's line is placed at the coordinate that keeps it inside: for a
    // wall whose interior lies above it, the higher of its two ends, and so on.
    // Which side the interior is on follows from the counter-clockwise
    // winding — walking counter-clockwise, the interior is always on the left.
    let mut lines: Vec<(Axis, f64)> = Vec::with_capacity(walls.len());
    for (axis, from, to) in &walls {
        let value = match axis {
            // Running +x, the interior is above, so the wall moves up to the
            // higher end; running -x it moves down.
            Axis::Horizontal => {
                if to.x > from.x {
                    from.y.max(to.y)
                } else {
                    from.y.min(to.y)
                }
            }
            // Running +y, the interior is to the left (smaller x).
            Axis::Vertical => {
                if to.y > from.y {
                    from.x.min(to.x)
                } else {
                    from.x.max(to.x)
                }
            }
        };
        lines.push((*axis, value));
    }

    // Consecutive walls of the same axis cannot make a corner: keep the one
    // that is further in, so the result stays inscribed.
    let mut kept: Vec<(Axis, f64)> = Vec::with_capacity(lines.len());
    for (axis, value) in lines {
        match kept.last_mut() {
            Some((previous_axis, previous)) if *previous_axis == axis => {
                let inner = inner_of(axis, *previous, value, &ring);
                *previous = inner;
            }
            _ => kept.push((axis, value)),
        }
    }
    if kept.len() >= 2 && kept[0].0 == kept[kept.len() - 1].0 {
        let (axis, last) = kept.pop().expect("checked length");
        let inner = inner_of(axis, kept[0].1, last, &ring);
        kept[0].1 = inner;
    }
    if kept.len() < 4 {
        return Err(reject(
            "the rectified outline has fewer than four distinct walls",
        ));
    }

    // Corners are where consecutive walls' lines meet.
    let mut vertices = Vec::with_capacity(kept.len());
    for index in 0..kept.len() {
        let (axis, value) = kept[index];
        let (next_axis, next_value) = kept[(index + 1) % kept.len()];
        if axis == next_axis {
            return Err(reject("two walls of the same axis meet at a corner"));
        }
        vertices.push(match axis {
            Axis::Horizontal => Point::new(next_value, value),
            Axis::Vertical => Point::new(value, next_value),
        });
    }

    let area = signed_area(&vertices).abs();
    Ok(RectifiedRoom {
        vertices,
        inscribed_loss_mm2: (measured_area - area).max(0.0),
        dropped_walls: dropped,
    })
}

/// Whichever of two parallel wall lines lies further inside the ring.
fn inner_of(axis: Axis, left: f64, right: f64, ring: &[Point]) -> f64 {
    let center = centroid(ring);
    let toward = |value: f64| match axis {
        Axis::Horizontal => (value - center.y).abs(),
        Axis::Vertical => (value - center.x).abs(),
    };
    if toward(left) <= toward(right) {
        left
    } else {
        right
    }
}

fn centroid(ring: &[Point]) -> Point {
    let count = ring.len() as f64;
    Point::new(
        ring.iter().map(|point| point.x).sum::<f64>() / count,
        ring.iter().map(|point| point.y).sum::<f64>() / count,
    )
}

fn signed_area(ring: &[Point]) -> f64 {
    let mut sum = 0.0;
    for index in 0..ring.len() {
        let from = ring[index];
        let to = ring[(index + 1) % ring.len()];
        sum += from.x * to.y - to.x * from.y;
    }
    sum / 2.0
}

fn reject(message: impl Into<String>) -> LoopError {
    LoopError {
        code: LoopErrorCode::NoSolutionGeometry,
        message: message.into(),
        journal_tail: Vec::new(),
    }
}

/// Cuts a rectified outline into horizontal slabs of rectangles.
///
/// Between two consecutive distinct `y` values of the outline the room's cross
/// section is constant, so each slab is a union of rectangles; on a rectilinear
/// outline each slab is exactly one run of them. This is deliberately simpler
/// than `fields::decompose_fields`' guillotine search: the multi-circuit split
/// wants *many* small rectangles it can regroup, not the fewest large ones.
///
/// `cuts_y` adds further horizontal cuts — that is the knob the circuit
/// balancer turns.
pub fn slab_fields(room: &RectifiedRoom, cuts_y: &[f64]) -> Vec<Field> {
    let mut rows: Vec<f64> = room.vertices.iter().map(|vertex| vertex.y).collect();
    rows.extend_from_slice(cuts_y);
    rows.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    rows.dedup_by(|left, right| (*left - *right).abs() < 1.0);

    let mut fields = Vec::new();
    for pair in rows.windows(2) {
        let (low, high) = (pair[0], pair[1]);
        if high - low < 1.0 {
            continue;
        }
        // The room's cross section is constant across the slab, so one probe
        // at its middle finds every span the slab contains.
        for (left, right) in spans_at(room, (low + high) / 2.0) {
            fields.push(Field {
                id: fields.len() as u32,
                rect_local: RectMm {
                    min: Point::new(left, low),
                    max: Point::new(right, high),
                },
            });
        }
    }
    fields
}

/// The `x` intervals the outline covers at height `y`, left to right.
fn spans_at(room: &RectifiedRoom, y: f64) -> Vec<(f64, f64)> {
    let mut crossings: Vec<f64> = Vec::new();
    let vertices = &room.vertices;
    for index in 0..vertices.len() {
        let from = vertices[index];
        let to = vertices[(index + 1) % vertices.len()];
        if (from.y - to.y).abs() < 1e-9 {
            continue;
        }
        let (low, high) = (from.y.min(to.y), from.y.max(to.y));
        if y > low && y < high {
            crossings.push(from.x);
        }
    }
    crossings.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    crossings
        .chunks(2)
        .filter(|pair| pair.len() == 2 && pair[1] - pair[0] > 1.0)
        .map(|pair| (pair[0], pair[1]))
        .collect()
}
