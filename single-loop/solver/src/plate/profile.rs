use crate::plate::{NoppType, PlateProfileId};

#[derive(Clone, Debug, PartialEq)]
pub struct PlateProfile {
    pub id: PlateProfileId,
    pub version: &'static str,
    pub pitch_mm: f64,
    pub period_mm: f64,
    pub pipe_radius_mm: f64,
    pub min_bend_radius_mm: f64,
    pub large_rendered_radius_mm: f64,
    pub large_effective_radius_mm: f64,
    pub small_effective_radius_mm: f64,
    pub calibration_allowance_mm: f64,
}

impl PlateProfile {
    pub const fn bekotec_en_23_fi_30_16() -> Self {
        Self {
            id: PlateProfileId::BekotecEn23Fi30_16,
            version: "2026.07.31-1",
            pitch_mm: 75.0,
            period_mm: 150.0,
            pipe_radius_mm: 8.0,
            min_bend_radius_mm: 80.0,
            large_rendered_radius_mm: 33.0,
            large_effective_radius_mm: 17.5,
            small_effective_radius_mm: 10.5,
            calibration_allowance_mm: 0.5,
        }
    }

    pub const fn forbidden_radius(&self, nopp_type: NoppType) -> f64 {
        let effective_radius = match nopp_type {
            NoppType::Large => self.large_effective_radius_mm,
            NoppType::Small => self.small_effective_radius_mm,
        };
        effective_radius + self.pipe_radius_mm + self.calibration_allowance_mm
    }
}
