use crate::geometry::Vec2;
use crate::model::{PathPrimitive, Point};
use crate::plate::validator::validate_template_primitive_shape;
use crate::plate::{
    Heading8, LocalBounds, PlateProfile, PlateValidationFailure, PlateValidationFailureCode,
    motif_indices_for_bounds, nopp_type, primitive_circle_clearance,
};
use serde::{Deserialize, Serialize};
use std::f64::consts::{FRAC_PI_2, FRAC_PI_4, PI, SQRT_2};

const POSITION_TOLERANCE_MM: f64 = 1e-6;
const TANGENT_TOLERANCE: f64 = 1e-7;
const TEMPLATE_NOPP_LIMIT: usize = 10_000;

/// Every catalogue arc bends at exactly the profile floor (5 x 16 mm pipe).
const TURN_RADIUS_MM: f64 = 80.0;
/// Channels run midway between nopp rows: `CHANNEL_OFFSET_MM + 75k`. Mirrors
/// `PlateProfile::pitch_mm / 2`, spelled out here because the whole lattice
/// derivation below is written in terms of it.
const CHANNEL_OFFSET_MM: f64 = 37.5;
/// The translation quantum of `TemplateTransform` (`PlateProfile::period_mm`),
/// and therefore the spacing of anchor nodes along a channel.
const PERIOD_MM: f64 = 150.0;
/// A 180-degree reverse across two channels 150 mm apart cannot be a semicircle
/// (that would need radius 75 mm). The teardrop dives out of the entry channel
/// on a short co-radial arc first, so the big arc spans 2 * 80 mm of lateral
/// travel while the net channel offset stays 150 mm: cos = 150 / (2 * 80).
const TEARDROP_COS: f64 = 150.0 / (2.0 * TURN_RADIUS_MM);

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TemplateId {
    Straight0,
    Straight45,
    BroadTurn45,
    BroadTurn90,
    BroadTurn135,
    BroadReverse180,
    TeardropReverse,
    HandbookRejectedTight90,
    HandbookRejectedTightU,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPose {
    pub point: Point,
    pub heading: Heading8,
}

impl LocalPose {
    pub const fn new(point: Point, heading: Heading8) -> Self {
        Self { point, heading }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionTemplate {
    pub id: TemplateId,
    pub start: LocalPose,
    pub end: LocalPose,
    pub primitives: Vec<PathPrimitive>,
}

impl MotionTemplate {
    pub fn new(
        id: TemplateId,
        start: LocalPose,
        end: LocalPose,
        primitives: Vec<PathPrimitive>,
    ) -> Self {
        Self {
            id,
            start,
            end,
            primitives,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateTransform {
    pub quarter_turns: u8,
    pub reflected: bool,
    pub period_i: i64,
    pub period_j: i64,
}

impl TemplateTransform {
    pub const fn new(
        quarter_turns: u8,
        reflected: bool,
        period_i: i64,
        period_j: i64,
    ) -> Option<Self> {
        if quarter_turns < 4 {
            Some(Self {
                quarter_turns,
                reflected,
                period_i,
                period_j,
            })
        } else {
            None
        }
    }

    pub fn apply(self, template: &MotionTemplate, period_mm: f64) -> MotionTemplate {
        let transform_point = |point| self.transform_point(point, period_mm);
        let primitives = template
            .primitives
            .iter()
            .map(|primitive| match primitive {
                PathPrimitive::Line { start, end } => PathPrimitive::Line {
                    start: transform_point(*start),
                    end: transform_point(*end),
                },
                PathPrimitive::Arc {
                    start,
                    end,
                    center,
                    radius_mm,
                    sweep_rad,
                } => PathPrimitive::Arc {
                    start: transform_point(*start),
                    end: transform_point(*end),
                    center: transform_point(*center),
                    radius_mm: *radius_mm,
                    sweep_rad: if self.reflected {
                        -*sweep_rad
                    } else {
                        *sweep_rad
                    },
                },
            })
            .collect();
        MotionTemplate::new(
            template.id,
            LocalPose::new(
                transform_point(template.start.point),
                self.transform_heading(template.start.heading),
            ),
            LocalPose::new(
                transform_point(template.end.point),
                self.transform_heading(template.end.heading),
            ),
            primitives,
        )
    }

    fn transform_point(self, point: Point, period_mm: f64) -> Point {
        let mut x = if self.reflected { -point.x } else { point.x };
        let mut y = point.y;
        (x, y) = match self.quarter_turns {
            0 => (x, y),
            1 => (-y, x),
            2 => (-x, -y),
            _ => (y, -x),
        };
        Point::new(
            x + self.period_i as f64 * period_mm,
            y + self.period_j as f64 * period_mm,
        )
    }

    fn transform_heading(self, heading: Heading8) -> Heading8 {
        let reflected_octant = if self.reflected {
            (12 - heading.octant()) % 8
        } else {
            heading.octant()
        };
        Heading8::from_octant(reflected_octant + 2 * self.quarter_turns)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TemplateCertificate {
    pub min_nopp_clearance_mm: f64,
    pub min_bend_radius_mm: f64,
}

// ---------------------------------------------------------------------------
// The shared anchor lattice
//
// Channels run midway between nopp rows, i.e. along `37.5 + 75k`. Because
// `TemplateTransform` only translates by multiples of `period_mm` (150 mm),
// rotates by quarter turns and mirrors x, the reachable endpoint poses of the
// straight chains are exactly
//
//   axial      : x in 150Z, y in 37.5 + 75Z   (Deg0 / Deg180)
//                x in 37.5 + 75Z, y in 150Z   (Deg90 / Deg270)
//   diagonal   : per odd heading, two of the four residues (0, 37.5),
//                (37.5, 0), (0, 112.5), (112.5, 0) mod 150 -- Deg45 reaches
//                (0, 37.5) and (37.5, 0), Deg135 reaches (0, 37.5) and
//                (112.5, 0), and so on round the octants.
//
// Every template below starts and ends exactly on that lattice, so the embedded
// pose graph interns shared nodes and the families chain. A pure tangent arc
// between two orthogonal channels can never do this: it ends 80 mm short of the
// crossing, and 80 is not commensurate with the 75/150 raster. Lead-in and
// lead-out straights absorb precisely that offset.
// ---------------------------------------------------------------------------

impl PlateProfile {
    pub fn templates(&self) -> Vec<MotionTemplate> {
        let mut templates = vec![
            // One lattice hop along a channel: consecutive chain nodes really
            // are joined by a single edge.
            straight_template(
                TemplateId::Straight0,
                Point::new(0.0, CHANNEL_OFFSET_MM),
                Point::new(PERIOD_MM, CHANNEL_OFFSET_MM),
                Heading8::Deg0,
            ),
            straight_template(
                TemplateId::Straight45,
                Point::new(0.0, CHANNEL_OFFSET_MM),
                Point::new(PERIOD_MM, CHANNEL_OFFSET_MM + PERIOD_MM),
                Heading8::Deg45,
            ),
            broad_turn_45(),
            broad_turn_90(),
            broad_turn_135(),
            broad_reverse_180(),
            teardrop_reverse(),
        ];
        templates.sort_by_key(|template| template.id);
        templates
    }
}

/// Channel y = 112.5 to the diagonal channel y = x + 37.5.
///
/// Lead-in `155 - 80*sqrt(2)`, one 45-degree arc, lead-out `80 - 5*sqrt(2)`.
/// The alternative parity puts a large nopp 26.11 mm from the arc (0.11 mm
/// clear); this one leaves that nopp small and clears it by 7.11 mm, so the
/// binding constraint is the diagonal channel itself (0.5165 mm), exactly as
/// for `Straight45`.
fn broad_turn_45() -> MotionTemplate {
    let end = Point::new(150.0, 187.5);
    let mut path = Composite::new(Point::new(0.0, 112.5), Heading8::Deg0);
    path.line(155.0 - TURN_RADIUS_MM * SQRT_2);
    path.arc(TURN_RADIUS_MM, FRAC_PI_4);
    path.line_to(end);
    path.finish(TemplateId::BroadTurn45, end, Heading8::Deg45)
}

/// Channel y = 37.5 to the channel x = 187.5.
///
/// Lead-in 107.5, one quarter arc, lead-out 32.5. The arc passes
/// `80 - 42.5*sqrt(2)` = 19.896 mm from the nopp inside the elbow, which is why
/// the crossing parity has to leave that nopp small (forbidden radius 19.0,
/// clearance 0.896 mm) -- a large one (26.0) would collide by 6.1 mm.
fn broad_turn_90() -> MotionTemplate {
    let end = Point::new(187.5, 150.0);
    let mut path = Composite::new(Point::new(0.0, 37.5), Heading8::Deg0);
    path.line(107.5);
    path.arc(TURN_RADIUS_MM, FRAC_PI_2);
    path.line_to(end);
    path.finish(TemplateId::BroadTurn90, end, Heading8::Deg90)
}

/// Channel y = 37.5 to the anti-diagonal channel x + y = 337.5: lead-in
/// `220 - 80*sqrt(2)`, one 135-degree arc, lead-out `70*sqrt(2) - 80`.
///
/// This one lives on the laying tolerance, deliberately and with the numbers on
/// the table. Whichever channels a 135-degree arc joins, its centre is pinned to
/// `y = 37.5 + R` and `x = -R*(1+sqrt(2))` (mod 75) -- there is no free phase
/// left, only the radius and the two checkerboard parities. That puts two nopps
/// in the same column on adjacent rows, hence necessarily opposite colours, at
/// `dx = 80*sqrt(2) - 70` from the centre: one at `dy = -42.5` (19.444 mm from
/// an R = 80 arc) and one at `dy = +32.5` (25.990 mm). The parity chosen here
/// leaves the near one small (19.0, so +0.444 mm) and the far one large (26.0,
/// so **-0.0098 mm**). The opposite parity is far worse (-6.56 mm), and no
/// radius rescues it: swept over R = 80..400 mm in 0.05 mm steps across all four
/// parities, -0.0098 mm is the best clearance that exists.
///
/// 9.8 micrometres of overlap with a disc that already carries an 8 mm pipe
/// radius plus a 0.5 mm calibration allowance is inside laying tolerance, so
/// `laying_tolerance_mm` admits it (human decision, 2026-07-31) rather than
/// forcing a 225-degree reflex detour that costs 77 mm of extra pipe and sweeps
/// a 160 mm circle. `certify_template` reports the -0.0098 mm as-is.
fn broad_turn_135() -> MotionTemplate {
    let end = Point::new(150.0, 187.5);
    let mut path = Composite::new(Point::new(0.0, CHANNEL_OFFSET_MM), Heading8::Deg0);
    path.line(220.0 - TURN_RADIUS_MM * SQRT_2);
    path.arc(TURN_RADIUS_MM, 3.0 * FRAC_PI_4);
    path.line_to(end);
    path.finish(TemplateId::BroadTurn135, end, Heading8::Deg135)
}

/// Reverse across three channel pitches (225 mm), as two quarter arcs joined by
/// a 65 mm run along the channel x = 112.5.
///
/// A single semicircle is not an option: tangency to two channels forces its
/// diameter onto the 75 mm raster, and every raster diameter at or above the
/// 160 mm bend-radius floor collides. Swept over 2R = 225..600 mm, both channel
/// parities and the free phase along the channel in 0.001 mm steps, the best
/// clearance anywhere is -0.25 mm (at 2R = 225). Both
/// elbows here need the same crossing parity, which is why the lead lengths are
/// symmetric. Its intermediate tangent points are deliberately not lattice
/// nodes, so this is not two chained `BroadTurn90` edges.
fn broad_reverse_180() -> MotionTemplate {
    let end = Point::new(0.0, 337.5);
    let mut path = Composite::new(Point::new(0.0, 112.5), Heading8::Deg0);
    path.line(32.5);
    path.arc(TURN_RADIUS_MM, FRAC_PI_2);
    path.line(65.0);
    path.arc(TURN_RADIUS_MM, FRAC_PI_2);
    path.line_to(end);
    path.finish(TemplateId::BroadReverse180, end, Heading8::Deg180)
}

/// Reverse across a single 150 mm channel pitch -- the narrowest reverse the
/// 80 mm bend radius allows, hence the teardrop: a short co-radial dive out of
/// the entry channel, then a 180-degree-plus arc back onto the exit channel.
/// Its big arc is centred on the channel x = 112.5, which is what keeps it off
/// the nopps (4.32 mm clear).
fn teardrop_reverse() -> MotionTemplate {
    let alpha = TEARDROP_COS.acos();
    let end = Point::new(0.0, 262.5);
    let mut path = Composite::new(Point::new(0.0, 112.5), Heading8::Deg0);
    path.line(112.5 - 2.0 * TURN_RADIUS_MM * alpha.sin());
    path.arc(TURN_RADIUS_MM, -alpha);
    path.arc(TURN_RADIUS_MM, PI + alpha);
    path.line_to(end);
    path.finish(TemplateId::TeardropReverse, end, Heading8::Deg180)
}

/// Traces a template forward from an exact start pose. Straights advance along
/// the current heading; arcs are placed tangentially, so every joint is G1 by
/// construction rather than by assertion.
struct Composite {
    start: Point,
    start_heading: Heading8,
    point: Point,
    direction: Vec2,
    primitives: Vec<PathPrimitive>,
}

impl Composite {
    fn new(start: Point, heading: Heading8) -> Self {
        Self {
            start,
            start_heading: heading,
            point: start,
            direction: heading.direction(),
            primitives: Vec::new(),
        }
    }

    fn line(&mut self, length_mm: f64) {
        let end = self.point + self.direction * length_mm;
        self.line_to(end);
    }

    /// Final straight onto an exact lattice point, so the endpoint pose is a
    /// literal rather than an accumulation of arc arithmetic.
    fn line_to(&mut self, end: Point) {
        self.primitives.push(PathPrimitive::Line {
            start: self.point,
            end,
        });
        self.point = end;
    }

    fn arc(&mut self, radius_mm: f64, sweep_rad: f64) {
        let normal = self.direction.perp_ccw() * sweep_rad.signum();
        let center = self.point + normal * radius_mm;
        let start_angle = (self.point.y - center.y).atan2(self.point.x - center.x);
        let end = circle_point(center, radius_mm, start_angle + sweep_rad);
        self.primitives.push(PathPrimitive::Arc {
            start: self.point,
            end,
            center,
            radius_mm,
            sweep_rad,
        });
        self.point = end;
        let (sin, cos) = sweep_rad.sin_cos();
        self.direction = Vec2::new(
            self.direction.x * cos - self.direction.y * sin,
            self.direction.x * sin + self.direction.y * cos,
        );
    }

    fn finish(self, id: TemplateId, end: Point, end_heading: Heading8) -> MotionTemplate {
        MotionTemplate::new(
            id,
            LocalPose::new(self.start, self.start_heading),
            LocalPose::new(end, end_heading),
            self.primitives,
        )
    }
}

fn straight_template(
    id: TemplateId,
    start: Point,
    end: Point,
    heading: Heading8,
) -> MotionTemplate {
    MotionTemplate::new(
        id,
        LocalPose::new(start, heading),
        LocalPose::new(end, heading),
        vec![PathPrimitive::Line { start, end }],
    )
}

pub fn certify_template(
    template: &MotionTemplate,
    profile: &PlateProfile,
) -> Result<TemplateCertificate, PlateValidationFailure> {
    let first = template
        .primitives
        .first()
        .ok_or_else(|| PlateValidationFailure::new(PlateValidationFailureCode::InvalidPrimitive))?;
    let last = template.primitives.last().unwrap();
    if (first.point_at(0.0) - template.start.point).norm() > POSITION_TOLERANCE_MM
        || (last.point_at(1.0) - template.end.point).norm() > POSITION_TOLERANCE_MM
        || (first.start_tangent() - template.start.heading.direction()).norm() > TANGENT_TOLERANCE
        || (last.end_tangent() - template.end.heading.direction()).norm() > TANGENT_TOLERANCE
    {
        return Err(PlateValidationFailure::new(
            PlateValidationFailureCode::InvalidPrimitive,
        ));
    }
    for pair in template.primitives.windows(2) {
        if (pair[0].point_at(1.0) - pair[1].point_at(0.0)).norm() > POSITION_TOLERANCE_MM {
            return Err(PlateValidationFailure::new(
                PlateValidationFailureCode::PositionDiscontinuity,
            ));
        }
        if (pair[0].end_tangent() - pair[1].start_tangent()).norm() > TANGENT_TOLERANCE {
            return Err(PlateValidationFailure::new(
                PlateValidationFailureCode::TangentDiscontinuity,
            ));
        }
    }

    let bounds = template_bounds(template)?;
    let indices = motif_indices_for_bounds(
        bounds,
        profile.pitch_mm,
        profile.forbidden_radius(crate::plate::NoppType::Large),
        TEMPLATE_NOPP_LIMIT,
    )
    .map_err(|_| PlateValidationFailure::new(PlateValidationFailureCode::InvalidPrimitive))?;
    let mut min_nopp_clearance_mm = f64::INFINITY;
    let mut min_bend_radius_mm = f64::INFINITY;
    for primitive in &template.primitives {
        validate_template_primitive_shape(primitive, profile)?;
        if let PathPrimitive::Arc { radius_mm, .. } = primitive {
            min_bend_radius_mm = min_bend_radius_mm.min(*radius_mm);
        }
        for index in &indices {
            let center = Point::new(
                index.i as f64 * profile.pitch_mm,
                index.j as f64 * profile.pitch_mm,
            );
            let clearance = primitive_circle_clearance(
                primitive,
                center,
                profile.forbidden_radius(nopp_type(*index)),
            );
            // Accept down to `-laying_tolerance_mm`, not down to zero: a
            // sub-tenth-of-a-millimetre bite out of the forbidden disc is inside
            // real-world laying tolerance. `min_nopp_clearance_mm` keeps the
            // true signed value either way, so a template living on that
            // allowance is visible in its certificate rather than hidden by it.
            if clearance < -profile.laying_tolerance_mm {
                return Err(PlateValidationFailure {
                    code: PlateValidationFailureCode::NoppCollision,
                    witness: Some(center),
                    nopp_type: Some(nopp_type(*index)),
                });
            }
            min_nopp_clearance_mm = min_nopp_clearance_mm.min(clearance);
        }
    }
    Ok(TemplateCertificate {
        min_nopp_clearance_mm,
        min_bend_radius_mm,
    })
}

fn template_bounds(template: &MotionTemplate) -> Result<LocalBounds, PlateValidationFailure> {
    let mut iterator = template.primitives.iter();
    let first = iterator
        .next()
        .ok_or_else(|| PlateValidationFailure::new(PlateValidationFailureCode::InvalidPrimitive))?;
    let mut bounds = first.bounds();
    for primitive in iterator {
        let primitive_bounds = primitive.bounds();
        bounds.include_point(primitive_bounds.min);
        bounds.include_point(primitive_bounds.max);
    }
    LocalBounds::new(bounds.min, bounds.max)
        .ok_or_else(|| PlateValidationFailure::new(PlateValidationFailureCode::InvalidPrimitive))
}

fn circle_point(center: Point, radius_mm: f64, angle: f64) -> Point {
    Point::new(
        center.x + radius_mm * angle.cos(),
        center.y + radius_mm * angle.sin(),
    )
}
