import React, { useState } from "react";
import { Collapse, Button, H4, Icon, Tooltip } from "@blueprintjs/core";

const ConfigSection = ({
  items,
  onItemChange,
  onAddItem,
  onAddParam,
  onDeleteItem,
  onResetItem,
  CardComponent, // Allow custom card component
  title = "New Item", // Default title prefix
  description, // Helper text description
  errors, // Error states
  validateField, // Validation function
  versionStatus, // Version check results
  versionCheckLoading, // Version check loading state
  config, // Config for workflow type detection
  onRepoBlur, // Repo blur handler
}) => {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [editableIndex, setEditableIndex] = useState(null);

  // Helper function to get workflow type from name
  const getWorkflowTypeIcons = (workflowName) => {
    if (!workflowName || !config || !config.UI) return null;
    
    const plateWorkflows = config.UI.plate_workflows ? 
      JSON.parse(config.UI.plate_workflows || '[]') : [];
    const isPlateWorkflow = plateWorkflows.includes(workflowName);
    
    const zarrWorkflows = config.UI.zarr_workflows ? 
      JSON.parse(config.UI.zarr_workflows || '[]') : [];
    const isZarrWorkflow = zarrWorkflows.includes(workflowName);
    
    return { isPlateWorkflow, isZarrWorkflow };
  };

  const toggleItem = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const addItemHandler = () => {
    onAddItem();
    setExpandedIndex(items.length); // Open the newly added item
    setEditableIndex(items.length); // Make it editable
  };

  const setEditable = (index, editable) => {
    setEditableIndex(editable ? index : null);
  };

  return (
    <div>
      {description && (
        <div className="bp5-form-group">
          <div className="bp5-form-content">
            {description.map((text, idx) => (
              <div key={idx} className="bp5-form-helper-text">
                {text}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index}>
            <div className="flex items-center justify-between">
              <H4 className={`font-semibold flex items-center cursor-pointer ${
                versionStatus && versionStatus[index] && 
                  (versionStatus[index].status === 'outdated' || (versionStatus[index].status === 'unknown' && versionStatus[index].latestVersion)) &&
                  !versionStatus[index].justUpdated
                  ? 'text-orange-600' 
                  : ''
              }`}
                onClick={() => toggleItem(index)}
              >
                {item.name || item.key || `${title} ${index + 1}`}
                {/* Add icons for different version statuses */}
                {(() => {
                  const status = versionStatus && versionStatus[index];
                  
                  if (status) {
                    const isOutdated = (status.status === 'outdated' || (status.status === 'unknown' && status.latestVersion)) && !status.justUpdated;
                    const isRateLimited = status.status === 'rate-limited';
                    const isStale = status.isStale || status.status?.includes('-stale');
                    
                    if (isRateLimited) {
                      const resetTime = status.rateLimitInfo?.reset 
                        ? new Date(parseInt(status.rateLimitInfo.reset) * 1000).toLocaleTimeString()
                        : 'unknown';
                      return (
                        <Tooltip content={`GitHub rate limit exceeded. Resets at ${resetTime}`}>
                          <Icon icon="help" size={12} intent="warning" className="ml-2" />
                        </Tooltip>
                      );
                    } else if (isStale) {
                      return (
                        <Tooltip content="Version data is stale due to rate limiting">
                        <Icon icon="outdated" size={12} className="ml-2 text-orange-500" />
                        </Tooltip>
                      );
                    } else if (isOutdated) {
                      return (
                        <Icon icon="outdated" size={12} intent="warning" className="ml-2" />
                      );
                    }
                  }
                  return null;
                })()}
              </H4>
              <div className="flex items-center">
                {/* Workflow type indicators - right aligned */}
                {(() => {
                  const workflowTypeIcons = getWorkflowTypeIcons(item.name);
                  if (workflowTypeIcons?.isPlateWorkflow) {
                    return (
                      <Tooltip content="Plate Workflow (operates on OME-ZARR plates)">
                        <Icon icon="grid-view" size={14} intent="primary" className="mr-2" />
                      </Tooltip>
                    );
                  } else if (workflowTypeIcons?.isZarrWorkflow) {
                    return (
                      <Tooltip content="ZARR Workflow (requires importer for results)">
                        <Icon icon="cube" size={14} intent="none" className="mr-2" />
                      </Tooltip>
                    );
                  }
                  return null;
                })()}
                <Icon
                  icon={expandedIndex === index ? "caret-down" : "caret-right"}
                  className="cursor-pointer"
                  onClick={() => toggleItem(index)}
                />
              </div>
            </div>
            <Collapse isOpen={expandedIndex === index}>
              <CardComponent
                item={item}
                index={index}
                onChange={(idx, field, value, options) => onItemChange(idx, field, value, options)}
                onAddParam={onAddParam}
                onDelete={onDeleteItem}
                onReset={onResetItem}
                onRepoBlur={onRepoBlur}
                editable={editableIndex === index}
                setEditable={setEditable}
                errors={errors ? errors[index] : null} // Safely handle null errors
                validateField={validateField} // Pass validation function
                versionStatus={versionStatus ? versionStatus[index] : null} // Pass version status for this item
                versionCheckLoading={versionCheckLoading} // Pass loading state
              />
            </Collapse>
          </div>
        ))}
      </div>
      <Button
        icon="add"
        intent="none"
        onClick={addItemHandler}
        className="mt-4 mb-4"
      >
        Add {title}
      </Button>
    </div>
  );
};

export default ConfigSection;
