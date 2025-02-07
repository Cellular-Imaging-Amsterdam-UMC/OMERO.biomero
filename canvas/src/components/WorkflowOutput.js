import React, { useState, useEffect } from "react";
import { InputGroup, FormGroup, Switch } from "@blueprintjs/core";
import { useAppContext } from "../AppContext";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover.js";

const WorkflowOutput = () => {
  const { state, updateState } = useAppContext();
  const [renamePattern, setRenamePattern] = useState("");
  const defaultValues = {
    receiveEmail: true,
    importAsZip: true,
    uploadCsv: true,
    attachToOriginalImages: false,
    selectedDatasets: [],
    renamePattern: "",
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
      },
    });
  };

  const handleRenamePatternChange = (e) => {
    setRenamePattern(e.target.value);
    handleInputChange("renamePattern", e.target.value);
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
          checked={state.formData.receiveEmail ?? defaultValues.receiveEmail}
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
            checked={state.formData.importAsZip ?? defaultValues.importAsZip}
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
            checked={state.formData.uploadCsv ?? defaultValues.uploadCsv}
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
            checked={
              state.formData.attachToOriginalImages ??
              defaultValues.attachToOriginalImages
            }
            onChange={(e) =>
              handleInputChange("attachToOriginalImages", e.target.checked)
            }
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
          onChange={(values) => {
            const selectedDataset = values.map(
              (dataset) => state.omeroFileTreeData[dataset].data
            );
            handleInputChange("selectedDatasets", selectedDataset);
          }}
          multiSelect={false}
        />

        {/* Optional Image File Renamer */}
        <FormGroup
          label="Rename result images?"
          labelFor="image-renaming-pattern"
          helperText={
            <>
              <div>
                Use <code>{"{original_file}"}</code> and <code>{"{ext}"}</code>{" "}
                to create a naming pattern for the new images.
              </div>
              <div>
                For example, if the original image is <code>sample1.tiff</code>,
                you can name the result image{" "}
                <code>sample1_nuclei_mask.tiff</code> by using the pattern{" "}
                <code>{"{original_file}_nuclei_mask.{ext}"}</code>.
              </div>
            </>
          }
          disabled={
            !state.formData.selectedDatasets ||
            state.formData.selectedDatasets.length === 0
          }
        >
          <InputGroup
            id="image-renaming-pattern"
            placeholder="e.g., {original_file}_nuclei_mask.{ext}"
            value={renamePattern}
            onChange={handleRenamePatternChange}
            fill={true}
            disabled={
              !state.formData.selectedDatasets ||
              state.formData.selectedDatasets.length === 0
            }
          />
        </FormGroup>
      </FormGroup>
    </form>
  );
};

export default WorkflowOutput;
