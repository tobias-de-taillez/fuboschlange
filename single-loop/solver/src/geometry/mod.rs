mod distance;
mod intersection;
mod path;
mod predicates;
mod primitive;
mod vector;

pub use distance::{primitive_distance, ClosestPair};
pub use intersection::{primitive_intersections, Intersection, IntersectionPoint};
pub use path::{canonicalize_path, CanonicalPath, PathError};
pub use predicates::ParameterRange;
pub use primitive::Aabb;
pub use vector::Vec2;

pub(crate) const POSITION_TOLERANCE_MM: f64 = 1e-6;
pub(crate) const G1_TOLERANCE: f64 = 1e-7;
pub(crate) const ANGLE_TOLERANCE_RAD: f64 = 1e-12;
