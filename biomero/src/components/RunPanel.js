import React, { useState, useEffect } from "react";
import { 
  Card, 
  Elevation, 
  InputGroup, 
  Icon,
  H4, 
  Alignment,
  Button,
  Dialog,
  DialogBody,
  DialogFooter
 } from "@blueprintjs/core";

const RunPanel = ({ state }) => {
  const [searchTerm, setSearchTerm] = useState(""); // State for search input
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);  // State for selected workflow
  const [dialogOpen, setDialogOpen] = useState(false);  // State for dialog visibility

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
                <h5>{workflow.name}</h5>  {/* Show the workflow name */}
                <p>{workflow.description}</p> {/* Show the description */}
              </Card>
            ))}
          </div>
        ) : (
          <p>No workflows found.</p>
        )}
      </div>
      {/* BlueprintJS Dialog for Workflow Details */}
      {selectedWorkflow && (
        <Dialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={selectedWorkflow.name}
        >
          <DialogBody>
            <h5>{selectedWorkflow.name}</h5>
            <p>{selectedWorkflow.description}</p>
            {/* Render other metadata as needed */}
            <pre>{JSON.stringify(selectedWorkflow.metadata, null, 2)}</pre>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => setDialogOpen(false)}
              text="Close"
            />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};

export default RunPanel;
