import React, { useState, useEffect } from "react";
import { Tabs, Tab } from "@blueprintjs/core";
import PreviewTab from "./components/PreviewTab";
import AnnotationTab from "./components/AnnotationTab";
import TrainingTab from "./components/TrainingTab";

import { useAppContext } from "../../AppContext";
import GroupSelect from "../../shared/components/GroupSelect";
import SlurmStatusIndicator from "../../shared/components/SlurmStatusIndicator";

const StardistApp = () => {
  const {
    state,
    updateState,
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    loadWorkflows,
    loadBiomeroConfig,
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState("preview");
  const [loadingOmero, setLoadingOmero] = useState(false);
  const [workflowError, setWorkflowError] = useState(false);

  useEffect(() => {
    if (!loadingOmero) {
      setLoadingOmero(true);
      loadOmeroTreeData()
        .then(() => {
          setLoadingOmero(false);
        })
        .catch(() => {
          setLoadingOmero(false);
        });
    }

    loadFolderData();
    loadGroups();
    loadWorkflows();
    loadBiomeroConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (newTabId) => {
    setActiveTab(newTabId);
  };
  
  const handleWorkflowError = () => {
    setWorkflowError(prev => !prev);
  };

  return (
    <div>
        <div className="p-4">
            {state?.user?.groups && (
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                <span className="text-base mr-4">Select group</span>
                <GroupSelect />
                </div>
                <SlurmStatusIndicator 
                  onTabChange={activeTab} 
                  onWorkflowError={workflowError}
                />
            </div>
            )}
        </div>
        
        <div className="p-4 h-full overflow-hidden">
        <Tabs
            id="stardist-tabs"
            className="h-[calc(100vh-200px)]"
            animate={true}
            renderActiveTabPanelOnly={false}
            large={true}
            selectedTabId={activeTab}
            onChange={handleTabChange}
        >
            <Tab
            id="preview"
            title="Preview"
            icon="eye-open"
            panel={<PreviewTab />}
            />
            <Tab
            id="annotation"
            title="Annotation"
            icon="edit"
            panel={<AnnotationTab />}
            />
            <Tab
            id="training"
            title="Training"
            icon="learning"
            panel={<TrainingTab />}
            />
        </Tabs>
        </div>
    </div>
  );
};

export default StardistApp;
