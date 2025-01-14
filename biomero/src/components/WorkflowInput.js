import React, { useState, useEffect } from "react";
import {DialogBody, H6, MenuItem, InputGroup, FormGroup, Switch, Button, Popover, PopoverInteractionKind, Tooltip, TagInput } from "@blueprintjs/core";
import OmeroDataBrowser from "../OmeroDataBrowser";
import { Select, MultiSelect } from "@blueprintjs/select";
import { useAppContext } from "../AppContext"; // Assuming AppContext exists
import DatasetSelectWithPopover from "./DatasetSelectWithPopover";

const WorkflowInput = () => {
  const { state, updateState, loadThumbnails, loadImagesForDataset } = useAppContext();
  const [omeroIDs, setOmeroIDs] = useState([]);
  const [dataTypes, setDataTypes] = useState(["Dataset", "Screen", "Image"]);

  useEffect(() => {
    if (state.omeroTreeData) {
      const datasets = Object.values(state.omeroTreeData)
        .filter(item => item.category === "datasets")
        .map(item => ({ label: `${item.data} (ID: ${item.id})`, value: item }));

      const screens = Object.values(state.omeroTreeData)
        .filter(item => item.category === "screens")
        .map(item => ({ label: `${item.data} (ID: ${item.id})`, value: item }));

      // Combine datasets and screens
      setOmeroIDs([...datasets, ...screens]);
    }
  }, [state.omeroTreeData]); // Runs whenever omeroTreeData changes

  // New useEffect to watch inputDataset and call loadImagesForDataset
  useEffect(() => {
    if (state.inputDatasets) {
      // Call loadImagesForDataset only if inputDataset exists
      // TODO: only works for 1 dataset now... since we store it in state.images..
      state.inputDatasets?.forEach(ds => loadImagesForDataset(ds.id));
    }
  }, [state.inputDatasets]);

  useEffect(()=> {
    // Trigger loading images for the selected dataset
    if (state.inputDatasets && state.images) {
        const imageIds = state.images?.map(image => image.id) || [];
        loadThumbnails(imageIds); // Load images for the selected dataset
      }
  }, [state.images]);

  const handleImageSelect = (imageId) => {
    updateState({
      selectedImageId: imageId
    });
  };

  const handleDatasetChange = (datasets) => {
    updateState({
        inputDatasets: datasets, 
    });
  };

  return (
    <DialogBody className="flex flex-col md:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <H6>Select the input data to proceed</H6>

        {/* Dataset Selection with Popover */}
        <DatasetSelectWithPopover
          value={state.inputDatasets || []}
          label="Select dataset or screen"
          helperText=""
          subLabel=""
          onChange={(values) => handleDatasetChange(values)}
          multiSelect={true}
        />

        {/* Image List */}
        {state.images && state.images.length > 0 ? (
          <div className="border rounded-md p-2 overflow-auto max-h-80">
            {state.images.map((image) => (
              <div
                key={image.id}
                className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                onMouseEnter={() => updateState({hoveredImage: image })}
                onClick={() => handleImageSelect(image.id)}
              >
                <div className="text-sm">{image.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No images available for the selected dataset.</p>
        )}
      </div>

      {/* Thumbnail Preview Panel */}
      <div className="w-64 min-w-64 border-l px-4">
        {state.hoveredImage && state.thumbnails?.[state.hoveredImage.id] ? (
            <div className="text-center">
            <img
                src={state.thumbnails[state.hoveredImage.id]}
                alt={state.hoveredImage.name || "Thumbnail preview"}
                className="w-full h-auto rounded-md"
            />
            <p className="mt-2 text-sm font-medium">{state.hoveredImage.name}</p>
            </div>
        ) : (
            <p className="text-gray-500 text-center">Hover over an image to preview.</p>
        )}
        </div>

    </DialogBody>
  );
};

export default WorkflowInput;
