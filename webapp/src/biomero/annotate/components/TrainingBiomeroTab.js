import React, { useState, useEffect, useCallback } from "react";
import {
  H4,
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
