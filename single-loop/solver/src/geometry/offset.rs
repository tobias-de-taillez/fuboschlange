use super::polygon::{
    PointClassification, classify_closed_polyline_point, closed_polyline_boundary_distance,
};
use super::{POSITION_TOLERANCE_MM, Polygon, canonicalize_path};
use crate::constants::TOPOLOGY_QUANTIZATION_MM;
use crate::input::{NormalizedInput, internal_validation_failure, no_solution_geometry};
use crate::model::{PathPrimitive, Point, SolverError};
use cavalier_contours::core::math::angle_from_bulge;
use cavalier_contours::polyline::{PlineSource, Polyline, seg_arc_radius_and_center};

const VORONOI_HAUSDORFF_MM: f64 = 0.05;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct QuantizedPoint {
    pub x: i64,
    pub y: i64,
}

impl QuantizedPoint {
    fn from_point(point: Point) -> Self {
        Self {
            x: (point.x / TOPOLOGY_QUANTIZATION_MM).round() as i64,
            y: (point.y / TOPOLOGY_QUANTIZATION_MM).round() as i64,
        }
    }
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
        wall_clearance_mm: f64,
    ) -> Result<Self, SolverError> {
        let boundary = polyline_to_exact_boundary(loop_polyline)?;
        let quantized_segments = quantized_segments_for_boundary(&boundary);
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
        [single] if has_positive_area(single) => {
            AllowedRegion::from_exact_loop(single, input.raw.wall_clearance_mm)
        }
        _ => Err(no_solution_geometry("WALL_INSET_DISCONNECTED_OR_EMPTY")),
    }
}

fn offset_inward_with_cavalier(
    polygon: &Polygon,
    wall_clearance_mm: f64,
) -> Result<Vec<Polyline<f64>>, SolverError> {
    let offset_loops = polygon
        .internal_ccw_polyline()
        .parallel_offset(wall_clearance_mm);
    let mut sanitized = Vec::with_capacity(offset_loops.len());
    for loop_polyline in offset_loops {
        if !loop_polyline.is_closed() || loop_polyline.vertex_count() < 3 {
            continue;
        }

        let loop_polyline = loop_polyline
            .remove_repeat_pos(POSITION_TOLERANCE_MM)
            .unwrap_or(loop_polyline);
        let loop_polyline = loop_polyline
            .remove_redundant(POSITION_TOLERANCE_MM)
            .unwrap_or(loop_polyline);
        if loop_polyline.vertex_count() < 3 {
            continue;
        }
        sanitized.push(loop_polyline);
    }

    Ok(sanitized)
}

fn has_positive_area(loop_polyline: &Polyline<f64>) -> bool {
    loop_polyline.area() > POSITION_TOLERANCE_MM
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

    Ok(())
}

fn quantized_segments_for_boundary(
    boundary: &[PathPrimitive],
) -> Vec<(QuantizedPoint, QuantizedPoint)> {
    let mut result = Vec::new();
    for primitive in boundary {
        let points = tessellate_for_quantization(primitive);
        for pair in points.windows(2) {
            let start = QuantizedPoint::from_point(pair[0]);
            let end = QuantizedPoint::from_point(pair[1]);
            if start != end {
                result.push((start, end));
            }
        }
    }
    result
}

fn tessellate_for_quantization(primitive: &PathPrimitive) -> Vec<Point> {
    match primitive {
        PathPrimitive::Line { start, end } => vec![*start, *end],
        PathPrimitive::Arc {
            radius_mm,
            sweep_rad,
            ..
        } => {
            let max_segment_angle = if *radius_mm <= VORONOI_HAUSDORFF_MM {
                sweep_rad.abs()
            } else {
                let cosine = (1.0 - VORONOI_HAUSDORFF_MM / *radius_mm).clamp(-1.0, 1.0);
                2.0 * cosine.acos()
            };
            let segment_count = if max_segment_angle == 0.0 {
                1usize
            } else {
                (sweep_rad.abs() / max_segment_angle).ceil().max(1.0) as usize
            };
            (0..=segment_count)
                .map(|index| primitive.point_at(index as f64 / segment_count as f64))
                .collect()
        }
    }
}
