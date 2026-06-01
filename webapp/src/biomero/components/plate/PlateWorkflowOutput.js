import React, { useEffect, useMemo } from "react";
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

    return {
      measurementCount: measurementOutputs.length,
      zipCount: zipOutputs.length,
      imageCount: imageOutputs.length,
      fileAnnotationCount: fileAnnotationOutputs.length,
      imageLabel: summarize(imageOutputs),
      measurementLabel: summarize(measurementOutputs),
      zipLabel: summarize(zipOutputs),
      fileAnnotationLabel: summarize(fileAnnotationOutputs),
      importAsZip: zipOutputs.length > 0,
      uploadCsv: measurementOutputs.length > 0,
      attachFileOutputs: fileAnnotationOutputs.length > 0,
      hasImageOutput: imageOutputs.length > 0,
    };
  }, [state.selectedWorkflow?.metadata]);

  const renderDefaultCue = (enabled, label) => enabled ? (
    <Tooltip content={`Enabled by default for: ${label}. You can switch it off.`} placement="top">
      <span className="inline-flex items-center gap-1 text-xs text-sky-700 cursor-help">
        <Icon icon="info-sign" size={12} />
        <span>Default for {label}</span>
      </span>
    </Tooltip>
  ) : null;

  const renderDefaultHelper = (enabled, message, fallback) => enabled
    ? <span className="text-sky-700">{message}</span>
    : fallback;

  useEffect(() => {
    onSelectionChange(hasOutputSelection);
  }, [hasOutputSelection, onSelectionChange]);

  useEffect(() => {
    if (
      state.formData?.IDs?.length > 0 &&
      state.formData?.plateMode &&
      state.omeroFileTreeData &&
      (!state.formData.selectedScreens || state.formData.selectedScreens.length === 0)
    ) {
      const plateId = state.formData.IDs[0];
      const parentScreen = findParentScreen(plateId, state.omeroFileTreeData);

      if (parentScreen) {
        updateState({
          formData: {
            ...state.formData,
            selectedScreens: [parentScreen.data],
            selectedScreenId: parentScreen.id,
          },
        });
      }
    }
  }, [state.formData?.IDs, state.formData?.plateMode, state.omeroFileTreeData, state.formData.selectedScreens]);

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
            helperText={renderDefaultHelper(
              outputHints.zipCount > 0,
              `Turned on for workflow output(s): ${outputHints.zipLabel}. This is a bulk backup — individual files are better handled via the file-annotations option below.`,
              "Bulk backup archive: attaches a single zip of all results. Use individual file annotations for finer-grained access."
            )}
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
                    ? `This workflow declares measurement output(s) (${outputHints.measurementLabel}), so CSV table import is enabled by default.`
                    : "Upload the output CSVs as interactive OMERO tables for further analysis."}
                  placement="top"
                >
                  <span>Add results as OMERO tables.</span>
                </Tooltip>
                {renderDefaultCue(outputHints.uploadCsv, outputHints.measurementLabel)}
              </span>
            }
            labelFor="upload-csv-options"
            helperText={renderDefaultHelper(
              outputHints.measurementCount > 0,
              `Turned on for workflow output(s): ${outputHints.measurementLabel}. Switch it off if you do not want OMERO tables for those results.`,
              "Upload CSV results as interactive OMERO tables for further analysis."
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
                    ? `This workflow declares non-image output(s) (${outputHints.fileAnnotationLabel}) such as arrays, model weights, or configs. Attaching them as individual file annotations is enabled by default.`
                    : "Attach individual non-image output files (e.g. NumPy arrays, model weights, JSON/YAML configs) directly as OMERO file annotations."}
                  placement="top"
                >
                  <span>Attach individual non-image output files as annotations.</span>
                </Tooltip>
                {renderDefaultCue(outputHints.attachFileOutputs, outputHints.fileAnnotationLabel)}
              </span>
            }
            labelFor="attach-file-outputs"
            helperText={renderDefaultHelper(
              outputHints.fileAnnotationCount > 0,
              `Turned on for workflow output(s): ${outputHints.fileAnnotationLabel}. Each file is attached as its own OMERO annotation — no need for the bulk zip just to access these files.`,
              "Attach non-image, non-CSV output files (arrays, configs, model weights) as individual OMERO file annotations."
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
                    ? `This workflow declares image output(s) (${outputHints.imageLabel}), so screen output is the default target for plate results.`
                    : "The output results will be organized in an OMERO screen for viewing and further analysis."}
                  placement="top"
                >
                  <span>Add results to a new or existing screen.</span>
                </Tooltip>
                {renderDefaultCue(outputHints.hasImageOutput, outputHints.imageLabel)}
              </span>
            }
            helperText={renderDefaultHelper(
              outputHints.hasImageOutput,
              `Turned on for workflow output(s): ${outputHints.imageLabel}. Switch it off if you do not want those image results organized in a screen.`,
              "The output results will be organized in an OMERO screen for viewing and further analysis."
            )}
            subLabel="Don't forget to press ENTER if you type a new name!"
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
                title: "No matching screen found — a new screen will be created with this name.",
              };
            }}
          />
        </FormGroup>
      </form>
    </DialogBody>
  );
};

export default PlateWorkflowOutput;
