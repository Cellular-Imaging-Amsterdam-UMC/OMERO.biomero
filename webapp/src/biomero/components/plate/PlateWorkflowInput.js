import React, { useState, useEffect } from "react";
import {
  DialogBody,
  H6,
  Card,
  Tag,
  Icon,
  Tooltip,
} from "@blueprintjs/core";
import DatasetSelectWithPopover from "../DatasetSelectWithPopover";
import { useAppContext } from "../../../AppContext";

const PlateWorkflowInput = () => {
  const { state, updateState, loadPlateGridData } = useAppContext();
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [plateWellCount, setPlateWellCount] = useState(null);
  const [plateGridData, setPlateGridData] = useState(null);

  // Fetch well count when plate is selected
  useEffect(() => {
    const fetchPlateWellCount = async () => {
      if (selectedPlate?.id) {
        try {
          setPlateWellCount("Fetching...");
          setPlateGridData(null);
          
          const result = await loadPlateGridData(selectedPlate.id);
          
          // Store the complete grid data for visualization
          setPlateGridData(result.plateData);
          
          // Use the formatted well count from AppContext
          setPlateWellCount(result.wellCount);
        } catch (error) {
          console.error("Error fetching plate details:", error);
          setPlateWellCount("Error loading");
          setPlateGridData(null);
        }
      }
    };

    fetchPlateWellCount();
  }, [selectedPlate?.id]);

  // Save selected plate when proceeding to the next step
  useEffect(() => {
    if (selectedPlate) {
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
    }
  }, [selectedPlate]);

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
        <H6 className="mb-2">Select Input Plate</H6>
        
        {/* Plate selection UI */}
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
        
        {/* Plate Preview */}
        {selectedPlate && (
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
    </DialogBody>
  );
};

export default PlateWorkflowInput;