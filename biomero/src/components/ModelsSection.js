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
        <h4 className="text-lg font-bold">
          {model.name || `New Model ${index + 1}`}
        </h4>
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
          <Button
            minimal
            intent="danger"
            icon="delete"
            onClick={() => onDelete(index)}
          />
        </div>
      </div>

      <FormGroup
        label={
          <span>
            Model Name{" "}
            <Tooltip content="Provide a unique, lowercase name for this model. It will be used as foldername on Slurm and in the INI file as [name]_job_<parameter>.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          value={model.name}
          placeholder="e.g., cellpose"
          readOnly={!editable}
          onChange={(e) =>
            onChange(index, "name", e.target.value.toLowerCase())
          }
        />
      </FormGroup>

      <FormGroup
        label={
            <span>
            GitHub Repository{" "}
            <Tooltip content="Specify the versioned GitHub repository URL for this model. Versions (e.g., /tree/v1.0.0) ensure reproducibility.">
                <Icon icon="help" size={12} />
            </Tooltip>
            </span>
        }
        >
        <InputGroup
            value={model.repo}
            placeholder="e.g., https://github.com/org/repo/tree/v1.0.0"
            readOnly={!editable}
            onChange={(e) => onChange(index, "repo", e.target.value)}
            rightElement={
                model.repo ? (
                model.repo.includes("/tree/v") ? (
                    <Button
                    icon="git-branch"
                    minimal
                    intent="primary"
                    title="Test GitHub URL"
                    onClick={() => window.open(model.repo, "_blank", "noopener,noreferrer")}
                    />
                ) : (
                    <Tooltip
                    content="URL is missing a version (e.g., /tree/v1.0.0)."
                    intent="warning"
                    >
                    <Button
                        icon="warning-sign"
                        minimal
                        intent="warning"
                    />
                    </Tooltip>
                )
                ) : null
            }
            />

        </FormGroup>


      <FormGroup
        label={
          <span>
            Slurm Job Script{" "}
            <Tooltip content="Specify the relative path to the Slurm job script. Defaults to 'jobs/<model-name>.sh' if left blank.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          value={model.job}
          placeholder="e.g., jobs/cellpose.sh"
          readOnly={!editable}
          onChange={(e) => onChange(index, "job", e.target.value)}
        />
      </FormGroup>

      <FormGroup
        label={
          <span>
            Additional Slurm Parameters{" "}
            <Tooltip content="Add parameters in key=value format (e.g., mem=32GB). These will be converted to <name>_job_<key>=<value> in the INI file.">
              <Icon icon="help" size={12} />
            </Tooltip>
          </span>
        }
      >
        <InputGroup
          placeholder="e.g., mem=32GB"
          disabled={!editable}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editable) {
              const [key, value] = e.target.value.split("=");
              if (key) {
                onAddParam(index, key.trim(), value ? value.trim() : "");
                e.target.value = ""; // Clear the input field after adding
              }
            }
          }}
        />
      </FormGroup>

      {model.extraParams && (
        <ul className="list-disc list-inside space-y-2">
          {Object.entries(model.extraParams).map(([key, value]) => (
            <li key={key} className="flex items-center space-x-2">
              <span className="text-sm font-semibold">{key}:</span>
              {editable ? (
                <InputGroup
                  value={value}
                  onChange={(e) => onAddParam(index, key, e.target.value)}
                  className="flex-1"
                />
              ) : (
                <span>{value}</span>
              )}
              {editable && (
                <Button
                  icon="delete"
                  minimal
                  intent="danger"
                  onClick={() => {
                    onAddParam(index, key, null); // Pass null as the value to trigger deletion
                  }}
                />
              )}
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
  onResetModel,
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
              <Icon
                icon={expandedIndex === index ? "caret-down" : "caret-right"}
              />
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
      <Button
        icon="add"
        intent="primary"
        onClick={addModelHandler}
        className="mt-4"
      >
        Add Model
      </Button>
    </div>
  );
};

export default ModelsSection;
