use crate::model::{PathPrimitive, Point};
use crate::plate::validator::validate_template_primitive_shape;
use crate::plate::{
    Heading8, LocalBounds, PlateProfile, PlateValidationFailure, PlateValidationFailureCode,
    motif_indices_for_bounds, nopp_type, primitive_circle_clearance,
};
use serde::{Deserialize, Serialize};
use std::f64::consts::{FRAC_PI_2, FRAC_PI_4, PI};

const POSITION_TOLERANCE_MM: f64 = 1e-6;
const TANGENT_TOLERANCE: f64 = 1e-7;
const TEMPLATE_NOPP_LIMIT: usize = 10_000;

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

impl PlateProfile {
    pub fn templates(&self) -> Vec<MotionTemplate> {
        let mut templates = vec![
            MotionTemplate::new(
                TemplateId::Straight0,
                LocalPose::new(Point::new(-150.0, 37.5), Heading8::Deg0),
                LocalPose::new(Point::new(300.0, 37.5), Heading8::Deg0),
                vec![PathPrimitive::Line {
                    start: Point::new(-150.0, 37.5),
                    end: Point::new(300.0, 37.5),
                }],
            ),
            MotionTemplate::new(
                TemplateId::Straight45,
                LocalPose::new(Point::new(-150.0, -112.5), Heading8::Deg45),
                LocalPose::new(Point::new(150.0, 187.5), Heading8::Deg45),
                vec![PathPrimitive::Line {
                    start: Point::new(-150.0, -112.5),
                    end: Point::new(150.0, 187.5),
                }],
            ),
            arc_template(
                TemplateId::BroadTurn45,
                Point::new(55.5, 43.0),
                -FRAC_PI_2,
                FRAC_PI_4,
                Heading8::Deg0,
                Heading8::Deg45,
            ),
            arc_template(
                TemplateId::BroadTurn90,
                Point::new(37.5, 37.5),
                -FRAC_PI_2,
                FRAC_PI_2,
                Heading8::Deg0,
                Heading8::Deg90,
            ),
            arc_template(
                TemplateId::BroadTurn135,
                Point::new(43.5, 42.0),
                -FRAC_PI_2,
                3.0 * FRAC_PI_4,
                Heading8::Deg0,
                Heading8::Deg135,
            ),
            arc_template(
                TemplateId::BroadReverse180,
                Point::new(43.5, 42.0),
                -FRAC_PI_2,
                PI,
                Heading8::Deg0,
                Heading8::Deg180,
            ),
            teardrop_reference_template(),
        ];
        templates.sort_by_key(|template| template.id);
        templates
    }
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
            if clearance <= POSITION_TOLERANCE_MM {
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

fn arc_template(
    id: TemplateId,
    center: Point,
    start_angle: f64,
    sweep_rad: f64,
    start_heading: Heading8,
    end_heading: Heading8,
) -> MotionTemplate {
    let start = circle_point(center, 80.0, start_angle);
    let end = circle_point(center, 80.0, start_angle + sweep_rad);
    MotionTemplate::new(
        id,
        LocalPose::new(start, start_heading),
        LocalPose::new(end, end_heading),
        vec![PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm: 80.0,
            sweep_rad,
        }],
    )
}

fn teardrop_reference_template() -> MotionTemplate {
    let center = Point::new(43.5, 42.0);
    let angles = [-FRAC_PI_2, -FRAC_PI_4, FRAC_PI_4, FRAC_PI_2];
    let primitives = angles
        .windows(2)
        .map(|pair| PathPrimitive::Arc {
            start: circle_point(center, 80.0, pair[0]),
            end: circle_point(center, 80.0, pair[1]),
            center,
            radius_mm: 80.0,
            sweep_rad: pair[1] - pair[0],
        })
        .collect::<Vec<_>>();
    MotionTemplate::new(
        TemplateId::TeardropReverse,
        LocalPose::new(primitives[0].point_at(0.0), Heading8::Deg0),
        LocalPose::new(primitives.last().unwrap().point_at(1.0), Heading8::Deg180),
        primitives,
    )
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
