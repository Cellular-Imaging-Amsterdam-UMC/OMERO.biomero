from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from omeroweb.webclient.decorators import login_required
import json
import logging
import os
import tempfile
import uuid
import requests as http_requests
from omero.gateway import BlitzGateway
import omero

logger = logging.getLogger(__name__)

# Prediction microservice URL (set via environment variable in docker-compose)
PREDICTION_SERVICE_URL = os.environ.get("PREDICTION_SERVICE_URL", "http://prediction:5000")
ANNOTATION_NAMESPACE = "biomero.prediction.annotations"
ANNOTATION_VERSION = "2.0"
DEFAULT_ANNOTATION_SET_NAME = "Untitled annotation set"


def _get_prediction_dataset(conn, dataset_id):
    dataset = conn.getObject("Dataset", dataset_id)
    if dataset:
        group_id = dataset.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)
    return dataset


def _iter_prediction_annotation_files(parent):
    for ann in parent.listAnnotations():
        if not isinstance(ann, omero.gateway.FileAnnotationWrapper):
            continue
        if ann.getNs() != ANNOTATION_NAMESPACE:
            continue
        yield ann


def _read_annotation_payload(file_ann):
    content = bytearray()
    for chunk in file_ann.getFileInChunks():
        content.extend(chunk)
    return json.loads(content.decode("utf-8"))


def _normalize_annotation_payload(annotation_data, dataset_id):
    feature_types = annotation_data.get("featureTypes") or []
    annotations = []
    for ann in annotation_data.get("annotations") or []:
        normalized = dict(ann)
        if normalized.get("imageId") is not None:
            normalized["imageId"] = str(normalized["imageId"])
        annotations.append(normalized)

    return {
        "version": annotation_data.get("version") or ANNOTATION_VERSION,
        "name": annotation_data.get("name") or DEFAULT_ANNOTATION_SET_NAME,
        "description": annotation_data.get("description") or "",
        "datasetId": str(dataset_id),
        "featureTypes": feature_types,
        "annotations": annotations,
    }


def _build_annotation_set_summary(file_ann, payload):
    image_ids = {
        str(ann.get("imageId"))
        for ann in payload.get("annotations") or []
        if ann.get("imageId") is not None
    }
    return {
        "id": file_ann.getId(),
        "name": payload.get("name") or file_ann.getFile().getName(),
        "description": payload.get("description") or file_ann.getDescription() or "",
        "datasetId": payload.get("datasetId"),
        "annotationCount": len(payload.get("annotations") or []),
        "imageCount": len(image_ids),
    }


def _find_prediction_annotation_file(dataset, annotation_id):
    for ann in _iter_prediction_annotation_files(dataset):
        if str(ann.getId()) == str(annotation_id):
            return ann
    return None


@login_required()
@require_GET
def list_models(request, conn=None, **kwargs):
    """
    List available Prediction models by querying the prediction microservice.
    Falls back to built-in list if the service is unreachable.
    """
    try:
        resp = http_requests.get(
            f"{PREDICTION_SERVICE_URL}/models",
            timeout=10,
        )
        resp.raise_for_status()
        return JsonResponse(resp.json())
    except Exception as e:
        logger.warning(f"Prediction service unreachable, returning defaults: {e}")
        # Fallback to hardcoded list
        models = [
            {"value": "2D_versatile_fluo", "label": "2D_versatile_fluo (Built-in)", "type": "builtin"},
            {"value": "2D_versatile_he", "label": "2D_versatile_he (Built-in)", "type": "builtin"},
            {"value": "2D_demo", "label": "2D_demo (Built-in)", "type": "builtin"},
        ]
        return JsonResponse({"models": models})


