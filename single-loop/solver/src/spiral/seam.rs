use crate::model::Point;
use crate::wavefront::WavefrontFamily;

const PERIMETER_FRACTION_COUNT: usize = 16;
const SEAM_DEDUPLICATION_MM: f64 = 0.001;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum AnchorKind {
    Event,
    PerimeterFraction,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SeamAnchor {
    pub kind: AnchorKind,
    pub anchor_order: u32,
    pub perimeter_fraction: f64,
    pub point: Point,
    pub event_id: Option<u32>,
}

pub fn perimeter_fraction_anchors(family: &WavefrontFamily) -> Vec<SeamAnchor> {
    (0..PERIMETER_FRACTION_COUNT)
        .filter_map(|index| {
            let perimeter_fraction = index as f64 / PERIMETER_FRACTION_COUNT as f64;
            Some(SeamAnchor {
                kind: AnchorKind::PerimeterFraction,
                anchor_order: u32::try_from(index).ok()?,
                perimeter_fraction,
                point: point_on_outer_perimeter(family, perimeter_fraction)?,
                event_id: None,
            })
        })
        .collect()
}

pub fn seam_anchors(family: &WavefrontFamily) -> Vec<SeamAnchor> {
    let Some(outer) = family.fronts.last() else {
        return Vec::new();
    };
    if outer.vertices.is_empty() {
        return Vec::new();
    }

    let mut anchors = Vec::with_capacity(
        family
            .event_seam_anchors
            .len()
            .saturating_add(PERIMETER_FRACTION_COUNT),
    );
    for (order, event) in family.event_seam_anchors.iter().enumerate() {
        let Ok(anchor_order) = u32::try_from(order) else {
            return Vec::new();
        };
        let perimeter_fraction =
            (event.boundary_order % outer.vertices.len()) as f64 / outer.vertices.len() as f64;
        let Some(point) = point_on_outer_perimeter(family, perimeter_fraction) else {
            return Vec::new();
        };
        push_if_unique(
            &mut anchors,
            SeamAnchor {
                kind: AnchorKind::Event,
                anchor_order,
                perimeter_fraction,
                point,
                event_id: Some(event.event_id),
            },
        );
    }
    for anchor in perimeter_fraction_anchors(family) {
        push_if_unique(&mut anchors, anchor);
    }
    anchors
}

pub(crate) fn point_on_front_perimeter(
    family: &WavefrontFamily,
    front_index: usize,
    fraction: f64,
) -> Option<Point> {
    let front = family.fronts.get(front_index)?;
    let points = front
        .vertices
        .iter()
        .map(|id| family.vertices.get(id.index()).map(|vertex| vertex.point))
        .collect::<Option<Vec<_>>>()?;
    point_on_closed_polyline(&points, fraction)
}

fn point_on_outer_perimeter(family: &WavefrontFamily, fraction: f64) -> Option<Point> {
    point_on_front_perimeter(family, family.fronts.len().checked_sub(1)?, fraction)
}

fn point_on_closed_polyline(points: &[Point], fraction: f64) -> Option<Point> {
    if points.len() < 2 || !fraction.is_finite() {
        return None;
    }
    let lengths = points
        .iter()
        .copied()
        .zip(points.iter().copied().cycle().skip(1))
        .take(points.len())
        .map(|(start, end)| (end - start).norm())
        .collect::<Vec<_>>();
    if lengths
        .iter()
        .any(|length| !length.is_finite() || *length <= 0.0)
    {
        return None;
    }
    let perimeter = lengths.iter().sum::<f64>();
    if !perimeter.is_finite() || perimeter <= 0.0 {
        return None;
    }
    let mut target = fraction.rem_euclid(1.0) * perimeter;
    for (index, length) in lengths.iter().copied().enumerate() {
        if target <= length || index + 1 == lengths.len() {
            let parameter = (target / length).clamp(0.0, 1.0);
            let start = points[index];
            let end = points[(index + 1) % points.len()];
            return Some(start + (end - start) * parameter);
        }
        target -= length;
    }
    None
}

fn push_if_unique(anchors: &mut Vec<SeamAnchor>, candidate: SeamAnchor) {
    if anchors
        .iter()
        .all(|anchor| (anchor.point - candidate.point).norm() > SEAM_DEDUPLICATION_MM)
    {
        anchors.push(candidate);
    }
}
