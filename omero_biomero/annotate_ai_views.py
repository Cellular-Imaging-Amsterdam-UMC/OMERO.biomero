"""Django views for omero_annotate_ai FAIR annotation workflow integration.

Provides API endpoints for:
- Container/image browsing
- AnnotationConfig CRUD (FAIR metadata schema)
- Tracking table management
- Annotation save/fetch (polygon → label mask → ROIs)
- Progress monitoring
"""

import json
import logging
import os
import tempfile

import omero
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from omeroweb.webclient.decorators import login_required

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_omero_annotate_ai():
    """Lazy-import omero_annotate_ai to avoid hard crash if not installed."""
    try:
        from omero_annotate_ai.core.annotation_config import (
            AIModelConfig,
            AnnotationConfig,
            AnnotationMethodology,
            AuthorInfo,
            ImageAnnotation,
            OMEROConfig,
            SpatialCoverage,
            StudyContext,
            TrainingConfig,
            WorkflowConfig,
        )
        from omero_annotate_ai.omero.omero_functions import (
            create_or_replace_tracking_table,
            download_annotation_config_from_omero,
            list_annotation_tables,
            sync_config_to_omero_table,
            sync_omero_table_to_config,
            upload_annotation_config_to_omero,
            upload_rois_and_labels,
        )
        from omero_annotate_ai.omero.omero_utils import (
            list_annotations_by_namespace,
        )

        return {
            "AnnotationConfig": AnnotationConfig,
            "AnnotationMethodology": AnnotationMethodology,
            "AIModelConfig": AIModelConfig,
            "AuthorInfo": AuthorInfo,
            "ImageAnnotation": ImageAnnotation,
            "OMEROConfig": OMEROConfig,
            "SpatialCoverage": SpatialCoverage,
            "StudyContext": StudyContext,
            "TrainingConfig": TrainingConfig,
            "WorkflowConfig": WorkflowConfig,
            "create_or_replace_tracking_table": create_or_replace_tracking_table,
            "download_annotation_config_from_omero": download_annotation_config_from_omero,
            "list_annotation_tables": list_annotation_tables,
            "sync_config_to_omero_table": sync_config_to_omero_table,
            "sync_omero_table_to_config": sync_omero_table_to_config,
            "upload_annotation_config_to_omero": upload_annotation_config_to_omero,
            "upload_rois_and_labels": upload_rois_and_labels,
            "list_annotations_by_namespace": list_annotations_by_namespace,
        }
    except Exception as e:
        logger.error("omero_annotate_ai import failed: %s", e, exc_info=True)
        # Store error for informative API responses
        _get_omero_annotate_ai._last_error = str(e)
        return None


_get_omero_annotate_ai._last_error = None


CONFIG_NS = "openmicroscopy.org/omero/annotate/config"


