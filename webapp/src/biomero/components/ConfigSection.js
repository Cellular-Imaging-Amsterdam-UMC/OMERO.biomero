import React, { useState } from "react";
import { Collapse, Button, H4, Icon } from "@blueprintjs/core";

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
}) => {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [editableIndex, setEditableIndex] = useState(null);

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
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleItem(index)}
            >
              <H4 className="font-semibold">
                {item.name || item.key || `${title} ${index + 1}`}
              </H4>
              <Icon
                icon={expandedIndex === index ? "caret-down" : "caret-right"}
              />
            </div>
            <Collapse isOpen={expandedIndex === index}>
              <CardComponent
                item={item}
                index={index}
                onChange={onItemChange}
                onAddParam={onAddParam}
                onDelete={onDeleteItem}
                onReset={onResetItem}
                editable={editableIndex === index}
                setEditable={setEditable}
                errors={errors ? errors[index] : null} // Safely handle null errors
                validateField={validateField} // Pass validation function
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
