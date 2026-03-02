import React, { useState, useEffect } from "react";
import {
  H4,
  Card,
  Button,
  FormGroup,
  InputGroup,
  TextArea,
  HTMLSelect,
  NumericInput,
  Switch,
  Callout,
  Spinner,
  Collapse,
  Tag,
  Alert,
  Icon,
} from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import { useAppContext } from "../../../AppContext";
import {
  createAnnotateConfig,
  createTrackingTable,
  listTrackingTables,
  loadAnnotateConfig,
  getAnnotateImageChannels,
  getContainerImages,
  deleteTrackingTable,
} from "../../../apiService";

const ConfigureTab = ({ onConfigCreated, existingConfig }) => {
  const { toaster, state } = useAppContext();

  // --- Workflow metadata ---
  const [name, setName] = useState("annotation_workflow");
  const [studyTitle, setStudyTitle] = useState("");
  const [studyDescription, setStudyDescription] = useState("");
  const [organism, setOrganism] = useState("");
  const [imagingMethod, setImagingMethod] = useState("");

  // --- Annotation methodology ---
  const [annotationType, setAnnotationType] = useState("segmentation_mask");
  const [annotationMethod, setAnnotationMethod] = useState("manual");
  const [annotationCriteria, setAnnotationCriteria] = useState("");

  // --- Container ---
  const [containerType, setContainerType] = useState("dataset");
  const [selectedContainers, setSelectedContainers] = useState([]);
  const [containerIds, setContainerIds] = useState([]);

  // --- Spatial coverage ---
  const [channels, setChannels] = useState([0]);
  const [labelChannel, setLabelChannel] = useState(0);
  const [zSliceMode, setZSliceMode] = useState("specific");
  const [zSlices, setZSlices] = useState([0]);
  const [timepointMode, setTimepointMode] = useState("specific");
  const [timepoints, setTimepoints] = useState([0]);
  const [threeD, setThreeD] = useState(false);
  const [usePatches, setUsePatches] = useState(false);
  const [patchSize, setPatchSize] = useState([512, 512]);
  const [patchesPerImage, setPatchesPerImage] = useState(1);

  // --- Training split ---
  const [segmentAll, setSegmentAll] = useState(false);
  const [trainN, setTrainN] = useState(3);
  const [validateN, setValidateN] = useState(2);
  const [testN, setTestN] = useState(0);
  const [trainFraction, setTrainFraction] = useState(0.7);
  const [valFraction, setValFraction] = useState(0.3);
  const [testFraction, setTestFraction] = useState(0.0);

  // --- Well filtering (for plates) ---
  const [wellFilterKey, setWellFilterKey] = useState("");
  const [wellFilterValues, setWellFilterValues] = useState("");
  const [wellFilters, setWellFilters] = useState({});
  const [wellFilterMode, setWellFilterMode] = useState("include");

  // --- State ---
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [existingTables, setExistingTables] = useState([]);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [imageChannelInfo, setImageChannelInfo] = useState(null);
  const [containerImages, setContainerImages] = useState([]);
  const [tableToDelete, setTableToDelete] = useState(null);

  // Parse container IDs from selection
  useEffect(() => {
    const ids = selectedContainers
      .map((sel) => {
        const parts = sel.split("-");
        return parts.length > 1 ? parseInt(parts[1], 10) : null;
      })
      .filter((id) => id !== null);
    setContainerIds(ids);

    // Check for existing tables and saved configs when container changes
    if (ids.length > 0) {
      checkExistingTables(ids[0]);
      loadContainerImages(ids[0]);
      loadAnnotateConfig(containerType, ids[0])
        .then((result) => setSavedConfigs(result.configs || []))
        .catch(() => setSavedConfigs([]));
    } else {
      setSavedConfigs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContainers]);

  // Load channel info from first image when container images are available
  useEffect(() => {
    if (containerImages.length > 0) {
      loadChannelInfo(containerImages[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerImages]);

  const applyConfigToForm = (cfg) => {
    setName(cfg.name || "annotation_workflow");
    if (cfg.study) {
      setStudyTitle(cfg.study.title || "");
      setStudyDescription(cfg.study.description || "");
      setOrganism(cfg.study.organism || "");
      setImagingMethod(cfg.study.imaging_method || "");
    }
    if (cfg.annotation_methodology) {
      setAnnotationType(
        cfg.annotation_methodology.annotation_type || "segmentation_mask",
      );
      setAnnotationMethod(
        cfg.annotation_methodology.annotation_method || "manual",
      );
      setAnnotationCriteria(
        cfg.annotation_methodology.annotation_criteria || "",
      );
    }
    if (cfg.omero) {
      setContainerType(cfg.omero.container_type || "dataset");
    }
    if (cfg.spatial_coverage) {
      const sc = cfg.spatial_coverage;
      setChannels(sc.channels || [0]);
      setLabelChannel(sc.label_channel ?? sc.channels?.[0] ?? 0);
      setZSlices(sc.z_slices || [0]);
      setZSliceMode(sc.z_slice_mode || "specific");
      setTimepoints(sc.timepoints || [0]);
      setTimepointMode(sc.timepoint_mode || "specific");
      setThreeD(sc.three_d || false);
      setUsePatches(sc.use_patches || false);
      setPatchSize(sc.patch_size || [512, 512]);
      setPatchesPerImage(sc.patches_per_image || 1);
    }
    if (cfg.training) {
      const tr = cfg.training;
      setSegmentAll(tr.segment_all || false);
      setTrainN(tr.train_n ?? 3);
      setValidateN(tr.validate_n ?? 2);
      setTestN(tr.test_n ?? 0);
      setTrainFraction(tr.train_fraction ?? 0.7);
      setValFraction(tr.validation_fraction ?? 0.3);
      setTestFraction(tr.test_fraction ?? 0.0);
    }
  };

  // Restore existing config if provided from parent
  useEffect(() => {
    if (existingConfig) applyConfigToForm(existingConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingConfig]);

  const checkExistingTables = async (containerId) => {
    try {
      const result = await listTrackingTables(containerType, containerId);
      setExistingTables(result.tables || []);
    } catch (e) {
      console.error("Error checking existing tables:", e);
    }
  };

  const loadContainerImages = async (containerId) => {
    try {
      const result = await getContainerImages(containerType, containerId);
      setContainerImages(result.images || []);
    } catch (e) {
      console.error("Error loading container images:", e);
    }
  };

  const loadChannelInfo = async (imageId) => {
    try {
      const info = await getAnnotateImageChannels(imageId);
      setImageChannelInfo(info);
      // Auto-set channels if not yet configured
      if (info.sizeC > 0 && channels.length === 1 && channels[0] === 0) {
        setChannels(Array.from({ length: info.sizeC }, (_, i) => i));
      }
    } catch (e) {
      console.error("Error loading channel info:", e);
    }
  };

  const addWellFilter = () => {
    if (!wellFilterKey || !wellFilterValues) return;
    const values = wellFilterValues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    setWellFilters({ ...wellFilters, [wellFilterKey]: values });
    setWellFilterKey("");
    setWellFilterValues("");
  };

  const removeWellFilter = (key) => {
    const newFilters = { ...wellFilters };
    delete newFilters[key];
    setWellFilters(newFilters);
  };

  const buildConfigData = () => {
    const primaryId = containerIds[0] || 0;
    return {
      name,
      study: {
        title: studyTitle || name,
        description: studyDescription || "",
        organism: organism || null,
        imaging_method: imagingMethod || null,
      },
      annotation_methodology: {
        annotation_type: annotationType,
        annotation_method: annotationMethod,
        annotation_criteria: annotationCriteria || "User-defined segmentation",
      },
      omero: {
        container_type: containerType,
        container_id: primaryId,
        container_ids: containerIds.length > 1 ? containerIds : null,
        well_filters: Object.keys(wellFilters).length > 0 ? wellFilters : null,
        well_filter_mode: wellFilterMode,
      },
      spatial_coverage: {
        channels,
        label_channel: labelChannel,
        timepoints,
        timepoint_mode: timepointMode,
        z_slices: zSlices,
        z_slice_mode: zSliceMode,
        three_d: threeD,
        use_patches: usePatches,
        patch_size: patchSize,
        patches_per_image: patchesPerImage,
        random_patches: true,
      },
      training: {
        segment_all: segmentAll,
        train_n: trainN,
        validate_n: validateN,
        test_n: testN,
        train_fraction: trainFraction,
        validation_fraction: valFraction,
        test_fraction: testFraction,
      },
      ai_model: {
        framework: "web_annotation",
        model_name: "manual",
        training_mode: "inference",
      },
    };
  };

  const handleValidateConfig = async () => {
    if (containerIds.length === 0) {
      toaster?.show({
        message: "Please select a container first",
        intent: "warning",
      });
      return;
    }
    // Collect validation issues
    const errors = [];
    const warnings = [];
    if (imageChannelInfo) {
      const badChannels = channels.filter((c) => c >= imageChannelInfo.sizeC);
      if (badChannels.length > 0)
        errors.push(`Channel indices out of range (max ${imageChannelInfo.sizeC - 1}): ${badChannels.join(", ")}`);
      if (labelChannel >= imageChannelInfo.sizeC)
        errors.push(`Segmentation channel ${labelChannel} exceeds available channels (0–${imageChannelInfo.sizeC - 1})`);
    }
    if (segmentAll) {
      const total = trainFraction + valFraction + testFraction;
      if (Math.abs(total - 1.0) > 0.01)
        warnings.push(`Fractions sum to ${(total * 100).toFixed(0)}%, not 100%`);
    } else {
      const total = trainN + validateN + testN;
      if (total > containerImages.length)
        warnings.push(`Requested ${total} images but container only has ${containerImages.length}`);
      if (trainN === 0)
        errors.push("Training image count must be at least 1");
    }
    if (errors.length > 0) {
      toaster?.show({
        message: `Validation failed: ${errors[0]}`,
        intent: "danger",
        timeout: 6000,
      });
      return;
    }
    setSaving(true);
    try {
      const configData = buildConfigData();
      await createAnnotateConfig(configData);
      const warningNote = warnings.length > 0 ? ` (warning: ${warnings[0]})` : "";
      toaster?.show({
        message: `Configuration valid and saved${warningNote}`,
        intent: warnings.length > 0 ? "warning" : "success",
        timeout: 5000,
      });
    } catch (e) {
      console.error("Error saving config:", e);
      toaster?.show({
        message: `Failed to save config: ${e.message}`,
        intent: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async (table) => {
    try {
      await deleteTrackingTable(table.id);
      setExistingTables((prev) => prev.filter((t) => t.id !== table.id));
      toaster?.show({ message: `Deleted table: ${table.name}`, intent: "success" });
    } catch (e) {
      toaster?.show({ message: `Failed to delete: ${e.message}`, intent: "danger" });
    } finally {
      setTableToDelete(null);
    }
  };

  const handleDeleteTable = async (table) => {
    try {
      await deleteTrackingTable(table.id);
      setExistingTables((prev) => prev.filter((t) => t.id !== table.id));
      toaster?.show({ message: `Deleted table: ${table.name}`, intent: "success" });
    } catch (e) {
      toaster?.show({ message: `Failed to delete: ${e.message}`, intent: "danger" });
    } finally {
      setTableToDelete(null);
    }
  };

  const handleInitialize = async () => {
    if (containerIds.length === 0) {
      toaster?.show({
        message: "Please select a container first",
        intent: "warning",
      });
      return;
    }
    setInitializing(true);
    try {
      const configData = buildConfigData();
      const result = await createTrackingTable(configData);
      if (result.success) {
        toaster?.show({
          message: `Tracking table created with ${result.units.length} processing units`,
          intent: "success",
        });
        onConfigCreated(
          configData,
          result.table_id,
          result.units,
          result.progress,
        );
      }
    } catch (e) {
      console.error("Error initializing:", e);
      const errMsg = e.response?.data?.error || e.message;
      toaster?.show({
        message: `Failed to initialize: ${errMsg}`,
        intent: "danger",
      });
    } finally {
      setInitializing(false);
    }
  };

  const handleLoadExistingTable = async (table) => {
    // Load existing table and switch to annotate tab
    toaster?.show({
      message: `Resuming from table: ${table.name}`,
      intent: "primary",
    });
    // We pass a minimal config and the existing table
    const configData = buildConfigData();
    onConfigCreated(configData, table.id, [], {
      total_units: 0,
      completed_units: 0,
      pending_units: 0,
      progress_percent: 0,
    });
  };

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="flex justify-between items-center">
        <H4>Configure FAIR Annotation Workflow</H4>
        <div className="flex gap-2">
          <Button
            icon="tick-circle"
            text="Validate Config"
            onClick={handleValidateConfig}
            loading={saving}
            disabled={containerIds.length === 0}
          />
          <Button
            intent="primary"
            icon="play"
            text="Initialize & Start"
            onClick={handleInitialize}
            loading={initializing}
            disabled={containerIds.length === 0}
          />
        </div>
      </div>

      {/* Data Source — full width, first */}
      <Card>
        <h5 className="bp5-heading mb-3">Data Source</h5>
        <div className="flex gap-4 items-start">
          <FormGroup label="Container Type" className="mb-0">
            <HTMLSelect
              value={containerType}
              onChange={(e) => {
                setContainerType(e.target.value);
                setSelectedContainers([]);
              }}
              options={[
                { label: "Dataset", value: "dataset" },
                { label: "Plate", value: "plate" },
              ]}
            />
          </FormGroup>
          <div className="flex-1">
            <DatasetSelectWithPopover
              label="Select Container"
              value={selectedContainers}
              onChange={setSelectedContainers}
              multiSelect={true}
              allowedCategories={
                containerType === "dataset" ? ["datasets"] : ["plates"]
              }
              buttonText={
                selectedContainers.length
                  ? `${selectedContainers.length} selected`
                  : "Select Container"
              }
            />
            {containerIds.length > 0 && (
              <div className="mt-1 text-sm text-gray-600">
                {selectedContainers
                  .map(
                    (id) =>
                      state?.omeroFileTreeData?.[id]?.data ||
                      id.replace(/^(dataset|plate)-/, ""),
                  )
                  .join(", ")}{" "}
                ({containerImages.length} images)
              </div>
            )}
          </div>
        </div>

        {/* Well filtering for plates */}
        {containerType === "plate" && (
          <div className="mt-3 border-t pt-3">
            <h6 className="bp5-heading mb-2">Well Filtering</h6>
            <div className="flex gap-2 mb-2">
              <InputGroup
                small
                placeholder="Key (e.g., cellline)"
                value={wellFilterKey}
                onChange={(e) => setWellFilterKey(e.target.value)}
              />
              <InputGroup
                small
                placeholder="Values (comma-separated)"
                value={wellFilterValues}
                onChange={(e) => setWellFilterValues(e.target.value)}
              />
              <Button
                small
                icon="add"
                onClick={addWellFilter}
                disabled={!wellFilterKey}
              />
            </div>
            <HTMLSelect
              small
              value={wellFilterMode}
              onChange={(e) => setWellFilterMode(e.target.value)}
              options={[
                { label: "Include matching", value: "include" },
                { label: "Exclude matching", value: "exclude" },
              ]}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(wellFilters).map(([key, values]) => (
                <Tag
                  key={key}
                  onRemove={() => removeWellFilter(key)}
                  intent="primary"
                >
                  {key}: {values.join(", ")}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Saved annotation configs */}
      {savedConfigs.length > 0 && (
        <Callout
          intent="success"
          icon="saved"
          title="Saved annotation configurations"
        >
          <p>
            Found {savedConfigs.length} saved config(s) for this container.
            Click one to restore all settings:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {savedConfigs.map((cfg, i) => (
              <Button
                key={i}
                small
                outlined
                icon="import"
                text={cfg.name || `Config ${i + 1}`}
                onClick={() => applyConfigToForm(cfg)}
              />
            ))}
          </div>
        </Callout>
      )}

      {/* Existing tables notice */}
      {existingTables.length > 0 && (
        <Callout
          intent="primary"
          icon="info-sign"
          title="Existing annotation tables found"
        >
          <p>
            Found {existingTables.length} existing table(s) on this container.
            Resume one or delete it to start fresh:
          </p>
          <div className="flex flex-col gap-2 mt-2">
            {existingTables.map((table) => (
              <div key={table.id} className="flex items-center gap-2">
                <Button
                  small
                  outlined
                  icon="repeat"
                  text={table.name}
                  onClick={() => handleLoadExistingTable(table)}
                />
                <Button
                  small
                  minimal
                  icon="trash"
                  intent="danger"
                  onClick={() => setTableToDelete(table)}
                />
              </div>
            ))}
          </div>
        </Callout>
      )}
      <Alert
        isOpen={tableToDelete !== null}
        onCancel={() => setTableToDelete(null)}
        onConfirm={() => handleDeleteTable(tableToDelete)}
        intent="danger"
        icon="trash"
        cancelButtonText="Cancel"
        confirmButtonText="Delete"
      >
        <p>
          Delete tracking table <strong>{tableToDelete?.name}</strong>? This
          cannot be undone.
        </p>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column: Workflow metadata + Annotation methodology */}
        <div className="flex flex-col gap-4">
          {/* Workflow metadata */}
          <Card>
            <h5 className="bp5-heading mb-3">Annotation Set Metadata</h5>
            <FormGroup label="Workflow Name" labelFor="wf-name">
              <InputGroup
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., nuclei_segmentation"
              />
            </FormGroup>
            <FormGroup label="Study Title" labelFor="study-title">
              <InputGroup
                id="study-title"
                value={studyTitle}
                onChange={(e) => setStudyTitle(e.target.value)}
                placeholder="e.g., HeLa cell nuclei annotation"
              />
            </FormGroup>
            <FormGroup label="Description" labelFor="study-desc">
              <TextArea
                id="study-desc"
                fill
                value={studyDescription}
                onChange={(e) => setStudyDescription(e.target.value)}
                placeholder="Describe the annotation study..."
              />
            </FormGroup>
            <div className="flex gap-4">
              <FormGroup label="Organism" className="flex-1">
                <InputGroup
                  value={organism}
                  onChange={(e) => setOrganism(e.target.value)}
                  placeholder="e.g., Homo sapiens"
                />
              </FormGroup>
              <FormGroup label="Imaging Method" className="flex-1">
                <InputGroup
                  value={imagingMethod}
                  onChange={(e) => setImagingMethod(e.target.value)}
                  placeholder="e.g., fluorescence microscopy"
                />
              </FormGroup>
            </div>
          </Card>

          {/* Annotation methodology */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h5 className="bp5-heading mb-0">Annotation Methodology</h5>
              <Button
                minimal
                small
                icon={showMethodology ? "chevron-up" : "chevron-down"}
                text={showMethodology ? "Hide" : "Show"}
                onClick={() => setShowMethodology(!showMethodology)}
              />
            </div>
            {!showMethodology && (
              <div className="text-xs text-gray-500 mt-1">
                Type: <strong>{annotationType.replace(/_/g, " ")}</strong> &middot; Method:{" "}
                <strong>{annotationMethod.replace(/_/g, " ")}</strong>
              </div>
            )}
            <Collapse isOpen={showMethodology}>
              <div className="mt-3">
                <FormGroup label="Annotation Type">
                  <HTMLSelect
                    value={annotationType}
                    onChange={(e) => setAnnotationType(e.target.value)}
                    options={[
                      { label: "Segmentation Mask", value: "segmentation_mask" },
                      { label: "Bounding Box", value: "bounding_box" },
                      { label: "Point", value: "point" },
                      { label: "Classification", value: "classification" },
                    ]}
                  />
                </FormGroup>
                <FormGroup label="Annotation Method">
                  <HTMLSelect
                    value={annotationMethod}
                    onChange={(e) => setAnnotationMethod(e.target.value)}
                    options={[
                      { label: "Manual", value: "manual" },
                      { label: "Semi-automatic", value: "semi_automatic" },
                      { label: "Automatic", value: "automatic" },
                    ]}
                  />
                </FormGroup>
                <FormGroup label="Annotation Criteria">
                  <TextArea
                    fill
                    value={annotationCriteria}
                    onChange={(e) => setAnnotationCriteria(e.target.value)}
                    placeholder="Describe what should be annotated and how..."
                  />
                </FormGroup>
              </div>
            </Collapse>
          </Card>
        </div>

        {/* Right column: Spatial + Training */}
        <div className="flex flex-col gap-4">
          {/* Spatial coverage */}
          <Card>
            <h5 className="bp5-heading mb-3">Spatial Coverage</h5>

            {/* Channels */}
            <FormGroup label="Channels" helperText="Channel indices to process">
              <InputGroup
                value={channels.join(", ")}
                onChange={(e) => {
                  const vals = e.target.value
                    .split(",")
                    .map((v) => parseInt(v.trim(), 10))
                    .filter((v) => !isNaN(v));
                  if (vals.length > 0) setChannels(vals);
                }}
                placeholder="0, 1, 2"
                intent={
                  imageChannelInfo &&
                  channels.some((c) => c >= imageChannelInfo.sizeC)
                    ? "danger"
                    : "none"
                }
              />
              {imageChannelInfo && (
                <div className="mt-1 text-xs text-gray-500">
                  Available:{" "}
                  {imageChannelInfo.channels
                    .map((ch) => `${ch.index}: ${ch.name}`)
                    .join(", ")}
                </div>
              )}
              {imageChannelInfo &&
                channels.some((c) => c >= imageChannelInfo.sizeC) && (
                  <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <Icon icon="warning-sign" size={10} />
                    Indices out of range (max {imageChannelInfo.sizeC - 1})
                  </div>
                )}
            </FormGroup>
            <FormGroup
              label="Segmentation Channel"
              helperText={
                imageChannelInfo
                  ? `Channel the model trains on to predict masks (0–${imageChannelInfo.sizeC - 1}${
                      imageChannelInfo.channels[labelChannel]
                        ? `: ${imageChannelInfo.channels[labelChannel].name}`
                        : ""
                    })`
                  : "Channel the model trains on to predict masks"
              }
            >
              <NumericInput
                value={labelChannel}
                onValueChange={setLabelChannel}
                min={0}
                max={imageChannelInfo?.sizeC - 1 || 10}
                intent={
                  imageChannelInfo && labelChannel >= imageChannelInfo.sizeC
                    ? "danger"
                    : "none"
                }
              />
            </FormGroup>

            {/* Z-slices */}
            <FormGroup label="Z-slice Mode">
              <HTMLSelect
                value={zSliceMode}
                onChange={(e) => setZSliceMode(e.target.value)}
                options={[
                  { label: "Specific", value: "specific" },
                  { label: "All", value: "all" },
                  { label: "Random", value: "random" },
                ]}
              />
            </FormGroup>
            {zSliceMode === "specific" && (
              <FormGroup label="Z-slices" helperText="Comma-separated indices">
                <InputGroup
                  value={zSlices.join(", ")}
                  onChange={(e) => {
                    const vals = e.target.value
                      .split(",")
                      .map((v) => parseInt(v.trim(), 10))
                      .filter((v) => !isNaN(v));
                    if (vals.length > 0) setZSlices(vals);
                  }}
                />
              </FormGroup>
            )}

            {/* Timepoints */}
            <FormGroup label="Timepoint Mode">
              <HTMLSelect
                value={timepointMode}
                onChange={(e) => setTimepointMode(e.target.value)}
                options={[
                  { label: "Specific", value: "specific" },
                  { label: "All", value: "all" },
                  { label: "Random", value: "random" },
                ]}
              />
            </FormGroup>
            {timepointMode === "specific" && (
              <FormGroup
                label="Timepoints"
                helperText="Comma-separated indices"
              >
                <InputGroup
                  value={timepoints.join(", ")}
                  onChange={(e) => {
                    const vals = e.target.value
                      .split(",")
                      .map((v) => parseInt(v.trim(), 10))
                      .filter((v) => !isNaN(v));
                    if (vals.length > 0) setTimepoints(vals);
                  }}
                />
              </FormGroup>
            )}

            {/* Advanced: 3D + Patches */}
            <Button
              minimal
              small
              icon={showAdvanced ? "chevron-up" : "chevron-down"}
              text="Advanced spatial settings"
              onClick={() => setShowAdvanced(!showAdvanced)}
            />
            <Collapse isOpen={showAdvanced}>
              <div className="mt-2 flex flex-col gap-2">
                <Switch
                  checked={threeD}
                  onChange={(e) => setThreeD(e.target.checked)}
                  label="3D Volumetric mode"
                />
                <Switch
                  checked={usePatches}
                  onChange={(e) => setUsePatches(e.target.checked)}
                  label="Use patches"
                />
                {usePatches && (
                  <>
                    <FormGroup label="Patch Size (W, H)">
                      <InputGroup
                        value={patchSize.join(", ")}
                        onChange={(e) => {
                          const vals = e.target.value
                            .split(",")
                            .map((v) => parseInt(v.trim(), 10))
                            .filter((v) => !isNaN(v));
                          if (vals.length >= 1) setPatchSize(vals.slice(0, 2));
                        }}
                      />
                    </FormGroup>
                    <FormGroup label="Patches per Image">
                      <NumericInput
                        value={patchesPerImage}
                        onValueChange={setPatchesPerImage}
                        min={1}
                        max={100}
                      />
                    </FormGroup>
                  </>
                )}
              </div>
            </Collapse>
          </Card>

          {/* Training split */}
          <Card>
            <h5 className="bp5-heading mb-3">Training Split</h5>
            <Switch
              checked={segmentAll}
              onChange={(e) => setSegmentAll(e.target.checked)}
              label="Segment all images (fraction-based split)"
            />

            {segmentAll ? (
              <div className="flex gap-4 mt-2">
                <FormGroup label="Train fraction" className="flex-1">
                  <NumericInput
                    value={trainFraction}
                    onValueChange={setTrainFraction}
                    min={0}
                    max={1}
                    stepSize={0.1}
                    minorStepSize={0.05}
                  />
                </FormGroup>
                <FormGroup label="Validation fraction" className="flex-1">
                  <NumericInput
                    value={valFraction}
                    onValueChange={setValFraction}
                    min={0}
                    max={1}
                    stepSize={0.1}
                    minorStepSize={0.05}
                  />
                </FormGroup>
                <FormGroup label="Test fraction" className="flex-1">
                  <NumericInput
                    value={testFraction}
                    onValueChange={setTestFraction}
                    min={0}
                    max={1}
                    stepSize={0.1}
                    minorStepSize={0.05}
                  />
                </FormGroup>
              </div>
            ) : (
              <div className="flex gap-4 mt-2">
                <FormGroup label="Training images" className="flex-1">
                  <NumericInput
                    value={trainN}
                    onValueChange={setTrainN}
                    min={1}
                    max={1000}
                  />
                </FormGroup>
                <FormGroup label="Validation images" className="flex-1">
                  <NumericInput
                    value={validateN}
                    onValueChange={setValidateN}
                    min={0}
                    max={1000}
                  />
                </FormGroup>
                <FormGroup label="Test images" className="flex-1">
                  <NumericInput
                    value={testN}
                    onValueChange={setTestN}
                    min={0}
                    max={1000}
                  />
                </FormGroup>
              </div>
            )}
          </Card>

          {/* Summary */}
          {containerIds.length > 0 && (
            <Card>
              <h5 className="bp5-heading mb-2">Summary</h5>
              <div className="text-sm space-y-1">
                <div>
                  <strong>Container:</strong>{" "}
                  {selectedContainers
                    .map(
                      (id) =>
                        state?.omeroFileTreeData?.[id]?.data ||
                        id.replace(/^(dataset|plate)-/, ""),
                    )
                    .join(", ")}
                </div>
                <div>
                  <strong>Images:</strong> {containerImages.length}
                </div>
                <div>
                  <strong>Channels:</strong> {channels.join(", ")} (label:{" "}
                  {labelChannel})
                </div>
                <div>
                  <strong>Z-slices:</strong>{" "}
                  {zSliceMode === "specific" ? zSlices.join(", ") : zSliceMode}
                </div>
                <div>
                  <strong>Timepoints:</strong>{" "}
                  {timepointMode === "specific"
                    ? timepoints.join(", ")
                    : timepointMode}
                </div>
                <div>
                  <strong>Split:</strong>{" "}
                  {segmentAll
                    ? `${(trainFraction * 100).toFixed(0)}% train / ${(valFraction * 100).toFixed(0)}% val / ${(testFraction * 100).toFixed(0)}% test`
                    : `${trainN} train / ${validateN} val / ${testN} test`}
                </div>
                {usePatches && (
                  <div>
                    <strong>Patches:</strong> {patchSize.join("x")}px,{" "}
                    {patchesPerImage}/image
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigureTab;
