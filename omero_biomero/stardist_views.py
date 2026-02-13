from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from omeroweb.webclient.decorators import login_required
import json
import logging
from omero.gateway import BlitzGateway
import omero

logger = logging.getLogger(__name__)

@login_required()
@require_GET
def list_models(request, conn=None, **kwargs):
    """
    List available Stardist models.
    For now, return hardcoded list or scan a directory.
    """
    # In a real scenario, scan a models directory
    models = [
        {"value": "2D_versatile_fluo", "label": "2D_versatile_fluo (Built-in)"},
        {"value": "2D_versatile_he", "label": "2D_versatile_he (Built-in)"},
        {"value": "2D_demo", "label": "2D_demo (Built-in)"},
    ]
    return JsonResponse({"models": models})

@login_required()
@require_POST
def save_annotations(request, conn=None, **kwargs):
    """
    Save polygons as OMERO ROIs.
    Expects JSON body: { "imageId": 123, "polygons": [[ [x,y], ... ], ...] }
    """
    try:
        data = json.loads(request.body)
        image_id = data.get("imageId")
        polygons = data.get("polygons")

        if not image_id or not polygons:
            return JsonResponse({"error": "Missing imageId or polygons"}, status=400)

        image = conn.getObject("Image", image_id)
        if not image:
            return JsonResponse({"error": "Image not found"}, status=404)

        # Create ROI
        roi = omero.model.RoiI()
        roi.setImage(omero.model.ImageI(image_id, False))
        
        # Add polygons
        for poly_points in polygons:
            # Stardist might return [y,x] or [x,y]. 
            # Our frontend sends [x,y].
            # OMERO Polygon expects string "x1,y1, x2,y2 ..."
            points_str = ", ".join([f"{p[0]},{p[1]}" for p in poly_points])
            
            shape = omero.model.PolygonI()
            shape.setPoints(omero.rtypes.rstring(points_str))
            shape.setTheZ(omero.rtypes.rint(0)) # Default Z
            shape.setTheT(omero.rtypes.rint(0)) # Default T
            shape.setTextValue(omero.rtypes.rstring("Stardist Annotation"))
            
            roi.addShape(shape)

        # Save ROI
        conn.getUpdateService().saveObject(roi)
        
        return JsonResponse({"success": True, "count": len(polygons)})

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
        
        # Parameters expected by stardist_train.py
        script_params = {
            "Dataset_ID": data.get("dataset_id"),
            "Epochs": data.get("epochs", 100),
            "Batch_Size": data.get("batch_size", 4),
            "Validation_Split": data.get("val_split", 0.15),
            "Patch_Size": data.get("patch_size", 256),
            "Model_Name": data.get("model_name", "my_model"),
        }
        
        # Find script
        svc = conn.getScriptService()
        scripts = svc.getScripts()
        script_id = None
        for s in scripts:
            # Check name or path
            if s.getName().getValue() == "stardist_train.py":
                script_id = s.getId().getValue()
                break
        
        if not script_id:
            return JsonResponse({"error": "stardist_train.py script not found on server"}, status=404)
            
        # Run script
        # Convert params to rtypes
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

