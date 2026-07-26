use crate::geometry::{Intersection, PointClassification, primitive_intersections};
use crate::model::{PathPrimitive, Point};
use crate::validation::{
    CandidatePath, ValidationContext, ValidationFailure, ValidationFailureCode,
};

pub(crate) fn validate_inside_polygon(
    candidate: &CandidatePath,
    context: &ValidationContext,
) -> Result<(), ValidationFailure> {
    let boundary = polygon_edges(&context.polygon);
    for (primitive_index, primitive) in candidate.path.primitives().iter().enumerate() {
        let mut parameters = vec![0.0, 1.0];
        for edge in &boundary {
            match primitive_intersections(primitive, edge) {
                Intersection::None => {}
                Intersection::Overlap => {
                    return Err(
                        ValidationFailure::new(ValidationFailureCode::PathOutsidePolygon)
                            .with_primitive(primitive_index),
                    );
                }
                Intersection::Points(points) => {
                    for hit in points {
                        parameters.push(hit.a_t);
                        if !is_allowed_port_contact(hit.point, candidate) {
                            return Err(ValidationFailure::new(
                                ValidationFailureCode::PathOutsidePolygon,
                            )
                            .with_point(hit.point)
                            .with_primitive(primitive_index));
                        }
                    }
                }
            }
        }

        parameters.sort_by(|left, right| left.total_cmp(right));
        parameters.dedup_by(|left, right| (*left - *right).abs() <= 1e-12);

        for pair in parameters.windows(2) {
            let start = pair[0];
            let end = pair[1];
            if end - start <= 1e-12 {
                continue;
            }
            let midpoint = primitive.point_at((start + end) * 0.5);
            match context.polygon.classify_point(midpoint) {
                PointClassification::Inside => {}
                PointClassification::Boundary | PointClassification::Outside => {
                    return Err(
                        ValidationFailure::new(ValidationFailureCode::PathOutsidePolygon)
                            .with_point(midpoint)
                            .with_primitive(primitive_index),
                    );
                }
            }
        }
    }

    Ok(())
}

fn polygon_edges(polygon: &crate::geometry::Polygon) -> Vec<PathPrimitive> {
    (0..polygon.original_edge_count())
        .map(|index| {
            let (start, end) = polygon.original_edge(index);
            PathPrimitive::Line { start, end }
        })
        .collect()
}

fn is_allowed_port_contact(point: Point, candidate: &CandidatePath) -> bool {
    point.distance_to(candidate.connection.start_port) <= crate::geometry::POSITION_TOLERANCE_MM
        || point.distance_to(candidate.connection.end_port)
            <= crate::geometry::POSITION_TOLERANCE_MM
}
