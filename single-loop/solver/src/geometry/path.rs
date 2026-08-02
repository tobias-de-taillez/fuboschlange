use crate::geometry::primitive::{angle_of, point_from_angle};
use crate::geometry::{G1_TOLERANCE, POSITION_TOLERANCE_MM};
use crate::model::PathPrimitive;
use thiserror::Error;

#[derive(Clone, Debug, PartialEq)]
pub struct CanonicalPath {
    primitives: Vec<PathPrimitive>,
    prefix_lengths: Vec<f64>,
    total_length: f64,
}

impl CanonicalPath {
    pub(crate) fn from_connected(primitives: Vec<PathPrimitive>) -> Self {
        let mut prefix_lengths = Vec::with_capacity(primitives.len());
        let mut total_length = 0.0;

        for primitive in &primitives {
            prefix_lengths.push(total_length);
            total_length += primitive.length();
        }

        Self {
            primitives,
            prefix_lengths,
            total_length,
        }
    }

    pub fn primitives(&self) -> &[PathPrimitive] {
        &self.primitives
    }

    pub fn prefix_lengths(&self) -> &[f64] {
        &self.prefix_lengths
    }

    pub fn total_length(&self) -> f64 {
        self.total_length
    }
}

#[derive(Clone, Debug, Error, PartialEq)]
pub enum PathError {
    #[error("path primitive {primitive_index} contains non-finite values")]
    NonFinitePrimitive { primitive_index: usize },
    #[error("path primitive {primitive_index} has zero length")]
    ZeroLengthPrimitive { primitive_index: usize },
    #[error("path primitive {primitive_index} has nonpositive radius {radius_mm}")]
    NonPositiveRadius {
        primitive_index: usize,
        radius_mm: f64,
    },
    #[error("path primitive {primitive_index} has invalid sweep {sweep_rad}")]
    InvalidSweep {
        primitive_index: usize,
        sweep_rad: f64,
    },
    #[error(
        "path primitive {primitive_index} {endpoint} endpoint radius residual {residual_mm} mm exceeds tolerance"
    )]
    EndpointRadiusResidual {
        primitive_index: usize,
        endpoint: &'static str,
        residual_mm: f64,
    },
    #[error(
        "path primitive {primitive_index} endpoint/sweep residual {residual_mm} mm exceeds tolerance"
    )]
    EndpointSweepResidual {
        primitive_index: usize,
        residual_mm: f64,
    },
    #[error("path primitives {left_index} and {right_index} are discontinuous by {gap_mm} mm")]
    PositionDiscontinuity {
        left_index: usize,
        right_index: usize,
        gap_mm: f64,
    },
    #[error(
        "path primitives {left_index} and {right_index} are not G1 continuous (tangent delta {delta})"
    )]
    G1Discontinuity {
        left_index: usize,
        right_index: usize,
        delta: f64,
    },
}

pub fn canonicalize_path(input: &[PathPrimitive]) -> Result<CanonicalPath, PathError> {
    let checked = input
        .iter()
        .cloned()
        .enumerate()
        .map(|(primitive_index, primitive)| validate_primitive(primitive, primitive_index))
        .collect::<Result<Vec<_>, _>>()?;
    let connected = merge_compatible_neighbors(checked)?;
    verify_position_continuity(&connected, POSITION_TOLERANCE_MM)?;
    verify_g1_continuity(&connected, G1_TOLERANCE)?;
    Ok(CanonicalPath::from_connected(connected))
}

fn validate_primitive(
    primitive: PathPrimitive,
    primitive_index: usize,
) -> Result<PathPrimitive, PathError> {
    match primitive {
        PathPrimitive::Line { start, end } => {
            if !start.is_finite() || !end.is_finite() {
                return Err(PathError::NonFinitePrimitive { primitive_index });
            }

            (start.distance_to(end) > 0.0)
                .then_some(PathPrimitive::Line { start, end })
                .ok_or(PathError::ZeroLengthPrimitive { primitive_index })
        }
        PathPrimitive::Arc {
            start,
            end,
            center,
            radius_mm,
            sweep_rad,
        } => {
            if !start.is_finite()
                || !end.is_finite()
                || !center.is_finite()
                || !radius_mm.is_finite()
                || !sweep_rad.is_finite()
            {
                return Err(PathError::NonFinitePrimitive { primitive_index });
            }

            if radius_mm <= 0.0 {
                return Err(PathError::NonPositiveRadius {
                    primitive_index,
                    radius_mm,
                });
            }

            if sweep_rad.abs() == 0.0 || sweep_rad.abs() >= std::f64::consts::TAU {
                return Err(PathError::InvalidSweep {
                    primitive_index,
                    sweep_rad,
                });
            }

            for (endpoint_name, endpoint) in [("start", start), ("end", end)] {
                let residual_mm = (endpoint.distance_to(center) - radius_mm).abs();
                if residual_mm > POSITION_TOLERANCE_MM {
                    return Err(PathError::EndpointRadiusResidual {
                        primitive_index,
                        endpoint: endpoint_name,
                        residual_mm,
                    });
                }
            }

            let expected_end =
                point_from_angle(center, radius_mm, angle_of(start, center) + sweep_rad);
            let residual_mm = expected_end.distance_to(end);
            if residual_mm > POSITION_TOLERANCE_MM {
                return Err(PathError::EndpointSweepResidual {
                    primitive_index,
                    residual_mm,
                });
            }

            Ok(PathPrimitive::Arc {
                start,
                end,
                center,
                radius_mm,
                sweep_rad,
            })
        }
    }
}

