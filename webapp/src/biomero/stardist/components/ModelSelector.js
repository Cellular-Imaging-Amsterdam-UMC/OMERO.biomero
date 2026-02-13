import React from "react";
import { HTMLSelect, FormGroup } from "@blueprintjs/core";

const MODELS = [
  { label: "2D_versatile_fluo", value: "2D_versatile_fluo" },
  { label: "2D_versatile_he", value: "2D_versatile_he" },
  { label: "2D_demo", value: "2D_demo" },
];

const ModelSelector = ({ selectedModel, onSelect }) => {
  return (
    <FormGroup label="Select Model" labelFor="model-select">
      <HTMLSelect
        id="model-select"
        options={MODELS}
        value={selectedModel}
        onChange={(e) => onSelect(e.target.value)}
        fill={true}
      />
    </FormGroup>
  );
};

export default ModelSelector;
