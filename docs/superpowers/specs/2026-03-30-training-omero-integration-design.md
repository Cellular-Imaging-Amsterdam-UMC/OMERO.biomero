# Training OMERO Integration — Design Spec

**Date:** 2026-03-30
**Scope:** OMERO script, Django views, and UI to trigger training workflows via the biomero pipeline. This is the OMERO-side counterpart to the container training support (see `W_Segmentation-Cellpose4` spec).

## Context

The Cellpose container already supports training via `train.py` (triggered by `TRAINING_MODE=true`). It expects:
- `data/in/{train,validation,test}/` — images
- `data/gt/{train,validation,test}/` — masks
- `data/config.yaml` — training hyperparameters + metadata
- `--outfolder` — receives model zip + `training_results.yaml`

This spec covers getting data from OMERO into that structure and wiring up the UI.

## Components

| Component | Location | Responsibility |
|-----------|----------|---------------|
| `SLURM_Run_Training.py` | biomero-scripts `__workflows/` | OMERO script: data prep, config generation, workflow execution, result upload |
| `training_views.py` | `omero_biomero/` | Django views: start training, list trained models |
| `TrainingBiomeroTab.js` | `webapp/src/biomero/annotate/components/` | UI: form + trained models list |

## Data Input Modes

### Mode A: From annotate_ai config

For datasets that went through the annotation workflow:

1. Read the annotate_ai tracking table attached to the dataset
2. Get image IDs and their split assignments (train/validation/test)
3. For each image: export the image plane as TIFF, rasterize attached ROIs into an instance label mask (uint16)
4. Organize into `data/{in,gt}/{train,validation,test}/`

### Mode B: Paired images

For datasets with pre-made image + mask pairs:

1. User provides a `mask_suffix` (default: `_label`)
2. Script finds pairs: `image1.tif` matched with `image1_label.tif`
3. User provides `val_split` (default: 0.2) and `test_split` (default: 0.0)
4. Script randomly assigns images to train/validation/test based on fractions
5. Organizes into same directory structure

## OMERO Script: `SLURM_Run_Training.py`

**Script parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `Data_Type` | String | "Dataset" | OMERO data type |
| `IDs` | List[Long] | required | Dataset ID(s) |
| `Workflow` | String (enum) | required | Workflow to train (from configured workflows) |
| `Workflow_Version` | String (enum) | required | Container version |
| `Data_Mode` | String (enum) | "annotate" | `"annotate"` or `"paired"` |
| `Mask_Suffix` | String | "_label" | Suffix identifying mask images (paired mode only) |
| `Val_Split` | Float | 0.2 | Validation fraction (paired mode only) |
| `Test_Split` | Float | 0.0 | Test fraction (paired mode only) |
| `Model_Name` | String | "my_model" | User-friendly model display name |
| `N_Epochs` | Int | 100 | Training epochs |
| `Learning_Rate` | Float | 0.00001 | Learning rate |
| `Weight_Decay` | Float | 0.1 | Weight decay |
| `Batch_Size` | Int | 1 | Training batch size |
| `Channels` | String | "0,0" | Cytoplasm and nucleus channel indices (comma-separated, converted to list in config.yaml) |

**Script flow:**

```
1. Parse parameters
2. Connect to SlurmClient
3. Determine data mode (annotate vs paired)
4. For each dataset:
   a. Fetch images from OMERO
   b. [Annotate mode] Read tracking table → get split assignments
      For each image: export plane, rasterize ROIs → mask
   c. [Paired mode] Match images with masks by suffix
      Randomly assign to train/val/test splits
   d. Export images + masks to Slurm data path
      Organized as data/{in,gt}/{train,validation,test}/
5. Generate data/config.yaml:
   training:
     pretrained_model: "cpsam"
     n_epochs: <from params>
     learning_rate: <from params>
     weight_decay: <from params>
     batch_size: <from params>
     model_name: <from params>
     channels: <from params>
   metadata:
     source_datasets: [<dataset IDs>]
     trained_by: <OMERO username>
     workflow_name: <workflow name>
6. Call run_workflow() with training_mode="true"
7. Poll until job completes
8. Retrieve --outfolder contents from Slurm
9. Upload <model_id>.zip as FileAnnotation:
   - Namespace: biomero.training.model
   - Attached to source dataset
10. Parse training_results.yaml → store as MapAnnotation:
    - Namespace: biomero.training.results
    - Attached to source dataset
    - Keys: model_id, model_name, n_epochs, learning_rate, timestamp, etc.
```

