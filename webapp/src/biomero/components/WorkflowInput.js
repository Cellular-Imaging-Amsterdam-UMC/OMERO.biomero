import React, { useState, useEffect } from "react";
import {
  DialogBody,
  H6,
  InputGroup,
  Button,
  ButtonGroup,
  Icon,
  FormGroup,
  Tooltip,
  Card,
  Tabs,
  Tab,
  Switch,
  Slider,
  TabPanel,
  Tag,
} from "@blueprintjs/core";
import { fetchPlateImages } from "../../apiService";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover";
import { useAppContext } from "../../AppContext";

const WorkflowInput = () => {
  const { state, updateState, loadThumbnails, loadImagesForDataset } =
    useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredImages, setFilteredImages] = useState([]);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [activeTab, setActiveTab] = useState("grid"); // Tabs: "list" or "grid"
  const [zoom, setZoom] = useState(7); // Starting size 65px, like OMERO
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [plateWellCount, setPlateWellCount] = useState(null);
  const [plateGridData, setPlateGridData] = useState(null);
  
  // Get input mode from formData instead of local state
  const inputMode = state.formData?.workflowMode || "images";
  
  // Helper function to check workflow flags from config
  const getWorkflowFlags = (workflowName) => {
    const config = state.config;
    if (!config || !config.UI) return { isPlateWorkflow: false, isZarrWorkflow: false };
    
    const plateWorkflows = config.UI.plate_workflows ? 
      JSON.parse(config.UI.plate_workflows || '[]') : [];
    const isPlateWorkflow = plateWorkflows.includes(workflowName);
    
    const zarrWorkflows = config.UI.zarr_workflows ? 
      JSON.parse(config.UI.zarr_workflows || '[]') : [];
    const isZarrWorkflow = zarrWorkflows.includes(workflowName);
    
    return { isPlateWorkflow, isZarrWorkflow };
  };

  // Load images when datasets change
  useEffect(() => {
    const currentDatasetIds = state.inputDatasets?.map((ds) => ds.index) || [];

    // Remove images of datasets not in inputDatasets
    const filteredImages = Object.entries(state.omeroFileTreeData)
      .filter(([key]) => currentDatasetIds.includes(key))
      .flatMap(([_, datasetNode]) => datasetNode.children || []);

    updateState({ images: filteredImages });

    // Load images for datasets missing children in omeroFileTreeData
    state.inputDatasets?.forEach((dataset) => {
      const treeNode = state.omeroFileTreeData[dataset.index];

      if (!treeNode || !treeNode.children || treeNode.children.length === 0) {
        loadImagesForDataset({
          dataset: dataset,
          group: state.user.active_group_id,
        }); // Fetch only if not already loaded
      }
    });
  }, [state.inputDatasets]);

  // Load thumbnails and initialize image selections
  useEffect(() => {
    if (state.images) {
      const imageIds = state.images.map((image) => image.id);
      loadThumbnails(imageIds);
      setSelectedImageIds(imageIds); // Default: all selected
      setFilteredImages(state.images);
    }
  }, [state.images]);

  // Fetch well count when plate is selected
  useEffect(() => {
    const fetchPlateWellCount = async () => {
      if (selectedPlate?.id) {
        try {
          setPlateWellCount("Fetching...");
          setPlateGridData(null);
          // Use the same endpoint as OMERO webclient for plate grid data
          const response = await fetch(
            `${window.location.origin}/webgateway/plate/${selectedPlate.id}/0/`
          );
          const text = await response.text();
          
          // Parse both JSONP and plain JSON responses
          let plateData;
          if (text.includes('jQuery') && text.includes('({') && text.includes('})')) {
            // JSONP format: jQuery123({...})
            const jsonStart = text.indexOf('({') + 1;
            const jsonEnd = text.lastIndexOf('})');
            plateData = JSON.parse(text.substring(jsonStart, jsonEnd));
          } else {
            // Plain JSON format
            plateData = JSON.parse(text);
          }
          
          // Store the complete grid data for visualization
          setPlateGridData(plateData);
          
          // Calculate well information from grid
          const totalPositions = plateData.rowlabels.length * plateData.collabels.length;
          const wellsWithImages = plateData.grid.flat().filter(cell => cell !== null).length;
          
          // Format well count info
          const plateFormat = `${plateData.rowlabels.length}×${plateData.collabels.length}`;
          if (wellsWithImages === totalPositions) {
            setPlateWellCount(`${totalPositions} wells (${plateFormat})`);
          } else {
            setPlateWellCount(`${wellsWithImages}/${totalPositions} wells (${plateFormat})`);
          }
        } catch (error) {
          console.error("Error fetching plate details:", error);
          setPlateWellCount("Error loading");
          setPlateGridData(null);
        }
      }
    };

    fetchPlateWellCount();
  }, [selectedPlate?.id]);

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

  const getAllEnabledIds = () => {
    return filteredImages
      .filter((image) => !image.isDisabled)
      .map((image) => image.id);
  };

  const handleCheckAllFiltered = () => {
    const allEnabledIds = getAllEnabledIds();

    setSelectedImageIds((prev) => [...new Set([...prev, ...allEnabledIds])]);
  };

  const handleCheckOnlyFiltered = () => {
    const allEnabledIds = getAllEnabledIds();

    setSelectedImageIds([...new Set([...allEnabledIds])]);
  };

  const handleCheckAll = () => {
    const allIds = state.images.map((image) => image.id);
    setSelectedImageIds(allIds);
  };

  const handleUncheckAllFiltered = () => {
    const updatedSet = selectedImageIds.filter(
      (id) =>
        !filteredImages.some((image) => image.id === id && !image.isDisabled)
    );
    setSelectedImageIds(updatedSet);
  };

  // Save selected IDs when proceeding to the next step
  useEffect(() => {
    const workflowName = state.selectedWorkflow?.name;
    const { isPlateWorkflow, isZarrWorkflow } = workflowName ? getWorkflowFlags(workflowName) : { isPlateWorkflow: false, isZarrWorkflow: false };
    
    if (inputMode === "plates" && selectedPlate) {
      // For plate mode, save plate ID and set data type to PLATE
      updateState({
        formData: {
          ...state.formData,
          IDs: [selectedPlate.id],
          Data_Type: "Plate", // Backend expects "Plate" (case sensitive!)
          plateMode: true,
          useZarrFormat: true, // Force zarr format for plates
        },
      });
    } else if (inputMode === "images") {
      // For dataset mode, save image IDs and set data type to IMAGE
      const shouldUseZarr = isPlateWorkflow || isZarrWorkflow; // Admin-configured ZARR requirement
      updateState({
        formData: {
          ...state.formData,
          IDs: selectedImageIds,
          Data_Type: "Image", // Backend expects "Image" (case sensitive)
          plateMode: false,
          useZarrFormat: shouldUseZarr, // Use admin-configured ZARR setting
        },
      });
    }
  }, [selectedImageIds, selectedPlate, inputMode, state.selectedWorkflow, state.config]);

  // Reset selections when input mode changes (controlled from parent)
  useEffect(() => {
    // Clear selections when switching between modes
    setSelectedPlate(null);
    setPlateWellCount(null);
    setPlateGridData(null);
    updateState({ inputDatasets: [] });
  }, [inputMode]);

  // Render plate grid visualization
  const renderPlateGrid = () => {
    if (!plateGridData) return null;

    const { grid, rowlabels, collabels } = plateGridData;
    
    // Find min/max occupied positions to create a compact view
    let minRow = rowlabels.length, maxRow = -1, minCol = collabels.length, maxCol = -1;
    grid.forEach((row, rowIdx) => {
      row.forEach((cell, colIdx) => {
        if (cell !== null) {
          minRow = Math.min(minRow, rowIdx);
          maxRow = Math.max(maxRow, rowIdx);
          minCol = Math.min(minCol, colIdx);
          maxCol = Math.max(maxCol, colIdx);
        }
      });
    });

    // If no images, show message
    if (minRow > maxRow) {
      return (
        <div className="text-center text-gray-500 text-sm p-4">
          No images in this plate
        </div>
      );
    }

    // Add padding for context (show some empty wells around occupied ones)
    const padding = 1;
    const startRow = Math.max(0, minRow - padding);
    const endRow = Math.min(rowlabels.length - 1, maxRow + padding);
    const startCol = Math.max(0, minCol - padding);
    const endCol = Math.min(collabels.length - 1, maxCol + padding);

    return (
      <div className="mt-3">
        <div className="text-sm text-gray-600 mb-2">Plate Layout Preview:</div>
        <div className="border rounded p-2 bg-gray-50 inline-block">
          {/* Column headers */}
          <div className="flex">
            <div className="w-6"></div> {/* Empty corner */}
            {collabels.slice(startCol, endCol + 1).map((colLabel, idx) => (
              <div key={colLabel} className="w-12 h-6 text-center text-xs font-medium text-gray-700 flex items-center justify-center">
                {colLabel}
              </div>
            ))}
          </div>
          
          {/* Rows with data */}
          {rowlabels.slice(startRow, endRow + 1).map((rowLabel, rowIdx) => (
            <div key={rowLabel} className="flex">
              {/* Row header */}
              <div className="w-6 h-12 text-center text-xs font-medium text-gray-700 flex items-center justify-center">
                {rowLabel}
              </div>
              
              {/* Well cells */}
              {grid[startRow + rowIdx].slice(startCol, endCol + 1).map((cell, colIdx) => (
                <div key={`${rowLabel}${collabels[startCol + colIdx]}`} className="w-12 h-12 p-0.5">
                  {cell ? (
                    <Tooltip content={`${rowLabel}${collabels[startCol + colIdx]}: ${cell.name}`}>
                      <div className="w-full h-full border border-blue-300 rounded overflow-hidden bg-white shadow-sm">
                        <img
                          src={cell.thumb_url}
                          alt={`Well ${rowLabel}${collabels[startCol + colIdx]}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Tooltip>
                  ) : (
                    <div className="w-full h-full border border-gray-200 rounded bg-gray-100"></div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <DialogBody className="flex flex-col min-h-[75vh]">
      <div className="w-full">
        <H6 className="mb-2">
          {inputMode === "plates" ? "Select Input Plate" : "Select Input Images"}
        </H6>
        
        {inputMode === "images" ? (
          // Image/Dataset selection UI
          <DatasetSelectWithPopover
            value={state.inputDatasets.map((dataset) => dataset?.data) || []}
            label="Select datasets"
            placeholder="Add new dataset name or select..."
            buttonText="Add Datasets"
            tooltip="Select the OMERO datasets as workflow input."
            onChange={(datasets, type) => {
              const inputDatasets = datasets
                .map((dataset) => {
                  // Handle both `index` (dataset key) and `data` (dataset value)
                  const resolvedDataset =
                    state.omeroFileTreeData[dataset] || // Case 1: dataset is already the key/index
                    Object.values(state.omeroFileTreeData).find(
                      (node) => node.data === dataset
                    ); // Case 2: dataset is the data value (e.g. name typed by user)
                  return resolvedDataset;
                })
                .filter(Boolean); // Filter out any unresolved datasets
              if (type === "manual") {
                updateState({ inputDatasets }); // full info
              } else {
                updateState({
                  inputDatasets: [
                    // Adding, keep unique
                    ...new Map(
                      [...state.inputDatasets, ...inputDatasets].map((item) => [
                        item.index,
                        item,
                      ])
                    ).values(),
                  ],
                });
              }
            }}
            multiSelect={true}
            allowedCategories={["datasets", "plates"]}
          />
        ) : (
          // Plate selection UI (for plate-specific workflows)
          <DatasetSelectWithPopover
            value={selectedPlate ? [selectedPlate.data] : []} 
            label="Select plate"
            placeholder="Add new plate name or select..."
            buttonText="Select Plate"
            tooltip="Select the OMERO plate as workflow input."
            onChange={(plates, type) => {
              if (plates.length > 0) {
                const resolvedPlate =
                  state.omeroFileTreeData[plates[0]] || // Case 1: plate is already the key/index
                  Object.values(state.omeroFileTreeData).find(
                    (node) => node.data === plates[0]
                  ); // Case 2: plate is the data value
                setSelectedPlate(resolvedPlate);
                setPlateWellCount(null); // Reset well count when changing plates
                setPlateGridData(null); // Reset grid data when changing plates
              } else {
                setSelectedPlate(null);
                setPlateWellCount(null);
                setPlateGridData(null);
              }
            }}
            multiSelect={false}
            allowedCategories={["plates"]}
          />
        )}
        
        {/* Plate Preview */}
        {inputMode === "plates" && selectedPlate && (
          <Card className="mt-4">
            <div className="p-4 pb-2">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <H6 className="mb-0">
                    <Icon icon="lab-test" className="mr-2" />
                    {selectedPlate.data}
                  </H6>
                  <Tag
                    icon="id-number"
                    intent="none"
                    minimal={true}
                    small={true}
                    className="text-xs"
                  >
                    ID: {selectedPlate.id}
                  </Tag>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 mb-3">
                <Tag
                  icon="grid-view"
                  intent="none"
                  minimal={true}
                >
                  {plateWellCount !== null ? plateWellCount : 
                    (selectedPlate.childCount ? selectedPlate.childCount : "Loading wells...")}
                </Tag>
              </div>
            </div>
            
            {/* Plate Grid Visualization */}
            {renderPlateGrid()}
          </Card>
        )}
        
      </div>
      {inputMode === "images" && state.inputDatasets?.length > 0 && (
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
                  intent={
                    selectedImageIds.length === state.images?.length
                      ? "none"
                      : searchQuery
                      ? "warning"
                      : "primary"
                  }
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
                    intent={
                      selectedImageIds.length === state.images?.length
                        ? "none"
                        : searchQuery
                        ? "warning"
                        : "primary"
                    }
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
                  intent={
                    searchQuery &&
                    !(
                      selectedImageIds.length === getAllEnabledIds().length &&
                      selectedImageIds.every((imageId) =>
                        getAllEnabledIds().includes(imageId)
                      )
                    )
                      ? "success"
                      : "none"
                  }
                  content={
                    !searchQuery
                      ? "Add a filter first"
                      : selectedImageIds.length === getAllEnabledIds().length &&
                        selectedImageIds.every((imageId) =>
                          getAllEnabledIds().includes(imageId)
                        )
                      ? "Only the filtered images are already selected"
                      : "Select ONLY the images matching your filter"
                  }
                  isOpen={
                    searchQuery &&
                    !(
                      selectedImageIds.length === getAllEnabledIds().length &&
                      selectedImageIds.every((imageId) =>
                        getAllEnabledIds().includes(imageId)
                      )
                    ) // Auto-show only if filter is not yet applied
                      ? true
                      : undefined // Restore hover behavior when applied
                  }
                >
                  <Button
                    icon="filter"
                    outlined={true}
                    text="Apply Filter"
                    onClick={() => {
                      handleCheckOnlyFiltered();
                    }}
                    intent={
                      searchQuery &&
                      !(
                        selectedImageIds.length === getAllEnabledIds().length &&
                        selectedImageIds.every((imageId) =>
                          getAllEnabledIds().includes(imageId)
                        )
                      )
                        ? "success"
                        : "none"
                    }
                    disabled={
                      !searchQuery ||
                      (selectedImageIds.length === getAllEnabledIds().length &&
                        selectedImageIds.every((imageId) =>
                          getAllEnabledIds().includes(imageId)
                        ))
                    }
                    className="flex-grow"
                  />
                </Tooltip>
                <Tooltip
                  intent={
                    searchQuery &&
                    !getAllEnabledIds().every((imageId) =>
                      selectedImageIds.includes(imageId)
                    )
                      ? "primary"
                      : "none"
                  }
                  content={
                    !searchQuery
                      ? "Add a filter first"
                      : getAllEnabledIds().every((imageId) =>
                          selectedImageIds.includes(imageId)
                        )
                      ? "All filtered images are already selected"
                      : "Select all filtered images"
                  }
                >
                  <Button
                    icon="selection"
                    outlined={true}
                    text="Select Filtered"
                    onClick={handleCheckAllFiltered}
                    intent={
                      searchQuery &&
                      !getAllEnabledIds().every((imageId) =>
                        selectedImageIds.includes(imageId)
                      )
                        ? "primary"
                        : "none"
                    }
                    disabled={
                      !searchQuery ||
                      getAllEnabledIds().every((imageId) =>
                        selectedImageIds.includes(imageId)
                      )
                    }
                    className="flex-grow"
                  />
                </Tooltip>

                <Tooltip
                  intent={
                    searchQuery &&
                    !getAllEnabledIds().every(
                      (imageId) => !selectedImageIds.includes(imageId)
                    )
                      ? "primary"
                      : "none"
                  }
                  content={
                    !searchQuery
                      ? "Add a filter first"
                      : getAllEnabledIds().every(
                          (imageId) => !selectedImageIds.includes(imageId)
                        )
                      ? "No filtered images are selected to deselect"
                      : "Deselect all filtered images"
                  }
                >
                  <Button
                    icon="circle"
                    outlined={true}
                    text="Deselect Filtered"
                    onClick={handleUncheckAllFiltered}
                    intent={
                      searchQuery &&
                      !getAllEnabledIds().every(
                        (imageId) => !selectedImageIds.includes(imageId)
                      )
                        ? "primary"
                        : "none"
                    }
                    disabled={
                      !searchQuery ||
                      getAllEnabledIds().every(
                        (imageId) => !selectedImageIds.includes(imageId)
                      )
                    }
                    className="flex-grow"
                  />
                </Tooltip>
              </ButtonGroup>
            </div>
        </>
      )}
      {inputMode === "images" && state.inputDatasets?.length > 0 && (
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
              tagProps={{
                round: true,
                className:
                  selectedImageIds.length === 0 ? "bg-red-500 text-white" : "",
              }}
            />
            <Tab
              id="grid"
              tagContent={selectedImageIds.length}
              tagProps={{
                round: true,
                className:
                  selectedImageIds.length === 0 ? "bg-red-500 text-white" : "",
              }}
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
                      className={`flex items-center justify-between gap-4 ${
                        image.isDisabled ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {/* Switch for selection */}
                      <Switch
                        checked={selectedImageIds.includes(image.id)}
                        onChange={() => handleToggleImage(image.id)}
                        disabled={image.isDisabled}
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
                  <p className="text-gray-500 text-xs">
                    No images match your search.
                  </p>
                )}
              </div>
            }
          />
          <TabPanel
            id="grid"
            selectedTabId={activeTab}
            parentId="workflow-input-tabs"
            className="overflow-auto min-h-[calc(100vh-80vh)] max-h-[45vh]"
            panel={
              <div className="flex flex-col items-center">
                {/* Slider Section */}
                <div className="w-full px-4">
                  <FormGroup label="Columns" inline={false}>
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

                {/* Thumbnail Grid */}
                <div
                  className={`grid grid-cols-${zoom} gap-2 overflow-y-auto p-1 w-full`}
                >
                  {filteredImages.length > 0 ? (
                    filteredImages.map((image) => (
                      <Tooltip
                        key={image.id}
                        content={image.name}
                        targetProps={{
                          className: image.isDisabled
                            ? "cursor-not-allowed"
                            : "",
                        }}
                      >
                        <Card
                          interactive={true}
                          elevation={image.isDisabled ? 1 : 3}
                          className={`p-1 flex flex-col items-center justify-between 
                          border transition-all duration-150 
                          ${
                            image.isDisabled
                              ? "opacity-50 pointer-events-none cursor-not-allowed"
                              : ""
                          }
                          ${
                            selectedImageIds.includes(image.id)
                              ? "bg-blue-500"
                              : ""
                          }
                        `}
                          onClick={() =>
                            !image.isDisabled && handleToggleImage(image.id)
                          }
                          selected={selectedImageIds.includes(image.id)}
                        >
                          {state.thumbnails?.[image.id] ? (
                            <img
                              src={state.thumbnails[image.id]}
                              alt={image.name || "Thumbnail"}
                              className="object-cover w-full"
                            />
                          ) : (
                            <div className="bg-gray-300 rounded-md w-full h-[100px] flex items-center justify-center">
                              <span className="text-gray-500 text-xs">
                                No preview
                              </span>
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
            }
          />
        </div>
      )}
    </DialogBody>
  );
};

export default WorkflowInput;
