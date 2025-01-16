import React, { useState, useEffect } from "react";
import {
  DialogBody, H6, InputGroup, Button, ButtonGroup, Icon, FormGroup, Tooltip, Card, Tabs, Tab, Switch,
} from "@blueprintjs/core";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover";
import { useAppContext } from "../AppContext";

const WorkflowInput = () => {
  const { state, updateState, loadThumbnails, loadImagesForDataset } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredImages, setFilteredImages] = useState([]);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [activeTab, setActiveTab] = useState("grid"); // Tabs: "list" or "grid"

  // Load images when datasets change
  useEffect(() => {
    const currentDatasetIds = state.inputDatasets?.map((ds) => ds.index) || [];
  
    // Remove images of datasets not in inputDatasets
    const filteredImages = Object.entries(state.omeroTreeData)
      .filter(([key]) => currentDatasetIds.includes(key)) // Keep only datasets still in inputDatasets
      .flatMap(([_, datasetNode]) => datasetNode.children || []); // Flatten all images from valid datasets
  
    updateState({ images: filteredImages });
  
    // Load images for datasets missing children in omeroTreeData
    state.inputDatasets?.forEach((dataset) => {
      const treeNode = state.omeroTreeData[dataset.index];
  
      if (!treeNode || !treeNode.children || treeNode.children.length === 0) {
        loadImagesForDataset(dataset); // Fetch only if not already loaded
      }
    });
  }, [state.inputDatasets]);  

  // Load thumbnails and initialize image selections
  useEffect(() => {
    if (state.images) {
      const imageIds = state.images.map((image) => image.id);
      loadThumbnails(imageIds);
      setSelectedImageIds(imageIds); // Default: all selected
      setFilteredImages(state.images); // Initialize filtered images
    }
  }, [state.images]);

  // Update the filtered list dynamically as the search query changes
  useEffect(() => {
    if (searchQuery && state.images) {
      const lowerQuery = searchQuery.toLowerCase();
      setFilteredImages(
        state.images.filter((image) =>
          image.name.toLowerCase().includes(lowerQuery)
        )
      );
    } else {
      setFilteredImages(state.images || []); // Fallback to an empty array
    }
  }, [searchQuery, state.images]);

  const handleToggleImage = (id) => {
    setSelectedImageIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((imageId) => imageId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleUncheckAll = () => setSelectedImageIds([]);

  const handleCheckAllFiltered = () => {
    const allIds = filteredImages.map((image) => image.id);
    setSelectedImageIds((prev) => [...new Set([...prev, ...allIds])]);
  };

  const handleCheckAll = () => {
    const allIds = state.images.map((image) => image.id);
    setSelectedImageIds(allIds);
  };

  const handleUncheckAllFiltered = () => {
    const updatedSet = selectedImageIds.filter(
      (id) => !filteredImages.some((image) => image.id === id)
    );
    setSelectedImageIds(updatedSet);
  };

  // Save selected IDs when proceeding to the next step
  useEffect(() => {
    updateState({
      formData: {
        ...state.formData,
        selectedImageIds: selectedImageIds,
      },
    });
  }, [selectedImageIds]);

  return (
    <DialogBody className="flex flex-col gap-4">
      <div className="w-full">
        <H6 className="mb-2">Select Input Data</H6>
        <DatasetSelectWithPopover
          value={state.inputDatasets.map((dataset) => dataset?.data) || []}
          label="Select dataset or screen"
          tooltip="Select the OMERO dataset or screen as workflow input."
          onChange={(datasets) => {
            const inputDatasets = datasets.map((dataset) => {
              // Handle both `index` (dataset key) and `data` (dataset value)
              const resolvedDataset =
                state.omeroTreeData[dataset] || // Case 1: dataset is already the key/index
                Object.values(state.omeroTreeData).find((node) => node.data === dataset); // Case 2: dataset is the data value
              return resolvedDataset;
            }).filter(Boolean); // Filter out any unresolved datasets
            updateState({ inputDatasets });
          }}
          multiSelect={true}
        />
        {state.inputDatasets?.length > 0 && (
          <>
            <FormGroup label="Filter filenames" className="mb-4">
              <InputGroup
                leftElement={<Icon icon="filter" />}
                rightElement={
                  searchQuery && (
                    <Button
                      minimal
                      icon="cross"
                      onClick={() => setSearchQuery("")}
                    />
                  )
                }
                placeholder="Type to filter images..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </FormGroup>
            <ButtonGroup minimal={true} className="mb-2" fill={true}>
              <Tooltip intent="primary" content="Select all images">
                <Button intent="primary" icon="selection" onClick={handleCheckAll} text="Select ALL"/>
              </Tooltip>
              <Tooltip intent="danger" content="Deselect all images">
                <Button icon="circle" intent="danger" onClick={handleUncheckAll} text="Deselect ALL"/>
              </Tooltip>
              <Tooltip intent="warning" content="Select all filtered images">
                <Button intent="warning" icon="selection" onClick={handleCheckAllFiltered} rightIcon="filter" text="Select all filtered"/>
              </Tooltip>
              <Tooltip intent="warning" content="Deselect all filtered images">
                <Button
                  icon="circle"
                  intent="warning"
                  onClick={handleUncheckAllFiltered}
                  text="Deselect all filtered"
                  rightIcon="filter"
                />
              </Tooltip>
              
            </ButtonGroup>
          </>
        )}
      </div>
      {state.inputDatasets?.length > 0 && (
        <Tabs
          id="workflow-input-tabs"
          selectedTabId={activeTab}
          onChange={(newTab) => setActiveTab(newTab)}
        >
          <Tab
            id="grid"
            title="Thumbnail Grid"
            panel={
              <div className="grid grid-cols-4 gap-2">
                {filteredImages.length > 0 ? (
                  filteredImages.map((image) => (
                    <Tooltip key={image.id} content={image.name}>
                      <Card
                        interactive={true}
                        elevation={selectedImageIds.includes(image.id) ? 3 : 1}
                        className="p-1 flex flex-col items-center justify-between"
                        onClick={() => handleToggleImage(image.id)}
                        selected={selectedImageIds.includes(image.id)}
                      >
                        {state.thumbnails?.[image.id] ? (
                          <img
                            src={state.thumbnails[image.id]}
                            alt={image.name || "Thumbnail"}
                            className="w-full h-24 object-cover"
                          />
                        ) : (
                          <div className={`bg-gray-300 rounded-md w-full h-[${image.id}] flex items-center justify-center`}>
                            <span className="text-gray-500 text-xs">No preview</span>
                          </div>
                        )}
                      </Card>
                    </Tooltip>
                  ))
                ) : (
                  <p className="text-gray-500 text-xs col-span-4">
                    No images match your search.
                  </p>
                )}
              </div>
            }
          />
          <Tab
            id="list"
            title="Image List"
            panel={
              <div className="flex flex-col gap-2 overflow-auto">
                {filteredImages.length > 0 ? (
                  filteredImages.map((image) => (
                    <div
                      key={image.id}
                      className="flex items-center justify-between gap-4"
                    >
                      {/* Switch for selection */}
                      <Switch
                        checked={selectedImageIds.includes(image.id)}
                        onChange={() => handleToggleImage(image.id)}
                      >
                        {image.name}
                      </Switch>

                      {/* Small Thumbnail */}
                      {state.thumbnails?.[image.id] ? (
                        <img
                          src={state.thumbnails[image.id]}
                          alt={image.name || "Thumbnail"}
                          className="w-6 h-6 object-cover rounded-sm shadow-sm"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-gray-200 flex items-center justify-center text-xs text-gray-500 rounded-sm">
                          N/A
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-xs">No images match your search.</p>
                )}
              </div>
            }
          />

        </Tabs>
      )}
    </DialogBody>
  );
};

export default WorkflowInput;
