import React, { useState, useEffect, useMemo, useRef } from "react";
import { InputGroup, FormGroup, Switch, Callout, Tooltip, Icon } from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover.js";

const WorkflowOutput = ({ onSelectionChange }) => {
  const { state, updateState } = useAppContext();
  const [renamePattern, setRenamePattern] = useState("{original_file}_result.{ext}");
  const [renameValidation, setRenameValidation] = useState({ hasError: false, hasWarning: false, message: "" });
  const renameInputRef = useRef(null);
  const outputOptions = [
    "importAsZip",
    "uploadCsv", 
    "attachToOriginalImages",
    "selectedDatasets",
  ];
  const defaultValues = {
    receiveEmail: true,
    importAsZip: false,
    uploadCsv: false,
    attachToOriginalImages: false,
    selectedDatasets: [],
    selectedDatasetId: null, // OMERO ID when selected from tree (null = typed/new)
    renamePattern: "{original_file}_result.{ext}",
    enableRename: false,
  };

  const hasOutputSelection = useMemo(() => outputOptions.some((opt) =>
    Array.isArray(state.formData?.[opt])
      ? state.formData[opt].length > 0
      : !!state.formData?.[opt]
  ), [state.formData]);

  const outputHints = useMemo(() => {
    const outputs = state.selectedWorkflow?.metadata?.outputs || [];
    const isType = (output, expected) => String(output?.type || "").toLowerCase() === expected;
    const isCsvTableOutput = (output) => {
      const type = String(output?.type || "").toLowerCase();
      if (!["measurement", "file"].includes(type)) return false;
      const formats = Array.isArray(output?.format)
        ? output.format
        : (output?.format ? [output.format] : []);
      return formats.map((fmt) => String(fmt).toLowerCase()).includes("csv");
    };
    const imageOutputs = outputs.filter((output) => isType(output, "image"));
    const measurementOutputs = outputs.filter((output) => isCsvTableOutput(output));
    const zipOutputs = outputs.filter((output) => ["file", "array", "executable"].includes(String(output?.type || "").toLowerCase()));

    const summarize = (items) => {
      const names = items.map((o) => o.name || o.id).filter(Boolean);
      if (names.length === 0) return "";
      const head = names.slice(0, 2).join(", ");
      return names.length > 2 ? `${head}, +${names.length - 2} more` : head;
    };

    return {
      imageCount: imageOutputs.length,
      measurementCount: measurementOutputs.length,
      zipCount: zipOutputs.length,
      imageLabel: summarize(imageOutputs),
      measurementLabel: summarize(measurementOutputs),
      zipLabel: summarize(zipOutputs),
      importAsZip: zipOutputs.length > 0,
      uploadCsv: measurementOutputs.length > 0,
    };
  }, [state.selectedWorkflow?.metadata]);

  const renderDefaultCue = (enabled, label) => enabled ? (
    <Tooltip content={`Enabled by default for: ${label}. You can switch it off.`} placement="top">
      <span className="inline-flex items-center gap-1 text-xs text-sky-700 cursor-help">
        <Icon icon="info-sign" size={12} />
        <span>Default for {label}</span>
      </span>
    </Tooltip>
  ) : null;

  const renderDefaultHelper = (enabled, message, fallback) => enabled
    ? <span className="text-sky-700">{message}</span>
    : fallback;

  useEffect(() => {
    // Sync rename fields - if enableRename is false, ensure pattern gets sent as empty or default
    if (state.formData.enableRename === false) {
      // When rename is disabled, still keep the pattern but the boolean will control usage
      setRenamePattern(state.formData.renamePattern || defaultValues.renamePattern);
    }
  }, [state.formData.enableRename]);

  useEffect(() => {
    // Tell the parent about output selection AND rename validation errors
    const hasValidationError = state.formData.enableRename && renameValidation.hasError;
    const canProceed = hasOutputSelection && !hasValidationError;
    onSelectionChange(canProceed);
  }, [hasOutputSelection, renameValidation, state.formData.enableRename]);

  useEffect(() => {
    const inputs = state.inputDatasets || [];
    if (inputs.length === 0) return;
    const hasPlate = inputs.some((d) => d?.category === "plates");
    const allDatasets = inputs.every((d) => d?.category === "datasets");

    // Backward compatibility: never clear existing dataset target defaults here.
    // If inputs are not datasets, keep whatever is already selected.
    if (hasPlate || !allDatasets) return;

    // Only auto-populate when all inputs are datasets and nothing chosen yet
    if (
      allDatasets &&
      (!state.formData.selectedDatasets ||
        state.formData.selectedDatasets.length === 0)
    ) {
      const inputDatasetNames = inputs.map((dataset) => dataset.data);
      // Also carry the OMERO ID when there is exactly one input dataset
      const autoId = inputs.length === 1 ? (inputs[0].id ?? null) : null;
      handleFormDataUpdate({
        selectedDatasets: inputDatasetNames,
        selectedDatasetId: autoId,
      });
    }
  }, [state.inputDatasets, state.formData.selectedDatasets]);
  
  const validateRenamePattern = (pattern) => {
    
    if (pattern.trim() === "") {
      return { hasError: true, hasWarning: false, message: "Pattern cannot be empty" };
    }
    
    // Check for invalid variable names
    const validVariables = ['original_file', 'original_ext', 'file', 'ext'];
    const variablePattern = /\{([^}]+)\}/g;
    const foundVariables = [...pattern.matchAll(variablePattern)].map(match => match[1]);
    const invalidVariables = foundVariables.filter(v => !validVariables.includes(v));
    
    if (invalidVariables.length > 0) {
      return { 
        hasError: true, 
        hasWarning: false, 
        message: `Invalid variable(s): {${invalidVariables.join('}, {')}}. Use: {original_file}, {original_ext}, {file}, or {ext}` 
      };
    }
    
    // Check if pattern has any extension: {ext}, {original_ext}, or manual like .csv, .tiff
    const hasVariableExt = pattern.includes("{ext}") || pattern.includes("{original_ext}");
    const hasManualExt = /\.[a-zA-Z0-9]+/.test(pattern);
    
    if (!hasVariableExt && !hasManualExt) {
      return { hasError: false, hasWarning: true, message: "Consider adding an extension like .{ext} or .tiff" };
    }
    
    return { hasError: false, hasWarning: false, message: "" };
  };

  const handleInputChange = (key, value) => {
    // Compute new state immediately
    const updatedFormData = {
      ...state.formData,
      [key]: value,
    };

    updateState({ formData: updatedFormData });

  };

  // Atomic multi-key update — avoids stale-closure bug when updating related fields together
  const handleFormDataUpdate = (changes) => {
    const updatedFormData = { ...state.formData, ...changes };
    updateState({ formData: updatedFormData });
  };

  const handleRenamePatternChange = (e) => {
    const newValue = e.target.value;
    setRenamePattern(newValue);
    handleInputChange("renamePattern", newValue);
    
    // Validate pattern only if rename is enabled
    if (state.formData.enableRename) {
      const validation = validateRenamePattern(newValue);
      setRenameValidation(validation);
    }
    
    // Auto-enable rename if user edits pattern and it's currently disabled
    if (!state.formData.enableRename && newValue !== defaultValues.renamePattern) {
      handleInputChange("enableRename", true);
      // Validate after enabling
      const validation = validateRenamePattern(newValue);
      setRenameValidation(validation);
    }
  };

  const handleExampleClick = (pattern) => {
    setRenamePattern(pattern);

    // Validate pattern
    const validation = validateRenamePattern(pattern);
    setRenameValidation(validation);

    // Apply renamePattern + enableRename in a single update to avoid stale-closure clobber
    const updatedFormData = {
      ...state.formData,
      renamePattern: pattern,
      enableRename: true,
    };
    updateState({ formData: updatedFormData });

    // Focus the input after clicking example
    if (renameInputRef.current) {
      renameInputRef.current.focus();
    }
  };

  const handleRenameEnableChange = (checked) => {
    handleInputChange("enableRename", checked);
    if (checked) {
      // When enabling, make sure we have a valid pattern
      if (!renamePattern || renamePattern === "") {
        const defaultPattern = defaultValues.renamePattern;
        setRenamePattern(defaultPattern);
        handleInputChange("renamePattern", defaultPattern);
        // Validate the default pattern
        const validation = validateRenamePattern(defaultPattern);
        setRenameValidation(validation);
      } else {
        // Validate current pattern
        const validation = validateRenamePattern(renamePattern);
        setRenameValidation(validation);
      }
      // Focus the input field to draw attention
      setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
        }
      }, 100);
    } else {
      // Clear validation when disabled
      setRenameValidation({ hasError: false, hasWarning: false, message: "" });
    }
  };

  return (
    <form>
      <h2>Output Options</h2>

      {/* Sticky Validation Messages */}
      <div className="sticky top-0 z-10">
        {!hasOutputSelection && (
          <Callout intent="danger" className="mb-2 bg-red-50 border-red-200">
            <strong>Please select at least one output option below</strong>
          </Callout>
        )}
        
        {state.formData.enableRename && renameValidation.message && (
          <Callout 
            intent={renameValidation.hasError ? "danger" : "warning"} 
            className={`mb-2 ${renameValidation.hasError ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}
          >
            <strong>Rename Pattern:</strong> {renameValidation.message}
          </Callout>
        )}
      </div>

      {/* Receive Email Option */}
      <FormGroup
        label="Receive E-mail on Completion?"
        labelFor="email-notification"
        helperText="Receive an email from SLURM when one or more jobs finish (completed or failed)."
      >
        <Switch
          id="email-notification"
          checked={state.formData.receiveEmail ?? defaultValues.receiveEmail}
          onChange={(e) => handleInputChange("receiveEmail", e.target.checked)}
        />
      </FormGroup>

      {/* Import Options */}
      <FormGroup
        label="How would you like to add the workflow results to OMERO?"
        labelFor="import-options"
        subLabel={
          <span>
            Select{" "}
            <strong
              className={hasOutputSelection ? "" : "font-bold text-red-500"}
            >
              one or more
            </strong>{" "}
            options below for how you want the data resulting from this workflow
            imported back into OMERO
          </span>
        }
        intent={hasOutputSelection ? "" : "danger"}
      >
        {/* Zip File Option */}
        <FormGroup
          label={
            <span className="inline-flex items-center gap-2">
              <Tooltip
                content={outputHints.zipCount > 0
                  ? `This workflow declares archive/log output(s) (${outputHints.zipLabel}), so zip export is enabled by default.`
                  : "Archive the output package (e.g., images, CSVs) as a zip file attached to the parent dataset/project."}
                placement="top"
              >
                <span>Add results as a zip file archive.</span>
              </Tooltip>
              {renderDefaultCue(outputHints.importAsZip, outputHints.zipLabel)}
            </span>
          }
          labelFor="upload-zip-options"
          helperText={renderDefaultHelper(
            outputHints.zipCount > 0,
            `Turned on for workflow output(s): ${outputHints.zipLabel}. Switch it off if you do not want those files attached as a zip archive.`,
            "Archive the output package (e.g., images, CSVs) as a zip file attached to the parent dataset/project."
          )}
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="upload-zip-options"
            checked={state.formData.importAsZip ?? outputHints.importAsZip ?? defaultValues.importAsZip}
            onChange={(e) => handleInputChange("importAsZip", e.target.checked)}
            intent={hasOutputSelection ? "" : "danger"}
          />
        </FormGroup>

        {/* OMERO Tables Option */}
        <FormGroup
          label={
            <span className="inline-flex items-center gap-2">
              <Tooltip
                content={outputHints.measurementCount > 0
                  ? `This workflow declares measurement output(s) (${outputHints.measurementLabel}), so CSV table import is enabled by default.`
                  : "Upload the output CSVs as interactive OMERO tables for further analysis."}
                placement="top"
              >
                <span>Add results as OMERO tables.</span>
              </Tooltip>
              {renderDefaultCue(outputHints.uploadCsv, outputHints.measurementLabel)}
            </span>
          }
          labelFor="upload-csv-options"
          helperText={renderDefaultHelper(
            outputHints.measurementCount > 0,
            `Turned on for workflow output(s): ${outputHints.measurementLabel}. Switch it off if you do not want OMERO tables for those results.`,
            "Upload CSV results as interactive OMERO tables for further analysis."
          )}
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="upload-csv-options"
            checked={state.formData.uploadCsv ?? outputHints.uploadCsv ?? defaultValues.uploadCsv}
            onChange={(e) => handleInputChange("uploadCsv", e.target.checked)}
            intent={hasOutputSelection ? "" : "danger"}
          />
        </FormGroup>

        {/* Attachments to Original Images */}
        <FormGroup
          label={
            <span className="inline-flex items-center gap-2">
              <Tooltip
                content={outputHints.imageCount > 0
                  ? `This workflow declares image output(s) (${outputHints.imageLabel}).`
                  : "Attach the output images (e.g., masks) to the original input images to track their provenance."}
                placement="top"
              >
                <span>Add results as attachments to input images.</span>
              </Tooltip>
            </span>
          }
          labelFor="upload-images-options"
          helperText="Attach the output images (e.g., masks) to the original input images to track their provenance."
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="upload-images-options"
            checked={
              state.formData.attachToOriginalImages ??
              defaultValues.attachToOriginalImages
            }
            onChange={(e) =>
              handleInputChange("attachToOriginalImages", e.target.checked)
            }
            intent={hasOutputSelection ? "" : "danger"}
          />
        </FormGroup>

        {/* Dataset Selection with Popover */}
        <DatasetSelectWithPopover
          label={
            <span className="inline-flex items-center gap-2">
              <Tooltip
                content={outputHints.imageCount > 0
                  ? `This workflow declares image output(s) (${outputHints.imageLabel}), which typically belong in a dataset.`
                  : "The output images will be organized in an OMERO dataset for viewing and further analysis."}
                placement="top"
              >
                <span>Add results to a new or existing dataset.</span>
              </Tooltip>
              {renderDefaultCue(outputHints.imageCount > 0, outputHints.imageLabel)}
            </span>
          }
          helperText={renderDefaultHelper(
            outputHints.imageCount > 0,
            `Workflow output(s) ${outputHints.imageLabel} fit well with dataset output organization.`,
            "The output images will be organized in an OMERO dataset for viewing and further analysis."
          )}
          subLabel="Don't forget to press ENTER if you type a new name!"
          tooltip="Select the OMERO dataset for your workflow results."
          buttonText="Select Dataset"
          value={(state.formData.selectedDatasets || []).map((name) => {
            const id = state.formData.selectedDatasetId;
            return id ? `${name} (ID: ${id})` : name;
          })}
          onChange={(values, type) => {
            if (type === "manual") {
              // Strip any "(ID: X)" suffix, take the last value
              const rawName = values.length
                ? values[values.length - 1].replace(/\s*\(ID:\s*\d+\)$/, '').trim()
                : '';
              // Look up this name in the tree — auto-attach ID if it exists
              const matchedDataset = rawName
                ? Object.values(state.omeroFileTreeData || {}).find(
                    (n) => n.category === "datasets" && n.data === rawName
                  )
                : null;
              handleFormDataUpdate({
                selectedDatasets: rawName ? [rawName] : [],
                selectedDatasetId: matchedDataset ? matchedDataset.id : null,
              });
            } else {
              // Selected from tree — extract name and ID
              const datasetNode = state.omeroFileTreeData[values[0]];
              if (datasetNode) {
                handleFormDataUpdate({
                  selectedDatasets: [datasetNode.data],
                  selectedDatasetId: datasetNode.id,
                });
              }
            }
          }}
          multiSelect={false}
          intent={hasOutputSelection ? "" : "danger"}
          allowedCategories={["datasets"]}
          tagProps={(val) => {
            // Orange warning when the tag value doesn't contain "(ID: X)" — means it's a new dataset
            const isKnown = /\(ID:\s*\d+\)/.test(String(val));
            if (isKnown) return {};
            return {
              intent: "warning",
              title: "No matching dataset found — a new dataset will be created with this name.",
            };
          }}
        />

        {/* Optional Image File Renamer */}
        <FormGroup
          label="Rename result images?"
          labelFor="image-renaming-switch"
          helperText="Enable custom naming patterns for imported result images."
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="image-renaming-switch"
            checked={state.formData.enableRename ?? defaultValues.enableRename}
            onChange={(e) => handleRenameEnableChange(e.target.checked)}
            intent={hasOutputSelection ? "" : "danger"}
            disabled={
              !state.formData.selectedDatasets ||
              state.formData.selectedDatasets.length === 0
            }
          />
        </FormGroup>

        {/* Rename Pattern Input */}
        <FormGroup
          label="Rename pattern"
          labelFor="image-renaming-pattern"
          helperText={
            <>
              <div>
                <strong>Original input variables:</strong> <code>{"{original_file}"}</code> (filename without extension), <code>{"{original_ext}"}</code> (full extension)
              </div>
              <div>
                <strong>Result file variables:</strong> <code>{"{file}"}</code> (workflow result filename without extension), <code>{"{ext}"}</code> (full extension from result file)
              </div>
              <div className="mt-2">
                <strong>Examples:</strong>
              </div>
              <ul className="list-disc list-inside mt-1 text-xs ml-4">
                <li>
                  <code 
                    className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                    onClick={() => handleExampleClick("{original_file}_mask.{ext}")}
                    title="Click to use this pattern"
                  >
                    {"{original_file}_mask.{ext}"}
                  </code> → Use original name + result extension
                </li>
                <li>
                  <code 
                    className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                    onClick={() => handleExampleClick("{file}_processed.{original_ext}")}
                    title="Click to use this pattern"
                  >
                    {"{file}_processed.{original_ext}"}
                  </code> → Use result name + original extension
                </li>
                <li>
                  <code 
                    className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                    onClick={() => handleExampleClick("analysis_{original_file}.tif")}
                    title="Click to use this pattern"
                  >
                    {"analysis_{original_file}.tif"}
                  </code> → Custom prefix + original name + specific extension
                </li>
              </ul>
            </>
          }
          disabled={
            !state.formData.selectedDatasets ||
            state.formData.selectedDatasets.length === 0
          }
        >
          <InputGroup
            id="image-renaming-pattern"
            inputRef={renameInputRef}
            value={renamePattern}
            onChange={handleRenamePatternChange}
            fill={true}
            disabled={
              !state.formData.selectedDatasets ||
              state.formData.selectedDatasets.length === 0
            }
            intent={renameValidation.hasError ? "danger" : (renameValidation.hasWarning ? "warning" : "none")}
          />
          {/* Validation now appears in sticky header above */}
        </FormGroup>
      </FormGroup>
    </form>
  );
};

export default WorkflowOutput;
