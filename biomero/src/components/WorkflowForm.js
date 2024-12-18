import React, { useState } from "react";
import { FormGroup, InputGroup, NumericInput, Switch, Button } from "@blueprintjs/core";

const generateForm = (workflowMetadata) => {
    // Initialize default values based on the inputs
    const defaultValues = workflowMetadata.inputs.reduce((acc, input) => {
        acc[input.id] = input["default-value"] || (input.type === "Boolean" ? false : "");
        return acc;
    }, {});

    const [formData, setFormData] = useState(defaultValues); // Initialize formData with default values

    // Handle change for different input types
    const handleInputChange = (id, value) => {
        setFormData({
            ...formData,
            [id]: value,
        });
    };

    // Dynamically generate form fields
    const renderFormFields = () => {
        return workflowMetadata.inputs
            .filter(input => !input.id.startsWith("cytomine")) // Ignore fields starting with "cytomine"
            .map((input) => {
                const { id, name, description, type, optional } = input;
                const defaultValue = input["default-value"];
                
                // Generate form fields based on type
                switch (type) {
                    case "String":
                        return (
                            <FormGroup
                                key={id}
                                label={name}
                                labelFor={id}
                                helperText={description || ""}
                            >
                                <InputGroup
                                    id={id}
                                    value={formData[id] || ""}
                                    onChange={(e) => handleInputChange(id, e.target.value)}
                                    placeholder={defaultValue || name}
                                />
                            </FormGroup>
                        );
                    case "Number":
                        return (
                            <FormGroup
                                key={id}
                                label={name}
                                labelFor={id}
                                helperText={description || ""}
                            >
                                <NumericInput
                                    id={id}
                                    value={formData[id] || defaultValue || 0}
                                    onValueChange={(value) => handleInputChange(id, value)}
                                    placeholder={optional ? `Optional ${name}` : name}
                                />
                            </FormGroup>
                        );
                    case "Boolean":
                        return (
                            <FormGroup
                                key={id}
                                label={name}
                                labelFor={id}
                                helperText={description || ""}
                            >
                                <Switch
                                    id={id}
                                    checked={formData[id] !== undefined ? formData[id] : defaultValue || false}
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
            <Button
                intent="primary"
                text="Submit"
                onClick={() => console.log(formData)} // Log the form data when submitted
            />
        </form>
    );
};

const WorkflowForm = ({ workflowMetadata }) => {
    return <div>{generateForm(workflowMetadata)}</div>;
};

export default WorkflowForm;
