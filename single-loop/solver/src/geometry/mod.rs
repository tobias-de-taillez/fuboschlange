mod path;
mod primitive;
mod vector;

pub use path::{CanonicalPath, PathError, canonicalize_path};
pub use primitive::Aabb;
pub use vector::Vec2;

pub(crate) const POSITION_TOLERANCE_MM: f64 = 1e-6;
pub(crate) const G1_TOLERANCE: f64 = 1e-7;
pub(crate) const ANGLE_TOLERANCE_RAD: f64 = 1e-12;
