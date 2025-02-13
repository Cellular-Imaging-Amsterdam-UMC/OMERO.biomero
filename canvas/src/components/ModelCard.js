import React, { useState } from "react";
import {
  Card,
  Button,
  FormGroup,
  InputGroup,
  Tooltip,
  Icon,
  H4,
  ButtonGroup,
} from "@blueprintjs/core";

const ModelCard = ({
  item,
  index,
  onChange,
  onAddParam,
  onDelete,
  onReset,
  editable,
  setEditable,
  errors,
  validateField,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  return (
    <Card className="mb-4 shadow">
      <div className="flex justify-between items-center">
        <H4 className={`text-lg font-bold ${item.name ? "" : "text-red-500"}`}>
          {item.name || `Please fill in a valid name!`}
        </H4>
        <ButtonGroup>
          <Tooltip
            content={editable ? "Lock model" : "Click here to edit the model!"}
            isOpen={!editable}
            position="top"
          >
            <Button
              minimal
              icon={editable ? "tick" : "edit"}
              onClick={() => setEditable(index, !editable)}
            />
          </Tooltip>
          <Tooltip content="Reset values">
            <Button
              minimal
              icon="reset"
              intent="warning"
              onClick={() => onReset(index)}
            />
          </Tooltip>
          <Tooltip content="Delete model">
            <Button
              minimal
              intent="danger"
              icon="delete"
              onClick={() => onDelete(index)}
            />
          </Tooltip>
        </ButtonGroup>
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
        subLabel="Also the path to store the container on the slurm_images_path."
      >
        <InputGroup
          value={item.name}
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
        subLabel="The repository with the descriptor.json file."
      >
        <InputGroup
          value={item.repo}
          placeholder="e.g., https://github.com/org/repo/tree/v1.0.0"
          readOnly={!editable}
          onChange={(e) => onChange(index, "repo", e.target.value)}
          rightElement={
            item.repo ? (
              item.repo.includes("/tree/v") ? (
                <Button
                  icon="git-branch"
                  minimal
                  intent="primary"
                  title="Test GitHub URL"
                  onClick={() =>
                    window.open(item.repo, "_blank", "noopener,noreferrer")
                  }
                />
              ) : (
                <Tooltip
                  content="URL is missing a version (e.g., /tree/v1.0.0)."
                  intent="warning"
                >
                  <Button icon="warning-sign" minimal intent="warning" />
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
        subLabel="The jobscript path in the 'slurm_script_repo'. Use jobs/<modelname>.sh, unless you added your own Slurm Script Repository."
      >
        <InputGroup
          value={item.job}
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
        subLabel={
          <>
            Override the default job values for this workflow, or add a job
            value to this workflow.{" "}
            <div>
              See Slurm{" "}
              <a
                href="https://slurm.schedmd.com/sbatch.html#SECTION_OPTIONS"
                target="_blank"
                rel="noopener noreferrer"
              >
                SBATCH parameters
              </a>{" "}
              for all options. Always use the extended form here (e.g.{" "}
              <code>cpus-per-task</code>, not <code>c</code>).
            </div>
          </>
        }
      >
        <InputGroup
          placeholder="e.g., mem=32GB"
          disabled={!editable}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => {
            if (inputValue && !showWarning) {
              setShowWarning(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editable) {
              const [key, value] = inputValue.split("=");
              if (key) {
                onAddParam(index, key.trim(), value ? value.trim() : "");
                setInputValue("");
                setShowWarning(false);
              }
            }
          }}
          rightElement={
            showWarning && editable ? (
              <Tooltip
                content="Press Enter or click this button to confirm your changes"
                intent="warning"
                isOpen={showWarning && editable}
              >
                <Button
                  icon="warning-sign"
                  minimal
                  intent="warning"
                  onClick={() => {
                    const [key, value] = inputValue.split("=");
                    if (key) {
                      onAddParam(index, key.trim(), value ? value.trim() : "");
                      setInputValue("");
                      setShowWarning(false);
                    }
                  }}
                />
              </Tooltip>
            ) : null
          }
        />
      </FormGroup>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
          <div className="bp5-form-helper-text">
            <ul>
              E.g.
              <li>
                Run with specific GPU: <code>gres=gpu:1g.10gb:1</code>
              </li>
              <li>
                Run on a specific partition:{" "}
                <code>partition=luna-gpu-short</code>
              </li>
              <li>
                Use more CPU memory: <code>mem=15GB</code>
              </li>
              <li>
                Higher timeout (d-hh:mm:ss): <code>time=08:00:00</code>
              </li>
            </ul>
          </div>
        </div>
      </div>
      {item.extraParams && (
        <ul className="list-disc list-inside space-y-2">
          {Object.entries(item.extraParams).map(([key, value]) => (
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

export default ModelCard;
