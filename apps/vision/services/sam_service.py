"""
SAM (Segment Anything) service — loads the model once and exposes
a prediction function for screen segmentation.
"""

import os
import logging
import numpy as np
from functools import lru_cache
from typing import Tuple

logger = logging.getLogger(__name__)

# SAM model configuration
SAM_MODEL_TYPE = os.environ.get("SAM_MODEL_TYPE", "vit_h")
SAM_CHECKPOINT = os.environ.get("SAM_CHECKPOINT", "sam_weights/sam_vit_h_4b8939.pth")

_predictor = None


def get_sam_predictor():
    """
    Lazy-load the SAM predictor singleton.
    Downloads weights on first run if not present.
    """
    global _predictor
    if _predictor is not None:
        return _predictor

    import torch
    from segment_anything import sam_model_registry, SamPredictor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Loading SAM model {SAM_MODEL_TYPE} on {device}")

    if not os.path.exists(SAM_CHECKPOINT):
        logger.warning(
            f"SAM checkpoint not found at {SAM_CHECKPOINT}. "
            "Please download from https://github.com/facebookresearch/segment-anything#model-checkpoints"
        )
        raise FileNotFoundError(
            f"SAM weights not found: {SAM_CHECKPOINT}. "
            "Download and place in sam_weights/ directory."
        )

    sam = sam_model_registry[SAM_MODEL_TYPE](checkpoint=SAM_CHECKPOINT)
    sam.to(device=device)
    _predictor = SamPredictor(sam)
    logger.info("SAM model loaded successfully")
    return _predictor


def predict_mask(
    image_rgb: np.ndarray,
    point_coords: np.ndarray,
    point_labels: np.ndarray,
) -> Tuple[np.ndarray, float]:
    """
    Run SAM prediction and return the best mask + confidence.

    Args:
        image_rgb: H×W×3 uint8 RGB image
        point_coords: N×2 array of (x, y) click coordinates
        point_labels: N array of labels (1=positive, 0=negative)

    Returns:
        mask: H×W boolean array
        confidence: float score for the best mask
    """
    predictor = get_sam_predictor()
    predictor.set_image(image_rgb)

    masks, scores, logits = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=True,
    )

    # Pick the mask with highest confidence
    best_idx = int(np.argmax(scores))
    best_mask = masks[best_idx]
    best_score = float(scores[best_idx])

    return best_mask, best_score
