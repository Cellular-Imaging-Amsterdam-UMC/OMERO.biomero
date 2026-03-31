import React, { useState, useEffect, useCallback } from "react";
import { H4, Card, Button, Spinner, Callout, NumericInput, ButtonGroup } from "@blueprintjs/core";
import TrackingTableView from "./TrackingTableView";
import AnnotateViewer from "./AnnotateViewer";
import PatchSelector from "./PatchSelector";
import { useAppContext } from "../../../AppContext";
import {
  getTrackingTableDetail,
  saveAnnotateAnnotation,
  fetchAnnotateAnnotation,
  getAnnotateProgress,
  getAnnotateImageChannels,
  markUnitProcessed,
  addPatchToTrackingTable,
} from "../../../apiService";

const AnnotateTab = ({
  config,
  tableId,
  units: initialUnits,
  progress: initialProgress,
  onProgressUpdate,
  onUnitsUpdate,
  onTableIdUpdate,
}) => {
  const { toaster } = useAppContext();

  const [units, setUnits] = useState(initialUnits || []);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(null);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [featureTypes, setFeatureTypes] = useState([
    { id: "1", name: "Object", color: "#00ff00" },
  ]);
  const [channelInfo, setChannelInfo] = useState(null);

  // Patch state
  const [patchWidth, setPatchWidth] = useState(256);
  const [patchHeight, setPatchHeight] = useState(256);

  // Load table detail when tableId changes or on mount
  useEffect(() => {
    if (tableId) {
      loadTableDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Auto-select first pending unit when units load
  useEffect(() => {
    if (units.length > 0 && selectedUnitIndex === null) {
      const firstPending = units.findIndex((u) => !u.processed);
      setSelectedUnitIndex(firstPending >= 0 ? firstPending : 0);
    }
  }, [units, selectedUnitIndex]);

  // Load existing annotations when unit changes
  useEffect(() => {
    if (selectedUnitIndex !== null && units[selectedUnitIndex]) {
      loadUnitAnnotations(units[selectedUnitIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitIndex]);

  const loadTableDetail = async () => {
    setLoading(true);
    try {
      const result = await getTrackingTableDetail(tableId);
      const loadedUnits = result.units || [];
      setUnits(loadedUnits);
      onUnitsUpdate?.(loadedUnits);
      onProgressUpdate?.(result.progress);
    } catch (e) {
      console.error("Error loading table detail:", e);
      toaster?.show({
        message: "Failed to load tracking table",
        intent: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUnitAnnotations = async (unit) => {
    if (!unit || !unit.image_id) return;
    try {
      const result = await fetchAnnotateAnnotation(unit.image_id, tableId);
      const features = result.features || [];
      const loaded = features.map((f) => ({
        id: f.id,
        points: f.geometry.coordinates[0],
        typeId: f.properties?.typeId || "1",
        roiId: f.properties?.roiId,
      }));
      setAnnotations(loaded);
    } catch (e) {
      console.error("Error loading annotations:", e);
      setAnnotations([]);
    }
  };

  const selectedUnit =
    selectedUnitIndex !== null ? units[selectedUnitIndex] : null;

  // Get all patch units for the currently selected image
  const currentImageId = selectedUnit?.image_id;
  const patchesForImage = units
    .map((u, i) => ({ ...u, _unitIndex: i }))
    .filter((u) => u.is_patch && u.image_id === currentImageId);

  // Build the patch prop for AnnotateViewer when selected unit is a patch
  const viewerPatch = selectedUnit?.is_patch ? selectedUnit : null;

  // Build an image object compatible with the AnnotationViewer
  const currentImage = selectedUnit
    ? {
        id: selectedUnit.image_id,
        name: selectedUnit.image_name,
        // Override z/t for the viewer URL
        z: selectedUnit.z_slice >= 0 ? selectedUnit.z_slice : 0,
        t: selectedUnit.timepoint >= 0 ? selectedUnit.timepoint : 0,
        c: selectedUnit.channel >= 0 ? selectedUnit.channel : 0,
      }
    : null;

  // Fetch channel info for contrast slider
  useEffect(() => {
    if (currentImage) {
      getAnnotateImageChannels(currentImage.id)
        .then((data) => {
          const ch = data.channels?.find((c) => c.index === currentImage.c);
          setChannelInfo(ch || null);
        })
        .catch(() => setChannelInfo(null));
    } else {
      setChannelInfo(null);
    }
  }, [currentImage?.id, currentImage?.c]);

  const handleSaveAndNext = async () => {
    if (!selectedUnit || annotations.length === 0) {
      toaster?.show({
        message: "Draw some annotations first",
        intent: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      // We need image dimensions for mask creation.
      // The AnnotationViewer works at native image resolution, so we can
      // get dimensions from the canvas or pass them from the image.
      // For now, use a reasonable approach: get from the first annotation
      // point bounds or the image metadata in the unit.
      const zSlice = selectedUnit.z_slice >= 0 ? selectedUnit.z_slice : 0;
      const timepoint = selectedUnit.timepoint >= 0 ? selectedUnit.timepoint : 0;
      const channel = selectedUnit.channel >= 0 ? selectedUnit.channel : -1;
      const geojsonPayload = {
        type: "FeatureCollection",
        features: annotations.map((ann) => ({
          type: "Feature",
          id: ann.id,
          geometry: {
            type: "Polygon",
            coordinates: [ann.points],
            plane: { c: channel, z: zSlice, t: timepoint },
          },
          properties: { objectType: "annotation" },
        })),
      };
      const result = await saveAnnotateAnnotation(
        selectedUnit.image_id,
        geojsonPayload,
        tableId,
        selectedUnitIndex,
        selectedUnit.z_slice >= 0 ? selectedUnit.z_slice : null,
        selectedUnit.timepoint >= 0 ? selectedUnit.timepoint : null,
        selectedUnit.channel >= 0 ? selectedUnit.channel : null,
        selectedUnit.is_patch
          ? [selectedUnit.patch_x, selectedUnit.patch_y]
          : null,
        config?.name || "web_annotation",
      );

      if (result.success) {
        // The backend recreates the tracking table (delete + create) so the
        // table ID may change.  Update parent state so subsequent calls use
        // the new ID.
        const currentTableId = result.table_id ?? tableId;
        if (result.table_id && result.table_id !== tableId) {
          onTableIdUpdate?.(result.table_id);
        }

        toaster?.show({
          message: `Annotation saved (ROI: ${result.roi_id}, Label: ${result.label_id})`,
          intent: "success",
          timeout: 3000,
        });

        // Mark unit as processed locally
        const updatedUnits = [...units];
        updatedUnits[selectedUnitIndex] = {
          ...updatedUnits[selectedUnitIndex],
          processed: true,
          roi_id: String(result.roi_id),
          label_id: String(result.label_id),
        };
        setUnits(updatedUnits);
        onUnitsUpdate?.(updatedUnits);

        // Update progress using the (possibly new) table ID
        const progressResult = await getAnnotateProgress(currentTableId);
        onProgressUpdate?.(progressResult);

        // Move to next pending unit
        const nextPending = updatedUnits.findIndex(
          (u, i) => !u.processed && i > selectedUnitIndex,
        );
        if (nextPending >= 0) {
          setSelectedUnitIndex(nextPending);
          setAnnotations([]);
        } else {
          // Try from beginning
          const anyPending = updatedUnits.findIndex((u) => !u.processed);
          if (anyPending >= 0) {
            setSelectedUnitIndex(anyPending);
            setAnnotations([]);
          } else {
            toaster?.show({
              message: "All processing units are complete!",
              intent: "success",
              icon: "tick-circle",
            });
          }
        }
      }
    } catch (e) {
      console.error("Error saving annotation:", e);
      const errMsg = e.response?.data?.error || e.message;
      toaster?.show({ message: `Failed to save: ${errMsg}`, intent: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkEmpty = async () => {
    if (!selectedUnit || !tableId) return;
    try {
      setSaving(true);
      const result = await markUnitProcessed(tableId, selectedUnitIndex);
      if (result.success) {
        // Update table ID if it changed
        const currentTableId = result.table_id ?? tableId;
        if (result.table_id && result.table_id !== tableId) {
          onTableIdUpdate?.(result.table_id);
        }

        toaster?.show({
          message: "Marked as done — no objects to label",
          intent: "success",
          icon: "tick",
          timeout: 2000,
        });

        // Mark unit as processed locally
        const updatedUnits = [...units];
        updatedUnits[selectedUnitIndex] = {
          ...updatedUnits[selectedUnitIndex],
          processed: true,
        };
        setUnits(updatedUnits);
        onUnitsUpdate?.(updatedUnits);

        // Update progress
        const progressResult = await getAnnotateProgress(currentTableId);
        onProgressUpdate?.(progressResult);

        // Move to next pending unit
        const nextPending = updatedUnits.findIndex(
          (u, i) => !u.processed && i > selectedUnitIndex,
        );
        if (nextPending >= 0) {
          setSelectedUnitIndex(nextPending);
          setAnnotations([]);
        } else {
          const anyPending = updatedUnits.findIndex((u) => !u.processed);
          if (anyPending >= 0) {
            setSelectedUnitIndex(anyPending);
            setAnnotations([]);
          } else {
            toaster?.show({
              message: "All images have been reviewed!",
              intent: "success",
              icon: "tick-circle",
            });
          }
        }
      }
    } catch (e) {
      console.error("Error marking empty:", e);
      toaster?.show({ message: `Failed: ${e.message}`, intent: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPatch = async () => {
    if (!selectedUnit || !tableId) return;
    try {
      // Random position within image bounds
      // We need image dimensions — use a reasonable default or get from channel info
      const imgWidth = channelInfo?.width || 1024;
      const imgHeight = channelInfo?.height || 1024;
      const maxX = Math.max(0, imgWidth - patchWidth);
      const maxY = Math.max(0, imgHeight - patchHeight);
      const px = Math.floor(Math.random() * maxX);
      const py = Math.floor(Math.random() * maxY);

      const result = await addPatchToTrackingTable(
        tableId,
        selectedUnit.image_id,
        selectedUnit.image_name,
        px,
        py,
        patchWidth,
        patchHeight,
        selectedUnit.category || "training",
      );

      if (result.success) {
        // Update table ID if it changed
        if (result.table_id && result.table_id !== tableId) {
          onTableIdUpdate?.(result.table_id);
        }
        // Reload the tracking table to get the new unit
        const detail = await getTrackingTableDetail(result.table_id || tableId);
        setUnits(detail.units || []);
        onUnitsUpdate?.(detail.units || []);
        // Select the newly added patch
        if (result.unit_index !== undefined) {
          setSelectedUnitIndex(result.unit_index);
          setAnnotations([]);
        }
        toaster?.show({
          message: "Patch added",
          intent: "success",
          timeout: 2000,
        });
      }
    } catch (e) {
      console.error("Error adding patch:", e);
      toaster?.show({ message: `Failed to add patch: ${e.message}`, intent: "danger" });
    }
  };

  const handleSkipForLater = () => {
    // Move to next unit without saving — image stays as pending
    const next = units.findIndex(
      (u, i) => !u.processed && i > (selectedUnitIndex ?? -1),
    );
    if (next >= 0) {
      setSelectedUnitIndex(next);
      setAnnotations([]);
      toaster?.show({
        message: "Skipped — will come back later",
        intent: "warning",
        icon: "arrow-right",
        timeout: 2000,
      });
    } else {
      const anyPending = units.findIndex((u) => !u.processed);
      if (anyPending >= 0) {
        setSelectedUnitIndex(anyPending);
        setAnnotations([]);
      } else {
        toaster?.show({
          message: "All images have been reviewed!",
          intent: "success",
          icon: "tick-circle",
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (!tableId) {
    return (
      <Callout intent="primary" icon="info-sign">
        Configure and initialize a workflow first using the Configure tab.
      </Callout>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex justify-between items-center">
        <H4>
          Annotate Images
          {selectedUnit && (
            <span className="text-sm font-normal ml-2 text-gray-500">
              — {selectedUnit.image_name} (C:{selectedUnit.channel} Z:
              {selectedUnit.z_slice} T:{selectedUnit.timepoint})
              {selectedUnit.is_patch &&
                ` Patch(${selectedUnit.patch_x},${selectedUnit.patch_y})`}
            </span>
          )}
        </H4>
        <div className="flex gap-2">
          <Button
            icon="tick"
            text="Done (empty)"
            onClick={handleMarkEmpty}
            disabled={!selectedUnit || saving}
          />
          <Button
            minimal
            icon="arrow-right"
            text="Skip"
            onClick={handleSkipForLater}
            disabled={!selectedUnit || saving}
          />
          <Button
            intent="primary"
            icon="floppy-disk"
            text="Save & Next"
            onClick={handleSaveAndNext}
            disabled={!selectedUnit || saving || annotations.length === 0}
            loading={saving}
          />
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Tracking table sidebar */}
        <Card className="w-80 shrink-0 p-0 overflow-hidden flex flex-col">
          <TrackingTableView
            units={units}
            selectedIndex={selectedUnitIndex}
            onSelectUnit={(idx) => {
              setSelectedUnitIndex(idx);
              setAnnotations([]);
            }}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
          />

          {/* Patch section — shown when an image is selected */}
          {selectedUnit && (
            <div style={{ borderTop: "1px solid #ddd", padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Patches</span>
              </div>

              {/* Patch size inputs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8, fontSize: 11 }}>
                <div>
                  <label style={{ fontSize: 10, color: "#888" }}>Width</label>
                  <NumericInput
                    value={patchWidth}
                    onValueChange={(v) => setPatchWidth(v)}
                    min={32}
                    max={2048}
                    stepSize={32}
                    style={{ width: 70 }}
                    small
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "#888" }}>Height</label>
                  <NumericInput
                    value={patchHeight}
                    onValueChange={(v) => setPatchHeight(v)}
                    min={32}
                    max={2048}
                    stepSize={32}
                    style={{ width: 70 }}
                    small
                  />
                </div>
              </div>

              <PatchSelector
                patches={patchesForImage}
                selectedPatchIndex={selectedUnitIndex}
                imageId={currentImageId}
                imageWidth={channelInfo?.width || 1024}
                imageHeight={channelInfo?.height || 1024}
                onSelectPatch={(idx) => {
                  setSelectedUnitIndex(idx);
                  setAnnotations([]);
                }}
                onAddPatch={handleAddPatch}
              />
            </div>
          )}
        </Card>

        {/* Annotation canvas */}
        <Card className="flex-1 p-0 overflow-hidden flex flex-col">
          {currentImage ? (
            <AnnotateViewer
              image={currentImage}
              annotations={annotations}
              onAnnotationsChange={setAnnotations}
              featureTypes={featureTypes}
              onFeatureTypesChange={setFeatureTypes}
              channelInfo={channelInfo}
              patch={viewerPatch}
            />
          ) : (
            <div className="flex justify-center items-center h-full text-gray-400">
              Select a processing unit from the table
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AnnotateTab;
