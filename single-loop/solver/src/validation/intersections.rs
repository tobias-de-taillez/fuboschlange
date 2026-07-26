use crate::geometry::{Aabb, Intersection, primitive_distance, primitive_intersections};
use crate::validation::{CandidatePath, ValidationFailure, ValidationFailureCode};

pub(crate) fn validate_self_intersections(
    candidate: &CandidatePath,
) -> Result<(), ValidationFailure> {
    let primitives = candidate.path.primitives();
    let bounds = primitives
        .iter()
        .map(|primitive| primitive.bounds())
        .collect::<Vec<_>>();

    for i in 0..primitives.len() {
        for j in (i + 1)..primitives.len() {
            if !aabb_overlaps(bounds[i], bounds[j]) {
                continue;
            }

            let intersection = primitive_intersections(&primitives[i], &primitives[j]);
            if is_allowed_consecutive_endpoint_contact(i, j, &intersection, candidate) {
                continue;
            }

            match intersection {
                Intersection::None => {}
                Intersection::Overlap => {
                    let witness = primitive_distance(
                        &primitives[i],
                        crate::geometry::ParameterRange::FULL,
                        &primitives[j],
                        crate::geometry::ParameterRange::FULL,
                    );
                    return Err(
                        ValidationFailure::new(ValidationFailureCode::SelfIntersection)
                            .with_points(witness.point_on_a, witness.point_on_b)
                            .with_primitives(i, j),
                    );
                }
                Intersection::Points(points) => {
                    let witness = points[0].point;
                    return Err(
                        ValidationFailure::new(ValidationFailureCode::SelfIntersection)
                            .with_point(witness)
                            .with_primitives(i, j),
                    );
                }
            }
        }
    }

    Ok(())
}

fn is_allowed_consecutive_endpoint_contact(
    i: usize,
    j: usize,
    intersection: &Intersection,
    candidate: &CandidatePath,
) -> bool {
    if j != i + 1 {
        return false;
    }

    match intersection {
        Intersection::Points(points) if points.len() == 1 => {
            let shared = candidate.path.primitives()[i].end();
            crate::geometry::primitive_distance(
                &candidate.path.primitives()[i],
                crate::geometry::ParameterRange::FULL,
                &candidate.path.primitives()[j],
                crate::geometry::ParameterRange::FULL,
            );
            points[0].point.distance_to(shared) <= crate::geometry::POSITION_TOLERANCE_MM
        }
        Intersection::None | Intersection::Overlap | Intersection::Points(_) => false,
    }
}

fn aabb_overlaps(left: Aabb, right: Aabb) -> bool {
    left.min.x <= right.max.x
        && left.max.x >= right.min.x
        && left.min.y <= right.max.y
        && left.max.y >= right.min.y
}
