import React, { useState } from "react";
import {
  Button,
  Popover,
  PopoverInteractionKind,
  Tooltip,
  TagInput,
  FormGroup,
} from "@blueprintjs/core";
import OmeroDataBrowser from "./OmeroDataBrowser";
import { useAppContext } from "../AppContext";

const DatasetSelectWithPopover = ({
  value,
  onChange,
  multiSelect = true,
  label = "",
  helperText = "",
  subLabel = "",
  tooltip = "",
  buttonText = "Add Dataset",
  intent = "",
}) => {
  const { state, updateState } = useAppContext();
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [values, setValues] = useState([]);

  const handleInputChange = (nodeData) => {
    const nodeId = nodeData.id;
    let updatedSelection;
    if (state.omeroFileTreeSelection.includes(nodeId)) {
      // Remove the node if it was already selected
      updatedSelection = state.omeroFileTreeSelection.filter(
        (id) => id !== nodeId
      );
    } else {
      // Add the node, with multi selection maybe
      if (!multiSelect) {
        updatedSelection = [nodeId];
      } else {
        updatedSelection = [...state.omeroFileTreeSelection, nodeId];
      }
    }
    updateState({ ["omeroFileTreeSelection"]: updatedSelection }); // update selector
  };

  const handleManualInputChange = (updatedValues) => {
    setValues(updatedValues); // Update local state
    onChange(updatedValues, "manual"); // Pass the full array to the parent
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior (dialog closing)
    }
  };

  const handleSelectFolder = () => {
    onChange(state.omeroFileTreeSelection); // Pass the updated array to the parent
    setPopoverOpen(false); // Close popover once selection is made
    updateState({ omeroFileTreeSelection: [] });
  };

  return (
    <FormGroup
      label={label}
      labelFor="upload-ex-dataset-options"
      helperText={helperText}
      subLabel={subLabel}
      intent={intent}
    >
      <TagInput
        placeholder="Add new dataset name or select..."
        values={value || []} // Pass value as prop to handle the input state
        onChange={handleManualInputChange}
        onKeyDown={handleKeyDown}
        intent={intent}
        rightElement={
          <Popover
            interactionKind={PopoverInteractionKind.CLICK}
            isOpen={isPopoverOpen}
            onInteraction={(state) => setPopoverOpen(state)}
            content={
              <div className="p-4 flex flex-col space-y-4">
                <OmeroDataBrowser
                  onSelectCallback={(folder) => handleInputChange(folder)}
                />
                <Button
                  className="self-end"
                  icon="send-message"
                  onClick={handleSelectFolder}
                  intent="primary"
                />
              </div>
            }
          >
            <Tooltip
              content={tooltip}
              placement="bottom"
              defaultIsOpen={true}
              usePortal={false}
            >
              <Button icon="folder-open" text={buttonText} />
            </Tooltip>
          </Popover>
        }
      />
    </FormGroup>
  );
};

export default DatasetSelectWithPopover;
