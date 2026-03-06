"""
Contour extraction service — converts a binary mask into 4 ordered
screen corners using OpenCV contour analysis.
"""

import numpy as np
import cv2
from typing import List, Tuple


def mask_to_corners(mask: np.ndarray) -> List[Tuple[float, float]]:
    """
    Extract 4 ordered screen corners from a binary mask.

    Pipeline:
    1. Threshold mask
    2. Find contours
    3. Select largest contour by area
    4. Approximate polygon (approxPolyDP)
    5. If 4-point polygon → use directly
    6. Otherwise → fallback to minAreaRect
    7. Order as: top-left, top-right, bottom-right, bottom-left

    Args:
        mask: H×W uint8 image (0 or 255)

    Returns:
        4 corners as [(x, y), (x, y), (x, y), (x, y)]

    Raises:
        ValueError: if no valid contour found
    """
    # Ensure binary
    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    # Morphological cleanup: close small gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        raise ValueError("No contours found in mask")

    # Select largest contour
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)

    if area < 100:
        raise ValueError(f"Largest contour too small: {area:.0f} px")

    # Try polygon approximation
    peri = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

    if len(approx) == 4:
        # Good — use the 4-point approximation
        points = approx.reshape(4, 2).astype(float)
    else:
        # Fallback to minimum area rectangle
        rect = cv2.minAreaRect(largest)
        box = cv2.boxPoints(rect)
        points = box.astype(float)

    # Order corners: tl, tr, br, bl
    corners = _order_corners(points)
    return [(float(c[0]), float(c[1])) for c in corners]


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Order 4 points as [top-left, top-right, bottom-right, bottom-left].

    Strategy:
    - Sort by sum (x+y): smallest = TL, largest = BR
    - Sort by diff (y-x): smallest = TR, largest = BL
    """
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).flatten()

    ordered = np.zeros((4, 2), dtype=np.float64)
    ordered[0] = pts[np.argmin(s)]   # top-left
    ordered[2] = pts[np.argmax(s)]   # bottom-right
    ordered[1] = pts[np.argmin(d)]   # top-right
    ordered[3] = pts[np.argmax(d)]   # bottom-left

    return ordered
