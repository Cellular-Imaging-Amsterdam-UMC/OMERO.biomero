import json
import logging
import os

import omero
import requests as http_requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from omero.gateway import BlitzGateway
from omeroweb.webclient.decorators import login_required

logger = logging.getLogger(__name__)

# StarDist microservice URL (set via environment variable in docker-compose)
STARDIST_SERVICE_URL = os.environ.get("STARDIST_SERVICE_URL", "http://stardist:5000")


@login_required()
@require_GET
def list_models(request, conn=None, **kwargs):
    """
    List available StarDist models by querying the stardist microservice.
    Falls back to built-in list if the service is unreachable.
    """
    try:
        resp = http_requests.get(
            f"{STARDIST_SERVICE_URL}/models",
            timeout=10,
        )
        resp.raise_for_status()
        return JsonResponse(resp.json())
    except Exception as e:
        logger.warning(f"StarDist service unreachable, returning defaults: {e}")
        # Fallback to hardcoded list
        models = [
            {
                "value": "2D_versatile_fluo",
                "label": "2D_versatile_fluo (Built-in)",
                "type": "builtin",
            },
            {
                "value": "2D_versatile_he",
                "label": "2D_versatile_he (Built-in)",
                "type": "builtin",
            },
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
            }
        )

    except Exception as e:
        logger.error("Error fetching image channels", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def run_prediction(request, conn=None, **kwargs):
    """
    Run StarDist prediction on an OMERO image.

    Expects JSON body:
      { "image_id": int, "model": str, "channel": int (optional, default 0) }

    Fetches the specified channel plane from OMERO, sends it to the stardist
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
            return JsonResponse(
                {"error": f"Channel {channel} out of range (0-{size_c - 1})"},
                status=400,
            )

        # Fetch the specified channel plane
        pixels = image.getPrimaryPixels()
        plane = pixels.getPlane(z, channel, t)  # z=z, c=channel, t=t

        # Convert numpy array to PNG bytes
        import io

        import numpy as np
        from PIL import Image as PILImage

        # Normalize to 8-bit for transport
        if plane.dtype != np.uint8:
            pmin, pmax = np.percentile(plane, (1, 99.8))
            plane_norm = np.clip(
                (plane - pmin) / (pmax - pmin + 1e-8) * 255, 0, 255
            ).astype(np.uint8)
        else:
            plane_norm = plane

        pil_img = PILImage.fromarray(plane_norm)
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)

        # Send to stardist microservice
        resp = http_requests.post(
            f"{STARDIST_SERVICE_URL}/predict",
            files={"image": ("image.png", buf, "image/png")},
            data={"model": model_name},
            timeout=120,
        )
        resp.raise_for_status()
        result = resp.json()

        # Scale polygons: the stardist service works on the raw pixel coordinates
        # which should match the OMERO image dimensions, so no scaling needed.
        # The frontend rendering pipeline handles the display scaling.

        return JsonResponse(result)

    except http_requests.exceptions.ConnectionError:
        logger.error("StarDist service is not reachable")
        return JsonResponse(
            {"error": "StarDist service is not reachable. Is the container running?"},
            status=503,
        )
    except http_requests.exceptions.Timeout:
        logger.error("StarDist prediction timed out")
        return JsonResponse({"error": "Prediction timed out"}, status=504)
    except Exception as e:
        logger.error("Error running prediction", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def fetch_annotations(request, conn=None, **kwargs):
    """
    Fetch annotations from the FileAnnotation attached to the image.
    Expects ?image=ID
    """
    try:
        image_id = request.GET.get("image")
        if not image_id:
            return JsonResponse({"error": "Missing image ID"}, status=400)

        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        FILENAME = "stardist_data.json"

        # Find the annotation
        for ann in image.listAnnotations():
            if isinstance(ann, omero.gateway.FileAnnotationWrapper):
                if ann.getFile().getName() == FILENAME:
                    # Download file content
                    content = b""
                    for chunk in ann.getFileInChunks():
                        content += chunk

                    # Parse JSON
                    data = json.loads(content)
                    return JsonResponse(data)

        # If not found
        return JsonResponse({"annotations": [], "featureTypes": []})

    except Exception as e:
        logger.error("Error fetching annotations", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def save_annotations(request, conn=None, **kwargs):
    """
    Save annotations as a FileAnnotation attached to the Image.
    Expects JSON body: { imageId, data }
    """
    try:
        if request.content_type == "application/json":
            data = json.loads(request.body)
            image_id = data.get("imageId")
            annotation_data = data.get("data")
        else:
            image_id = request.POST.get("imageId")
            annotation_data = request.POST.get("data")
            if isinstance(annotation_data, str):
                annotation_data = json.loads(annotation_data)

        if not image_id or not annotation_data:
            return JsonResponse({"error": "Missing imageId or data"}, status=400)

        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        # Ensure we are in the correct group context
        group_id = image.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)

        FILENAME = "stardist_data.json"
        existing_file_ann = None

        for ann in image.listAnnotations():
            if isinstance(ann, omero.gateway.FileAnnotationWrapper):
                if ann.getFile().getName() == FILENAME:
                    existing_file_ann = ann
                    break

        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as tmp:
            json.dump(annotation_data, tmp)
            tmp_path = tmp.name

        try:
            if existing_file_ann:
                try:
                    conn.deleteObjects("Annotation", [existing_file_ann.getId()])
                except Exception:
                    pass

            namespace = "biomero.stardist.annotations"

            file_ann = conn.createFileAnnfromLocalFile(
                tmp_path,
                mimetype="application/json",
                ns=namespace,
                desc="Stardist Training Annotations",
            )

            # Rename the file
            original_file = file_ann.getFile()
            original_file.setName(FILENAME)
            original_file.save()

            # Attach to Image
            image.linkAnnotation(file_ann)

            return JsonResponse({"success": True, "fileId": original_file.getId()})

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
    Run Stardist Training Script.
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
            if s.getName().getValue() == "stardist_train.py":
                script_id = s.getId().getValue()
                break

        if not script_id:
            return JsonResponse(
                {"error": "stardist_train.py script not found on server"}, status=404
            )

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
