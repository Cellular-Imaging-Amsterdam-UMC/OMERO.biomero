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
                    # getFileInChunks is a generator
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
    This bypasses the size limit of MapAnnotation values.
    Expects form-data: imageId, data (JSON string)
    """
    try:
        # We handle multipart/form-data or JSON body?
        if request.content_type == 'application/json':
            data = json.loads(request.body)
            image_id = data.get("imageId")
            annotation_data = data.get("data") # The JSON object
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

        # 1. Check for existing FileAnnotation named "stardist_data.json"
        FILENAME = "stardist_data.json"
        existing_file_ann = None
        
        for ann in image.listAnnotations():
            if isinstance(ann, omero.gateway.FileAnnotationWrapper):
                if ann.getFile().getName() == FILENAME:
                    existing_file_ann = ann
                    break
        
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=".json") as tmp:
            json.dump(annotation_data, tmp)
            tmp_path = tmp.name
            
        try:
            if existing_file_ann:
                try:
                    conn.deleteObjects("Annotation", [existing_file_ann.getId()])
                except Exception:
                     pass # Maybe already deleted or permission issue?
            
            namespace = "biomero.stardist.annotations"
            
            # Create annotation (this handles upload and linking usually? No, createOriginalFileFromFileObj just creates file)
            # createFileAnnfromLocalFile creates FileAnnotation and OriginalFile
            file_ann = conn.createFileAnnfromLocalFile(
                tmp_path, 
                mimetype="application/json", 
                ns=namespace, 
                desc="Stardist Training Annotations"
            )
            
            # Rename the file
            original_file = file_ann.getFile()
            original_file.setName(FILENAME) 
            original_file.save() # Uses current context
            
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

