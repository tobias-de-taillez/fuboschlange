use super::polygon::{
    PointClassification, classify_closed_polyline_point, closed_polyline_boundary_distance,
};
use super::{
    Intersection, POSITION_TOLERANCE_MM, Polygon, canonicalize_path, primitive_intersections,
};
use crate::constants::TOPOLOGY_QUANTIZATION_MM;
use crate::input::{NormalizedInput, internal_validation_failure, no_solution_geometry};
use crate::model::{ErrorDetail, PathPrimitive, Point, SolverError, SolverErrorCode};
use cavalier_contours::core::math::angle_from_bulge;
use cavalier_contours::polyline::{PlineSource, Polyline, seg_arc_radius_and_center};
use std::collections::BTreeMap;

const VORONOI_HAUSDORFF_MM: f64 = 0.05;
const MAX_HELPER_SEGMENTS: usize = 2_000_000;
const I64_MIN_AS_F64: f64 = -9_223_372_036_854_775_808.0;
const I64_MAX_EXCLUSIVE_AS_F64: f64 = 9_223_372_036_854_775_808.0;
const QUANTIZATION_ENDPOINT_ERROR_MM: f64 =
    TOPOLOGY_QUANTIZATION_MM * std::f64::consts::SQRT_2 * 0.5;
const TESSELLATION_HAUSDORFF_MM: f64 = VORONOI_HAUSDORFF_MM - QUANTIZATION_ENDPOINT_ERROR_MM;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct QuantizedPoint {
    pub x: i64,
    pub y: i64,
}

impl QuantizedPoint {
    fn try_from_point(point: Point) -> Result<Self, SolverError> {
        let Some(x) = quantize_coordinate(point.x) else {
            return Err(helper_quantization_range_error());
        };
        let Some(y) = quantize_coordinate(point.y) else {
            return Err(helper_quantization_range_error());
        };
        Ok(Self { x, y })
    }
}

fn quantize_coordinate(coordinate_mm: f64) -> Option<i64> {
    let rounded = (coordinate_mm / TOPOLOGY_QUANTIZATION_MM).round();
    (rounded >= I64_MIN_AS_F64 && rounded < I64_MAX_EXCLUSIVE_AS_F64).then(|| rounded as i64)
}

#[derive(Clone, Debug)]
pub struct AllowedRegion {
    pub boundary: Vec<PathPrimitive>,
    pub quantized_segments: Vec<(QuantizedPoint, QuantizedPoint)>,
    pub wall_clearance_mm: f64,
    boundary_polyline: Polyline<f64>,
}

impl AllowedRegion {
    pub fn classify_point(&self, point: Point) -> PointClassification {
        classify_closed_polyline_point(&self.boundary_polyline, point)
    }

    pub fn exact_boundary_distance(&self, point: Point) -> f64 {
        closed_polyline_boundary_distance(&self.boundary_polyline, point)
    }

    fn from_exact_loop(
        loop_polyline: &Polyline<f64>,
        polygon: &Polygon,
        wall_clearance_mm: f64,
    ) -> Result<Self, SolverError> {
        validate_offset_loop(loop_polyline)?;
        let boundary = polyline_to_exact_boundary(loop_polyline)?;
        validate_boundary_containment(&boundary, polygon)?;
        let quantized_segments = quantized_segments_for_boundary(&boundary)?;
        Ok(Self {
            boundary,
            quantized_segments,
            wall_clearance_mm,
            boundary_polyline: loop_polyline.clone(),
        })
    }
}

pub fn erode_for_centerline(input: &NormalizedInput) -> Result<AllowedRegion, SolverError> {
    let loops = offset_inward_with_cavalier(&input.polygon, input.raw.wall_clearance_mm)?;
    match loops.as_slice() {
        [single] => {
            AllowedRegion::from_exact_loop(single, &input.polygon, input.raw.wall_clearance_mm)
        }
        _ => Err(no_solution_geometry("WALL_INSET_DISCONNECTED_OR_EMPTY")),
    }
}

fn offset_inward_with_cavalier(
    polygon: &Polygon,
    wall_clearance_mm: f64,
) -> Result<Vec<Polyline<f64>>, SolverError> {
    Ok(polygon
        .internal_ccw_polyline()
        .parallel_offset(wall_clearance_mm))
}

fn validate_offset_loop(loop_polyline: &Polyline<f64>) -> Result<(), SolverError> {
    if !loop_polyline.is_closed() {
        return Err(internal_validation_failure("OFFSET_LOOP_NOT_CLOSED"));
    }
    if loop_polyline.vertex_count() < 3 {
        return Err(internal_validation_failure("OFFSET_LOOP_TOO_SHORT"));
    }
    let area = loop_polyline.area();
    if !area.is_finite() || area <= POSITION_TOLERANCE_MM {
        return Err(internal_validation_failure(
            "OFFSET_LOOP_ORIENTATION_INVALID",
        ));
    }
    Ok(())
}

