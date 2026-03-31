import React, { useState, useEffect } from "react";
import { Tabs, Tab } from "@blueprintjs/core";
import PreviewTab from "./components/PreviewTab";
import TrainingBiomeroTab from "./components/TrainingBiomeroTab";
import ConfigureTab from "./components/ConfigureTab";
import AnnotateTab from "./components/AnnotateTab";

import { useAppContext } from "../../AppContext";
import GroupSelect from "../../shared/components/GroupSelect";
import SlurmStatusIndicator from "../../shared/components/SlurmStatusIndicator";

const AnnotateApp = () => {
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

  // Shared annotate state
  const [config, setConfig] = useState(null);
  const [tableId, setTableId] = useState(null);
  const [units, setUnits] = useState([]);
  const [progress, setProgress] = useState(null);

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

  const handleConfigCreated = (newConfig, newTableId, newUnits, newProgress) => {
    setConfig(newConfig);
    setTableId(newTableId);
    setUnits(newUnits);
    setProgress(newProgress);
    setActiveTab("annotate");
  };

  const handleProgressUpdate = (newProgress) => setProgress(newProgress);
  const handleUnitsUpdate = (newUnits) => setUnits(newUnits);

  return (
    <div>
        <div className="p-4">
            {state?.user?.groups && (
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                <span className="text-base mr-4">Select group</span>
                <GroupSelect />
                </div>
                <div className="flex items-center gap-4">
                  {progress && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Progress:</span>
                      <div className="w-48 bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-green-500 h-4 rounded-full transition-all"
                          style={{ width: `${progress.progress_percent}%` }}
                        />
                      </div>
                      <span>
                        {progress.completed_units}/{progress.total_units} (
                        {progress.progress_percent}%)
                      </span>
                    </div>
                  )}
                  <SlurmStatusIndicator
                    onTabChange={activeTab}
                    onWorkflowError={workflowError}
                  />
                </div>
            </div>
            )}
        </div>

        <div className="p-4 h-full overflow-hidden">
        <Tabs
            id="annotate-app-tabs"
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
            id="configure"
            title="Configure"
            icon="cog"
            panel={
              <ConfigureTab
                onConfigCreated={handleConfigCreated}
                existingConfig={config}
              />
            }
            />
            <Tab
            id="annotate"
            title="Annotate"
            icon="edit"
            disabled={!tableId}
            panel={
              <AnnotateTab
                config={config}
                tableId={tableId}
                units={units}
                progress={progress}
                onProgressUpdate={handleProgressUpdate}
                onUnitsUpdate={handleUnitsUpdate}
                onTableIdUpdate={setTableId}
              />
            }
            />
            <Tab
            id="training"
            title="Training"
            icon="rocket-slant"
            panel={<TrainingBiomeroTab />}
            />
        </Tabs>
        </div>
    </div>
  );
};

export default AnnotateApp;
