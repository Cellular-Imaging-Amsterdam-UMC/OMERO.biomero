import React, { useState, useEffect } from "react";
import { FormGroup, InputGroup, NumericInput, Switch } from "@blueprintjs/core";

const generateForm = (workflowMetadata, onSubmit) => {
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

    // Automatically call onSubmit when form data changes (or on step change)
    useEffect(() => {
        if (onSubmit) {
            onSubmit(formData); // Submit form data automatically
        }
    }, [formData, onSubmit]); // Submit when form data changes

    return (
        <form>
            <h2>{workflowMetadata.workflow}</h2>
            {renderFormFields()}
        </form>
    );
};

const WorkflowForm = ({ workflowMetadata, onSubmit }) => {
    return <div>{generateForm(workflowMetadata, onSubmit)}</div>;
};

export default WorkflowForm;
