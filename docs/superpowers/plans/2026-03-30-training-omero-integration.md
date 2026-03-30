# Training OMERO Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the OMERO.biomero UI and backend to trigger training workflows on Slurm, with data preparation (ROI rasterization or paired image matching) and model result upload.

**Architecture:** A new Django view (`training_views.py`) exposes endpoints to start training and list trained models. It triggers a new OMERO script (`SLURM_Run_Training.py`) that prepares data from OMERO (two modes: annotate_ai ROIs or paired images), generates `config.yaml`, calls `run_workflow()` with `training_mode=true`, and uploads results. A new React tab (`TrainingBiomeroTab.js`) provides the UI.

**Tech Stack:** Python (Django views, OMERO script), React (Blueprint UI), biomero SlurmClient

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `omero_biomero/training_views.py` | Create | Django views: start_training, list_trained_models |
| `omero_biomero/urls.py` | Modify | Add training URL routes |
| `webapp/src/apiService.js` | Modify | Add startTraining, listTrainedModels API functions |
| `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js` | Create | Training form + trained models list |
| `webapp/src/biomero/annotate/AnnotateApp.js` | Modify | Register new tab |
| `biomero-scripts/__workflows/SLURM_Run_Training.py` | Create | OMERO script: data prep, training execution, result upload |

---

### Task 1: Create training_views.py — start_training endpoint

**Files:**
- Create: `omero_biomero/training_views.py`

- [ ] **Step 1: Create training_views.py with start_training view**

Create `omero_biomero/training_views.py`:

```python
import json
import logging

import omero
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from omero.rtypes import rbool, rlong, wrap, rstring, rfloat, rint, unwrap
from omeroweb.webclient.decorators import login_required

logger = logging.getLogger(__name__)

TRAINING_SCRIPT_NAME = "SLURM_Run_Training.py"


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
            "Model_Name": wrap(data.get("model_name", "my_model")),
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
```

- [ ] **Step 2: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -c "import ast; ast.parse(open('omero_biomero/training_views.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add omero_biomero/training_views.py
git commit -m "feat: add start_training Django view for triggering training scripts"
```

---

### Task 2: Add list_trained_models endpoint to training_views.py

**Files:**
- Modify: `omero_biomero/training_views.py`

- [ ] **Step 1: Add list_trained_models view**

Append to `omero_biomero/training_views.py`:

```python
TRAINING_MODEL_NS = "biomero.training.model"
TRAINING_RESULTS_NS = "biomero.training.results"


@login_required()
@require_GET
def list_trained_models(request, conn=None, **kwargs):
    """List trained models attached to a dataset."""
    try:
        dataset_id = request.GET.get("dataset")
        if not dataset_id:
            return JsonResponse({"error": "dataset parameter required"}, status=400)

        dataset = conn.getObject("Dataset", dataset_id)
        if not dataset:
            return JsonResponse({"error": "Dataset not found"}, status=404)

        # Set group context
        group_id = dataset.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)

        models = []
        # Find FileAnnotations with training model namespace
        for ann in dataset.listAnnotations():
            if not isinstance(ann, omero.gateway.FileAnnotationWrapper):
                continue
            if ann.getNs() != TRAINING_MODEL_NS:
                continue

            model_info = {
                "file_annotation_id": ann.getId(),
                "filename": ann.getFile().getName(),
            }

            # Look for matching MapAnnotation with results
            for map_ann in dataset.listAnnotations():
                if not isinstance(map_ann, omero.gateway.MapAnnotationWrapper):
                    continue
                if map_ann.getNs() != TRAINING_RESULTS_NS:
                    continue

                kv = dict(map_ann.getValue())
                # Match by model_id in the filename
                if kv.get("model_id", "") in ann.getFile().getName():
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
```

- [ ] **Step 2: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -c "import ast; ast.parse(open('omero_biomero/training_views.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add omero_biomero/training_views.py
git commit -m "feat: add list_trained_models endpoint"
```

---

### Task 3: Register training URL routes

**Files:**
- Modify: `omero_biomero/urls.py`

- [ ] **Step 1: Add import and URL patterns**

In `omero_biomero/urls.py`, add `training_views` to the import block:

```python
from . import (
    admin_views,
    analyzer_views,
    annotate_ai_views,
    biomero_views,
    importer_views,
    sam_views,
    stardist_views,
    training_views,
)
```

Add the URL patterns before the `# Main Biomero URL` comment:

```python
    # Training URLs
    path(
        "api/analyzer/training/start",
        training_views.start_training,
        name="training_start",
    ),
    path(
        "api/analyzer/training/models",
        training_views.list_trained_models,
        name="training_list_models",
    ),
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -c "import ast; ast.parse(open('omero_biomero/urls.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add omero_biomero/urls.py
git commit -m "feat: add training API URL routes"
```

---

### Task 4: Add API functions to apiService.js

**Files:**
- Modify: `webapp/src/apiService.js`