def _upload_config_yaml(conn, lib, config, container_type, container_id):
    """Save config as YAML FileAnnotation, replacing any previous config attachments."""
    # Delete existing config YAML FileAnnotations to avoid accumulating temp files
    try:
        existing = lib["list_annotations_by_namespace"](
            conn, container_type.capitalize(), container_id, CONFIG_NS
        )
        if existing:
            ann_ids = [a["id"] for a in existing]
            conn.deleteObjects("FileAnnotation", ann_ids, wait=True)
    except Exception:
        logger.debug("Could not clean up old config annotations", exc_info=True)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as tmp:
        config.save_yaml(tmp.name)
        tmp_path = tmp.name
    try:
        ann_id = lib["upload_annotation_config_to_omero"](
            conn, container_type, container_id, tmp_path
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return ann_id


def _geojson_namespace(table_id):
    """Return the OMERO namespace for GeoJSON annotations tied to a tracking table."""
    return f"omero.biomero.annotations.{table_id}"


def _annotations_from_geojson(data):
    """Normalise annotation input to a list of ``{points: [[x, y], ...]}`` dicts.

    Accepts either a GeoJSON FeatureCollection or the legacy list format.
    """
    if isinstance(data, dict) and data.get("type") == "FeatureCollection":
        result = []
        for feature in data.get("features", []):
            coords = feature.get("geometry", {}).get("coordinates", [])
            if coords:
                result.append({"points": coords[0]})
        return result
    # Legacy: list of {points: [...]}
    return data


def polygons_to_label_mask(annotations, width, height):
    """Convert web polygon annotations to a label mask image.

    Each polygon gets a unique integer label (1, 2, 3, …).

    Args:
        annotations: list of dicts with ``points`` key ([[x, y], …])
        width: image width in pixels
        height: image height in pixels

    Returns:
        numpy int32 array of shape (height, width)
    """
    import cv2
    import numpy as np

    mask = np.zeros((height, width), dtype=np.int32)
    for i, ann in enumerate(annotations, start=1):
        pts = np.array(ann["points"], dtype=np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(mask, [pts], color=int(i))
    return mask


# ---------------------------------------------------------------------------
# Container / image browsing
# ---------------------------------------------------------------------------


@login_required()
@require_GET
def list_containers(request, conn=None, **kwargs):
    """List datasets or plates accessible to the current user.

    Query params:
        type  – 'dataset' (default) or 'plate'
        group – OMERO group id (optional, defaults to current)
    """
    container_type = request.GET.get("type", "dataset")
    group_id = request.GET.get("group")

    if group_id:
        conn.SERVICE_OPTS.setOmeroGroup(int(group_id))
    else:
        conn.SERVICE_OPTS.setOmeroGroup(-1)

    obj_type = "Dataset" if container_type == "dataset" else "Plate"
    containers = []
    for obj in conn.getObjects(obj_type):
        containers.append(
            {
                "id": obj.getId(),
                "name": obj.getName(),
                "type": container_type,
                "childCount": obj.countChildren()
                if hasattr(obj, "countChildren")
                else 0,
            }
        )

    return JsonResponse({"containers": containers})


@login_required()
@require_GET
def get_container_images(request, conn=None, **kwargs):
    """Return images inside a container with basic dimension metadata.

    Query params:
        type – 'dataset' | 'plate'
        id   – container id
    """
    container_type = request.GET.get("type", "dataset")
    container_id = request.GET.get("id")
    if not container_id:
        return JsonResponse({"error": "Missing container id"}, status=400)

    try:
        container_id = int(container_id)
    except ValueError:
        return JsonResponse({"error": "Invalid container id"}, status=400)

    images = []

    if container_type == "dataset":
        dataset = conn.getObject("Dataset", container_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)
        for img in dataset.listChildren():
            images.append(
                {
                    "id": img.getId(),
                    "name": img.getName(),
                    "sizeX": img.getSizeX(),
                    "sizeY": img.getSizeY(),
                    "sizeC": img.getSizeC(),
                    "sizeZ": img.getSizeZ(),
                    "sizeT": img.getSizeT(),
                }
            )
    elif container_type == "plate":
        plate = conn.getObject("Plate", container_id)
        if not plate:
            return JsonResponse({"error": "Plate not found"}, status=404)
        for well in plate.listChildren():
            for idx in range(well.countWellSample()):
                ws = well.getWellSample(idx)
                img = ws.image()
                if img:
                    images.append(
                        {
                            "id": img.getId(),
                            "name": img.getName(),
                            "sizeX": img.getSizeX(),
                            "sizeY": img.getSizeY(),
                            "sizeC": img.getSizeC(),
                            "sizeZ": img.getSizeZ(),
                            "sizeT": img.getSizeT(),
                            "wellId": well.getId(),
                            "wellPos": f"{well.row}{well.column}",
                        }
                    )
    else:
        return JsonResponse(
            {"error": f"Unsupported container type: {container_type}"}, status=400
        )

    return JsonResponse({"images": images, "count": len(images)})


@login_required()
@require_GET
def get_image_channels(request, conn=None, **kwargs):
    """Return channel info + dimensions for an image.

    Query params:
        image – image id
    """
    image_id = request.GET.get("image")
    if not image_id:
        return JsonResponse({"error": "Missing image ID"}, status=400)

    image = conn.getObject("Image", image_id)
    if not image:
        return JsonResponse({"error": "Image not found"}, status=404)

    channels = []
    for idx, ch in enumerate(image.getChannels()):
        color = ch.getColor()
        channels.append(
            {
                "index": idx,
                "name": ch.getLabel(),
                "color": color.getHtml() if color else "#ffffff",
                "active": ch.isActive(),
                "window": {
                    "start": ch.getWindowStart(),
                    "end": ch.getWindowEnd(),
                    "min": ch.getWindowMin(),
                    "max": ch.getWindowMax(),
                },
            }
        )

    return JsonResponse(
        {
            "channels": channels,
            "sizeC": image.getSizeC(),
            "sizeZ": image.getSizeZ(),
            "sizeT": image.getSizeT(),
            "sizeX": image.getSizeX(),
            "sizeY": image.getSizeY(),
        }
    )


# ---------------------------------------------------------------------------
# AnnotationConfig CRUD
# ---------------------------------------------------------------------------


@login_required()
def manage_config(request, conn=None, **kwargs):
    """GET: load config from container. POST: create/update config."""
    if request.method == "GET":
        return _load_config(request, conn)
    elif request.method == "POST":
        return _save_config(request, conn)
    return JsonResponse({"error": "Method not allowed"}, status=405)


def _load_config(request, conn):
    """Load AnnotationConfig YAML from a container's FileAnnotation."""
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    container_type = request.GET.get("type", "dataset")
    container_id = request.GET.get("id")
    if not container_id:
        return JsonResponse({"error": "Missing container id"}, status=400)

    try:
        config = lib["download_annotation_config_from_omero"](
            conn, container_type, int(container_id)
        )
        if config is None:
            return JsonResponse({"config": None, "found": False})
        return JsonResponse({"config": config.model_dump(mode="json"), "found": True})
    except Exception as e:
        logger.error("Error loading annotation config", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _save_config(request, conn):
    """Create AnnotationConfig from JSON body, validate, save as YAML FileAnnotation."""
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    try:
        data = json.loads(request.body)

        # Build AnnotationConfig from submitted data
        config = lib["AnnotationConfig"](**data)

        # Ensure group context matches the container
        container_type = config.omero.container_type
        primary_id = config.omero.get_primary_container_id()
        if primary_id:
            container = conn.getObject(container_type.capitalize(), primary_id)
            if container:
                group_id = container.getDetails().getGroup().getId()
                conn.SERVICE_OPTS.setOmeroGroup(group_id)

        # Save YAML as FileAnnotation on container (replaces previous)
        ann_id = _upload_config_yaml(conn, lib, config, container_type, primary_id)

        return JsonResponse(
            {
                "success": True,
                "config": config.model_dump(mode="json"),
                "annotation_id": ann_id,
            }
        )
    except Exception as e:
        logger.error("Error saving annotation config", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# Tracking table management
# ---------------------------------------------------------------------------


@login_required()
def manage_tracking_table(request, conn=None, **kwargs):
    """GET: list tables. POST: initialize new table from config."""
    if request.method == "GET":
        return _list_tracking_tables(request, conn)
    elif request.method == "POST":
        return _create_tracking_table(request, conn)
    return JsonResponse({"error": "Method not allowed"}, status=405)


def _list_tracking_tables(request, conn):
    """List annotation tracking tables attached to a container."""
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    container_type = request.GET.get("type", "dataset")
    container_id = request.GET.get("id")
    if not container_id:
        return JsonResponse({"error": "Missing container id"}, status=400)

    try:
        tables = lib["list_annotation_tables"](conn, container_type, int(container_id))
        return JsonResponse({"tables": tables})
    except Exception as e:
        logger.error("Error listing tracking tables", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _create_tracking_table(request, conn):
    """Initialize a tracking table from an AnnotationConfig.

    Expects JSON body with the full config dict.
    Creates ImageAnnotation processing units and an OMERO table.
    """
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    try:
        data = json.loads(request.body)
        config = lib["AnnotationConfig"](**data)

        container_type = config.omero.container_type
        primary_id = config.omero.get_primary_container_id()

        # Set group context
        if primary_id:
            container = conn.getObject(container_type.capitalize(), primary_id)
            if container:
                group_id = container.getDetails().getGroup().getId()
                conn.SERVICE_OPTS.setOmeroGroup(group_id)

        # Get images from container
        image_ids = _get_image_ids_from_container(conn, config)
        if not image_ids:
            return JsonResponse(
                {"error": "No images found in the specified container(s)"},
                status=400,
            )

        # Build processing units (ImageAnnotation objects)
        images_list = []
        for img_id in image_ids:
            img = conn.getObject("Image", img_id)
            if img:
                images_list.append({"id": img_id, "name": img.getName()})

        _prepare_processing_units(config, images_list)

        if not config.annotations:
            return JsonResponse(
                {"error": "No processing units generated from configuration"},
                status=400,
            )

        # Create OMERO table
        table_name = f"annotate_ai_{config.name}"
        df = config.to_dataframe()
        table_id = lib["create_or_replace_tracking_table"](
            conn,
            config_df=df,
            table_title=table_name,
            container_type=container_type,
            container_id=primary_id,
            container_ids=config.omero.get_all_container_ids()
            if config.omero.is_multi_container()
            else None,
        )

        config.omero.table_id = table_id

        # Save config YAML (replaces previous)
        _upload_config_yaml(conn, lib, config, container_type, primary_id)

        # Build response with processing units summary
        units = []
        for ann in config.annotations:
            units.append(ann.model_dump(mode="json"))

        return JsonResponse(
            {
                "success": True,
                "table_id": table_id,
                "units": units,
                "progress": config.get_progress_summary(),
            }
        )
    except Exception as e:
        logger.error("Error creating tracking table", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _get_image_ids_from_container(conn, config):
    """Get image IDs from OMERO container(s), respecting config settings."""
    container_type = config.omero.container_type
    all_ids = config.omero.get_all_container_ids()
    image_ids = set()

    for cid in all_ids:
        if container_type == "dataset":
            dataset = conn.getObject("Dataset", cid)
            if dataset:
                for img in dataset.listChildren():
                    image_ids.add(img.getId())
        elif container_type == "plate":
            plate = conn.getObject("Plate", cid)
            if plate:
                for well in plate.listChildren():
                    for idx in range(well.countWellSample()):
                        ws = well.getWellSample(idx)
                        img = ws.image()
                        if img:
                            image_ids.add(img.getId())

    return list(image_ids)


def _prepare_processing_units(config, images_list):
    """Populate config.annotations with ImageAnnotation processing units.

    Follows the same logic as AnnotationPipeline._prepare_processing_units
    but without requiring a full pipeline instance.
    """
    lib = _get_omero_annotate_ai()
    if not lib:
        return

    sc = config.spatial_coverage
    tc = config.training

    # Determine how many images to use and their categories
    total_images = len(images_list)
    if tc.segment_all:
        n_train = max(1, int(total_images * tc.train_fraction))
        n_val = int(total_images * tc.validation_fraction)
        n_test = int(total_images * tc.test_fraction)
    else:
        n_train = tc.train_n
        n_val = tc.validate_n
        n_test = tc.test_n

    # Assign categories
    categories = []
    for i in range(min(n_train, total_images)):
        categories.append("training")
    for i in range(min(n_val, max(0, total_images - n_train))):
        categories.append("validation")
    for i in range(min(n_test, max(0, total_images - n_train - n_val))):
        categories.append("test")

    # Use only as many images as we have categories for
    selected_images = images_list[: len(categories)]

    config.annotations.clear()

    for idx, img_info in enumerate(selected_images):
        category = categories[idx] if idx < len(categories) else "training"

        # Determine z-slices, timepoints, channels from spatial coverage
        z_slices = sc.z_slices if not sc.three_d else [sc.z_range_start or 0]
        timepoints = sc.timepoints
        channel = sc.get_label_channel()

        for z in z_slices:
            for t in timepoints:
                if sc.use_patches:
                    # Generate patch coordinates
                    for p_idx in range(sc.patches_per_image):
                        z_start_val = (sc.z_range_start or 0) if sc.three_d else -1
                        z_end_val = (sc.z_range_end or 0) if sc.three_d else -1
                        ann = lib["ImageAnnotation"](
                            image_id=img_info["id"],
                            image_name=img_info["name"],
                            category=category,
                            timepoint=t,
                            z_slice=z,
                            channel=channel,
                            is_volumetric=sc.three_d,
                            z_start=z_start_val,
                            z_end=z_end_val,
                            z_length=sc.get_z_length() if sc.three_d else 1,
                            is_patch=True,
                            patch_width=sc.patch_size[0],
                            patch_height=sc.patch_size[1]
                            if len(sc.patch_size) > 1
                            else sc.patch_size[0],
                        )
                        config.add_annotation(ann)
                else:
                    z_start_val = (sc.z_range_start or 0) if sc.three_d else -1
                    z_end_val = (sc.z_range_end or 0) if sc.three_d else -1
                    ann = lib["ImageAnnotation"](
                        image_id=img_info["id"],
                        image_name=img_info["name"],
                        category=category,
                        timepoint=t,
                        z_slice=z,
                        channel=channel,
                        is_volumetric=sc.three_d,
                        z_start=z_start_val,
                        z_end=z_end_val,
                        z_length=sc.get_z_length() if sc.three_d else 1,
                    )
                    config.add_annotation(ann)


def _delete_tracking_table(request, conn, table_id):
    """Delete a tracking table FileAnnotation from OMERO."""
    if not table_id:
        return JsonResponse({"error": "Missing table_id"}, status=400)
    try:
        file_ann = conn.getObject("FileAnnotation", int(table_id))
        if not file_ann:
            return JsonResponse({"error": "Table not found"}, status=404)
        conn.deleteObjects("Annotation", [int(table_id)], wait=True)
        return JsonResponse({"success": True, "deleted_id": table_id})
    except Exception as e:
        logger.error("Error deleting tracking table %s", table_id, exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_http_methods(["GET", "DELETE"])
def get_tracking_table_detail(request, conn=None, table_id=None, **kwargs):
    """GET: tracking table data + progress. DELETE: remove the table annotation.

    URL param: table_id
    """
    if request.method == "DELETE":
        return _delete_tracking_table(request, conn, table_id)
    # GET path follows below
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    if not table_id:
        return JsonResponse({"error": "Missing table_id"}, status=400)

    try:
        import ezomero

        table_data = ezomero.get_table(conn, int(table_id))
        if table_data is None:
            return JsonResponse({"error": "Table not found"}, status=404)

        # Convert DataFrame to list of dicts for JSON
        units = table_data.to_dict(orient="records")

        # Compute progress
        total = len(units)
        completed = sum(1 for u in units if u.get("processed", False))

        return JsonResponse(
            {
                "table_id": table_id,
                "units": units,
                "progress": {
                    "total_units": total,
                    "completed_units": completed,
                    "pending_units": total - completed,
                    "progress_percent": round(100 * completed / total, 1)
                    if total > 0
                    else 0,
                },
            }
        )
    except Exception as e:
        logger.error("Error fetching tracking table detail", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# Annotation save / fetch
# ---------------------------------------------------------------------------


@login_required()
@require_POST
def save_annotation(request, conn=None, **kwargs):
    """Save web polygon annotations for a processing unit.

    Converts polygons to label mask, uploads via upload_rois_and_labels(),
    and updates the tracking table.

    Expects JSON body:
        image_id: int
        annotations: list of {points: [[x,y], ...], typeId: str}
        table_id: int
        unit_index: int (row index in tracking table)
        width: int (image width)
        height: int (image height)
        z_slice: int (optional)
        timepoint: int (optional)
        channel: int (optional)
        patch_offset: [x, y] (optional)
        config_name: str (optional, for naming)
    """
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    try:
        data = json.loads(request.body)
        image_id = data["image_id"]
        annotations = _annotations_from_geojson(data["annotations"])
        table_id = data.get("table_id")
        unit_index = data.get("unit_index")
        width = data.get("width")
        height = data.get("height")
        z_slice = data.get("z_slice")
        timepoint = data.get("timepoint")
        channel = data.get("channel")
        patch_offset = data.get("patch_offset")
        config_name = data.get("config_name", "web_annotation")

        # Set group context
        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)
        group_id = image.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)

        if not annotations:
            return JsonResponse({"error": "No annotations provided"}, status=400)

        # Use actual image dimensions from OMERO if not provided or unreliable
        if not width or not height or width < 10 or height < 10:
            width = image.getSizeX()
            height = image.getSizeY()

        # Convert polygons to label mask
        mask = polygons_to_label_mask(annotations, width, height)

        # Save mask as temp TIFF
        import tifffile

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
                tifffile.imwrite(tmp.name, mask)
                tmp_path = tmp.name

            # Upload via omero_annotate_ai
            patch_tuple = tuple(patch_offset) if patch_offset else None
            label_id, roi_id = lib["upload_rois_and_labels"](
                conn,
                image_id=image_id,
                annotation_file=tmp_path,
                patch_offset=patch_tuple,
                trainingset_name=config_name,
                timepoint=timepoint,
                z_slice=z_slice,
                channel=channel,
            )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

        # Persist GeoJSON as a namespaced FileAnnotation so that fetch_annotation
        # can retrieve annotations per-workflow without scanning all ROIs.
        # Use table_id for namespace to ensure set isolation.
        if table_id is not None:
            namespace = _geojson_namespace(int(table_id))
        else:
            namespace = f"omero.biomero.annotations.{config_name}"
        _save_geojson_file_ann(conn, image_id, data["annotations"], namespace)

        # Update tracking table if provided
        new_table_id = int(table_id) if table_id is not None else None
        if table_id is not None and unit_index is not None:
            new_table_id = _update_tracking_table_row(
                conn, lib, int(table_id), int(unit_index), roi_id, label_id
            )

        return JsonResponse(
            {
                "success": True,
                "label_id": label_id,
                "roi_id": roi_id,
                "namespace": namespace,
                "table_id": new_table_id,
            }
        )
    except KeyError as e:
        return JsonResponse({"error": f"Missing required field: {e}"}, status=400)
    except Exception as e:
        logger.error("Error saving annotation", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def mark_unit_processed(request, conn=None, **kwargs):
    """Mark a tracking table unit as processed without annotations.

    Used when user reviews an image and finds nothing to label.

    POST JSON body:
        table_id: int — tracking table ID
        unit_index: int — row index in tracking table

    Returns JSON:
        success: bool
        table_id: int — new table ID (may change due to delete+recreate)
    """
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    try:
        data = json.loads(request.body)
        table_id = data.get("table_id")
        unit_index = data.get("unit_index")

        if table_id is None or unit_index is None:
            return JsonResponse(
                {"error": "Missing required fields: table_id and unit_index"},
                status=400,
            )

        new_table_id = _update_tracking_table_row(
            conn, lib, int(table_id), int(unit_index), "", ""
        )

        return JsonResponse({"success": True, "table_id": new_table_id})
    except Exception as e:
        logger.error("Error marking unit processed", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _save_geojson_file_ann(conn, image_id, geojson, namespace):
    """Persist a GeoJSON FeatureCollection as a namespaced FileAnnotation on an image.

    Any existing FileAnnotation with the same namespace is replaced, so
    re-annotating the same processing unit stays idempotent.

    Args:
        conn: OMERO connection
        image_id: OMERO Image ID
        geojson: GeoJSON FeatureCollection dict (the original request payload)
        namespace: OMERO namespace string, e.g. ``omero.biomero.annotations.my_workflow``
    """
    image = conn.getObject("Image", image_id)
    if not image:
        logger.warning("_save_geojson_file_ann: image %s not found", image_id)
        return

    # Remove any pre-existing annotation for this namespace
    to_delete = [
        ann.getId()
        for ann in image.listAnnotations()
        if isinstance(ann, omero.gateway.FileAnnotationWrapper)
        and ann.getNs() == namespace
    ]
    if to_delete:
        try:
            conn.deleteObjects("Annotation", to_delete, wait=True)
        except Exception:
            logger.warning(
                "Could not delete old GeoJSON annotation for ns=%s", namespace
            )

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".geojson", delete=False
    ) as tmp:
        json.dump(geojson, tmp)
        tmp_path = tmp.name

    try:
        file_ann = conn.createFileAnnfromLocalFile(
            tmp_path,
            mimetype="application/geo+json",
            ns=namespace,
            desc=namespace,
        )
        image.linkAnnotation(file_ann)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _config_name_from_table_id(conn, table_id):
    """Derive the annotation workflow config name from a tracking table FileAnnotation.

    The table is stored with filename ``annotate_ai_<config_name>`` by convention
    (see ``_create_tracking_table``).  Returns ``None`` if the pattern is not matched.

    Args:
        conn: OMERO connection
        table_id: FileAnnotation ID of the tracking table

    Returns:
        str config name, or None
    """
    try:
        file_ann = conn.getObject("FileAnnotation", int(table_id))
        if not file_ann:
            return None
        filename = file_ann.getFileName() or ""
        # Strip any extension that ezomero / HDF5 backend may have appended
        stem = filename.split(".")[0]
        prefix = "annotate_ai_"
        if stem.startswith(prefix):
            return stem[len(prefix):]
    except Exception:
        logger.debug("Could not derive config_name from table_id=%s", table_id)
    return None


def _update_tracking_table_row(conn, lib, table_id, unit_index, roi_id, label_id):
    """Mark a row in the tracking table as processed.

    Args:
        conn: OMERO connection
        lib: omero_annotate_ai lazy-import dict
        table_id: FileAnnotation ID of the tracking table
        unit_index: row index in the table to update
        roi_id: OMERO ROI ID created for the annotation
        label_id: OMERO FileAnnotation ID for the label file

    Returns:
        The new table ID (may differ from *table_id* because
        ``create_or_replace_tracking_table`` deletes and recreates the table),
        or *table_id* unchanged if the update could not be performed.
    """
    try:
        from datetime import datetime

        import ezomero

        # ezomero.get_table expects a FileAnnotation ID
        table_data = ezomero.get_table(conn, table_id)
        if table_data is None or unit_index >= len(table_data):
            logger.warning("Could not update tracking table row %d", unit_index)
            return table_id

        table_data.at[unit_index, "processed"] = True
        table_data.at[unit_index, "roi_id"] = str(roi_id) if roi_id else "None"
        table_data.at[unit_index, "label_id"] = str(label_id) if label_id else "None"
        table_data.at[unit_index, "annotation_updated_at"] = datetime.now().isoformat()
        if table_data.at[unit_index, "annotation_created_at"] in (None, "None", ""):
            table_data.at[unit_index, "annotation_created_at"] = (
                datetime.now().isoformat()
            )

        # Find the container linked to this FileAnnotation so we can re-attach
        file_ann = conn.getObject("FileAnnotation", table_id)
        if not file_ann:
            logger.warning("FileAnnotation %d not found for tracking table", table_id)
            return table_id

        # Look up container from annotation links
        links = list(conn.getAnnotationLinks("Dataset", ann_ids=[table_id]))
        container_type = "dataset"
        if not links:
            links = list(conn.getAnnotationLinks("Plate", ann_ids=[table_id]))
            container_type = "plate"

        if not links:
            logger.warning("No container links found for table %d", table_id)
            return table_id

        container_id = links[0].getParent().getId()
        table_title = file_ann.getFileName() or "annotate_ai_table"

        new_table_id = lib["create_or_replace_tracking_table"](
            conn,
            config_df=table_data,
            table_title=table_title,
            container_type=container_type,
            container_id=container_id,
            existing_table_id=table_id,
        )
        return new_table_id
    except Exception as e:
        logger.error("Error updating tracking table row: %s", e, exc_info=True)
        return table_id


@login_required()
@require_POST
def add_patch(request, conn=None, **kwargs):
    """Add a patch (sub-region) to the tracking table for an image.

    POST JSON body:
        table_id: int — tracking table ID
        image_id: int — source image ID
        image_name: str — source image name
        patch_x: int — X offset of patch
        patch_y: int — Y offset of patch
        patch_width: int — width of patch
        patch_height: int — height of patch
        category: str — "training", "validation", or "test" (optional, defaults to "training")

    Returns JSON:
        success: bool
        table_id: int — new table ID (may change)
        unit_index: int — index of the new row
    """
    lib = _get_omero_annotate_ai()
    if not lib:
        err = _get_omero_annotate_ai._last_error or "unknown"
        return JsonResponse(
            {"error": f"omero_annotate_ai not available: {err}"}, status=500
        )

    try:
        import ezomero
        import pandas as pd

        data = json.loads(request.body)

        # Validate required fields
        required = ["table_id", "image_id", "image_name", "patch_x", "patch_y", "patch_width", "patch_height"]
        missing = [f for f in required if data.get(f) is None]
        if missing:
            return JsonResponse(
                {"error": f"Missing required fields: {', '.join(missing)}"},
                status=400,
            )

        table_id = int(data["table_id"])
        image_id = int(data["image_id"])
        image_name = str(data["image_name"])
        patch_x = int(data["patch_x"])
        patch_y = int(data["patch_y"])
        patch_width = int(data["patch_width"])
        patch_height = int(data["patch_height"])
        category = str(data.get("category", "training"))

        # Load existing tracking table
        table_data = ezomero.get_table(conn, table_id)
        if table_data is None:
            return JsonResponse({"error": "Table not found"}, status=404)

        # Determine train/validate flags from category
        is_train = category in ("training",)
        is_validate = category == "validation"

        # Build a new row matching the tracking table schema.
        # Use existing columns as a template, filling defaults for unknown columns.
        new_row = {}
        for col in table_data.columns:
            new_row[col] = None

        new_row["image_id"] = image_id
        new_row["image_name"] = image_name
        new_row["is_patch"] = True
        new_row["patch_x"] = patch_x
        new_row["patch_y"] = patch_y
        new_row["patch_width"] = patch_width
        new_row["patch_height"] = patch_height
        new_row["processed"] = False
        new_row["train"] = is_train
        new_row["validate"] = is_validate
        new_row["roi_id"] = ""
        new_row["label_id"] = ""
        new_row["annotation_created_at"] = ""
        new_row["annotation_updated_at"] = ""

        # Fill remaining None values with sensible defaults based on dtype
        for col in table_data.columns:
            if new_row.get(col) is None:
                dtype = table_data[col].dtype
                if pd.api.types.is_bool_dtype(dtype):
                    new_row[col] = False
                elif pd.api.types.is_integer_dtype(dtype):
                    new_row[col] = 0
                elif pd.api.types.is_float_dtype(dtype):
                    new_row[col] = 0.0
                else:
                    new_row[col] = ""

        # Append the new row
        new_row_df = pd.DataFrame([new_row])
        updated_table = pd.concat([table_data, new_row_df], ignore_index=True)
        unit_index = len(updated_table) - 1

        # Find the container linked to this FileAnnotation
        file_ann = conn.getObject("FileAnnotation", table_id)
        if not file_ann:
            return JsonResponse({"error": "Tracking table FileAnnotation not found"}, status=404)

        links = list(conn.getAnnotationLinks("Dataset", ann_ids=[table_id]))
        container_type = "dataset"
        if not links:
            links = list(conn.getAnnotationLinks("Plate", ann_ids=[table_id]))
            container_type = "plate"

        if not links:
            logger.warning("No container links found for table %d", table_id)
            return JsonResponse({"error": "No container linked to tracking table"}, status=500)

        container_id = links[0].getParent().getId()
        table_title = file_ann.getFileName() or "annotate_ai_table"

        new_table_id = lib["create_or_replace_tracking_table"](
            conn,
            config_df=updated_table,
            table_title=table_title,
            container_type=container_type,
            container_id=container_id,
            existing_table_id=table_id,
        )

        return JsonResponse(
            {
                "success": True,
                "table_id": new_table_id,
                "unit_index": unit_index,
            }
        )
    except KeyError as e:
        return JsonResponse({"error": f"Missing required field: {e}"}, status=400)
    except Exception as e:
        logger.error("Error adding patch to tracking table", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def fetch_annotation(request, conn=None, **kwargs):
    """Fetch existing annotations for an image from OMERO.

    Looks for a namespaced GeoJSON FileAnnotation first (written by
    ``save_annotation`` for each workflow).  Falls back to scanning all ROI
    shapes when no matching FileAnnotation is found, preserving backwards
    compatibility with annotations created before namespace support was added.

    Query params:
        image      – image id (required)
        table_id   – tracking table FileAnnotation id; used as the primary
                     namespace key (``omero.biomero.annotations.{table_id}``)
                     for set isolation
        config_name – fallback workflow name / namespace suffix when
                     ``table_id`` is not given (legacy support)
    """
    image_id = request.GET.get("image")
    if not image_id:
        return JsonResponse({"error": "Missing image ID"}, status=400)

    table_id = request.GET.get("table_id")
    config_name = request.GET.get("config_name")

    try:
        image = conn.getObject("Image", int(image_id))
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        # ----------------------------------------------------------------
        # 1. Namespace-aware path: look for a GeoJSON FileAnnotation
        # ----------------------------------------------------------------
        # Prefer table_id-based namespace for set isolation; fall back to
        # config_name for backwards compatibility with older annotations.
        if table_id:
            namespace = _geojson_namespace(int(table_id))
        elif config_name:
            namespace = f"omero.biomero.annotations.{config_name}"
        else:
            namespace = None

        if namespace:
            for ann in image.listAnnotations():
                if (
                    isinstance(ann, omero.gateway.FileAnnotationWrapper)
                    and ann.getNs() == namespace
                ):
                    try:
                        content = b"".join(ann.getFileInChunks())
                        geojson = json.loads(content)
                        # Ensure it is a FeatureCollection
                        if geojson.get("type") == "FeatureCollection":
                            return JsonResponse(geojson)
                    except Exception:
                        logger.warning(
                            "Could not read GeoJSON FileAnnotation %s", ann.getId()
                        )

        # ----------------------------------------------------------------
        # 2. Fallback: reconstruct from ROI shapes (pre-namespace data)
        # ----------------------------------------------------------------
        roi_service = conn.getRoiService()
        result = roi_service.findByImage(int(image_id), None)

        features = []
        for roi in result.rois:
            for shape in roi.copyShapes():
                shape_data = _shape_to_points(shape)
                if shape_data:
                    features.append(
                        {
                            "type": "Feature",
                            "id": str(shape.getId().getValue()),
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [shape_data["points"]],
                                "plane": {
                                    "c": -1,
                                    "z": shape_data["z"],
                                    "t": shape_data["t"],
                                },
                            },
                            "properties": {
                                "objectType": "annotation",
                                "roiId": roi.getId().getValue(),
                            },
                        }
                    )

        return JsonResponse({"type": "FeatureCollection", "features": features})
    except Exception as e:
        logger.error("Error fetching annotations", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def _shape_to_points(shape):
    """Convert an OMERO PolygonI shape to a dict with points and plane info.

    Returns:
        dict with keys ``points`` ([[x, y], ...]), ``z``, ``t``, or None if
        the shape has fewer than 3 points or is not a Polygon.
    """
    if isinstance(shape, omero.model.PolygonI):
        points_str = shape.getPoints().getValue()
        points = []
        for pt in points_str.split(" "):
            coords = pt.split(",")
            if len(coords) == 2:
                try:
                    points.append([float(coords[0]), float(coords[1])])
                except ValueError:
                    continue
        if len(points) < 3:
            return None
        z = shape.getTheZ().getValue() if shape.getTheZ() else 0
        t = shape.getTheT().getValue() if shape.getTheT() else 0
        return {"points": points, "z": z, "t": t}
    return None


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------


@login_required()
@require_GET
def get_progress(request, conn=None, **kwargs):
    """Get annotation progress for a tracking table.

    Query params:
        table_id – tracking table id
    """
    table_id = request.GET.get("table_id")
    if not table_id:
        return JsonResponse({"error": "Missing table_id"}, status=400)

    try:
        import ezomero

        table_data = ezomero.get_table(conn, int(table_id))
        if table_data is None:
            return JsonResponse({"error": "Table not found"}, status=404)

        total = len(table_data)
        completed = (
            int(table_data["processed"].sum())
            if "processed" in table_data.columns
            else 0
        )

        return JsonResponse(
            {
                "table_id": int(table_id),
                "total_units": total,
                "completed_units": completed,
                "pending_units": total - completed,
                "progress_percent": round(100 * completed / total, 1)
                if total > 0
                else 0,
            }
        )
    except Exception as e:
        logger.error("Error fetching progress", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


# ---------------------------------------------------------------------------
# Training readiness validation
# ---------------------------------------------------------------------------

MIN_TRAIN_IMAGES = 5


@login_required()
@require_GET
def validate_training_readiness(request, conn=None, **kwargs):
    """Check whether an annotation set has enough annotated images per split.

    Query params:
        table_id – tracking table FileAnnotation id

    Returns JSON:
        {
            "ready": bool,
            "checks": [{"check": str, "level": "blocker|warning|pass", "message": str}],
            "summary": {
                "train_total": int, "train_done": int,
                "val_total": int, "val_done": int,
                "test_total": int, "test_done": int,
            }
        }
    """
    table_id = request.GET.get("table_id")
    if not table_id:
        return JsonResponse({"error": "Missing table_id"}, status=400)

    try:
        import ezomero

        table_data = ezomero.get_table(conn, int(table_id))
        if table_data is None:
            return JsonResponse({"error": "Table not found"}, status=404)

        # Split rows by role
        train_mask = table_data["train"] == True  # noqa: E712
        val_mask = table_data["validate"] == True  # noqa: E712
        test_mask = ~train_mask & ~val_mask

        train_rows = table_data[train_mask]
        val_rows = table_data[val_mask]
        test_rows = table_data[test_mask]

        train_total = len(train_rows)
        val_total = len(val_rows)
        test_total = len(test_rows)

        def _done(df):
            if "processed" not in df.columns or len(df) == 0:
                return 0
            return int(df["processed"].sum())

        train_done = _done(train_rows)
        val_done = _done(val_rows)
        test_done = _done(test_rows)

        checks = []

        # Training annotations check
        if train_total == 0 or train_done == 0:
            checks.append(
                {
                    "check": "train_annotations",
                    "level": "blocker",
                    "message": "No training images have been annotated.",
                }
            )
        else:
            checks.append(
                {
                    "check": "train_annotations",
                    "level": "pass",
                    "message": f"{train_done} training image(s) annotated.",
                }
            )

        # Training count warning (< MIN_TRAIN_IMAGES)
        if train_done > 0 and train_done < MIN_TRAIN_IMAGES:
            checks.append(
                {
                    "check": "train_count",
                    "level": "warning",
                    "message": (
                        f"Only {train_done} training image(s) annotated; "
                        f"at least {MIN_TRAIN_IMAGES} recommended."
                    ),
                }
            )
        elif train_done >= MIN_TRAIN_IMAGES:
            checks.append(
                {
                    "check": "train_count",
                    "level": "pass",
                    "message": f"{train_done} training image(s) meet the minimum threshold.",
                }
            )

        # Validation annotations check
        if val_total > 0 and val_done == 0:
            checks.append(
                {
                    "check": "val_annotations",
                    "level": "blocker",
                    "message": "Validation images exist but none have been annotated.",
                }
            )
        elif val_total > 0:
            checks.append(
                {
                    "check": "val_annotations",
                    "level": "pass",
                    "message": f"{val_done} validation image(s) annotated.",
                }
            )

        # Test annotations check (warning only)
        if test_total > 0 and test_done == 0:
            checks.append(
                {
                    "check": "test_annotations",
                    "level": "warning",
                    "message": "Test images exist but none have been annotated.",
                }
            )
        elif test_total > 0:
            checks.append(
                {
                    "check": "test_annotations",
                    "level": "pass",
                    "message": f"{test_done} test image(s) annotated.",
                }
            )

        ready = not any(c["level"] == "blocker" for c in checks)

        return JsonResponse(
            {
                "ready": ready,
                "checks": checks,
                "summary": {
                    "train_total": train_total,
                    "train_done": train_done,
                    "val_total": val_total,
                    "val_done": val_done,
                    "test_total": test_total,
                    "test_done": test_done,
                },
            }
        )
    except Exception as e:
        logger.error("Error validating training readiness", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
