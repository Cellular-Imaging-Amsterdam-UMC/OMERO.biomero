import React, { useState, useEffect } from "react";
import { InputGroup, FormGroup, Switch, Button, Popover, PopoverInteractionKind, Tooltip, TagInput } from "@blueprintjs/core";
import OmeroDataBrowser from "../OmeroDataBrowser";
import { useAppContext } from "../AppContext";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover.js";

const WorkflowOutput = () => {
  const { state, updateState } = useAppContext();  // Directly use the context's state and updateState
  const [renamePattern, setRenamePattern] = useState(''); // State for the rename pattern

  // Default values for the form fields
  const defaultValues = {
    receiveEmail: true,
    importAsZip: true,
    uploadCsv: true,
    attachToOriginalImages: false,
    selectedDatasets: [],
    renamePattern: '', // Default empty renaming pattern
  };

  useEffect(() => {
    // Merge default values into formData, ensuring missing values are populated
    updateState({ formData: { ...defaultValues, ...state.formData } });
  }, [state.formData]);
  
  const handleInputChange = (key, value) => {
    updateState({
      formData: {
        ...state.formData,
        [key]: value,
      }
    });
  };

  // Handle renaming pattern change
  const handleRenamePatternChange = (e) => {
    setRenamePattern(e.target.value);
    handleInputChange("renamePattern", e.target.value); // Store the rename pattern
  };

  return (
    <form>
      <h2>Output Options</h2>

      {/* Receive Email Option */}
      <FormGroup
        label="Receive E-mail on Completion?"
        labelFor="email-notification"
        helperText="Receive an email notification when the workflow finishes."
      >
        <Switch
          id="email-notification"
          checked={state.formData.receiveEmail ?? defaultValues.receiveEmail} // Default to true if not set
          onChange={(e) => handleInputChange("receiveEmail", e.target.checked)}
        />
      </FormGroup>

      {/* Import Options */}
      <FormGroup
        label="How would you like to add the workflow results to OMERO?"
        labelFor="import-options"
        subLabel="Select (one or more) options below for how you want the data resulting from this workflow imported back into OMERO"
      >
        {/* Zip File Option */}
        <FormGroup
          label="Add results as a zip file archive."
          labelFor="upload-zip-options"
          helperText="Archive the output package (e.g., images, CSVs) as a zip file attached to the parent dataset/project."
        >
          <Switch
            id="upload-zip-options"
            checked={state.formData.importAsZip ?? defaultValues.importAsZip} // Default to true if not set
            onChange={(e) => handleInputChange("importAsZip", e.target.checked)}
          />
        </FormGroup>

        {/* OMERO Tables Option */}
        <FormGroup
          label="Add results as OMERO tables."
          labelFor="upload-csv-options"
          helperText="Upload the output CSVs as interactive OMERO tables for further analysis."
        >
          <Switch
            id="upload-csv-options"
            checked={state.formData.uploadCsv ?? defaultValues.uploadCsv} // Default to true if not set
            onChange={(e) => handleInputChange("uploadCsv", e.target.checked)}
          />
        </FormGroup>

        {/* Attachments to Original Images */}
        <FormGroup
          label="Add results as attachments to input images."
          labelFor="upload-images-options"
          helperText="Attach the output images (e.g., masks) to the original input images to track their provenance."
        >
          <Switch
            id="upload-images-options"
            checked={state.formData.attachToOriginalImages ?? defaultValues.attachToOriginalImages} // Default to false if not set
            onChange={(e) => handleInputChange("attachToOriginalImages", e.target.checked)}
          />
        </FormGroup>

        {/* Dataset Selection with Popover */}
        <DatasetSelectWithPopover
          value={state.formData.selectedDatasets || []}
          onChange={(values) => handleInputChange("selectedDatasets", values)}
          multiSelect={false}
        />

        {/* Optional Image File Renamer */}
        <FormGroup
          label="Rename result images?"
          labelFor="image-renaming-pattern"
          helperText={
            <>
              <div>
                Use <code>{'{original_file}'}</code> and <code>{'{ext}'}</code> to create a naming pattern for the new images.
              </div>
              <div>
                For example, if the original image is <code>sample1.tiff</code>, you can name the result image <code>sample1_nuclei_mask.tiff</code> by using the pattern <code>{'{original_file}_nuclei_mask.{ext}'}</code>.
              </div>
            </>
          }
          disabled={!state.formData.selectedDatasets || state.formData.selectedDatasets.length === 0}
        >
          <InputGroup
            id="image-renaming-pattern"
            placeholder="e.g., {original_file}_nuclei_mask.{ext}"
            value={renamePattern}
            onChange={handleRenamePatternChange}
            fill={true}
            disabled={!state.formData.selectedDatasets || state.formData.selectedDatasets.length === 0}
          />
        </FormGroup>
      </FormGroup>
    </form>
  );
};

export default WorkflowOutput;
