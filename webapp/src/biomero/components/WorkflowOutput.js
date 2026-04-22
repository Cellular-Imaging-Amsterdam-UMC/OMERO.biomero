import React, { useState, useEffect, useRef } from "react";
import { InputGroup, FormGroup, Switch, Callout } from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover.js";

const WorkflowOutput = ({ onSelectionChange }) => {
  const { state, updateState } = useAppContext();
  const [renamePattern, setRenamePattern] = useState("{original_file}_result.{ext}");
  const [hasOutputSelection, setHasOutputSelection] = useState(true);
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
    renamePattern: "{original_file}_result.{ext}",
    enableRename: false,
  };

  useEffect(() => {
    // Merge default values into formData, ensuring missing values are populated
    updateState({ formData: { ...defaultValues, ...state.formData } });
  }, [state.formData]);

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

    // If any plate present (alone or mixed), don't auto-populate (and clear existing auto defaults)
    if (hasPlate || !allDatasets) {
      if (state.formData.selectedDatasets?.length) {
        handleInputChange("selectedDatasets", []); // clear; requirement: empty when plates involved
      }
      return;
    }

    // Only auto-populate when all inputs are datasets and nothing chosen yet
    if (
      allDatasets &&
      (!state.formData.selectedDatasets ||
        state.formData.selectedDatasets.length === 0)
    ) {
      const inputDatasetNames = inputs.map((dataset) => dataset.data);
      handleInputChange("selectedDatasets", inputDatasetNames);
    }
  }, [state.inputDatasets]);
  
  // Check output selection state whenever formData changes
  useEffect(() => {
    const hasSelection = outputOptions.some((opt) =>
      Array.isArray(state.formData[opt])
        ? state.formData[opt].length > 0
        : !!state.formData[opt]
    );
    setHasOutputSelection(hasSelection);
  }, [state.formData]);

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

    if (outputOptions.includes(key)) {
      // Check if at least one of the output options is still selected
      const hasSelection = outputOptions.some((opt) =>
        Array.isArray(updatedFormData[opt])
          ? updatedFormData[opt].length > 0
          : !!updatedFormData[opt]
      );
      setHasOutputSelection(hasSelection);
    }
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

    // Recompute output selection with the merged data
    const hasSelection = outputOptions.some((opt) =>
      Array.isArray(updatedFormData[opt])
        ? updatedFormData[opt].length > 0
        : !!updatedFormData[opt]
    );
    setHasOutputSelection(hasSelection);

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
          label="Add results as a zip file archive."
          labelFor="upload-zip-options"
          helperText="Archive the output package (e.g., images, CSVs) as a zip file attached to the parent dataset/project."
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="upload-zip-options"
            checked={state.formData.importAsZip ?? defaultValues.importAsZip}
            onChange={(e) => handleInputChange("importAsZip", e.target.checked)}
            intent={hasOutputSelection ? "" : "danger"}
          />
        </FormGroup>

        {/* OMERO Tables Option */}
        <FormGroup
          label="Add results as OMERO tables."
          labelFor="upload-csv-options"
          helperText="Upload the output CSVs as interactive OMERO tables for further analysis."
          intent={hasOutputSelection ? "" : "danger"}
        >
          <Switch
            id="upload-csv-options"
            checked={state.formData.uploadCsv ?? defaultValues.uploadCsv}
            onChange={(e) => handleInputChange("uploadCsv", e.target.checked)}
            intent={hasOutputSelection ? "" : "danger"}
          />
        </FormGroup>

        {/* Attachments to Original Images */}
        <FormGroup
          label="Add results as attachments to input images."
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
          label="Add results to a new or existing dataset."
          helperText="The output images will be organized in an OMERO dataset for viewing and further analysis."
          subLabel="Don't forget to press ENTER if you type a new name!"
          tooltip="Select the OMERO dataset for your workflow results."
          buttonText="Select Dataset"
          value={state.formData.selectedDatasets || []}
          onChange={(values, type) => {
            if (type === "manual") {
              handleInputChange(
                "selectedDatasets",
                values?.length ? [values[values.length - 1]] : []
              );
            } else {
              const selectedDataset = values.map(
                (dataset) => state.omeroFileTreeData[dataset].data
              );
              handleInputChange("selectedDatasets", selectedDataset);
            }
          }}
          multiSelect={false}
          intent={hasOutputSelection ? "" : "danger"}
          allowedCategories={["datasets"]}
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