fn polyline_to_exact_boundary(
    loop_polyline: &Polyline<f64>,
) -> Result<Vec<PathPrimitive>, SolverError> {
    let mut boundary = Vec::with_capacity(loop_polyline.vertex_count());
    for (start, end) in loop_polyline.iter_segments() {
        let start_point = Point::new(start.x, start.y);
        let end_point = Point::new(end.x, end.y);
        let primitive = if start.bulge_is_zero() {
            PathPrimitive::Line {
                start: start_point,
                end: end_point,
            }
        } else {
            let (radius_mm, center) = seg_arc_radius_and_center(start, end);
            PathPrimitive::Arc {
                start: start_point,
                end: end_point,
                center: Point::new(center.x, center.y),
                radius_mm,
                sweep_rad: angle_from_bulge(start.bulge),
            }
        };
        validate_offset_primitive(&primitive)?;
        boundary.push(primitive);
    }
    validate_closed_boundary(&boundary)?;
    Ok(boundary)
}

fn validate_offset_primitive(primitive: &PathPrimitive) -> Result<(), SolverError> {
    canonicalize_path(std::slice::from_ref(primitive))
        .map(|_| ())
        .map_err(|_| internal_validation_failure("OFFSET_PRIMITIVE_INVALID"))
}

fn validate_closed_boundary(boundary: &[PathPrimitive]) -> Result<(), SolverError> {
    if boundary.len() < 3 {
        return Err(internal_validation_failure("OFFSET_LOOP_TOO_SHORT"));
    }

    for pair in boundary.windows(2) {
        if pair[0].end().distance_to(pair[1].start()) > POSITION_TOLERANCE_MM {
            return Err(internal_validation_failure("OFFSET_LOOP_DISCONTINUITY"));
        }
    }

    if boundary
        .last()
        .unwrap()
        .end()
        .distance_to(boundary[0].start())
        > POSITION_TOLERANCE_MM
    {
        return Err(internal_validation_failure("OFFSET_LOOP_NOT_CLOSED"));
    }

    for first in 0..boundary.len() {
        for second in (first + 1)..boundary.len() {
            let intersection = primitive_intersections(&boundary[first], &boundary[second]);
            let adjacent = second == first + 1 || (first == 0 && second + 1 == boundary.len());
            if adjacent {
                let shared = if second == first + 1 {
                    boundary[first].end()
                } else {
                    boundary[first].start()
                };
                let only_shared_endpoint = match intersection {
                    Intersection::None => true,
                    Intersection::Points(ref points) => {
                        points.len() == 1
                            && points[0].point.distance_to(shared) <= POSITION_TOLERANCE_MM
                    }
                    Intersection::Overlap => false,
                };
                if !only_shared_endpoint {
                    return Err(internal_validation_failure("OFFSET_LOOP_SELF_INTERSECTION"));
                }
            } else if !matches!(intersection, Intersection::None) {
                return Err(internal_validation_failure("OFFSET_LOOP_SELF_INTERSECTION"));
            }
        }
    }

    Ok(())
}

fn validate_boundary_containment(
    boundary: &[PathPrimitive],
    polygon: &Polygon,
) -> Result<(), SolverError> {
    let polygon_edges = (0..polygon.original_edge_count())
        .map(|index| {
            let (start, end) = polygon.original_edge(index);
            PathPrimitive::Line { start, end }
        })
        .collect::<Vec<_>>();

    for primitive in boundary {
        if polygon_edges
            .iter()
            .any(|edge| !matches!(primitive_intersections(primitive, edge), Intersection::None))
            || polygon.classify_point(primitive.point_at(0.5)) != PointClassification::Inside
        {
            return Err(internal_validation_failure(
                "OFFSET_LOOP_OUTSIDE_SOURCE_POLYGON",
            ));
        }
    }
    Ok(())
}

fn quantized_segments_for_boundary(
    boundary: &[PathPrimitive],
) -> Result<Vec<(QuantizedPoint, QuantizedPoint)>, SolverError> {
    let mut required_segments = 0usize;
    for primitive in boundary {
        let primitive_segments = tessellation_segment_count(primitive)?;
        let Some(total) = required_segments.checked_add(primitive_segments) else {
            return Err(helper_segment_limit_error(f64::MAX));
        };
        if total > MAX_HELPER_SEGMENTS {
            return Err(helper_segment_limit_error(total as f64));
        }
        required_segments = total;
    }

    let mut result = Vec::new();
    result
        .try_reserve_exact(required_segments)
        .map_err(|_| helper_segment_allocation_error(required_segments))?;
    for primitive in boundary {
        let segment_count = tessellation_segment_count(primitive)?;
        let mut start = QuantizedPoint::try_from_point(primitive.point_at(0.0))?;
        for index in 1..=segment_count {
            let end = QuantizedPoint::try_from_point(
                primitive.point_at(index as f64 / segment_count as f64),
            )?;
            if start != end {
                result.push((start, end));
            }
            start = end;
        }
    }
    Ok(result)
}

