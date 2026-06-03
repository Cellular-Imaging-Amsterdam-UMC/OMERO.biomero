import React, { useState, useEffect, useMemo, useRef } from "react";
import { InputGroup, FormGroup, Switch, Callout, Tooltip, Icon, Divider, Tag } from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";
import DatasetSelectWithPopover from "./DatasetSelectWithPopover.js";

const WorkflowOutput = ({ onSelectionChange, plateMode = false }) => {
  const { state, updateState } = useAppContext();
  const [renamePattern, setRenamePattern] = useState("{original_file}_result.{ext}");
  const [renameValidation, setRenameValidation] = useState({ hasError: false, hasWarning: false, message: "" });
  const renameInputRef = useRef(null);

  // Plate-mode helpers: auto-fill screen tracking, importer check, parent-screen finder
  const autoFilledForPlateId = useRef(null);
  const isImporterEnabled = !plateMode || (window.WEBCLIENT?.UI?.IMPORTER_ENABLED || false);
  const findParentScreen = (plateId, treeData) => {
    if (!plateId || !treeData) return null;
    const plateKey = `plate-${plateId}`;
    for (const [, node] of Object.entries(treeData)) {
      if (node.category === "screens" && node.children?.includes(plateKey)) return node;
    }
    return null;
  };

  const outputOptions = plateMode
    ? ["importAsZip", "uploadCsv", "attachFileOutputs", "selectedScreens"]
    : ["importAsZip", "uploadCsv", "attachToOriginalImages", "attachFileOutputs", "selectedDatasets"];

  const defaultValues = plateMode
    ? {
        receiveEmail: true,
        importAsZip: false,
        uploadCsv: false,
        attachFileOutputs: false,
        selectedScreens: [],
        selectedScreenId: null,
      }
    : {
        receiveEmail: true,
        importAsZip: false,
        uploadCsv: false,
        attachToOriginalImages: false,
        attachFileOutputs: false,
        selectedDatasets: [],
        selectedDatasetId: null,
        renamePattern: "{original_file}_result.{ext}",
        enableRename: false,
      };

  const hasOutputSelection = useMemo(() => outputOptions.some((opt) =>
    Array.isArray(state.formData?.[opt])
      ? state.formData[opt].length > 0
      : !!state.formData?.[opt]
  ), [state.formData]);

  // Orange warning: zip is on alongside other import options, causing duplicate storage.
  const hasOtherOutputsAlongWithZip = useMemo(() => {
    if (!state.formData.importAsZip) return false;
    if (plateMode) {
      return !!(
        state.formData.uploadCsv ||
        state.formData.attachFileOutputs ||
        (state.formData.selectedScreens?.length > 0)
      );
    }
    return !!(
      state.formData.uploadCsv ||
      state.formData.attachFileOutputs ||
      state.formData.attachToOriginalImages ||
      (state.formData.selectedDatasets?.length > 0)
    );
  }, [
    plateMode,
    state.formData.importAsZip,
    state.formData.uploadCsv,
    state.formData.attachFileOutputs,
    state.formData.attachToOriginalImages,
    state.formData.selectedDatasets,
    state.formData.selectedScreens,
  ]);

  const outputHints = useMemo(() => {
    const outputs = state.selectedWorkflow?.metadata?.outputs || [];
    const isType = (output, expected) => String(output?.type || "").toLowerCase() === expected;
    const isCsvTableOutput = (output) => {
      const type = String(output?.type || "").toLowerCase();
      if (!["measurement", "file"].includes(type)) return false;
      const formats = Array.isArray(output?.format)
        ? output.format
        : (output?.format ? [output.format] : []);
      return formats.map((fmt) => String(fmt).toLowerCase()).includes("csv");
    };
    const imageOutputs = outputs.filter((output) => isType(output, "image"));
    const measurementOutputs = outputs.filter((output) => isCsvTableOutput(output));
    // Zip is purely opt-in (bulk backup). No output type auto-enables it.
    const zipOutputs = [];
    // File annotation outputs: array/executable/any file (incl. .log) + non-CSV measurement.
    // The backend now excludes only the specific SLURM job log via skip_paths;
    // all other .log files (workflow run.log etc.) are attached normally.
    const fileAnnotationOutputs = outputs.filter((output) => {
      const type = String(output?.type || "").toLowerCase();
      if (["array", "executable", "file"].includes(type)) return true;
      if (type === "measurement") {
        // Non-CSV measurement (parquet, feather, etc.) → file annotation, not table
        const formats = Array.isArray(output?.format)
          ? output.format
          : (output?.format ? [output.format] : []);
        return !formats.map((f) => String(f).toLowerCase()).includes("csv");
      }
      return false;
    });

    const summarize = (items) => {
      const names = items.map((o) => o.name || o.id).filter(Boolean);
      if (names.length === 0) return "";
      const head = names.slice(0, 2).join(", ");
      return names.length > 2 ? `${head}, +${names.length - 2} more` : head;
    };
    // Full list — used in tooltips where there is space to show every item
    const summarizeFull = (items) =>
      items.map((o) => o.name || o.id).filter(Boolean).join(", ");

    return {
      imageCount: imageOutputs.length,
      measurementCount: measurementOutputs.length,
      zipCount: zipOutputs.length,
      fileAnnotationCount: fileAnnotationOutputs.length,
      imageLabel: summarize(imageOutputs),
      imageLabelFull: summarizeFull(imageOutputs),
      measurementLabel: summarize(measurementOutputs),
      measurementLabelFull: summarizeFull(measurementOutputs),
      zipLabel: summarize(zipOutputs),
      fileAnnotationLabel: summarize(fileAnnotationOutputs),
      fileAnnotationLabelFull: summarizeFull(fileAnnotationOutputs),
      importAsZip: zipOutputs.length > 0,
      uploadCsv: measurementOutputs.length > 0,
      attachFileOutputs: fileAnnotationOutputs.length > 0,
      hasImageOutput: imageOutputs.length > 0,
    };
  }, [state.selectedWorkflow?.metadata]);

  // suggested: workflow hint recommends this option on
  // label: short badge text (may be truncated with "+N more")
  // currentValue: current form state — undefined = untouched, false = explicitly disabled
  // labelFull: full untruncated list used in the tooltip (defaults to label)
  const renderDefaultCue = (suggested, label, currentValue = undefined, labelFull = label) => {
    if (!suggested) return null;
    const overridden = currentValue === false;
    return (
      <Tooltip
        content={overridden
          ? `Suggested for: ${labelFull}. You have turned this off.`
          : `Suggested for: ${labelFull}`}
        placement="top"
      >
        <Tag
          minimal
          round
          intent={overridden ? "warning" : "primary"}
          className="text-xs cursor-help"
        >
          {overridden ? "Suggested (off)" : "Suggested"}
        </Tag>
      </Tooltip>
    );
  };

  // currentValue: current form state — undefined = untouched, false = explicitly disabled
  const renderDefaultHelper = (suggested, suggestedMsg, fallback, currentValue = undefined) => {
    if (!suggested) return fallback;
    // When the overall form has a validation error, fall back to neutral text so
    // Blueprint's danger intent (red) has clear visual priority.
    if (!hasOutputSelection) return fallback;
    if (currentValue === false) {
      return <span className="text-orange-600">This is suggested for this workflow — re-enable to include these results.</span>;
    }
    return <span className="text-sky-700">{suggestedMsg}</span>;
  };

  useEffect(() => {
    if (plateMode) return;
    // Sync rename fields - if enableRename is false, ensure pattern gets sent as empty or default
    if (state.formData.enableRename === false) {
      // When rename is disabled, still keep the pattern but the boolean will control usage
      setRenamePattern(state.formData.renamePattern || defaultValues.renamePattern);
    }
  }, [state.formData.enableRename]);

  useEffect(() => {
    if (plateMode) return;
    // Auto-disable rename when the dataset destination is cleared
    if ((state.formData.selectedDatasets?.length ?? 0) === 0 && state.formData.enableRename) {
      handleFormDataUpdate({ enableRename: false });
    }
  }, [state.formData.selectedDatasets, plateMode]);

  useEffect(() => {
    if (plateMode) {
      // Plate mode: no rename validation — selection state is the only gate
      onSelectionChange?.(hasOutputSelection);
    } else {
      const hasValidationError = state.formData.enableRename && renameValidation.hasError;
      onSelectionChange?.(hasOutputSelection && !hasValidationError);
    }
  }, [plateMode, hasOutputSelection, renameValidation, state.formData.enableRename]);

  const autoFilledDatasets = useRef(false);

  useEffect(() => {
    if (plateMode) return;
    if (autoFilledDatasets.current) return;
    const inputs = state.inputDatasets || [];
    if (inputs.length === 0) return;
    const hasPlate = inputs.some((d) => d?.category === "plates");
    const allDatasets = inputs.every((d) => d?.category === "datasets");

    // Backward compatibility: never clear existing dataset target defaults here.
    // If inputs are not datasets, keep whatever is already selected.
    if (hasPlate || !allDatasets) return;

    // Only auto-populate once when all inputs are datasets and nothing chosen yet
    if (
      allDatasets &&
      (!state.formData.selectedDatasets ||
        state.formData.selectedDatasets.length === 0)
    ) {
      const inputDatasetNames = inputs.map((dataset) => dataset.data);
      // Also carry the OMERO ID when there is exactly one input dataset
      const autoId = inputs.length === 1 ? (inputs[0].id ?? null) : null;
      autoFilledDatasets.current = true;
      handleFormDataUpdate({
        selectedDatasets: inputDatasetNames,
        selectedDatasetId: autoId,
      });
    }
  }, [state.inputDatasets, plateMode]);

  // Plate-mode: auto-fill the parent screen once per plate ID
  useEffect(() => {
    if (!plateMode) return;
    const plateId = state.formData?.IDs?.[0];
    if (!plateId || !state.formData?.plateMode || !state.omeroFileTreeData) return;
    if (autoFilledForPlateId.current === plateId) return;
    if (state.formData.selectedScreens?.length > 0) {
      autoFilledForPlateId.current = plateId;
      return;
    }
    const parentScreen = findParentScreen(plateId, state.omeroFileTreeData);
    if (parentScreen) {
      autoFilledForPlateId.current = plateId;
      updateState({ formData: { ...state.formData, selectedScreens: [parentScreen.data], selectedScreenId: parentScreen.id } });
    }
  // NOTE: selectedScreens intentionally omitted — including it causes bounce-back when user clears.
  }, [plateMode, state.formData?.IDs, state.formData?.plateMode, state.omeroFileTreeData]);

  const validateRenamePattern = (pattern) => {
    
    if (pattern.trim() === "") {
      return { hasError: true, hasWarning: false, message: "Pattern cannot be empty" };
    }
    
    // Check for invalid variable names
    const validVariables = ['original_file', 'original_ext', 'file', 'ext'];
    const variablePattern = /\{([^}]+)\}/g;
    const foundVariables = [...pattern.matchAll(variablePattern)].map(match => match[1]);
    const invalidVariables = foundVariables.filter(v => !validVariables.includes(v));
    
    if (invalidVariables.length > 0) {
      return { 
        hasError: true, 
        hasWarning: false, 
        message: `Invalid variable(s): {${invalidVariables.join('}, {')}}. Use: {original_file}, {original_ext}, {file}, or {ext}` 
      };
    }
    
    // Check if pattern has any extension: {ext}, {original_ext}, or manual like .csv, .tiff
    const hasVariableExt = pattern.includes("{ext}") || pattern.includes("{original_ext}");
    const hasManualExt = /\.[a-zA-Z0-9]+/.test(pattern);
    
    if (!hasVariableExt && !hasManualExt) {
      return { hasError: false, hasWarning: true, message: "Consider adding an extension like .{ext} or .tiff" };
    }
    
    return { hasError: false, hasWarning: false, message: "" };
  };

  const handleInputChange = (key, value) => {
    // Compute new state immediately
    const updatedFormData = {
      ...state.formData,
      [key]: value,
    };

    updateState({ formData: updatedFormData });

  };

  // Atomic multi-key update — avoids stale-closure bug when updating related fields together
  const handleFormDataUpdate = (changes) => {
    const updatedFormData = { ...state.formData, ...changes };
    updateState({ formData: updatedFormData });
  };

  const handleRenamePatternChange = (e) => {
    const newValue = e.target.value;
    setRenamePattern(newValue);
    handleInputChange("renamePattern", newValue);
    
    // Validate pattern only if rename is enabled
    if (state.formData.enableRename) {
      const validation = validateRenamePattern(newValue);
      setRenameValidation(validation);
    }
    
    // Auto-enable rename if user edits pattern and it's currently disabled
    if (!state.formData.enableRename && newValue !== defaultValues.renamePattern) {
      handleInputChange("enableRename", true);
      // Validate after enabling
      const validation = validateRenamePattern(newValue);
      setRenameValidation(validation);
    }
  };

  const handleExampleClick = (pattern) => {
    setRenamePattern(pattern);

    // Validate pattern
    const validation = validateRenamePattern(pattern);
    setRenameValidation(validation);

    // Apply renamePattern + enableRename in a single update to avoid stale-closure clobber
    const updatedFormData = {
      ...state.formData,
      renamePattern: pattern,
      enableRename: true,
    };
    updateState({ formData: updatedFormData });

    // Focus the input after clicking example
    if (renameInputRef.current) {
      renameInputRef.current.focus();
    }
  };

  const handleRenameEnableChange = (checked) => {
    handleInputChange("enableRename", checked);
    if (checked) {
      // When enabling, make sure we have a valid pattern
      if (!renamePattern || renamePattern === "") {
        const defaultPattern = defaultValues.renamePattern;
        setRenamePattern(defaultPattern);
        handleInputChange("renamePattern", defaultPattern);
        // Validate the default pattern
        const validation = validateRenamePattern(defaultPattern);
        setRenameValidation(validation);
      } else {
        // Validate current pattern
        const validation = validateRenamePattern(renamePattern);
        setRenameValidation(validation);
      }
      // Focus the input field to draw attention
      setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
        }
      }, 100);
    } else {
      // Clear validation when disabled
      setRenameValidation({ hasError: false, hasWarning: false, message: "" });
    }
  };

  // Container (dataset / screen) selection helpers — shared across both modes
  const selectedContainers = plateMode ? state.formData.selectedScreens : state.formData.selectedDatasets;
  const selectedContainerId = plateMode ? state.formData.selectedScreenId : state.formData.selectedDatasetId;
  const containerCategory = plateMode ? "screens" : "datasets";
  const containerType = plateMode ? "screen" : "dataset";

  const handleContainerChange = (values, type) => {
    if (type === "manual") {
      const rawName = values.length
        ? values[values.length - 1].replace(/\s*\(ID:\s*\d+\)$/, "").trim()
        : "";
      const matchedNode = rawName
        ? Object.values(state.omeroFileTreeData || {}).find(
            (n) => n.category === containerCategory && n.data === rawName
          )
        : null;
      handleFormDataUpdate(
        plateMode
          ? { selectedScreens: rawName ? [rawName] : [], selectedScreenId: matchedNode?.id ?? null }
          : { selectedDatasets: rawName ? [rawName] : [], selectedDatasetId: matchedNode?.id ?? null }
      );
    } else {
      const node = state.omeroFileTreeData[values[0]];
      if (node) {
        handleFormDataUpdate(
          plateMode
            ? { selectedScreens: [node.data], selectedScreenId: node.id }
            : { selectedDatasets: [node.data], selectedDatasetId: node.id }
        );
      }
    }
  };

  return (
    <form>
      {/* ── Intro ────────────────────────────────────── */}
      <Callout
        className="mb-3 py-2 px-3"
      >
        <span className="text-sm">
          Choose how your workflow results are imported back into OMERO.
            You must select <strong>at least one output option</strong> below.
            <br />
            <Tag minimal round intent="primary" className="px-1">Suggested</Tag>
              options are recommended based on this workflow's declared outputs — you can always override them.
        </span>
      </Callout>


      {plateMode && !isImporterEnabled && (
        <Callout intent="danger" className="mb-4">
          <strong>Plate workflows require importer integration</strong>
          <br />
          Plate workflows with ZARR outputs are only supported when IMPORTER_ENABLED=true.
          Please contact your administrator to enable importer integration.
        </Callout>
      )}

      {/* Sticky Validation Messages */}
      <div className="sticky top-0 z-10">
        {!hasOutputSelection && (
          <Callout intent="danger" className="mb-2 bg-red-50 border-red-200">
            <strong>Please select at least one output option below</strong>
          </Callout>
        )}

        {!plateMode && state.formData.enableRename && renameValidation.message && (
          <Callout
            intent={renameValidation.hasError ? "danger" : "warning"}
            className={`mb-2 ${renameValidation.hasError ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}
          >
            <strong>Rename Pattern:</strong> {renameValidation.message}
          </Callout>
        )}
      </div>

      {/* ── Notifications ─────────────────────────────── */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-2">Notifications</p>
      {(() => {
        const _emailChecked = state.formData.receiveEmail ?? defaultValues.receiveEmail;
        return (
          <div className={`flex items-start justify-between gap-3 border rounded p-3 mb-4 transition-colors ${_emailChecked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="flex items-start gap-2">
              <Icon icon="envelope" size={16} className={`mt-0.5 shrink-0 ${_emailChecked ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <span className="text-sm font-semibold">Email on completion</span>
                <p className="text-xs text-gray-500 mt-0.5">Receive an email from SLURM when one or more jobs finish (completed or failed).</p>
              </div>
            </div>
            <Switch
              id="email-notification"
              checked={_emailChecked}
              onChange={(e) => handleInputChange("receiveEmail", e.target.checked)}
              className="shrink-0 mt-0.5"
            />
          </div>
        );
      })()}

      <Divider className="my-3" />

      {/* ── Workflow Results ───────────────────────────── */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Workflow Results</p>
      <p className="text-xs text-gray-500 mb-3">
        Select <strong className={hasOutputSelection ? "" : "text-red-500"}>one or more</strong> options for how
        the workflow output is imported into OMERO.
      </p>

      <div className="flex flex-col gap-2">
        {/* ① Bulk ZIP */}
        {(() => {
          const _checked = state.formData.importAsZip ?? outputHints.importAsZip ?? defaultValues.importAsZip;
          const _border = !hasOutputSelection ? 'border-red-300 bg-white' : _checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300';
          return (
            <div
              className={`border rounded p-3 transition-colors cursor-pointer ${_border}`}
              onClick={() => handleInputChange("importAsZip", !_checked)}
            >
              <div className="flex items-start gap-3">
                <Icon icon="compressed" size={16} className={`mt-0.5 shrink-0 ${_checked ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Bulk ZIP archive</span>
                      {renderDefaultCue(outputHints.importAsZip, outputHints.zipLabel)}
                    </div>
                    <Tooltip
                      content={outputHints.zipCount > 0
                        ? `This workflow declares archive output(s): ${outputHints.zipLabel}. Zip export is suggested.`
                        : "Attach a bulk zip of all results — useful as a backup or for bulk download."}
                      placement="top"
                    >
                      <Switch
                        id="upload-zip-options"
                        checked={_checked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleInputChange("importAsZip", e.target.checked)}
                        className="shrink-0 mt-0"
                        intent={hasOutputSelection ? "" : "danger"}
                      />
                    </Tooltip>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Attaches a single zip of all results to the parent dataset/project.
                    {hasOtherOutputsAlongWithZip && (
                      <span className="block mt-1 text-orange-600">
                        ⚠ Other output options are also active — the zip will contain all those files too, duplicating storage.
                        Use it as a standalone backup or disable the other options if you only need the archive.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ② CSV → OMERO Tables */}
        {(() => {
          const _checked = state.formData.uploadCsv ?? outputHints.uploadCsv ?? defaultValues.uploadCsv;
          const _border = !hasOutputSelection ? 'border-red-300 bg-white' : _checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300';
          return (
            <div
              className={`border rounded p-3 transition-colors cursor-pointer ${_border}`}
              onClick={() => handleInputChange("uploadCsv", !_checked)}
            >
              <div className="flex items-start gap-3">
                <Icon icon="th" size={16} className={`mt-0.5 shrink-0 ${_checked ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">CSV → OMERO Tables</span>
                      {renderDefaultCue(outputHints.uploadCsv, outputHints.measurementLabel, state.formData.uploadCsv, outputHints.measurementLabelFull)}
                    </div>
                    <Switch
                      id="upload-csv-options"
                      checked={_checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleInputChange("uploadCsv", e.target.checked)}
                      className="shrink-0 mt-0"
                      intent={hasOutputSelection ? "" : "danger"}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {renderDefaultHelper(
                      outputHints.measurementCount > 0,
                      `Suggested for: ${outputHints.measurementLabel}. Uploads CSV measurements as interactive OMERO tables.`,
                      "Upload CSV measurement results as interactive OMERO tables for further analysis.",
                      state.formData.uploadCsv
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ③ Attach to input images (dataset mode only) */}
        {!plateMode && (() => {
          const _checked = state.formData.attachToOriginalImages ?? defaultValues.attachToOriginalImages;
          const _border = !hasOutputSelection ? 'border-red-300 bg-white' : _checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300';
          const hasDestination = (selectedContainers?.length ?? 0) > 0;
          const hasDuplicateImages = _checked && hasDestination;
          return (
            <div
              className={`border rounded p-3 transition-colors cursor-pointer ${_border}`}
              onClick={() => handleInputChange("attachToOriginalImages", !_checked)}
            >
              <div className="flex items-start gap-3">
                <Icon icon="link" size={16} className={`mt-0.5 shrink-0 ${_checked ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Attach to input images</span>
                      {renderDefaultCue(outputHints.imageCount > 0, outputHints.imageLabel, state.formData.attachToOriginalImages, outputHints.imageLabelFull)}
                    </div>
                    <Switch
                      id="upload-images-options"
                      checked={_checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleInputChange("attachToOriginalImages", e.target.checked)}
                      className="shrink-0 mt-0"
                      intent={hasOutputSelection ? "" : "danger"}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Attach output images (e.g. masks) to the original input images to track their provenance.
                  </p>
                  {hasDuplicateImages && (
                    <p className="mt-1 text-xs text-orange-600">
                      ⚠ A {containerType} destination is also selected — image results will be imported twice.
                      Consider using only the {containerType} destination below instead.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ④ Individual file annotations */}
        {(() => {
          const _checked = state.formData.attachFileOutputs ?? outputHints.attachFileOutputs ?? defaultValues.attachFileOutputs;
          const _border = !hasOutputSelection ? 'border-red-300 bg-white' : _checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300';
          return (
            <div
              className={`border rounded p-3 transition-colors cursor-pointer ${_border}`}
              onClick={() => handleInputChange("attachFileOutputs", !_checked)}
            >
              <div className="flex items-start gap-3">
                <Icon icon="paperclip" size={16} className={`mt-0.5 shrink-0 ${_checked ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Individual file annotations</span>
                      {renderDefaultCue(outputHints.attachFileOutputs, outputHints.fileAnnotationLabel, state.formData.attachFileOutputs, outputHints.fileAnnotationLabelFull)}
                    </div>
                    <Switch
                      id="attach-file-outputs"
                      checked={_checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleInputChange("attachFileOutputs", e.target.checked)}
                      className="shrink-0 mt-0"
                      intent={hasOutputSelection ? "" : "danger"}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {renderDefaultHelper(
                      outputHints.fileAnnotationCount > 0,
                      `Suggested for: ${outputHints.fileAnnotationLabel}. Each non-image, non-CSV file is attached as its own OMERO annotation. CSV outputs go to OMERO Tables above.`,
                      "Attach non-image, non-CSV output files (arrays, configs, model weights, log files) as individual OMERO file annotations. CSV files are handled by the OMERO tables option above.",
                      state.formData.attachFileOutputs
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
        {/* ⑤ Dataset / Screen destination */}
        {(() => {
          const hasDestination = (selectedContainers?.length ?? 0) > 0;
          const _border = !hasOutputSelection
            ? 'border-red-300 bg-white'
            : hasDestination
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300';
          return (
            <div className={`border rounded p-3 transition-colors ${_border}`}>
              <div className="flex items-start gap-3 mb-2">
                <Icon icon="media" size={16} className={`mt-0.5 shrink-0 ${hasDestination ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">Add (mask) image results to a {containerType}</span>
                    {renderDefaultCue(
                      outputHints.hasImageOutput || (plateMode ? autoFilledForPlateId.current !== null : autoFilledDatasets.current),
                      outputHints.imageLabel || containerType,
                      hasDestination ? undefined : false,
                      outputHints.imageLabelFull || `${containerType} destination`
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Organizes output images and masks in an OMERO {containerType} for viewing and further analysis.
                  </p>
                </div>
              </div>
              <DatasetSelectWithPopover
                label={null}
                helperText={`Type a new ${containerType} name and press Enter, or pick an existing one from the menu.`}
                subLabel={null}
                tooltip={`Select the OMERO ${containerType} for your workflow results.`}
                buttonText={plateMode ? "Select Screen" : "Select Dataset"}
                placeholder={`Add new ${containerType} name or select...`}
                value={(selectedContainers || []).map((name) => {
                  return selectedContainerId ? `${name} (ID: ${selectedContainerId})` : name;
                })}
                onChange={handleContainerChange}
                multiSelect={false}
                intent={hasOutputSelection ? "" : "danger"}
                allowedCategories={[containerCategory]}
                tagProps={(val) => {
                  const isKnown = /\(ID:\s*\d+\)/.test(String(val));
                  if (isKnown) return {};
                  return {
                    intent: "warning",
                    rightIcon: "help",
                    title: `New name — OMERO will create a new ${containerType} with this name when the workflow runs. To use an existing ${containerType} instead, select it from the menu.`,
                  };
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* ── Rename result images (dataset mode only) ───── */}
      {!plateMode && (() => {
        const _enabled = state.formData.enableRename ?? defaultValues.enableRename;
        const _hasDataset = (state.formData.selectedDatasets?.length ?? 0) > 0;
        const _disabled = !_hasDataset;
        const _hasError = _enabled && renameValidation.hasError;
        const _border = _hasError
          ? 'border-red-400 bg-red-50'
          : _enabled
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300';
        return (
          <div className="mt-1 ml-5 border-l-2 border-blue-100 pl-3">
            <div
              className={`border rounded p-3 transition-colors ${_border} ${_disabled ? 'opacity-50' : ''}`}
            >
          <div className="flex items-start gap-3">
            <Icon icon="edit" size={16} className={`mt-0.5 shrink-0 ${_enabled ? (_hasError ? 'text-red-500' : 'text-blue-600') : 'text-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-sm font-semibold">Rename result images</span>
                  <p className="text-xs text-gray-500 mt-0.5">Apply a custom naming pattern to imported result images.</p>
                </div>
                <Switch
                  id="image-renaming-switch"
                  checked={_enabled}
                  onChange={(e) => handleRenameEnableChange(e.target.checked)}
                  disabled={_disabled}
                  className="shrink-0 mt-0"
                />
              </div>
              <FormGroup
                label="Pattern"
                labelFor="image-renaming-pattern"
                helperText={
                  <>
                    <div>
                      <strong>Input variables:</strong> <code>{"{original_file}"}</code> (filename without extension), <code>{"{original_ext}"}</code> (extension)
                    </div>
                    <div>
                      <strong>Result variables:</strong> <code>{"{file}"}</code> (result filename without extension), <code>{"{ext}"}</code> (result extension)
                    </div>
                    <div className="mt-2"><strong>Examples — click to use:</strong></div>
                    <ul className="list-disc list-inside mt-1 text-xs ml-4">
                      <li>
                        <code
                          className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                          onClick={() => handleExampleClick("{original_file}_mask.{ext}")}
                          title="Click to use this pattern"
                        >
                          {"{original_file}_mask.{ext}"}
                        </code> → original name + result extension
                      </li>
                      <li>
                        <code
                          className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                          onClick={() => handleExampleClick("{file}_processed.{original_ext}")}
                          title="Click to use this pattern"
                        >
                          {"{file}_processed.{original_ext}"}
                        </code> → result name + original extension
                      </li>
                      <li>
                        <code
                          className="cursor-pointer hover:bg-blue-100 px-1 rounded"
                          onClick={() => handleExampleClick("analysis_{original_file}.tif")}
                          title="Click to use this pattern"
                        >
                          {"analysis_{original_file}.tif"}
                        </code> → custom prefix + original name + fixed extension
                      </li>
                    </ul>
                  </>
                }
                disabled={_disabled}
              >
                <InputGroup
                  id="image-renaming-pattern"
                  inputRef={renameInputRef}
                  value={renamePattern}
                  onChange={handleRenamePatternChange}
                  fill={true}
                  disabled={_disabled}
                  intent={renameValidation.hasError ? "danger" : (renameValidation.hasWarning ? "warning" : "none")}
                />
              </FormGroup>
            </div>
          </div>
            </div>
          </div>
        );
      })()}
    </form>
  );
};

export default WorkflowOutput;
