import React, { useState } from "react";
import { Button, Popover, PopoverInteractionKind, Tooltip, TagInput, FormGroup } from "@blueprintjs/core";
import OmeroDataBrowser from "../OmeroDataBrowser"; 

const DatasetSelectWithPopover = ({ 
  value, 
  onChange, 
  multiSelect = true, 
  label = "Add results to a new or existing dataset.", 
  helperText = "The output images will be organized in an OMERO dataset for viewing and further analysis.", 
  subLabel = "Don't forget to press ENTER if you type a new name!" 
}) => {
  
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [values, setValues] = useState([]);

  const handleInputChange = (value) => {
    let updatedValues;
    if (multiSelect) {       
      if (typeof value === "string") {
        updatedValues = [...values, value]; // Add new value to the array if it's a string
      } else {
        updatedValues = value; // If not a string, just assign `value`
      }      
      setValues(updatedValues); // Update local state
      onChange(updatedValues); // Pass the updated array to the parent
    } else {
      // If not multiSelect, just set the value as the only item in the list
      if (typeof value === "string") {
        updatedValues = [value]; // Make it a single item array
      } else {
        updatedValues = [value[value.length - 1]]; // Make it a single item array
      }  
      setValues(updatedValues); // Update local state
      onChange(updatedValues); // Pass the updated array to the parent
    }
  };

  const handleManualInputChange = (updatedValues) => {
    handleInputChange(updatedValues)
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
      handleInputChange("dummyfolder");
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
                  onSelectFolder={(folder) => setSelectedFolder(folder)} 
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
            <Tooltip content="Select the OMERO dataset for your workflow results." placement="bottom">
              <Button icon="database" text="Select Result Dataset" />
            </Tooltip>
          </Popover>
        }
      />
    </FormGroup>
  );
};

export default DatasetSelectWithPopover;
