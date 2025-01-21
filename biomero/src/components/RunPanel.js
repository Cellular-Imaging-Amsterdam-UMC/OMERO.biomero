import React, { useState, useEffect  } from "react";
import { useAppContext } from "../AppContext";
import { Card, Elevation, InputGroup, FormGroup, HTMLSelect, MenuItem , H5, H6, MultistepDialog, DialogBody, DialogStep, Icon, Spinner, SpinnerSize } from "@blueprintjs/core";
import { MultiSelect } from "@blueprintjs/select";
import { FaDocker } from "react-icons/fa6";
import { IconContext } from "react-icons";
import WorkflowForm from "./WorkflowForm";
import WorkflowOutput from "./WorkflowOutput";
import WorkflowInput from "./WorkflowInput";

const RunPanel = () => {
  const { state, updateState, toaster, runWorkflowData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState(""); // State for search input
  const [dialogOpen, setDialogOpen] = useState(false); // State for dialog visibility

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
    // Set selected workflow in the global state context
    updateState({
      selectedWorkflow: workflow, // Set selectedWorkflow in context
      formData: {
        IDs: [],  // Empty or default value
        Data_Type: "Image", // Empty or default value
      }
    });
    setDialogOpen(true); // Open the dialog
  };

  const handleFinalSubmit = (workflow) => {
    console.log([workflow, state.formData])

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
  };

  const submitWorkflow = (workflow_name) => {
    runWorkflowData(
      workflow_name, 
      state.formData
    );
  };

  const handleStepChange = (stepIndex) => {
    if (stepIndex === "step2") {
      // Handle any specific form submission if necessary
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
          <Card elevation={Elevation.ONE} className="flex flex-col items-center justify-center p-6 text-center">
            <Spinner intent="primary" size={SpinnerSize.SMALL} />
            <p className="text-sm text-gray-600 mt-4">Loading workflows...</p>
          </Card>
        )}
      </div>

      {/* BlueprintJS Multistep Dialog for Workflow Details */}
      {state.selectedWorkflow && (
        <MultistepDialog
          isOpen={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
          }}
          initialStepIndex={0}  // Start on Step 2 (Workflow Form)
          title={beautifyName(state.selectedWorkflow.name)}
          onChange={handleStepChange}
          navigationPosition={"top"}
          icon="cog"
          className="w-[calc(100vw-20vw)]"
          finalButtonProps={{
            text: "Run",
            onClick: () => {
              // Handle the final submit action here
              handleFinalSubmit(state.selectedWorkflow);  // Perform the final action
              setDialogOpen(false); // Close the dialog
            }
          }}
        >
          <DialogStep
            id="step1"
            title="Input Data"
            panel={
              <WorkflowInput />
            }
          />



          <DialogStep
            id="step2"
            title="Workflow Form"
            panel={
              <DialogBody>
                <H6>{state.selectedWorkflow.description}</H6>
                <WorkflowForm/>
              </DialogBody>
            }
          />

          <DialogStep
            id="step3"
            title="Output Data"
            panel={
              <DialogBody>
                <WorkflowOutput/>
              </DialogBody>
            }
          />
        </MultistepDialog>
      )}
    </div>
  );
};

export default RunPanel;