fn merge_compatible_neighbors(
    checked: Vec<PathPrimitive>,
) -> Result<Vec<PathPrimitive>, PathError> {
    let mut merged: Vec<PathPrimitive> = Vec::with_capacity(checked.len());

    for (primitive_index, primitive) in checked.into_iter().enumerate() {
        let primitive = if let Some(previous) = merged.last() {
            snap_shared_endpoint(previous, primitive, primitive_index)?
        } else {
            primitive
        };

        if let Some(last) = merged.last_mut()
            && let Some(candidate) = try_merge(last, &primitive)
        {
            *last = candidate;
            continue;
        }

        merged.push(primitive);
    }

    Ok(merged)
}

fn snap_shared_endpoint(
    previous: &PathPrimitive,
    primitive: PathPrimitive,
    primitive_index: usize,
) -> Result<PathPrimitive, PathError> {
    let previous_end = previous.end();
    let current_start = primitive.start();

    if previous_end.distance_to(current_start) <= POSITION_TOLERANCE_MM
        && previous_end != current_start
    {
        validate_primitive(primitive.with_start(previous_end), primitive_index)
    } else {
        Ok(primitive)
    }
}

fn try_merge(left: &PathPrimitive, right: &PathPrimitive) -> Option<PathPrimitive> {
    if left.end() != right.start() {
        return None;
    }

    match (left, right) {
        (
            PathPrimitive::Line {
                start: left_start,
                end: _left_end,
            },
            PathPrimitive::Line {
                start: _right_start,
                end: right_end,
            },
        ) if tangent_delta(left.end_tangent(), right.start_tangent()) <= G1_TOLERANCE => {
            Some(PathPrimitive::Line {
                start: *left_start,
                end: *right_end,
            })
        }
        (
            PathPrimitive::Arc {
                start: left_start,
                end: _left_end,
                center: left_center,
                radius_mm: left_radius,
                sweep_rad: left_sweep,
            },
            PathPrimitive::Arc {
                start: _right_start,
                end: right_end,
                center: right_center,
                radius_mm: right_radius,
                sweep_rad: right_sweep,
            },
        ) if left_center.distance_to(*right_center) <= POSITION_TOLERANCE_MM
            && (*left_radius - *right_radius).abs() <= POSITION_TOLERANCE_MM
            && left_sweep.signum() == right_sweep.signum()
            && tangent_delta(left.end_tangent(), right.start_tangent()) <= G1_TOLERANCE =>
        {
            let candidate = PathPrimitive::Arc {
                start: *left_start,
                end: *right_end,
                center: *left_center,
                radius_mm: *left_radius,
                sweep_rad: left_sweep + right_sweep,
            };

            validate_primitive(candidate, 0).ok()
        }
        _ => None,
    }
}

fn verify_position_continuity(
    primitives: &[PathPrimitive],
    tolerance_mm: f64,
) -> Result<(), PathError> {
    for (left_index, pair) in primitives.windows(2).enumerate() {
        let gap_mm = pair[0].end().distance_to(pair[1].start());
        if gap_mm > tolerance_mm {
            return Err(PathError::PositionDiscontinuity {
                left_index,
                right_index: left_index + 1,
                gap_mm,
            });
        }
    }

    Ok(())
}

fn verify_g1_continuity(primitives: &[PathPrimitive], tolerance: f64) -> Result<(), PathError> {
    for (left_index, pair) in primitives.windows(2).enumerate() {
        let delta = tangent_delta(pair[0].end_tangent(), pair[1].start_tangent());
        if delta > tolerance {
            return Err(PathError::G1Discontinuity {
                left_index,
                right_index: left_index + 1,
                delta,
            });
        }
    }

    Ok(())
}

fn tangent_delta(left: crate::geometry::Vec2, right: crate::geometry::Vec2) -> f64 {
    left.distance(right)
}