fn tessellation_segment_count(primitive: &PathPrimitive) -> Result<usize, SolverError> {
    let PathPrimitive::Arc {
        radius_mm,
        sweep_rad,
        ..
    } = primitive
    else {
        return Ok(1);
    };

    let required = if *radius_mm <= TESSELLATION_HAUSDORFF_MM {
        1.0
    } else {
        let ratio = TESSELLATION_HAUSDORFF_MM / *radius_mm;
        let max_segment_angle = 4.0 * (0.5 * ratio).sqrt().asin();
        (sweep_rad.abs() / max_segment_angle).ceil().max(1.0)
    };
    if !required.is_finite() || required > MAX_HELPER_SEGMENTS as f64 {
        return Err(helper_segment_limit_error(required));
    }
    Ok(required as usize)
}

fn helper_segment_limit_error(required: f64) -> SolverError {
    let mut details = BTreeMap::from([
        (
            "reason".to_string(),
            ErrorDetail::string("MAX_HELPER_SEGMENTS"),
        ),
        (
            "limit".to_string(),
            ErrorDetail::number(MAX_HELPER_SEGMENTS as f64).unwrap(),
        ),
    ]);
    if let Some(required) = ErrorDetail::number(required) {
        details.insert("required".to_string(), required);
    }
    SolverError {
        code: SolverErrorCode::SolverLimitExceeded,
        message: "Helper geometry exceeded its deterministic segment budget".to_string(),
        details,
    }
}

fn helper_segment_allocation_error(required: usize) -> SolverError {
    SolverError {
        code: SolverErrorCode::SolverLimitExceeded,
        message: "Helper geometry allocation failed within its segment budget".to_string(),
        details: BTreeMap::from([
            (
                "reason".to_string(),
                ErrorDetail::string("HELPER_SEGMENT_ALLOCATION_FAILED"),
            ),
            (
                "required".to_string(),
                ErrorDetail::number(required as f64).unwrap(),
            ),
        ]),
    }
}

fn helper_quantization_range_error() -> SolverError {
    SolverError {
        code: SolverErrorCode::SolverLimitExceeded,
        message: "Helper geometry exceeds the checked quantization range".to_string(),
        details: BTreeMap::from([
            (
                "reason".to_string(),
                ErrorDetail::string("HELPER_QUANTIZATION_RANGE"),
            ),
            (
                "quantizationMm".to_string(),
                ErrorDetail::number(TOPOLOGY_QUANTIZATION_MM).unwrap(),
            ),
        ]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: f64, y: f64) -> Point {
        Point::new(x, y)
    }

    fn line(start: (f64, f64), end: (f64, f64)) -> PathPrimitive {
        PathPrimitive::Line {
            start: point(start.0, start.1),
            end: point(end.0, end.1),
        }
    }

    #[test]
    fn huge_finite_radius_returns_deterministic_helper_segment_limit() {
        let radius_mm = 1e12;
        let boundary = vec![PathPrimitive::Arc {
            start: point(radius_mm, 0.0),
            end: point(0.0, radius_mm),
            center: point(0.0, 0.0),
            radius_mm,
            sweep_rad: std::f64::consts::FRAC_PI_2,
        }];

        let first = quantized_segments_for_boundary(&boundary).unwrap_err();
        let second = quantized_segments_for_boundary(&boundary).unwrap_err();

        assert_eq!(first, second);
        assert_eq!(
            first.code,
            crate::model::SolverErrorCode::SolverLimitExceeded
        );
        assert_eq!(
            first.details["reason"].as_str(),
            Some("MAX_HELPER_SEGMENTS")
        );
        assert_eq!(
            first.details["limit"].as_number(),
            Some(MAX_HELPER_SEGMENTS as f64)
        );
        assert!(first.details["required"].as_number().unwrap() > MAX_HELPER_SEGMENTS as f64);
    }

    #[test]
    fn self_crossing_exact_offset_loop_is_rejected() {
        let boundary = vec![
            line((0.0, 0.0), (2.0, 2.0)),
            line((2.0, 2.0), (0.0, 2.0)),
            line((0.0, 2.0), (2.0, 0.0)),
            line((2.0, 0.0), (0.0, 0.0)),
        ];

        assert!(validate_closed_boundary(&boundary).is_err());
    }
}
