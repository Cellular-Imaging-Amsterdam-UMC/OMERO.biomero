import React, { useState, useEffect } from "react";
import {
  DialogBody, H6, InputGroup, Button, ButtonGroup, Icon, FormGroup, Tooltip, Card, Tabs, Tab, Switch, Slider,
  TabPanel
} from "@blueprintjs/core";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover";
import { useAppContext } from "../AppContext";

const WorkflowInput = () => {
  const { state, updateState, loadThumbnails, loadImagesForDataset } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredImages, setFilteredImages] = useState([]);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [activeTab, setActiveTab] = useState("list"); // Tabs: "list" or "grid"
  const [zoom, setZoom] = useState(7); // Starting size 65px, like OMERO

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
        state.images
          .map((image) => ({
            ...image,
            isDisabled: !image.name.toLowerCase().includes(lowerQuery),
          }))
          .sort((a, b) => Number(a.isDisabled) - Number(b.isDisabled)) // Sort disabled images to the bottom
      );      
    } else {
      setFilteredImages(state.images || []); // Show all images when no query
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
    // Select all filtered images that are not disabled (isDisabled === false)
    const allEnabledIds = filteredImages
      .filter((image) => !image.isDisabled)  // Filter out disabled images
      .map((image) => image.id);            // Map to image IDs
    
    // Add the filtered image IDs to the selected list
    setSelectedImageIds((prev) => [...new Set([...prev, ...allEnabledIds])]);
  };
  
  const handleCheckAll = () => {
    const allIds = state.images.map((image) => image.id);
    setSelectedImageIds(allIds);
  };
  
  const handleUncheckAllFiltered = () => {
    // Uncheck only the filtered images that are not disabled (isDisabled === false)
    const updatedSet = selectedImageIds.filter(
      (id) => !filteredImages.some((image) => image.id === id && !image.isDisabled) // Only uncheck non-disabled filtered images
    );
    setSelectedImageIds(updatedSet);
  };

  // Save selected IDs when proceeding to the next step
  useEffect(() => {
    updateState({
      formData: {
        ...state.formData,
        IDs: selectedImageIds,
      },
    });
  }, [selectedImageIds]);

  return (
    <DialogBody className="flex flex-col min-h-[75vh]">
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
          {/* Filter bar and buttons */}
          <div className="pb-2">
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
            <ButtonGroup className="mb-2 w-full" fill={true}>
              <Tooltip
                intent={selectedImageIds.length === state.images?.length ? "none" : (searchQuery ? "warning" : "primary")}
                content={
                  selectedImageIds.length === state.images?.length
                    ? "Already selected all images"
                    : searchQuery
                    ? "Select all images, also those not in your current filter!"
                    : "Select all images"
                }
              >
                <Button
                  icon="selection"
                  intent={selectedImageIds.length === state.images?.length ? "none" : (searchQuery ? "warning" : "primary")}
                  text="Select ALL"
                  onClick={handleCheckAll}
                  disabled={selectedImageIds.length === state.images?.length}
                  className="flex-grow"
                  outlined={true}
                />
              </Tooltip>
              <Tooltip
                intent={selectedImageIds.length === 0 ? "none" : "danger"}
                content={
                  selectedImageIds.length === 0
                    ? "No images are selected to deselect"
                    : searchQuery
                    ? "Deselect all images, also those not in your current filter!"
                    : "Deselect all images"
                }
              >
                <Button
                  outlined={true}
                  icon="circle"
                  intent={selectedImageIds.length === 0 ? "none" : "danger"}
                  text="Deselect ALL"
                  onClick={handleUncheckAll}
                  disabled={selectedImageIds.length === 0}
                  className="flex-grow"
                />
              </Tooltip>
              <Tooltip
                intent={searchQuery ? "primary" : "none"}
                content={
                  !searchQuery
                    ? "Add a filter first"
                    : filteredImages.every((image) => selectedImageIds.includes(image.id))
                    ? "All filtered images are already selected"
                    : "Select all filtered images"
                }
              >
                <Button
                  icon="selection"
                  outlined={true}
                  text="Select Filtered"
                  onClick={handleCheckAllFiltered}
                  intent={searchQuery ? "primary" : "none"}
                  disabled={
                    !searchQuery ||
                    filteredImages.every((image) => selectedImageIds.includes(image.id))
                  }
                  className="flex-grow"
                />
              </Tooltip>
              <Tooltip
                intent={searchQuery ? "primary" : "none"}
                content={
                  !searchQuery
                    ? "Add a filter first"
                    : filteredImages.every((image) => !selectedImageIds.includes(image.id))
                    ? "No filtered images are selected to deselect"
                    : "Deselect all filtered images"
                }
              >
                <Button
                  icon="circle"
                  outlined={true}
                  text="Deselect Filtered"
                  onClick={handleUncheckAllFiltered}
                  intent={searchQuery ? "primary" : "none"}
                  disabled={
                    !searchQuery ||
                    filteredImages.every((image) => !selectedImageIds.includes(image.id))
                  }
                  className="flex-grow"
                />
              </Tooltip>
            </ButtonGroup>
          </div>
          </>
        )}
      </div>
      {state.inputDatasets?.length > 0 && (
        <div className="p-1 h-full overflow-hidden">
        <Tabs
          id="workflow-input-tabs"
          selectedTabId={activeTab}
          onChange={(newTab) => setActiveTab(newTab)}
          renderActiveTabPanelOnly={true}
        >
          <Tab
            id="list"
            title="Image List"
            tagContent={selectedImageIds.length}
            tagProps={{ round: true }}
          />
          <Tab
            id="grid"
            tagContent={selectedImageIds.length}
            tagProps={{ round: true }}
            title="Thumbnail Grid"
          />
        </Tabs>
        <TabPanel
        id="list"
        selectedTabId={activeTab}
        parentId="workflow-input-tabs"
        className="overflow-auto"
        panel={
          <div className="flex flex-col gap-2 overflow-y-auto pt-1 pl-1 min-h-[calc(100vh-80vh)] max-h-[45vh]">
            {filteredImages.length > 0 ? (
              filteredImages.map((image) => (
                <div
                  key={image.id}
                  className={`flex items-center justify-between gap-4 ${image.isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* Switch for selection */}
                  <Switch
                    checked={selectedImageIds.includes(image.id)}
                    onChange={() => handleToggleImage(image.id)}
                    disabled={image.isDisabled} // Disable the switch for non-matching images
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
        }/>
        <TabPanel
        id="grid"
        selectedTabId={activeTab}
        parentId="workflow-input-tabs"
        className="overflow-auto min-h-[calc(100vh-80vh)] max-h-[45vh]"
        panel={
          <div className="flex flex-row">
             <div className="basis-1/5">
              <FormGroup 
              label="Columns"
              inline={false}
              className="px-4"
              >
                <Slider
                  min={1}
                  max={12}
                  value={zoom}
                  onChange={setZoom}
                  showTrackFill={false}
                  labelStepSize={11}
                  vertical={false}
                />
              </FormGroup>
              </div>
            <div 
              className={`basis-4/5 grid grid-cols-${zoom} gap-2 overflow-y-auto p-1`}
              > {/* Dynamic grid-cols */}
              {filteredImages.length > 0 ? (
                filteredImages.map((image) => (
                  <Tooltip key={image.id} content={image.name} targetProps={{
                    className: image.isDisabled ? 'cursor-not-allowed' : '',
                  }}>
                    <Card
                      interactive={true} // Disable the switch for non-matching images
                      elevation={image.isDisabled ? 1 : 3} // Set lowest elevation for disabled images and highest for non-disabled
                      className={`p-1 flex flex-col items-center justify-between ${image.isDisabled ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''}`} // Add blue border if selected
                      // className="p-1 flex flex-col items-center justify-between"
                      onClick={() => !image.isDisabled && handleToggleImage(image.id)} // Disable onClick for disabled images
                      selected={selectedImageIds.includes(image.id)}
                    >
                      {state.thumbnails?.[image.id] ? (
                        <img
                          src={state.thumbnails[image.id]}
                          alt={image.name || "Thumbnail"}
                          className="object-cover w-full"
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
          </div>
        }/>
        </div>
      )}
    </DialogBody>
  );
};

export default WorkflowInput;
