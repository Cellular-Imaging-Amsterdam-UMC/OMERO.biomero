import React, { useState } from "react";
import { Button, Popover, PopoverInteractionKind, Tooltip, TagInput, FormGroup } from "@blueprintjs/core";
import OmeroDataBrowser from "./OmeroDataBrowser"; 

const DatasetSelectWithPopover = ({ 
  value, 
  onChange, 
  multiSelect = true, 
  label = "", 
  helperText = "", 
  subLabel = "",
  tooltip = "",
  buttonText = "Add Dataset"
}) => {
  
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState([]);
  const [values, setValues] = useState([]);

  const handleInputChange = (newValues) => {
    let updatedValues;
    if (multiSelect) {       
      updatedValues = [...values, ...newValues]; // Add new value to the array if it's a string    
      setValues(updatedValues); // Update local state
      onChange(updatedValues); // Pass the updated array to the parent
    } else {
      // If not multiSelect, just set the value as the only item in the list
      if (typeof newValues === "string") {
        updatedValues = [newValues]; // Make it a single item array
      } else {
        updatedValues = [newValues[newValues.length - 1]]; // Make it a single item array
      }  
      setValues(updatedValues); // Update local state
      onChange(updatedValues); // Pass the updated array to the parent
    }
  };

  const handleManualInputChange = (updatedValues) => {
    setValues(updatedValues); // Update local state
    onChange(updatedValues); // Pass the updated array to the parent
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior (dialog closing)
    }
  };

  const handleSelectFolder = () => {
    if (selectedFolder) {
      handleInputChange(selectedFolder);
    } else {
      // Add the selected folder as a tag in the TagInput
      handleInputChange(
        "dummyfolder"
      );
    }
    setPopoverOpen(false); // Close popover once selection is made
    
  };

  return (
    <FormGroup
      label={label}
      labelFor="upload-ex-dataset-options"
      helperText={helperText}
      subLabel={subLabel}
    >
      <TagInput
        placeholder="Add new dataset name or select..."
        values={value || []} // Pass value as prop to handle the input state
        onChange={handleManualInputChange}
        onKeyDown={handleKeyDown}
        rightElement={
          <Popover
            interactionKind={PopoverInteractionKind.CLICK}
            isOpen={isPopoverOpen}
            onInteraction={(state) => setPopoverOpen(state)}
            content={
              <div className="p-4 flex flex-col space-y-4">
                <OmeroDataBrowser 
                  onSelectCallback={(folders) => setSelectedFolder(folders)} 
                />
                <Button
                  className="self-end"
                  icon="send-message" // BlueprintJS arrow icon
                  onClick={handleSelectFolder} 
                  intent="primary"
                />
              </div>
            }
          >
            <Tooltip content={tooltip} placement="bottom">
              <Button icon="folder-open" text={buttonText} />
            </Tooltip>
          </Popover>
        }
      />
    </FormGroup>
  );
};

export default DatasetSelectWithPopover;
