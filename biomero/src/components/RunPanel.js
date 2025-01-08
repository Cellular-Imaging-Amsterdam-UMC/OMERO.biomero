import React, { useState } from "react";
import { useAppContext } from "../AppContext";
import { Card, Elevation, InputGroup, H5, H6, MultistepDialog, DialogBody, DialogStep, Icon, Spinner } from "@blueprintjs/core";
import { FaDocker } from "react-icons/fa6";
import { IconContext } from "react-icons";
import WorkflowForm from "./WorkflowForm";
import WorkflowOutput from "./WorkflowOutput";
import OmeroDataBrowser from "../OmeroDataBrowser";

const RunPanel = () => {
  const { state, updateState, toaster, runWorkflowData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState(""); // State for search input
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);  // State for selected workflow
  const [dialogOpen, setDialogOpen] = useState(false);  // State for dialog visibility
  const [formData, setFormData] = useState({}); // State to store form data for screen 2

  // Utility to beautify names
  const beautifyName = (name) => {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Filter workflows based on search term
  const filteredWorkflows = state.workflows?.filter((workflow) =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    workflow.description.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Handle workflow click
  const handleWorkflowClick = (workflow) => {
    setSelectedWorkflow(workflow); // Set the selected workflow
    setDialogOpen(true); // Open the dialog
  };

  const handleFinalSubmit = (workflow) => {
    console.log([workflow, formData])

    updateState(
      { workflowStatusTooltipShown: true }
    );
    if (toaster) {
      toaster.show({
        intent: "primary",
        icon: "cloud-upload", 
        message: (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Spinner size={16} intent="warning"/>
          <span>Submitting workflow to the compute gods...</span>
        </div>),
      });
    } else {
      console.warn("Toaster not initialized yet.");
    }

    submitWorkflow(workflow.name)

  }

  const submitWorkflow = (workflow_name) => {
    runWorkflowData(
      workflow_name, 
      formData);
  }

  // Handle form data submission from WorkflowForm
  const handleFormSubmit = (data) => {
    setFormData(data); // Update form data in state when the form is submitted
  };

  const handleStepChange = (stepIndex) => {
    if (stepIndex === 2) {  // When moving to step 3, submit the form
      handleFormSubmit(formData);  // Submit the form data
    }
  };

  
  

  return (
    <div>
      <div className="p-4">
        {/* Search Box */}
        <div className="mb-4">
          <InputGroup
            leftIcon="search"
            placeholder="Search workflows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}  // Update search term on input change
          />
        </div>

        {filteredWorkflows?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.map((workflow) => (
              <Card
                key={workflow.name} // Use the workflow name as the key
                interactive
                elevation={Elevation.TWO}
                className="flex flex-col gap-2 p-4"
                onClick={() => handleWorkflowClick(workflow)} // Pass the full metadata for clicking
              >
                {/* Header Section with Title and Icons */}
                <div className="flex justify-between items-center">
                  <H5 className="mb-0">{beautifyName(workflow.name)}</H5>
                  <div className="flex gap-2">
                    {/* GitHub Icon */}
                    {workflow.githubUrl && (
                      <a
                        href={workflow.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-blue-600"
                        title="View GitHub Repository"
                        onClick={(e) => e.stopPropagation()}  // Stop event propagation
                      >
                        <Icon icon="git-branch" iconSize={16} />
                      </a>
                    )}

                    {/* Container Image Icon */}
                    {workflow.metadata?.["container-image"]?.image && (
                      <a
                        href={`https://hub.docker.com/r/${workflow.metadata["container-image"].image}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-blue-600"
                        title="View Container Image"
                        onClick={(e) => e.stopPropagation()}  // Stop event propagation
                      >
                        <IconContext.Provider value={{ size: 16 }}>
                          <FaDocker className="text-gray-500 hover:text-blue-600"/>
                        </IconContext.Provider>
                      </a>
                    )}
                  </div>
                </div>

                {/* Description Section */}
                <p className="text-sm text-gray-600">{workflow.description}</p>
              </Card>
            ))}
          </div>
        ) : (
          <p>No workflows found.</p>
        )}
      </div>

      {/* BlueprintJS Multistep Dialog for Workflow Details */}
      {selectedWorkflow && (
        <MultistepDialog
          isOpen={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
          }}
          initialStepIndex={1}  // Start on Step 2 (Workflow Form)
          title={beautifyName(selectedWorkflow.name)}
          onChange={handleStepChange}
          finalButtonProps={{
            text: "Run",  // You can customize the button text here
            onClick: () => {
              // Handle the final submit action here
              handleFinalSubmit(selectedWorkflow);  // Perform the final action
              setDialogOpen(false); // Close the dialog
            }
          }}
        >
          <DialogStep
            id="step1"
            title="Input Data"
            panel={
              <DialogBody>
                <H6>Select the input data to proceed (not implemented yet).</H6>
                {state.omeroTreeData && <OmeroDataBrowser />}
              </DialogBody>
            }
          />

          <DialogStep
            id="step2"
            title="Workflow Form"
            panel={
              <DialogBody>
                <H6>{selectedWorkflow.description}</H6>
                {/* Pass handleFormSubmit to WorkflowForm to capture the form data */}
                <WorkflowForm
                  workflowMetadata={selectedWorkflow.metadata}
                  onSubmit={handleFormSubmit}  // Pass form submission handler
                />
              </DialogBody>
            }
          />

          <DialogStep
            id="step3"
            title="Output Data"
            panel={
              <DialogBody>
                <WorkflowOutput
                  formData={formData}
                  updateFormData={setFormData}
                />
              </DialogBody>
            }
          />


        </MultistepDialog>
      )}
    </div>
  );
};

export default RunPanel;