@login_required()
@require_GET
def get_image_channels(request, conn=None, **kwargs):
    """
    Return channel information for an OMERO image.
    Expects ?image=ID
    Returns: { channels: [ {index, name, color, active} ] }
    """
    try:
        image_id = request.GET.get("image")
        if not image_id:
            return JsonResponse({"error": "Missing image ID"}, status=400)

        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        channels = []
        for idx, ch in enumerate(image.getChannels()):
            # getColor() returns an RGBA color object
            color = ch.getColor()
            channels.append({
                "index": idx,
                "name": ch.getLabel(),
                "color": color.getHtml() if color else "#ffffff",
                "active": ch.isActive(),
            })

        return JsonResponse({
            "channels": channels,
            "sizeC": image.getSizeC(),
            "sizeZ": image.getSizeZ(),
            "sizeT": image.getSizeT(),
        })

    except Exception as e:
        logger.error("Error fetching image channels", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def run_prediction(request, conn=None, **kwargs):
    """
    Run Prediction on an OMERO image.
    
    Expects JSON body:
      { "image_id": int, "model": str, "channel": int (optional, default 0) }
    
    Fetches the specified channel plane from OMERO, sends it to the prediction
    container, and returns the detected polygons.
    """
    try:
        data = json.loads(request.body)
        image_id = data.get("image_id")
        model_name = data.get("model", "2D_versatile_fluo")
        channel = data.get("channel", 0)
        z = data.get("z", 0)
        t = data.get("t", 0)

        if not image_id:
            return JsonResponse({"error": "Missing image_id"}, status=400)

        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        # Validate channel index
        size_c = image.getSizeC()
        if channel < 0 or channel >= size_c:
            return JsonResponse({"error": f"Channel {channel} out of range (0-{size_c-1})"}, status=400)

        # Fetch the specified channel plane
        pixels = image.getPrimaryPixels()
        plane = pixels.getPlane(z, channel, t)  # z=z, c=channel, t=t

        # Convert numpy array to PNG bytes
        from PIL import Image as PILImage
        import io
        import numpy as np

        # Normalize to 8-bit for transport
        if plane.dtype != np.uint8:
            pmin, pmax = np.percentile(plane, (1, 99.8))
            plane_norm = np.clip((plane - pmin) / (pmax - pmin + 1e-8) * 255, 0, 255).astype(np.uint8)
        else:
            plane_norm = plane

        pil_img = PILImage.fromarray(plane_norm)
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)

        # Send to prediction microservice
        resp = http_requests.post(
            f"{PREDICTION_SERVICE_URL}/predict",
            files={"image": ("image.png", buf, "image/png")},
            data={"model": model_name},
            timeout=120,
        )
        resp.raise_for_status()
        result = resp.json()

        # Scale polygons: the prediction service works on the raw pixel coordinates
        # which should match the OMERO image dimensions, so no scaling needed.
        # The frontend rendering pipeline handles the display scaling.

        return JsonResponse(result)

    except http_requests.exceptions.ConnectionError:
        logger.error("Prediction service is not reachable")
        return JsonResponse({"error": "Prediction service is not reachable. Is the container running?"}, status=503)
    except http_requests.exceptions.Timeout:
        logger.error("Prediction prediction timed out")
        return JsonResponse({"error": "Prediction timed out"}, status=504)
    except Exception as e:
        logger.error("Error running prediction", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def list_annotation_sets(request, conn=None, **kwargs):
    """
    List dataset-linked annotation sets.
    Expects ?dataset=ID
    """
    try:
        dataset_id = request.GET.get("dataset")
        if not dataset_id:
            return JsonResponse({"error": "Missing dataset ID"}, status=400)

        dataset = _get_prediction_dataset(conn, dataset_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)

        annotation_sets = []
        for ann in _iter_prediction_annotation_files(dataset):
            try:
                payload = _normalize_annotation_payload(_read_annotation_payload(ann), dataset_id)
                annotation_sets.append(_build_annotation_set_summary(ann, payload))
            except Exception:
                logger.warning(
                    "Skipping unreadable prediction annotation set %s on dataset %s",
                    ann.getId(),
                    dataset_id,
                    exc_info=True,
                )

        annotation_sets.sort(key=lambda item: item["id"], reverse=True)
        return JsonResponse({"annotationSets": annotation_sets})

    except Exception as e:
        logger.error("Error listing annotation sets", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def fetch_annotations(request, conn=None, **kwargs):
    """
    Fetch a dataset-linked annotation set.
    Expects ?dataset=ID&annotation=ID
    """
    try:
        dataset_id = request.GET.get("dataset")
        annotation_id = request.GET.get("annotation")
        if not dataset_id or not annotation_id:
            return JsonResponse({"error": "Missing dataset ID or annotation ID"}, status=400)

        dataset = _get_prediction_dataset(conn, dataset_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)

        file_ann = _find_prediction_annotation_file(dataset, annotation_id)
        if not file_ann:
            return JsonResponse({"error": "Annotation set not found"}, status=404)

        payload = _normalize_annotation_payload(_read_annotation_payload(file_ann), dataset_id)
        payload["annotationSetId"] = file_ann.getId()
        return JsonResponse(payload)

    except Exception as e:
        logger.error("Error fetching annotations", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def save_annotations(request, conn=None, **kwargs):
    """
    Save annotations as a dataset-linked FileAnnotation.
    Expects JSON body: { datasetId, annotationId?, data }
    """
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
            dataset_id = data.get("datasetId")
            annotation_id = data.get("annotationId")
            annotation_data = data.get("data")
        else:
            dataset_id = request.POST.get("datasetId")
            annotation_id = request.POST.get("annotationId")
            annotation_data = request.POST.get("data")
            if isinstance(annotation_data, str):
                annotation_data = json.loads(annotation_data)

        if not dataset_id or not annotation_data:
            return JsonResponse({"error": "Missing datasetId or data"}, status=400)

        dataset = _get_prediction_dataset(conn, dataset_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)

        existing_file_ann = None
        if annotation_id:
            existing_file_ann = _find_prediction_annotation_file(dataset, annotation_id)
            if not existing_file_ann:
                return JsonResponse({"error": "Annotation set not found"}, status=404)

        payload = _normalize_annotation_payload(annotation_data, dataset_id)
        filename = f"prediction_annotations_{uuid.uuid4().hex}.json"

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=".json") as tmp:
            json.dump(payload, tmp)
            tmp_path = tmp.name

        try:
            file_ann = conn.createFileAnnfromLocalFile(
                tmp_path,
                mimetype="application/json",
                ns=ANNOTATION_NAMESPACE,
                desc=payload["description"] or "Prediction Training Annotations"
            )

            original_file = file_ann.getFile()
            original_file.setName(filename)
            original_file.save()

            dataset.linkAnnotation(file_ann)

            if existing_file_ann:
                conn.deleteObjects("Annotation", [existing_file_ann.getId()])

            summary = _build_annotation_set_summary(file_ann, payload)
            return JsonResponse({
                "success": True,
                "annotationSetId": file_ann.getId(),
                "annotationSet": summary,
            })

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        logger.error("Error saving annotations", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def run_training(request, conn=None, **kwargs):
    """
    Run Prediction Training Script.
    Expects JSON body with parameters.
    """
    try:
        data = json.loads(request.body)
        
        script_params = {
            "Dataset_ID": data.get("dataset_id"),
            "Epochs": data.get("epochs", 100),
            "Batch_Size": data.get("batch_size", 4),
            "Validation_Split": data.get("val_split", 0.15),
            "Patch_Size": data.get("patch_size", 256),
            "Model_Name": data.get("model_name", "my_model"),
        }
        
        svc = conn.getScriptService()
        scripts = svc.getScripts()
        script_id = None
        for s in scripts:
            if s.getName().getValue() == "train.py":
                script_id = s.getId().getValue()
                break
        
        if not script_id:
            return JsonResponse({"error": "train.py script not found on server"}, status=404)
            
        inputs = {}
        for k, v in script_params.items():
            if k == "Dataset_ID":
                inputs[k] = omero.rtypes.rlong(int(v))
            elif k in ["Epochs", "Batch_Size", "Patch_Size"]:
                inputs[k] = omero.rtypes.rint(int(v))
            elif k == "Validation_Split":
                inputs[k] = omero.rtypes.rfloat(float(v))
            elif k == "Model_Name":
                inputs[k] = omero.rtypes.rstring(str(v))

        proc = svc.runScript(script_id, inputs, None)
        job_id = proc.getJob().getId().getValue()
        
        return JsonResponse({"success": True, "job_id": job_id})

    except Exception as e:
        logger.error("Error running training", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
