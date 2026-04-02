import json
import logging
import os
import threading
import time

import numpy as np
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from omeroweb.webclient.decorators import login_required

logger = logging.getLogger(__name__)

# Pre-downloaded model path (set in Dockerfile), with fallback to auto-download
SAM_MODEL_PATH = os.environ.get("SAM_MODEL_PATH", "/opt/omero/web/models/mobile_sam.pt")

# ---------------------------------------------------------------------------
# Module-level SAM model singleton (lazy-loaded, thread-safe)
# ---------------------------------------------------------------------------
_sam_model = None
_sam_lock = threading.Lock()


def _get_sam_model():
    global _sam_model
    if _sam_model is None:
        with _sam_lock:
            if _sam_model is None:
                from ultralytics import SAM

                model_path = (
                    SAM_MODEL_PATH
                    if os.path.isfile(SAM_MODEL_PATH)
                    else "mobile_sam.pt"
                )
                logger.info("Loading MobileSAM model from %s ...", model_path)
                _sam_model = SAM(model_path)
                logger.info("MobileSAM model loaded.")
    return _sam_model


# ---------------------------------------------------------------------------
# Image cache — avoids re-fetching the OMERO plane on every prompt click
# ---------------------------------------------------------------------------
_image_cache = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 20
_CACHE_TTL = 600  # seconds


def _cache_key(image_id, z, t, channel):
    return f"{image_id}_{z}_{t}_{channel}"


def _evict_cache():
    """Remove expired entries and trim to max size."""
    now = time.time()
    expired = [k for k, v in _image_cache.items() if now - v["ts"] > _CACHE_TTL]
    for k in expired:
        del _image_cache[k]
    # LRU eviction if still over limit
    while len(_image_cache) > _CACHE_MAX:
        oldest_key = min(_image_cache, key=lambda k: _image_cache[k]["ts"])
        del _image_cache[oldest_key]


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


@login_required()
@require_POST
def set_image(request, conn=None, **kwargs):
    """
    Fetch an OMERO image plane and cache it for subsequent SAM predictions.

    Expects JSON body: { image_id, z, t, channel }
    Returns: { cache_key, width, height }
    """
    try:
        data = json.loads(request.body)
        image_id = data.get("image_id")
        z = data.get("z", 0)
        t = data.get("t", 0)
        channel = data.get("channel", 0)

        if not image_id:
            return JsonResponse({"error": "Missing image_id"}, status=400)

        rgb = _fetch_and_cache_image(conn, image_id, z, t, channel)
        key = _cache_key(image_id, z, t, channel)
        h, w = rgb.shape[:2]
        return JsonResponse({"cache_key": key, "width": w, "height": h})

    except Exception as e:
        logger.error("Error in SAM set_image", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _fetch_and_cache_image(conn, image_id, z, t, channel):
    """Fetch an OMERO image plane and store it in the per-process cache.

    Returns the cached RGB uint8 numpy array.
    """
    key = _cache_key(image_id, z, t, channel)

    # Check cache first
    with _cache_lock:
        entry = _image_cache.get(key)
        if entry:
            entry["ts"] = time.time()
            return entry["image"]

    # Fetch from OMERO
    image = conn.getObject("Image", image_id)
    if not image:
        raise ValueError(f"Image {image_id} not found")

    size_c = image.getSizeC()
    if channel < 0 or channel >= size_c:
        raise ValueError(f"Channel {channel} out of range (0-{size_c - 1})")

    pixels = image.getPrimaryPixels()
    plane = pixels.getPlane(z, channel, t)

    # Normalize to uint8
    if plane.dtype != np.uint8:
        pmin, pmax = np.percentile(plane, (1, 99.8))
        plane = np.clip((plane - pmin) / (pmax - pmin + 1e-8) * 255, 0, 255).astype(
            np.uint8
        )

    # SAM expects HxWx3 RGB
    if plane.ndim == 2:
        rgb = np.stack([plane, plane, plane], axis=-1)
    elif plane.shape[2] == 1:
        rgb = np.concatenate([plane, plane, plane], axis=-1)
    else:
        rgb = plane

    # Store in cache
    with _cache_lock:
        _image_cache[key] = {"image": rgb, "ts": time.time()}
        _evict_cache()

    return rgb


@login_required()
@require_POST
def predict(request, conn=None, **kwargs):
    """
    Run MobileSAM prediction with point or box prompts.

    Expects JSON body:
      { cache_key, image_id, z, t, channel, points?, labels?, bboxes? }
      - image_id, z, t, channel: used to re-fetch image on cache miss
      - points: [[x, y], ...] in pixel coords
      - labels: [1, 0, ...] where 1=foreground, 0=background
      - bboxes: [[x1, y1, x2, y2]] in pixel coords (XYXY format)

    Returns: { polygons: [[[x, y], ...], ...] }
    """
    try:
        data = json.loads(request.body)
        key = data.get("cache_key")
        image_id = data.get("image_id")
        z = data.get("z", 0)
        t = data.get("t", 0)
        channel = data.get("channel", 0)
        points = data.get("points")
        labels = data.get("labels")
        bboxes = data.get("bboxes")

        if not key and not image_id:
            return JsonResponse({"error": "Provide cache_key or image_id"}, status=400)

        # Try cache first; on miss, re-fetch from OMERO
        with _cache_lock:
            entry = _image_cache.get(key) if key else None
            if entry:
                entry["ts"] = time.time()
                rgb = entry["image"]
            else:
                rgb = None

        if rgb is None:
            if not image_id:
                return JsonResponse(
                    {"error": "Cache miss and no image_id provided"},
                    status=400,
                )
            rgb = _fetch_and_cache_image(conn, image_id, z, t, channel)

        model = _get_sam_model()

        # Build predict kwargs
        predict_kwargs = {}
        if points and labels:
            predict_kwargs["points"] = points
            predict_kwargs["labels"] = labels
        if bboxes:
            predict_kwargs["bboxes"] = bboxes

        if not predict_kwargs:
            return JsonResponse(
                {"error": "Provide points+labels or bboxes"}, status=400
            )

        results = model.predict(rgb, **predict_kwargs, verbose=False)

        # Extract polygon contours from masks
        polygons = []
        if results and len(results) > 0 and results[0].masks is not None:
            for contour in results[0].masks.xy:
                # contour is a numpy array of shape (N, 2)
                pts = contour.tolist()
                if len(pts) >= 3:
                    polygons.append(pts)

        return JsonResponse({"polygons": polygons})

    except Exception as e:
        logger.error("Error in SAM predict", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
