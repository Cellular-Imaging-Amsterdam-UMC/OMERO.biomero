import React from "react";
import { DialogBody, H6, Divider, Callout } from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";
import OmeroAttachmentBrowser from "./OmeroAttachmentBrowser";

/**
 * File-type parameter types that are fulfilled by selecting OMERO attachments.
 * These params have set-by-server=True in the schema (the server will ultimately
 * inject the HPC path), but the user first chooses which attachment to use here.
 */
const FILE_INPUT_TYPES = new Set(["file", "array", "measurement", "executable"]);

/**
 * Returns the file-input params from a workflow metadata object, i.e. those
 * with set-by-server=True whose type is a non-image file type.
 */
export function getFileInputParams(workflowMetadata) {
  if (!workflowMetadata?.inputs) return [];
  return workflowMetadata.inputs.filter(
    (p) => p["set-by-server"] && FILE_INPUT_TYPES.has(p.type)
  );
}

/**
 * A dialog step panel that shows one OmeroAttachmentBrowser per file-type
 * workflow input parameter.  Selections are stored in formData keyed by
 * param id, as an array of OMERO annotation IDs.
 *
 * Rendered as a <DialogBody> so it drops directly into a <DialogStep panel={…}>.
 */
const WorkflowFileInputStep = () => {
  const { state, updateState } = useAppContext();
  const workflowMetadata = state.selectedWorkflow?.metadata;
  const fileParams = getFileInputParams(workflowMetadata);

  const handleSelect = (paramId, ids) => {
    updateState({
      formData: {
        ...state.formData,
        [paramId]: ids,
      },
    });
  };

  if (fileParams.length === 0) {
    return (
      <DialogBody>
        <Callout intent="primary" icon="info-sign">
          This workflow has no file attachment inputs.
        </Callout>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      {fileParams.map((param, idx) => {
        const formats = Array.isArray(param.format)
          ? param.format
          : param.format
          ? [param.format]
          : [];
        const fileCount = param["file-count"] || null;
        const currentSelection = Array.isArray(state.formData[param.id])
          ? state.formData[param.id]
          : [];

        return (
          <React.Fragment key={param.id}>
            {idx > 0 && <Divider className="my-4" />}
            <H6>
              {param.name || param.id}
              {!param.optional && (
                <span className="text-red-500 ml-1" title="Required">*</span>
              )}
            </H6>
            {param.description && (
              <p className="text-sm text-gray-500 mb-2">{param.description}</p>
            )}
            <OmeroAttachmentBrowser
              formats={formats}
              fileCount={fileCount}
              selectedIds={currentSelection}
              onSelect={(ids) => handleSelect(param.id, ids)}
            />
          </React.Fragment>
        );
      })}
    </DialogBody>
  );
};

export default WorkflowFileInputStep;
