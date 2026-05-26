import React, { useState } from "react";
import {
  DialogBody,
  Collapse,
  Button,
  Icon,
  Tag,
  Callout,
  Intent,
  Tooltip,
} from "@blueprintjs/core";
import { useAppContext } from "../../AppContext";
import OmeroAttachmentBrowser from "./OmeroAttachmentBrowser";

/**
 * Returns the file-input params from a workflow metadata object.
 * Uses the canonical ``file-attachment`` descriptor flag set by the schema parser.
 */
export function getFileInputParams(workflowMetadata) {
  if (!workflowMetadata?.inputs) return [];
  return workflowMetadata.inputs.filter((p) => p["file-attachment"] === true);
}

/**
 * Returns true when all required (non-optional) file params have a selection.
 * Optional params are always considered satisfied regardless of selection.
 */
export function isFileInputStepValid(workflowMetadata, formData) {
  const params = getFileInputParams(workflowMetadata);
  return params
    .filter((p) => !p.optional)
    .every((p) => {
      const sel = Array.isArray(formData?.[p.id]) ? formData[p.id] : [];
      return sel.length > 0;
    });
}

/**
 * A "param is done" when:
 *   - single file-count → exactly 1 selected
 *   - multiple / unspecified → at least 1 selected
 */
function isParamDone(param, selection) {
  if (selection.length === 0) return false;
  if (param["file-count"] === "single") return selection.length >= 1;
  return selection.length >= 1;
}

const WorkflowFileInputStep = () => {
  const { state, updateState } = useAppContext();
  const workflowMetadata = state.selectedWorkflow?.metadata;
  const fileParams = getFileInputParams(workflowMetadata);
  const hasRequired = fileParams.some((p) => !p.optional);

  // Track which param's panel is open — only one at a time
  const [openParamId, setOpenParamId] = useState(
    fileParams.length > 0 ? fileParams[0].id : null
  );
  // id→name metadata for the current selection of each param (for accordion bar display)
  const [selectionMeta, setSelectionMeta] = useState({});

  const handleSelect = (param, ids, metas = []) => {
    updateState({
      formData: {
        ...state.formData,
        [param.id]: ids,
      },
    });
    setSelectionMeta((prev) => ({ ...prev, [param.id]: metas }));

    // Auto-advance to the next uncompleted param when this one is done
    if (isParamDone(param, ids)) {
      const currentIndex = fileParams.findIndex((p) => p.id === param.id);
      const nextIncomplete = fileParams.slice(currentIndex + 1).find((p) => {
        const sel = Array.isArray(state.formData?.[p.id])
          ? state.formData[p.id]
          : [];
        return !isParamDone(p, sel);
      });
      if (nextIncomplete) {
        setOpenParamId(nextIncomplete.id);
      }
    }
  };

  if (fileParams.length === 0) {
    return (
      <DialogBody>
        <p className="text-gray-500 text-sm">
          This workflow has no file attachment inputs.
        </p>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      {/* Info callout — mirrors the Batch Processing style */}
      <Callout className="mb-3">
        <p className="text-sm font-semibold mb-0.5">
          File Inputs {!hasRequired && "(Optional)"}
        </p>
        <p className="text-xs text-gray-600">
          {hasRequired
            ? "Select the required OMERO file attachments below before continuing."
            : "These settings are optional. You can safely click \"Next\" without selecting anything."}
        </p>
      </Callout>

      <div className="flex flex-col gap-2">
        {fileParams.map((param, index) => {
          const formats = Array.isArray(param.format)
            ? param.format
            : param.format
            ? [param.format]
            : [];
          const currentSelection = Array.isArray(state.formData[param.id])
            ? state.formData[param.id]
            : [];
          const done = isParamDone(param, currentSelection);
          const isOpen = openParamId === param.id;

          return (
            <div
              key={param.id}
              className={`border rounded transition-colors ${
                done
                  ? "border-green-400 bg-green-50"
                  : "border-gray-200"
              }`}
            >
              {/* Collapsible header */}
              <Button
                minimal
                fill
                alignText="left"
                onClick={() => setOpenParamId(isOpen ? null : param.id)}
                className="px-3 py-2"
                intent={done ? Intent.SUCCESS : Intent.NONE}
                rightIcon={isOpen ? "chevron-up" : "chevron-down"}
              >
                <div className="flex flex-col w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400 shrink-0">#{index + 1}</span>
                    <Icon
                      icon={done ? "tick-circle" : "paperclip"}
                      size={14}
                      className={done ? "text-green-600" : "text-gray-400"}
                    />
                    {param.description ? (
                      <Tooltip content={param.description} placement="top" hoverOpenDelay={300}>
                        <span className="font-medium text-sm cursor-help border-b border-dashed border-gray-400">
                          {param.name || param.id}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="font-medium text-sm">
                        {param.name || param.id}
                      </span>
                    )}
                    {param.optional ? (
                      <span className="text-xs text-gray-400">(Optional)</span>
                    ) : (
                      <span className="text-red-500 text-xs" title="Required">*</span>
                    )}
                    {formats.length > 0 &&
                      formats.map((f) => (
                        <Tag key={f} minimal round className="text-xs">
                          {f}
                        </Tag>
                      ))}
                    {currentSelection.length > 0 && (
                      <span
                        className={`ml-auto text-xs rounded-full px-2 py-0.5 shrink min-w-0 flex items-center gap-1 max-w-[220px] overflow-hidden ${
                          done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        <span className="shrink-0">{currentSelection.length} selected</span>
                        {selectionMeta[param.id]?.[0]?.name && (
                          <>
                            <span className="shrink-0">:</span>
                            <span className="truncate">
                              {selectionMeta[param.id][0].name}
                              {currentSelection.length > 1 ? " …" : ""}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {param.description && !isOpen && (
                    <p className="text-xs text-gray-400 truncate mt-0.5 pl-8 max-w-xs">
                      {param.description}
                    </p>
                  )}
                </div>
              </Button>

              <Collapse isOpen={isOpen} keepChildrenMounted>
                <div className="px-3 pb-3">
                  {param.description && (
                    <p className="text-xs text-gray-500 mb-2">
                      {param.description}
                    </p>
                  )}
                  <OmeroAttachmentBrowser
                    formats={formats}
                    fileCount={param["file-count"] || null}
                    selectedIds={currentSelection}
                    onSelect={(ids, metas) => handleSelect(param, ids, metas)}
                  />
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
    </DialogBody>
  );
};

export default WorkflowFileInputStep;
