use crate::geometry::Polygon;
use crate::model::Point;
use crate::plate::{
    LocalBounds, MotifError, Nopp, PlateProfile, PlateTransform, motif_indices_for_bounds,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlateInstanceErrorCode {
    InvalidBounds,
    SolverLimitExceeded,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PlateInstanceError {
    pub code: PlateInstanceErrorCode,
    pub limit: usize,
}

#[derive(Clone, Debug)]
pub struct PlateInstance {
    pub polygon: Polygon,
    pub transform: PlateTransform,
    pub profile: PlateProfile,
    pub local_bounds: LocalBounds,
    pub nopps: Vec<Nopp>,
}

impl PlateInstance {
    pub fn new(
        polygon: Polygon,
        transform: PlateTransform,
        profile: PlateProfile,
        max_nopps: usize,
    ) -> Result<Self, PlateInstanceError> {
        let local_bounds =
            polygon_local_bounds(&polygon, &transform).ok_or(PlateInstanceError {
                code: PlateInstanceErrorCode::InvalidBounds,
                limit: max_nopps,
            })?;
        let indices = motif_indices_for_bounds(
            local_bounds,
            profile.pitch_mm,
            profile.forbidden_radius(crate::plate::NoppType::Large),
            max_nopps,
        )
        .map_err(|error| PlateInstanceError {
            code: match error {
                MotifError::LimitExceeded => PlateInstanceErrorCode::SolverLimitExceeded,
                MotifError::InvalidBounds | MotifError::IndexOutOfRange => {
                    PlateInstanceErrorCode::InvalidBounds
                }
            },
            limit: max_nopps,
        })?;
        let nopps = indices
            .into_iter()
            .map(|index| Nopp::at_index(index, &profile, &transform))
            .collect();
        Ok(Self {
            polygon,
            transform,
            profile,
            local_bounds,
            nopps,
        })
    }
}

fn polygon_local_bounds(polygon: &Polygon, transform: &PlateTransform) -> Option<LocalBounds> {
    let mut points = polygon
        .original_vertices()
        .iter()
        .map(|point| transform.to_local(*point));
    let first = points.next()?;
    let mut min = first;
    let mut max = first;
    for point in points {
        min.x = min.x.min(point.x);
        min.y = min.y.min(point.y);
        max.x = max.x.max(point.x);
        max.y = max.y.max(point.y);
    }
    LocalBounds::new(Point::new(min.x, min.y), Point::new(max.x, max.y))
}
