import React, { useState, useEffect, useCallback } from "react";
import { H4, Card, Button, Spinner, Callout } from "@blueprintjs/core";
import TrackingTableView from "./TrackingTableView";
import AnnotateViewer from "./AnnotateViewer";
import { useAppContext } from "../../../AppContext";
import {
  getTrackingTableDetail,
  saveAnnotateAnnotation,
  fetchAnnotateAnnotation,
  getAnnotateProgress,
} from "../../../apiService";

const AnnotateTab = ({
  config,
  tableId,
  units: initialUnits,
  progress: initialProgress,
  onProgressUpdate,
  onUnitsUpdate,
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
      setAnnotations(result.annotations || []);
    } catch (e) {
      console.error("Error loading annotations:", e);
      setAnnotations([]);
    }
  };

  const selectedUnit =
    selectedUnitIndex !== null ? units[selectedUnitIndex] : null;

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
      const result = await saveAnnotateAnnotation(
        selectedUnit.image_id,
        annotations,
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

        // Update progress
        const progressResult = await getAnnotateProgress(tableId);
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

  const handleSkip = () => {
    // Move to next unit without saving
    const next = units.findIndex(
      (u, i) => !u.processed && i > (selectedUnitIndex ?? -1),
    );
    if (next >= 0) {
      setSelectedUnitIndex(next);
      setAnnotations([]);
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
            icon="arrow-right"
            text="Skip"
            onClick={handleSkip}
            disabled={!selectedUnit || saving}
          />
          <Button
            intent="primary"
            icon="floppy-disk"
            text="Save & Next"
            onClick={handleSaveAndNext}
            loading={saving}
            disabled={!selectedUnit || annotations.length === 0}
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
