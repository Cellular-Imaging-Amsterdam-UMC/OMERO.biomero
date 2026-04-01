import React, { useState, useEffect } from "react";
import { H4, Card, Button, Spinner, Callout, ButtonGroup, Menu, MenuItem, Popover, Tag, Icon } from "@blueprintjs/core";
import AnnotateViewer from "./AnnotateViewer";
import PatchSelector from "./PatchSelector";
import { useAppContext } from "../../../AppContext";
import {
  saveAnnotateAnnotation,
  fetchAnnotateAnnotation,
  getAnnotateImageChannels,
  addPatchToManifest,
} from "../../../apiService";

// Unit list grouped by image
const UnitList = ({ units, selectedIndex, onSelect, filterStatus, onFilterChange }) => {
  // Group units by image_id, preserving original indices
  const indexed = units.map((u, i) => ({ ...u, _idx: i }));
  const filtered = indexed.filter((u) => {
    if (filterStatus === "pending") return !u.processed;
    if (filterStatus === "completed") return u.processed;
    return true;
  });

  // Build grouped structure: [ { imageId, imageName, units: [...] }, ... ]
  const grouped = [];
  const seen = new Map();
  for (const unit of filtered) {
    if (!seen.has(unit.image_id)) {
      const group = { imageId: unit.image_id, imageName: unit.image_name, units: [] };
      seen.set(unit.image_id, group);
      grouped.push(group);
    }
    seen.get(unit.image_id).units.push(unit);
  }

  const completed = units.filter((u) => u.processed).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex items-center justify-between">
        <span className="text-xs font-bold">{completed}/{units.length} done</span>
        <ButtonGroup minimal small>
          {["all", "pending", "completed"].map((s) => (
            <Button
              key={s}
              active={filterStatus === s}
              onClick={() => onFilterChange(s)}
              text={s.charAt(0).toUpperCase() + s.slice(1)}
              small
            />
          ))}
        </ButtonGroup>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.map((group) => {
          const groupDone = group.units.every((u) => u.processed);
          const groupSelected = group.units.some((u) => u._idx === selectedIndex);
          return (
            <div key={group.imageId}>
              {/* Image header */}
              <div
                className={`px-2 py-1.5 text-xs font-semibold bg-gray-100 border-b flex items-center justify-between sticky top-0 ${
                  groupSelected ? "bg-blue-50" : ""
                }`}
              >
                <span className="truncate flex items-center gap-1">
                  <Icon
                    icon={groupDone ? "tick-circle" : "circle"}
                    size={12}
                    intent={groupDone ? "success" : "none"}
                  />
                  {group.imageName}
                </span>
                <span className="text-gray-400 text-[10px]">
                  {group.units.filter((u) => u.processed).length}/{group.units.length}
                </span>
              </div>
              {/* Units under this image */}
              {group.units.map((unit) => (
                <div
                  key={unit._idx}
                  className={`pl-4 pr-2 py-1.5 text-xs cursor-pointer border-b ${
                    unit._idx === selectedIndex
                      ? "bg-blue-100 border-l-2 border-l-blue-500"
                      : "hover:bg-gray-50"
                  } ${unit.processed ? "opacity-60" : ""}`}
                  onClick={() => onSelect(unit._idx)}
                >
                  {unit.is_patch ? (
                    <div className="text-gray-600">
                      Patch {unit.patch_width}x{unit.patch_height} at ({unit.patch_x},{unit.patch_y})
                    </div>
                  ) : (
                    <div className="text-gray-600">Full image</div>
                  )}
                  <div className="flex gap-2 items-center text-gray-400 mt-0.5">
                    {unit.channel >= 0 && <span>C:{unit.channel}</span>}
                    {unit.z_slice >= 0 && <span>Z:{unit.z_slice}</span>}
                    {unit.timepoint >= 0 && <span>T:{unit.timepoint}</span>}
                    <Icon
                      icon={unit.processed ? "tick-circle" : "circle"}
                      size={12}
                      intent={unit.processed ? "success" : "none"}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AnnotateTab = ({ manifest, setId, onManifestUpdate }) => {
  const { toaster } = useAppContext();

  const units = manifest?.annotations || [];
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(null);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [featureTypes, setFeatureTypes] = useState([]);
  const [channelInfo, setChannelInfo] = useState(null);
  const [allChannels, setAllChannels] = useState([]);
  const [skipPopoverOpen, setSkipPopoverOpen] = useState(false);

  // Initialize feature types from manifest
  useEffect(() => {
    if (manifest?.feature_types?.length > 0) {
      setFeatureTypes(
        manifest.feature_types.map((ft, i) => ({
          id: ft.name || String(i),
          name: ft.name,
          color: ft.color,
        })),
      );
    } else if (featureTypes.length === 0) {
      setFeatureTypes([{ id: "1", name: "Object", color: "#00ff00" }]);
    }
  }, [manifest?.feature_types]);

  // Auto-select first pending unit
  useEffect(() => {
    if (units.length > 0 && selectedUnitIndex === null) {
      const firstPending = units.findIndex((u) => !u.processed);
      setSelectedUnitIndex(firstPending >= 0 ? firstPending : 0);
    }
  }, [units, selectedUnitIndex]);

  // Load annotations when unit changes
  useEffect(() => {
    if (selectedUnitIndex !== null && units[selectedUnitIndex]) {
      loadUnitAnnotations(units[selectedUnitIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitIndex, setId]);

  const loadUnitAnnotations = async (unit) => {
    if (!unit || !unit.image_id || !setId) return;
    try {
      const result = await fetchAnnotateAnnotation(unit.image_id, setId);
      const features = result.features || [];
      // Filter features for this specific patch/plane
      const filtered = features.filter((f) => {
        const props = f.properties || {};
        // If unit is a patch, match by patch coordinates
        if (unit.is_patch && props.patch) {
          return (
            props.patch.x === unit.patch_x &&
            props.patch.y === unit.patch_y &&
            props.patch.width === unit.patch_width &&
            props.patch.height === unit.patch_height
          );
        }
        // For full-image units, include features without patch property
        return !unit.is_patch && !props.patch;
      });
      const loaded = filtered.map((f) => ({
        id: f.id || crypto.randomUUID(),
        points: f.geometry?.coordinates?.[0] || [],
        typeId: f.properties?.featureType || f.properties?.typeId || "1",
      }));
      setAnnotations(loaded);
    } catch (e) {
      console.error("Error loading annotations:", e);
      setAnnotations([]);
    }
  };

  const selectedUnit = selectedUnitIndex !== null ? units[selectedUnitIndex] : null;
  const currentImageId = selectedUnit?.image_id;
  const patchesForImage = units
    .map((u, i) => ({ ...u, _unitIndex: i }))
    .filter((u) => u.is_patch && u.image_id === currentImageId);
  const allDone = units.length > 0 && units.every((u) => u.processed);
  const viewerPatch = selectedUnit?.is_patch ? selectedUnit : null;

  const currentImage = selectedUnit
    ? {
        id: selectedUnit.image_id,
        name: selectedUnit.image_name,
        z: selectedUnit.z_slice >= 0 ? selectedUnit.z_slice : 0,
        t: selectedUnit.timepoint >= 0 ? selectedUnit.timepoint : 0,
        c: selectedUnit.channel >= 0 ? selectedUnit.channel : 0,
      }
    : null;

  // Fetch channel info
  useEffect(() => {
    if (currentImage) {
      getAnnotateImageChannels(currentImage.id)
        .then((data) => {
          const ch = data.channels?.find((c) => c.index === currentImage.c);
          setChannelInfo(ch || null);
          setAllChannels(data.channels || []);
        })
        .catch(() => { setChannelInfo(null); setAllChannels([]); });
    } else {
      setChannelInfo(null);
      setAllChannels([]);
    }
  }, [currentImage?.id, currentImage?.c]);

  const advanceToNextPending = (fromIndex) => {
    const next = units.findIndex((u, i) => !u.processed && i > fromIndex);
    if (next >= 0) {
      setSelectedUnitIndex(next);
      setAnnotations([]);
    } else {
      const any = units.findIndex((u) => !u.processed);
      if (any >= 0) {
        setSelectedUnitIndex(any);
        setAnnotations([]);
      } else {
        toaster?.show({
          message: "All processing units are complete!",
          intent: "success",
          icon: "tick-circle",
        });
      }
    }
  };

  const handleSaveAndNext = async () => {
    if (allDone || !selectedUnit || annotations.length === 0) return;
    setSaving(true);
    try {
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
          },
          properties: {
            objectType: "annotation",
            featureType: ann.typeId,
            plane: { c: channel, z: zSlice, t: timepoint },
            ...(selectedUnit.is_patch
              ? {
                  patch: {
                    x: selectedUnit.patch_x,
                    y: selectedUnit.patch_y,
                    width: selectedUnit.patch_width,
                    height: selectedUnit.patch_height,
                  },
                }
              : {}),
          },
        })),
      };

      const containerType = manifest?.omero?.container_type || "dataset";
      const containerId = manifest?.omero?.container_id || manifest?.omero?.container_ids?.[0];

      // Build channel presentation from OMERO image-level window data
      // Uses min/max (full intensity range), NOT start/end (rendering defaults)
      const channelPresentation = allChannels.length > 0
        ? allChannels.map((ch) => ({
            channel_index: ch.index,
            visible: ch.active !== false,
            contrast_start: ch.window?.min ?? 0,
            contrast_end: ch.window?.max ?? 255,
            color: ch.color || "#FFFFFF",
          }))
        : null;

      const result = await saveAnnotateAnnotation(
        selectedUnit.image_id,
        geojsonPayload,
        setId,
        selectedUnitIndex,
        containerType,
        containerId,
        channelPresentation,
      );

      if (result.success) {
        toaster?.show({
          message: "Annotation saved",
          intent: "success",
          timeout: 3000,
        });

        // Update manifest locally
        if (manifest) {
          const updated = { ...manifest };
          updated.annotations = [...updated.annotations];
          updated.annotations[selectedUnitIndex] = {
            ...updated.annotations[selectedUnitIndex],
            processed: true,
          };
          onManifestUpdate(updated);
        }

        advanceToNextPending(selectedUnitIndex);
      }
    } catch (e) {
      console.error("Error saving annotation:", e);
      toaster?.show({ message: `Failed to save: ${e.message}`, intent: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkEmpty = async () => {
    if (!selectedUnit) return;
    // Mark processed locally — save_annotation with empty GeoJSON
    setSaving(true);
    try {
      const containerType = manifest?.omero?.container_type || "dataset";
      const containerId = manifest?.omero?.container_id || manifest?.omero?.container_ids?.[0];

      const channelPresentation = allChannels.length > 0
        ? allChannels.map((ch) => ({
            channel_index: ch.index,
            visible: ch.active !== false,
            contrast_start: ch.window?.min ?? 0,
            contrast_end: ch.window?.max ?? 255,
            color: ch.color || "#FFFFFF",
          }))
        : null;

      await saveAnnotateAnnotation(
        selectedUnit.image_id,
        { type: "FeatureCollection", features: [] },
        setId,
        selectedUnitIndex,
        containerType,
        containerId,
        channelPresentation,
      );

      if (manifest) {
        const updated = { ...manifest };
        updated.annotations = [...updated.annotations];
        updated.annotations[selectedUnitIndex] = {
          ...updated.annotations[selectedUnitIndex],
          processed: true,
        };
        onManifestUpdate(updated);
      }

      toaster?.show({
        message: "Marked as done",
        intent: "success",
        timeout: 2000,
      });
      advanceToNextPending(selectedUnitIndex);
    } catch (e) {
      toaster?.show({ message: `Failed: ${e.message}`, intent: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPatch = async () => {
    if (!selectedUnit || !setId || !manifest) return;
    try {
      const containerType = manifest.omero?.container_type || "dataset";
      const containerId = manifest.omero?.container_id || manifest.omero?.container_ids?.[0];
      const imgWidth = channelInfo?.width || 1024;
      const imgHeight = channelInfo?.height || 1024;

      const result = await addPatchToManifest(
        containerType,
        containerId,
        setId,
        selectedUnit.image_id,
        selectedUnit.image_name,
        imgWidth,
        imgHeight,
      );

      if (result.success) {
        // Update manifest with new unit
        if (manifest) {
          const updated = { ...manifest };
          updated.annotations = [...updated.annotations, result.unit];
          onManifestUpdate(updated);
        }
        if (result.unit_index !== undefined) {
          setSelectedUnitIndex(result.unit_index);
          setAnnotations([]);
        }
        toaster?.show({ message: "Patch added", intent: "success", timeout: 2000 });
      }
    } catch (e) {
      toaster?.show({ message: `Failed to add patch: ${e.message}`, intent: "danger" });
    }
  };

  const handleSkipForLater = () => {
    advanceToNextPending(selectedUnitIndex ?? -1);
    toaster?.show({
      message: "Skipped — will come back later",
      intent: "warning",
      icon: "arrow-right",
      timeout: 2000,
    });
  };

  if (!setId) {
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
          <Popover
            isOpen={skipPopoverOpen}
            onClose={() => setSkipPopoverOpen(false)}
            placement="bottom-end"
            content={
              <Menu>
                <MenuItem
                  icon="arrow-right"
                  text="Skip for now"
                  onClick={() => {
                    setSkipPopoverOpen(false);
                    handleSkipForLater();
                  }}
                />
                <MenuItem
                  icon="disable"
                  text="No labels (done)"
                  onClick={() => {
                    setSkipPopoverOpen(false);
                    handleMarkEmpty();
                  }}
                />
              </Menu>
            }
          >
            <Button
              icon="arrow-right"
              text="Skip"
              rightIcon="caret-down"
              onClick={() => setSkipPopoverOpen(!skipPopoverOpen)}
              disabled={!selectedUnit || saving || allDone}
            />
          </Popover>
          <Button
            intent="primary"
            icon="floppy-disk"
            text="Save & Next"
            onClick={handleSaveAndNext}
            disabled={!selectedUnit || saving || annotations.length === 0 || allDone}
            loading={saving}
          />
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Unit list sidebar */}
        <Card className="w-80 shrink-0 p-0 overflow-hidden flex flex-col">
          <UnitList
            units={units}
            selectedIndex={selectedUnitIndex}
            onSelect={(idx) => {
              setSelectedUnitIndex(idx);
              setAnnotations([]);
            }}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
          />

          {/* Patch section */}
          {selectedUnit && (
            <div style={{ borderTop: "1px solid #ddd", padding: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Patches</span>
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
              channels={allChannels}
              patch={viewerPatch}
            />
          ) : (
            <div className="flex justify-center items-center h-full text-gray-400">
              Select a processing unit from the list
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AnnotateTab;
