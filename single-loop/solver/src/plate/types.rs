use crate::geometry::Vec2;
use crate::model::Point;
use serde::{Deserialize, Serialize};
use std::f64::consts::FRAC_1_SQRT_2;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
pub enum PlateProfileId {
    #[serde(rename = "BEKOTEC_EN_23_FI_30_16")]
    BekotecEn23Fi30_16,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NoppType {
    Large,
    Small,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Heading8 {
    Deg0,
    Deg45,
    Deg90,
    Deg135,
    Deg180,
    Deg225,
    Deg270,
    Deg315,
}

impl Heading8 {
    pub const ALL: [Self; 8] = [
        Self::Deg0,
        Self::Deg45,
        Self::Deg90,
        Self::Deg135,
        Self::Deg180,
        Self::Deg225,
        Self::Deg270,
        Self::Deg315,
    ];

    pub const fn degrees(self) -> u16 {
        self.octant() as u16 * 45
    }

    pub const fn octant(self) -> u8 {
        match self {
            Self::Deg0 => 0,
            Self::Deg45 => 1,
            Self::Deg90 => 2,
            Self::Deg135 => 3,
            Self::Deg180 => 4,
            Self::Deg225 => 5,
            Self::Deg270 => 6,
            Self::Deg315 => 7,
        }
    }

    pub const fn from_octant(octant: u8) -> Self {
        match octant % 8 {
            0 => Self::Deg0,
            1 => Self::Deg45,
            2 => Self::Deg90,
            3 => Self::Deg135,
            4 => Self::Deg180,
            5 => Self::Deg225,
            6 => Self::Deg270,
            _ => Self::Deg315,
        }
    }

    pub const fn direction(self) -> Vec2 {
        match self {
            Self::Deg0 => Vec2::new(1.0, 0.0),
            Self::Deg45 => Vec2::new(FRAC_1_SQRT_2, FRAC_1_SQRT_2),
            Self::Deg90 => Vec2::new(0.0, 1.0),
            Self::Deg135 => Vec2::new(-FRAC_1_SQRT_2, FRAC_1_SQRT_2),
            Self::Deg180 => Vec2::new(-1.0, 0.0),
            Self::Deg225 => Vec2::new(-FRAC_1_SQRT_2, -FRAC_1_SQRT_2),
            Self::Deg270 => Vec2::new(0.0, -1.0),
            Self::Deg315 => Vec2::new(FRAC_1_SQRT_2, -FRAC_1_SQRT_2),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlateModelInput {
    pub polygon: Vec<Point>,
    pub connection_edge_index: u32,
    pub wall_clearance_mm: f64,
    pub phase_u_mm: f64,
    pub phase_v_mm: f64,
    pub profile: PlateProfileId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlateModelErrorCode {
    InvalidPolygon,
    InvalidWallClearance,
    InvalidPlatePhase,
    UnknownPlateProfile,
    NoUsablePlateCell,
    ProfileCertificationFailed,
    TemplateCertificationFailed,
    SolverLimitExceeded,
}
