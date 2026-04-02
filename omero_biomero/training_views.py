import json
import logging
import re

import omero
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from omero.rtypes import rbool, rlong, wrap, rstring, rfloat, rint, unwrap
from omeroweb.webclient.decorators import login_required

logger = logging.getLogger(__name__)

TRAINING_SCRIPT_NAME = "SLURM_Run_Training.py"
TRAINING_MODEL_NS = "biomero.training.model"
TRAINING_RESULTS_NS = "biomero.training.results"


@login_required()
@require_POST
def start_training(request, conn=None, **kwargs):
    """Trigger SLURM_Run_Training.py via the OMERO script service."""
    try:
        data = json.loads(request.body)
        workflow_name = data.get("workflow_name")
        if not workflow_name:
            return JsonResponse({"error": "workflow_name is required"}, status=400)

        dataset_ids = data.get("dataset_ids", [])
        if not dataset_ids:
            return JsonResponse({"error": "dataset_ids is required"}, status=400)

        # Validate model_name to prevent path traversal
        model_name = data.get("model_name", "my_model")
        if not re.match(r'^[a-zA-Z0-9_\-]+$', model_name):
            return JsonResponse(
                {"error": "model_name must contain only letters, numbers, underscores, and hyphens"},
                status=400,
            )

        # Switch group if requested
        active_group_id = data.get("active_group_id")
        if active_group_id is not None:
            try:
                conn.setGroupForSession(active_group_id)
            except Exception as e:
                logger.error(f"Failed to switch to group {active_group_id}: {e}")
                return JsonResponse(
                    {"error": f"Cannot access group {active_group_id}"},
                    status=403,
                )

        # Find the training script
        svc = conn.getScriptService()
        script_id = None
        for s in svc.getScripts():
            if unwrap(s.getName()) == TRAINING_SCRIPT_NAME:
                script_id = int(unwrap(s.id))
                break

        if not script_id:
            return JsonResponse(
                {"error": f"Script {TRAINING_SCRIPT_NAME} not found on server"},
                status=404,
            )

        # Build OMERO script inputs
        inputs = {
            "Data_Type": wrap("Dataset"),
            "IDs": wrap([rlong(i) for i in dataset_ids]),
            "Workflow": wrap(workflow_name),
            "Workflow_Version": wrap(data.get("version", "latest")),
            "Data_Mode": wrap(data.get("data_mode", "paired")),
            "Mask_Suffix": wrap(data.get("mask_suffix", "_label")),
            "Val_Split": rfloat(float(data.get("val_split", 0.2))),
            "Test_Split": rfloat(float(data.get("test_split", 0.0))),
            "Model_Name": wrap(model_name),
            "N_Epochs": rint(int(data.get("n_epochs", 100))),
            "Learning_Rate": rfloat(float(data.get("learning_rate", 0.00001))),
            "Weight_Decay": rfloat(float(data.get("weight_decay", 0.1))),
            "Batch_Size": rint(int(data.get("batch_size", 1))),
            "Channels": wrap(data.get("channels", "0,0")),
        }

        proc = svc.runScript(script_id, inputs, None)
        job_id = proc.getJob().getId().getValue()

        return JsonResponse({
            "status": "success",
            "message": f"Training script started for {workflow_name}",
            "job_id": job_id,
        })

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON data"}, status=400)
    except Exception as e:
        logger.error(f"Error starting training: {e}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def list_trained_models(request, conn=None, **kwargs):
    """List trained models attached to a dataset."""
    try:
        dataset_id = request.GET.get("dataset")
        if not dataset_id:
            return JsonResponse({"error": "dataset parameter required"}, status=400)

        try:
            dataset_id = int(dataset_id)
        except (ValueError, TypeError):
            return JsonResponse({"error": "dataset must be an integer"}, status=400)

        dataset = conn.getObject("Dataset", dataset_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)

        # Set group context
        group_id = dataset.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)

        # Single pass over annotations
        results_map = {}
        file_anns = []
        for ann in dataset.listAnnotations():
            if isinstance(ann, omero.gateway.MapAnnotationWrapper):
                if ann.getNs() == TRAINING_RESULTS_NS:
                    kv = dict(ann.getValue())
                    model_id = kv.get("model_id", "")
                    if model_id:
                        results_map[model_id] = kv
            elif isinstance(ann, omero.gateway.FileAnnotationWrapper):
                if ann.getNs() == TRAINING_MODEL_NS:
                    file_anns.append(ann)

        # Build models list
        models = []
        for ann in file_anns:
            filename = ann.getFile().getName()
            model_info = {
                "file_annotation_id": ann.getId(),
                "filename": filename,
            }

            # Match with results by checking if model_id is in filename
            for model_id, kv in results_map.items():
                if model_id in filename:
                    model_info.update({
                        "model_id": kv.get("model_id", ""),
                        "model_name": kv.get("model_name", ""),
                        "n_epochs": kv.get("n_epochs", ""),
                        "learning_rate": kv.get("learning_rate", ""),
                        "pretrained_model": kv.get("pretrained_model", ""),
                        "timestamp": kv.get("timestamp", ""),
                        "trained_by": kv.get("trained_by", ""),
                    })
                    break

            models.append(model_info)

        return JsonResponse({"models": models})

    except Exception as e:
        logger.error(f"Error listing trained models: {e}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
