import React, { useState, useEffect } from "react";
import { FormGroup, Switch, Callout, DialogBody } from "@blueprintjs/core";
import { useAppContext } from "../../../AppContext";
import DatasetSelectWithPopover from "../DatasetSelectWithPopover.js";

const PlateWorkflowOutput = ({ onSelectionChange }) => {
  const { state, updateState } = useAppContext();
  const [hasOutputSelection, setHasOutputSelection] = useState(true);
  
  const outputOptions = [
    "importAsZip",
    "uploadCsv", 
    "selectedScreens", // Changed from selectedDatasets to selectedScreens for plates
  ];
  const defaultValues = {
    receiveEmail: true,
    importAsZip: false,
    uploadCsv: false,
    selectedScreens: [], // Changed from selectedDatasets
  };

  useEffect(() => {
    // Merge default values into formData, ensuring missing values are populated
    updateState({ formData: { ...defaultValues, ...state.formData } });
  }, [state.formData]);

  useEffect(() => {
    // Tell the parent about output selection
    onSelectionChange(hasOutputSelection);
  }, [hasOutputSelection]);

  // Check output selection state whenever formData changes
  useEffect(() => {
    const hasSelection = outputOptions.some((opt) =>
      Array.isArray(state.formData[opt])
        ? state.formData[opt].length > 0
        : !!state.formData[opt]
    );
    setHasOutputSelection(hasSelection);
  }, [state.formData]);

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

  return (
    <DialogBody>
      <form>
        <h2>Output Options</h2>

        {/* Sticky Validation Messages */}
        <div className="sticky top-0 z-10">
          {!hasOutputSelection && (
            <Callout intent="danger" className="mb-2 bg-red-50 border-red-200">
              <strong>Please select at least one output option below</strong>
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
            helperText="Archive the output package (e.g., images, CSVs) as a zip file attached to the parent screen/project."
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

          {/* Screen Selection with Popover */}
          <DatasetSelectWithPopover
            label="Add results to a new or existing screen."
            helperText="The output results will be organized in an OMERO screen for viewing and further analysis."
            subLabel="Don't forget to press ENTER if you type a new name!"
            tooltip="Select the OMERO screen for your workflow results."
            buttonText="Select Screen"
            placeholder="Add new screen name or select..."
            value={state.formData.selectedScreens || []}
            onChange={(values, type) => {
              if (type === "manual") {
                handleInputChange(
                  "selectedScreens",
                  values?.length ? [values[values.length - 1]] : []
                );
              } else {
                const selectedScreen = values.map(
                  (screen) => state.omeroFileTreeData[screen].data
                );
                handleInputChange("selectedScreens", selectedScreen);
              }
            }}
            multiSelect={false}
            intent={hasOutputSelection ? "" : "danger"}
            allowedCategories={["screens"]}
          />
        </FormGroup>
      </form>
    </DialogBody>
  );
};

export default PlateWorkflowOutput;