**ROI rasterization (annotate mode):**

Uses OMERO's ROI service to fetch shapes (polygons, rectangles, ellipses) for each image. Rasterizes into a uint16 label mask where each ROI gets a unique integer label (1, 2, 3...). This follows the same approach as `polygons_to_label_mask` in `annotate_ai_views.py`.

## Django Views: `training_views.py`

**Endpoints:**

### `POST /api/analyzer/training/start`

Triggers `SLURM_Run_Training.py` via the OMERO script service.

Request body:
```json
{
  "workflow_name": "cellpose",
  "version": "train-test",
  "dataset_ids": [42],
  "data_mode": "annotate",
  "mask_suffix": "_label",
  "val_split": 0.2,
  "test_split": 0.0,
  "model_name": "my_hela_model",
  "n_epochs": 100,
  "learning_rate": 0.00001,
  "weight_decay": 0.1,
  "batch_size": 1,
  "channels": [0, 0],
  "active_group_id": 3
}
```

Response:
```json
{
  "status": "success",
  "message": "Training script started",
  "job_id": 12345
}
```

Follows the same pattern as `run_workflow_script()`: finds script by name, wraps params with OMERO rtypes, calls `svc.runScript()`.

### `GET /api/analyzer/training/models?dataset=<id>`

Lists trained models for a dataset.

Queries FileAnnotations with namespace `biomero.training.model` and MapAnnotations with namespace `biomero.training.results` attached to the dataset.

Response:
```json
{
  "models": [
    {
      "model_id": "my_hela_model_20260330_143022",
      "model_name": "my_hela_model",
      "file_annotation_id": 456,
      "n_epochs": 100,
      "learning_rate": 0.00001,
      "pretrained_model": "cpsam",
      "timestamp": "2026-03-30T14:30:22",
      "trained_by": "maartenpaul"
    }
  ]
}
```

## UI: `TrainingBiomeroTab.js`

**Location:** `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`

**Layout:**

Top section — Training form:
- Workflow dropdown (populated from `list_workflows` API)
- Version dropdown (from `get_slurm_status` API)
- Data source radio: "Annotate config" / "Paired images"
  - Annotate: dataset selector (reuse `DatasetSelectWithPopover`)
  - Paired: dataset selector + mask suffix input + val split + test split
- Training parameters:
  - Model name (text input)
  - Epochs (numeric, default 100)
  - Learning rate (numeric, default 0.00001)
  - Advanced (collapsible): weight_decay, batch_size, channels
- "Start Training" button

Bottom section — Trained Models list:
- Table showing models for the selected dataset
- Columns: model_name, epochs, learning_rate, pretrained_model, timestamp
- Data from `GET /api/analyzer/training/models`

**API calls:**
- `startTraining(params)` → `POST /api/analyzer/training/start`
- `listTrainedModels(datasetId)` → `GET /api/analyzer/training/models?dataset=<id>`
- Reuses existing: `listWorkflows()`, `getSlurmStatus()`

## URL Configuration

Add to `omero_biomero/urls.py`:
```python
path("api/analyzer/training/start", training_views.start_training),
path("api/analyzer/training/models", training_views.list_trained_models),
```

## Out of Scope

- Job status display in Training tab (use existing biomero monitoring)
- Test set evaluation metrics display
- OME-Zarr with labels support (future extension of Mode A)
- Model deletion/management
- Training from multiple datasets simultaneously (future — script supports it but UI starts with single dataset)
