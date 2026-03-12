"""
Modular planar tracking pipeline for DOOH cinematic screen replacement.

Primary modules (new architecture):
- screen_mask:         screen polygon mask creation & initialisation
- feature_grid:        dense NxN grid generation in canonical space
- optical_flow:        LK tracking with forward-backward validation
- homography_ransac:   RANSAC homography estimation with confidence metrics
- ecc_refine:          ECC sub-pixel homography refinement
- transform_smoothing: QR-decomposition parameter smoothing
- drift_control:       drift detection and re-anchoring to keyframes

Utilities (shared):
- interpolate_keyframes: keyframe corner interpolation
- smoothing:             Savitzky-Golay corner pre-smoothing

Legacy (kept for reference):
- feature_tracker:       monolithic grid tracker (superseded by screen_mask + feature_grid + optical_flow)
- homography_estimator:  monolithic estimator   (superseded by homography_ransac + transform_smoothing)
- stabilize_plane:       monolithic stabiliser   (superseded by compositor/canonical_space + drift_control)
"""
