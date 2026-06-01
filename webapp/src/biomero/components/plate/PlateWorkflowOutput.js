import React, { useEffect, useMemo, useRef } from "react";
import { FormGroup, Switch, Callout, DialogBody, Tooltip, Icon } from "@blueprintjs/core";
import { useAppContext } from "../../../AppContext";
import DatasetSelectWithPopover from "../DatasetSelectWithPopover.js";

const PlateWorkflowOutput = ({ onSelectionChange }) => {
  const { state, updateState } = useAppContext();

  const outputOptions = ["importAsZip", "uploadCsv", "attachFileOutputs", "selectedScreens"];

  const hasOutputSelection = useMemo(() => outputOptions.some((opt) =>
    Array.isArray(state.formData?.[opt])
      ? state.formData[opt].length > 0
      : !!state.formData?.[opt]
  ), [state.formData]);

  // Orange warning: zip is on alongside other import options, causing duplicate storage.
  const hasOtherOutputsAlongWithZip = useMemo(() => {
    if (!state.formData.importAsZip) return false;
    return !!(
      state.formData.uploadCsv ||
      state.formData.attachFileOutputs ||
      (state.formData.selectedScreens?.length > 0)
    );
  }, [
    state.formData.importAsZip,
    state.formData.uploadCsv,
    state.formData.attachFileOutputs,
    state.formData.selectedScreens,
  ]);

  const isImporterEnabled = window.WEBCLIENT?.UI?.IMPORTER_ENABLED || false;

  const findParentScreen = (plateId, omeroFileTreeData) => {
    if (!plateId || !omeroFileTreeData) return null;

    const plateKey = `plate-${plateId}`;
    for (const [, node] of Object.entries(omeroFileTreeData)) {
      if (node.category === "screens" && node.children?.includes(plateKey)) {
        return node;
      }
    }
    return null;
  };

  const defaultValues = {
    receiveEmail: true,
    importAsZip: false,
    uploadCsv: false,
    attachFileOutputs: false,
    selectedScreens: [],
    selectedScreenId: null,
  };

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
        const formats = Array.isArray(output?.format)
          ? output.format
          : (output?.format ? [output.format] : []);
        return !formats.map((f) => String(f).toLowerCase()).includes("csv");
      }
      return false;
    });

    const summarize = (items) => {
      const names = items.map((output) => output.name || output.id).filter(Boolean);
      if (names.length === 0) return "";
      const head = names.slice(0, 2).join(", ");
      return names.length > 2 ? `${head}, +${names.length - 2} more` : head;
    };
    // Full list — used in tooltips where there is space to show every item
    const summarizeFull = (items) =>
      items.map((o) => o.name || o.id).filter(Boolean).join(", ");

    return {
      measurementCount: measurementOutputs.length,
      zipCount: zipOutputs.length,
      imageCount: imageOutputs.length,
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
    // When the overall form has a validation error (nothing selected), suppress
    // suggestion indicators so the red error message has clear visual priority.
    if (!hasOutputSelection) return null;
    const overridden = currentValue === false;
    return (
      <Tooltip
        content={overridden
          ? `This option is suggested for: ${labelFull}. You have turned it off.`
          : `Suggested for: ${labelFull}. You can switch it off.`}
        placement="top"
      >
        <span className={`inline-flex items-center gap-1 text-xs cursor-help ${overridden ? "text-orange-600" : "text-sky-700"}`}>
          <Icon icon={overridden ? "warning-sign" : "info-sign"} size={12} />
          <span>{overridden ? "Suggestion overridden" : `Suggested for ${label}`}</span>
        </span>
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
    onSelectionChange(hasOutputSelection);
  }, [hasOutputSelection, onSelectionChange]);

  // Track whether we have already auto-filled the screen for the current plate, so the
  // user can clear the selection without it bouncing back immediately.
  const autoFilledForPlateId = useRef(null);

  useEffect(() => {
    const plateId = state.formData?.IDs?.[0];
    if (!plateId || !state.formData?.plateMode || !state.omeroFileTreeData) return;

    // Only auto-fill once per plate ID — respect user-cleared selections after that
    if (autoFilledForPlateId.current === plateId) return;

    if (state.formData.selectedScreens?.length > 0) {
      // Selection already exists; mark this plate as handled and stop
      autoFilledForPlateId.current = plateId;
      return;
    }

    const parentScreen = findParentScreen(plateId, state.omeroFileTreeData);
    if (parentScreen) {
      autoFilledForPlateId.current = plateId;
      updateState({
        formData: {
          ...state.formData,
          selectedScreens: [parentScreen.data],
          selectedScreenId: parentScreen.id,
        },
      });
    }
  // NOTE: selectedScreens intentionally omitted from deps — including it would cause
  // the effect to re-run and re-fill after the user clears the selection.
  }, [state.formData?.IDs, state.formData?.plateMode, state.omeroFileTreeData]);

  const handleInputChange = (key, value) => {
    updateState({
      formData: {
        ...state.formData,
        [key]: value,
      },
    });
  };

  const handleFormDataUpdate = (changes) => {
    updateState({
      formData: {
        ...state.formData,
        ...changes,
      },
    });
  };

  return (
    <DialogBody>
      <form>
        <h2>Output Options</h2>

        {!isImporterEnabled && (
          <Callout intent="danger" className="mb-4">
            <strong>Plate workflows require importer integration</strong>
            <br />
            Plate workflows with ZARR outputs are only supported when IMPORTER_ENABLED=true.
            Please contact your administrator to enable importer integration.
          </Callout>
        )}

        <div className="sticky top-0 z-10">
          {!hasOutputSelection && (
            <Callout intent="danger" className="mb-2 bg-red-50 border-red-200">
              <strong>Please select at least one output option below</strong>
            </Callout>
          )}
        </div>

        <FormGroup
          label="Receive E-mail on Completion?"
          labelFor="email-notification"
          helperText="Receive an email from SLURM when one or more jobs finish (completed or failed)."
        >
          <Switch
            id="email-notification"
            checked={state.formData.receiveEmail ?? defaultValues.receiveEmail}
            onChange={(e) => handleInputChange("receiveEmail", e.target.checked)}
          />
        </FormGroup>

        <FormGroup
          label="How would you like to add the workflow results to OMERO?"
          labelFor="import-options"
          subLabel={
            <span>
              Select <strong className={hasOutputSelection ? "" : "font-bold text-red-500"}>one or more</strong>{" "}
              options below for how you want the data resulting from this workflow imported back into OMERO
            </span>
          }
          intent={hasOutputSelection ? "" : "danger"}
        >
          <FormGroup
            label={
              <span className="inline-flex items-center gap-2">
                <Tooltip
                  content={outputHints.zipCount > 0
                    ? `This workflow declares archive/log output(s) (${outputHints.zipLabel}), so zip export is enabled by default.`
                    : "Attach a bulk zip of all results to the parent screen/plate — useful as a backup or to download everything at once."}
                  placement="top"
                >
                  <span>Add all results as a bulk zip archive (backup / download-all).</span>
                </Tooltip>
                {renderDefaultCue(outputHints.importAsZip, outputHints.zipLabel)}
              </span>
            }
            labelFor="upload-zip-options"
            helperText={
              hasOtherOutputsAlongWithZip
                ? <span className="text-orange-600">Other output options are also active — the zip will contain all those files too, duplicating storage. Use it as a standalone backup, or disable the other options if you only need the archive.</span>
                : "Bulk backup archive: attaches a single zip of all results. Use individual file annotations for finer-grained access."
            }
            intent={hasOutputSelection ? "" : "danger"}
          >
            <Switch
              id="upload-zip-options"
              checked={state.formData.importAsZip ?? outputHints.importAsZip ?? defaultValues.importAsZip}
              onChange={(e) => handleInputChange("importAsZip", e.target.checked)}
              intent={hasOutputSelection ? "" : "danger"}
            />
          </FormGroup>

          <FormGroup
            label={
              <span className="inline-flex items-center gap-2">
                <Tooltip
                  content={outputHints.measurementCount > 0
                    ? `This workflow declares CSV measurement output(s): ${outputHints.measurementLabelFull}. Importing them as OMERO tables is suggested.`
                    : "Upload CSV measurement results as interactive OMERO tables for further analysis."}
                  placement="top"
                >
                  <span>Add CSV measurement results as OMERO tables.</span>
                </Tooltip>
                {renderDefaultCue(outputHints.uploadCsv, outputHints.measurementLabel, state.formData.uploadCsv, outputHints.measurementLabelFull)}
              </span>
            }
            labelFor="upload-csv-options"
            helperText={renderDefaultHelper(
              outputHints.measurementCount > 0,
              `Suggested for workflow output(s): ${outputHints.measurementLabel}. Switch it off if you do not need OMERO tables for those results.`,
              "Upload CSV measurement results as interactive OMERO tables for further analysis.",
              state.formData.uploadCsv
            )}
            intent={hasOutputSelection ? "" : "danger"}
          >
            <Switch
              id="upload-csv-options"
              checked={state.formData.uploadCsv ?? outputHints.uploadCsv ?? defaultValues.uploadCsv}
              onChange={(e) => handleInputChange("uploadCsv", e.target.checked)}
              intent={hasOutputSelection ? "" : "danger"}
            />
          </FormGroup>

          {/* Non-image file outputs as individual file annotations */}
          <FormGroup
            label={
              <span className="inline-flex items-center gap-2">
                <Tooltip
                  content={outputHints.fileAnnotationCount > 0
                    ? `This workflow declares non-image output(s): ${outputHints.fileAnnotationLabelFull}. Each is attached as an individual OMERO file annotation.`
                    : "Attach individual non-image, non-CSV output files (e.g. NumPy arrays, model weights, JSON configs, log files) as OMERO file annotations."}
                  placement="top"
                >
                  <span>Attach individual non-image output files as annotations.</span>
                </Tooltip>
                {renderDefaultCue(outputHints.attachFileOutputs, outputHints.fileAnnotationLabel, state.formData.attachFileOutputs, outputHints.fileAnnotationLabelFull)}
              </span>
            }
            labelFor="attach-file-outputs"
            helperText={renderDefaultHelper(
              outputHints.fileAnnotationCount > 0,
              `Suggested for workflow output(s): ${outputHints.fileAnnotationLabel}. Each file is attached as its own OMERO annotation. CSV outputs are handled separately by the OMERO tables option above and are not attached here.`,
              "Attach non-image, non-CSV output files (arrays, configs, model weights, log files) as individual OMERO file annotations. CSV files are handled by the OMERO tables option above.",
              state.formData.attachFileOutputs
            )}
            intent={hasOutputSelection ? "" : "danger"}
          >
            <Switch
              id="attach-file-outputs"
              checked={state.formData.attachFileOutputs ?? outputHints.attachFileOutputs ?? defaultValues.attachFileOutputs}
              onChange={(e) => handleInputChange("attachFileOutputs", e.target.checked)}
              intent={hasOutputSelection ? "" : "danger"}
            />
          </FormGroup>

          <DatasetSelectWithPopover
            label={
              <span className="inline-flex items-center gap-2">
                <Tooltip
                  content={outputHints.hasImageOutput
                    ? `This workflow declares image/mask output(s): ${outputHints.imageLabelFull}. Organizing them in a screen is suggested.`
                    : "Organize output images and masks in an OMERO screen for viewing and further analysis."}
                  placement="top"
                >
                  <span>Add image/mask results to a new or existing screen.</span>
                </Tooltip>
                {renderDefaultCue(
                  outputHints.hasImageOutput,
                  outputHints.imageLabel,
                  state.formData.selectedScreens?.length > 0 ? true : false,
                  outputHints.imageLabelFull
                )}
              </span>
            }
            helperText={renderDefaultHelper(
              outputHints.hasImageOutput,
              `Suggested for workflow output(s): ${outputHints.imageLabel}.`,
              "Organize output images and masks in an OMERO screen for viewing and further analysis.",
              state.formData.selectedScreens?.length > 0 ? true : false
            )}
            subLabel="Type a new screen name and press Enter, or pick an existing one from the menu."
            tooltip="Select the OMERO screen for your workflow results."
            buttonText="Select Screen"
            placeholder="Add new screen name or select..."
            value={(state.formData.selectedScreens || []).map((name) => {
              const id = state.formData.selectedScreenId;
              return id ? `${name} (ID: ${id})` : name;
            })}
            onChange={(values, type) => {
              if (type === "manual") {
                const rawName = values.length
                  ? values[values.length - 1].replace(/\s*\(ID:\s*\d+\)$/, '').trim()
                  : '';
                const matchedScreen = rawName
                  ? Object.values(state.omeroFileTreeData || {}).find(
                      (n) => n.category === "screens" && n.data === rawName
                    )
                  : null;
                handleFormDataUpdate({
                  selectedScreens: rawName ? [rawName] : [],
                  selectedScreenId: matchedScreen ? matchedScreen.id : null,
                });
              } else {
                const screenNode = state.omeroFileTreeData[values[0]];
                if (screenNode) {
                  handleFormDataUpdate({
                    selectedScreens: [screenNode.data],
                    selectedScreenId: screenNode.id,
                  });
                }
              }
            }}
            multiSelect={false}
            intent={hasOutputSelection ? "" : "danger"}
            allowedCategories={["screens"]}
            tagProps={(val) => {
              const isKnown = /\(ID:\s*\d+\)/.test(String(val));
              if (isKnown) return {};
              return {
                intent: "warning",
                rightIcon: "help",
                title: "New name — OMERO will create a new screen with this name when the workflow runs. To use an existing screen instead, select it from the menu.",
              };
            }}
          />
        </FormGroup>
      </form>
    </DialogBody>
  );
};

export default PlateWorkflowOutput;
