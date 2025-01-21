import React, { useState } from "react";
import {
  Card,
  Collapse,
  Button,
  FormGroup,
  InputGroup,
  Tooltip,
  H3,
  Icon,
} from "@blueprintjs/core";

const ModelCard = ({
  model,
  index,
  onChange,
  onAddParam,
  onDelete,
  onReset,
  editable,
  setEditable,
}) => {
  return (
    <Card className="mb-4 shadow">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-bold">{model.name || `New Model ${index + 1}`}</h4>
        <div className="flex space-x-2">
          <Button
            minimal
            icon={editable ? "tick" : "edit"}
            onClick={() => setEditable(index, !editable)}
          />
          <Button
            minimal
            icon="reset"
            intent="warning"
            onClick={() => onReset(index)}
            />
          <Button minimal intent="danger" icon="delete" onClick={() => onDelete(index)} />
        </div>
      </div>

      <FormGroup
        label={
          <span>
            Model Name{" "}
            <Tooltip content="Enter the name of the model.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          value={model.name}
          readOnly={!editable}
          onChange={(e) => onChange(index, "name", e.target.value)}
        />
      </FormGroup>

      <FormGroup
        label={
          <span>
            GitHub Repository{" "}
            <Tooltip content="Specify the versioned GitHub repository for the model.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          value={model.repo}
          readOnly={!editable}
          onChange={(e) => onChange(index, "repo", e.target.value)}
        />
      </FormGroup>

      <FormGroup
        label={
          <span>
            Slurm Job Script{" "}
            <Tooltip content="Specify the Slurm job script path or leave blank to use a default (jobs/<model-name>.sh).">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          value={model.job}
          readOnly={!editable}
          onChange={(e) => onChange(index, "job", e.target.value)}
        />
      </FormGroup>

      <FormGroup
        label={
          <span>
            Additional Slurm Parameters{" "}
            <Tooltip content="Add any additional sbatch parameters in key=value format.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          placeholder="key=value"
          disabled={!editable}
          onBlur={(e) => {
            const [key, value] = e.target.value.split("=");
            if (key && value) {
              onAddParam(index, key, value);
            }
          }}
        />
      </FormGroup>

      {model.extraParams && (
        <ul className="list-disc list-inside">
          {Object.entries(model.extraParams).map(([key, value]) => (
            <li key={key} className="text-sm">
              {key}: {value}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const ModelsSection = ({
  models,
  onModelChange,
  onAddModel,
  onAddParam,
  onDeleteModel,
  onResetModel
}) => {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [editableIndex, setEditableIndex] = useState(null);

  const toggleModel = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const addModelHandler = () => {
    onAddModel();
    setExpandedIndex(models.length); // Open the newly added model
    setEditableIndex(models.length); // Make it editable
  };

  const setEditable = (index, editable) => {
    setEditableIndex(editable ? index : null);
  };

  return (
    <div>
      <H3 icon="predictive-analysis" className="mb-4">
        Models
      </H3>
      <div className="space-y-4">
        {models.map((model, index) => (
          <div key={index}>
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleModel(index)}
            >
              <h4 className="font-semibold">
                {model.name || `New Model ${index + 1}`}
              </h4>
              <Icon icon={expandedIndex === index ? "caret-down" : "caret-right"} />
            </div>
            <Collapse isOpen={expandedIndex === index}>
              <ModelCard
                model={model}
                index={index}
                onChange={onModelChange}
                onAddParam={onAddParam}
                onDelete={onDeleteModel}
                onReset={onResetModel}
                editable={editableIndex === index}
                setEditable={setEditable}
              />
            </Collapse>
          </div>
        ))}
      </div>
      <Button icon="add" intent="primary" onClick={addModelHandler} className="mt-4">
        Add Model
      </Button>
    </div>
  );
};

export default ModelsSection;
