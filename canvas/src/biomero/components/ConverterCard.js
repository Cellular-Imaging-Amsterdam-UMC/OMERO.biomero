import React from "react";
import {
  Card,
  Button,
  FormGroup,
  InputGroup,
  ButtonGroup,
  Tooltip,
  H4,
} from "@blueprintjs/core";
import { FaDocker } from "react-icons/fa";

const ConverterCard = ({
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
  const openDockerHub = (image) => {
    const [repo, version] = image.split(":");
    const url = `https://hub.docker.com/r/${repo}/tags?page=1&name=${version}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <Card className="p-4 shadow-md">
      <div className="flex justify-between items-center">
        <H4 className={`text-lg font-bold ${item.key ? "" : "text-red-500"}`}>
          {item.key || `Please fill in a valid name!`}
        </H4>
        {/* Action Buttons */}
        <ButtonGroup>
          <Tooltip
            content={
              editable ? "Lock model" : "Click here to edit the converter!"
            }
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
          <Tooltip content="Delete converter">
            <Button
              minimal
              intent="danger"
              icon="delete"
              onClick={() => onDelete(index)}
            />
          </Tooltip>
        </ButtonGroup>
      </div>
      {/* Converter Name */}
      <FormGroup
        label="Converter Name"
        labelFor={`converter-name-${index}`}
        labelInfo="(required)"
        intent={errors?.key ? "danger" : "none"}
      >
        <InputGroup
          id={`converter-name-${index}`}
          placeholder="e.g. zarr_to_tiff"
          value={item.key}
          onChange={(e) => onChange(index, "key", e.target.value)}
          onBlur={(e) => validateField(index, "key", e.target.value)}
          intent={errors?.key ? "danger" : "none"}
          readOnly={!editable}
        />
        {errors?.key && (
          <div className="text-red-500 text-sm">{errors?.key}</div>
        )}
      </FormGroup>

      {/* Docker Image */}
      <FormGroup
        label="Docker Image"
        labelFor={`converter-image-${index}`}
        labelInfo="(required)"
        intent={errors?.value ? "danger" : "none"}
      >
        <InputGroup
          id={`converter-image-${index}`}
          placeholder="e.g. cellularimagingcf/convert_zarr_to_tiff:1.14.0"
          value={item.value}
          onChange={(e) => onChange(index, "value", e.target.value)}
          onBlur={(e) => validateField(index, "value", e.target.value)}
          intent={errors?.value ? "danger" : "none"}
          readOnly={!editable}
          rightElement={
            item.value ? (
              <Button
                icon={<FaDocker />}
                intent="primary"
                onClick={() => openDockerHub(item.value)}
                title="View Container Image"
              />
            ) : null
          }
        />
        {errors?.value && (
          <div className="text-red-500 text-sm">{errors?.value}</div>
        )}
        {errors?.valueWarning && (
          <div className="text-yellow-500 text-sm">{errors?.valueWarning}</div>
        )}
      </FormGroup>
    </Card>
  );
};

export default ConverterCard;