- [ ] **Step 1: Add startTraining and listTrainedModels functions**

Append to `webapp/src/apiService.js` before the final closing (or at the end of the file):

```javascript
// --- Training (biomero) ---

export const startTraining = async (params) => {
  try {
    const csrfToken = window.csrftoken;
    const endpoint = "/omero_biomero/api/analyzer/training/start";
    const response = await apiRequest(endpoint, "POST", params, {
      headers: {
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/json",
      },
    });
    return response;
  } catch (error) {
    console.error("Error starting training:", error);
    throw error;
  }
};

export const listTrainedModels = async (datasetId) => {
  const endpoint = `/omero_biomero/api/analyzer/training/models?dataset=${datasetId}`;
  return apiRequest(endpoint, "GET");
};
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && npx acorn --ecma2020 --module src/apiService.js > /dev/null && echo "OK" || echo "FAIL"`
If acorn is not available, just visually verify the code.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/apiService.js
git commit -m "feat: add startTraining and listTrainedModels API functions"
```

---

### Task 5: Create TrainingBiomeroTab.js

**Files:**
- Create: `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`

- [ ] **Step 1: Create the full component**

Create `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`:

```javascript
import React, { useState, useEffect, useCallback } from "react";
import {
  H4,
  H5,
  Card,
  Button,
  FormGroup,
  InputGroup,
  NumericInput,
  HTMLSelect,
  RadioGroup,
  Radio,
  Collapse,
  HTMLTable,
  Callout,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import { useAppContext } from "../../../AppContext";
import {
  startTraining,
  listTrainedModels,
} from "../../../apiService";

const TrainingBiomeroTab = () => {
  const { toaster, state } = useAppContext();

  // --- Workflow selection ---
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("");

  // --- Data source ---
  const [dataMode, setDataMode] = useState("paired");
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [maskSuffix, setMaskSuffix] = useState("_label");
  const [valSplit, setValSplit] = useState(0.2);
  const [testSplit, setTestSplit] = useState(0.0);

  // --- Training params ---
  const [modelName, setModelName] = useState("my_model");
  const [nEpochs, setNEpochs] = useState(100);
  const [learningRate, setLearningRate] = useState(0.00001);
  const [weightDecay, setWeightDecay] = useState(0.1);
  const [batchSize, setBatchSize] = useState(1);
  const [channels, setChannels] = useState("0,0");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // --- State ---
  const [submitting, setSubmitting] = useState(false);
  const [trainedModels, setTrainedModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Parse dataset ID from selection
  const getDatasetId = useCallback((selection) => {
    if (!selection || selection.length === 0) return null;
    const parts = selection[0].split("-");
    return parts.length > 1 ? parseInt(parts[1], 10) : null;
  }, []);

  // Load workflows and versions from slurm status
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const statusResp = await fetch(
          `${window.location.origin}/omero_biomero/api/analyzer/slurm/status/`
        );
        const statusData = await statusResp.json();
        if (statusData.workflow_versions) {
          const wfNames = Object.keys(statusData.workflow_versions);
          setWorkflows(wfNames);
          if (wfNames.length > 0 && !selectedWorkflow) {
            setSelectedWorkflow(wfNames[0]);
            const wfVersions =
              statusData.workflow_versions[wfNames[0]]?.available_versions || [];
            setVersions(wfVersions);
            if (wfVersions.length > 0) setSelectedVersion(wfVersions[0]);
          }
        }
      } catch (e) {
        console.error("Error loading workflows:", e);
      }
    };
    loadWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update versions when workflow changes
  useEffect(() => {
    const loadVersions = async () => {
      if (!selectedWorkflow) return;
      try {
        const statusResp = await fetch(
          `${window.location.origin}/omero_biomero/api/analyzer/slurm/status/`
        );
        const statusData = await statusResp.json();
        const wfVersions =
          statusData.workflow_versions?.[selectedWorkflow]?.available_versions ||
          [];
        setVersions(wfVersions);
        if (wfVersions.length > 0) setSelectedVersion(wfVersions[0]);
      } catch (e) {
        console.error("Error loading versions:", e);
      }
    };
    loadVersions();
  }, [selectedWorkflow]);

  // Load trained models when dataset changes
  useEffect(() => {
    const datasetId = getDatasetId(selectedDatasets);
    if (!datasetId) {
      setTrainedModels([]);
      return;
    }
    const loadModels = async () => {
      setLoadingModels(true);
      try {
        const result = await listTrainedModels(datasetId);
        setTrainedModels(result.models || []);
      } catch (e) {
        console.error("Error loading trained models:", e);
        setTrainedModels([]);
      } finally {
        setLoadingModels(false);
      }
    };
    loadModels();
  }, [selectedDatasets, getDatasetId]);

  const handleSubmit = async () => {
    const datasetId = getDatasetId(selectedDatasets);
    if (!datasetId) {
      toaster?.show({
        message: "Please select a dataset",
        intent: "warning",
      });
      return;
    }
    if (!selectedWorkflow || !selectedVersion) {
      toaster?.show({
        message: "Please select a workflow and version",
        intent: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      const params = {
        workflow_name: selectedWorkflow,
        version: selectedVersion,
        dataset_ids: [datasetId],
        data_mode: dataMode,
        mask_suffix: maskSuffix,
        val_split: valSplit,
        test_split: testSplit,
        model_name: modelName,
        n_epochs: nEpochs,
        learning_rate: learningRate,
        weight_decay: weightDecay,
        batch_size: batchSize,
        channels: channels,
        active_group_id: state?.currentGroup?.id,
      };

      await startTraining(params);
      toaster?.show({
        message: "Training job submitted successfully!",
        intent: "success",
      });
    } catch (error) {
      console.error("Training submission failed:", error);
      toaster?.show({
        message: `Failed to submit training: ${error.message}`,
        intent: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      <H4>Training (biomero)</H4>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column: Workflow + Data source */}
        <div className="flex flex-col gap-4">
          <Card>
            <h5 className="bp5-heading mb-3">Workflow</h5>
            <FormGroup label="Workflow">
              <HTMLSelect
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
                options={workflows.map((wf) => ({ label: wf, value: wf }))}
                fill
              />
            </FormGroup>
            <FormGroup label="Version">
              <HTMLSelect
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                options={versions.map((v) => ({ label: v, value: v }))}
                fill
              />
            </FormGroup>
          </Card>

          <Card>
            <h5 className="bp5-heading mb-3">Data Source</h5>
            <RadioGroup
              onChange={(e) => setDataMode(e.target.value)}
              selectedValue={dataMode}
            >
              <Radio label="Paired images" value="paired" />
              <Radio label="Annotate config (ROIs)" value="annotate" />
            </RadioGroup>

            <div className="mt-3">
              <DatasetSelectWithPopover
                label="Select Dataset"
                value={selectedDatasets}
                onChange={setSelectedDatasets}
                multiSelect={false}
                allowedCategories={["datasets"]}
                buttonText={
                  selectedDatasets.length
                    ? `${selectedDatasets.length} selected`
                    : "Select Dataset"
                }
              />
            </div>

            {dataMode === "paired" && (
              <div className="mt-3 flex flex-col gap-2">
                <FormGroup
                  label="Mask suffix"
                  helperText="Suffix identifying mask images (e.g. _label, _mask)"
                >
                  <InputGroup
                    value={maskSuffix}
                    onChange={(e) => setMaskSuffix(e.target.value)}
                  />
                </FormGroup>
                <div className="flex gap-4">
                  <FormGroup label="Validation split" className="flex-1">
                    <NumericInput
                      value={valSplit}
                      onValueChange={setValSplit}
                      min={0}
                      max={1}
                      stepSize={0.1}
                      minorStepSize={0.05}
                    />
                  </FormGroup>
                  <FormGroup label="Test split" className="flex-1">
                    <NumericInput
                      value={testSplit}
                      onValueChange={setTestSplit}
                      min={0}
                      max={1}
                      stepSize={0.1}
                      minorStepSize={0.05}
                    />
                  </FormGroup>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right column: Training params */}
        <div className="flex flex-col gap-4">
          <Card>
            <h5 className="bp5-heading mb-3">Training Parameters</h5>
            <FormGroup label="Model name" labelFor="model-name">
              <InputGroup
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g., my_hela_model"
              />
            </FormGroup>
            <FormGroup label="Epochs" labelFor="epochs">
              <NumericInput
                id="epochs"
                value={nEpochs}
                onValueChange={setNEpochs}
                min={1}
                max={10000}
              />
            </FormGroup>
            <FormGroup label="Learning rate" labelFor="lr">
              <NumericInput
                id="lr"
                value={learningRate}
                onValueChange={setLearningRate}
                min={0.0000001}
                max={1}
                stepSize={0.00001}
                minorStepSize={0.000001}
              />
            </FormGroup>

            <Button
              minimal
              small
              icon={showAdvanced ? "chevron-up" : "chevron-down"}
              text="Advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
            />
            <Collapse isOpen={showAdvanced}>
              <div className="mt-2 flex flex-col gap-2">
                <FormGroup label="Weight decay">
                  <NumericInput
                    value={weightDecay}
                    onValueChange={setWeightDecay}
                    min={0}
                    max={1}
                    stepSize={0.01}
                  />
                </FormGroup>
                <FormGroup label="Batch size">
                  <NumericInput
                    value={batchSize}
                    onValueChange={setBatchSize}
                    min={1}
                    max={64}
                  />
                </FormGroup>
                <FormGroup
                  label="Channels"
                  helperText="Cytoplasm,nucleus channel indices"
                >
                  <InputGroup
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                    placeholder="0,0"
                  />
                </FormGroup>
              </div>
            </Collapse>

            <Button
              intent="primary"
              icon="learning"
              text="Start Training"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!selectedWorkflow || !selectedVersion}
              large
              className="mt-4"
              fill
            />
          </Card>
        </div>
      </div>

      {/* Trained Models */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h5 className="bp5-heading mb-0">Trained Models</h5>
          {loadingModels && <Spinner size={16} />}
        </div>
        {trainedModels.length === 0 && !loadingModels ? (
          <Callout intent="none" icon="info-sign">
            No trained models found for this dataset.
          </Callout>
        ) : (
          <HTMLTable bordered condensed striped className="w-full">
            <thead>
              <tr>
                <th>Model Name</th>
                <th>Epochs</th>
                <th>Learning Rate</th>
                <th>Base Model</th>
                <th>Trained By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {trainedModels.map((model, idx) => (
                <tr key={idx}>
                  <td>
                    <Tag minimal>{model.model_name || model.filename}</Tag>
                  </td>
                  <td>{model.n_epochs || "-"}</td>
                  <td>{model.learning_rate || "-"}</td>
                  <td>{model.pretrained_model || "-"}</td>
                  <td>{model.trained_by || "-"}</td>
                  <td>
                    {model.timestamp
                      ? new Date(model.timestamp).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>
    </div>
  );
};

export default TrainingBiomeroTab;
```

- [ ] **Step 2: Commit**

```bash
git add webapp/src/biomero/annotate/components/TrainingBiomeroTab.js
git commit -m "feat: add TrainingBiomeroTab UI component"
```

---

### Task 6: Register TrainingBiomeroTab in AnnotateApp.js

**Files:**
- Modify: `webapp/src/biomero/annotate/AnnotateApp.js`

- [ ] **Step 1: Add import**

Add to the imports at the top of `AnnotateApp.js`:

```javascript
import TrainingBiomeroTab from "./components/TrainingBiomeroTab";
```

- [ ] **Step 2: Add Tab entry**

Inside the `<Tabs>` component, after the existing `Training` tab entry, add:

```javascript
          <Tab
            id="training-biomero"
            title="Training (biomero)"
            icon="rocket-slant"
            panel={<TrainingBiomeroTab />}
          />
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/biomero/annotate/AnnotateApp.js
git commit -m "feat: register Training (biomero) tab in AnnotateApp"
```

---

### Task 7: Create SLURM_Run_Training.py — scaffold and parameter definition

**Files:**
- Create: `biomero-scripts/__workflows/SLURM_Run_Training.py` (in the biomero-scripts repo at `/var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts/`)

- [ ] **Step 1: Create the script with parameter definitions and main structure**

Create `/var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts/__workflows/SLURM_Run_Training.py`:

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OMERO script to run training workflows on SLURM via BIOMERO.

Supports two data input modes:
- "annotate": reads annotate_ai tracking table, rasterizes ROIs to masks
- "paired": matches images with masks by filename suffix

Generates config.yaml, calls run_workflow() with training_mode=true,
and uploads the trained model + results back to OMERO.
"""

import os
import sys
import random
import tempfile
import time as timesleep
import traceback
from io import BytesIO

import numpy as np
import omero
import omero.scripts as omscripts
from omero.gateway import BlitzGateway
from omero.rtypes import rstring, rlong, rbool, rfloat, rint, unwrap, wrap

from biomero import SlurmClient

VERSION = "0.1.0"

# Namespaces for storing training artifacts
NS_TRAINING_MODEL = "biomero.training.model"
NS_TRAINING_RESULTS = "biomero.training.results"


def runScript():
    """Define and execute the OMERO training script."""
    client = omscripts.client(
        "SLURM_Run_Training",
        "Run a training workflow on SLURM via BIOMERO",

        omscripts.String(
            "Data_Type", optional=False, grouping="01",
            description="OMERO data type",
            values=wrap(["Dataset"]), default="Dataset"),

        omscripts.List(
            "IDs", optional=False, grouping="02",
            description="Dataset IDs").ofType(rlong(0)),

        omscripts.String(
            "Workflow", optional=False, grouping="03",
            description="Workflow to train with"),

        omscripts.String(
            "Workflow_Version", optional=False, grouping="04",
            description="Container version"),

        omscripts.String(
            "Data_Mode", optional=False, grouping="05",
            description="Data input mode",
            values=wrap(["paired", "annotate"]), default="paired"),

        omscripts.String(
            "Mask_Suffix", optional=True, grouping="06",
            description="Suffix for mask images (paired mode)",
            default="_label"),

        omscripts.Float(
            "Val_Split", optional=True, grouping="07",
            description="Validation fraction (paired mode)",
            default=0.2),

        omscripts.Float(
            "Test_Split", optional=True, grouping="08",
            description="Test fraction (paired mode)",
            default=0.0),

        omscripts.String(
            "Model_Name", optional=True, grouping="09",
            description="Model display name",
            default="my_model"),

        omscripts.Int(
            "N_Epochs", optional=True, grouping="10",
            description="Training epochs",
            default=100),

        omscripts.Float(
            "Learning_Rate", optional=True, grouping="11",
            description="Learning rate",
            default=0.00001),

        omscripts.Float(
            "Weight_Decay", optional=True, grouping="12",
            description="Weight decay",
            default=0.1),

        omscripts.Int(
            "Batch_Size", optional=True, grouping="13",
            description="Training batch size",
            default=1),

        omscripts.String(
            "Channels", optional=True, grouping="14",
            description="Cytoplasm,nucleus channel indices",
            default="0,0"),

        version=VERSION,
        authors=["BIOMERO"],
        institutions=["Amsterdam UMC"],
        contact="biomero@amsterdamumc.nl",
    )

    try:
        conn = BlitzGateway(client_obj=client)
        conn.keepAlive()

        # Extract parameters
        data_type = unwrap(client.getInput("Data_Type"))
        ids = unwrap(client.getInput("IDs"))
        workflow = unwrap(client.getInput("Workflow"))
        version = unwrap(client.getInput("Workflow_Version"))
        data_mode = unwrap(client.getInput("Data_Mode"))
        mask_suffix = unwrap(client.getInput("Mask_Suffix")) or "_label"
        val_split = unwrap(client.getInput("Val_Split")) or 0.2
        test_split = unwrap(client.getInput("Test_Split")) or 0.0
        model_name = unwrap(client.getInput("Model_Name")) or "my_model"
        n_epochs = unwrap(client.getInput("N_Epochs")) or 100
        learning_rate = unwrap(client.getInput("Learning_Rate")) or 0.00001
        weight_decay = unwrap(client.getInput("Weight_Decay")) or 0.1
        batch_size = unwrap(client.getInput("Batch_Size")) or 1
        channels_str = unwrap(client.getInput("Channels")) or "0,0"

        channels = [int(c.strip()) for c in channels_str.split(",")]

        username = conn.getUser().getName()

        with SlurmClient.from_config() as slurmClient:
            # Generate a unique folder name for this training run
            timestamp = int(timesleep.time())
            folder_name = f"training_{workflow}_{timestamp}"

            # Prepare data based on mode
            if data_mode == "annotate":
                prepare_annotate_data(
                    conn, ids, slurmClient, folder_name)
            else:
                prepare_paired_data(
                    conn, ids, slurmClient, folder_name,
                    mask_suffix, val_split, test_split)

            # Generate config.yaml on SLURM
            write_config_to_slurm(
                slurmClient, folder_name, workflow,
                model_name, n_epochs, learning_rate,
                weight_decay, batch_size, channels,
                ids, username)

            # Run training workflow
            result, slurm_job_id, wf_id, task_id = slurmClient.run_workflow(
                workflow_name=workflow,
                workflow_version=version,
                input_data=folder_name,
                training_mode="true",
            )

            # Poll for completion
            msg = poll_job(slurmClient, slurm_job_id, conn, client)

            # Upload results back to OMERO
            upload_results(
                conn, slurmClient, folder_name,
                ids, slurm_job_id)

        client.setOutput("Message", rstring(msg))

    except Exception:
        traceback.print_exc()
        client.setOutput("Message", rstring(f"Error: {traceback.format_exc()}"))
    finally:
        client.closeSession()


if __name__ == "__main__":
    runScript()
```

- [ ] **Step 2: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts && python -c "import ast; ast.parse(open('__workflows/SLURM_Run_Training.py').read()); print('OK')"`
Expected: FAIL (references undefined functions — that's expected, we'll add them next)

Actually, Python will parse it fine since the functions are just called, not imported at module level. Let's verify:
Run: `python -c "import ast; ast.parse(open('__workflows/SLURM_Run_Training.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts
git add __workflows/SLURM_Run_Training.py
git commit -m "feat: add SLURM_Run_Training.py scaffold with parameter definitions"
```

---

### Task 8: Add paired data preparation to SLURM_Run_Training.py

**Files:**
- Modify: `biomero-scripts/__workflows/SLURM_Run_Training.py`

- [ ] **Step 1: Add prepare_paired_data function**

Insert before `runScript()`:

```python
def prepare_paired_data(conn, dataset_ids, slurmClient, folder_name,
                        mask_suffix, val_split, test_split):
    """Prepare training data from paired image + mask datasets.

    Matches images with masks by suffix, randomly splits into
    train/validation/test, and uploads to SLURM.
    """
    data_path = slurmClient.slurm_data_path

    # Create directory structure on SLURM
    for split in ["train", "validation", "test"]:
        slurmClient.run_commands([
            f"mkdir -p {data_path}/{folder_name}/data/in/{split}",
            f"mkdir -p {data_path}/{folder_name}/data/gt/{split}",
        ])
    slurmClient.run_commands([
        f"mkdir -p {data_path}/{folder_name}/data/out",
    ])

    for dataset_id in dataset_ids:
        dataset = conn.getObject("Dataset", dataset_id)
        if not dataset:
            print(f"Dataset {dataset_id} not found, skipping")
            continue

        # Collect all images and identify pairs
        all_images = {}
        mask_images = {}
        for image in dataset.listChildren():
            name = image.getName()
            stem = os.path.splitext(name)[0]
            if mask_suffix in stem:
                # This is a mask — key by the image stem it belongs to
                image_stem = stem.replace(mask_suffix, "")
                mask_images[image_stem] = image
            else:
                all_images[stem] = image

        # Find pairs
        paired = []
        for stem, img in all_images.items():
            if stem in mask_images:
                paired.append((img, mask_images[stem], stem))
            else:
                print(f"WARNING: No mask found for {img.getName()} "
                      f"(expected {stem}{mask_suffix}.*)")

        if not paired:
            print(f"No paired images found in dataset {dataset_id}")
            continue

        # Random split
        random.shuffle(paired)
        n_total = len(paired)
        n_val = int(n_total * val_split)
        n_test = int(n_total * test_split)
        n_train = n_total - n_val - n_test

        splits = (
            [("train", p) for p in paired[:n_train]] +
            [("validation", p) for p in paired[n_train:n_train + n_val]] +
            [("test", p) for p in paired[n_train + n_val:]]
        )

        # Export each pair to SLURM
        for split, (img, mask, stem) in splits:
            export_image_to_slurm(
                conn, img,
                f"{data_path}/{folder_name}/data/in/{split}/{stem}.tif",
                slurmClient)
            export_image_to_slurm(
                conn, mask,
                f"{data_path}/{folder_name}/data/gt/{split}/{stem}.tif",
                slurmClient)

    print(f"Paired data prepared: {n_train} train, {n_val} val, {n_test} test")


def export_image_to_slurm(conn, image, remote_path, slurmClient):
    """Export an OMERO image as TIFF and upload to SLURM."""
    from tifffile import imwrite

    pixels = image.getPrimaryPixels()
    plane = pixels.getPlane(0, 0, 0)

    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        imwrite(tmp.name, plane)
        tmp_path = tmp.name

    try:
        slurmClient.put(tmp_path, remote_path)
    finally:
        os.remove(tmp_path)
```

- [ ] **Step 2: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts && python -c "import ast; ast.parse(open('__workflows/SLURM_Run_Training.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add __workflows/SLURM_Run_Training.py
git commit -m "feat: add paired data preparation for training script"
```

---

### Task 9: Add annotate data preparation to SLURM_Run_Training.py

**Files:**
- Modify: `biomero-scripts/__workflows/SLURM_Run_Training.py`

- [ ] **Step 1: Add prepare_annotate_data function**

Insert before `prepare_paired_data()`:

```python
def prepare_annotate_data(conn, dataset_ids, slurmClient, folder_name):
    """Prepare training data from annotate_ai tracking table.

    Reads the tracking table to get split assignments, exports images,
    and rasterizes ROIs into instance label masks.
    """
    data_path = slurmClient.slurm_data_path

    # Create directory structure on SLURM
    for split in ["train", "validation", "test"]:
        slurmClient.run_commands([
            f"mkdir -p {data_path}/{folder_name}/data/in/{split}",
            f"mkdir -p {data_path}/{folder_name}/data/gt/{split}",
        ])
    slurmClient.run_commands([
        f"mkdir -p {data_path}/{folder_name}/data/out",
    ])

    for dataset_id in dataset_ids:
        dataset = conn.getObject("Dataset", dataset_id)
        if not dataset:
            print(f"Dataset {dataset_id} not found, skipping")
            continue

        # Find the tracking table
        tracking_table = find_tracking_table(conn, dataset)
        if not tracking_table:
            print(f"No tracking table found for dataset {dataset_id}")
            continue

        # Read split assignments from the table
        assignments = read_split_assignments(conn, tracking_table)

        for image_id, split in assignments.items():
            if split not in ("train", "validation", "test"):
                continue

            image = conn.getObject("Image", image_id)
            if not image:
                print(f"Image {image_id} not found, skipping")
                continue

            stem = os.path.splitext(image.getName())[0]

            # Export image
            export_image_to_slurm(
                conn, image,
                f"{data_path}/{folder_name}/data/in/{split}/{stem}.tif",
                slurmClient)

            # Rasterize ROIs to mask
            mask = rasterize_rois(conn, image)
            if mask is not None:
                export_mask_to_slurm(
                    mask,
                    f"{data_path}/{folder_name}/data/gt/{split}/{stem}.tif",
                    slurmClient)
            else:
                print(f"WARNING: No ROIs found for image {image_id}")


def find_tracking_table(conn, dataset):
    """Find the annotate_ai tracking table attached to the dataset."""
    for ann in dataset.listAnnotations():
        if isinstance(ann, omero.gateway.FileAnnotationWrapper):
            ns = ann.getNs() or ""
            if "tracking" in ns.lower() or "annotate" in ns.lower():
                return ann
    return None


def read_split_assignments(conn, tracking_table):
    """Read image → split assignments from the tracking table.

    Returns dict mapping image_id → split name (train/validation/test).
    """
    # The tracking table stores processing units with split info
    # Read the OMERO.table to extract assignments
    assignments = {}
    try:
        orig_file = tracking_table.getFile()
        table_id = orig_file.getId()
        resources = conn.c.sf.sharedResources()
        table = resources.openTable(omero.model.OriginalFileI(table_id, False))
        if table:
            headers = table.getHeaders()
            n_rows = table.getNumberOfRows()

            # Find column indices
            image_col = None
            split_col = None
            for i, h in enumerate(headers):
                if h.name.lower() in ("image_id", "image"):
                    image_col = i
                elif h.name.lower() in ("split", "category", "set"):
                    split_col = i

            if image_col is not None and split_col is not None:
                data = table.read(
                    list(range(len(headers))), 0, n_rows)
                for row_idx in range(n_rows):
                    img_id = data.columns[image_col].values[row_idx]
                    split = data.columns[split_col].values[row_idx]
                    assignments[int(img_id)] = str(split).lower()

            table.close()
    except Exception as e:
        print(f"Error reading tracking table: {e}")

    return assignments


def rasterize_rois(conn, image):
    """Rasterize all ROIs on an image into an instance label mask.

    Returns a uint16 numpy array where each ROI gets a unique label,
    or None if no ROIs found.
    """
    import cv2

    roi_service = conn.getRoiService()
    result = roi_service.findByImage(image.getId(), None)

    if not result or not result.rois:
        return None

    size_x = image.getSizeX()
    size_y = image.getSizeY()
    mask = np.zeros((size_y, size_x), dtype=np.uint16)

    label = 1
    for roi in result.rois:
        for shape in roi.copyShapes():
            if isinstance(shape, omero.model.PolygonI):
                points_str = shape.getPoints().getValue()
                pts = parse_polygon_points(points_str)
                if len(pts) >= 3:
                    pts_array = np.array(pts, dtype=np.int32)
                    cv2.fillPoly(mask, [pts_array], color=int(label))
                    label += 1
            elif isinstance(shape, omero.model.RectangleI):
                x = int(shape.getX().getValue())
                y = int(shape.getY().getValue())
                w = int(shape.getWidth().getValue())
                h = int(shape.getHeight().getValue())
                mask[y:y+h, x:x+w] = label
                label += 1
            elif isinstance(shape, omero.model.EllipseI):
                cx = int(shape.getX().getValue())
                cy = int(shape.getY().getValue())
                rx = int(shape.getRadiusX().getValue())
                ry = int(shape.getRadiusY().getValue())
                cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360,
                           color=int(label), thickness=-1)
                label += 1

    return mask if label > 1 else None


def parse_polygon_points(points_str):
    """Parse OMERO polygon points string to list of [x, y] pairs.

    OMERO stores polygon points as "x1,y1 x2,y2 x3,y3 ..."
    """
    points = []
    for pair in points_str.strip().split(" "):
        parts = pair.split(",")
        if len(parts) == 2:
            points.append([int(float(parts[0])), int(float(parts[1]))])
    return points


def export_mask_to_slurm(mask, remote_path, slurmClient):
    """Save a numpy mask array as TIFF and upload to SLURM."""
    from tifffile import imwrite

    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        imwrite(tmp.name, mask)
        tmp_path = tmp.name

    try:
        slurmClient.put(tmp_path, remote_path)
    finally:
        os.remove(tmp_path)
```

- [ ] **Step 2: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts && python -c "import ast; ast.parse(open('__workflows/SLURM_Run_Training.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add __workflows/SLURM_Run_Training.py
git commit -m "feat: add annotate data preparation with ROI rasterization"
```

---

### Task 10: Add config generation, job polling, and result upload to SLURM_Run_Training.py

**Files:**
- Modify: `biomero-scripts/__workflows/SLURM_Run_Training.py`

- [ ] **Step 1: Add write_config_to_slurm, poll_job, and upload_results functions**

Insert before `runScript()`:

```python
def write_config_to_slurm(slurmClient, folder_name, workflow,
                           model_name, n_epochs, learning_rate,
                           weight_decay, batch_size, channels,
                           dataset_ids, username):
    """Generate config.yaml and upload to SLURM."""
    import yaml

    config = {
        "training": {
            "pretrained_model": "cpsam",
            "n_epochs": n_epochs,
            "learning_rate": learning_rate,
            "weight_decay": weight_decay,
            "batch_size": batch_size,
            "model_name": model_name,
            "channels": channels,
        },
        "metadata": {
            "source_datasets": list(dataset_ids),
            "trained_by": username,
            "workflow_name": workflow,
        },
    }

    data_path = slurmClient.slurm_data_path
    remote_path = f"{data_path}/{folder_name}/data/config.yaml"

    with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False) as tmp:
        yaml.dump(config, tmp, default_flow_style=False)
        tmp_path = tmp.name

    try:
        slurmClient.put(tmp_path, remote_path)
    finally:
        os.remove(tmp_path)

    print(f"Config written to {remote_path}")


def poll_job(slurmClient, slurm_job_id, conn, client):
    """Poll SLURM job until completion."""
    if slurm_job_id < 0:
        return "Failed to submit SLURM job"

    print(f"Polling SLURM job {slurm_job_id}...")
    while True:
        job_status_dict, _ = slurmClient.check_job_status([slurm_job_id])
        job_state = job_status_dict.get(slurm_job_id, "UNKNOWN")

        print(f"  Job {slurm_job_id}: {job_state}")

        if job_state == "COMPLETED":
            return f"Training completed (SLURM job {slurm_job_id})"
        elif job_state in ("FAILED", "TIMEOUT", "CANCELLED", "OUT_OF_MEMORY"):
            return f"Training {job_state} (SLURM job {slurm_job_id})"
        elif job_state == "UNKNOWN":
            return f"Job {slurm_job_id} status unknown"

        conn.keepAlive()
        timesleep.sleep(10)


def upload_results(conn, slurmClient, folder_name, dataset_ids, slurm_job_id):
    """Download training results from SLURM and upload to OMERO."""
    import yaml

    data_path = slurmClient.slurm_data_path
    out_path = f"{data_path}/{folder_name}/data/out"

    # Download training_results.yaml
    results = {}
    with tempfile.NamedTemporaryFile(
            suffix=".yaml", delete=False) as tmp:
        try:
            slurmClient.get(f"{out_path}/training_results.yaml", tmp.name)
            with open(tmp.name) as f:
                results = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Could not download training_results.yaml: {e}")
        finally:
            os.remove(tmp.name)

    model_id = results.get("model_id", f"model_{slurm_job_id}")

    # Find and download model zip
    zip_filename = f"{model_id}.zip"
    with tempfile.NamedTemporaryFile(
            suffix=".zip", delete=False) as tmp:
        try:
            slurmClient.get(f"{out_path}/{zip_filename}", tmp.name)
            zip_path = tmp.name
        except Exception as e:
            print(f"Could not download model zip: {e}")
            zip_path = None

    # Upload to OMERO for each source dataset
    for dataset_id in dataset_ids:
        dataset = conn.getObject("Dataset", dataset_id)
        if not dataset:
            continue

        group_id = dataset.getDetails().getGroup().getId()
        conn.SERVICE_OPTS.setOmeroGroup(group_id)

        # Upload model zip as FileAnnotation
        if zip_path and os.path.exists(zip_path):
            file_ann = conn.createFileAnnfromLocalFile(
                zip_path,
                mimetype="application/zip",
                ns=NS_TRAINING_MODEL,
                desc=f"Trained model: {model_id}",
            )
            # Rename file to zip_filename
            orig_file = file_ann.getFile()
            orig_file.setName(zip_filename)
            orig_file.save()

            dataset.linkAnnotation(file_ann)
            print(f"Model zip uploaded as FileAnnotation {file_ann.getId()}")

        # Upload results as MapAnnotation
        if results:
            map_data = [
                [str(k), str(v)] for k, v in results.items()
                if not isinstance(v, (dict, list))
            ]
            map_ann = omero.gateway.MapAnnotationWrapper(conn)
            map_ann.setNs(NS_TRAINING_RESULTS)
            map_ann.setValue(map_data)
            map_ann.save()
            dataset.linkAnnotation(map_ann)
            print(f"Results uploaded as MapAnnotation {map_ann.getId()}")

    # Cleanup zip
    if zip_path and os.path.exists(zip_path):
        os.remove(zip_path)
```

- [ ] **Step 2: Add yaml and tifffile to imports at top of file**

Add `import yaml` is not needed at module level since it's imported inside functions. But add `import tempfile` if not already present (it should be from the scaffold).

Verify all needed imports are at the top:
```python
import os
import sys
import random
import tempfile
import time as timesleep
import traceback
from io import BytesIO

import numpy as np
```

- [ ] **Step 3: Verify the file parses**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/biomero-scripts && python -c "import ast; ast.parse(open('__workflows/SLURM_Run_Training.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add __workflows/SLURM_Run_Training.py
git commit -m "feat: add config generation, job polling, and result upload"
```

---

### Task 11: Build webapp and verify

**Files:**
- No new files

- [ ] **Step 1: Build the webapp**

Run:
```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp
npm run build
```

Expected: Build succeeds with no errors. Warnings are OK.

- [ ] **Step 2: Copy built assets to Django static**

The build should output to `omero_biomero/static/omero_biomero/assets/`. Verify:

```bash
ls -la /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/omero_biomero/static/omero_biomero/assets/main.*.js
```

Expected: New main.*.js file exists.

- [ ] **Step 3: Commit built assets**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add omero_biomero/static/omero_biomero/assets/
git commit -m "build: update webapp assets with training tab"
```
