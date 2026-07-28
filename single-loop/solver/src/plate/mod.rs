mod collision;
mod motif;
mod profile;
mod template;
mod transform;
mod types;
mod validator;

pub use collision::primitive_circle_clearance;
pub use motif::{LocalBounds, MotifError, Nopp, NoppIndex, motif_indices_for_bounds, nopp_type};
pub use profile::PlateProfile;
pub use template::{
    LocalPose, MotionTemplate, TemplateCertificate, TemplateId, TemplateTransform, certify_template,
};
pub use transform::{PlateTransform, PlateTransformError};
pub use types::{Heading8, NoppType, PlateModelErrorCode, PlateModelInput, PlateProfileId};
pub use validator::{
    PlateValidationFailure, PlateValidationFailureCode, validate_line_heading,
    validate_primitive_against_plate,
};
