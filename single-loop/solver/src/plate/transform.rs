use crate::geometry::Vec2;
use crate::model::{PathPrimitive, Point};

const FRAME_TOLERANCE_MM: f64 = 1e-12;
const PHASE_PERIOD_MM: f64 = 75.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlateTransformError {
    NonFiniteInput,
    DegenerateEdge,
    AmbiguousInwardSide,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlateTransform {
    edge_origin: Point,
    origin: Point,
    u: Vec2,
    v: Vec2,
    phase_u_mm: f64,
    phase_v_mm: f64,
}

impl PlateTransform {
    pub fn from_edge(
        edge_start: Point,
        edge_end: Point,
        inward_point: Point,
        phase_u_mm: f64,
        phase_v_mm: f64,
    ) -> Result<Self, PlateTransformError> {
        if !point_is_finite(edge_start)
            || !point_is_finite(edge_end)
            || !point_is_finite(inward_point)
            || !phase_u_mm.is_finite()
            || !phase_v_mm.is_finite()
        {
            return Err(PlateTransformError::NonFiniteInput);
        }
        let edge = edge_end - edge_start;
        let u = edge
            .normalized()
            .ok_or(PlateTransformError::DegenerateEdge)?;
        let left = u.perp_ccw();
        let side = (inward_point - edge_start).dot(left);
        if side.abs() <= FRAME_TOLERANCE_MM {
            return Err(PlateTransformError::AmbiguousInwardSide);
        }
        let v = if side > 0.0 { left } else { -left };
        let phase_u_mm = phase_u_mm.rem_euclid(PHASE_PERIOD_MM);
        let phase_v_mm = phase_v_mm.rem_euclid(PHASE_PERIOD_MM);
        let origin = edge_start + u * phase_u_mm + v * phase_v_mm;
        Ok(Self {
            edge_origin: edge_start,
            origin,
            u,
            v,
            phase_u_mm,
            phase_v_mm,
        })
    }

    pub const fn u(&self) -> Vec2 {
        self.u
    }

    pub const fn v(&self) -> Vec2 {
        self.v
    }

    pub const fn phase_u_mm(&self) -> f64 {
        self.phase_u_mm
    }

    pub const fn phase_v_mm(&self) -> f64 {
        self.phase_v_mm
    }

    pub const fn edge_origin(&self) -> Point {
        self.edge_origin
    }

    pub const fn origin(&self) -> Point {
        self.origin
    }

    pub fn to_world(&self, local: Point) -> Point {
        self.origin + self.u * local.x + self.v * local.y
    }

    pub fn to_local(&self, world: Point) -> Point {
        let offset = world - self.origin;
        Point::new(offset.dot(self.u), offset.dot(self.v))
    }

    pub fn vector_to_world(&self, local: Vec2) -> Vec2 {
        self.u * local.x + self.v * local.y
    }

    pub fn primitive_to_world(&self, primitive: &PathPrimitive) -> PathPrimitive {
        self.transform_primitive(primitive, true)
    }

    pub fn primitive_to_local(&self, primitive: &PathPrimitive) -> PathPrimitive {
        self.transform_primitive(primitive, false)
    }

    fn transform_primitive(&self, primitive: &PathPrimitive, to_world: bool) -> PathPrimitive {
        let point = |value| {
            if to_world {
                self.to_world(value)
            } else {
                self.to_local(value)
            }
        };
        let orientation = self.u.x * self.v.y - self.u.y * self.v.x;
        match primitive {
            PathPrimitive::Line { start, end } => PathPrimitive::Line {
                start: point(*start),
                end: point(*end),
            },
            PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            } => PathPrimitive::Arc {
                start: point(*start),
                end: point(*end),
                center: point(*center),
                radius_mm: *radius_mm,
                sweep_rad: if orientation < 0.0 {
                    -*sweep_rad
                } else {
                    *sweep_rad
                },
            },
        }
    }
}

fn point_is_finite(point: Point) -> bool {
    point.x.is_finite() && point.y.is_finite()
}
