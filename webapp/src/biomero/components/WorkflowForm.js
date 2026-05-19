import React, { useEffect, useState } from "react";
import { FormGroup, InputGroup, NumericInput, Switch, HTMLSelect, Intent, Tag, Callout, Divider, Tooltip, Icon } from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";

const WorkflowForm = () => {
  const { state, updateState } = useAppContext();
  const [selectedVersion, setSelectedVersion] = useState("");

  const ghURL = state.selectedWorkflow?.githubUrl;
  const versionMatch = ghURL?.match(/\/tree\/(v[\d.]+)/);
  const configuredVersion = versionMatch ? versionMatch[1] : "";
  const workflowMetadata = state.selectedWorkflow?.metadata;
  const workflowName = state.selectedWorkflow?.name;
  const workflowVersions = state.workflowVersions?.[workflowName];
  const availableVersions = workflowVersions?.available_versions || [];
  const latestVersion = workflowVersions?.latest_version;
  const slurmOnline = state.slurmStatus === "online";

  // Determine version status
  const getVersionStatus = (version) => {
    if (!slurmOnline) {
      return { intent: Intent.DANGER, message: "SLURM cluster offline" };
    }
    if (!availableVersions.includes(version)) {
      return { intent: Intent.DANGER, message: "Version not available on SLURM" };
    }
    if (version !== latestVersion && latestVersion) {
      return { intent: Intent.WARNING, message: `Outdated version (latest: ${latestVersion})` };
    }
    return { intent: Intent.SUCCESS, message: "Version available" };
  };

  // Helper function to check workflow flags from config and from schema metadata
  const getWorkflowFlags = (workflowName) => {
    const config = state.config;
    let isPlateWorkflow = false;
    let isZarrWorkflow = false;

    // Admin-configured overrides (zarr_workflows / plate_workflows lists)
    if (config?.UI) {
      const plateWorkflows = config.UI.plate_workflows ?
        JSON.parse(config.UI.plate_workflows || '[]') : [];
      const zarrWorkflows = config.UI.zarr_workflows ?
        JSON.parse(config.UI.zarr_workflows || '[]') : [];
      isPlateWorkflow = plateWorkflows.includes(workflowName);
      isZarrWorkflow = zarrWorkflows.includes(workflowName);
    }

    // Schema-level flags auto-detected from the descriptor (bilayers)
    isZarrWorkflow = isZarrWorkflow || (workflowMetadata?.['requires-zarr'] ?? false);
    isPlateWorkflow = isPlateWorkflow || (workflowMetadata?.['requires-plate'] ?? false);

    return { isPlateWorkflow, isZarrWorkflow };
  };

  // Initialize selected version
  useEffect(() => {
    if (!selectedVersion) {
      if (availableVersions.includes(configuredVersion)) {
        setSelectedVersion(configuredVersion);
      } else if (latestVersion) {
        setSelectedVersion(latestVersion);
      } else if (configuredVersion) {
        setSelectedVersion(configuredVersion);
      }
    }
  }, [configuredVersion, availableVersions, latestVersion, selectedVersion]);

  if (!workflowMetadata) {
    return <div>Loading workflow...</div>;
  }

  const defaultValues = workflowMetadata.inputs.reduce((acc, input) => {
    const defaultValue = input["default-value"];

    if (input.type === "Number" || input.type === "integer" || input.type === "float") {
      acc[input.id] = defaultValue !== undefined ? Number(defaultValue) : 0;
    } else if (input.type === "Boolean" || input.type === "boolean") {
      acc[input.id] =
        defaultValue !== undefined ? Boolean(defaultValue) : false;
    } else {
      acc[input.id] = defaultValue || "";
    }
    return acc;
  }, {});

  useEffect(() => {
    if (selectedVersion) {
      updateState({ 
        formData: { 
          ...defaultValues, 
          ...state.formData, 
          version: selectedVersion
        } 
      });
    }
  }, [selectedVersion]);

  // Force ZARR format when workflow requires it (plate workflows or admin-configured ZARR workflows)
  useEffect(() => {
    if (workflowName) {
      const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflowName);
      
      if (isPlateWorkflow || isZarrWorkflow) {
        // Force ZARR for plate workflows or admin-configured ZARR workflows
        updateState({
          formData: {
            ...state.formData,
            Format: "ZARR", // Force zarr format for configured workflows
            useZarrFormat: true, // Force zarr backend flag for configured workflows
          },
        });
      }
    }
  }, [workflowName, state.config, workflowMetadata]);

  const handleInputChange = (id, value) => {
    updateState({
      formData: {
        ...state.formData,
        [id]: value,
      },
    });
  };

  const renderFormFields = () => {
    return workflowMetadata.inputs
      .filter((input) => !input.id.startsWith("cytomine")) // Ignore fields starting with "cytomine"
      .filter((input) => !input["set-by-server"]) // Ignore server-assigned parameters
      .filter((input) => !input["output-dir-set"]) // Ignore output directory parameters (set by biomero)
      .map((input) => {
        const { id, name, description, type, optional } = input;
        const defaultValue = input["default-value"];
        const isFormatField = id === "Format";
        const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflowName);
        const requiresZarr = isPlateWorkflow || isZarrWorkflow;

        switch (type) {
          case "string":
          case "String":
            // Special handling for Format field when workflow requires ZARR
            if (isFormatField && requiresZarr) {
              return (
                <FormGroup
                  key={id}
                  label={name}
                  labelFor={id}
                  helperText="Format is locked to ZARR for admin-configured workflows"
                >
                  <InputGroup
                    id={id}
                    value="ZARR"
                    readOnly={true}
                    disabled={true}
                    intent="primary"
                    rightElement={
                      <Tooltip content="This workflow requires ZARR format (admin-configured)">
                        <Icon icon="lock" intent="primary" />
                      </Tooltip>
                    }
                  />
                </FormGroup>
              );
            }
            // Dropdown when value-choices are provided
            if (input["value-choices"]?.length > 0) {
              return (
                <FormGroup
                  key={id}
                  label={name}
                  labelFor={id}
                  helperText={description || ""}
                >
                  <HTMLSelect
                    id={id}
                    value={state.formData[id] !== undefined ? state.formData[id] : (defaultValue || "")}
                    onChange={(e) => handleInputChange(id, e.target.value)}
                  >
                    {input["value-choices"].map((choice) => (
                      <option key={choice} value={choice}>{choice}</option>
                    ))}
                  </HTMLSelect>
                </FormGroup>
              );
            }
            return (
              <FormGroup
                key={id}
                label={name}
                labelFor={id}
                helperText={description || ""}
              >
                <InputGroup
                  id={id}
                  value={state.formData[id] || ""}
                  onChange={(e) => handleInputChange(id, e.target.value)}
                  placeholder={defaultValue || name}
                />
              </FormGroup>
            );
          case "integer":
            return (
              <FormGroup
                key={id}
                label={name}
                labelFor={id}
                helperText={description || ""}
              >
                <NumericInput
                  id={id}
                  value={
                    state.formData[id] !== undefined
                      ? state.formData[id]
                      : defaultValue !== undefined
                      ? defaultValue
                      : 0
                  }
                  stepSize={1}
                  minorStepSize={null}
                  onValueChange={(valueAsNumber, valueAsString) => {
                    if (isNaN(valueAsNumber) || valueAsNumber === null) {
                      handleInputChange(id, valueAsString);
                    } else {
                      handleInputChange(id, Math.trunc(valueAsNumber));
                    }
                  }}
                  onBlur={(e) => {
                    const finalValue = parseInt(e.target.value, 10);
                    handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const finalValue = parseInt(e.currentTarget.value, 10);
                      handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                    }
                  }}
                  placeholder={optional ? `Optional ${name}` : name}
                  allowNumericCharactersOnly={true}
                />
              </FormGroup>
            );
          case "float":
            return (
              <FormGroup
                key={id}
                label={name}
                labelFor={id}
                helperText={description || ""}
              >
                <NumericInput
                  id={id}
                  value={
                    state.formData[id] !== undefined
                      ? state.formData[id]
                      : defaultValue !== undefined
                      ? defaultValue
                      : 0
                  }
                  stepSize={0.01}
                  minorStepSize={0.001}
                  onValueChange={(valueAsNumber, valueAsString) => {
                    if (
                      valueAsString.endsWith(".") ||
                      valueAsString.includes("e") ||
                      isNaN(valueAsNumber) ||
                      valueAsNumber === null
                    ) {
                      handleInputChange(id, valueAsString);
                    } else {
                      handleInputChange(id, valueAsNumber);
                    }
                  }}
                  onBlur={(e) => {
                    const finalValue = parseFloat(e.target.value);
                    handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const finalValue = parseFloat(e.currentTarget.value);
                      handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                    }
                  }}
                  placeholder={optional ? `Optional ${name}` : name}
                  allowNumericCharactersOnly={false}
                />
              </FormGroup>
            );
          case "Number":
            return (
              <FormGroup
                key={id}
                label={name}
                labelFor={id}
                helperText={description || ""}
              >
                <NumericInput
                  id={id}
                  value={
                    state.formData[id] !== undefined
                      ? state.formData[id]
                      : defaultValue !== undefined
                      ? defaultValue
                      : 0
                  }
                  onValueChange={(valueAsNumber, valueAsString) => {
                    if (
                      valueAsString.endsWith(".") ||
                      valueAsString.includes("e") ||
                      isNaN(valueAsNumber) ||
                      valueAsNumber === null
                    ) {
                      handleInputChange(id, valueAsString);
                    } else {
                      handleInputChange(id, valueAsNumber);
                    }
                  }}
                  onBlur={(e) => {
                    const finalValue = parseFloat(e.target.value);
                    handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const finalValue = parseFloat(e.currentTarget.value);
                      handleInputChange(id, isNaN(finalValue) ? 0 : finalValue);
                    }
                  }}
                  placeholder={optional ? `Optional ${name}` : name}
                  allowNumericCharactersOnly={false}
                />
              </FormGroup>
            );
          case "boolean":
          case "Boolean":
            return (
              <FormGroup
                key={id}
                label={name}
                labelFor={id}
                helperText={description || ""}
              >
                <Switch
                  id={id}
                  checked={
                    state.formData[id] !== undefined
                      ? state.formData[id]
                      : defaultValue || false
                  }
                  onChange={(e) => handleInputChange(id, e.target.checked)}
                  label={name}
                />
              </FormGroup>
            );
          default:
            return null;
        }
      });
  };

  return (
    <form>
      <h2>{workflowMetadata.name || workflowMetadata.workflow}</h2>
      
      {/* Version Selection */}
      <FormGroup
        label="Workflow Version"
        labelInfo="(required)"
        helperText="Select the version to run on SLURM cluster"
      >
        <div className="flex items-center gap-2">
          <HTMLSelect
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            disabled={!slurmOnline}
          >
            {!selectedVersion && <option value="">Select version...</option>}
            {configuredVersion && (
              <option value={configuredVersion}>
                {configuredVersion} (Configured)
              </option>
            )}
            {availableVersions.map(version => 
              version !== configuredVersion && (
                <option key={version} value={version}>
                  {version} {version === latestVersion ? "(Latest)" : ""}
                </option>
              )
            )}
            {/* Show unavailable configured version as option */}
            {configuredVersion && !availableVersions.includes(configuredVersion) && (
              <option value={configuredVersion} disabled>
                {configuredVersion} (Not Available)
              </option>
            )}
          </HTMLSelect>
          
          {selectedVersion && (
            <Tag
              intent={getVersionStatus(selectedVersion).intent}
              minimal
              round
            >
              {getVersionStatus(selectedVersion).message}
            </Tag>
          )}
        </div>
      </FormGroup>
      
      {/* Warning callouts - only show critical ones inline */}
      {!slurmOnline && (
        <FormGroup helperText="">
          <Callout intent={Intent.DANGER}>
            SLURM cluster is offline. Cannot validate or run workflows.
          </Callout>
        </FormGroup>
      )}
      
      {selectedVersion && slurmOnline && !availableVersions.includes(selectedVersion) && (
        <FormGroup helperText="">
          <Callout intent={Intent.DANGER}>
            Selected version "{selectedVersion}" is not available on the SLURM cluster. 
            {availableVersions.length > 0 ? `Available versions: ${availableVersions.join(", ")}` : "No versions available."}
          </Callout>
        </FormGroup>
      )}
      
      {selectedVersion && selectedVersion !== latestVersion && latestVersion && availableVersions.includes(selectedVersion) && (
        <FormGroup helperText="">
          <Callout intent={Intent.WARNING}>
            You are using an older version. Latest available: {latestVersion}
          </Callout>
        </FormGroup>
      )}
      
      <Divider />
      
      {renderFormFields()}
    </form>
  );
};

export default WorkflowForm;
