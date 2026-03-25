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
import PlateWorkflowDialog from "./plate/PlateWorkflowDialog";

const RunPanel = ({ onWorkflowError }) => {
  const { state, updateState, toaster, runWorkflowData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isNextDisabled, setIsNextDisabled] = useState(true);
  const [isRunDisabled, setIsRunDisabled] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState("images"); // "images" or "plates"
  const [customStepIndex, setCustomStepIndex] = useState(0); // Track current step for custom navigation

  // Get workflow versions from SLURM status
  const workflowVersions = state.workflowVersions || {};

  // Helper function to check if a workflow has specific flags from config
  const getWorkflowFlags = (workflowName) => {
    const config = state.config;
    if (!config || !config.UI) return { isPlateWorkflow: false, isZarrWorkflow: false };
    
    const plateWorkflows = config.UI.plate_workflows ? 
      JSON.parse(config.UI.plate_workflows || '[]') : [];
    const isPlateWorkflow = plateWorkflows.includes(workflowName);
    
    const zarrWorkflows = config.UI.zarr_workflows ? 
      JSON.parse(config.UI.zarr_workflows || '[]') : [];
    const isZarrWorkflow = zarrWorkflows.includes(workflowName);
    
    return { isPlateWorkflow, isZarrWorkflow };
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

  // Filter all workflows by search term first (before tab filtering)
  const searchFilteredWorkflows = state.workflows?.filter((workflow) => {
    return workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           workflow.description.toLowerCase().includes(searchTerm.toLowerCase());
  }) || [];

  // Count workflows for each tab after search filtering
  const imageWorkflowCount = searchFilteredWorkflows.filter((workflow) => {
    const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflow.name);
    return !isPlateWorkflow;
  }).length;

  const plateWorkflowCount = searchFilteredWorkflows.filter((workflow) => {
    const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflow.name);
    return isPlateWorkflow;
  }).length;

  // Filter workflows based on active tab from the search results
  const filteredWorkflows = searchFilteredWorkflows.filter((workflow) => {
    if (activeWorkflowTab === "plates") {
      // Check if workflow is marked as plate workflow in config
      const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflow.name);
      return isPlateWorkflow;
    } else {
      // Images tab: exclude workflows marked as plate-only
      const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflow.name);
      return !isPlateWorkflow;
    }
  });

  useEffect(() => {
    setIsNextDisabled(state.formData?.IDs?.length === 0);
  }, [state.formData?.IDs]);

  // Auto-switch to tab with results only when search term changes (not when user manually clicks tab)
  useEffect(() => {
    // Only auto-switch if there's a search term (user is actively filtering)
    if (!searchTerm) return;
    
    const currentTabCount = activeWorkflowTab === "images" ? imageWorkflowCount : plateWorkflowCount;
    const otherTabCount = activeWorkflowTab === "images" ? plateWorkflowCount : imageWorkflowCount;
    
    // Switch to other tab if current tab is empty but other tab has workflows
    if (currentTabCount === 0 && otherTabCount > 0) {
      setActiveWorkflowTab(activeWorkflowTab === "images" ? "plates" : "images");
    }
  }, [searchTerm, imageWorkflowCount, plateWorkflowCount]); // Only trigger on search term or count changes

  // Handle workflow click
  const handleWorkflowClick = (workflow) => {
    // Determine workflow mode based on config flags instead of tab
    const { isPlateWorkflow, isZarrWorkflow } = getWorkflowFlags(workflow.name);
    const workflowMode = isPlateWorkflow ? "plates" : "images";
    
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
  
  // Helper function to determine if Input Options step should be skipped
  const shouldSkipInputOptions = () => {
    if (!state.selectedWorkflow) return false;
    
    const { isPlateWorkflow } = getWorkflowFlags(state.selectedWorkflow.name);
    const selectedCount = state.formData?.IDs?.length || 0;
    
    // Skip if it's a plate workflow (only 1 plate) or only 1 image selected
    return isPlateWorkflow || selectedCount === 1;
  };
  
  // Custom step navigation logic
  const getNextStepIndex = (currentStepIndex) => {
    // Step mapping: 0 = Input Data, 1 = Input Options, 2 = Workflow Parameters, 3 = Output Data
    if (currentStepIndex === 0 && shouldSkipInputOptions()) {
      return 2; // Skip from Input Data directly to Workflow Parameters
    }
    return currentStepIndex + 1;
  };
  
  const getPreviousStepIndex = (currentStepIndex) => {
    if (currentStepIndex === 2 && shouldSkipInputOptions()) {
      return 0; // Skip back from Workflow Parameters directly to Input Data
    }
    return currentStepIndex - 1;
  };  
  
  const handleStepChange = (stepIndex) => {
    setCustomStepIndex(stepIndex);
    if (stepIndex === "step2") {
      // Handle any specific form submission if necessary
    }
  };

  return (
    <div>
      <div className="p-4">
        {/* Unified Workflow Search */}
        <div className="mb-4">
          <InputGroup
            leftIcon="search"
            placeholder="Search workflows (segment, count, etc.)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            rightElement={
              searchTerm && (
                <Button
                  minimal
                  icon="cross"
                  onClick={() => setSearchTerm("")}
                />
              )
            }
          />
        </div>

        {/* Workflow Type Tabs */}
        <div className="mb-4">
          <Tabs
            id="workflow-type-tabs"
            selectedTabId={activeWorkflowTab}
            onChange={(newTabId) => setActiveWorkflowTab(newTabId)}
            large={true}
          >
            <Tab
              id="images"
              title="Image Workflows"
              titleProps={{ className: "text-sm" }}
              tagContent={imageWorkflowCount}
              tagProps={{
                round: true,
                intent: imageWorkflowCount === 0 ? "danger" : undefined
              }}
            />
            <Tab
              id="plates"
              title="Plate Workflows"
              titleProps={{ className: "text-sm" }}
              tagContent={plateWorkflowCount}
              tagProps={{
                round: true,
                intent: plateWorkflowCount === 0 ? "danger" : undefined
              }}
            />
          </Tabs>
          
          {/* Active Tab Description */}
          <div className="mt-2">
            {activeWorkflowTab === "images" && (
              <p className="text-sm text-gray-500">
                For analyzing individual images from datasets or plates
              </p>
            )}
            {activeWorkflowTab === "plates" && (
              <p className="text-sm text-gray-500">
                For analyzing entire plates as single units
              </p>
            )}
          </div>
        </div>

        {filteredWorkflows?.length > 0 ? (
          // Only render grid after SLURM status is determined to prevent height jumping
          state.slurmStatus ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredWorkflows.map((workflow) => {
                const workflowStatus = getWorkflowStatus(workflow.name);
                const isReady = workflowStatus.intent === Intent.NONE;
                
                const cardContent = (
                  <Card
                    key={workflow.name} // Use the workflow name as the key
                    interactive={isReady}
                    elevation={Elevation.TWO}
                    className={`flex flex-col gap-2 p-4 h-full ${
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
            ) : !state.slurmStatus ? (
              // Workflows loaded but SLURM status still checking
              <>
                <Spinner intent="primary" size={SpinnerSize.SMALL} />
                <p className="text-sm text-gray-600 mt-4">Checking workflow availability...</p>
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
        )
        ) : (
          // No workflows found after filtering
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
            ) : !state.slurmStatus ? (
              // Workflows loaded but SLURM status still checking - don't show "no workflows" yet
              <>
                <Spinner intent="primary" size={SpinnerSize.SMALL} />
                <p className="text-sm text-gray-600 mt-4">Checking workflow availability...</p>
              </>
            ) : (
              // SLURM checked and truly no workflows match filters
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

      {/* Conditional Dialog for Workflow Details */}
      {state.selectedWorkflow && (() => {
        const { isPlateWorkflow } = getWorkflowFlags(state.selectedWorkflow.name);
        
        // Use PlateWorkflowDialog for plate workflows
        if (isPlateWorkflow) {
          return (
            <PlateWorkflowDialog
              workflow={state.selectedWorkflow}
              dialogOpen={dialogOpen}
              setDialogOpen={setDialogOpen}
              onWorkflowError={onWorkflowError}
              onFinalSubmit={handleFinalSubmit}
            />
          );
        }
        
        // Use existing MultistepDialog for image workflows
        return (
        <MultistepDialog
          isOpen={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setCustomStepIndex(0); // Reset step index on close
          }}
          initialStepIndex={0}
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

          {/* Conditionally show Input Options step */}
          {!shouldSkipInputOptions() && (
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
          )}

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
        );
      })()}
    </div>
  );
};

export default RunPanel;
