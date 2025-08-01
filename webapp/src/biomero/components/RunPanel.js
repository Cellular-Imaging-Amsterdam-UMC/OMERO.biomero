import React, { useState, useEffect } from "react";
import { useAppContext } from "../../AppContext";
import {
  Card,
  Elevation,
  InputGroup,
  Button,
  H5,
  H6,
  MultistepDialog,
  DialogBody,
  DialogStep,
  Spinner,
  SpinnerSize,
  ButtonGroup,
} from "@blueprintjs/core";
import { FaDocker } from "react-icons/fa6";
import WorkflowForm from "./WorkflowForm";
import WorkflowOutput from "./WorkflowOutput";
import WorkflowInput from "./WorkflowInput";

const RunPanel = () => {
  const { state, updateState, toaster, runWorkflowData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isNextDisabled, setIsNextDisabled] = useState(true);
  const [isRunDisabled, setIsRunDisabled] = useState(false);

  // Utility to beautify names
  const beautifyName = (name) => {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Filter workflows based on search term
  const filteredWorkflows = state.workflows?.filter(
    (workflow) =>
      workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workflow.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setIsNextDisabled(state.formData?.IDs?.length === 0);
  }, [state.formData?.IDs]);

  // Handle workflow click
  const handleWorkflowClick = (workflow) => {
    // Set selected workflow in the global state context
    updateState({
      selectedWorkflow: workflow, // Set selectedWorkflow in context
      formData: {
        IDs: [], // Empty or default value
        Data_Type: "Image", // Empty or default value
      },
    });
    setDialogOpen(true); // Open the dialog
  };

  const handleFinalSubmit = (workflow) => {
    updateState({ workflowStatusTooltipShown: true });
    if (toaster) {
      toaster.show({
        intent: "primary",
        icon: "cloud-upload",
        message: (
          <div className="flex items-center gap-2">
            <Spinner size={16} intent="warning" />
            <span>Submitting workflow to the compute gods...</span>
          </div>
        ),
      });
    } else {
      console.warn("Toaster not initialized yet.");
    }

    submitWorkflow(workflow.name);
  };

  const submitWorkflow = (workflow_name) => {
    runWorkflowData(workflow_name, state.formData);
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
            onChange={(e) => setSearchTerm(e.target.value)} // Update search term on input change
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
                  <ButtonGroup>
                    {/* GitHub Icon */}
                    {workflow.githubUrl && (
                      <Button
                        icon="git-branch"
                        minimal
                        intent="primary"
                        title="View GitHub Repository"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            workflow.githubUrl,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      />
                    )}

                    {/* Container Image Icon */}
                    {workflow.metadata?.["container-image"]?.image && (
                      <Button
                        icon={<FaDocker />}
                        minimal
                        intent="primary"
                        title="View Container Image"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://hub.docker.com/r/${workflow.metadata["container-image"].image}`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      />
                    )}
                  </ButtonGroup>
                </div>

                {/* Description Section */}
                <p className="text-sm text-gray-600">{workflow.description}</p>
              </Card>
            ))}
          </div>
        ) : (
          <Card
            elevation={Elevation.ONE}
            className="flex flex-col items-center justify-center p-6 text-center"
          >
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
          initialStepIndex={0} // Start on Step 2 (Workflow Form)
          title={beautifyName(state.selectedWorkflow.name)}
          onChange={handleStepChange}
          navigationPosition={"top"}
          icon="cog"
          className="w-[calc(100vw-20vw)]"
          finalButtonProps={{
            disabled: isRunDisabled,
            text: "Run",
            onClick: () => {
              // Handle the final submit action here
              handleFinalSubmit(state.selectedWorkflow); // Perform the final action
              setDialogOpen(false); // Close the dialog
            },
          }}
        >
          <DialogStep
            id="step1"
            title="Input Data"
            className="min-h-[75vh]"
            panel={
              <WorkflowInput
                onSelectionChange={(selectedImages) => {
                  setIsNextDisabled(selectedImages.length === 0);
                }}
              />
            }
            nextButtonProps={{
              disabled: isNextDisabled,
            }}
          />

          <DialogStep
            id="step2"
            title="Workflow Form"
            panel={
              <DialogBody>
                <H6>{state.selectedWorkflow.description}</H6>
                <WorkflowForm />
              </DialogBody>
            }
          />

          <DialogStep
            id="step3"
            title="Output Data"
            panel={
              <DialogBody>
                <WorkflowOutput
                  onSelectionChange={(selectedOutput) => {
                    setIsRunDisabled(!selectedOutput);
                  }}
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
