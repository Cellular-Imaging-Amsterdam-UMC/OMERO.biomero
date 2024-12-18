import React, { useState } from "react";
import { 
  Card, 
  Elevation, 
  InputGroup, 
  Icon,
  H5, 
  H6,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Collapse, 
  Switch,
  MultistepDialog,
  DialogStep
 } from "@blueprintjs/core";
 import WorkflowForm from "./WorkflowForm";

const RunPanel = ({ state }) => {
  const [searchTerm, setSearchTerm] = useState(""); // State for search input
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);  // State for selected workflow
  const [dialogOpen, setDialogOpen] = useState(false);  // State for dialog visibility
  const [metadataVisible, setMetadataVisible] = useState(false);  // State for toggling metadata visibility

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
                onClick={() => handleWorkflowClick(workflow)} // Pass the full metadata for clicking
              >
                <H5>{workflow.name}</H5>  {/* Show the workflow name */}
                <p>{workflow.description}</p> {/* Show the description */}
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
          onClose={() => setDialogOpen(false)}
          initialStepIndex={1}  // Start on Step 2 (Workflow Form)
          title={selectedWorkflow.name}
          onChange={(newStep, prevStep) => console.log(`Step changed from ${prevStep} to ${newStep}`)}
        >
          <DialogStep
            id="step1"
            title="Input Data"
            panel={
              <DialogBody>
                <H6>Select the data to proceed (not implemented yet).</H6>
                {/* Add your "Select Data" content here */}
              </DialogBody>
            }
          />

          <DialogStep
            id="step2"
            title="Workflow Form"
            panel={
              <DialogBody>
                <H6>{selectedWorkflow.description}</H6>
                {/* Render the WorkflowForm component */}
                <WorkflowForm workflowMetadata={selectedWorkflow.metadata} />
              </DialogBody>
            }
          />

          <DialogStep
            id="step3"
            title="Output Data"
            panel={
              <DialogBody>
                <H6>Instructions for how to import data back into OMERO (not implemented yet).</H6>
                {/* Add your "How to Import Data" content here */}
              </DialogBody>
            }
          />

        </MultistepDialog>
      )}
    </div>
  );
};

export default RunPanel;
