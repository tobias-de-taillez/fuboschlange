use crate::spiral::Pose;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ZonePhase {
    NearWall,
    Inside,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PoseState {
    pub pose: Pose,
    pub phase: ZonePhase,
    pub source_id: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PoseStateKey {
    pub x_micrometres: i64,
    pub y_micrometres: i64,
    pub tangent_source_id: u32,
    pub phase: ZonePhase,
}

impl PoseState {
    pub fn key(self) -> Option<PoseStateKey> {
        Some(PoseStateKey {
            x_micrometres: quantize_micrometres(self.pose.point.x)?,
            y_micrometres: quantize_micrometres(self.pose.point.y)?,
            tangent_source_id: self.source_id,
            phase: self.phase,
        })
    }
}

fn quantize_micrometres(value_mm: f64) -> Option<i64> {
    if !value_mm.is_finite() {
        return None;
    }
    let scaled = (value_mm * 1_000.0).round();
    if scaled < i64::MIN as f64 || scaled >= i64::MAX as f64 {
        return None;
    }
    Some(scaled as i64)
}
