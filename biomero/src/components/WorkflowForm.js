import React, { useEffect } from "react";
import { FormGroup, InputGroup, NumericInput, Switch } from "@blueprintjs/core";
import { useAppContext } from "../AppContext"; // Assuming AppContext exists

const WorkflowForm = () => {
  const { state, updateState } = useAppContext();

  // Retrieve the workflow metadata from the global state
  const workflowMetadata = state.selectedWorkflow?.metadata;

  if (!workflowMetadata) {
    return <div>Loading workflow...</div>; // Show loading message if metadata is not available yet
  }

  // Initialize default values based on workflowMetadata inputs
  const defaultValues = workflowMetadata.inputs.reduce((acc, input) => {
    const defaultValue = input["default-value"];
    
    if (input.type === "Number") {
      acc[input.id] = defaultValue !== undefined ? Number(defaultValue) : 0;
    } else if (input.type === "Boolean") {
      acc[input.id] = defaultValue !== undefined ? Boolean(defaultValue) : false;
    } else {
      acc[input.id] = defaultValue || "";
    }
    return acc;
  }, {});

  useEffect(() => {
    // Update state formData with default values or merged values from existing formData
    updateState({ formData: { ...defaultValues, ...state.formData } });
  }, [state.formData, updateState, defaultValues]);

  // Handle input changes and update the form data in state
  const handleInputChange = (id, value) => {
    updateState({
      formData: {
        ...state.formData,
        [id]: value,
      }
    });
  };

  // Dynamically generate form fields based on input type
  const renderFormFields = () => {
    return workflowMetadata.inputs
      .filter(input => !input.id.startsWith("cytomine")) // Ignore fields starting with "cytomine"
      .map((input) => {
        const { id, name, description, type, optional } = input;
        const defaultValue = input["default-value"];

        switch (type) {
          case "String":
            return (
              <FormGroup key={id} label={name} labelFor={id} helperText={description || ""}>
                <InputGroup
                  id={id}
                  value={state.formData[id] || ""}
                  onChange={(e) => handleInputChange(id, e.target.value)}
                  placeholder={defaultValue || name}
                />
              </FormGroup>
            );
          case "Number":
            return (
              <FormGroup key={id} label={name} labelFor={id} helperText={description || ""}>
                <NumericInput
                  id={id}
                  value={state.formData[id] || defaultValue || 0}
                  onValueChange={(value) => handleInputChange(id, value)}
                  placeholder={optional ? `Optional ${name}` : name}
                />
              </FormGroup>
            );
          case "Boolean":
            return (
              <FormGroup key={id} label={name} labelFor={id} helperText={description || ""}>
                <Switch
                  id={id}
                  checked={state.formData[id] !== undefined ? state.formData[id] : defaultValue || false}
                  onChange={(e) => handleInputChange(id, e.target.checked)}
                  label={name}
                />
              </FormGroup>
            );
          default:
            return null;
        }
      });
  };

  return (
    <form>
      <h2>{workflowMetadata.workflow}</h2>
      {renderFormFields()}
    </form>
  );
};

export default WorkflowForm;
