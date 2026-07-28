use crate::model::Point;
use crate::plate::{NoppType, PlateProfile, PlateTransform};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
pub struct NoppIndex {
    pub i: i64,
    pub j: i64,
}

impl NoppIndex {
    pub const fn new(i: i64, j: i64) -> Self {
        Self { i, j }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LocalBounds {
    pub min: Point,
    pub max: Point,
}

impl LocalBounds {
    pub fn new(min: Point, max: Point) -> Option<Self> {
        (min.x.is_finite()
            && min.y.is_finite()
            && max.x.is_finite()
            && max.y.is_finite()
            && min.x <= max.x
            && min.y <= max.y)
            .then_some(Self { min, max })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MotifError {
    InvalidBounds,
    IndexOutOfRange,
    LimitExceeded,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nopp {
    pub index: NoppIndex,
    pub nopp_type: NoppType,
    pub center: Point,
    pub rendered_radius_mm: f64,
    pub effective_radius_mm: f64,
    pub forbidden_radius_mm: f64,
}

impl Nopp {
    pub fn at_index(index: NoppIndex, profile: &PlateProfile, transform: &PlateTransform) -> Self {
        let nopp_type = nopp_type(index);
        let effective_radius_mm = match nopp_type {
            NoppType::Large => profile.large_effective_radius_mm,
            NoppType::Small => profile.small_effective_radius_mm,
        };
        let rendered_radius_mm = match nopp_type {
            NoppType::Large => profile.large_rendered_radius_mm,
            NoppType::Small => profile.small_effective_radius_mm,
        };
        Self {
            index,
            nopp_type,
            center: transform.to_world(Point::new(
                index.i as f64 * profile.pitch_mm,
                index.j as f64 * profile.pitch_mm,
            )),
            rendered_radius_mm,
            effective_radius_mm,
            forbidden_radius_mm: profile.forbidden_radius(nopp_type),
        }
    }
}

pub const fn nopp_type(index: NoppIndex) -> NoppType {
    if (index.i.rem_euclid(2) + index.j.rem_euclid(2)).rem_euclid(2) == 0 {
        NoppType::Large
    } else {
        NoppType::Small
    }
}

pub fn motif_indices_for_bounds(
    bounds: LocalBounds,
    pitch_mm: f64,
    padding_mm: f64,
    limit: usize,
) -> Result<Vec<NoppIndex>, MotifError> {
    if !pitch_mm.is_finite() || pitch_mm <= 0.0 || !padding_mm.is_finite() || padding_mm < 0.0 {
        return Err(MotifError::InvalidBounds);
    }
    let min_i = checked_floor_i64((bounds.min.x - padding_mm) / pitch_mm)?;
    let max_i = checked_ceil_i64((bounds.max.x + padding_mm) / pitch_mm)?;
    let min_j = checked_floor_i64((bounds.min.y - padding_mm) / pitch_mm)?;
    let max_j = checked_ceil_i64((bounds.max.y + padding_mm) / pitch_mm)?;
    let width = max_i
        .checked_sub(min_i)
        .and_then(|value| value.checked_add(1))
        .and_then(|value| usize::try_from(value).ok())
        .ok_or(MotifError::IndexOutOfRange)?;
    let height = max_j
        .checked_sub(min_j)
        .and_then(|value| value.checked_add(1))
        .and_then(|value| usize::try_from(value).ok())
        .ok_or(MotifError::IndexOutOfRange)?;
    let count = width
        .checked_mul(height)
        .ok_or(MotifError::IndexOutOfRange)?;
    if count > limit {
        return Err(MotifError::LimitExceeded);
    }

    let mut indices = Vec::with_capacity(count);
    for j in min_j..=max_j {
        for i in min_i..=max_i {
            indices.push(NoppIndex::new(i, j));
        }
    }
    Ok(indices)
}

fn checked_floor_i64(value: f64) -> Result<i64, MotifError> {
    checked_i64(value.floor())
}

fn checked_ceil_i64(value: f64) -> Result<i64, MotifError> {
    checked_i64(value.ceil())
}

fn checked_i64(value: f64) -> Result<i64, MotifError> {
    if !value.is_finite() || value < i64::MIN as f64 || value >= i64::MAX as f64 {
        Err(MotifError::IndexOutOfRange)
    } else {
        Ok(value as i64)
    }
}
