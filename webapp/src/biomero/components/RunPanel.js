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
  Tag,
  Tooltip,
  Intent,
  Tabs,
  Tab,
  Icon,
} from "@blueprintjs/core";
import { FaDocker } from "react-icons/fa6";
import WorkflowForm from "./WorkflowForm";
import WorkflowOutput from "./WorkflowOutput";
import WorkflowInput from "./WorkflowInput";
import InputOptions from "./InputOptions";

const RunPanel = ({ onWorkflowError }) => {
  const { state, updateState, toaster, runWorkflowData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isNextDisabled, setIsNextDisabled] = useState(true);
  const [isRunDisabled, setIsRunDisabled] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState("dataset"); // "dataset" or "plate"

  // Get workflow versions from SLURM status
  const workflowVersions = state.workflowVersions || {};

  // Helper function to check if a workflow has specific flags from config
  const getWorkflowFlags = (workflowName) => {
    const config = state.config;
    if (!config || !config.UI) return { isPlateWorkflow: false };
    
    const plateWorkflows = config.UI.plate_workflows ? 
      JSON.parse(config.UI.plate_workflows || '[]') : [];
    const isPlateWorkflow = plateWorkflows.includes(workflowName);
    
    return { isPlateWorkflow };
  };
  
  // Helper to get SLURM status intent for version tags
  const getSlurmIntent = () => {
    if (state.slurmStatus === "online") return Intent.SUCCESS;
    if (state.slurmStatus === "offline" || state.slurmStatus === "error") return Intent.DANGER;
    return Intent.WARNING;
  };

  // Helper to get workflow-specific intent and info
  const getWorkflowStatus = (workflowName) => {
    const isOnline = state.slurmStatus === "online";
    const hasVersions = workflowVersions[workflowName];
    const hasValidVersion = hasVersions && hasVersions.latest_version && hasVersions.latest_version.trim() !== "";
    
    if (!isOnline) {
      return {
        intent: Intent.DANGER,
        icon: "error",
        message: "SLURM cluster offline",
        showTag: true,
        tagText: "Offline"
      };
    }
    
    if (!hasValidVersion) {
      return {
        intent: Intent.WARNING,
        icon: "warning-sign", 
        message: "Workflow not installed on SLURM cluster",
        showTag: true,
        tagText: "Not Available"
      };
    }
    
    return {
      intent: Intent.NONE,
      icon: "tag",
      message: `Available versions: ${hasVersions.available_versions.join(', ')}`,
      showTag: true,
      tagText: hasVersions.latest_version
    };
  };

  // Utility to beautify names
  const beautifyName = (name) => {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Filter workflows based on search term and active tab
  const filteredWorkflows = state.workflows?.filter((workflow) => {
    // First filter by search term
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workflow.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    // Then filter by workflow type based on tab selection
    if (activeWorkflowTab === "plate") {
      // Check if workflow is marked as plate workflow in config
      const { isPlateWorkflow } = getWorkflowFlags(workflow.name);
      return isPlateWorkflow;
    } else {
      // Dataset tab: exclude workflows marked as plate-only
      const { isPlateWorkflow } = getWorkflowFlags(workflow.name);
      return !isPlateWorkflow;
    }
  });

  useEffect(() => {
    setIsNextDisabled(state.formData?.IDs?.length === 0);
  }, [state.formData?.IDs]);

  // Handle workflow click
  const handleWorkflowClick = (workflow) => {
    // Determine workflow mode based on config flags instead of tab
    const { isPlateWorkflow } = getWorkflowFlags(workflow.name);
    const workflowMode = isPlateWorkflow ? "plate" : "dataset";
    
    // Set selected workflow in the global state context
    updateState({
      selectedWorkflow: workflow, // Set selectedWorkflow in context
      formData: {
        IDs: [], // Empty or default value
        Data_Type: "Image", // Backend expects "Image" (case sensitive)
        workflowMode: workflowMode, // Set based on workflow config, not tab
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
    runWorkflowData(workflow_name, state.formData, onWorkflowError);
  };

  const handleStepChange = (stepIndex) => {
    if (stepIndex === "step2") {
      // Handle any specific form submission if necessary
    }
  };

  return (
    <div>
      <div className="p-4">
        {/* Workflow Type Tabs */}
        <div className="mb-4">
          <Tabs
            id="workflow-type-tabs"
            selectedTabId={activeWorkflowTab}
            onChange={(newTabId) => setActiveWorkflowTab(newTabId)}
            large={true}
          >
            <Tab
              id="dataset"
              title="Dataset Workflows"
              titleProps={{ className: "text-sm" }}
            />
            <Tab
              id="plate"
              title="Plate Workflows (Zarr)"
              titleProps={{ className: "text-sm" }}
            />
          </Tabs>
        </div>

        {/* Search Box */}
        <div className="mb-4">
          <InputGroup
            leftIcon="search"
            placeholder={`Search ${activeWorkflowTab === "plate" ? "plate" : "dataset"} workflows...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} // Update search term on input change
          />
        </div>

        {filteredWorkflows?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.map((workflow) => {
              const workflowStatus = getWorkflowStatus(workflow.name);
              const isReady = workflowStatus.intent === Intent.NONE;
              
              const cardContent = (
                <Card
                  key={workflow.name} // Use the workflow name as the key
                  interactive={isReady}
                  elevation={Elevation.TWO}
                  className={`flex flex-col gap-2 p-4 ${
                    workflowStatus.intent === Intent.WARNING ? 'bp4-intent-warning' :
                    workflowStatus.intent === Intent.DANGER ? 'bp4-intent-danger' : ''
                  } ${!isReady ? 'opacity-75 cursor-not-allowed' : ''}`}
                  onClick={isReady ? () => handleWorkflowClick(workflow) : undefined}
                >
                {/* Header Section with Title and Icons */}
                <div className="flex justify-between items-center">
                  <H5 className="mb-0">{beautifyName(workflow.name)}</H5>
                  <div className="flex items-center gap-2">
                    {/* Version Tag */}
                    {workflowStatus.showTag && (
                      <Tooltip
                        content={workflowStatus.message}
                        position="bottom"
                      >
                        <Tag
                          icon={workflowStatus.icon}
                          intent={workflowStatus.intent}
                          minimal
                          round
                        >
                          {workflowStatus.tagText}
                        </Tag>
                      </Tooltip>
                    )}
                    </div>
                    
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
              );
              
              // Wrap entire card in tooltip if not ready
              return isReady ? cardContent : (
                <Tooltip
                  key={workflow.name}
                  content={workflowStatus.message}
                  position="bottom"
                  intent={workflowStatus.intent}
                >
                  {cardContent}
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <Card
            elevation={Elevation.ONE}
            className="flex flex-col items-center justify-center p-6 text-center"
          >
            {!state.workflows ? (
              // Still loading workflows from server
              <>
                <Spinner intent="primary" size={SpinnerSize.SMALL} />
                <p className="text-sm text-gray-600 mt-4">Loading workflows...</p>
              </>
            ) : (
              // Workflows loaded but no results match current filters
              <>
                <Icon icon="search" size={40} color="#718096" />
                <H6 className="mt-4 text-gray-600">No workflows found</H6>
                <p className="text-sm text-gray-500">
                  {searchTerm ? 
                    `No workflows match "${searchTerm}" in the ${activeWorkflowTab} category.` :
                    `No ${activeWorkflowTab} workflows have been configured yet.`
                  }
                </p>
                {searchTerm && (
                  <Button 
                    minimal 
                    intent="primary" 
                    onClick={() => setSearchTerm("")}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
              </>
            )}
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
            id="step1b"
            title="Input Options"
            panel={
              <DialogBody>
                <H6>Advanced Input Options (Optional)</H6>
                <InputOptions />
              </DialogBody>
            }
          />

          <DialogStep
            id="step2"
            title="Workflow Parameters"
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
