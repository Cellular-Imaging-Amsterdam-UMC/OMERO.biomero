import React, { useState, useEffect } from "react";
import { HTMLSelect, FormGroup, Spinner, Button, Tag } from "@blueprintjs/core";
import { fetchStardistModels } from "../../../apiService";

const ModelSelector = ({ selectedModel, onSelect }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchStardistModels();
      setModels(fetched);

      // If current selection is not in the list, select the first one
      if (fetched.length > 0 && !fetched.find(m => m.value === selectedModel)) {
        onSelect(fetched[0].value);
      }
    } catch (e) {
      console.error("Failed to load models:", e);
      setError("Failed to load models");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <FormGroup label="Select Model">
        <Spinner size={20} />
      </FormGroup>
    );
  }

  if (error) {
    return (
      <FormGroup label="Select Model">
        <div className="text-red-500 text-sm mb-2">{error}</div>
        <Button icon="refresh" small onClick={loadModels}>Retry</Button>
      </FormGroup>
    );
  }

  const options = models.map(m => ({
    label: m.label,
    value: m.value,
  }));

  const selectedMeta = models.find(m => m.value === selectedModel);

  return (
    <FormGroup label="Select Model" labelFor="model-select">
      <div className="flex items-center gap-2">
        <HTMLSelect
          id="model-select"
          options={options}
          value={selectedModel}
          onChange={(e) => onSelect(e.target.value)}
          fill={true}
        />
        <Button icon="refresh" minimal small onClick={loadModels} title="Refresh model list" />
      </div>
      {selectedMeta && (
        <div className="mt-1">
          <Tag 
            minimal 
            intent={selectedMeta.type === "custom" ? "success" : "primary"}
            round
          >
            {selectedMeta.type === "custom" ? "Custom" : "Built-in"}
          </Tag>
        </div>
      )}
    </FormGroup>
  );
};

export default ModelSelector;
