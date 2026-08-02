mod distance;
mod intersection;
mod offset;
mod path;
mod polygon;
mod predicates;
mod primitive;
mod vector;

pub(crate) use distance::primitive_distance_candidates;
pub use distance::{ClosestPair, primitive_distance};
pub use intersection::{Intersection, IntersectionPoint, primitive_intersections};
pub use offset::{AllowedRegion, QuantizedPoint, erode_for_centerline};
pub use path::{CanonicalPath, PathError, canonicalize_path};
pub use polygon::{PointClassification, Polygon, Winding};
pub use predicates::ParameterRange;
pub use primitive::Aabb;
pub use vector::Vec2;

pub(crate) const POSITION_TOLERANCE_MM: f64 = 1e-6;
pub(crate) const G1_TOLERANCE: f64 = 1e-7;
pub(crate) const ANGLE_TOLERANCE_RAD: f64 = 1e-12;
